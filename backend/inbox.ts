import { randomUUID } from "node:crypto";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { config as settings, HttpError, idPattern, insist } from "./config";
import { event, key, now, put, read, transact } from "./commerce-data";
import { db, getItem, putItem } from "./database";
import { readObject, writeObject } from "./objects";
import {
  checkoutPaid,
  createCheckout,
  currencyCode,
  getConnection,
} from "./payments";
import type { ApiRequest, ApiResponse } from "./api";
import type { Site } from "./types";
import { itemTitle, publishedItems } from "../src/studio/collections";
import type { Project } from "../src/studio/model";
import {
  parseRequest,
  REQUEST_KINDS,
  type InboxRequest,
  type RequestKind,
} from "../src/studio/requests";
import {
  canCollect,
  formatAmount,
  parseAmount,
  paymentReference,
  requestAmount,
  upiLink,
  usablePayments,
  type PaymentSettings,
} from "../src/studio/payments";

/**
 * What one release's forms accept, written at publish so visitors can't post
 * to items that aren't live. Kept in object storage (it grows with the
 * catalog); the database only points at the live release's copy.
 */
export interface InboxConfig {
  collections: {
    id: string;
    name: string;
    kind: RequestKind;
    /** Ask visitors to pay after sending (only with usable payment options). */
    collect?: boolean;
    currency?: string;
    /** Item slug → title and unit price in minor units. Slugs are [a-z0-9-], so no prototype keys. */
    items: Record<string, { title: string; price: number | null } | string>;
  }[];
  /** How visitors pay; only methods that are correctly filled in. */
  payments?: PaymentSettings | null;
  site?: { name: string; accent: string };
}
/** Requests a site accepts per UTC day; bounds storage and inbox size under spam. */
export const DAILY_REQUESTS = 200;
const LIST_LIMIT = 500;
export function inboxConfig(project: Project): InboxConfig {
  const collections: InboxConfig["collections"] = [];
  const payments = usablePayments(project.payments);
  for (const { collection, item } of publishedItems(project.collections)) {
    if (!collection.request) continue;
    let entry = collections.find((c) => c.id === collection.id);
    if (!entry) {
      entry = {
        id: collection.id,
        name: collection.name.slice(0, 120),
        kind: collection.request.kind,
        // Whether there's a way to pay is decided per request: online payments
        // are connected outside the project.
        collect:
          !!collection.request.collect && canCollect(collection.request.kind),
        currency: collection.currency,
        items: {},
      };
      collections.push(entry);
    }
    entry.items[item.slug] = {
      title: itemTitle(collection, item).slice(0, 120),
      price: collection.display.price
        ? parseAmount(item.values[collection.display.price])
        : null,
    };
  }
  return {
    collections,
    payments,
    site: { name: project.name.slice(0, 120), accent: project.theme.accent },
  };
}
const objectKey = (siteId: string, releaseId: string) =>
  `inbox/${siteId}/${releaseId}.json`;
