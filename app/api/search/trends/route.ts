import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'edge';

export async function GET() {
  const trends = await db.getTrends();
  return NextResponse.json(trends);
}
