import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodeGame } from '@/lib/sqids';
import { resolveSessionUser } from '@/lib/auth/session-server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 30), 50) : 30;
  const games = await db.listAllGames(limit);
  return NextResponse.json(games.map(encodeGame));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { preset, title, manifest, sessionId } = body;

  if (!preset || !title || !manifest) {
    return NextResponse.json({ error: 'preset, title and manifest are required' }, { status: 400 });
  }

  // creatorSlug はセッション本人の slug を使う。body の creatorSlug は公開情報なので信用できない。
  const user = await resolveSessionUser(request, sessionId);
  const creatorSlug = user?.slug;

  const game = await db.createGame({ preset, title, manifest, creatorSlug });
  return NextResponse.json(encodeGame(game), { status: 201 });
}
