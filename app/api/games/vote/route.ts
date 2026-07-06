import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId } from '@/lib/sqids';

export const runtime = 'edge';

function getIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

export async function POST(request: NextRequest) {
  const { gameId: gameIdRaw } = await request.json();
  const gameId = decodeId(gameIdRaw);
  if (gameId === null) {
    return NextResponse.json({ error: 'Invalid gameId' }, { status: 400 });
  }
  const ip = getIp(request);
  await db.voteGame(gameId, ip);
  return NextResponse.json({ ok: true });
}
