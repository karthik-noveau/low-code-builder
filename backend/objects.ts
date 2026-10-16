import { mkdir, readFile, writeFile, rm, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { config, local } from "./config";

const s3 = new S3Client({ region: config.region });
export type Bucket = "drafts" | "sites";
const bucketName = (bucket: Bucket) =>
  bucket === "drafts" ? config.draftsBucket : config.sitesBucket;
export function objectPath(bucket: Bucket, key: string) {
  if (
    !/^[a-zA-Z0-9/_\-.]+$/.test(key) ||
    key.split("/").some((p) => p === ".." || p === ".")
  )
    throw new Error("Invalid object key");
  return path.join(config.data, bucket, key);
}
export async function writeObject(
  bucket: Bucket,
  key: string,
  body: Buffer,
  contentType: string,
) {
  if (!local) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl:
          bucket === "sites" ? "public,max-age=31536000,immutable" : "no-store",
        ServerSideEncryption: "AES256",
      }),
    );
    return;
  }
  const file = objectPath(bucket, key);
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, body);
  await rename(temp, file);
}
export async function readObject(bucket: Bucket, key: string) {
  if (local) return readFile(objectPath(bucket, key));
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }),
  );
  if (!response.Body) throw new Error("Object has no body");
  return Buffer.from(await response.Body.transformToByteArray());
}
export async function deleteObject(bucket: Bucket, key: string) {
  if (local) await rm(objectPath(bucket, key), { force: true });
  else
    await s3.send(
      new DeleteObjectCommand({ Bucket: bucketName(bucket), Key: key }),
    );
}
