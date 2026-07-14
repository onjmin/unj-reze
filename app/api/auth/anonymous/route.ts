import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

  const user = await db.getOrCreateAnonymousUser(sessionId, ipAddress);

  const response = NextResponse.json(user);

  response.cookies.set('unj_reze_session', sessionId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { userId, displayName, avatarUrl, bio } = body;

  if (!userId || !displayName) {
    return NextResponse.json({ error: 'userId and displayName are required' }, { status: 400 });
  }

  await db.updateUserDisplayName(userId, displayName, avatarUrl, bio);

  return NextResponse.json({ success: true });
}
