/**
 * S3 Storage Service — Document upload for KYB and merchant products.
 *
 * In production: Uses AWS S3 with pre-signed URLs.
 * In development: Falls back to local file system storage.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const S3_BUCKET = process.env.S3_BUCKET ?? "tourismpay-documents";
const S3_REGION = process.env.S3_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const LOCAL_UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR ?? "/tmp/tourismpay-uploads";

let _s3: S3Client | null = null;

function getS3(): S3Client | null {
  if (_s3) return _s3;
  // Only create S3 client if credentials are configured
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    _s3 = new S3Client({ region: S3_REGION });
    return _s3;
  }
  return null;
}

/**
 * Upload a file to storage. Returns the URL where it can be accessed.
 *
 * @param key - Storage key (path), e.g. "kyb-documents/user123/passport.pdf"
 * @param body - File content as Buffer
 * @param contentType - MIME type
 */
export async function storagePut(
  key: string,
  body: Buffer,
  contentType: string = "application/octet-stream"
): Promise<{ url: string; key: string }> {
  const s3 = getS3();

  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      })
    );
    const url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
    return { url, key };
  }

  // Local fallback for development
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
  return { url: `/uploads/${key}`, key };
}

/**
 * Generate a pre-signed upload URL (for direct browser uploads).
 */
export async function storagePresignPut(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<{ uploadUrl: string; key: string }> {
  const s3 = getS3();

  if (s3) {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn });
    return { uploadUrl, key };
  }

  // Local fallback: return a placeholder upload endpoint
  return { uploadUrl: `/api/dev/upload?key=${encodeURIComponent(key)}`, key };
}

/**
 * Generate a pre-signed download URL.
 */
export async function storagePresignGet(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const s3 = getS3();

  if (s3) {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    return getSignedUrl(s3, command, { expiresIn });
  }

  return `/uploads/${key}`;
}

/**
 * Delete a file from storage.
 */
export async function storageDelete(key: string): Promise<void> {
  const s3 = getS3();

  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return;
  }

  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  try {
    await fs.unlink(filePath);
  } catch {
    // File might not exist — ignore
  }
}

/**
 * Generate a unique storage key for a document.
 */
export function generateDocumentKey(prefix: string, originalName: string): string {
  const ext = path.extname(originalName) || ".bin";
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}/${Date.now()}-${suffix}${ext}`;
}
