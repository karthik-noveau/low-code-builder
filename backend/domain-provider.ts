import { Resolver } from "node:dns/promises";
import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStacksCommand,
  DescribeStackResourceCommand,
  UpdateStackCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";
import { ACMClient, DescribeCertificateCommand } from "@aws-sdk/client-acm";
import { config, local, insist } from "./config";
import { getItem, putItem } from "./database";
import { domainTemplate } from "./domain-template";
import type { DomainRecord, DnsRecord } from "./domains";

const cfn = new CloudFormationClient({ region: "us-east-1", maxAttempts: 2 });
const acm = new ACMClient({ region: "us-east-1", maxAttempts: 2 });
const resolver = new Resolver({ timeout: 2000, tries: 2 });
const normalize = (value: string) => value.toLowerCase().replace(/\.$/, "");
const stackName = (domain: DomainRecord) =>
  `${config.stack}-domain-${domain.id}`;
export async function dnsMatches(domain: DomainRecord, record: DnsRecord) {
  if (local) {
    const saved = await getItem<{ records: DnsRecord[] }>(
      `DOMAIN#${domain.id}`,
      "LOCAL_DNS",
    );
    return !!saved?.records.some(
      (item) =>
        item.type === record.type &&
        normalize(item.name) === normalize(record.name) &&
        (record.type === "TXT"
          ? item.value === record.value
          : normalize(item.value) === normalize(record.value)),
    );
  }
  try {
    if (record.type === "TXT")
      return (await resolver.resolveTxt(record.name)).some(
        (parts) => parts.join("") === record.value,
      );
    if (
      (await resolver.resolveCname(record.name).catch(() => [])).some(
        (value) => normalize(value) === normalize(record.value),
      )
    )
      return true;
    // ALIAS/flattened apex records have no CNAME answer. Their HTTPS identity is checked separately.
    return false;
  } catch {
    return false;
  }
}
export async function simulateDns(domain: DomainRecord, records: unknown) {
  insist(local, 404, "Not found.");
  insist(
    Array.isArray(records) && records.length <= 6,
    422,
    "Provide up to six DNS records.",
  );
  for (const record of records)
    insist(
      record &&
        typeof record.name === "string" &&
        record.name.length <= 253 &&
        typeof record.value === "string" &&
        record.value.length <= 512 &&
        ["TXT", "CNAME", "ALIAS"].includes(record.type),
      422,
      "Invalid DNS record.",
    );
  await putItem({ pk: `DOMAIN#${domain.id}`, sk: "LOCAL_DNS", records });
}
export interface ProvisionedDomain {
  status: "certificate" | "deploying" | "dns" | "failed";
  certificateRecord?: DnsRecord;
  target?: string;
  message?: string;
}
export async function provisionDomain(
  domain: DomainRecord,
  retry = false,
): Promise<ProvisionedDomain> {
  if (local) {
    const certificateRecord: DnsRecord = {
      type: "CNAME",
      name: `_acm-${domain.id.slice(0, 8)}.${domain.hostname}`,
      value: `${domain.id}.acm-validation.local.test`,
      purpose: "certificate",
    };
    if (!(await dnsMatches(domain, certificateRecord)))
      return { status: "certificate", certificateRecord };
    return {
      status: "dns",
      certificateRecord,
      target: `${domain.id}.cloudfront.local.test`,
    };
  }
  insist(
    config.domainRole &&
      config.siteBucketDomain &&
      config.routerArn &&
      config.originAccessId &&
      config.siteHeadersId,
    503,
    "Domain hosting has not been configured for this deployment.",
  );
  const input = {
    hostname: domain.hostname,
    bucketDomain: config.siteBucketDomain,
    originAccessId: config.originAccessId,
    routerArn: config.routerArn,
    headersPolicyId: config.siteHeadersId,
    stack: config.stack,
  };
  const template = JSON.stringify(domainTemplate(input));
  let stack;
  try {
    stack = (
      await cfn.send(
        new DescribeStacksCommand({ StackName: stackName(domain) }),
      )
    ).Stacks?.[0];
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.name !== "ValidationError" ||
      !error.message.includes("does not exist")
    )
      throw error;
  }
  if (!stack) {
    try {
      await cfn.send(
        new CreateStackCommand({
          StackName: stackName(domain),
          TemplateBody: template,
          RoleARN: config.domainRole,
          DisableRollback: true,
          Tags: [{ Key: "FormaStack", Value: config.stack }],
        }),
      );
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AlreadyExistsException")
        throw error;
    }
    return {
      status: "certificate",
      message:
        "Preparing your HTTPS certificate. Check again shortly for its DNS record.",
    };
  }
  if (["CREATE_FAILED", "UPDATE_FAILED"].includes(stack.StackStatus || "")) {
    if (retry) {
      await cfn.send(
        new UpdateStackCommand({
          StackName: stackName(domain),
          TemplateBody: template,
          RoleARN: config.domainRole,
          DisableRollback: true,
        }),
      );
      return {
        status: "deploying",
        message: "Retrying the domain deployment.",
      };
    }
    return {
      status: "failed",
      message:
        "The domain deployment needs attention. Review its CloudFormation events, correct the DNS or account permissions, then retry.",
    };
  }
  const outputs = Object.fromEntries(
    (stack.Outputs || []).map((item) => [item.OutputKey!, item.OutputValue!]),
  );
  let arn: string | undefined = outputs.CertificateArn;
  if (!arn) {
    try {
      arn = (
        await cfn.send(
          new DescribeStackResourceCommand({
            StackName: stackName(domain),
            LogicalResourceId: "Certificate",
          }),
        )
      ).StackResourceDetail?.PhysicalResourceId;
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "ValidationError")
        throw error;
    }
  }
  let certificateRecord: DnsRecord | undefined;
  let certificateStatus: string | undefined;
  if (arn) {
    const certificate = (
      await acm.send(new DescribeCertificateCommand({ CertificateArn: arn }))
    ).Certificate;
    certificateStatus = certificate?.Status;
    const record = certificate?.DomainValidationOptions?.find(
      (item) => item.DomainName === domain.hostname,
    )?.ResourceRecord;
    if (record?.Name && record.Value)
      certificateRecord = {
        type: "CNAME",
        name: record.Name,
        value: record.Value,
        purpose: "certificate",
      };
  }
  if (
    ["VALIDATION_TIMED_OUT", "FAILED", "EXPIRED", "REVOKED"].includes(
      certificateStatus || "",
    )
  )
    return {
      status: "failed",
      certificateRecord,
      message: `HTTPS certificate status: ${certificateStatus}. Review the domain stack before retrying.`,
    };
  if (
    stack.StackStatus === "CREATE_COMPLETE" ||
    stack.StackStatus === "UPDATE_COMPLETE"
  )
    return { status: "dns", certificateRecord, target: outputs.Target };
  return {
    status: certificateStatus === "ISSUED" ? "deploying" : "certificate",
    certificateRecord,
  };
}

export async function removeDomainResources(domain: DomainRecord) {
  if (local) return true;
  let stack;
  try {
    stack = (
      await cfn.send(
        new DescribeStacksCommand({ StackName: stackName(domain) }),
      )
    ).Stacks?.[0];
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ValidationError" &&
      error.message.includes("does not exist")
    )
      return true;
    throw error;
  }
  if (!stack || stack.StackStatus === "DELETE_COMPLETE") return true;
  if (stack.StackStatus !== "DELETE_IN_PROGRESS")
    await cfn.send(
      new DeleteStackCommand({
        StackName: stackName(domain),
        RoleARN: config.domainRole,
      }),
    );
  return false;
}
