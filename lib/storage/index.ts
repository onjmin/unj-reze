import { r2Storage } from './r2';
import { s3Storage } from './s3';

function getStorage() {
  if (process.env.STORAGE_PROVIDER === 'r2') {
    return r2Storage;
  }
  return s3Storage;
}

export async function uploadImage(base64Data: string, filename?: string): Promise<string> {
  const storage = getStorage();
  if (!storage || typeof storage.uploadImage !== 'function') {
    throw new Error(`Storage provider '${process.env.STORAGE_PROVIDER || 'local'}' is unavailable`);
  }
  return storage.uploadImage(base64Data, filename);
}

export async function deleteImage(url: string): Promise<void> {
  const storage = getStorage();
  if (storage && typeof storage.deleteImage === 'function') {
    return storage.deleteImage(url);
  }
}

export async function getImageBuffer(url: string): Promise<Buffer | null> {
  const storage = getStorage();
  if (storage && typeof storage.getImageBuffer === 'function') {
    return storage.getImageBuffer(url);
  }
  return null;
}
