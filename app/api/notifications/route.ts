import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId, encodeNotification } from '@/lib/sqids';
import { withEdgeCache } from '@/lib/edge-cache';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || undefined;
  if (url.searchParams.get('unread') === '1' && userId) {
    const count = await db.getUnreadCount(userId);
    return NextResponse.json({ count });
  }
  // 通知は常に個人向けなので共有キャッシュには載せない（private のみ）。
  return await withEdgeCache(
    request,
    { sMaxAge: 10, personalized: true },
    async () => {
      const notifications = await db.getNotifications(userId);
      return NextResponse.json(notifications.map(encodeNotification));
    }
  );
}

export async function PATCH(request: NextRequest) {
  const { id, userId, all } = await request.json();
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  if (all) {
    await db.markAllNotificationsRead(userId);
  } else if (id != null) {
    const decodedId = decodeId(id);
    if (decodedId === null) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }
    await db.markNotificationRead(decodedId, userId);
  } else {
    return NextResponse.json({ error: 'id or all is required' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { id, userId } = await request.json();
  if (id == null || !userId) return NextResponse.json({ error: 'id and userId are required' }, { status: 400 });
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  await db.deleteNotification(decodedId, userId);
  return NextResponse.json({ success: true });
}
