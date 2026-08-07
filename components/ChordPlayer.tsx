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
				instRef.current?.setVolume(applyMasterVolume(50)),
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
				volume: applyMasterVolume(50),
				onStop: () => {
					claimedRef.current = false;
					focusRef.current.releaseFocus(id);
				},
			});
			instRef.current = inst;

			const onClick = () => {
				requestAnimationFrame(() => {
					if (inst?.isPlaying() && !claimedRef.current) {
						claimedRef.current = true;
						focusRef.current.requestFocus(id, () => inst?.stop());
					}
				});
			};
			el.addEventListener("click", onClick);
			cleanup = () => el.removeEventListener("click", onClick);
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
