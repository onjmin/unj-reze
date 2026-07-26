import { NextRequest, NextResponse } from 'next/server';
import { getCountryFromHeaders, isBlockedCountry } from '@/lib/geo';
import { kvGet, kvSetEx } from '@/lib/kv';
import { getClientIp } from '@/lib/ip';
import {
  assessTls,
  isBotUserAgent,
  readTlsSignalsFromCf,
  tlsSignalsToHeaderEntries,
  EMPTY_TLS_SIGNALS,
  type CfTlsProperties,
  type TlsSignals,
} from '@/lib/security/tls';

// Next.js 16: middleware は proxy に改称。
// 注意: next.config.ts が output:"export"(GitHub Pages)の場合 proxy は動作しない。
// EU遮断・レートリミットは Netlify/Cloudflare 等のサーバー配備でのみ有効。

// ── レートリミット設定 ──
const RATE_LIMIT_WINDOW_SEC = 10;
const RATE_LIMIT_MAX = 30; // 1ウィンドウ(10s)あたりの書き込み上限 / IP
// TLSハンドシェイクがブラウザのものではないと判定された場合の上限。
// ブロックはせず「予算を絞る」に留める(誤検知時の被害を限定するため)。
const RATE_LIMIT_MAX_NON_BROWSER = 5;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function isRateLimited(ip: string, max: number): Promise<{ limited: boolean; retryAfter: number }> {
  const windowIndex = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SEC * 1000));
  const key = `ratelimit:${ip}:${windowIndex}`;
  let count = 0;
  try {
    count = parseInt((await kvGet(key)) || '0', 10);
    // TTL を毎回リフレッシュ(ウィンドウ index でキーが自然にローテートする)
    await kvSetEx(key, String(count + 1), RATE_LIMIT_WINDOW_SEC * 2);
  } catch {
    // KV 障害時はレート制限を無効化(可用性優先)
    return { limited: false, retryAfter: 0 };
  }
  const nextWindowStart = (windowIndex + 1) * RATE_LIMIT_WINDOW_SEC * 1000;
  const retryAfter = Math.max(1, Math.ceil((nextWindowStart - Date.now()) / 1000));
  return { limited: count + 1 > max, retryAfter };
}

/** Cloudflare Workers 上でのみ request.cf が取れる。
 * `next dev`(workerd 外)や静的エクスポートでは取得できないため、その場合は空シグナルに倒す。 */
async function getTlsSignals(): Promise<TlsSignals> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { cf } = await getCloudflareContext({ async: true });
    return readTlsSignalsFromCf(cf as CfTlsProperties | undefined);
  } catch {
    return EMPTY_TLS_SIGNALS;
  }
}

const BLOCKED_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>451 Unavailable For Legal Reasons</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0e14;color:#e5e7eb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  .card{max-width:520px;padding:40px 28px;text-align:center}
  h1{font-size:22px;margin:0 0 12px}
  p{font-size:14px;line-height:1.8;color:#9ca3af;margin:6px 0}
  .code{font-size:64px;font-weight:800;color:#374151;margin-bottom:8px}
</style></head>
<body><div class="card">
  <div class="code">451</div>
  <h1>ご利用いただけません</h1>
  <p>法的な理由（GDPR）により、欧州連合（EU）および欧州経済領域（EEA）からのアクセスを制限しています。</p>
  <p>Access from the EU / EEA is restricted for legal reasons.</p>
</div></body></html>`;

export const runtime = "experimental-edge";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // EU/EEA からのアクセスを 451 で遮断
  const country = getCountryFromHeaders(request.headers);
  if (isBlockedCountry(country)) {
    return new NextResponse(BLOCKED_HTML, {
      status: 451,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // TLSを終端しているのは自分自身(Cloudflare Workers)なので、ここで直接ハンドシェイク情報を読む。
  const tls = await getTlsSignals();

  // API の書き込みメソッドにレートリミット。
  // ブラウザを名乗りながらTLSハンドシェイクが一致しない相手は書き込み予算を絞る。
  if (pathname.startsWith('/api/') && WRITE_METHODS.has(request.method)) {
    const userAgent = request.headers.get('user-agent') || '';
    const claimsBrowser = !isBotUserAgent(userAgent);
    const suspiciousTls = claimsBrowser && assessTls(tls).verdict === 'non-browser';
    const max = suspiciousTls || !claimsBrowser ? RATE_LIMIT_MAX_NON_BROWSER : RATE_LIMIT_MAX;

    const ip = getClientIp(request.headers);
    const { limited, retryAfter } = await isRateLimited(ip, max);
    if (limited) {
      return NextResponse.json(
        { error: 'リクエストが多すぎます。しばらくしてから再試行してください。' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }
  }

  // TLSシグナルを下流のルートハンドラへ受け渡す。
  // 重要: クライアントが同名ヘッダを送りつけて指紋を偽装できないよう、
  // 実測値が無い場合は「マージ」ではなく「削除」する。
  const forwarded = new Headers(request.headers);
  for (const [name, value] of tlsSignalsToHeaderEntries(tls)) {
    if (value === null) forwarded.delete(name);
    else forwarded.set(name, value);
  }

  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  // 静的アセットとファビコンを除外して全ルートに適用
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
