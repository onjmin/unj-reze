import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { publishRealtime } from '@/lib/realtime/publish';
import { chUser } from '@/lib/realtime/channels';
import { rejectDmReason } from '@/lib/dm-rules';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || undefined;
  const partner = url.searchParams.get('partner') || undefined;

  // 1対1スレッド表示。受信箱(全件)ではなくこの相手との往復だけを返す。
  if (userId && partner) {
    const [messages, gate] = await Promise.all([
      db.getConversation(userId, partner, 100),
      db.getDmGate(userId, partner),
    ]);
    return NextResponse.json({ messages, gate });
  }

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

  // 初回DM制限はクライアント表示だけでは意味がない（DMスパムの導線そのもの）ので
  // ここで必ず判定する。判定ロジックは lib/dm-rules.ts でクライアントと共有している。
  const gate = await db.getDmGate(sender, recipient);
  const rejection = rejectDmReason(gate, text);
  if (rejection) {
    return NextResponse.json({ error: rejection }, { status: 403 });
  }

  const message = await db.addMessage({ sender, text, recipient });

  // Koyeb Realtime WS ハブ経由で送信先および送信元に即時プッシュ配信
  publishRealtime([
    { channel: chUser(recipient), event: 'message.created', data: message },
    { channel: chUser(sender), event: 'message.created', data: message },
  ]);

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
