import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodePost } from '@/lib/sqids';
import { attachEmbedInfo } from '@/lib/post-embeds';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  if (!q || !q.trim()) {
    return NextResponse.json({ error: 'query parameter q is required' }, { status: 400 });
  }
  const userId = url.searchParams.get('userId') || undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50) : 20;
  const posts = await db.searchPosts(q, userId, limit);
  await attachEmbedInfo(posts);
  return NextResponse.json(posts.map(encodePost));
}
