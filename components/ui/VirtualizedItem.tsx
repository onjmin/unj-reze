"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

interface VirtualizedItemProps {
	children: ReactNode;
	/** ファーストビュー内の項目はtrueにして初回描画からマウントする */
	initialVisible?: boolean;
	/** 未計測時のプレースホルダー高さ(px) */
	estimatedHeight?: number;
	/** ビューポート外でも描画を維持する余白(px) */
	overscan?: number;
}

/**
 * 画面外の重い項目をアンマウントして固定高さのプレースホルダーに置き換える仮想化ラッパー。
 * 低スペック端末でのスクロール負荷（レイアウト・描画・タイマー）を項目数に依存しなくする。
 */
export default function VirtualizedItem({
	children,
	initialVisible = false,
	estimatedHeight = 170,
	overscan = 800,
}: VirtualizedItemProps) {
	const ref = useRef<HTMLDivElement>(null);
	// null = 描画中 / number = プレースホルダー表示中（その高さで場所を確保）
	const [placeholderHeight, setPlaceholderHeight] = useState<number | null>(
		initialVisible ? null : estimatedHeight,
	);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (typeof IntersectionObserver === "undefined") {
			const id = requestAnimationFrame(() => setPlaceholderHeight(null));
			return () => cancelAnimationFrame(id);
		}
		// 暗黙のroot(ビューポート)はiframe内でrootMarginが無視されるため、
		// 実際にスクロールしている祖先要素をrootに指定する
		let root: Element | null = null;
		for (let cur = el.parentElement; cur; cur = cur.parentElement) {
			const { overflowY } = getComputedStyle(cur);
			if (overflowY === "auto" || overflowY === "scroll") {
				root = cur;
				break;
			}
		}
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[entries.length - 1];
				if (entry.isIntersecting) {
					setPlaceholderHeight(null);
				} else {
					// アンマウント前に実測高さを残し、スクロール位置のズレを防ぐ
					setPlaceholderHeight(el.offsetHeight);
				}
			},
			{ root, rootMargin: `${overscan}px 0px` },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [overscan]);

	const visible = placeholderHeight === null;

	return (
		<div ref={ref} style={visible ? undefined : { height: placeholderHeight }}>
			{visible ? children : null}
		</div>
	);
}
