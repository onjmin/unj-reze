import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// 移行トークンの発行(過去の匿名アカウントを新セッションへ引き継ぐため)
export async function POST(request: NextRequest) {
  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  const token = await db.issueMigrationToken(userId);
  return NextResponse.json({ token });
}

// 移行トークンの引き換え(新セッションを既存アカウントに再バインド)
export async function PUT(request: NextRequest) {
  const { token, sessionId } = await request.json();
  if (!token || !sessionId) {
    return NextResponse.json({ error: 'token and sessionId are required' }, { status: 400 });
  }
  const user = await db.redeemMigrationToken(token, sessionId);
  if (!user) return NextResponse.json({ error: 'invalid or expired token' }, { status: 404 });

  const response = NextResponse.json(user);
  response.cookies.set('unj_reze_session', sessionId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
