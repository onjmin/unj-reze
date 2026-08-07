"use client";

import { Volume, Volume1, Volume2, VolumeOff, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
	getMasterVolume,
	getMuted,
	setMasterVolume,
	setMuted,
	subscribeMasterVolume,
	subscribeMuted,
} from "@/lib/master-volume";

const SERVER_VOLUME = () => 50;
const SERVER_MUTED = () => false;

/** ヘッダー用マスター音量コントロール。スピーカーアイコン→クリックでスライダーをポップアップ表示する。
 *  MML投稿・YouTube埋め込み・ゲーム画面のBGM/SFXへ一律で掛かる音量倍率をここで操作する。 */
export default function VolumeControl() {
	const volume = useSyncExternalStore(
		(onChange) => subscribeMasterVolume(() => onChange()),
		getMasterVolume,
		SERVER_VOLUME,
	);
	const muted = useSyncExternalStore(
		(onChange) => subscribeMuted(() => onChange()),
		getMuted,
		SERVER_MUTED,
	);
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [open]);

	return (
		<div className="relative z-50" ref={rootRef}>
			<button
				onClick={() => setOpen((v) => !v)}
				className={`p-1.5 rounded-full transition-colors ${open ? "bg-gray-100/10 text-gray-300" : "text-gray-500 hover:bg-gray-100/10 hover:text-gray-300"}`}
				aria-label="音量"
				title={muted ? "音量 ミュート中" : `音量 ${volume}`}
			>
				{muted ? (
					<VolumeOff size={20} />
				) : volume === 0 ? (
					<VolumeX size={20} />
				) : volume <= 30 ? (
					<Volume size={20} />
				) : volume <= 60 ? (
					<Volume1 size={20} />
				) : (
					<Volume2 size={20} />
				)}
			</button>
			{open && (
				<div className="absolute right-0 top-full mt-1 z-50 w-40 bg-[#1a1a2e] border border-gray-700 rounded-lg shadow-2xl p-3">
					<div className="flex items-center justify-between mb-1.5">
						<span className="text-[10px] text-gray-400 font-bold">音量</span>
						<span className="text-[10px] text-gray-300 font-mono">
							{muted ? "—" : volume}
						</span>
					</div>
					<div className="flex items-center gap-1.5">
						<button
							onClick={() => setMuted(!muted)}
							className={`shrink-0 p-1 rounded transition-colors ${muted ? "text-red-400 bg-red-400/10" : "text-gray-400 hover:text-gray-200 hover:bg-gray-100/10"}`}
							aria-label={muted ? "ミュート解除" : "ミュート"}
							title={muted ? "ミュート解除" : "ミュート"}
						>
							{muted ? <VolumeOff size={14} /> : <VolumeX size={14} />}
						</button>
						<input
							type="range"
							min={0}
							max={100}
							value={volume}
							onChange={(e) => setMasterVolume(Number(e.target.value))}
							className="w-full accent-[#a3e635]"
							disabled={muted}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
