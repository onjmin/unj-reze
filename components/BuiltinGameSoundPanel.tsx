"use client";

import { Check, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	TLDR_MUSIC,
	TLDR_SFX,
	type TldrMusicKey,
	type TldrSfxKey,
	tldrMusicUrl,
	tldrSfxUrl,
} from "@/lib/deltarune-tldr-assets";
import {
	SM127_MUSIC,
	SM127_SFX,
	type SM127MusicKey,
	type SM127SfxKey,
	sm127MusicUrl,
	sm127SfxUrl,
} from "@/lib/mario-sm127-assets";
import {
	MEGAMAN_MUSIC,
	MEGAMAN_SFX,
	type MegamanMusicKey,
	type MegamanSfxKey,
	megamanMusicUrl,
	megamanSfxUrl,
} from "@/lib/megaman-assets";
import {
	UNDERTALE_ENGINE_SOUNDS,
	undertaleSfxUrl,
} from "@/lib/undertale-engine-sfx";
import type { PickResult } from "./ContentPicker";

interface BuiltinGameSoundPanelProps {
	/** 'bgm'=BGM欄（ループ再生曲）、'sfx'=効果音欄（短い単発音） */
	kind: "bgm" | "sfx";
	onPick: (res: PickResult) => void;
	onPlayPreview?: (stopFn: () => void) => void;
}

type Source = "undertale" | "deltarune" | "mario" | "megaman";

interface Entry {
	key: string;
	label: string;
	url: string;
}

const SOURCE_LABEL: Record<Source, string> = {
	undertale: "💀 アンダーテール",
	deltarune: "🖤 デルタルーン",
	mario: "🍄 マリオ127",
	megaman: "🔫 ロックマンJS",
};

// 各ゲームプロジェクトの音源一覧を { key, label, url } に正規化する。
// undertale は効果音のみ（BGM収録なし）、mario/megaman はBGM・SEどちらも持つ。
function buildEntries(source: Source, kind: "bgm" | "sfx"): Entry[] {
	if (source === "undertale") {
		if (kind === "bgm") return [];
		return UNDERTALE_ENGINE_SOUNDS.map((name) => ({
			key: name,
			label: name,
			url: undertaleSfxUrl(name),
		}));
	}
	if (source === "deltarune") {
		if (kind === "bgm") {
			return (Object.keys(TLDR_MUSIC) as TldrMusicKey[]).map((k) => ({
				key: k,
				label: k,
				url: tldrMusicUrl(k),
			}));
		}
		return (Object.keys(TLDR_SFX) as TldrSfxKey[]).map((k) => ({
			key: k,
			label: k,
			url: tldrSfxUrl(k),
		}));
	}
	if (source === "mario") {
		if (kind === "bgm") {
			return (Object.keys(SM127_MUSIC) as SM127MusicKey[]).map((k) => ({
				key: k,
				label: k,
				url: sm127MusicUrl(k),
			}));
		}
		return (Object.keys(SM127_SFX) as SM127SfxKey[]).map((k) => ({
			key: k,
			label: k,
			url: sm127SfxUrl(k),
		}));
	}
	// megaman
	if (kind === "bgm") {
		return (Object.keys(MEGAMAN_MUSIC) as MegamanMusicKey[]).map((k) => ({
			key: k,
			label: k,
			url: megamanMusicUrl(k),
		}));
	}
	return (Object.keys(MEGAMAN_SFX) as MegamanSfxKey[]).map((k) => ({
		key: k,
		label: k,
		url: megamanSfxUrl(k),
	}));
}

