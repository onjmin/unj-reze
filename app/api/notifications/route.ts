import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || undefined;
  if (url.searchParams.get('unread') === '1' && userId) {
    const count = await db.getUnreadCount(userId);
    return NextResponse.json({ count });
  }
  const notifications = await db.getNotifications(userId);
  return NextResponse.json(notifications);
}

export async function PATCH(request: NextRequest) {
  const { id, userId, all } = await request.json();
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  if (all) {
    await db.markAllNotificationsRead(userId);
  } else if (id != null) {
    await db.markNotificationRead(Number(id), userId);
  } else {
    return NextResponse.json({ error: 'id or all is required' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { id, userId } = await request.json();
  if (id == null || !userId) return NextResponse.json({ error: 'id and userId are required' }, { status: 400 });
  await db.deleteNotification(Number(id), userId);
  return NextResponse.json({ success: true });
}
