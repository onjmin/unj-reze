import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { preset, title, manifest } = body;

  if (!preset || !title || !manifest) {
    return NextResponse.json({ error: 'preset, title and manifest are required' }, { status: 400 });
  }

  const game = await db.createGame({ preset, title, manifest });
  return NextResponse.json(game, { status: 201 });
}
