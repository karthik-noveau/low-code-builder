import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { editorCertificateTemplate } from "./editor-domain.mjs";
await mkdir(".build", { recursive: true });
await build({
  entryPoints: ["backend/domain-template.ts"],
  outfile: ".build/domain-template.mjs",
  platform: "node",
  format: "esm",
  bundle: true,
});
const { domainTemplate } = await import(
  pathToFileURL(resolve(".build/domain-template.mjs")).href
);
await writeFile(
  ".build/domain-stack.json",
  JSON.stringify(
    domainTemplate({
      hostname: "www.example.com",
      bucketDomain: "forma-sites.s3.us-east-1.amazonaws.com",
      originAccessId: "EXAMPLEOAC123",
      routerArn:
        "arn:aws:cloudfront::123456789012:function/forma-example-router",
      headersPolicyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      stack: "forma-example",
    }),
    null,
    2,
  ),
);
await writeFile(
  ".build/editor-certificate.json",
  JSON.stringify(editorCertificateTemplate("builder.example.com"), null, 2),
);
console.log(
  "Generated domain and editor certificate examples for local validation only.",
);
