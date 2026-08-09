"use client";

import type { ChordPlayerInstance } from "@onjmin/dtm";
import { useEffect, useId, useRef } from "react";
import { useAudioFocus } from "@/lib/audio-focus-context";
import { getStudio } from "@/lib/dtm";
import { applyMasterVolume, subscribeMasterVolume } from "@/lib/master-volume";

interface ChordPlayerProps {
	chords: string;
}

// 再生UIは共有スタジオ経由の mountChordPlayer で実装する。
// コード進行のパース・ハイライト・再生はすべて @onjmin/dtm 側が担い、自前実装は不要。
export default function ChordPlayer({ chords }: ChordPlayerProps) {
	const id = useId();
	const { requestFocus, releaseFocus } = useAudioFocus();
	const containerRef = useRef<HTMLDivElement>(null);
	const claimedRef = useRef(false);
	const instRef = useRef<{ setVolume: (v: number) => void } | null>(null);
	const focusRef = useRef({ requestFocus, releaseFocus });
	useEffect(() => {
		focusRef.current = { requestFocus, releaseFocus };
	}, [requestFocus, releaseFocus]);

	useEffect(
		() =>
			subscribeMasterVolume(() =>
				instRef.current?.setVolume(applyMasterVolume(100)),
			),
		[],
	);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		let inst: ChordPlayerInstance | null = null;
		let disposed = false;

		let cleanup: (() => void) | null = null;

		getStudio().then((studio) => {
			if (disposed || !el) return;
			inst = studio.mountChordPlayer(el, chords, {
				volume: applyMasterVolume(100),
				onStop: () => {
					claimedRef.current = false;
					focusRef.current.releaseFocus(id);
				},
			});
			instRef.current = inst;

			// クリック起点のonClick+rAF一発判定だと、AudioContext.resume()等で再生開始が
			// 1フレームより遅れた場合にisPlaying()がまだfalseで取りこぼす（＝フォーカスを
			// 取れないまま2曲同時に鳴る）レースコンディションがあった。isPlaying()の
			// false→true遷移を定期ポーリングで拾う方式にして、クリック以外（内部UIの
			// 再生ボタン・キーボード操作等）で始まった再生も確実に検知できるようにする。
			let wasPlaying = false;
			const poll = window.setInterval(() => {
				const playing = !!inst?.isPlaying();
				if (playing && !wasPlaying && !claimedRef.current) {
					claimedRef.current = true;
					focusRef.current.requestFocus(id, () => inst?.stop());
				}
				wasPlaying = playing;
			}, 200);
			cleanup = () => window.clearInterval(poll);
		});

		return () => {
			disposed = true;
			cleanup?.();
			inst?.destroy();
			instRef.current = null;
			focusRef.current.releaseFocus(id);
			claimedRef.current = false;
			inst = null;
		};
	}, [chords, id]);

	return <div ref={containerRef} className="mb-2.5" />;
}
