"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * 一覧の末尾（sentinel）が見えたら続きを読む。FeedList / BbsBoardView / MediaGrid で共有。
 *
 * - IntersectionObserver は交差が「変わった」ときしか発火しないので、読み込みが終わるたび
 *   （`loading` が false に戻るたび）に張り直す。件数の変化だけで張り直していたころは、
 *   読み込みが失敗したり全部重複だったりすると sentinel が見えたまま二度と発火せず、
 *   「自動読み込み中…」のまま止まっていた。
 * - `#scrollable-content` は overflow:visible で実際にスクロールするのは文書なので、
 *   スクロール監視は window にも付ける（要素側だけだと一度も発火しない）。
 *   iframe 内では rootMargin が効かないので、こちらが保険になる。
 * - IO が見えている sentinel にも即時通知しないことがある（裏タブ等）ので、張り直すたびに
 *   位置も直接見る。
 */
export function useLoadMoreSentinel({
	sentinelRef,
	onLoadMore,
	hasMore,
	loading,
	rearmKey,
}: {
	sentinelRef: RefObject<HTMLElement | null>;
	onLoadMore?: () => void;
	hasMore?: boolean;
	loading?: boolean;
	/** 一覧の件数など。変わったら張り直す（sentinel の位置が動くため）。 */
	rearmKey?: unknown;
}) {
	const onLoadMoreRef = useRef(onLoadMore);
	const hasMoreRef = useRef(hasMore);
	const loadingRef = useRef(loading);

	useEffect(() => {
		onLoadMoreRef.current = onLoadMore;
		hasMoreRef.current = hasMore;
		loadingRef.current = loading;
	});

	useEffect(() => {
		if (!hasMore || loading) return;
		const trigger = () => {
			if (hasMoreRef.current && !loadingRef.current && onLoadMoreRef.current)
				onLoadMoreRef.current();
		};

		const sentinel = sentinelRef.current;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) trigger();
			},
			{ rootMargin: "400px 0px 400px 0px", threshold: 0 },
		);
		if (sentinel) observer.observe(sentinel);

		const container = document.getElementById("scrollable-content");
		const handleScroll = () => {
			const el =
				container && container.scrollHeight > container.clientHeight
					? container
					: document.documentElement;
			if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) trigger();
		};
		window.addEventListener("scroll", handleScroll, { passive: true });
		container?.addEventListener("scroll", handleScroll, { passive: true });

		// 張り直した時点で既に末尾が見えているなら、IO の初回通知を待たずに引く
		// （裏タブ等では IO の通知が来ないことがある）。
		const timer = window.setTimeout(() => {
			if (sentinel && sentinel.getBoundingClientRect().top < window.innerHeight + 400)
				trigger();
		}, 0);

		return () => {
			window.clearTimeout(timer);
			observer.disconnect();
			window.removeEventListener("scroll", handleScroll);
			container?.removeEventListener("scroll", handleScroll);
		};
	}, [sentinelRef, hasMore, loading, rearmKey]);
}
