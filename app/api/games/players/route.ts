import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId } from '@/lib/sqids';

export async function GET(request: NextRequest) {
  const gameIdRaw = request.nextUrl.searchParams.get('gameId');
  const gameId = gameIdRaw ? decodeId(gameIdRaw) : null;
  const sessionId = request.nextUrl.searchParams.get('sessionId') || '';
  if (gameId === null || !gameId) return NextResponse.json([]);
  const players = await db.getGamePlayers(gameId, sessionId);
  return NextResponse.json(players);
}

export async function POST(request: NextRequest) {
  const { gameId: gameIdRaw, sessionId, x, y, emoji } = await request.json();
  if (!gameIdRaw || !sessionId) return NextResponse.json({ ok: false }, { status: 400 });
  const gameId = decodeId(gameIdRaw);
  if (gameId === null) return NextResponse.json({ ok: false, error: 'Invalid gameId' }, { status: 400 });
  await db.updatePlayerPosition(sessionId, gameId, Number(x), Number(y), emoji || '🎮');
  return NextResponse.json({ ok: true });
}
