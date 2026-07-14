import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const VALID_ENTITIES = ['song', 'album', 'musicArtist'];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const term = url.searchParams.get('term');
  const entity = url.searchParams.get('entity') || 'song';
  const limit = url.searchParams.get('limit') || '25';
  const offset = url.searchParams.get('offset') || '0';

  if (!term) {
    return NextResponse.json({ error: 'term is required' }, { status: 400 });
  }
  if (!VALID_ENTITIES.includes(entity)) {
    return NextResponse.json({ error: 'invalid entity' }, { status: 400 });
  }

  const params = new URLSearchParams({ term, entity, limit, offset, country: 'jp' });
  const res = await fetch(`https://itunes.apple.com/search?${params.toString()}`);
  if (!res.ok) {
    return NextResponse.json({ error: 'Apple Music search failed' }, { status: 502 });
  }
  const data = await res.json();
  return NextResponse.json(data);
}