export async function writeInboxConfig(
  siteId: string,
  releaseId: string,
  value: InboxConfig,
) {
  await writeObject(
    "drafts",
    objectKey(siteId, releaseId),
    Buffer.from(JSON.stringify(value)),
    "application/json",
  );
}
/** Points the public endpoint at a release's config; no release closes every form. */
export async function activateInbox(
  owner: string,
  siteId: string,
  releaseId?: string,
) {
  await putItem({
    ...key(siteId, "INBOXCFG"),
    owner,
    releaseId: releaseId ?? "",
  });
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const page = (status: number, title: string, body: string): ApiResponse => ({
  status,
  headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
  },
  body: Buffer.from(
    `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#1c1c1c}</style></head><body><h1>${escape(title)}</h1><p>${escape(body)}</p></body></html>`,
  ),
});
function fields(request: ApiRequest): Record<string, unknown> {
  insist(request.body.length <= 16 * 1024, 413, "That request is too large.");
  const type = request.headers["content-type"] || "";
  const text = request.body.toString();
  if (type.startsWith("application/x-www-form-urlencoded"))
    return Object.fromEntries(new URLSearchParams(text));
  try {
    const value: unknown = JSON.parse(text || "{}");
    insist(
      value && typeof value === "object" && !Array.isArray(value),
      400,
      "Expected a JSON object.",
    );
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON.");
  }
}
async function liveConfig(siteId: string) {
  const pointer = await read<{ owner: string; releaseId: string }>(
    siteId,
    "INBOXCFG",
  );
  if (!pointer?.releaseId) return undefined;
  try {
    const value = JSON.parse(
      (
        await readObject("drafts", objectKey(siteId, pointer.releaseId))
      ).toString(),
    ) as InboxConfig;
    return { owner: pointer.owner, value };
  } catch {
    // Releases published before visitor actions existed have no config.
    return undefined;
  }
}
/** The site's current address, so a domain change never strands visitors on an old host. */
async function siteUrl(owner: string, siteId: string) {
  const site = await getItem<Site>(`USER#${owner}`, `SITE#${siteId}`);
  return site?.domainUrl || `${settings.siteOrigin}/sites/${siteId}/`;
}
export async function receiveRequest(
  siteId: string,
  input: Record<string, unknown>,
) {
  insist(idPattern.test(siteId), 404, "This website isn’t accepting requests.");
  // Bots fill every field; people never see this one.
  insist(!input.website, 422, "Your request could not be sent.");
  const live = await liveConfig(siteId);
  insist(live, 404, "This website isn’t accepting requests.");
  const collection = live.value.collections.find(
    (c) => c.id === input.collection,
  );
  const entry =
    collection &&
    typeof input.item === "string" &&
    Object.hasOwn(collection.items, input.item)
      ? collection.items[input.item]
      : undefined;
  insist(collection && entry, 404, "This item no longer accepts requests.");
  // Configs written before payments stored just the title.
  const { title, price } =
    typeof entry === "string" ? { title: entry, price: null } : entry;
  const parsed = parseRequest(collection.kind, input);
  insist(parsed.ok, 422, parsed.ok ? "" : parsed.error);
  const createdAt = now();
  const id = `${Date.now()}-${randomUUID()}`;
  const item: InboxRequest = {
    id,
    kind: collection.kind,
    collection: collection.id,
    collectionName: collection.name,
    item: input.item as string,
    itemTitle: title,
    name: parsed.name,
    email: parsed.email,
    fields: parsed.fields,
    status: "new",
    createdAt,
  };
  if (
    collection.collect &&
    (live.value.payments || (await getConnection(siteId)))
  )
    item.payment = {
      amount: requestAmount(collection.kind, price, parsed.fields),
      currency: (collection.currency ?? "").slice(0, 8),
      reference: paymentReference(id),
      status: "unpaid",
    };
  try {
    await transact([
      put(siteId, "REQUEST", item.id, { ...item, revision: 1 }),
      event(siteId, "request.received"),
      {
        Update: {
          TableName: settings.table,
          Key: key(siteId, "INBOXDAY", createdAt.slice(0, 10)),
          UpdateExpression: "ADD #count :one",
          ConditionExpression: "attribute_not_exists(#count) OR #count < :max",
          ExpressionAttributeNames: { "#count": "count" },
          ExpressionAttributeValues: { ":one": 1, ":max": DAILY_REQUESTS },
        },
      },
    ]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 409)
      throw new HttpError(
        429,
        "This website has received too many requests today. Please try again tomorrow.",
      );
    throw error;
  }
  return { item, siteUrl: await siteUrl(live.owner, siteId) };
}
/** Where a visitor is sent to pay. The request id is the capability; the page shows no personal details. */
export const paymentPageUrl = (siteId: string, requestId: string) =>
  `${settings.apiOrigin}/inbox/${siteId}/requests/${requestId}`;
const requestIdPattern = /^\d{13}-[a-f0-9-]{36}$/;
const safeAccent = (value?: string) =>
  value && /^#[\da-f]{6}$/i.test(value) ? value : "#1c1c1c";
