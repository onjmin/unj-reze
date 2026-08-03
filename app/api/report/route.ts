import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveSessionUser } from '@/lib/auth/session-server';

// 通報者は必ずセッション本人。body の reporterSlug を信じると他人の名前で通報を捏造できる。
export async function POST(request: NextRequest) {
  const { targetType, targetId, reason, sessionId } = await request.json();
  const user = await resolveSessionUser(request, sessionId);
  if (!user?.slug) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'targetType and targetId are required' }, { status: 400 });
  }
  await db.reportContent({ reporterSlug: user.slug, targetType, targetId, reason: reason || '' });
  return NextResponse.json({ success: true });
}
