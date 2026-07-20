import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DbPost } from '@/lib/types-db';
import { encodePost } from '@/lib/sqids';
import { attachGameInfo } from '@/lib/game-embed';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || undefined;
  const tab = url.searchParams.get('tab');

  const [posts, displayNameResult, avatarUrl, bio] = await Promise.all([
    tab === 'likes' && userId
      ? db.getLikedPosts(userId)
      : tab === 'dislikes' && userId
      ? db.getDislikedPosts(userId)
      : tab === 'hearts' && userId
      ? db.getHeartedPosts(userId)
      : db.getUserPostsBySlug(id, userId),
    db.getUserDisplayName(id),
    db.getUserAvatarUrl(id),
    db.getUserBio(id),
  ]);

  const displayName = displayNameResult || id;
  await attachGameInfo(posts);

  return NextResponse.json({
    id,
    displayName,
    avatarUrl,
    bio,
    posts: posts.map(encodePost),
    postCount: posts.length,
  });
}
