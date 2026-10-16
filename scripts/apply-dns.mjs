import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const normalized = (value) => value.toLowerCase().replace(/\.$/, "");
export function validateRecords(input) {
  if (
    !input ||
    !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(input.hostname || "") ||
    !Array.isArray(input.records) ||
    input.records.length > 6
  )
    throw new Error("Invalid Forma DNS export.");
  const hostname = normalized(input.hostname);
  return input.records.map((record) => {
    if (
      !record ||
      typeof record.name !== "string" ||
      typeof record.value !== "string" ||
      record.name.length > 253 ||
      record.value.length > 512
    )
      throw new Error("Invalid DNS record.");
    const name = normalized(record.name);
    const allowed =
      record.purpose === "ownership"
        ? record.type === "TXT" &&
          name === `_forma.${hostname}` &&
          /^forma-verification=[a-f0-9]{48}$/.test(record.value)
        : record.purpose === "certificate"
          ? record.type === "CNAME" &&
            name.startsWith("_") &&
            name.endsWith(`.${hostname}`) &&
            /^[a-z0-9_.-]+\.acm-validations\.aws\.?$/i.test(record.value)
          : record.purpose === "routing"
            ? ["CNAME", "ALIAS"].includes(record.type) &&
              name === hostname &&
              /^[a-z0-9-]+\.cloudfront\.net\.?$/i.test(record.value)
            : false;
    if (!allowed)
      throw new Error(
        `Unsupported ${record.purpose || ""} record. Only real Forma ownership, ACM validation, and CloudFront routing records can be applied.`,
      );
    return { ...record, name };
  });
}
export function route53Changes(records) {
  return records.flatMap((record) =>
    record.type === "ALIAS"
      ? ["A", "AAAA"].map((type) => ({
          Action: "CREATE",
          ResourceRecordSet: {
            Name: record.name,
            Type: type,
            AliasTarget: {
              DNSName: record.value,
              HostedZoneId: "Z2FDTNDATAQYW2",
              EvaluateTargetHealth: false,
            },
          },
        }))
      : [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: record.name,
              Type: record.type,
              TTL: 300,
              ResourceRecords: [
                {
                  Value:
                    record.type === "TXT"
                      ? JSON.stringify(record.value)
                      : record.value,
                },
              ],
            },
          },
        ],
  );
}
export async function main() {
  const args = process.argv.slice(2);
  const option = (name) => args[args.indexOf(name) + 1];
  if (!args.includes("--records") || !args.includes("--provider"))
    throw new Error(
      "Usage: node scripts/apply-dns.mjs --records export.json --provider route53|cloudflare [--zone zone-id] [--apply]",
    );
  const input = JSON.parse(await readFile(option("--records"), "utf8"));
  const records = validateRecords(input),
    provider = option("--provider");
  if (!["route53", "cloudflare"].includes(provider))
    throw new Error(
      "Provider must be route53 or cloudflare. Other providers can use the exported records manually.",
    );
  await mkdir(".build", { recursive: true });
  const plan = {
    hostname: input.hostname,
    provider,
    records,
    changes: provider === "route53" ? route53Changes(records) : undefined,
  };
  await writeFile(".build/dns-plan.json", JSON.stringify(plan, null, 2));
  if (!args.includes("--apply")) {
    console.log(
      "Review .build/dns-plan.json. Add --zone and --apply to create missing DNS records. Existing conflicting records are never overwritten.",
    );
    return;
  }
  const zoneId = args.includes("--zone") ? option("--zone") : "";
  if (!/^[a-zA-Z0-9]+$/.test(zoneId))
    throw new Error(
      "Provide the existing hosted zone ID. This tool does not create paid DNS zones.",
    );
  const inZone = (zone) =>
    records.every(
      (record) =>
        normalized(record.name) === normalized(zone) ||
        normalized(record.name).endsWith(`.${normalized(zone)}`),
    );
  if (provider === "route53") {
    const aws = (...args) =>
      JSON.parse(
        execFileSync("aws", [...args, "--output", "json"], {
          encoding: "utf8",
        }),
      );
    const identity = aws("sts", "get-caller-identity");
    if (identity.Account !== process.env.AWS_ACCOUNT_ID)
      throw new Error(
        "AWS_ACCOUNT_ID must match the intended signed-in AWS account.",
      );
    const zone = aws("route53", "get-hosted-zone", "--id", zoneId).HostedZone;
    if (zone.Config?.PrivateZone || !inZone(zone.Name))
      throw new Error("Records must belong to this public hosted zone.");
    const changes = [];
    for (const change of route53Changes(records)) {
      const desired = change.ResourceRecordSet;
      const existing = aws(
        "route53",
        "list-resource-record-sets",
        "--hosted-zone-id",
        zoneId,
        "--start-record-name",
        desired.Name,
        "--start-record-type",
        desired.Type,
        "--max-items",
        "1",
      ).ResourceRecordSets?.[0];
      if (
        existing &&
        normalized(existing.Name) === normalized(desired.Name) &&
        existing.Type === desired.Type
      ) {
        const same = desired.AliasTarget
          ? existing.AliasTarget &&
            normalized(existing.AliasTarget.DNSName) ===
              normalized(desired.AliasTarget.DNSName) &&
            existing.AliasTarget.HostedZoneId ===
              desired.AliasTarget.HostedZoneId
          : JSON.stringify(existing.ResourceRecords) ===
            JSON.stringify(desired.ResourceRecords);
        if (!same)
          throw new Error(
            `A conflicting ${desired.Type} record exists at ${desired.Name}. Review it with your DNS provider before switching traffic.`,
          );
      } else changes.push(change);
    }
    if (!changes.length) {
      console.log("All requested DNS records already match.");
      return;
    }
    await writeFile(
      ".build/route53-changes.json",
      JSON.stringify(
        { Comment: "Forma verified domain connection", Changes: changes },
        null,
        2,
      ),
    );
    const result = aws(
      "route53",
      "change-resource-record-sets",
      "--hosted-zone-id",
      zoneId,
      "--change-batch",
      "file://.build/route53-changes.json",
    );
    console.log(
      `DNS change submitted: ${result.ChangeInfo.Id}. Check connection in Forma after propagation.`,
    );
  } else {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token)
      throw new Error(
        "Set CLOUDFLARE_API_TOKEN with DNS edit access to only the intended zone.",
      );
    const api = async (path, options = {}) => {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}${path}`,
        {
          ...options,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(
          `Cloudflare request failed (${response.status}); check the zone and DNS permissions.`,
        );
      return result.result;
    };
    const zone = await api("");
    if (!inZone(zone.name))
      throw new Error("Records must belong to the supplied Cloudflare zone.");
    const pending = [];
    for (const record of records) {
      const type = record.type === "ALIAS" ? "CNAME" : record.type;
      const found = await api(
        `/dns_records?name=${encodeURIComponent(record.name)}&per_page=100`,
      );
      const sameType = found.find((item) => item.type === type);
      if (sameType) {
        if (
          (type === "TXT"
            ? sameType.content !== record.value
            : normalized(sameType.content) !== normalized(record.value)) ||
          sameType.proxied
        )
          throw new Error(
            `A conflicting or proxied record exists at ${record.name}. Review it before switching traffic.`,
          );
      } else {
        if (
          type === "CNAME" &&
          found.some((item) => ["A", "AAAA", "CNAME"].includes(item.type))
        )
          throw new Error(
            `A conflicting routing record exists at ${record.name}. Review it before switching traffic.`,
          );
        pending.push({
          type,
          name: record.name,
          content: record.value.replace(/\.$/, ""),
          ttl: 300,
          ...(type === "CNAME" ? { proxied: false } : {}),
        });
      }
    }
    for (const record of pending)
      await api("/dns_records", {
        method: "POST",
        body: JSON.stringify(record),
      });
    console.log(
      `Created ${pending.length} missing DNS records. Check connection in Forma after propagation.`,
    );
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
