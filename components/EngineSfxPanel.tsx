"use client";

import { Check, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	GAME_SFX_FILES,
	GAME_SFX_LABELS,
	type GameSfxKey,
	gameSfxUrl,
} from "@/lib/game-sfx";
import type { PickResult } from "./ContentPicker";

interface EngineSfxPanelProps {
	onPick: (res: PickResult) => void;
	onPlayPreview?: (stopFn: () => void) => void;
}

const KEYS = Object.keys(GAME_SFX_FILES) as GameSfxKey[];

/** 効果音ピッカーの「内蔵SE」タブ。ゲームエンジン内蔵のオリジナル効果音（lib/game-sfx.ts）を
 *  試聴して選ぶ。選んだ音は `direct:/assets/game-sfx/…` の参照になる。 */
export default function EngineSfxPanel({
	onPick,
	onPlayPreview,
}: EngineSfxPanelProps) {
	const [previewKey, setPreviewKey] = useState<GameSfxKey | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const stopPreview = () => {
		audioRef.current?.pause();
		audioRef.current = null;
		setPreviewKey(null);
	};

	// 試聴中にタブを切り替える・ピッカーを閉じるなどでアンマウントされても鳴り続けないよう、必ず止める。
	useEffect(
		() => () => {
			audioRef.current?.pause();
			audioRef.current = null;
		},
		[],
	);

	const preview = (key: GameSfxKey) => {
		if (previewKey === key) {
			stopPreview();
			return;
		}
		onPlayPreview?.(() => {
			audioRef.current?.pause();
			audioRef.current = null;
			setPreviewKey(null);
		});
		stopPreview();
		const a = new Audio(gameSfxUrl(key));
		a.volume = 0.6;
		a.onended = () => setPreviewKey((k) => (k === key ? null : k));
		a.play().catch(() => {});
		audioRef.current = a;
		setPreviewKey(key);
	};

	const pick = (key: GameSfxKey) => {
		stopPreview();
		const url = gameSfxUrl(key);
		onPick({
			ref: `direct:${url}`,
			url,
			label: `内蔵SE ${GAME_SFX_LABELS[key]}`,
		});
	};

	return (
		<div className="flex flex-col gap-2">
			<p className="text-[10px] text-gray-600 px-0.5">
				ゲームエンジン内蔵のオリジナル効果音です（このサイトで合成した音で、自由に使えます）。
			</p>
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
				{KEYS.map((key) => {
					const isPrev = previewKey === key;
					return (
						<div
							key={key}
							className="flex items-center gap-1.5 p-2 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900"
						>
							<button
								onClick={() => preview(key)}
								className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isPrev ? "bg-red-600/20 text-red-400" : "bg-gray-700 text-gray-300"}`}
								title={isPrev ? "試聴を停止" : "試聴（この音は選択されません）"}
							>
								{isPrev ? (
									<Square size={11} />
								) : (
									<Play size={11} className="ml-0.5" />
								)}
							</button>
							<span className="flex-1 min-w-0 text-[11px] text-gray-300 font-bold truncate">
								{GAME_SFX_LABELS[key]}
							</span>
							<button
								onClick={() => pick(key)}
								className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold bg-[#a3e635]/20 text-[#a3e635] hover:bg-[#a3e635]/30 active:bg-[#a3e635]/40"
								title="この効果音を選択"
							>
								<Check size={12} />
								選択
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
