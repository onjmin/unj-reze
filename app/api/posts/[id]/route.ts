import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = db.getPost(parseInt(id));
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

  let result: ReturnType<typeof db.likePost> = null;

  switch (action) {
    case 'like':
      result = db.likePost(postId);
      break;
    case 'dislike':
      result = db.dislikePost(postId);
      break;
    case 'repost':
      result = db.repostPost(postId);
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
