import { NextRequest, NextResponse } from 'next/server';

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

  try {
    const params = new URLSearchParams({ term, entity, limit, offset, country: 'JP', lang: 'ja_jp' });
    const res = await fetch(`https://itunes.apple.com/search?${params.toString()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ resultCount: 0, results: [] });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ resultCount: 0, results: [] });
  }
}
