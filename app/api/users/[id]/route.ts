import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const posts = db.getUserPostsBySlug(id);
  const displayName = db.getUserDisplayName(id) || id;

  return NextResponse.json({
    id,
    displayName,
    posts,
    postCount: posts.length,
  });
}