function formatTime(sec: number) {
	if (!sec || isNaN(sec)) return "0:00";
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${s < 10 ? "0" : ""}${s}`;
}

const SOURCES: Source[] = ["undertale", "deltarune", "mario", "megaman"];

/** 内蔵の他プロジェクト音源タブ（アンダーテール／デルタルーン／マリオ127／ロックマンJS）。
 *  いずれもGitHub raw CDNで直接配信されている音声を直リンク（type: 'direct'）として選択する。 */
export default function BuiltinGameSoundPanel({
	kind,
	onPick,
	onPlayPreview,
}: BuiltinGameSoundPanelProps) {
	const sourcesAvailable = SOURCES.filter(
		(s) => buildEntries(s, kind).length > 0,
	);
	const [source, setSource] = useState<Source>(sourcesAvailable[0] ?? "mario");
	const [previewKey, setPreviewKey] = useState<string | null>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const entries = buildEntries(source, kind);

	const stopPreview = () => {
		audioRef.current?.pause();
		audioRef.current = null;
		setPreviewKey(null);
		setCurrentTime(0);
		setDuration(0);
	};

	// 試聴中に他タブへ切り替え・ピッカーを閉じるなどでこのコンポーネントがアンマウントされても、
	// new Audio() で作った要素はブラウザ側で再生され続け、参照を失うため二度と止められなくなる。
	// アンマウント時に必ず止める。
	useEffect(
		() => () => {
			audioRef.current?.pause();
			audioRef.current = null;
		},
		[],
	);

	const preview = (entry: Entry) => {
		if (previewKey === entry.key) {
			stopPreview();
			return;
		}

		onPlayPreview?.(() => {
			audioRef.current?.pause();
			audioRef.current = null;
			setPreviewKey(null);
		});

		stopPreview();
		const a = new Audio(entry.url);
		a.volume = 0.6;
		a.ontimeupdate = () => setCurrentTime(a.currentTime);
		a.onloadedmetadata = () => setDuration(a.duration);
		a.onended = () => {
			setPreviewKey((k) => (k === entry.key ? null : k));
			setCurrentTime(0);
		};
		a.play().catch(() => {});
		audioRef.current = a;
		setPreviewKey(entry.key);
		setCurrentTime(0);
		setDuration(0);
	};

	const pick = (entry: Entry) => {
		stopPreview();
		onPick({
			ref: `direct:${entry.url}`,
			url: entry.url,
			label: `${SOURCE_LABEL[source]} ${entry.label}`,
		});
	};

	const secBtn = (active: boolean) =>
		`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${active ? "bg-blue-600 text-white border-blue-500" : "bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800"}`;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-1.5">
				{sourcesAvailable.map((s) => (
					<button
						key={s}
						className={secBtn(source === s)}
						onClick={() => {
							stopPreview();
							setSource(s);
						}}
					>
						{SOURCE_LABEL[s]}
					</button>
				))}
			</div>
			<p className="text-[10px] text-gray-600 px-0.5">
				他ゲームプロジェクトの{kind === "bgm" ? "BGM" : "効果音"}
				をGitHubから直接読み込みます（商用利用不可・出典クレジット推奨）。
			</p>
			<div className="space-y-1.5 max-h-72 overflow-y-auto">
				{entries.map((entry) => {
					const isPrev = previewKey === entry.key;
					return (
						<div
							key={entry.key}
							className="flex items-center gap-1.5 p-2 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900"
						>
							<button
								onClick={() => preview(entry)}
								className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isPrev ? "bg-red-600/20 text-red-400" : "bg-gray-700 text-gray-300"}`}
								title={isPrev ? "試聴を停止" : "試聴（この曲は選択されません）"}
							>
								{isPrev ? (
									<Square size={11} />
								) : (
									<Play size={11} className="ml-0.5" />
								)}
							</button>
							<div className="flex-1 min-w-0 flex flex-col gap-1">
								<div className="flex items-center justify-between gap-1">
									<span className="text-[11px] text-gray-300 font-bold truncate">
										{entry.label}
									</span>
									{isPrev && duration > 0 && (
										<span className="text-[9px] text-gray-400 font-mono shrink-0">
											{formatTime(currentTime)} / {formatTime(duration)}
										</span>
									)}
								</div>
								{isPrev && (
									<input
										type="range"
										min={0}
										max={duration || 100}
										step={0.1}
										value={currentTime}
										onChange={(e) => {
											const val = Number(e.target.value);
											if (audioRef.current) {
												audioRef.current.currentTime = val;
												setCurrentTime(val);
											}
										}}
										onClick={(e) => e.stopPropagation()}
										className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
									/>
								)}
							</div>
							<button
								onClick={() => pick(entry)}
								className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold bg-[#a3e635]/20 text-[#a3e635] hover:bg-[#a3e635]/30 active:bg-[#a3e635]/40"
								title="この曲をBGMとして選択"
							>
								<Check size={12} />
								選択
							</button>
						</div>
					);
				})}
				{entries.length === 0 && (
					<p className="text-center text-[11px] text-gray-600 py-8">
						音源がありません
					</p>
				)}
			</div>
		</div>
	);
}
