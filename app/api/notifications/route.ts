import { NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET() {
  const notifications = db.getNotifications();
  return NextResponse.json(notifications);
}
