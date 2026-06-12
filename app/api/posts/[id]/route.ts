import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = await db.getPost(parseInt(id));
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }
  return NextResponse.json(post);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { action } = body;
  const postId = parseInt(id);

  let result;

  switch (action) {
    case 'like':
      result = await db.likePost(postId);
      break;
    case 'dislike':
      result = await db.dislikePost(postId);
      break;
    case 'repost':
      result = await db.repostPost(postId);
      break;
    default:
      return NextResponse.json(
        { error: 'action must be like, dislike, or repost' },
        { status: 400 }
      );
  }

  if (!result) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
