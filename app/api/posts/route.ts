import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET() {
  const posts = db.getPosts();
  return NextResponse.json(posts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { displayName, content, hasImage, imageSrc, imageAlt, avatarColor } = body;

  if (!displayName || !content) {
    return NextResponse.json(
      { error: 'displayName and content are required' },
      { status: 400 }
    );
  }

  const post = db.createPost({ displayName, content, hasImage, imageSrc, imageAlt, avatarColor });
  return NextResponse.json(post, { status: 201 });
}
