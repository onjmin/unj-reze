import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  if (!q || !q.trim()) {
    return NextResponse.json({ error: 'query parameter q is required' }, { status: 400 });
  }
  const posts = await db.searchPosts(q);
  return NextResponse.json(posts);
}
