// Storage helpers (S3-compatible object storage via self-hosted MinIO)

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from './_core/env';

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  if (!ENV.minioRootUser || !ENV.minioRootPassword) {
    throw new Error(
      "Storage credentials missing: set MINIO_ROOT_USER and MINIO_ROOT_PASSWORD"
    );
  }
  client = new S3Client({
    endpoint: ENV.minioEndpoint,
    region: "us-east-1", // MinIO ignores region but the SDK requires one
    forcePathStyle: true, // required for MinIO (virtual-hosted-style buckets don't apply)
    credentials: {
      accessKeyId: ENV.minioRootUser,
      secretAccessKey: ENV.minioRootPassword,
    },
  });
  return client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

// Callers persist the returned `url` and, in most call sites in this codebase,
// reuse that stored value directly rather than re-deriving a fresh URL from
// `key` via storageGet() at view time. Since the bucket is private, use the
// longest expiry AWS SigV4 presigned URLs allow (7 days) so links stay valid
// for a reasonable review window. Callers that need a link to work beyond
// that should call storageGet(key) again to mint a fresh one.
const PRESIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  await getClient().send(
    new PutObjectCommand({
      Bucket: ENV.minioBucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    })
  );
  const url = await getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: ENV.minioBucket, Key: key }),
    { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS }
  );
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const url = await getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: ENV.minioBucket, Key: key }),
    { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS }
  );
  return { key, url };
}
