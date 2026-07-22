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

  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50) : 20;

  const [posts, displayNameResult, avatarUrl, bio] = await Promise.all([
    tab === 'likes' && userId
      ? db.getLikedPosts(userId, limit)
      : tab === 'dislikes' && userId
      ? db.getDislikedPosts(userId, limit)
      : tab === 'hearts' && userId
      ? db.getHeartedPosts(userId, limit)
      : db.getUserPostsBySlug(id, userId, limit),
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
