import { NextResponse } from 'next/server';

/**
 * 読み取り系 GET のエッジ／ブラウザキャッシュ。
 *
 * 重要: Cloudflare Workers は「Worker が生成したレスポンス」を Cache-Control だけでは
 * CDN に載せてくれない。共有キャッシュに載せるには Cache API (`caches.default`) を
 * 明示的に叩く必要がある。ヘッダだけ足しても Neon へのヒットは減らない。
 *
 * パーソナライズの扱い:
 * - userId を含まない匿名レスポンスのみ `public` として共有キャッシュに載せる。
 * - userId 付き（liked/disliked やブロック適用済み）のレスポンスは `private` に留め、
 *   ブラウザキャッシュだけに任せる。共有キャッシュのキーは URL 単位なので他人には
 *   漏れないが、個人向けデータをエッジに置かない方が事故が少ない。
 */

type Produce = () => Promise<NextResponse>;

/** Cloudflare の ExecutionContext。取れない環境（next dev / 静的エクスポート）では undefined。 */
async function getExecutionCtx(): Promise<{ waitUntil: (p: Promise<unknown>) => void } | undefined> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { ctx } = await getCloudflareContext({ async: true });
    return ctx as { waitUntil: (p: Promise<unknown>) => void } | undefined;
  } catch {
    return undefined;
  }
}

function sharedCache(): Cache | undefined {
  const c = (globalThis as { caches?: { default?: Cache } }).caches;
  return c?.default;
}

export interface EdgeCacheOptions {
  /** 共有キャッシュ（エッジ）に載せる秒数。 */
  sMaxAge: number;
  /** ブラウザキャッシュの秒数。既定は sMaxAge と同じ。 */
  maxAge?: number;
  /** true ならパーソナライズ済み。private 扱いにしてエッジには載せない。 */
  personalized: boolean;
}

/**
 * `produce()` の結果をキャッシュしつつ返す。
 * personalized のときは Cache-Control を付けるだけで Cache API は使わない。
 */
export async function withEdgeCache(
  request: Request,
  options: EdgeCacheOptions,
  produce: Produce
): Promise<NextResponse> {
  const { sMaxAge, maxAge = sMaxAge, personalized } = options;

  if (personalized) {
    const res = await produce();
    res.headers.set('Cache-Control', `private, max-age=${maxAge}`);
    return res;
  }

  const cacheControl = `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 2}`;
  const cache = sharedCache();

  if (!cache || request.method !== 'GET') {
    const res = await produce();
    res.headers.set('Cache-Control', cacheControl);
    return res;
  }

  const cacheKey = new Request(request.url, { method: 'GET' });

  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const cached = new NextResponse(hit.body, hit);
      cached.headers.set('X-Edge-Cache', 'HIT');
      return cached;
    }
  } catch {
    // キャッシュ参照に失敗しても本処理は続行する
  }

  const res = await produce();
  res.headers.set('Cache-Control', cacheControl);
  res.headers.set('X-Edge-Cache', 'MISS');

  // 200 以外を載せるとエラーがTTLぶん固定されるので載せない
  if (res.status === 200) {
    const toStore = res.clone();
    const put = cache.put(cacheKey, toStore).catch(() => {});
    const ctx = await getExecutionCtx();
    if (ctx?.waitUntil) ctx.waitUntil(put);
    else await put;
  }

  return res;
}

/**
 * 書き込み後にエッジキャッシュを捨てる。URL 単位なので、無効化したい URL を列挙して渡す。
 * 失敗しても無視する（次の TTL 切れで整合する）。
 */
export async function purgeEdgeCache(urls: string[]): Promise<void> {
  const cache = sharedCache();
  if (!cache) return;
  await Promise.all(
    urls.map(u => cache.delete(new Request(u, { method: 'GET' })).catch(() => false))
  );
}
