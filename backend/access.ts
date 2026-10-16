import { getItem, siteKey, queryItems } from "./database";
import { insist } from "./config";
import type { Site } from "./types";
import type { Member } from "../src/commerce/types";

export interface SiteAccess {
  owner: string;
  role: "owner" | Member["role"];
  site: Site;
}
export async function siteAccess(
  actor: string,
  id: string,
): Promise<SiteAccess> {
  const own = siteKey(actor, id);
  const site = await getItem<Site>(own.pk, own.sk);
  if (site) return { owner: actor, role: "owner", site };
  const grant = await getItem<{ owner: string; role: Member["role"] }>(
    `USER#${actor}`,
    `ACCESS#${id}`,
  );
  insist(grant, 404, "Site not found.");
  const key = siteKey(grant.owner, id);
  const shared = await getItem<Site>(key.pk, key.sk);
  insist(shared, 404, "Site not found.");
  return { owner: grant.owner, role: grant.role, site: shared };
}
export function allow(
  access: SiteAccess,
  permission: "read" | "edit" | "manage" | "owner",
) {
  const ranks = { viewer: 0, editor: 1, manager: 2, owner: 3 };
  const required = { read: 0, edit: 1, manage: 2, owner: 3 };
  insist(
    ranks[access.role] >= required[permission],
    403,
    "Your role does not allow this action.",
  );
}
export async function sharedSites(actor: string) {
  const grants = await queryItems<{ owner: string; siteId: string }>(
    `USER#${actor}`,
    "ACCESS#",
    100,
  );
  const rows = await Promise.all(
    grants.map(async (grant) => {
      const key = siteKey(grant.owner, grant.siteId);
      return getItem<Site>(key.pk, key.sk);
    }),
  );
  return rows.filter((site): site is Site => !!site);
}
