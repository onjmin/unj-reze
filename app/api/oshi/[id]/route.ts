import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId } from '@/lib/sqids';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const { userSlug } = await request.json();
  if (!userSlug) {
    return NextResponse.json({ error: 'userSlug is required' }, { status: 400 });
  }
  await db.removeOshiItem(userSlug, decodedId);
  return NextResponse.json({ success: true });
}
