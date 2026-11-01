/**
 * Marketing email: campaigns to the store's subscribers, and reminders to
 * shoppers who left a checkout unpaid.
 *
 * Campaigns only ever go to people who opted in (newsletter subscribers),
 * narrowed by what they've bought. Sending is done in steps the owner's
 * browser drives (mode "send", repeated): each step reads the next page of
 * subscribers after the campaign's cursor and writes their messages to the
 * outbox (mail.ts sends them through SES), each with its own unsubscribe
 * link, so a campaign can reach any number of people and no request does too
 * much. Messages are designed HTML with a plain-text twin. Links to the site
 * and store are tagged with the campaign (utm_*); an A/B campaign gives half
 * the audience each subject line and tags their links utm_content=a or b, so
 * Insights shows which version brought more visits and sales.
 *
 * Reminders: an owner can remind a shopper by hand, or turn on automatic
 * reminders; checkouts are queued when they start (REMINDDUE#<due>) and
 * the queue is swept after store requests (`sweepReminders`).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { allow, siteAccess } from "./access";
import { config, insist, local } from "./config";
import { db } from "./database";
import {
  audit,
  key,
  list,
  message,
  now,
  partition,
  put,
  read,
  transact,
  type Write,
} from "./commerce-data";
import { digest, text } from "./commerce";
import { deliverMail, mailFrom } from "./mail";
import { release } from "./store-checkout";
import type {
  Campaign,
  CampaignAudience,
  CampaignDesign,
  Customer,
  Discount,
  Order,
  StoreSettings,
  Submission,
} from "../src/commerce/types";

export const AUDIENCES: CampaignAudience[] = [
  "subscribers",
  "customers",
  "prospects",
  "lapsed",
];
const STEP = 60;
const PER_TRANSACTION = 20;
const LAPSED_DAYS = 90;

type Stored = Campaign & { cursor?: string; revision: number };

/** Whether one subscriber belongs to the audience (their customer record, if any). */
function inAudience(who: CampaignAudience, customer: Customer | undefined) {
  if (who === "subscribers") return true;
  const cutoff = new Date(Date.now() - LAPSED_DAYS * 86400_000).toISOString();
  if (who === "customers") return !!customer && customer.orders > 0;
  if (who === "prospects") return !customer || customer.orders === 0;
  return !!customer && customer.orders > 0 && customer.updatedAt < cutoff;
}
const subscribed = (s: Submission) => s.kind === "newsletter" && s.consent;
/** How many subscribers the audience has now (preview and the campaign's total). */
async function audienceSize(siteId: string, who: CampaignAudience) {
  const subscribers = (
    await list<Submission>(siteId, "SUBMISSION", 1_000_000)
  ).filter(subscribed);
  const customers =
    who === "subscribers"
      ? new Map<string, Customer>()
      : new Map(
          (await list<Customer>(siteId, "CUSTOMER", 1_000_000)).map((c) => [
            c.id,
            c,
          ]),
        );
  const chosen = subscribers.filter((s) =>
    inAudience(who, customers.get(s.id)),
  );
  return {
    count: chosen.length,
    sample: chosen.slice(0, 50).map((s) => s.email),
  };
}
/** utm_* on every link into the site or store, so visits and sales are credited. */
export function tagLinks(
  body: string,
  campaign: string,
  hosts: string[],
  variant = "",
) {
  return body.replace(/https?:\/\/[^\s<>"')]+/g, (link) => {
    try {
      const url = new URL(link);
      if (!hosts.includes(url.host) || url.searchParams.has("utm_source"))
        return link;
      url.searchParams.set("utm_source", "newsletter");
      url.searchParams.set("utm_medium", "email");
      url.searchParams.set("utm_campaign", campaign);
      if (variant) url.searchParams.set("utm_content", variant);
      return url.toString();
    } catch {
      return link;
    }
  });
}
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "campaign";
const storeLink = (siteId: string) =>
  `${config.editorOrigin}/store?site=${siteId}`;
