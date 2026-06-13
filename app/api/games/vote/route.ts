import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function getIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

export async function POST(request: NextRequest) {
  const { gameId } = await request.json();
  const ip = getIp(request);
  await db.voteGame(Number(gameId), ip);
  return NextResponse.json({ ok: true });
}
