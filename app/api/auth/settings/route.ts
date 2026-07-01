import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  const settings = await db.getUserSettings(slug);
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const { slug, settings } = await request.json();
  if (!slug || !settings) {
    return NextResponse.json({ error: 'slug and settings are required' }, { status: 400 });
  }
  await db.updateUserSettings(slug, settings);
  const updated = await db.getUserSettings(slug);
  return NextResponse.json(updated);
}
