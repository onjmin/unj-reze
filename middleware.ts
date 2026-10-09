import { NextRequest, NextResponse } from 'next/server';
import { getCountryFromHeaders, isBlockedCountry } from '@/lib/security/geo';
import { getClientIp } from '@/lib/ip';
import { checkTieredRateLimit, type RateBucket, type RateLimitEnv } from '@/lib/security/rate-limit';
import { ENFORCED_CSP, REPORTING_ENDPOINTS, buildReportOnlyCsp } from '@/lib/security/csp';
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

// ── レートリミット ──
// 実体は lib/security/rate-limit.ts（本番は Workers の Rate Limiting バインディング、無ければ KV）。
// - write : 1ウィンドウ(10s)あたり 30 回 / IP
// - strict: TLSハンドシェイクがブラウザのものではない／ボットUA。ブロックはせず「予算を絞る」に
//           留める(誤検知時の被害を限定するため)。5 回 / 10s
// - csp   : /api/csp-report。利用者の書き込み枠を食わないよう別枠で数える(/48 の段にも入れない)
// - write48: IPv6 の書き込みは /64 の枠に加えて /48 でも数える(240 回 / 10s)。/48 を持つ相手は
//           /64 をいくらでも乗り換えられるため。IPv4 には相当する段が無いので数えない
// - read  : 重い読み取り GET(下の isExpensiveReadPath)。共有 Neon の転送量を1人で焼かせない(60 回 / 10s)
// - read48: read の /48 の段(480 回 / 10s)。write48 と同じ理由
// - readBurst: RPGEN の単体詳細(isBurstReadPath)。一度に 100 件超並ぶので /64 でも大きい枠(480 回 / 10s)
// read 系 / write48 はバインディングが無ければ素通し(KV には落とさない。lib/security/rate-limit.ts 参照)。
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const READ_METHODS = new Set(['GET', 'HEAD']);
const CSP_REPORT_PATH = '/api/csp-report';

interface CfContextLike {
  cf?: unknown;
  env?: RateLimitEnv;
}

/** Cloudflare Workers 上でのみ request.cf とバインディングが取れる。
 * `next dev`(workerd 外)や静的エクスポートでは取得できないため、その場合は null に倒す。 */
async function getCfContext(): Promise<CfContextLike | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    return (await getCloudflareContext({ async: true })) as CfContextLike;
  } catch {
    return null;
  }
}

