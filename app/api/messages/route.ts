import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || undefined;
  const messages = await db.getMessages(userId);
  return NextResponse.json(messages);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sender, text, recipient } = body;

  if (!sender || !text || !recipient) {
    return NextResponse.json(
      { error: 'sender, recipient, and text are required' },
      { status: 400 }
    );
  }

  const message = await db.addMessage({ sender, text, recipient });
  return NextResponse.json(message, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { id, userId } = await request.json();
  if (id == null || !userId) {
    return NextResponse.json({ error: 'id and userId are required' }, { status: 400 });
  }
  const ok = await db.deleteMessage(Number(id), userId);
  if (!ok) return NextResponse.json({ error: 'Message not found or not owned' }, { status: 404 });
  return NextResponse.json({ success: true });
}