/** Hosts whose links get campaign tags: the store, the site's Forma address and its domain. */
const hostsOf = (domainUrl?: string) =>
  [config.editorOrigin, config.siteOrigin, domainUrl]
    .filter((u): u is string => !!u)
    .map((u) => new URL(u).host);
const escape = (v: string) =>
  v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function design(value: unknown): CampaignDesign | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const https = (u: unknown, label: string) => {
    const url = text(u ?? "", label, 2000, true);
    insist(
      !url ||
        /^(?:https:\/\/|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/)[^\s<>"']+$/.test(
          url,
        ),
      422,
      `Use an https address for the ${label}.`,
    );
    return url;
  };
  const accent = text(v.accent ?? "", "colour", 7, true);
  insist(
    !accent || /^#[0-9a-f]{6}$/i.test(accent),
    422,
    "Choose a colour like #1c1c1c.",
  );
  return {
    heading: text(v.heading ?? "", "heading", 120, true),
    image: https(v.image, "image"),
    buttonLabel: text(v.buttonLabel ?? "", "button label", 40, true),
    buttonUrl: https(v.buttonUrl, "button link"),
    accent: accent || "#1c1c1c",
  };
}
async function details(siteId: string, input: Record<string, unknown>) {
  const subject = text(input.subject, "subject", 160);
  const subjectB = text(input.subjectB ?? "", "second subject", 160, true);
  const body = text(input.body, "email body", 8000);
  const who = (input.audience ?? "subscribers") as CampaignAudience;
  insist(AUDIENCES.includes(who), 422, "Choose who receives this campaign.");
  const code = text(
    input.discountCode ?? "",
    "discount code",
    40,
    true,
  ).toUpperCase();
  if (code) {
    const discount = await read<Discount>(siteId, "DISCOUNT", code);
    insist(
      discount?.active,
      422,
      "That discount code doesn’t exist or is turned off.",
    );
  }
  return {
    subject,
    subjectB: subjectB && subjectB !== subject ? subjectB : "",
    body,
    who,
    code,
    design: design(input.design),
    name: slug(text(input.name ?? subject, "campaign name", 80)),
  };
}
type Content = {
  body: string;
  discountCode: string;
  name: string;
  design?: CampaignDesign;
};
/** One subscriber's email: plain text and a designed HTML version. */
export function compose(
  siteId: string,
  storeName: string,
  c: Content,
  hosts: string[],
  unsubscribe: string,
  variant = "",
) {
  const link = (u: string) => tagLinks(u, c.name, hosts, variant);
  const d = c.design;
  const accent = d?.accent ?? "#1c1c1c";
  const offer = c.discountCode
    ? `\n\nUse code ${c.discountCode} at checkout: ${storeLink(siteId)}`
    : "";
  const button =
    d?.buttonLabel && d.buttonUrl ? `\n\n${d.buttonLabel}: ${d.buttonUrl}` : "";
  const plain = `${d?.heading ? `${d.heading}\n\n` : ""}${link(c.body + button + offer)}\n\n—\nYou’re getting this because you subscribed to ${storeName}. Unsubscribe: ${unsubscribe}`;
  const paragraphs = link(c.body)
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px">${escape(p)
          .replace(/\n/g, "<br>")
          .replace(
            /https?:\/\/[^\s<]+/g,
            (u) =>
              `<a href="${u}" style="color:${accent}">${u.replace(/[?#].*$/, "")}</a>`,
          )}</p>`,
    )
    .join("");
  const html =
    `<!doctype html><html><body style="margin:0;background:#f4f4f2;font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c1c">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">` +
    `<tr><td style="padding:22px 28px;border-bottom:3px solid ${accent};font-weight:700;font-size:18px">${escape(storeName)}</td></tr>` +
    (d?.image
      ? `<tr><td><img src="${escape(d.image)}" alt="" width="560" style="display:block;width:100%;height:auto"></td></tr>`
      : "") +
    `<tr><td style="padding:28px">` +
    (d?.heading
      ? `<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">${escape(d.heading)}</h1>`
      : "") +
    paragraphs +
    (d?.buttonLabel && d.buttonUrl
      ? `<p style="margin:24px 0"><a href="${escape(link(d.buttonUrl))}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:${accent};color:#ffffff;font-weight:600;text-decoration:none">${escape(d.buttonLabel)}</a></p>`
      : "") +
    (c.discountCode
      ? `<p style="margin:24px 0;padding:16px;border:2px dashed ${accent};border-radius:10px;text-align:center">Use code <strong style="font-size:18px;letter-spacing:1px">${escape(c.discountCode)}</strong> at checkout<br><a href="${escape(link(storeLink(siteId)))}" style="color:${accent}">Shop now</a></p>`
      : "") +
    `</td></tr><tr><td style="padding:18px 28px;background:#fafaf8;color:#6b6b6b;font-size:12px">You’re getting this because you subscribed to ${escape(storeName)}. <a href="${escape(unsubscribe)}" style="color:#6b6b6b">Unsubscribe</a></td></tr>` +
    `</table></td></tr></table></body></html>`;
  return { text: plain, html };
}
/** Half the audience (by address, so the split is stable) gets the second subject. */
export const variantOf = (email: string) =>
  parseInt(digest(email).slice(0, 2), 16) % 2 ? "b" : "a";
