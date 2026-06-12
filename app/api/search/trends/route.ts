import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const trends = await db.getTrends();
  return NextResponse.json(trends);
}
