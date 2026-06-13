import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function getIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

export async function GET(request: NextRequest) {
  const ip = getIp(request);
  const info = await db.getLiveGameInfo(ip);
  if (info.gameId) {
    const game = await db.getGame(info.gameId);
    return NextResponse.json({ ...info, manifest: game?.manifest ?? null });
  }
  return NextResponse.json({ ...info, manifest: null });
}
