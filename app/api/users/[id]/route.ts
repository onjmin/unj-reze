import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DbPost } from '@/lib/types-db';
import { encodePost } from '@/lib/sqids';
import { attachGameInfo } from '@/lib/game-embed';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || undefined;
  const tab = url.searchParams.get('tab');

  let posts: DbPost[];
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
  await attachGameInfo(posts);

  return NextResponse.json({
    id,
    displayName,
    posts: posts.map(encodePost),
    postCount: posts.length,
  });
}
