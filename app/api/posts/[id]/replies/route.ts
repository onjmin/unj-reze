import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const replies = db.getReplies(parseInt(id));
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

  const reply = db.addReply(parseInt(id), { displayName, content });
  if (!reply) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  return NextResponse.json(reply, { status: 201 });
}