function getTlsSignals(ctx: CfContextLike | null): TlsSignals {
  if (!ctx) return EMPTY_TLS_SIGNALS;
  return readTlsSignalsFromCf(ctx.cf as CfTlsProperties | undefined);
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

// 専ブラ(2ch専用ブラウザ)向けプロトコルのパス。dat/subject.txt/SETTING.TXTのレスポンスは
// 専ブラが2ch形式のプレーンテキストとして即座にパースするため、HTMLの451ページを返すと
// クライアントが数値パースに失敗してクラッシュする(実例: iOS専ブラでの
// `FormatException: Invalid radix-10 number at character 1` — 451ページの`<!DOCTYPE html>`の
// `<`を数値としてパースしようとして落ちる)。Apple Private RelayはEU圏のリレー経由になる
// ことがあり、実際の利用者がEU圏在住でなくても isBlockedCountry が誤って一致しうるため、
// iOS端末で特に踏みやすい。Cookie・トラッキングを一切持たない匿名テキストプロトコルであり
// 通常のWebページでもないため、GDPR遮断の対象外として扱う。
const BBS_PROTOCOL_PREFIXES = ['/unj/', '/test/bbs.cgi'];
function isBbsProtocolPath(pathname: string): boolean {
  return BBS_PROTOCOL_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

// 書き込みのレート制限を掛けるパス。専ブラの書き込み口 /test/bbs.cgi は /api/ の外にあるので明示的に含める。
const BBS_POST_PATH = '/test/bbs.cgi';
function isRateLimitedWritePath(pathname: string): boolean {
  return pathname.startsWith('/api/') || pathname === BBS_POST_PATH || pathname.startsWith(`${BBS_POST_PATH}/`);
}

// 読み取りのレート制限を掛ける GET。1回で Neon から多くの行・本文を読む／上流へ出ていくもの
// (dat はスレ全件、検索・メディア検索・プロフィールは全期間を走査、RPGEN・iTunes は外部 API、
// 投稿詳細・ゲーム一覧/詳細/ライブ情報はエッジキャッシュに載せておらず毎回 Neon を引く)。
// エッジキャッシュに載る一覧(/api/posts・/replies・/api/games/ranking など)はここでは数えない:
// あちらは lib/edge-cache.ts が「MISS して Neon まで行った分」だけを miss バケツで数える。
// - /api/search は完全一致だけ: /api/search/trends はエッジキャッシュ済みで、ここで数えると無駄に枠を食う
// - /api/posts/<id> は完全一致だけ(正規表現): /api/posts/<id>/replies はエッジキャッシュ側で数える
// - /api/rpgen/data/ は画像・音声の実体(ゲーム1本で大量に並ぶ。長期キャッシュ付き)なので外す
const EXPENSIVE_READ_PREFIXES = ['/unj/dat/', '/api/hashtag/', '/api/users/'];
const EXPENSIVE_READ_EXACT = ['/api/search'];
const EXPENSIVE_READ_TREES = ['/api/media-search', '/api/music/search', '/api/messages', '/api/oshi', '/api/games'];
const EXPENSIVE_READ_EXCLUDED = ['/api/games/ranking'];
const POST_DETAIL_RE = /^\/api\/posts\/[^/]+$/;
function isExpensiveReadPath(pathname: string): boolean {
  if (EXPENSIVE_READ_EXCLUDED.includes(pathname)) return false;
  if (EXPENSIVE_READ_EXACT.includes(pathname)) return true;
  if (POST_DETAIL_RE.test(pathname)) return true;
  if (EXPENSIVE_READ_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (EXPENSIVE_READ_TREES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return pathname.startsWith('/api/rpgen/') && !pathname.startsWith('/api/rpgen/data/');
}

// RPGEN の単体詳細(/api/rpgen/sprites/<id> など)。素材シートを開くとメンバーの名前を
// Promise.all で一度に 100 件超引く(components/assets/SpriteSheetBrowser.tsx・RpgenAssetPanel.tsx)ので、
// read の 60 回 / 10s だと正規の作者でも名前が欠け、続く検索まで 429 で落ちる。
// 1件ずつの軽い上流呼び出し(ルート側で 300 秒キャッシュ)なので、/64 でも大きい readBurst の枠で数える。
// 検索・一覧(sprites?q=・sheets/*・picotune・rechord)は read のまま。
const RPGEN_DETAIL_RE = /^\/api\/rpgen\/(sprites|sprite-anims|sounds)\/[^/]+$/;
function isBurstReadPath(pathname: string): boolean {
  return RPGEN_DETAIL_RE.test(pathname);
}

// 全レスポンスに付けるセキュリティヘッダ。
// - CSP は 2 段構え(lib/security/csp.ts): 壊れようのない frame-ancestors / object-src / base-uri だけ強制し、
//   script-src 等を含む全体ポリシーは Report-Only で違反を /api/csp-report に集める。
// - frame-ancestors 'self': このサイトを他所の iframe に埋め込む用途は無い(unj 側もリンクのみ)。
// - Permissions-Policy: カメラ・マイク・位置情報は使っていない(getUserMedia 等の呼び出し無し)。
//   クリップボード・全画面・自動再生は使うので触らない。
// 静的アセット(_next/static と public/)は Workers の ASSETS から直接返り middleware を通らないので、
// public/_headers でも同じものの一部を付けている。
const REPORT_ONLY_CSP = buildReportOnlyCsp({ dev: process.env.NODE_ENV !== 'production' });

function applySecurityHeaders(request: NextRequest, response: Response): Response {
  const h = response.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  // RPGEN プロキシは自前で `sandbox` の CSP を付ける。middleware 側の値とどちらが勝つかに
  // 依存しないよう、そのパスでは付けない(ルート側で frame-ancestors も合わせて付けている)。
  if (!request.nextUrl.pathname.startsWith('/api/rpgen/')) {
    h.set('Content-Security-Policy', ENFORCED_CSP);
    h.set('Content-Security-Policy-Report-Only', REPORT_ONLY_CSP);
    h.set('Reporting-Endpoints', REPORTING_ENDPOINTS);
  }
  // HSTS は本番の https だけ(ローカルの next start や http で付けても意味が無い／事故の元)
  if (process.env.NODE_ENV === 'production' && request.nextUrl.protocol === 'https:') {
    h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}

/**
 * レート制限に当たったときの応答。
 *  - /api/ は JSON の 429
 *  - 専ブラの書き込み口 /test/bbs.cgi は bbs.cgi 流儀の HTML の 429(専ブラは書き込み結果を HTML として読む)
 *  - それ以外(専ブラの dat など /unj/ の GET)は本文なし。上の BBS_PROTOCOL_PREFIXES のコメントのとおり、
 *    dat・subject.txt に HTML を返すと専ブラが `<` を数値として読んで落ちる。If-Modified-Since 付きの
 *    ポーリングには 304(=更新なし)を返し、専ブラには「新着なし」に見せる。窓が明けた次のポーリングで
 *    手元の日時から取り直すので、レスが抜けることはない。
 */
function tooManyRequests(request: NextRequest, retryAfter: number): Response {
  const { pathname } = request.nextUrl;
  if (pathname === BBS_POST_PATH || pathname.startsWith(`${BBS_POST_PATH}/`)) {
    // 専ブラは JSON を読めないので bbs.cgi 流儀のエラーページで返す。
    // ASCII だけなので Shift_JIS としてもそのまま読める(encoding-japanese を middleware に持ち込まない)。
    return applySecurityHeaders(
      request,
      new NextResponse(
        '<html><head><title>ERROR</title></head><body>ERROR: Too many requests. Please wait and try again.</body></html>\n',
        {
          status: 429,
          headers: { 'content-type': 'text/html; charset=Shift_JIS', 'Retry-After': String(retryAfter) },
        },
      ),
    );
  }
  if (!pathname.startsWith('/api/')) {
    const notModified = READ_METHODS.has(request.method) && request.headers.has('if-modified-since');
    return applySecurityHeaders(
      request,
      new NextResponse(null, {
        status: notModified ? 304 : 429,
        headers: { 'Retry-After': String(retryAfter) },
      }),
    );
  }
  return applySecurityHeaders(
    request,
    NextResponse.json(
      { error: 'リクエストが多すぎます。しばらくしてから再試行してください。' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    ),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // EU/EEA からのアクセスを 451 で遮断(専ブラ向けプロトコルパスは対象外。上記コメント参照)
  const country = getCountryFromHeaders(request.headers);
  if (isBlockedCountry(country) && !isBbsProtocolPath(pathname)) {
    return applySecurityHeaders(
      request,
      new NextResponse(BLOCKED_HTML, {
        status: 451,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
  }

  // TLSを終端しているのは自分自身(Cloudflare Workers)なので、ここで直接ハンドシェイク情報を読む。
  const cfContext = await getCfContext();
  const tls = getTlsSignals(cfContext);

  // 重い読み取り GET にレートリミット(/64 単位 + IPv6 は /48 の段)。バインディングが無ければ素通し。
  if (READ_METHODS.has(request.method) && isExpensiveReadPath(pathname)) {
    const bucket: RateBucket = isBurstReadPath(pathname) ? 'readBurst' : 'read';
    const { limited, retryAfter } = await checkTieredRateLimit(
      cfContext?.env,
      getClientIp(request.headers),
      bucket,
      'read48',
    );
    if (limited) return tooManyRequests(request, retryAfter);
  }

  // API と専ブラ書き込み口の書き込みメソッドにレートリミット。
  // ブラウザを名乗りながらTLSハンドシェイクが一致しない相手は書き込み予算を絞る。
  if (isRateLimitedWritePath(pathname) && WRITE_METHODS.has(request.method)) {
    const userAgent = request.headers.get('user-agent') || '';
    const claimsBrowser = !isBotUserAgent(userAgent);
    const suspiciousTls = claimsBrowser && assessTls(tls).verdict === 'non-browser';
    const bucket: RateBucket =
      pathname === CSP_REPORT_PATH ? 'csp' : suspiciousTls || !claimsBrowser ? 'strict' : 'write';

    // IPv6 は /64 単位で数え(lib/ip.ts の rateLimitKeyFromIp 参照)、さらに /48 の枠でも数える
    // (/64 を乗り換えて枠を取り直すのを抑える。IPv4 は /48 の段を飛ばす)。
    // CSP レポートは /48 の段に入れない: Safari/Firefox は違反1件ごとに POST するので、同じキャリアの
    // /48 にいる大勢の iPhone が騒がしいページを見るだけで、その /48 全体の投稿が止まってしまう。
    const { limited, retryAfter } = await checkTieredRateLimit(
      cfContext?.env,
      getClientIp(request.headers),
      bucket,
      bucket === 'csp' ? null : 'write48',
    );
    if (limited) return tooManyRequests(request, retryAfter);
  }

  // TLSシグナルを下流のルートハンドラへ受け渡す。
  // 重要: クライアントが同名ヘッダを送りつけて指紋を偽装できないよう、
  // 実測値が無い場合は「マージ」ではなく「削除」する。
  const forwarded = new Headers(request.headers);
  for (const [name, value] of tlsSignalsToHeaderEntries(tls)) {
    if (value === null) forwarded.delete(name);
    else forwarded.set(name, value);
  }

  return applySecurityHeaders(request, NextResponse.next({ request: { headers: forwarded } }));
}

export const config = {
  // 静的アセットとファビコンを除外して全ルートに適用
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
