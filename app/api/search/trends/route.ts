import { NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET() {
  const trends = db.getTrends();
  return NextResponse.json(trends);
}
