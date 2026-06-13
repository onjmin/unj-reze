import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || undefined;
  const posts = await db.getPosts(userId);
  return NextResponse.json(posts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { displayName, content, hasImage, imageSrc, imageAlt, avatarColor, gameId } = body;

  if (!displayName || !content) {
    return NextResponse.json(
      { error: 'displayName and content are required' },
      { status: 400 }
    );
  }

  const post = await db.createPost({ displayName, content, hasImage, imageSrc, imageAlt, avatarColor, gameId });
  return NextResponse.json(post, { status: 201 });
}
