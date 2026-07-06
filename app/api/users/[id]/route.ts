import { NextRequest, NextResponse } from 'next/server';
import { Post } from '@/lib/types';
import { db } from '@/lib/db';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || undefined;
  const tab = url.searchParams.get('tab');

  let posts: Post[];
  if (tab === 'likes' && userId) {
    posts = await db.getLikedPosts(userId);
  } else if (tab === 'dislikes' && userId) {
    posts = await db.getDislikedPosts(userId);
  } else if (tab === 'hearts' && userId) {
    posts = await db.getHeartedPosts(userId);
  } else {
    posts = await db.getUserPostsBySlug(id, userId);
  }

  const displayName = (await db.getUserDisplayName(id)) || id;

  return NextResponse.json({
    id,
    displayName,
    posts,
    postCount: posts.length,
  });
}
