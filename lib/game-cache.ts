"use client";

import type { GameRankingEntry } from "./types";

/** ランキング等の一覧で取得済みのゲームを sessionStorage に置いておき、
 *  ゲーム単独ページ（/game/[id]）がサーバー側のフェッチを待たずに
 *  即描画するために使う。post-cache.ts と同じ狙い・同じ作り。 */

const PREFIX = "unj_game_";
const INDEX_KEY = "unj_game_keys";
/** 貯めすぎて sessionStorage を圧迫しないための上限（古いものから捨てる）。 */
const MAX_ENTRIES = 30;

function readIndex(): string[] {
	try {
		const raw = sessionStorage.getItem(INDEX_KEY);
		const arr = raw ? JSON.parse(raw) : [];
		return Array.isArray(arr) ? arr : [];
	} catch {
		return [];
	}
}

/** 一覧からゲーム単独ページへ遷移する直前に呼ぶ。id をキーにスナップショットを保存する。 */
export function cacheGame(game: GameRankingEntry | null | undefined): void {
	if (!game?.id || typeof sessionStorage === "undefined") return;
	try {
		sessionStorage.setItem(`${PREFIX}${game.id}`, JSON.stringify(game));
		const index = readIndex().filter((id) => id !== game.id);
		index.push(game.id);
		while (index.length > MAX_ENTRIES) {
			const oldest = index.shift();
			if (oldest) sessionStorage.removeItem(`${PREFIX}${oldest}`);
		}
		sessionStorage.setItem(INDEX_KEY, JSON.stringify(index));
	} catch {
		// 容量超過やプライベートモード等では黙って諦める（通常のローディング表示になるだけ）
	}
}

/** ゲーム単独ページ側で使う。無ければ null（＝従来どおりスピナー表示）。 */
export function readCachedGame(id: string): GameRankingEntry | null {
	if (!id || typeof sessionStorage === "undefined") return null;
	try {
		const raw = sessionStorage.getItem(`${PREFIX}${id}`);
		return raw ? (JSON.parse(raw) as GameRankingEntry) : null;
	} catch {
		return null;
	}
}
