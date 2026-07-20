import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { reporterSlug, targetType, targetId, reason } = await request.json();
  if (!reporterSlug || !targetType || !targetId) {
    return NextResponse.json({ error: 'reporterSlug, targetType and targetId are required' }, { status: 400 });
  }
  await db.reportContent({ reporterSlug, targetType, targetId, reason: reason || '' });
  return NextResponse.json({ success: true });
}
