import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodeOshiItem } from '@/lib/sqids';
import { OshiItemKind } from '@/lib/types';
import { resolveSessionUser } from '@/lib/auth/session-server';

const VALID_KINDS: OshiItemKind[] = ['song', 'album', 'artist'];

export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  const items = await db.listOshiItems(slug);
  return NextResponse.json(items.map(encodeOshiItem));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { kind, trackId, collectionId, artistId, title, subtitle, artworkUrl, viewUrl, previewUrl, sessionId } = body;

  // 追加先は必ずセッション本人の推しリスト（body の userSlug は受け付けない）
  const user = await resolveSessionUser(request, sessionId);
  if (!user?.slug) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!kind || !title) {
    return NextResponse.json({ error: 'kind and title are required' }, { status: 400 });
  }
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
  }

  const item = await db.addOshiItem(user.slug, {
    kind,
    trackId: trackId ? Number(trackId) : undefined,
    collectionId: collectionId ? Number(collectionId) : undefined,
    artistId: artistId ? Number(artistId) : undefined,
    title,
    subtitle,
    artworkUrl,
    viewUrl,
    previewUrl,
  });
  return NextResponse.json(encodeOshiItem(item), { status: 201 });
}
