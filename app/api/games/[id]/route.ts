import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId, encodeGame } from '@/lib/sqids';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const game = await db.getGame(decodedId);
  if (!game) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(encodeGame(game));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const body = await request.json();
  const { title, manifest, userSlug } = body;
  if (!title || !manifest) {
    return NextResponse.json({ error: 'title and manifest are required' }, { status: 400 });
  }

  const game = await db.getGame(decodedId);
  if (!game) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!game.creatorSlug || game.creatorSlug !== userSlug) {
    return NextResponse.json({ error: 'Only the creator can edit this game' }, { status: 403 });
  }

  const updated = await db.updateGame(decodedId, { title, manifest });
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(encodeGame(updated));
}
