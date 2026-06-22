import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = './public/uploads';

function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export async function uploadImage(
  base64Data: string,
  filename?: string,
): Promise<string> {
  const ext = (base64Data.match(/^data:image\/(\w+)/) || [])[1] || 'png';
  const extMap: Record<string, string> = { 'jpeg': 'jpg', 'jpg': 'jpg', 'png': 'png', 'gif': 'gif', 'webp': 'webp' };
  const safeExt = extMap[ext] || 'png';
  const key = filename || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

  const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buffer = Buffer.from(base64, 'base64');

  ensureDir();
  fs.writeFileSync(path.join(UPLOADS_DIR, key), buffer);

  return `/uploads/${key}`;
}

export async function deleteImage(url: string): Promise<void> {
  if (!url.startsWith('/uploads/')) return;
  const key = url.replace('/uploads/', '');
  const filePath = path.join(UPLOADS_DIR, key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export async function getImageBuffer(url: string): Promise<Buffer | null> {
  if (!url.startsWith('/uploads/')) return null;
  const key = url.replace('/uploads/', '');
  const filePath = path.join(UPLOADS_DIR, key);
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

export const s3Storage = { uploadImage, deleteImage, getImageBuffer };
