import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET() {
  const posts = db.getPosts();
  return NextResponse.json(posts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, content, hasImage, imageSrc, imageAlt, avatarColor } = body;

  if (!name || !content) {
    return NextResponse.json(
      { error: 'name and content are required' },
      { status: 400 }
    );
  }

  const post = db.createPost({ name, content, hasImage, imageSrc, imageAlt, avatarColor });
  return NextResponse.json(post, { status: 201 });
}
