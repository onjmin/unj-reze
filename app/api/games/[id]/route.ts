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
