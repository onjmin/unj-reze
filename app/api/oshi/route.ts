import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodeOshiItem } from '@/lib/sqids';
import { OshiItemKind } from '@/lib/types';

export const runtime = 'edge';

const VALID_KINDS: OshiItemKind[] = ['song', 'album', 'artist'];

export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  const items = await db.listOshiItems(slug);
  return NextResponse.json(items.map(encodeOshiItem));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userSlug, kind, trackId, collectionId, artistId, title, subtitle, artworkUrl, viewUrl } = body;

  if (!userSlug || !kind || !title) {
    return NextResponse.json({ error: 'userSlug, kind and title are required' }, { status: 400 });
  }
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
  }

  const item = await db.addOshiItem(userSlug, {
    kind,
    trackId: trackId ? Number(trackId) : undefined,
    collectionId: collectionId ? Number(collectionId) : undefined,
    artistId: artistId ? Number(artistId) : undefined,
    title,
    subtitle,
    artworkUrl,
    viewUrl,
  });
  return NextResponse.json(encodeOshiItem(item), { status: 201 });
}
