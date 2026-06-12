import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || undefined;
  const posts = await db.getUserPostsBySlug(id, userId);
  const displayName = (await db.getUserDisplayName(id)) || id;

  return NextResponse.json({
    id,
    displayName,
    posts,
    postCount: posts.length,
  });
}
