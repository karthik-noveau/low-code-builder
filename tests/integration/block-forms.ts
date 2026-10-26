/**
 * Forms built from blocks (src/blocks/forms) work end to end: prebuilt form
 * sections get their tables and forms, the published page carries the
 * widget's contract, and visitors send and look up through the same public
 * API the classic App form uses. Run from apps.test.ts, which owns the
 * account (the local sign-up limiter allows a few accounts a minute).
 */
import { expect } from "vitest";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { createProject, createSection } from "../../src/studio/templates";
import { presetById } from "../../src/blocks/presets";
import { syncForms } from "../../src/blocks/forms/sync";
import { REF_KEY, type AppForm } from "../../src/apps/model";
import { validateProject, type Project } from "../../src/studio/model";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
const sites = process.env.TEST_SITE_URL || "http://127.0.0.1:8788";
type Call = (
  path: string,
  method?: string,
  body?: unknown,
  auth?: string,
) => Promise<{ response: Response; data: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
let token = "";
let call: Call;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function publish(project: Project) {
  const created = await call("/sites", "POST", { name: project.name });
  expect(created.response.status, JSON.stringify(created.data)).toBe(201);
  const id = created.data.site.id as string;
  const saved = await fetch(`${base}/sites/${id}/draft`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/gzip",
      "if-match": String(created.data.site.version),
    },
    body: gzipSync(JSON.stringify(project)),
  });
  expect(saved.status).toBe(200);
  const version = (await saved.json()).site.version;
  for (let i = 0; i < 40; i++) {
    const { response } = await call(`/sites/${id}/publish`, "POST", {
      version,
    });
    if (response.status !== 429) break;
    await sleep(300);
  }
  for (let i = 0; i < 150; i++) {
    const { data } = await call(`/sites/${id}`);
    if (!["queued", "publishing"].includes(data.site.status)) {
      expect(data.site.status).toBe("published");
      return id;
    }
    await sleep(200);
  }
  throw new Error("Publishing didn't finish.");
}

/** A blank site whose home page holds the booking, contact and tracking form sections. */
function formsSite() {
  const before = createProject("blank", "Forms test");
  const after = structuredClone(before);
  after.pages[0].sections = ["form-booking", "form-contact", "form-track"].map(
    (id) =>
      createSection("blocks", {
        name: id,
        root: presetById(id)!.build({ project: after }),
      }),
  );
  const project = syncForms(before, after);
  expect(validateProject(project)).toBe(true);
  return project;
}

/** Publishes a site of block-built forms, then sends and looks up through it. */
export async function checkBlockForms(owner: string, api: Call) {
  token = owner;
  call = api;
  {
    const project = formsSite();
    const app = project.app!;
    const byName = (name: string) =>
      app.forms.find((f) => f.name === name) as AppForm;
    const booking = byName("Booking form");
    const contact = byName("Contact form");
    const track = byName("Track your order");
    // Track finds orders or bookings: the booking table is there, so it looks there.
    expect(track.table).toBe(booking.table);
    expect(track.key).toBe(REF_KEY);
    expect(booking.fields).toEqual([
      "name",
      "phone",
      "service",
      "date",
      "time",
      "people",
      "notes",
    ]);

    const id = await publish(project);
    const html = await (await fetch(`${sites}/sites/${id}/index.html`)).text();
    expect(html).toContain('<script src="app.js" defer></script>');
    for (const form of [booking, contact, track]) {
      expect(html).toContain(`data-form="${form.id}"`);
    }
    expect(html).toContain(`data-app-api="${base}/apps/${id}"`);
    expect(html.match(/data-blocks-form=""/g)).toHaveLength(3);
    expect(html).toMatch(
      /data-steps="\[&quot;page-0&quot;,&quot;page-1&quot;\]"/,
    );
    expect(html.match(/data-page="\d"/g)).toHaveLength(2);
    expect(html).toContain('name="website"');
    // The page's stylesheet carries the form styles.
    const css = await (
      await fetch(`${sites}${html.match(/href="([^"]*styles\.css)"/)![1]}`)
    ).text();
    expect(css).toContain(".blk-form .blk-form-flow");
    const script = await (await fetch(`${sites}/sites/${id}/app.js`)).text();
    expect(script).toContain("data-blocks-form");

    // A visitor books, as the widget sends it.
    const visitor = (path: string, body?: unknown) =>
      call(`/apps/${id}${path}`, body ? "POST" : "GET", body, "");
    const sent = await visitor(`/forms/${booking.id}`, {
      key: randomUUID(),
      website: "",
      values: {
        name: "Meera Iyer",
        phone: "98450 11223",
        service: "Consultation",
        date: "2026-12-10",
        time: "Morning",
        people: "2",
        notes: "",
      },
    });
    expect(sent.response.status, JSON.stringify(sent.data)).toBe(201);
    expect(sent.data.ref).toMatch(/^BK-\d+$/);
    expect(sent.data.message).toContain(sent.data.ref);
    // Required fields are checked by the server too.
    const missing = await visitor(`/forms/${booking.id}`, {
      key: randomUUID(),
      website: "",
      values: { name: "No phone" },
    });
    expect(missing.response.status).toBe(422);
    expect(missing.data.field).toBe("phone");

    // The contact form sends without a reference.
    const message = await visitor(`/forms/${contact.id}`, {
      key: randomUUID(),
      website: "",
      values: {
        name: "Asha",
        email: "asha@example.com",
        phone: "",
        message: "Hello!",
      },
    });
    expect(message.response.status, JSON.stringify(message.data)).toBe(201);

    // And looks the booking up by its reference and phone.
    const found = await visitor(
      `/forms/${track.id}/find?value=${encodeURIComponent(sent.data.ref)}&verify=${encodeURIComponent("9845011223")}`,
    );
    expect(found.response.status, JSON.stringify(found.data)).toBe(200);
    expect(found.data.ref).toBe(sent.data.ref);
    expect(JSON.stringify(found.data.fields)).toContain("Consultation");
    const wrong = await visitor(
      `/forms/${track.id}/find?value=${encodeURIComponent(sent.data.ref)}&verify=9000000000`,
    );
    expect(wrong.response.status).toBe(404);

    // The owner sees both records in their app.
    const records = await call(
      `/sites/${id}/app/records?table=${booking.table}`,
    );
    expect(records.data.records.map((r: { ref: string }) => r.ref)).toContain(
      sent.data.ref,
    );
  }
}
