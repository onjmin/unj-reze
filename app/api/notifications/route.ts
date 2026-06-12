import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const notifications = await db.getNotifications();
  return NextResponse.json(notifications);
}
