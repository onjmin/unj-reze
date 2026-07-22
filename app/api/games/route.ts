import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodeGame } from '@/lib/sqids';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 30), 50) : 30;
  const games = await db.listAllGames(limit);
  return NextResponse.json(games.map(encodeGame));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { preset, title, manifest, creatorSlug } = body;

  if (!preset || !title || !manifest) {
    return NextResponse.json({ error: 'preset, title and manifest are required' }, { status: 400 });
  }

  const game = await db.createGame({ preset, title, manifest, creatorSlug });
  return NextResponse.json(encodeGame(game), { status: 201 });
}
