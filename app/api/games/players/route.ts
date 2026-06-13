import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const gameId = Number(request.nextUrl.searchParams.get('gameId') || '0');
  const sessionId = request.nextUrl.searchParams.get('sessionId') || '';
  if (!gameId) return NextResponse.json([]);
  const players = await db.getGamePlayers(gameId, sessionId);
  return NextResponse.json(players);
}

export async function POST(request: NextRequest) {
  const { gameId, sessionId, x, y, emoji } = await request.json();
  if (!gameId || !sessionId) return NextResponse.json({ ok: false }, { status: 400 });
  await db.updatePlayerPosition(sessionId, Number(gameId), Number(x), Number(y), emoji || '🎮');
  return NextResponse.json({ ok: true });
}