const publicCampaign = ({ cursor: _c, ...c }: Stored): Campaign => {
  void _c;
  return c;
};

/** The next page of subscribers in the audience after `cursor`. */
async function nextRecipients(
  siteId: string,
  who: CampaignAudience,
  cursor?: string,
) {
  const out: string[] = [];
  let last = cursor;
  let finished = false;
  while (out.length < STEP && !finished) {
    const page = await db.send(
      new QueryCommand({
        TableName: config.table,
        KeyConditionExpression: last
          ? "pk = :pk AND sk BETWEEN :after AND :end"
          : "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: last
          ? {
              ":pk": partition(siteId),
              ":after": `${last}\u0000`,
              ":end": "SUBMISSION#￿",
            }
          : { ":pk": partition(siteId), ":prefix": "SUBMISSION#" },
        Limit: STEP - out.length,
      }),
    );
    for (const row of (page.Items ?? []) as (Submission & { sk: string })[]) {
      last = row.sk;
      if (!subscribed(row)) continue;
      const customer =
        who === "subscribers"
          ? undefined
          : await read<Customer>(siteId, "CUSTOMER", row.id);
      if (inAudience(who, customer)) out.push(row.email.toLowerCase());
    }
    finished = !page.LastEvaluatedKey;
  }
  return { emails: out, cursor: last, finished };
}

