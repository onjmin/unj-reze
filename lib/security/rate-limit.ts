import { rateLimitKey48FromIp, rateLimitKeyFromIp } from "@/lib/ip";
import { kvExists, kvGet, kvSetEx } from "@/lib/kv";

// レート制限（middleware.ts・エッジキャッシュの MISS・セッション作成から使う）。
//
// 本命は Cloudflare Workers の Rate Limiting バインディング（wrangler.json の `ratelimits`）。
// KV の「読んでから書く」方式は原子的でなく（同時に来た N 件が全部同じ値を読む）、結果整合で
// 遅れて見え、しかも 1 書き込みごとに KV の書き込み枠（無料枠は 1 日 1000 回）を食っていた。
// バインディングはロケーション単位の近似カウンタだが、KV を一切叩かずミリ秒未満で返る。
//
// バインディングが無い環境（next dev / next start / Workers 以外）だけ、従来の KV 方式へ落とす。
// ただし write / strict / csp 以外（read 系・miss 系・write48・signup 系）は KV へ落とさない
// （バインディングが無ければ素通し）: read や miss は GET のたびに数えるので、KV に落とすと
// 閲覧だけで KV の書き込み枠を焼き切ってしまう。write48 と signup 系も後から足した多層防御なので、
// 未設定の配備では従来どおり動くことを優先する。
//
// IPv6 は2段で数える（checkTieredRateLimit）: /64 の段に加えて /48 の段。/48 を持つ相手は
// /64 を 65536 個乗り換えられるので、/64 の段だけだと枠が実質 65536 倍になる。

/** 何の予算で数えるか。キーにも入るので、同じ IP でも別々に数える。 */
export type RateBucket =
	/** 通常の書き込み（30 回 / 10 秒） */
	| "write"
	/** ブラウザを名乗るのに TLS が合わない／ボット UA（5 回 / 10 秒） */
	| "strict"
	/** CSP 違反レポート。利用者の書き込み枠を食わないよう別枠（30 回 / 10 秒） */
	| "csp"
	/** 重い読み取り GET（検索・dat・プロフィールなど。60 回 / 10 秒・/64 単位）。バインディングのみ */
	| "read"
	/** read の2段目。/48 単位（READ_LIMITER_48: 480 回 / 10 秒）。バインディングのみ */
	| "read48"
	/** 一度に大量に並ぶ軽い読み取り（RPGEN の単体詳細）。/64 単位だが枠は READ_LIMITER_48 の大きい方
	 * （480 回 / 10 秒）。素材シートを開くと 100 件超を Promise.all で引くので read の枠では足りない */
	| "readBurst"
	/** エッジキャッシュを外れて produce()（＝Neon）まで行った GET（60 回 / 10 秒・/64 単位）。
	 * ヒットは数えない。キャッシュキーに残るパラメータ（beforeId など）の値を変えて毎回 MISS させる
	 * 相手を止める（lib/edge-cache.ts）。バインディングのみ */
	| "miss"
	/** miss の2段目。/48 単位（480 回 / 10 秒）。バインディングのみ */
	| "miss48"
	/** 書き込みの2段目。/48 単位で数える（240 回 / 10 秒）。バインディングのみ */
	| "write48"
	/** 匿名ユーザーの新規作成（20 回 / 60 秒・/64 単位）。バインディングのみ */
	| "signup"
	/** signup の2段目。/48 単位（60 回 / 60 秒）。バインディングのみ */
	| "signup48";

/** 窓の長さ（秒）。バインディングは残り時間を返さないので Retry-After の目安にも使う。
 * wrangler.json の各バインディングの period と揃えること。 */
const BUCKET_PERIOD_SEC: Record<RateBucket, number> = {
	write: 10,
	strict: 10,
	csp: 10,
	read: 10,
	read48: 10,
	readBurst: 10,
	miss: 10,
	miss48: 10,
	write48: 10,
	signup: 60,
	signup48: 60,
};

/** KV フォールバックで数える上限。ここに無いバケツは KV へ落とさない（上のコメント参照）。 */
const KV_FALLBACK_MAX: Partial<Record<RateBucket, number>> = {
	write: 30,
	strict: 5,
	csp: 30,
};

