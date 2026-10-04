"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * 要素がビューポート（＋上下 overscan px）に入っているかを返す。
 * IntersectionObserver が無い環境では常に true。
 *
 * 暗黙の root（ビューポート）は iframe 内で rootMargin が無視されるので、
 * 実際にスクロールしている祖先要素を root にする（VirtualizedItem と同じ理由）。
 */
export function useNearViewport(
	ref: RefObject<HTMLElement | null>,
	overscan = 600,
): boolean {
	const [near, setNear] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (typeof IntersectionObserver === "undefined") {
			const id = requestAnimationFrame(() => setNear(true));
			return () => cancelAnimationFrame(id);
		}
		let root: Element | null = null;
		for (let cur = el.parentElement; cur; cur = cur.parentElement) {
			const { overflowY } = getComputedStyle(cur);
			if (overflowY === "auto" || overflowY === "scroll") {
				root = cur;
				break;
			}
		}
		const observer = new IntersectionObserver(
			(entries) => setNear(entries[entries.length - 1].isIntersecting),
			{ root, rootMargin: `${overscan}px 0px` },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref, overscan]);

	return near;
}
