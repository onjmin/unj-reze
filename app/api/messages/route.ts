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

  if (!sender || !text) {
    return NextResponse.json(
      { error: 'sender and text are required' },
      { status: 400 }
    );
  }

  const message = await db.addMessage({ sender, text, recipient });
  return NextResponse.json(message, { status: 201 });
}
