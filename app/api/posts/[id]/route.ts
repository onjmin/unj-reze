import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId, encodePost } from '@/lib/sqids';
import { attachGameInfo } from '@/lib/game-embed';

export const runtime = 'edge';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const url = new URL(_request.url);
  const userId = url.searchParams.get('userId') || undefined;
  const post = await db.getPost(decodedId, userId);
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }
  await attachGameInfo(post);
  return NextResponse.json(encodePost(post));
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const body = await request.json();
  const { action, userId } = body;

  let result;

  switch (action) {
    case 'like':
      result = await db.likePost(decodedId, userId || '');
      break;
    case 'dislike':
      result = await db.dislikePost(decodedId, userId || '');
      break;
    case 'repost':
      result = await db.repostPost(decodedId);
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

  await attachGameInfo(result);
  return NextResponse.json(encodePost(result));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const body = await request.json();
  const { userId, count = 1 } = body;

  const result = await db.heartPost(decodedId, userId || '', count);
  if (!result) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }
  await attachGameInfo(result);
  return NextResponse.json(encodePost(result));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const { userId, content, originType } = await request.json();
  if (!userId || typeof content !== 'string') {
    return NextResponse.json({ error: 'userId and content are required' }, { status: 400 });
  }
  const result = await db.editPost(decodedId, userId, content, originType);
  if (!result) {
    return NextResponse.json({ error: 'Post not found or not owned' }, { status: 404 });
  }
  return NextResponse.json(encodePost(result));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const { userId } = await request.json().catch(() => ({}));
  const url = new URL(request.url);
  const uid = userId || url.searchParams.get('userId');
  if (!uid) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }
  const ok = await db.deletePost(decodedId, uid);
  if (!ok) {
    return NextResponse.json({ error: 'Post not found or not owned' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
