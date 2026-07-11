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
  const userId = new URL(_request.url).searchParams.get('userId') || undefined;
  const replies = await db.getReplies(decodedId, userId);
  await attachGameInfo(replies);
  return NextResponse.json(replies.map(encodePost));
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
  const { displayName, content, parentPostId, hasImage, imageSrc, imageAlt, avatarColor, gameId, originType } = body;

  if (!displayName) {
    return NextResponse.json(
      { error: 'displayName is required' },
      { status: 400 }
    );
  }

  if (!content && !hasImage && !gameId) {
    return NextResponse.json(
      { error: 'content, image, or game is required' },
      { status: 400 }
    );
  }

  const decodedParentPostId = parentPostId ? decodeId(parentPostId) : undefined;
  if (parentPostId && decodedParentPostId === null) {
    return NextResponse.json({ error: 'Invalid parentPostId' }, { status: 400 });
  }

  const reply = await db.addReply(decodedId, {
    displayName,
    content: content || '',
    parentPostId: decodedParentPostId === null ? undefined : decodedParentPostId,
    hasImage,
    imageSrc,
    imageAlt,
    avatarColor,
    gameId: gameId ? Number(gameId) : undefined,
    originType,
  });
  if (!reply) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  await attachGameInfo(reply);
  return NextResponse.json(encodePost(reply), { status: 201 });
}
