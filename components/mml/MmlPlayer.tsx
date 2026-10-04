"use client";

import type { MmlPlayerInstance } from "@onjmin/dtm";
import { useEffect, useId, useRef, useState } from "react";
import { useAudioFocus } from "@/lib/audio/audio-focus-context";
import { useNearViewport } from "@/lib/hooks/useNearViewport";
import { getStudio } from "@/lib/mml/dtm";

interface MmlPlayerProps {
	mml: string;
}

/** 一度もマウントしていないときの仮の高さ。トラック1〜2本のプレイヤーの実測値 */
const ESTIMATED_HEIGHT = 189;

// 再生UIは共有スタジオ経由の mountPlayer で実装する。
// 楽器プリセット・ドラム・歌声がすべて鳴り、編集UIと音色が一致する。
// フィードに多数並んでも getStudio() はシングルトンなので AudioContext は1つだけ。
//
// サイト全体の音量（読者の好み）は getStudio() 内で studio.setMasterVolume() に
// 一本化済みなので、ここでは曲側の #volume= に一切触れない（options.volume /
// masterVolume は指定しない＝MMLに書かれた作曲者の意図のまま鳴らす）。
//
// mountPlayer は音符を1個ずつ DOM で描き、マウント時に音色も先読みする。
// MML の返信が20件並ぶスレで DOM が4万ノード・音色の取得が20本を超えて重かったので、
// 画面の近くにあるときだけマウントし、離れたら（鳴っていなければ）片付ける。
export default function MmlPlayer({ mml }: MmlPlayerProps) {
	const id = useId();
	const { requestFocus, releaseFocus } = useAudioFocus();
	const wrapRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const claimedRef = useRef(false);
	const focusRef = useRef({ requestFocus, releaseFocus });
	useEffect(() => {
		focusRef.current = { requestFocus, releaseFocus };
	}, [requestFocus, releaseFocus]);

	const near = useNearViewport(wrapRef);
	// 鳴っている間は画面外へスクロールしても片付けない（止まった時点で片付く）
	const [playing, setPlaying] = useState(false);
	const active = near || playing;
	// 片付けたあとも同じ高さで場所を取り、スクロール位置をずらさない
	const [placeholderHeight, setPlaceholderHeight] = useState(ESTIMATED_HEIGHT);

	useEffect(() => {
		const el = containerRef.current;
		if (!el || !active) return;

		let inst: MmlPlayerInstance | null = null;
		let disposed = false;

		let cleanup: (() => void) | null = null;

		getStudio().then((studio) => {
			if (disposed || !el) return;
			inst = studio.mountPlayer(el, mml, {
				onStop: () => {
					claimedRef.current = false;
					focusRef.current.releaseFocus(id);
					setPlaying(false);
				},
			});

			const onClick = () => {
				requestAnimationFrame(() => {
					if (inst?.isPlaying() && !claimedRef.current) {
						claimedRef.current = true;
						setPlaying(true);
						focusRef.current.requestFocus(id, () => inst?.stop());
					}
				});
			};
			el.addEventListener("click", onClick);
			cleanup = () => el.removeEventListener("click", onClick);
		});

		return () => {
			disposed = true;
			if (el.offsetHeight > 0) setPlaceholderHeight(el.offsetHeight);
			cleanup?.();
			inst?.destroy();
			el.replaceChildren();
			focusRef.current.releaseFocus(id);
			claimedRef.current = false;
			setPlaying(false);
			inst = null;
		};
	}, [mml, id, active]);

	return (
		<div
			ref={wrapRef}
			className="mb-2.5"
			style={active ? undefined : { height: placeholderHeight }}
		>
			<div ref={containerRef} />
		</div>
	);
}
