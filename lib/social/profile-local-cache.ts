import { safeRemoveItem, safeSetItem } from "@/lib/ui/safe-storage";

/**
 * プロフィール画面の即表示用キャッシュ（localStorage の `unj_cached_profile_<slug>`）。
 *
 * 以前は開いたプロフィールごとにキーが増え続け、スクロールで読んだ投稿を全件書いていたので、
 * localStorage を満杯にして他の書き込み（フィードのキャッシュなど）まで落としていた。
 * いまは新しい順の一覧（INDEX_KEY）で MAX_PROFILES 件だけ残し、投稿は先頭 1 ページ分だけ持つ。
 * 旧版で溜まったキーの掃除と、満杯時の退避は lib/ui/safe-storage.ts 側でやる。
 */
const PREFIX = "unj_cached_profile_";
const INDEX_KEY = "unj_cached_profile_index";
const MAX_PROFILES = 20;
/** プロフィールの 1 ページ目の件数（api.users.profile が返す数）に合わせる。 */
const PROFILE_CACHE_POSTS = 20;

function cacheKey(slug: string): string {
	return `${PREFIX}${slug}`;
}

function readIndex(): string[] {
	try {
		const parsed = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
		return Array.isArray(parsed)
			? parsed.filter((s): s is string => typeof s === "string")
			: [];
	} catch {
		return [];
	}
}

/** slug のキャッシュを書く（既存の値に updates を重ねる）。一覧の先頭へ移し、溢れた分は消す。 */
export function writeProfileCache(
	slug: string,
	updates: Record<string, unknown>,
): void {
	if (!slug || typeof localStorage === "undefined") return;
	const index = [slug, ...readIndex().filter((s) => s !== slug)];
	while (index.length > MAX_PROFILES) {
		const old = index.pop();
		if (old) safeRemoveItem(cacheKey(old));
	}

	let existing: Record<string, unknown> = {};
	try {
		const raw = localStorage.getItem(cacheKey(slug));
		if (raw) existing = JSON.parse(raw) || {};
	} catch {}
	const next = { ...existing, ...updates };
	if (Array.isArray(next.posts))
		next.posts = next.posts.slice(0, PROFILE_CACHE_POSTS);

	if (safeSetItem(cacheKey(slug), JSON.stringify(next)))
		safeSetItem(INDEX_KEY, JSON.stringify(index));
}

export function removeProfileCache(slug: string): void {
	safeRemoveItem(cacheKey(slug));
	safeSetItem(
		INDEX_KEY,
		JSON.stringify(readIndex().filter((s) => s !== slug)),
	);
}
