import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId, encodePost } from '@/lib/sqids';

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
  const { displayName, content, parentPostId } = body;

  if (!displayName || !content) {
    return NextResponse.json(
      { error: 'displayName and content are required' },
      { status: 400 }
    );
  }

  const decodedParentPostId = parentPostId ? decodeId(parentPostId) : undefined;
  if (parentPostId && decodedParentPostId === null) {
    return NextResponse.json({ error: 'Invalid parentPostId' }, { status: 400 });
  }

  const reply = await db.addReply(decodedId, { displayName, content, parentPostId: decodedParentPostId === null ? undefined : decodedParentPostId });
  if (!reply) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  return NextResponse.json(encodePost(reply), { status: 201 });
}
