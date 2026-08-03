import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getClientIp } from '@/lib/ip';
import { resolveSessionUser } from '@/lib/auth/session-server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const ipAddress = getClientIp(request.headers);

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
  const { displayName, avatarUrl, bio, sessionId } = body;

  // 更新対象はセッションから決める。body の userId/slug は受け付けない
  // （どちらも公開情報なので、指定させると他人のプロフィールを書き換えられる）。
  const user = await resolveSessionUser(request, sessionId);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // displayName は任意。アイコンや自己紹介だけの更新で表示名を送らせると、
  // 画面表示用のラベル（例: 名無しWSG）がそのまま保存され、slug ごと変わってしまう。
  if (displayName === undefined && avatarUrl === undefined && bio === undefined) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  await db.updateUserDisplayName(user.id, displayName, avatarUrl, bio);

  return NextResponse.json({ success: true });
}
