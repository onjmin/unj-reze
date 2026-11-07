"use client";

/**
 * 自分が押した いいね／わるいね／ハート を端末（localStorage）に覚えておく。
 *
 * サーバーは「誰が押したか」をDBに持たず、押下済みの判定はインメモリ（lib/security/vote-guard.ts）
 * なので、Workers では isolate が替わるたびに `liked` が false に戻っていた。リロード後は押していない
 * 表示になり、もう一度押すと 60 秒以内なら重複として巻き戻り、それ以降なら二重に数えられていた。
 * ここで押した記録を持ち、API の応答（lib/api.ts fetcher）に重ねて表示を戻し、
 * 押下済みの投稿は送信しない（usePostActions など）。
 *
 * 端末ごとの記録なので別ブラウザ・別端末では効かない（厳密な1人1票には投票行の表が要る）。
 */

const STORAGE_KEY = "unj_local_votes_v1";
/** 古いものから捨てる。1件40バイト程度なので 3000 件でも 120KB に収まる */
const MAX_ENTRIES = 3000;

type Vote = "like" | "dislike";

interface Store {
	votes: Record<string, Vote>;
	hearts: Record<string, 1>;
}

let cache: Store | null = null;

function load(): Store {
	if (cache) return cache;
	cache = { votes: {}, hearts: {} };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object") {
				if (parsed.votes && typeof parsed.votes === "object")
					cache.votes = parsed.votes;
				if (parsed.hearts && typeof parsed.hearts === "object")
					cache.hearts = parsed.hearts;
			}
		}
	} catch {
		// 読めない（プライベートモード等）ときは記録なしで動く
	}
	return cache;
}

/** 挿入順で古いものを落とす（JS のオブジェクトは文字列キーを挿入順に保つ） */
function trim<V>(rec: Record<string, V>) {
	const keys = Object.keys(rec);
	for (let i = 0; i < keys.length - MAX_ENTRIES; i++) delete rec[keys[i]];
}

function save() {
	if (!cache) return;
	trim(cache.votes);
	trim(cache.hearts);
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
	} catch {
		// 容量超過などは諦める（表示が戻らないだけ）
	}
}

export function getLocalVote(postId: string): Vote | undefined {
	return load().votes[String(postId)];
}

export function hasLocalHeart(postId: string): boolean {
	return !!load().hearts[String(postId)];
}

export function recordLocalVote(postId: string, vote: Vote) {
	load().votes[String(postId)] = vote;
	save();
}

export function recordLocalHeart(postId: string) {
	load().hearts[String(postId)] = 1;
	save();
}

/**
 * API 応答の中の投稿（`liked`/`disliked` を持つオブジェクト）に、端末の記録を重ねる。
 * 一覧・詳細・返信・検索など応答の形はまちまちなので、配列とオブジェクトを辿って投稿らしいものを探す。
 * サーバーが押下済みと返したものはそのまま残す（OR）。
 */
export function applyLocalVotes<T>(data: T): T {
	if (typeof window === "undefined") return data;
	const store = load();
	if (Object.keys(store.votes).length === 0) return data;
	const visit = (v: unknown, depth: number) => {
		if (depth > 6 || !v || typeof v !== "object") return;
		if (Array.isArray(v)) {
			for (const item of v) visit(item, depth + 1);
			return;
		}
		const o = v as Record<string, unknown>;
		if (
			(typeof o.id === "string" || typeof o.id === "number") &&
			typeof o.liked === "boolean" &&
			typeof o.disliked === "boolean"
		) {
			const vote = store.votes[String(o.id)];
			if (vote === "like") o.liked = true;
			else if (vote === "dislike") o.disliked = true;
		}
		for (const key of ["replies", "posts", "items", "post"]) {
			if (key in o) visit(o[key], depth + 1);
		}
	};
	visit(data, 0);
	return data;
}
