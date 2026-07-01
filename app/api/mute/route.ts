import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const muterSlug = new URL(request.url).searchParams.get('muterSlug');
  if (!muterSlug) return NextResponse.json({ error: 'muterSlug is required' }, { status: 400 });
  const muted = await db.getMutedSlugs(muterSlug);
  return NextResponse.json({ muted });
}

export async function POST(request: NextRequest) {
  const { muterSlug, mutedSlug } = await request.json();
  if (!muterSlug || !mutedSlug) return NextResponse.json({ error: 'muterSlug and mutedSlug are required' }, { status: 400 });
  await db.muteUser(muterSlug, mutedSlug);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { muterSlug, mutedSlug } = await request.json();
  if (!muterSlug || !mutedSlug) return NextResponse.json({ error: 'muterSlug and mutedSlug are required' }, { status: 400 });
  await db.unmuteUser(muterSlug, mutedSlug);
  return NextResponse.json({ success: true });
}
