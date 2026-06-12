import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const posts = await db.getUserPostsBySlug(id);
  const displayName = (await db.getUserDisplayName(id)) || id;

  return NextResponse.json({
    id,
    displayName,
    posts,
    postCount: posts.length,
  });
}