/** POST /sites/{id}/commerce/campaigns: preview, test, send (in steps) or list. */
export async function campaigns(
  actor: string,
  actorEmail: string | undefined,
  siteId: string,
  input: Record<string, unknown>,
) {
  const access = await siteAccess(actor, siteId);
  allow(access, "manage");
  const hosts = hostsOf(access.site.domainUrl);
  const storeName =
    (await read<StoreSettings>(siteId, "SETTINGS"))?.name || access.site.name;
  const mode = input.mode ?? "preview";
  if (mode === "list")
    return {
      campaigns: (await list<Stored>(siteId, "CAMPAIGN"))
        .map(publicCampaign)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  if (mode === "preview") {
    const d = await details(siteId, input);
    const { count, sample } = await audienceSize(siteId, d.who);
    const email = compose(
      siteId,
      storeName,
      { body: d.body, discountCode: d.code, name: d.name, design: d.design },
      hosts,
      `${storeLink(siteId)}&unsubscribe=…`,
      d.subjectB ? "a" : "",
    );
    return {
      subject: d.subject,
      subjectB: d.subjectB,
      body: email.text,
      html: email.html,
      recipients: sample,
      count,
      delivery: mailFrom() ? "email" : "preview-only",
    };
  }
  if (mode === "test") {
    const d = await details(siteId, input);
    insist(
      actorEmail,
      422,
      "Your account has no email address to send a test to.",
    );
    const versions: [string, string][] = d.subjectB
      ? [
          ["a", d.subject],
          ["b", d.subjectB],
        ]
      : [["", d.subject]];
    await transact(
      versions.map(([variant, subject]) => {
        const email = compose(
          siteId,
          storeName,
          {
            body: d.body,
            discountCode: d.code,
            name: d.name,
            design: d.design,
          },
          hosts,
          "(your subscribers get their own link here)",
          variant,
        );
        return message(
          siteId,
          actorEmail,
          `[Test${variant ? ` ${variant.toUpperCase()}` : ""}] ${subject}`,
          email.text,
          email.html,
        );
      }),
    );
    await deliverMail(siteId);
    return {
      sentTo: actorEmail,
      delivery: mailFrom() ? "email" : "preview-only",
    };
  }
  insist(mode === "send", 422, "Choose preview, test or send.");
  let campaign: Stored | undefined;
  if (input.id) {
    campaign = await read<Stored>(
      siteId,
      "CAMPAIGN",
      text(input.id, "campaign", 60),
    );
    insist(campaign, 404, "Campaign not found.");
    if (campaign.status === "sent")
      return { campaign: publicCampaign(campaign), done: true };
  } else {
    const d = await details(siteId, input);
    const { count } = await audienceSize(siteId, d.who);
    insist(count, 422, "Nobody in this audience has subscribed yet.");
    campaign = {
      id: `${Date.now()}-${randomUUID()}`,
      name: d.name,
      subject: d.subject,
      ...(d.subjectB ? { subjectB: d.subjectB, sentA: 0, sentB: 0 } : {}),
      body: d.body,
      audience: d.who,
      discountCode: d.code,
      ...(d.design ? { design: d.design } : {}),
      status: "sending",
      total: count,
      queued: 0,
      createdAt: now(),
      updatedAt: now(),
      revision: 1,
    };
    await transact([
      put(siteId, "CAMPAIGN", campaign.id, campaign),
      audit(siteId, actor, "campaign.sent", campaign.name),
    ]);
  }
  // The next page of subscribers: each gets the message and their own way out.
  const batch = await nextRecipients(
    siteId,
    campaign.audience,
    campaign.cursor,
  );
  let sentA = campaign.sentA ?? 0,
    sentB = campaign.sentB ?? 0;
  for (let i = 0; i < batch.emails.length; i += PER_TRANSACTION) {
    const writes: Write[] = [];
    for (const email of batch.emails.slice(i, i + PER_TRANSACTION)) {
      const token = randomBytes(32).toString("hex");
      const variant = campaign.subjectB ? variantOf(email) : "";
      if (variant === "a") sentA++;
      if (variant === "b") sentB++;
      const content = compose(
        siteId,
        storeName,
        campaign,
        hosts,
        `${storeLink(siteId)}&unsubscribe=${token}`,
        variant,
      );
      writes.push(
        put(siteId, "UNSUBSCRIBE", digest(token), {
          submissionId: digest(email),
        }),
      );
      writes.push(
        message(
          siteId,
          email,
          variant === "b" ? campaign.subjectB! : campaign.subject,
          content.text,
          content.html,
        ),
      );
    }
    await transact(writes);
  }
  const queued = campaign.queued + batch.emails.length;
  const done = batch.finished;
  const next: Stored = {
    ...campaign,
    queued,
    // People may subscribe while it sends; the total ends as what was sent.
    total: done ? queued : Math.max(campaign.total, queued),
    ...(campaign.subjectB ? { sentA, sentB } : {}),
    cursor: batch.cursor,
    status: done ? "sent" : "sending",
    ...(done && { sentAt: now() }),
    updatedAt: now(),
    revision: campaign.revision + 1,
  };
  await transact([
    put(siteId, "CAMPAIGN", campaign.id, next, campaign.revision),
  ]);
  // Send what's waiting now; mail.ts sends the rest after later requests.
  for (let i = 0; i < 6; i++) await deliverMail(siteId);
  return { campaign: publicCampaign(next), done };
}

/** The reminder email for a checkout that ran out unpaid. */
export async function remindCheckout(
  siteId: string,
  order: Order,
  input: Record<string, unknown>,
) {
  insist(
    order.status === "cancelled" ||
      (order.status === "pending" && order.expired),
    409,
    "Only checkouts that ran out without payment can be reminded.",
  );
  insist(!order.remindedAt, 409, "This shopper was already reminded.");
  const code = text(
    input.discountCode ?? "",
    "discount code",
    40,
    true,
  ).toUpperCase();
  if (code) {
    const discount = await read<Discount>(siteId, "DISCOUNT", code);
    insist(
      discount?.active,
      422,
      "That discount code doesn’t exist or is turned off.",
    );
  }
  const items = order.lines
    .map((l) => `• ${l.title}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`)
    .join("\n");
  const link = `${storeLink(siteId)}&utm_source=reminder&utm_medium=email&utm_campaign=abandoned-checkout`;
  return message(
    siteId,
    order.email,
    "You left something behind",
    `Hi ${order.address.name || "there"},\n\nYou were about to order:\n${items}\n\nIt’s still here when you’re ready: ${link}${code ? `\n\nUse code ${code} at checkout for a little extra.` : ""}`,
  );
}
/** Queues a new checkout for an automatic reminder (sent only if the owner turned them on). */
export function reminderDue(
  siteId: string,
  orderId: string,
  holdUntil: string,
) {
  return put(siteId, "REMINDDUE", `${holdUntil}#${orderId}`, {
    orderId,
    expires: Math.floor(Date.parse(holdUntil) / 1000) + 4 * 86400,
  });
}
const swept = new Map<string, number>();
/**
 * Sends the automatic reminders that are due (after store requests, at most
 * once a minute a store). Never throws: shopping mustn't wait on it.
 */
export async function sweepReminders(siteId: string, force = false) {
  // On this computer every request sweeps, so changes show at once.
  if (!local && !force && Date.now() - (swept.get(siteId) ?? 0) < 60_000)
    return;
  swept.set(siteId, Date.now());
  try {
    const auto = (await read<StoreSettings>(siteId, "SETTINGS"))?.autoRemind;
    if (!auto?.enabled) return;
    const cutoff = new Date(Date.now() - auto.hours * 3600_000).toISOString();
    const due = await db.send(
      new QueryCommand({
        TableName: config.table,
        KeyConditionExpression: "pk = :pk AND sk BETWEEN :from AND :to",
        ExpressionAttributeValues: {
          ":pk": partition(siteId),
          ":from": "REMINDDUE#",
          ":to": `REMINDDUE#${cutoff}~`,
        },
        Limit: 10,
      }),
    );
    for (const row of (due.Items ?? []) as { sk: string; orderId: string }[]) {
      const done: Write = {
        Delete: {
          TableName: config.table,
          Key: key(siteId, "REMINDDUE", row.sk.slice("REMINDDUE#".length)),
        },
      };
      let order = await read<Order & { held?: boolean }>(
        siteId,
        "ORDER",
        row.orderId,
      );
      // A hold that ran out without anyone closing it: close it now.
      if (order?.status === "pending" && order.held)
        order =
          (await release(siteId, order.id).catch(() => undefined)) ?? order;
      const eligible =
        !!order &&
        !order.remindedAt &&
        (order.status === "cancelled" ||
          (order.status === "pending" && !!order.expired));
      if (!order || !eligible) {
        // Paid or reminded: nothing to do. Still open: try again later.
        if (order?.status !== "pending" || order.remindedAt)
          await transact([done]).catch(() => undefined);
        continue;
      }
      const current = order;
      const reminder = await remindCheckout(siteId, current, {
        discountCode: auto.discountCode,
      }).catch(() => remindCheckout(siteId, current, {}));
      await transact([
        put(
          siteId,
          "ORDER",
          current.id,
          {
            ...current,
            remindedAt: now(),
            revision: current.revision + 1,
            updatedAt: now(),
          },
          current.revision,
        ),
        audit(siteId, "automatic", "checkout.reminded", current.id),
        reminder,
        done,
      ]).catch((error) =>
        console.error("remind_failed", siteId, String(error).slice(0, 200)),
      );
    }
  } catch (error) {
    console.error("remind_sweep_failed", siteId, String(error).slice(0, 200));
  }
}