/** Workers Rate Limiting バインディングの最小限の型（@cloudflare/workers-types を入れていないため自前）。 */
export interface RateLimitBinding {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** すべて任意。wrangler.json に無い配備（古い設定のまま出したもの）でも動くようにする。 */
export interface RateLimitEnv {
	WRITE_LIMITER?: RateLimitBinding;
	WRITE_LIMITER_STRICT?: RateLimitBinding;
	READ_LIMITER?: RateLimitBinding;
	READ_LIMITER_48?: RateLimitBinding;
	WRITE_LIMITER_48?: RateLimitBinding;
	SIGNUP_LIMITER?: RateLimitBinding;
	SIGNUP_LIMITER_48?: RateLimitBinding;
	/** 1 回 / 60 秒。再生数などの「同じ相手の短時間の重複」を間引く（dedupeOnce）。 */
	DEDUPE_LIMITER?: RateLimitBinding;
}

function bindingFor(
	env: RateLimitEnv | null | undefined,
	bucket: RateBucket,
): RateLimitBinding | undefined {
	if (!env) return undefined;
	switch (bucket) {
		case "strict":
			return env.WRITE_LIMITER_STRICT;
		// read と miss は同じバインディングを別キー（接頭辞）で使う。上限が同じなので増やさない
		case "read":
		case "miss":
			return env.READ_LIMITER;
		// 480 回 / 10 秒の大きい枠。/48 の段と、/64 で数える readBurst が別キーで共有する
		case "read48":
		case "miss48":
		case "readBurst":
			return env.READ_LIMITER_48;
		case "write48":
			return env.WRITE_LIMITER_48;
		case "signup":
			return env.SIGNUP_LIMITER;
		case "signup48":
			return env.SIGNUP_LIMITER_48;
		default:
			// csp は通常枠のバインディングを別キーで使う（上限が同じなのでバインディングを増やさない）
			return env.WRITE_LIMITER;
	}
}

function isBinding(v: unknown): v is RateLimitBinding {
	return (
		!!v && typeof (v as { limit?: unknown }).limit === "function"
	);
}

/** 警告はバケツごとにアイソレートで1回だけ（リクエストごとに出すとログが埋まる） */
const warnedNoBinding = new Set<string>();
function warnOnce(tag: string, message: string) {
	if (warnedNoBinding.has(tag)) return;
	warnedNoBinding.add(tag);
	console.warn(message);
}

/**
 * `ipKey` は rateLimitKeyFromIp() 済みの値（IPv6 は /64 に丸めたもの）を渡すこと。
 * *48 のバケツだけは rateLimitKey48FromIp() の値。2段まとめて数えるなら checkTieredRateLimit。
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
			return { limited: !success, retryAfter: BUCKET_PERIOD_SEC[bucket] };
		} catch (err) {
			console.warn("rate limit: binding failed, failing open", err);
			return { limited: false, retryAfter: 0 };
		}
	}
	const kvMax = KV_FALLBACK_MAX[bucket];
	if (kvMax === undefined) {
		warnOnce(
			bucket,
			`rate limit: ${bucket} のバインディングが無いので数えずに通す（本番の Workers では wrangler.json の ratelimits を確認）`,
		);
		return { limited: false, retryAfter: 0 };
	}
	warnOnce(
		"kv",
		"rate limit: WRITE_LIMITER バインディングが無いので KV 方式で数える（本番の Workers では wrangler.json の ratelimits を確認）",
	);
	return kvRateLimit(key, kvMax, BUCKET_PERIOD_SEC[bucket]);
}

/**
 * /64 の段（IPv4 はアドレスそのもの）と、IPv6 だけ /48 の段を順に数える。
 * `clientIp` は getClientIp() の生の値（丸める前）を渡す。`bucket48` が null なら /48 の段は数えない。
 * /64 の段で止まったときは /48 の枠を減らさない（止めた相手の分で同じ /48 の他人の枠を食わない）。
 */
export async function checkTieredRateLimit(
	env: RateLimitEnv | null | undefined,
	clientIp: string,
	bucket: RateBucket,
	bucket48: RateBucket | null,
): Promise<{ limited: boolean; retryAfter: number }> {
	const first = await checkRateLimit(env, rateLimitKeyFromIp(clientIp), bucket);
	if (first.limited || !bucket48) return first;
	const ip48 = rateLimitKey48FromIp(clientIp);
	if (!ip48) return first;
	return await checkRateLimit(env, ip48, bucket48);
}

/** 旧方式（フォールバック）。窓番号入りのキーで数えるので、キーは窓ごとに自然に切り替わる。 */
async function kvRateLimit(
	key: string,
	max: number,
	windowSec: number,
): Promise<{ limited: boolean; retryAfter: number }> {
	const windowIndex = Math.floor(Date.now() / (windowSec * 1000));
	const kvKey = `ratelimit:${key}:${windowIndex}`;
	let count = 0;
	try {
		count = parseInt((await kvGet(kvKey)) || "0", 10);
		await kvSetEx(kvKey, String(count + 1), windowSec * 2);
	} catch (err) {
		console.warn("rate limit: KV unavailable, failing open", err);
		return { limited: false, retryAfter: 0 };
	}
	const nextWindowStart = (windowIndex + 1) * windowSec * 1000;
	const retryAfter = Math.max(
		1,
		Math.ceil((nextWindowStart - Date.now()) / 1000),
	);
	return { limited: count + 1 > max, retryAfter };
}

/**
 * ルートハンドラからバインディングを取る（middleware.ts の getCfContext と同じ方法）。
 * Workers の外（next dev / next start）では null。その場合 checkRateLimit は
 * KV フォールバックか素通し、dedupeOnce は null になる。
 */
export async function getRateLimitEnv(): Promise<RateLimitEnv | null> {
	try {
		const { getCloudflareContext } = await import("@opennextjs/cloudflare");
		const ctx = await getCloudflareContext({ async: true });
		return (ctx?.env as RateLimitEnv | undefined) ?? null;
	} catch {
		return null;
	}
}

/**
 * 「同じキーを 60 秒に1回だけ」数えるための重複判定（DEDUPE_LIMITER = 1 回 / 60 秒）。
 *  - true  … この窓で初めて（数えてよい）
 *  - false … 重複（数えない）
 *  - null  … バインディングが無い／失敗した。呼び出し側は従来の方式（KV など）で判定する
 * KV の kvExists + kvSetEx は 1 回ごとに KV の書き込み枠を食うので、バインディングがあればこちらを使う。
 * キーの接頭辞は用途ごとに分けること（posts-write が `vote:` / `heart:`、
 * isFirstWithinWindow の呼び出し元が `play:` / `clear:game:` / `preset:`、session-server が `touch:`）。
 */
export async function dedupeOnce(
	env: RateLimitEnv | null | undefined,
	key: string,
): Promise<boolean | null> {
	const binding = env?.DEDUPE_LIMITER;
	if (!isBinding(binding)) {
		warnOnce(
			"dedupe",
			"rate limit: DEDUPE_LIMITER バインディングが無いので重複判定は従来の方式（KV など）で行う",
		);
		return null;
	}
	try {
		const { success } = await binding.limit({ key });
		return success;
	} catch (err) {
		console.warn("rate limit: DEDUPE_LIMITER failed, falling back", err);
		return null;
	}
}

/**
 * 再生数・クリア数などを「同じ相手から短時間に何度も」数えないための判定。
 * true なら数えてよい、false なら重複。
 *
 * まず dedupeOnce（バインディング。窓は 60 秒固定）を使い、使えないときだけ従来の KV 方式
 * （kvExists + kvSetEx、窓は kvTtlSec）に落とす。KV も落ちていれば数える（fail-open:
 * 数えるのはおまけなので、判定できないからといって記録自体を止めない）。
 * `key` には rateLimitKeyFromIp() 済みの IP（IPv6 は /64）を含めること。
 */
export async function isFirstWithinWindow(
	env: RateLimitEnv | null | undefined,
	key: string,
	kvTtlSec: number,
): Promise<boolean> {
	const first = await dedupeOnce(env, key);
	if (first !== null) return first;
	const kvKey = `dedupe:${key}`;
	try {
		if (await kvExists(kvKey)) return false;
		await kvSetEx(kvKey, "1", kvTtlSec);
	} catch {
		// KV が落ちていても（遮断器が開いていても）数えること自体は続ける
	}
	return true;
}
