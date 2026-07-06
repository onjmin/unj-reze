import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodePost } from '@/lib/sqids';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  const { tag } = await params;
  const userId = new URL(request.url).searchParams.get('userId') || undefined;
  const decoded = decodeURIComponent(tag);
  const posts = await db.getPostsByHashtag(decoded, userId);
  return NextResponse.json(posts.map(encodePost));
}
