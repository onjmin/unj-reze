import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId, encodePost } from '@/lib/sqids';
import { attachEmbedInfo } from '@/lib/post-embeds';
import { resolveSessionUser } from '@/lib/auth/session-server';

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
  await attachEmbedInfo(post);
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

  await attachEmbedInfo(result);
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
  await attachEmbedInfo(result);
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
  const { content, originType, imageSrc, sessionId } = await request.json();
  // 所有者判定に使う身元は必ずセッションから取る。body の userId を信じると
  // display_name / slug はどちらも公開情報なので、他人の投稿を編集できてしまう。
  const user = await resolveSessionUser(request, sessionId);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }
  const result = await db.editPost(decodedId, user.displayName, content, originType, imageSrc);
  if (!result) {
    return NextResponse.json({ error: 'Post not found or not owned' }, { status: 404 });
  }
  await attachEmbedInfo(result);
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
  const { sessionId } = await request.json().catch(() => ({}));
  // 削除も同様にセッション本人のみ。body/クエリの userId は受け付けない。
  const user = await resolveSessionUser(request, sessionId);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const ok = await db.deletePost(decodedId, user.displayName);
  if (!ok) {
    return NextResponse.json({ error: 'Post not found or not owned' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
