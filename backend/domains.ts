import { randomUUID, randomBytes } from "node:crypto";
import { domainToASCII } from "node:url";
import { getDomain } from "tldts";
import {
  PutCommand,
  UpdateCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  UpdateKeysCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import {
  config,
  local,
  insist,
  epoch,
  HttpError,
  isConditional,
} from "./config";
import {
  db,
  getItem,
  queryItems,
  siteKey,
  putItem,
  deleteItem,
} from "./database";
import { getSite } from "./sites";
import {
  dnsMatches,
  provisionDomain,
  simulateDns,
  removeDomainResources,
} from "./domain-provider";
import { probeDomain } from "./domain-probe";

export interface DnsRecord {
  type: "TXT" | "CNAME" | "ALIAS";
  name: string;
  value: string;
  purpose: "ownership" | "certificate" | "routing";
}
export interface DomainRecord {
  pk: string;
  sk: string;
  id: string;
  owner: string;
  siteId: string;
  hostname: string;
  token: string;
  status:
    | "ownership"
    | "certificate"
    | "deploying"
    | "dns"
    | "connected"
    | "disconnected"
    | "failed"
    | "removing"
    | "removed";
  certificateRecord?: DnsRecord;
  target?: string;
  message?: string;
  verifiedAt?: string;
  checkedAt?: string;
  lease?: string;
  leaseUntil?: number;
  createdAt: string;
}
export function normalizeHostname(value: unknown) {
  insist(
    typeof value === "string" && value.length <= 253,
    422,
    "Enter a domain name such as www.yourdomain.com.",
  );
  insist(
    !/[\\/:@?#%*\s]/.test(value.trim()),
    422,
    "Enter the hostname only, without a protocol, path, port, or wildcard.",
  );
  const hostname = domainToASCII(value.trim().toLowerCase().replace(/\.$/, ""));
  insist(
    hostname.length <= 253 &&
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(
        hostname,
      ),
    422,
    "Enter the hostname only, without a protocol, path, port, or wildcard.",
  );
  const registrable = getDomain(hostname, { allowPrivateDomains: true });
  insist(
    registrable &&
      registrable !== "localhost" &&
      !/\.(localhost|local|internal|onion|invalid)$/.test(hostname),
    422,
    "Use a public domain you own.",
  );
  if (!local)
    insist(
      !/\.(test|example)$/.test(hostname) &&
        !["example.com", "example.org", "example.net"].includes(registrable),
      422,
      "Use your real registered domain for live hosting.",
    );
  insist(
    !["cloudfront.net", "amazonaws.com", "acm-validations.aws"].some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    ),
    422,
    "Use your own domain, not a hosting-provider address.",
  );
  return hostname;
}
const key = (siteId: string, id: string) => ({
  pk: `SITE#${siteId}`,
  sk: `DOMAIN#${id}`,
});
export const ownershipRecord = (domain: DomainRecord): DnsRecord => ({
  type: "TXT",
  name: `_forma.${domain.hostname}`,
  value: `forma-verification=${domain.token}`,
  purpose: "ownership",
});
export function domainRecords(domain: DomainRecord) {
  const records = [ownershipRecord(domain)];
  if (domain.certificateRecord) records.push(domain.certificateRecord);
  if (domain.target)
    records.push({
      type: domain.hostname === getDomain(domain.hostname) ? "ALIAS" : "CNAME",
      name: domain.hostname,
      value: domain.target,
      purpose: "routing",
    });
  return records;
}
export function publicDomain(domain: DomainRecord) {
  return {
    id: domain.id,
    hostname: domain.hostname,
    status: domain.status,
    records: domainRecords(domain),
    message: domain.message,
    checkedAt: domain.checkedAt,
    verifiedAt: domain.verifiedAt,
    target: domain.target,
    local,
    url:
      domain.status === "connected"
        ? local
          ? `${config.siteOrigin}/__domains/${domain.hostname}/`
          : `https://${domain.hostname}/`
        : undefined,
  };
}
export async function listDomains(owner: string, siteId: string) {
  await getSite(owner, siteId);
  return queryItems<DomainRecord>(`SITE#${siteId}`, "DOMAIN#", 10);
}
async function ownedDomain(owner: string, siteId: string, id: string) {
  await getSite(owner, siteId);
  const domain = await getItem<DomainRecord>(`SITE#${siteId}`, `DOMAIN#${id}`);
  insist(domain?.owner === owner, 404, "Domain not found.");
  return domain;
}
export async function addDomain(owner: string, siteId: string, value: unknown) {
  const hostname = normalizeHostname(value);
  const existing = (await listDomains(owner, siteId)).find(
    (domain) => domain.hostname === hostname,
  );
  if (existing) return existing;
  const id = randomUUID();
  const domain: DomainRecord = {
    ...key(siteId, id),
    id,
    owner,
    siteId,
    hostname,
    token: randomBytes(24).toString("hex"),
    status: "ownership",
    createdAt: new Date().toISOString(),
  };
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: config.table,
              Key: siteKey(owner, siteId),
              UpdateExpression: "ADD domainCount :one",
              ConditionExpression:
                "attribute_exists(pk) AND (attribute_not_exists(domainCount) OR domainCount < :limit)",
              ExpressionAttributeValues: { ":one": 1, ":limit": 2 },
            },
          },
          {
            Put: {
              TableName: config.table,
              Item: domain,
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          {
            Put: {
              TableName: config.table,
              Item: { pk: `SITE#${siteId}`, sk: `DOMAIN_NAME#${hostname}`, id },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
        ],
      }),
    );
  } catch (error) {
    if (isConditional(error)) {
      const concurrent = (await listDomains(owner, siteId)).find(
        (domain) => domain.hostname === hostname,
      );
      if (concurrent) return concurrent;
      throw new HttpError(
        409,
        "This site supports two domain connections, for example your root domain and www.",
      );
    }
    throw error;
  }
  return domain;
}
const kvs = new CloudFrontKeyValueStoreClient({
  region: config.region,
  maxAttempts: 2,
});
export async function setDomainRoute(domain: DomainRecord, active?: boolean) {
  const value = JSON.stringify({
    siteId: domain.siteId,
    connectionId: domain.id,
    active,
  });
  if (local) {
    if (active === undefined) {
      await deleteItem("LOCAL_DOMAINS", `HOST#${domain.hostname}`);
      return;
    }
    await putItem({
      pk: "LOCAL_DOMAINS",
      sk: `HOST#${domain.hostname}`,
      value,
    });
    return;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await kvs.send(
      new DescribeKeyValueStoreCommand({ KvsARN: config.kvsArn }),
    );
    try {
      await kvs.send(
        new UpdateKeysCommand({
          KvsARN: config.kvsArn,
          IfMatch: state.ETag,
          ...(active === undefined
            ? { Deletes: [{ Key: `host:${domain.hostname}` }] }
            : { Puts: [{ Key: `host:${domain.hostname}`, Value: value }] }),
        }),
      );
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== "ConflictException" ||
        attempt === 3
      )
        throw error;
    }
  }
}
async function claim(domain: DomainRecord) {
  try {
    await db.send(
      new PutCommand({
        TableName: config.table,
        Item: {
          pk: `DOMAIN_HOST#${domain.hostname}`,
          sk: "CLAIM",
          owner: domain.owner,
          siteId: domain.siteId,
          id: domain.id,
        },
        ConditionExpression: "attribute_not_exists(pk) OR id = :id",
        ExpressionAttributeValues: { ":id": domain.id },
      }),
    );
  } catch (error) {
    if (isConditional(error))
      throw new HttpError(
        409,
        "This domain is already connected to another website. Disconnect and remove that connection before transferring it.",
      );
    throw error;
  }
}
async function withLease(
  owner: string,
  siteId: string,
  id: string,
  action: (domain: DomainRecord) => Promise<DomainRecord>,
) {
  let domain = await ownedDomain(owner, siteId, id);
  const lease = randomUUID();
  try {
    const locked = await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: key(siteId, id),
        UpdateExpression: "SET lease = :lease, leaseUntil = :until",
        ConditionExpression:
          "attribute_exists(pk) AND (attribute_not_exists(leaseUntil) OR leaseUntil < :now)",
        ReturnValues: "ALL_NEW",
        ExpressionAttributeValues: {
          ":lease": lease,
          ":until": epoch() + 60,
          ":now": epoch(),
        },
      }),
    );
    // Read the current state atomically with the lock, not the pre-lock snapshot.
    domain = locked.Attributes as DomainRecord;
  } catch (error) {
    if (isConditional(error))
      throw new HttpError(
        409,
        "This domain is being checked. Try again in a minute.",
      );
    throw error;
  }
  try {
    const result = await action(domain);
    delete result.lease;
    delete result.leaseUntil;
    result.checkedAt = new Date().toISOString();
    if (result.status === "removed") {
      const claimed = await getItem<{ id: string }>(
        `DOMAIN_HOST#${domain.hostname}`,
        "CLAIM",
      );
      await db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: config.table,
                Key: key(siteId, id),
                ConditionExpression: "lease = :lease",
                ExpressionAttributeValues: { ":lease": lease },
              },
            },
            {
              Delete: {
                TableName: config.table,
                Key: {
                  pk: `SITE#${siteId}`,
                  sk: `DOMAIN_NAME#${domain.hostname}`,
                },
              },
            },
            {
              Update: {
                TableName: config.table,
                Key: siteKey(owner, siteId),
                UpdateExpression: "ADD domainCount :minus",
                ConditionExpression: "domainCount > :zero",
                ExpressionAttributeValues: { ":minus": -1, ":zero": 0 },
              },
            },
            ...(claimed?.id === id
              ? [
                  {
                    Delete: {
                      TableName: config.table,
                      Key: {
                        pk: `DOMAIN_HOST#${domain.hostname}`,
                        sk: "CLAIM",
                      },
                      ConditionExpression: "id = :id",
                      ExpressionAttributeValues: { ":id": id },
                    },
                  },
                ]
              : []),
            {
              Delete: {
                TableName: config.table,
                Key: { pk: `DOMAIN#${id}`, sk: "LOCAL_DNS" },
              },
            },
          ],
        }),
      );
      return result;
    }
    await db.send(
      new PutCommand({
        TableName: config.table,
        Item: result,
        ConditionExpression: "lease = :lease",
        ExpressionAttributeValues: { ":lease": lease },
      }),
    );
    return result;
  } finally {
    await db
      .send(
        new UpdateCommand({
          TableName: config.table,
          Key: key(siteId, id),
          UpdateExpression: "REMOVE lease, leaseUntil",
          ConditionExpression: "lease = :lease",
          ExpressionAttributeValues: { ":lease": lease },
        }),
      )
      .catch(() => {});
  }
}
export async function checkDomain(
  owner: string,
  siteId: string,
  id: string,
  retry = false,
) {
  return withLease(owner, siteId, id, async (domain) => {
    if (domain.status === "removing") return finishRemoval(domain);
    // Rechecking ownership before every activation prevents an old pending connection from taking over a transferred domain.
    if (!(await dnsMatches(domain, ownershipRecord(domain)))) {
      if (domain.verifiedAt) await setDomainRoute(domain, false);
      domain.status = "ownership";
      domain.message =
        "Add the TXT record at your DNS provider, then check again.";
      await clearPrimary(domain);
      return domain;
    }
    await claim(domain);
    domain.verifiedAt ||= new Date().toISOString();
    const wasConnected = domain.status === "connected";
    const provisioned = await provisionDomain(domain, retry);
    domain.status = provisioned.status;
    domain.message = provisioned.message;
    domain.certificateRecord = provisioned.certificateRecord;
    domain.target = provisioned.target;
    if (domain.status !== "dns" || !domain.target) {
      if (wasConnected) {
        await setDomainRoute(domain, false);
        await clearPrimary(domain);
      }
      return domain;
    }
    // The verification endpoint is served before site content is enabled.
    await setDomainRoute(domain, wasConnected);
    const routing: DnsRecord = {
      type: domain.hostname === getDomain(domain.hostname) ? "ALIAS" : "CNAME",
      name: domain.hostname,
      value: domain.target,
      purpose: "routing",
    };
    const ready = local
      ? await dnsMatches(domain, routing)
      : await probeDomain(domain);
    if (!ready) {
      if (wasConnected) {
        await setDomainRoute(domain, false);
        await clearPrimary(domain);
      }
      domain.message =
        "Point the domain to the target below. HTTPS and the domain verification endpoint must be reachable before connecting.";
      return domain;
    }
    await setDomainRoute(domain, true);
    domain.status = "connected";
    domain.message = undefined;
    return domain;
  });
}
async function clearPrimary(domain: DomainRecord) {
  await db
    .send(
      new UpdateCommand({
        TableName: config.table,
        Key: siteKey(domain.owner, domain.siteId),
        UpdateExpression: "REMOVE primaryDomain, domainUrl",
        ConditionExpression: "primaryDomain = :host",
        ExpressionAttributeValues: { ":host": domain.hostname },
      }),
    )
    .catch((error) => {
      if (!isConditional(error)) throw error;
    });
}
export async function disconnectDomain(
  owner: string,
  siteId: string,
  id: string,
) {
  return withLease(owner, siteId, id, async (domain) => {
    insist(
      domain.status !== "removing",
      409,
      "Domain removal is already in progress. Check its status to finish removal.",
    );
    if (domain.verifiedAt) await setDomainRoute(domain, false);
    await clearPrimary(domain);
    domain.status = "disconnected";
    domain.message =
      "Domain routing is paused. DNS and HTTPS resources are retained so you can reconnect.";
    return domain;
  });
}
export async function primaryDomain(owner: string, siteId: string, id: string) {
  return withLease(owner, siteId, id, async (domain) => {
    insist(
      domain.status === "connected",
      409,
      "Connect this domain before making it primary.",
    );
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: siteKey(owner, siteId),
        UpdateExpression: "SET primaryDomain = :host, domainUrl = :url",
        ExpressionAttributeValues: {
          ":host": domain.hostname,
          ":url": publicDomain(domain).url,
        },
      }),
    );
    return domain;
  });
}
export async function writeLocalDns(
  owner: string,
  siteId: string,
  id: string,
  records: unknown,
) {
  const domain = await ownedDomain(owner, siteId, id);
  await simulateDns(domain, records);
  return domain;
}

async function finishRemoval(domain: DomainRecord) {
  const claimed = await getItem<{ id: string }>(
    `DOMAIN_HOST#${domain.hostname}`,
    "CLAIM",
  );
  if (claimed?.id === domain.id) await setDomainRoute(domain, false);
  await clearPrimary(domain);
  domain.status = (await removeDomainResources(domain))
    ? "removed"
    : "removing";
  if (domain.status === "removed" && claimed?.id === domain.id)
    await setDomainRoute(domain);
  domain.message =
    "Domain delivery is disabled. Waiting for HTTPS resources to finish removal; check again shortly. Your website content is retained.";
  return domain;
}
export async function removeDomain(owner: string, siteId: string, id: string) {
  return withLease(owner, siteId, id, finishRemoval);
}
