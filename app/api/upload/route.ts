import { NextRequest, NextResponse } from 'next/server';
import { s3Storage } from '@/lib/storage/s3';

export async function POST(request: NextRequest) {
  try {
    const { image, filename } = await request.json();

    if (!image) {
      return NextResponse.json({ error: 'image is required' }, { status: 400 });
    }

    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'invalid image format' }, { status: 400 });
    }

    const url = await s3Storage.uploadImage(image, filename);
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: 'upload failed' }, { status: 500 });
  }
}
