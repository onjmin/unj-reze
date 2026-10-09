import { kvGet, kvSetEx } from "@/lib/kv";

// 書き込みのレート制限（middleware.ts から使う）。
//
// 本命は Cloudflare Workers の Rate Limiting バインディング（wrangler.json の `ratelimits`）。
// KV の「読んでから書く」方式は原子的でなく（同時に来た N 件が全部同じ値を読む）、結果整合で
// 遅れて見え、しかも 1 書き込みごとに KV の書き込み枠（無料枠は 1 日 1000 回）を食っていた。
// バインディングはロケーション単位の近似カウンタだが、KV を一切叩かずミリ秒未満で返る。
//
// バインディングが無い環境（next dev / next start / Workers 以外）だけ、従来の KV 方式へ落とす。

/** 何の予算で数えるか。キーにも入るので、同じ IP でも別々に数える。 */
export type RateBucket =
	/** 通常の書き込み（30 回 / 10 秒） */
	| "write"
	/** ブラウザを名乗るのに TLS が合わない／ボット UA（5 回 / 10 秒） */
	| "strict"
	/** CSP 違反レポート。利用者の書き込み枠を食わないよう別枠（30 回 / 10 秒） */
	| "csp";

const WINDOW_SEC = 10;
const BUCKET_MAX: Record<RateBucket, number> = { write: 30, strict: 5, csp: 30 };

/** Workers Rate Limiting バインディングの最小限の型（@cloudflare/workers-types を入れていないため自前）。 */
export interface RateLimitBinding {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface RateLimitEnv {
	WRITE_LIMITER?: RateLimitBinding;
	WRITE_LIMITER_STRICT?: RateLimitBinding;
}

function bindingFor(
	env: RateLimitEnv | null | undefined,
	bucket: RateBucket,
): RateLimitBinding | undefined {
	if (!env) return undefined;
	// csp は通常枠のバインディングを別キーで使う（上限が同じなのでバインディングを増やさない）
	return bucket === "strict" ? env.WRITE_LIMITER_STRICT : env.WRITE_LIMITER;
}

function isBinding(v: unknown): v is RateLimitBinding {
	return (
		!!v && typeof (v as { limit?: unknown }).limit === "function"
	);
}

let warnedNoBinding = false;

/**
 * `ipKey` は rateLimitKeyFromIp() 済みの値（IPv6 は /64 に丸めたもの）を渡すこと。
 * 失敗時はどの経路でも fail-open（可用性優先）。ただし黙って素通しにはせず痕跡を残す。
 */
export async function checkRateLimit(
	env: RateLimitEnv | null | undefined,
	ipKey: string,
	bucket: RateBucket,
): Promise<{ limited: boolean; retryAfter: number }> {
	const key = `${bucket}:${ipKey}`;
	const binding = bindingFor(env, bucket);
	if (isBinding(binding)) {
		try {
			const { success } = await binding.limit({ key });
			// バインディングは残り時間を返さないので、窓の長さをそのまま目安として返す
			return { limited: !success, retryAfter: WINDOW_SEC };
		} catch (err) {
			console.warn("rate limit: binding failed, failing open", err);
			return { limited: false, retryAfter: 0 };
		}
	}
	if (!warnedNoBinding) {
		warnedNoBinding = true;
		console.warn(
			"rate limit: WRITE_LIMITER バインディングが無いので KV 方式で数える（本番の Workers では wrangler.json の ratelimits を確認）",
		);
	}
	return kvRateLimit(key, BUCKET_MAX[bucket]);
}

/** 旧方式（フォールバック）。窓番号入りのキーで数えるので、キーは窓ごとに自然に切り替わる。 */
async function kvRateLimit(
	key: string,
	max: number,
): Promise<{ limited: boolean; retryAfter: number }> {
	const windowIndex = Math.floor(Date.now() / (WINDOW_SEC * 1000));
	const kvKey = `ratelimit:${key}:${windowIndex}`;
	let count = 0;
	try {
		count = parseInt((await kvGet(kvKey)) || "0", 10);
		await kvSetEx(kvKey, String(count + 1), WINDOW_SEC * 2);
	} catch (err) {
		console.warn("rate limit: KV unavailable, failing open", err);
		return { limited: false, retryAfter: 0 };
	}
	const nextWindowStart = (windowIndex + 1) * WINDOW_SEC * 1000;
	const retryAfter = Math.max(
		1,
		Math.ceil((nextWindowStart - Date.now()) / 1000),
	);
	return { limited: count + 1 > max, retryAfter };
}
