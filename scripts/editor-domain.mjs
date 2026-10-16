import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getDomain } from "tldts";
import { pathToFileURL } from "node:url";

export const editorCertificateTemplate = (hostname) => ({
  AWSTemplateFormatVersion: "2010-09-09",
  Description:
    "Forma editor HTTPS certificate; existing DNS stays with its provider.",
  Resources: {
    Certificate: {
      Type: "AWS::CertificateManager::Certificate",
      Properties: {
        DomainName: hostname,
        ValidationMethod: "DNS",
        CertificateExport: "DISABLED",
        DomainValidationOptions: [{ DomainName: hostname }],
      },
    },
  },
  Outputs: { CertificateArn: { Value: { Ref: "Certificate" } } },
});

export async function main() {
  const hostname = process.env.EDITOR_DOMAIN;
  const appStack = process.env.FORMA_STACK;
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      hostname || "",
    ) ||
    !/^forma-[a-z0-9-]{1,40}$/.test(appStack || "")
  )
    throw new Error(
      "Set EDITOR_DOMAIN to your hostname and FORMA_STACK to the intended app stack.",
    );
  const stack = `${appStack}-editor-cert-${createHash("sha256").update(hostname).digest("hex").slice(0, 10)}`;
  await mkdir(".build", { recursive: true });
  await writeFile(
    ".build/editor-certificate.json",
    JSON.stringify(editorCertificateTemplate(hostname), null, 2),
  );
  const aws = (...args) =>
    execFileSync("aws", [...args, "--region", "us-east-1"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  if (
    !process.argv.includes("--request") &&
    !process.argv.includes("--check")
  ) {
    console.log(
      "Prepared .build/editor-certificate.json. Use --request to request the certificate, then --check to view DNS records and readiness.",
    );
    return;
  }
  const identity = JSON.parse(aws("sts", "get-caller-identity"));
  if (identity.Account !== process.env.AWS_ACCOUNT_ID)
    throw new Error(
      "AWS_ACCOUNT_ID must match the intended signed-in account.",
    );
  if (process.argv.includes("--request")) {
    try {
      aws("cloudformation", "describe-stacks", "--stack-name", stack);
    } catch (error) {
      if (!String(error.stderr).includes("does not exist")) throw error;
      aws(
        "cloudformation",
        "create-stack",
        "--stack-name",
        stack,
        "--template-body",
        "file://.build/editor-certificate.json",
        "--disable-rollback",
      );
    }
    console.log(
      `Certificate stack: ${stack}. Run --check shortly to obtain the DNS validation record.`,
    );
    return;
  }
  const resources = JSON.parse(
    aws(
      "cloudformation",
      "describe-stack-resource",
      "--stack-name",
      stack,
      "--logical-resource-id",
      "Certificate",
    ),
  );
  const arn = resources.StackResourceDetail?.PhysicalResourceId;
  if (!arn) {
    console.log("Certificate request is initializing; check again shortly.");
    return;
  }
  const certificate = JSON.parse(
    aws("acm", "describe-certificate", "--certificate-arn", arn),
  ).Certificate;
  const record = certificate.DomainValidationOptions?.find(
    (item) => item.DomainName === hostname,
  )?.ResourceRecord;
  const records = record
    ? [
        {
          purpose: "certificate",
          type: "CNAME",
          name: record.Name,
          value: record.Value,
        },
      ]
    : [];
  const deployment = await readFile(".build/deployment.json", "utf8")
    .then(JSON.parse)
    .catch(() => undefined);
  if (deployment?.EditorDefaultHost)
    records.push({
      purpose: "routing",
      type: hostname === getDomain(hostname) ? "ALIAS" : "CNAME",
      name: hostname,
      value: deployment.EditorDefaultHost,
    });
  await writeFile(
    ".build/editor-dns.json",
    JSON.stringify({ hostname, records }, null, 2),
  );
  console.log(
    `HTTPS: ${certificate.Status}\nDNS records: .build/editor-dns.json\nEDITOR_CERTIFICATE_ARN=${arn}\nKeep the validation CNAME for certificate renewal.`,
  );
  if (certificate.Status === "ISSUED")
    console.log(
      "Set EDITOR_DOMAIN and EDITOR_CERTIFICATE_ARN in the GitHub environment, then deploy. Add the routing record after the editor distribution is ready.",
    );
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
