import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveSessionUser } from '@/lib/auth/session-server';

export async function GET(request: NextRequest) {
  const muterSlug = new URL(request.url).searchParams.get('muterSlug');
  if (!muterSlug) return NextResponse.json({ error: 'muterSlug is required' }, { status: 400 });
  const muted = await db.getMutedSlugs(muterSlug);
  return NextResponse.json({ muted });
}

// ミュートする側は必ずセッション本人（body の muterSlug は公開情報なので受け付けない）
export async function POST(request: NextRequest) {
  const { mutedSlug, sessionId } = await request.json();
  const user = await resolveSessionUser(request, sessionId);
  if (!user?.slug) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!mutedSlug) return NextResponse.json({ error: 'mutedSlug is required' }, { status: 400 });
  await db.muteUser(user.slug, mutedSlug);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { mutedSlug, sessionId } = await request.json();
  const user = await resolveSessionUser(request, sessionId);
  if (!user?.slug) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!mutedSlug) return NextResponse.json({ error: 'mutedSlug is required' }, { status: 400 });
  await db.unmuteUser(user.slug, mutedSlug);
  return NextResponse.json({ success: true });
}
