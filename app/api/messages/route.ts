import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET() {
  const messages = db.getMessages();
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

  const message = db.addMessage({ sender, text });
  return NextResponse.json(message, { status: 201 });
}
