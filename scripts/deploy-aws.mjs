import { execFileSync } from "node:child_process";
import { writeFile, readFile, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { assertReleaseReady } from "./release-readiness.mjs";

assertReleaseReady();

// Explicit live deployment. Local startup never invokes AWS provisioning.
const stack = process.env.FORMA_STACK;
const bucket = process.env.ARTIFACT_BUCKET;
const role = process.env.CF_EXECUTION_ROLE;
const editorDomain = process.env.EDITOR_DOMAIN || "";
const certificateArn = process.env.EDITOR_CERTIFICATE_ARN || "";
if (!!editorDomain !== !!certificateArn)
  throw new Error("Provide both EDITOR_DOMAIN and EDITOR_CERTIFICATE_ARN.");
if (
  editorDomain &&
  !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(editorDomain)
)
  throw new Error(
    "EDITOR_DOMAIN must be a hostname, without a protocol or path.",
  );
if (
  certificateArn &&
  !/^arn:aws:acm:us-east-1:[0-9]{12}:certificate\/[a-f0-9-]+$/.test(
    certificateArn,
  )
)
  throw new Error("CloudFront requires an ACM certificate in us-east-1.");
if (
  !stack?.match(/^forma-[a-z0-9-]+$/) ||
  !bucket ||
  !role ||
  !process.env.AWS_REGION
)
  throw new Error(
    "Set FORMA_STACK (forma-*), ARTIFACT_BUCKET, CF_EXECUTION_ROLE and AWS_REGION.",
  );
const aws = (...args) =>
  execFileSync("aws", [...args, "--region", process.env.AWS_REGION], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
const identity = JSON.parse(aws("sts", "get-caller-identity"));
if (
  !/^\d{12}$/.test(process.env.AWS_ACCOUNT_ID || "") ||
  identity.Account !== process.env.AWS_ACCOUNT_ID ||
  role.split(":")[4] !== identity.Account ||
  (certificateArn && certificateArn.split(":")[4] !== identity.Account)
)
  throw new Error(
    "AWS_ACCOUNT_ID, the signed-in AWS account, execution role and editor certificate must match the intended account.",
  );
await writeFile(".build/package.json", '{"type":"module"}\n');
execFileSync(
  "zip",
  ["-qr", "function.zip", "lambda.js", "package.json", "images"],
  { cwd: ".build" },
);
const archive = await readFile(".build/function.zip");
const key = `${stack}/functions/${createHash("sha256").update(archive).digest("hex")}.zip`;
console.log(`Deploying ${stack} in ${process.env.AWS_REGION}`);
aws(
  "s3",
  "cp",
  ".build/function.zip",
  `s3://${bucket}/${key}`,
  "--only-show-errors",
);
// CloudFormation's inline template limit is 51,200 bytes. Keep the reviewable
// template formatted, deploy compact JSON, and support larger templates via S3.
const templateBody = JSON.stringify(
  JSON.parse(await readFile(".build/stack.json", "utf8")),
);
await writeFile(".build/stack-deploy.json", templateBody);
if (Buffer.byteLength(templateBody) <= 51200) {
  aws(
    "cloudformation",
    "validate-template",
    "--template-body",
    "file://.build/stack-deploy.json",
  );
} else {
  const templateKey = `${stack}/templates/${createHash("sha256").update(templateBody).digest("hex")}.json`;
  aws(
    "s3",
    "cp",
    ".build/stack-deploy.json",
    `s3://${bucket}/${templateKey}`,
    "--content-type",
    "application/json",
    "--only-show-errors",
  );
  aws(
    "cloudformation",
    "validate-template",
    "--template-url",
    `https://s3.${process.env.AWS_REGION}.amazonaws.com/${bucket}/${templateKey}`,
  );
}
aws(
  "cloudformation",
  "deploy",
  "--stack-name",
  stack,
  "--template-file",
  ".build/stack-deploy.json",
  "--s3-bucket",
  bucket,
  "--s3-prefix",
  `${stack}/templates`,
  "--role-arn",
  role,
  "--capabilities",
  "CAPABILITY_NAMED_IAM",
  "--no-fail-on-empty-changeset",
  "--parameter-overrides",
  `ArtifactBucket=${bucket}`,
  `ArtifactKey=${key}`,
  `EditorDomain=${editorDomain}`,
  `EditorCertificateArn=${certificateArn}`,
);
const described = JSON.parse(
  aws("cloudformation", "describe-stacks", "--stack-name", stack),
);
const out = Object.fromEntries(
  described.Stacks[0].Outputs.map((item) => [item.OutputKey, item.OutputValue]),
);
// Regenerate metadata with the actual editor origin; a fresh Vite shell prevents repeated prerender markup.
execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit",
});
execFileSync(process.execPath, ["scripts/build-pages.mjs"], {
  stdio: "inherit",
  env: { ...process.env, PUBLIC_SITE_URL: out.EditorUrl },
});
await writeFile(
  "dist/cloud-config.json",
  JSON.stringify({
    enabled: true,
    mode: "aws",
    apiUrl: out.ApiUrl,
    issuer: out.Issuer,
    clientId: out.ClientId,
    authDomain: out.AuthDomain,
  }),
);
// Hashed assets go first. Retain old assets so open tabs continue working during editor updates.
aws(
  "s3",
  "sync",
  "dist/",
  `s3://${out.EditorBucket}/`,
  "--exclude",
  "*.html",
  "--exclude",
  "cloud-config.json",
  "--exclude",
  "robots.txt",
  "--exclude",
  "sitemap.xml",
  "--cache-control",
  "public,max-age=31536000,immutable",
  "--only-show-errors",
);
aws(
  "s3",
  "cp",
  "dist/cloud-config.json",
  `s3://${out.EditorBucket}/cloud-config.json`,
  "--cache-control",
  "no-store",
  "--content-type",
  "application/json",
  "--only-show-errors",
);
aws(
  "s3",
  "sync",
  "dist/",
  `s3://${out.EditorBucket}/`,
  "--exclude",
  "*",
  "--include",
  "*.html",
  "--include",
  "robots.txt",
  "--include",
  "sitemap.xml",
  "--cache-control",
  "no-cache",
  "--only-show-errors",
);
// Refresh the branded pages and runtime config in one invalidation path. Site publishing does not invalidate.
aws(
  "cloudfront",
  "create-invalidation",
  "--distribution-id",
  out.EditorDistribution,
  "--paths",
  "/*",
);
await writeFile(
  ".build/deployment.json",
  JSON.stringify(
    { ...out, editorDomain, deployedAt: new Date().toISOString() },
    null,
    2,
  ),
);
console.log(`Waiting for editor CDN deployment: ${out.EditorDistribution}`);
aws(
  "cloudfront",
  "wait",
  "distribution-deployed",
  "--id",
  out.EditorDistribution,
);
const health = await fetch(`${out.ApiUrl}/health`, {
  signal: AbortSignal.timeout(15000),
});
if (!health.ok || !(await health.json()).ok)
  throw new Error("Deployed API health check failed.");
for (const path of [
  "/",
  "/templates",
  "/workspace",
  "/domains",
  "/cloud-config.json",
]) {
  const response = await fetch(`${out.EditorUrl}${path}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Live page check failed: ${path}. Check DNS and the editor certificate.`,
    );
}
const privateResponse = await fetch(`${out.ApiUrl}/sites`, {
  signal: AbortSignal.timeout(15000),
});
if (privateResponse.status !== 401)
  throw new Error("Unauthenticated site access did not fail closed.");
console.log(
  `Editor: ${out.EditorUrl}\nCreate invited users in Cognito pool: ${out.UserPoolId}\nCloud distribution propagation may take a few minutes.`,
);
await cp(".build/stack.json", ".build/deployed-stack.json");
