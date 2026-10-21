import * as cloud from "../cloud/client";
import type { InboxRequest } from "../studio/requests";
import { formatAmount } from "../studio/payments";

/** What's happened across the workspace: new requests, payments, publish problems. */
// One request per page load is plenty: the list only changes when sites do.
let sitesOnce: Promise<cloud.Site[]> | undefined;
export const loadSites = () =>
  (sitesOnce ??= cloud
    .listSites()
    .then((r) => r.sites)
    .catch((error) => {
      sitesOnce = undefined;
      throw error;
    }));

export interface Notice {
  id: string;
  title: string;
  detail: string;
  at: string;
  href: string;
  icon: string;
  tone?: "warning" | "success";
}
const KIND_WORD: Record<string, string> = {
  order: "order",
  book: "booking",
  rsvp: "RSVP",
  enquire: "enquiry",
  apply: "application",
};
function noticesFor(site: cloud.Site, requests: InboxRequest[]): Notice[] {
  const inbox = `/editor?site=${site.id}&open=inbox`;
  const list: Notice[] = [];
  for (const r of requests) {
    const word = KIND_WORD[r.kind] ?? "request";
    const amount =
      r.payment?.amount != null
        ? ` · ${formatAmount(r.payment.amount, r.payment.currency)}`
        : "";
    if (r.payment?.status === "paid" && r.payment.paidAt)
      list.push({
        id: `${r.id}-paid`,
        title: `Payment received from ${r.name}`,
        detail: `${site.name} · ${r.itemTitle || r.collectionName}${amount}`,
        at: r.payment.paidAt,
        href: inbox,
        icon: "check",
        tone: "success",
      });
    list.push({
      id: r.id,
      title: `New ${word} from ${r.name}`,
      detail: `${site.name} · ${r.itemTitle || r.collectionName}${amount}${
        r.payment?.status === "unpaid" ? " · awaiting payment" : ""
      }`,
      at: r.createdAt,
      href: inbox,
      icon: "mail",
    });
  }
  if (site.error)
    list.push({
      id: `${site.id}-publish-error`,
      title: "Publishing needs attention",
      detail: `${site.name} · open the editor to review it`,
      at: site.publishedAt || site.updatedAt,
      href: `/editor?site=${site.id}`,
      icon: "help",
      tone: "warning",
    });
  return list;
}
export async function loadNotices(): Promise<Notice[]> {
  const sites = await loadSites();
  const perSite = await Promise.all(
    sites.slice(0, 12).map(async (site) => {
      // Viewers can't read an inbox; their notices are just the site's own.
      const requests = await cloud
        .request<{ requests: InboxRequest[] }>(`/sites/${site.id}/inbox`)
        .then((r) => r.requests)
        .catch(() => []);
      return noticesFor(site, requests);
    }),
  );
  return perSite
    .flat()
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30);
}
export function ago(at: string) {
  const minutes = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 1440)}d ago`;
  return new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
