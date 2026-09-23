"use client";

import { useEffect, useRef } from "react";

/**
 * Ctrl+S（Mac は Cmd+S）で作品データを手元に保存する。
 *
 * 作成画面の Ctrl+S は「投稿」ではなく「ローカル保存」に揃えている。
 * 投稿は取り消しが効かないので、保存のつもりで押した指が公開に繋がらないようにする。
 * 入力欄にフォーカスがあっても横取りする（放っておくとブラウザの「ページを保存」になるだけ）。
 *
 * `save` は毎レンダーの最新を呼ぶので、state を閉じ込めた関数をそのまま渡してよい。
 * `enabled` が false の間（再生専用の埋め込みなど）は何もしない。
 */
export function useSaveShortcut(save: () => void, enabled = true) {
	const saveRef = useRef(save);
	useEffect(() => {
		saveRef.current = save;
	});

	useEffect(() => {
		if (!enabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
			if (e.key.toLowerCase() !== "s" && e.code !== "KeyS") return;
			e.preventDefault();
			saveRef.current();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [enabled]);
}
