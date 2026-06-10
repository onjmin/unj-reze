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
  const { name, content } = body;

  if (!name || !content) {
    return NextResponse.json(
      { error: 'name and content are required' },
      { status: 400 }
    );
  }

  const reply = db.addReply(parseInt(id), { name, content });
  if (!reply) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  return NextResponse.json(reply, { status: 201 });
}
