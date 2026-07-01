// Cloudflare R2 implementation using S3-compatible API
// Requires: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

function getClient() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function bucket() {
  return process.env.R2_BUCKET!;
}

function publicUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return `${base}/${key}`;
}

function keyFromUrl(url: string): string | null {
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!url.startsWith(base + '/')) return null;
  return url.slice(base.length + 1);
}

export async function uploadImage(base64Data: string, filename?: string): Promise<string> {
  const ext = (base64Data.match(/^data:image\/(\w+)/) || [])[1] || 'png';
  const extMap: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp' };
  const safeExt = extMap[ext] || 'png';
  const key = filename || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

  const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buffer = Buffer.from(base64, 'base64');

  await getClient().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: buffer,
    ContentType: `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`,
  }));

  return publicUrl(key);
}

export async function deleteImage(url: string): Promise<void> {
  const key = keyFromUrl(url);
  if (!key) return;
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function getImageBuffer(url: string): Promise<Buffer | null> {
  const key = keyFromUrl(url);
  if (!key) return null;
  try {
    const res = await getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!res.Body) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

export const r2Storage = { uploadImage, deleteImage, getImageBuffer };
