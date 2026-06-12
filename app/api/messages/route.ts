import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const messages = await db.getMessages();
  return NextResponse.json(messages);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sender, text } = body;

  if (!sender || !text) {
    return NextResponse.json(
      { error: 'sender and text are required' },
      { status: 400 }
    );
  }

  const message = await db.addMessage({ sender, text });
  return NextResponse.json(message, { status: 201 });
}
