import { headers as incomingHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/ip";
import {
	checkTieredRateLimit,
	getRateLimitEnv,
} from "@/lib/security/rate-limit";

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
 *   ブラウザキャッシュだけに任せる。共有キャッシュのキーは userId を含まない
 *   （edgeCacheKeyUrl）ので、個人向けの応答を personalized: false で通すと**他人に漏れる**。
 *   personalized はクエリではなく、セッションで裏取りした viewer から決めること。
 *
 * produce() まで行く分（MISS・パーソナライズ）は miss バケツで /64・/48 ごとに数え、超えたら 429 にする
 * （missBudgetExceeded）。キーをいくら正規化しても、許可したパラメータの値を変えれば MISS は作れるため。
 */

type Produce = () => Promise<NextResponse>;

/**
 * 共有キャッシュのキーに残すクエリパラメータ（アルファベット順）。
 *
 * キーを URL 全体にしていたので、`?x=乱数` や `?userId=` を付けるだけで毎回 MISS になり、
 * Neon へ素通しできた（共有 Neon の転送量を1人で焼ける）。なのでキーは
 * 「オリジン + パス + 下の許可リストのパラメータだけ（名前順）」で作り、それ以外は捨てる。
 *
 * 一覧は withEdgeCache の全呼び出し元（posts・posts/[id]/replies・search/trends・games/ranking・
 * mvs|talks|otomads/[id]・notifications・unj/subject.txt・hashtag/[tag]・unj/dat/[id]）が実際に読む
 * パラメータから作った。hashtag/[tag] はデコードしたタグとクランプした `limit` だけのキー用 Request を
 * 渡し（パーソナライズはセッションで裏取りした viewer）、unj/dat/[id] はクエリなしの正規の
 * `/unj/dat/{datKey}.dat` を渡す。
 * **キャッシュするルートで新しいパラメータを読むときは、必ずここへ足すこと。** 足さないと
 * そのパラメータの値が違うリクエスト同士が同じキーになり、別の応答が返る。
 * userId は入れない: パーソナライズした応答は private にしてエッジに載せない（personalized）。
 *
 * 許可リストのパラメータでも値は自由に変えられる（limit=20乱数・存在する beforeId を総当たり など）。
 * なのでキーの正規化だけでは MISS を止めきれない。止めるのは withEdgeCache の miss バケツ
 * （MISS して produce() まで行った回数を /64・/48 ごとに数える）。
 */
const CACHE_KEY_PARAMS = [
	"before",
	"beforeId",
	"hasGame",
	"hasImage",
	"hasMml",
	"hasMv",
	"hasOtomad",
	"hasTalk",
	"limit",
	"unread",
].sort();

/**
 * 真偽のフィルタ。読むのは /api/posts だけで、「あれば `=== "true"` か、無ければ未指定」の3値
 * （app/api/posts/route.ts）。なので値は "true" / "false" に畳んでも応答は変わらず、
 * `hasMml=乱数` のような値で別キーを作らせない。読み方の違うルートで has* を使うときはここを見直すこと。
 */
const BOOLEAN_KEY_PARAMS = new Set([
	"hasGame",
	"hasImage",
	"hasMml",
	"hasMv",
	"hasOtomad",
	"hasTalk",
]);

/**
 * キャッシュキー用に URL を正規化する（許可リストのパラメータだけを名前順に並べ直す）。
 * 同名パラメータが複数あるときは先頭だけ（ルート側の searchParams.get と同じ値）。
 */
export function edgeCacheKeyUrl(url: string): string {
	const u = new URL(url);
	const kept = new URLSearchParams();
	for (const name of CACHE_KEY_PARAMS) {
		const value = u.searchParams.get(name);
		if (value === null) continue;
		kept.set(
			name,
			BOOLEAN_KEY_PARAMS.has(name) ? String(value === "true") : value,
		);
	}
	const qs = kept.toString();
	return `${u.origin}${u.pathname}${qs ? `?${qs}` : ""}`;
}

/** Cloudflare の ExecutionContext。取れない環境（next dev / 静的エクスポート）では undefined。 */
async function getExecutionCtx(): Promise<
	{ waitUntil: (p: Promise<unknown>) => void } | undefined
> {
	try {
		const { getCloudflareContext } = await import("@opennextjs/cloudflare");
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

/**
 * produce()（＝Neon）まで行く分の予算を数える。超えていればその応答、通せるなら null。
 * キャッシュのヒットは数えないので、普通の閲覧はほぼ減らない。数えるのは
 * 「MISS」「パーソナライズ（そもそも共有キャッシュに載らない）」「GET 以外・Cache API が無い」の3つ。
 * バインディング（READ_LIMITER / READ_LIMITER_48）が無ければ素通し（KV には落とさない）。
 *
 * IP は next/headers の headers() から取る: 呼び出し元の一部（hashtag・dat）はキャッシュキー用に
 * 作り直した Request（ヘッダ無し）を渡してくるので、request.headers だと全員が同じ
 * 127.0.0.1 として1つの枠を取り合ってしまう。リクエストの外で呼ばれたときだけ request.headers を使う。
 *
 * 超えたときの応答: /api/ は JSON の 429。それ以外（専ブラの subject.txt・dat）は本文なし
 * （HTML や JSON を返すと専ブラがパースに失敗して落ちる。middleware.ts の BBS_PROTOCOL_PREFIXES の
 * コメント参照）で、If-Modified-Since 付きのポーリングには 304（新着なしに見せる）、無ければ 429。
 */
async function missBudgetExceeded(
	request: Request,
): Promise<NextResponse | null> {
	let h: Headers = request.headers;
	try {
		h = await incomingHeaders();
	} catch {
		// リクエストスコープ外（テストなど）
	}
	const { limited, retryAfter } = await checkTieredRateLimit(
		await getRateLimitEnv(),
		getClientIp(h),
		"miss",
		"miss48",
	);
	if (!limited) return null;

	const headers = { "Retry-After": String(retryAfter) };
	if (new URL(request.url).pathname.startsWith("/api/")) {
		return NextResponse.json(
			{ error: "リクエストが多すぎます。しばらくしてから再試行してください。" },
			{ status: 429, headers: { ...headers, "Cache-Control": "no-store" } },
		);
	}
	return new NextResponse(null, {
		status: h.has("if-modified-since") ? 304 : 429,
		headers,
	});
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
	produce: Produce,
): Promise<NextResponse> {
	const { sMaxAge, maxAge = sMaxAge, personalized } = options;

	if (personalized) {
		// 自分のセッション + ?userId= で毎回ここを通れるので、MISS と同じく数える
		const tooMany = await missBudgetExceeded(request);
		if (tooMany) return tooMany;
		const res = await produce();
		res.headers.set("Cache-Control", `private, max-age=${maxAge}`);
		return res;
	}

	const cacheControl = `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 2}`;
	const cache = sharedCache();

	if (!cache || request.method !== "GET") {
		const tooMany = await missBudgetExceeded(request);
		if (tooMany) return tooMany;
		const res = await produce();
		res.headers.set("Cache-Control", cacheControl);
		return res;
	}

	const cacheKey = new Request(edgeCacheKeyUrl(request.url), { method: "GET" });

	try {
		const hit = await cache.match(cacheKey);
		if (hit) {
			const cached = new NextResponse(hit.body, hit);
			cached.headers.set("X-Edge-Cache", "HIT");
			return cached;
		}
	} catch {
		// キャッシュ参照に失敗しても本処理は続行する
	}

	const tooMany = await missBudgetExceeded(request);
	if (tooMany) return tooMany;
	const res = await produce();
	res.headers.set("Cache-Control", cacheControl);
	res.headers.set("X-Edge-Cache", "MISS");

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
 * キーは withEdgeCache と同じ正規化（edgeCacheKeyUrl）を通すので、余計なパラメータ付きでも同じものを指す。
 * 失敗しても無視する（次の TTL 切れで整合する）。
 */
export async function purgeEdgeCache(urls: string[]): Promise<void> {
	const cache = sharedCache();
	if (!cache) return;
	await Promise.all(
		urls.map((u) => {
			let key: string;
			try {
				key = edgeCacheKeyUrl(u);
			} catch {
				return false; // 絶対 URL でないものは消しようがない
			}
			return cache
				.delete(new Request(key, { method: "GET" }))
				.catch(() => false);
		}),
	);
}
