import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const followerId = url.searchParams.get('followerId');
  const followedId = url.searchParams.get('followedId');

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
  const { followerId, followedId } = await request.json();
  if (!followerId || !followedId) {
    return NextResponse.json({ error: 'Missing followerId or followedId' }, { status: 400 });
  }
  await db.followUser(followerId, followedId);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { followerId, followedId } = await request.json();
  if (!followerId || !followedId) {
    return NextResponse.json({ error: 'Missing followerId or followedId' }, { status: 400 });
  }
  await db.unfollowUser(followerId, followedId);
  return NextResponse.json({ success: true });
}
