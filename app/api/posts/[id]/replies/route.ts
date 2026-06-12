import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const replies = await db.getReplies(parseInt(id));
  return NextResponse.json(replies);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { displayName, content } = body;

  if (!displayName || !content) {
    return NextResponse.json(
      { error: 'displayName and content are required' },
      { status: 400 }
    );
  }

  const reply = await db.addReply(parseInt(id), { displayName, content });
  if (!reply) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  return NextResponse.json(reply, { status: 201 });
}
