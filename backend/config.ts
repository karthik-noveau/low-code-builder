import path from "node:path";

export const local = process.env.FORMA_MODE !== "aws";
if (!local && process.env.DYNAMODB_ENDPOINT)
  throw new Error("Custom DynamoDB endpoints are local-only.");
export const config = {
  table: process.env.TABLE_NAME || "forma-local",
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.DYNAMODB_ENDPOINT || "http://127.0.0.1:8008",
  data: path.resolve(process.env.FORMA_DATA_DIR || ".local/data"),
  draftsBucket: process.env.DRAFTS_BUCKET || "",
  sitesBucket: process.env.SITES_BUCKET || "",
  queueUrl: process.env.QUEUE_URL || "",
  stack: process.env.FORMA_STACK || "forma-local",
  domainRole: process.env.DOMAIN_EXECUTION_ROLE || "",
  siteBucketDomain: process.env.SITE_BUCKET_DOMAIN || "",
  originAccessId: process.env.ORIGIN_ACCESS_ID || "",
  routerArn: process.env.SITE_ROUTER_ARN || "",
  siteHeadersId: process.env.SITE_HEADERS_ID || "",
  kvsArn: process.env.KVS_ARN || "",
  siteOrigin: process.env.SITE_ORIGIN || "http://127.0.0.1:8788",
  editorOrigin: process.env.EDITOR_ORIGIN || "http://127.0.0.1:5178",
  apiOrigin: process.env.API_ORIGIN || "http://127.0.0.1:8787",
  maxSites: 10,
  maxCompressed: 3 * 1024 * 1024,
  maxExpanded: 20 * 1024 * 1024,
  keepReleases: 3,
  compilerVersion: 14,
  lockSeconds: 600,
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function insist(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export const isConditional = (error: unknown) =>
  error instanceof Error &&
  ["ConditionalCheckFailedException", "TransactionCanceledException"].includes(
    error.name,
  );
export const epoch = () => Math.floor(Date.now() / 1000);
export const idPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
