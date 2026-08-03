import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId } from '@/lib/sqids';
import { resolveSessionUser } from '@/lib/auth/session-server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  // 削除できるのはセッション本人の推しだけ（body の userSlug は受け付けない）
  const { sessionId } = await request.json().catch(() => ({}));
  const user = await resolveSessionUser(request, sessionId);
  if (!user?.slug) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await db.removeOshiItem(user.slug, decodedId);
  return NextResponse.json({ success: true });
}
