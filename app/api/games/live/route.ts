import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodeId } from '@/lib/sqids';

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
  const manifest = info.gameId ? (await db.getGame(info.gameId))?.manifest ?? null : null;

  const encodedInfo = {
    ...info,
    gameId: info.gameId ? encodeId(info.gameId) : null,
    postId: info.postId ? encodeId(info.postId) : null,
    nextCandidates: info.nextCandidates.map(c => ({
      ...c,
      game: {
        ...c.game,
        id: encodeId(c.game.id)
      }
    })),
    manifest
  };

  return NextResponse.json(encodedInfo);
}
