// STORAGE_PROVIDER=local (default) | r2

async function getStorage() {
  if (process.env.STORAGE_PROVIDER === 'r2') {
    return (await import('./r2')).r2Storage;
  }
  return (await import('./s3')).s3Storage;
}

export async function uploadImage(base64Data: string, filename?: string): Promise<string> {
  return (await getStorage()).uploadImage(base64Data, filename);
}

export async function deleteImage(url: string): Promise<void> {
  return (await getStorage()).deleteImage(url);
}

export async function getImageBuffer(url: string): Promise<Buffer | null> {
  return (await getStorage()).getImageBuffer(url);
}
