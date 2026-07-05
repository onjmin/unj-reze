import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId') || undefined;
    const posts = await db.getPosts(userId);
    return NextResponse.json(posts);
  } catch (e) {
    console.error('[GET /api/posts]', e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { displayName, content, hasImage, imageSrc, imageAlt, avatarColor, gameId, isOriginal } = body;

    if (!displayName || !content) {
      return NextResponse.json(
        { error: 'displayName and content are required' },
        { status: 400 }
      );
    }

    const post = await db.createPost({ displayName, content, hasImage, imageSrc, imageAlt, avatarColor, gameId, isOriginal });
    return NextResponse.json(post, { status: 201 });
  } catch (e) {
    console.error('[POST /api/posts]', e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
