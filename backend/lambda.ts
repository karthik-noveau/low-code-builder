import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  SQSEvent,
} from "aws-lambda";
import { api } from "./api";
import { publishJob, recoverPublishedJob } from "./publisher";
import { failJob } from "./sites";
import { config, epoch, HttpError } from "./config";
import type { Job } from "./types";

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  // JWT authorizer verifies issuer, audience and scope; accept Cognito access tokens only.
  const owner =
    claims?.token_use === "access" && typeof claims.sub === "string"
      ? claims.sub
      : undefined;
  const response = await api({
    method: event.requestContext.http.method,
    path: event.rawPath,
    owner,
    body: Buffer.from(
      event.body || "",
      event.isBase64Encoded ? "base64" : "utf8",
    ),
    headers: event.headers,
  });
  return {
    statusCode: response.status,
    headers: response.headers,
    body: response.body.toString("base64"),
    isBase64Encoded: true,
  };
}
export async function worker(event: SQSEvent) {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    const job = JSON.parse(record.body) as Job;
    try {
      await publishJob(job);
    } catch (error) {
      console.error("publish_failed", {
        jobId: job.id,
        type: error instanceof Error ? error.name : "Unknown",
      });
      if (
        error instanceof HttpError ||
        Number(record.attributes.ApproximateReceiveCount) >= 3 ||
        epoch() - job.createdAt >= config.lockSeconds - 120
      ) {
        if (await recoverPublishedJob(job)) continue;
        await failJob(
          job,
          error instanceof HttpError
            ? error.message
            : "Publishing could not complete. Try again.",
        );
        if (error instanceof HttpError) continue;
      }
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}
