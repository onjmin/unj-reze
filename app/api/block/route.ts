import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const blockerSlug = new URL(request.url).searchParams.get('blockerSlug');
  if (!blockerSlug) return NextResponse.json({ error: 'blockerSlug is required' }, { status: 400 });
  const blocked = await db.getBlockedSlugs(blockerSlug);
  return NextResponse.json({ blocked });
}

export async function POST(request: NextRequest) {
  const { blockerSlug, blockedSlug } = await request.json();
  if (!blockerSlug || !blockedSlug) return NextResponse.json({ error: 'blockerSlug and blockedSlug are required' }, { status: 400 });
  await db.blockUser(blockerSlug, blockedSlug);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { blockerSlug, blockedSlug } = await request.json();
  if (!blockerSlug || !blockedSlug) return NextResponse.json({ error: 'blockerSlug and blockedSlug are required' }, { status: 400 });
  await db.unblockUser(blockerSlug, blockedSlug);
  return NextResponse.json({ success: true });
}
