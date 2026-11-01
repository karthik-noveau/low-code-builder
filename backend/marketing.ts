/**
 * Marketing email: campaigns to the store's subscribers, and a reminder to a
 * shopper who left a checkout unpaid.
 *
 * Campaigns only ever go to people who opted in (newsletter subscribers),
 * narrowed by what they've bought. Sending is done in steps the owner's
 * browser drives (mode "send", repeated): each step writes the next batch
 * of messages to the outbox (mail.ts sends them through SES), each with its
 * own unsubscribe link, so one request never does too much. Links to the
 * site and store are tagged with the campaign (utm_*), so Insights can show
 * the visits and sales it brought.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { allow, siteAccess } from "./access";
import { config, insist } from "./config";
import {
  audit,
  list,
  message,
  now,
  put,
  read,
  transact,
  type Write,
} from "./commerce-data";
import { digest, text } from "./commerce";
import { deliverMail, mailFrom } from "./mail";
import type {
  Campaign,
  CampaignAudience,
  Customer,
  Discount,
  Order,
  Submission,
} from "../src/commerce/types";

export const AUDIENCES: CampaignAudience[] = [
  "subscribers",
  "customers",
  "prospects",
  "lapsed",
];
/** People a campaign can reach (it keeps their addresses until it's sent). */
export const MAX_RECIPIENTS = 5000;
const STEP = 60;
const PER_TRANSACTION = 20;
const LAPSED_DAYS = 90;

type Stored = Campaign & { recipients: string[]; revision: number };

/** Subscribers in the chosen audience, sorted, at most MAX_RECIPIENTS. */
async function audience(siteId: string, who: CampaignAudience) {
  const subscribers = (await list<Submission>(siteId, "SUBMISSION", 20000))
    .filter((s) => s.kind === "newsletter" && s.consent)
    .map((s) => s.email.toLowerCase());
  let chosen = subscribers;
  if (who !== "subscribers") {
    const customers = new Map(
      (await list<Customer>(siteId, "CUSTOMER", 20000)).map((c) => [
        c.email.toLowerCase(),
        c,
      ]),
    );
    const cutoff = new Date(Date.now() - LAPSED_DAYS * 86400_000).toISOString();
    chosen = subscribers.filter((email) => {
      const c = customers.get(email);
      if (who === "customers") return !!c && c.orders > 0;
      if (who === "prospects") return !c || c.orders === 0;
      return !!c && c.orders > 0 && c.updatedAt < cutoff;
    });
  }
  return [...new Set(chosen)].sort().slice(0, MAX_RECIPIENTS);
}
/** utm_* on every link into the site or store, so visits and sales are credited. */
export function tagLinks(body: string, campaign: string, hosts: string[]) {
  return body.replace(/https?:\/\/[^\s<>"')]+/g, (link) => {
    try {
      const url = new URL(link);
      if (!hosts.includes(url.host) || url.searchParams.has("utm_source"))
        return link;
      url.searchParams.set("utm_source", "newsletter");
      url.searchParams.set("utm_medium", "email");
      url.searchParams.set("utm_campaign", campaign);
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

async function details(siteId: string, input: Record<string, unknown>) {
  const subject = text(input.subject, "subject", 160);
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
    body,
    who,
    code,
    name: slug(text(input.name ?? subject, "campaign name", 80)),
  };
}
/** The message as one subscriber reads it. */
function compose(
  siteId: string,
  c: { body: string; discountCode: string; name: string },
  hosts: string[],
  unsubscribe: string,
) {
  const offer = c.discountCode
    ? `\n\nUse code ${c.discountCode} at checkout: ${storeLink(siteId)}`
    : "";
  return `${tagLinks(c.body + offer, c.name, hosts)}\n\n—\nYou’re getting this because you subscribed. Unsubscribe: ${unsubscribe}`;
}
/** Hosts whose links get campaign tags: the store, the site's Forma address and its domain. */
const hostsOf = (domainUrl?: string) =>
  [config.editorOrigin, config.siteOrigin, domainUrl]
    .filter((u): u is string => !!u)
    .map((u) => new URL(u).host);
const publicCampaign = ({ recipients: _r, ...c }: Stored): Campaign => {
  void _r;
  return c;
};

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
  const mode = input.mode ?? "preview";
  if (mode === "list")
    return {
      campaigns: (await list<Stored>(siteId, "CAMPAIGN"))
        .map(publicCampaign)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  if (mode === "preview") {
    const d = await details(siteId, input);
    const recipients = await audience(siteId, d.who);
    return {
      subject: d.subject,
      body: compose(
        siteId,
        { body: d.body, discountCode: d.code, name: d.name },
        hosts,
        `${storeLink(siteId)}&unsubscribe=…`,
      ),
      recipients,
      count: recipients.length,
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
    await transact([
      message(
        siteId,
        actorEmail,
        `[Test] ${d.subject}`,
        compose(
          siteId,
          { body: d.body, discountCode: d.code, name: d.name },
          hosts,
          "(your subscribers get their own link here)",
        ),
      ),
    ]);
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
  } else {
    const d = await details(siteId, input);
    const recipients = await audience(siteId, d.who);
    insist(
      recipients.length,
      422,
      "Nobody in this audience has subscribed yet.",
    );
    campaign = {
      id: `${Date.now()}-${randomUUID()}`,
      name: d.name,
      subject: d.subject,
      body: d.body,
      audience: d.who,
      discountCode: d.code,
      status: "sending",
      total: recipients.length,
      queued: 0,
      createdAt: now(),
      updatedAt: now(),
      recipients,
      revision: 1,
    };
    await transact([
      put(siteId, "CAMPAIGN", campaign.id, campaign),
      audit(siteId, actor, "campaign.sent", campaign.name),
    ]);
  }
  // The next batch: each subscriber gets the message and their own way out.
  const batch = campaign.recipients.slice(
    campaign.queued,
    campaign.queued + STEP,
  );
  for (let i = 0; i < batch.length; i += PER_TRANSACTION) {
    const writes: Write[] = [];
    for (const email of batch.slice(i, i + PER_TRANSACTION)) {
      const token = randomBytes(32).toString("hex");
      writes.push(
        put(siteId, "UNSUBSCRIBE", digest(token), {
          submissionId: digest(email),
        }),
      );
      writes.push(
        message(
          siteId,
          email,
          campaign.subject,
          compose(
            siteId,
            campaign,
            hosts,
            `${storeLink(siteId)}&unsubscribe=${token}`,
          ),
        ),
      );
    }
    await transact(writes);
  }
  const queued = campaign.queued + batch.length;
  const done = queued >= campaign.total;
  const next: Stored = {
    ...campaign,
    queued,
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

/**
 * Reminds a shopper who started a checkout and didn't pay, once, optionally
 * with a discount code. Only for checkouts that are no longer open.
 */
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
