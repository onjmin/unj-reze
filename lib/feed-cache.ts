"use client";

/**
 * タイムライン(app/page.tsx)の「一覧＋スクロール位置」をメモリ上に1件だけ保持する。
 *
 * app/page.tsx は独立ルート（/post/[id] など）へ遷移すると丸ごとアンマウントされ、
 * 戻ってきた際に再マウント→fetchPosts() が走って posts が最新ページで作り直されるため、
 * どれだけスクロールしていても先頭に戻ってしまっていた。
 * ここに直前の一覧とスクロール位置をキャッシュしておき、同じタブ/モードに戻ってきたときは
 * サーバー応答を待たずにそれを描画してスクロール位置も復元する。
 * モジュールスコープの変数なのでクライアント内ナビゲーション中は生き続けるが、
 * タブの再読み込みでは消える（sessionStorage 化するには Post[] が大きすぎるため意図的に避けている）。
 */

import type { Post } from "./types";

interface FeedCacheEntry {
	key: string;
	posts: Post[];
	hasMorePosts: boolean;
	scrollTop: number;
	savedAt: number;
}

/** これより古いキャッシュは使わず、通常どおりサーバーから取り直す。 */
const MAX_AGE_MS = 5 * 60_000;

let cache: FeedCacheEntry | null = null;

export function buildFeedCacheKey(parts: {
	currentNav: string;
	topTab: string;
	feedSubMode: string;
	rankCategory: string;
	bbsMode: string;
	viewerId: string;
}): string {
	return [
		parts.currentNav,
		parts.topTab,
		parts.feedSubMode,
		parts.rankCategory,
		parts.bbsMode,
		parts.viewerId,
	].join("|");
}

export function readFeedCache(key: string): FeedCacheEntry | null {
	if (!cache || cache.key !== key) return null;
	if (Date.now() - cache.savedAt > MAX_AGE_MS) return null;
	return cache;
}

export function writeFeedCache(
	key: string,
	posts: Post[],
	hasMorePosts: boolean,
): void {
	cache = {
		key,
		posts,
		hasMorePosts,
		scrollTop: cache && cache.key === key ? cache.scrollTop : 0,
		savedAt: Date.now(),
	};
}

export function writeFeedCacheScrollTop(key: string, scrollTop: number): void {
	if (!cache || cache.key !== key) return;
	cache.scrollTop = scrollTop;
}
