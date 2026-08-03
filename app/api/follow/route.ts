import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveSessionUser } from '@/lib/auth/session-server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const followerId = url.searchParams.get('followerId');
  const followedId = url.searchParams.get('followedId');
  const list = url.searchParams.get('list');
  const viewerId = url.searchParams.get('viewerId') || undefined;

  // フォロワー / フォロー一覧（プロフィールのカウントをタップして開くシート）
  if (userId && (list === 'followers' || list === 'following')) {
    const users = list === 'followers'
      ? await db.getFollowers(userId, viewerId, 100)
      : await db.getFollowing(userId, viewerId, 100);
    return NextResponse.json({ users });
  }

  if (userId) {
    const counts = await db.getFollowCounts(userId);
    return NextResponse.json(counts);
  }

  if (followerId && followedId) {
    const isFollowing = await db.isFollowing(followerId, followedId);
    return NextResponse.json({ isFollowing });
  }

  return NextResponse.json({ error: 'Missing userId or followerId/followedId' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const { followedId, sessionId } = await request.json();
  if (!followedId) {
    return NextResponse.json({ error: 'Missing followedId' }, { status: 400 });
  }
  // フォローする側は必ずセッション本人。body の followerId は公開情報なので信用できない。
  const user = await resolveSessionUser(request, sessionId);
  if (!user?.slug) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await db.followUser(user.slug, followedId);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { followedId, sessionId } = await request.json();
  if (!followedId) {
    return NextResponse.json({ error: 'Missing followedId' }, { status: 400 });
  }
  // アンフォローする側も同様にセッション本人。
  const user = await resolveSessionUser(request, sessionId);
  if (!user?.slug) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await db.unfollowUser(user.slug, followedId);
  return NextResponse.json({ success: true });
}
