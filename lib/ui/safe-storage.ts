/**
 * localStorage / sessionStorage への書き込みを例外で落とさない。
 *
 * 容量（約5MB）が満杯だと 1 バイトの setItem でも QuotaExceededError を投げる。
 * 描画やエフェクトの中で投げると React のエラー画面（This page couldn’t load）に落ちるので、
 * 失われても困らない値（キャッシュ・既読位置・設定）はこれを通して書く。
 * 満杯で失敗したときは、優先度の低いキャッシュ（消しても再取得で戻るもの）を捨てて 1 回だけ再試行する。
 */

/** 消しても次の読み込みで作り直されるだけのキー。セッション ID・設定・下書きは入れないこと。 */
const LOW_PRIORITY_PREFIXES = ["unj_cached_profile_"];
const LOW_PRIORITY_KEYS = ["unj_cached_posts"];

/** フィードの即表示キャッシュの上限の目安。これより大きいのは旧版が全件書いたもの。 */
const CACHED_POSTS_MAX_CHARS = 300_000;

function isLowPriority(key: string): boolean {
	return (
		LOW_PRIORITY_KEYS.includes(key) ||
		LOW_PRIORITY_PREFIXES.some((p) => key.startsWith(p))
	);
}

/** 優先度の低いキャッシュを localStorage から全部消す（except は残す）。消した数を返す。 */
export function evictLowPriorityCaches(except?: string): number {
	try {
		const keys: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && k !== except && isLowPriority(k)) keys.push(k);
		}
		for (const k of keys) localStorage.removeItem(k);
		return keys.length;
	} catch {
		return 0;
	}
}

export function safeSetItem(
	key: string,
	value: string,
	storage: "local" | "session" = "local",
): boolean {
	let s: Storage;
	try {
		s = storage === "local" ? localStorage : sessionStorage;
	} catch {
		return false;
	}
	try {
		s.setItem(key, value);
		return true;
	} catch {}
	// 満杯なら低優先度のキャッシュを捨てて 1 回だけやり直す。書こうとしているキー自体が
	// 低優先度でも消してよい（上書きするだけなので）。
	if (storage === "local" && evictLowPriorityCaches() > 0) {
		try {
			s.setItem(key, value);
			return true;
		} catch {}
	}
	return false;
}

export function safeRemoveItem(
	key: string,
	storage: "local" | "session" = "local",
): void {
	try {
		const s = storage === "local" ? localStorage : sessionStorage;
		s.removeItem(key);
	} catch {}
}

let swept = false;

/**
 * 旧版が溜めたキャッシュの掃除。ページを開いて最初の 1 回だけ走る（ensureSessionId から呼ぶ）。
 * - `unj_cached_profile_*`: 一覧（index）が無いのは旧版。上限なしで開いた人ごとに増えていたので全部消す。
 * - `unj_cached_posts`: 旧版はスクロールで読んだ全件を書いていた。大きすぎるものは消す。
 */
export function sweepStorageOnce(): void {
	if (swept) return;
	swept = true;
	try {
		if (localStorage.getItem("unj_cached_profile_index") === null) {
			const keys: string[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i);
				if (k?.startsWith("unj_cached_profile_")) keys.push(k);
			}
			for (const k of keys) localStorage.removeItem(k);
			localStorage.setItem("unj_cached_profile_index", "[]");
		}
		const posts = localStorage.getItem("unj_cached_posts");
		if (posts && posts.length > CACHED_POSTS_MAX_CHARS)
			localStorage.removeItem("unj_cached_posts");
	} catch {}
}
