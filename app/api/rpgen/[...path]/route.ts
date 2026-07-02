import { NextRequest, NextResponse } from 'next/server';

// RPGen Search（https://rpgen-search.pages.dev）への薄いサーバープロキシ。
//
// 2系統を扱う:
//   /api/rpgen/<endpoint>?...     → 上流 /api/<endpoint>     検索JSON。認証トークンを付与。
//   /api/rpgen/data/<path...>     → 上流 /data/<path...>     画像/音声の実体。
//
// 画像/音声を「自前オリジン経由」にすることで:
//   - 上流CDNがCORSヘッダを返さない /data/* でも crossOrigin 画像が安全に読める。
//   - ゲームcanvasが tainted にならず、書き出し（toDataURL等）も可能になる。
//
// 参照: tmp/asset_collect_guide.md, rpgen-crawler/deploy/api

const ORIGIN = 'https://rpgen-search.pages.dev';
const AUTH_TOKEN = process.env.RPGEN_SEARCH_TOKEN || 'user:admin';

// 許可するトップレベルAPI（プロキシ濫用防止の allowlist）。
const ALLOWED_API = new Set(['sprites', 'sprite-anims', 'sheets', 'sounds', 'maps']);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!path?.length) {
    return NextResponse.json({ error: 'missing path' }, { status: 404 });
  }

  const isData = path[0] === 'data';
  if (!isData && !ALLOWED_API.has(path[0])) {
    return NextResponse.json({ error: 'unknown rpgen endpoint' }, { status: 404 });
  }

  const search = new URL(request.url).search;
  const joined = path.map(encodeURIComponent).join('/');
  const upstreamUrl = isData
    ? `${ORIGIN}/${joined}${search}`
    : `${ORIGIN}/api/${joined}${search}`;

  const clientReferer = request.headers.get('referer') ?? request.headers.get('origin') ?? '';

  try {
    const res = await fetch(upstreamUrl, {
      headers: isData ? {} : {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        Origin: request.headers.get('origin') ?? '',
        Referer: clientReferer,
        'User-Agent': request.headers.get('user-agent') ?? 'Mozilla/5.0',
      },
      next: { revalidate: isData ? 86400 : 300 },
    });

    if (isData) {
      // バイナリ（画像/音声）はそのままストリームで返す。
      const headers = new Headers();
      headers.set('Content-Type', res.headers.get('Content-Type') ?? 'application/octet-stream');
      headers.set('Cache-Control', 'public, max-age=86400, immutable');
      return new NextResponse(res.body, { status: res.status, headers });
    }

    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'rpgen upstream unreachable' }, { status: 502 });
  }
}
