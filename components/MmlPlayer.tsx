"use client";

import type { MmlPlayerInstance } from "@onjmin/dtm";
import { useEffect, useId, useRef } from "react";
import { useAudioFocus } from "@/lib/audio-focus-context";
import { getStudio } from "@/lib/dtm";

interface MmlPlayerProps {
	mml: string;
}

// 再生UIは共有スタジオ経由の mountPlayer で実装する。
// 楽器プリセット・ドラム・歌声がすべて鳴り、編集UIと音色が一致する。
// フィードに多数並んでも getStudio() はシングルトンなので AudioContext は1つだけ。
//
// サイト全体の音量（読者の好み）は getStudio() 内で studio.setMasterVolume() に
// 一本化済みなので、ここでは曲側の #volume= に一切触れない（options.volume /
// masterVolume は指定しない＝MMLに書かれた作曲者の意図のまま鳴らす）。
export default function MmlPlayer({ mml }: MmlPlayerProps) {
	const id = useId();
	const { requestFocus, releaseFocus } = useAudioFocus();
	const containerRef = useRef<HTMLDivElement>(null);
	const claimedRef = useRef(false);
	const focusRef = useRef({ requestFocus, releaseFocus });
	useEffect(() => {
		focusRef.current = { requestFocus, releaseFocus };
	}, [requestFocus, releaseFocus]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		let inst: MmlPlayerInstance | null = null;
		let disposed = false;

		let cleanup: (() => void) | null = null;

		getStudio().then((studio) => {
			if (disposed || !el) return;
			inst = studio.mountPlayer(el, mml, {
				onStop: () => {
					claimedRef.current = false;
					focusRef.current.releaseFocus(id);
				},
			});

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
			focusRef.current.releaseFocus(id);
			claimedRef.current = false;
			inst = null;
		};
	}, [mml, id]);

	return <div ref={containerRef} className="mb-2.5" />;
}
