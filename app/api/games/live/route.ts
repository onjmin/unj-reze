import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodeId } from '@/lib/sqids';
import { getClientIp } from '@/lib/ip';

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers);
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
