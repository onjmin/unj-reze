import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodePost } from '@/lib/sqids';
import { attachGameInfo } from '@/lib/game-embed';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  if (!q || !q.trim()) {
    return NextResponse.json({ error: 'query parameter q is required' }, { status: 400 });
  }
  const userId = url.searchParams.get('userId') || undefined;
  const posts = await db.searchPosts(q, userId);
  await attachGameInfo(posts);
  return NextResponse.json(posts.map(encodePost));
}
