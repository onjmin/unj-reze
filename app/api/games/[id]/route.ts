import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await db.getGame(Number(id));
  if (!game) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(game);
}