type StoredRequest = InboxRequest & { revision: number };
/** Marks a request paid when its provider checkout was paid in full. */
async function confirmWithProvider(
  siteId: string,
  request: StoredRequest,
): Promise<StoredRequest> {
  const payment = request.payment;
  if (
    !payment?.checkout ||
    payment.status === "paid" ||
    payment.amount === null ||
    !(await checkoutPaid(siteId, payment.checkout, payment.amount))
  )
    return request;
  const next: StoredRequest = {
    ...request,
    payment: {
      ...payment,
      status: "paid",
      confirmedBy: "provider",
      paidAt: now(),
    },
    revision: request.revision + 1,
  };
  try {
    await transact([
      put(siteId, "REQUEST", request.id, next, request.revision),
      event(siteId, "request.paid"),
    ]);
    return next;
  } catch (error) {
    // Someone else updated it at the same time; the stored copy wins.
    if (error instanceof HttpError && error.status === 409)
      return (await read<StoredRequest>(siteId, "REQUEST", request.id))!;
    throw error;
  }
}
/** Sends the visitor to a checkout for the exact total, reusing an open one. */
async function startCheckout(siteId: string, requestId: string) {
  insist(
    idPattern.test(siteId) && requestIdPattern.test(requestId),
    404,
    "This payment page doesn’t exist.",
  );
  const request = await read<StoredRequest>(siteId, "REQUEST", requestId);
  const payment = request?.payment;
  insist(payment, 404, "This payment page doesn’t exist.");
  const back = paymentPageUrl(siteId, requestId);
  const redirect = (location: string): ApiResponse => ({
    status: 303,
    headers: {
      location,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
    body: Buffer.alloc(0),
  });
  if (payment.status === "paid" || payment.amount === null)
    return redirect(back);
  const fresh =
    payment.checkout &&
    Date.now() - Date.parse(payment.checkout.createdAt) < 20 * 3600 * 1000;
  if (fresh && payment.checkout) return redirect(payment.checkout.url);
  const checkout = await createCheckout(siteId, {
    requestId,
    reference: payment.reference,
    amount: payment.amount,
    currency: payment.currency,
    description: `${request.itemTitle} · ${payment.reference}`.slice(0, 200),
    name: request.name,
    email: request.email,
    returnUrl: back,
  });
  insist(
    checkout,
    409,
    "Online payment isn’t available for this request. Use another option on the previous page.",
  );
  await transact([
    put(
      siteId,
      "REQUEST",
      requestId,
      {
        ...request,
        payment: { ...payment, checkout },
        revision: request.revision + 1,
      },
      request.revision,
    ),
  ]);
  return redirect(checkout.url);
}
async function paymentPage(siteId: string, requestId: string) {
  insist(
    idPattern.test(siteId) && requestIdPattern.test(requestId),
    404,
    "This payment page doesn’t exist.",
  );
  let request = await read<InboxRequest & { revision: number }>(
    siteId,
    "REQUEST",
    requestId,
  );
  insist(request?.payment, 404, "This payment page doesn’t exist.");
  // Coming back from checkout: ask the provider rather than trusting the URL.
  request = await confirmWithProvider(siteId, request).catch(() => request!);
  const live = await liveConfig(siteId);
  const payments = live?.value.payments;
  const name = live?.value.site?.name || "the website";
  const accent = safeAccent(live?.value.site?.accent);
  const back = await siteUrl(live?.owner ?? "", siteId).catch(() => "");
  const { amount, currency, reference, status, confirmedBy } = request.payment!;
  const connection =
    status === "unpaid" && amount !== null && currencyCode(currency)
      ? await getConnection(siteId)
      : null;
  const total = amount === null ? "" : formatAmount(amount, currency);
  const noun = REQUEST_KINDS[request.kind].noun.toLowerCase();
  const blocks: string[] = [];
  if (status === "paid")
    blocks.push(
      confirmedBy === "provider"
        ? `<p class="done">Your payment was received and ${escape(name)} has been notified. Thank you.</p>`
        : `<p class="done">${escape(name)} has marked this ${escape(noun)} as paid. Thank you.</p>`,
    );
  else if (!payments && !connection)
    blocks.push(`<p>${escape(name)} will contact you about payment.</p>`);
  if (status === "unpaid" && connection)
    // A link, not a form: CSP form-action would block the redirect to the provider.
    blocks.push(
      `<section class="primary"><h2>Pay now</h2><a class="button" href="${escape(`${paymentPageUrl(siteId, requestId)}/checkout`)}" rel="noreferrer">Pay ${escape(total)} ${connection.provider === "stripe" ? "by card" : "by card, UPI or netbanking"}</a><p>Secure checkout by ${connection.provider === "stripe" ? "Stripe" : "Razorpay"}. ${escape(name)} sees your payment straight away.</p></section>`,
    );
  if (
    status === "unpaid" &&
    connection &&
    (payments?.upi || payments?.bank || payments?.inPerson)
  )
    blocks.push(
      `<p>Or pay another way and add the reference <strong>${escape(reference)}</strong> so ${escape(name)} can match your payment.</p>`,
    );
  if (status === "unpaid" && payments) {
    if (payments.upi)
      blocks.push(
        `<section><h2>UPI</h2><a class="button" href="${escape(upiLink(payments, amount, currency, reference))}">Pay with a UPI app</a><p>Or pay to UPI ID <strong>${escape(payments.upi)}</strong>${payments.payee ? ` (${escape(payments.payee)})` : ""}.</p></section>`,
      );
    if (payments.link && !connection)
      blocks.push(
        `<section><h2>Pay online</h2><a class="button" href="${escape(payments.link)}" rel="noopener noreferrer">Open the payment page</a><p>Enter ${total ? `${escape(total)} and ` : ""}the reference if asked.</p></section>`,
      );
    if (payments.bank)
      blocks.push(
        `<section><h2>Bank transfer</h2><p class="pre">${escape(payments.bank)}</p></section>`,
      );
    if (payments.inPerson)
      blocks.push(
        `<section><h2>In person</h2><p>${escape(payments.inPerson)}</p></section>`,
      );
    if (payments.note)
      blocks.push(`<p class="muted">${escape(payments.note)}</p>`);
  }
  const matchNote = `add the reference <strong>${escape(reference)}</strong> so ${escape(name)} can match your payment.`;
  const instructions =
    status === "paid" || !payments
      ? ""
      : connection
        ? ""
        : `<p>Pay ${total ? escape(total) : "the amount"} using one of these options and ${matchNote}</p>`;
  const heading =
    status === "paid"
      ? "Payment received"
      : "Your request was sent — now pay to confirm";
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(`Pay ${name}`)}</title><style>
:root{--accent:${accent}}
body{font:16px/1.55 system-ui,-apple-system,sans-serif;max-width:34rem;margin:8vh auto;padding:0 1.25rem 3rem;color:#1c1c1c;background:#fafaf9}
h1{font-size:1.6rem;line-height:1.25;margin:0 0 .5rem}
h2{font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;margin:0 0 .5rem;color:#555}
.summary{display:grid;grid-template-columns:1fr auto;gap:.25rem 1rem;background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:1rem 1.25rem;margin:1.5rem 0}
.summary dt{color:#666}.summary dd{margin:0;font-weight:600;text-align:right}
.total{font-size:1.4rem}
section{background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:1rem 1.25rem;margin:0 0 .75rem}
section p{margin:.5rem 0 0}
.primary{border-color:var(--accent)}
.button{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;padding:.65rem 1.1rem;border-radius:8px}
.pre{white-space:pre-wrap}
.muted{color:#666;font-size:.9rem}
.done{background:#ecfdf3;border-radius:12px;padding:1rem 1.25rem}
.back{display:inline-block;margin-top:1.5rem;color:inherit}
</style></head><body><h1>${escape(heading)}</h1><p class="muted">Your ${escape(noun)} for ${escape(request.itemTitle)} was sent to ${escape(name)}.</p><dl class="summary">${total ? `<dt>Amount</dt><dd class="total">${escape(total)}</dd>` : ""}<dt>Reference</dt><dd>${escape(reference)}</dd></dl>${instructions}${blocks.join("")}${back ? `<a class="back" href="${escape(back)}">← Back to ${escape(name)}</a>` : ""}</body></html>`;
  return {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      // The URL is the visitor's capability; never pass it to payment sites.
      "referrer-policy": "no-referrer",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'",
    },
    body: Buffer.from(html),
  } satisfies ApiResponse;
}
/** Public endpoint for visitor action forms. Plain HTML forms get a redirect or a readable page, never JSON. */
export async function inboxPublic(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  const pay = /^\/inbox\/([^/]+)\/requests\/([^/]+)(\/checkout)?$/.exec(
    request.path,
  );
  if (pay) {
    try {
      insist(request.method === "GET", 405, "Use GET.");
      if (pay[3]) return await startCheckout(pay[1], pay[2]);
      return await paymentPage(pay[1], pay[2]);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return page(error.status, "Payment page unavailable", error.message);
    }
  }
  const match = /^\/inbox\/([^/]+)$/.exec(request.path);
  if (!match) return undefined;
  const form = (request.headers["content-type"] || "").startsWith(
    "application/x-www-form-urlencoded",
  );
  try {
    insist(request.method === "POST", 405, "Use POST.");
    const { item, siteUrl } = await receiveRequest(match[1], fields(request));
    const next = item.payment
      ? paymentPageUrl(match[1], item.id)
      : new URL("thanks.html", siteUrl).toString();
    if (form)
      return {
        status: 303,
        headers: {
          location: next,
          "cache-control": "no-store",
        },
        body: Buffer.alloc(0),
      };
    return {
      status: 201,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body: Buffer.from(
        JSON.stringify(
          item.payment ? { ok: true, payment: next } : { ok: true },
        ),
      ),
    };
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const reason =
      error instanceof HttpError
        ? error.message
        : "Something went wrong. Please try again.";
    if (!(error instanceof HttpError))
      console.error(
        "inbox_failed",
        error instanceof Error ? error.name : "Unknown",
      );
    if (form)
      return page(
        status,
        "Your request wasn’t sent",
        `${reason} Go back to fix it and try again.`,
      );
    return {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body: Buffer.from(JSON.stringify({ error: reason })),
    };
  }
}
/** The newest requests, newest first. Older ones stay stored but aren't listed. */
export async function listRequests(siteId: string) {
  const k = key(siteId, "REQUEST");
  const result = await db.send(
    new QueryCommand({
      TableName: settings.table,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": k.pk, ":prefix": k.sk },
      ScanIndexForward: false,
      ConsistentRead: true,
      Limit: LIST_LIMIT,
    }),
  );
  return (result.Items ?? []).map((row) => {
    const { pk: _pk, sk: _sk, ...data } = row;
    void _pk;
    void _sk;
    return data as InboxRequest & { revision: number };
  });
}
export async function updateRequest(
  siteId: string,
  id: string,
  input: Record<string, unknown>,
) {
  insist(requestIdPattern.test(id), 404, "Request not found.");
  const current = await read<InboxRequest & { revision: number }>(
    siteId,
    "REQUEST",
    id,
  );
  insist(current, 404, "Request not found.");
  if (input.sync === true) return confirmWithProvider(siteId, current);
  const next = { ...current, revision: current.revision + 1 };
  if (input.payment !== undefined) {
    insist(
      input.payment === "paid" || input.payment === "unpaid",
      422,
      "Choose paid or unpaid.",
    );
    insist(current.payment, 422, "This request didn’t ask for payment.");
    next.payment =
      input.payment === "paid"
        ? {
            ...current.payment,
            status: "paid",
            confirmedBy: "owner",
            paidAt: now(),
          }
        : {
            ...current.payment,
            status: "unpaid",
            confirmedBy: undefined,
            paidAt: undefined,
          };
  } else {
    insist(
      input.status === "new" || input.status === "done",
      422,
      "Choose new or done.",
    );
    next.status = input.status;
  }
  await transact([put(siteId, "REQUEST", id, next, current.revision)]);
  return next;
}
