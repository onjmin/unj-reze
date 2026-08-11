"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	DEFAULT_MV_ENTRANCE,
	DEFAULT_MV_EXIT,
	isMvEntranceInert,
	isMvExitInert,
	MV_ENTER_FROM_LABELS,
	MV_EXIT_TO_LABELS,
	MV_H,
	MV_STEPS_PER_BEAT,
	MV_W,
	type MvEnterFrom,
	type MvEntrance,
	type MvEntranceStyle,
	type MvExit,
	type MvExitTo,
	type MvLayer,
	type MvManifest,
} from "@/lib/mv-config";
import { drawMvFrame, EMPTY_SONG, type MvFrameState } from "@/lib/mv-engine";

interface TransitionPresetDef {
	id: MvEntranceStyle;
	name: string;
	category: "basic" | "motion" | "special";
	description: string;
	icon: string;
}

const TRANSITION_PRESETS: TransitionPresetDef[] = [
	{
		id: "none",
		name: "瞬時 (なし)",
		category: "basic",
		description: "演出なしでその場にパッと出入りします。",
		icon: "⚡",
	},
	{
		id: "fade",
		name: "フェード",
		category: "basic",
		description: "じわっと透明度が変化して滑らかに出入りします。",
		icon: "🌫️",
	},
	{
		id: "slide",
		name: "スライド",
		category: "motion",
		description: "指定した方向からスライドイン・スライドアウトします。",
		icon: "↔️",
	},
	{
		id: "zoom",
		name: "ズーム",
		category: "motion",
		description: "拡大しながら出現、または小さくなりながら消えます。",
		icon: "🔍",
	},
	{
		id: "zoomBounce",
		name: "ポップ",
		category: "motion",
		description: "跳ねるように勢いよく出現・縮んで退場します。",
		icon: "💥",
	},
	{
		id: "particle",
		name: "粒子 (ドット)",
		category: "special",
		description: "光るドット粒子が画面を覆う／分解して消えます。",
		icon: "❄️",
	},
	{
		id: "afterimage",
		name: "残像 (ゴースト)",
		category: "special",
		description: "軌跡の残像が集まって出現／散らばって消失します。",
		icon: "👻",
	},
	{
		id: "pixelate",
		name: "ドット分解",
		category: "special",
		description: "大きなレトロモザイクからクッキリ現れる・分解します。",
		icon: "👾",
	},
	{
		id: "flash",
		name: "フラッシュ",
		category: "special",
		description: "一瞬白く光りながら出現・消失します。",
		icon: "✨",
	},
	{
		id: "wipe",
		name: "ワイプ",
		category: "special",
		description: "画面端からカーテンが開閉するようにカットイン・アウトします。",
		icon: "🔪",
	},
];

const CATEGORY_LABELS: Record<string, string> = {
	basic: "🌟 基本",
	motion: "↔️ スライド・拡大縮小",
	special: "✨ 特殊エフェクト",
};

/** ライブプレビュー用コンポーネント */
function TransitionLivePreview({
	layer,
	entrance,
	exit,
	target,
	bpm = 120,
}: {
	layer: MvLayer;
	entrance?: MvEntrance;
	exit?: MvExit;
	target: "entrance" | "exit";
	bpm?: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// プレビュー用にダミーのレイヤーを作成
		const previewBeats =
			target === "entrance" ? (entrance?.beats ?? 2) : (exit?.beats ?? 2);
		const totalBeats = Math.max(4, previewBeats + 2);
		const totalSteps = totalBeats * MV_STEPS_PER_BEAT;

		const testLayer: MvLayer = {
			...layer,
			id: "preview-layer",
			barRange: [0, Math.ceil(totalBeats / 4)],
			entrance: target === "entrance" ? entrance : undefined,
			exit: target === "exit" ? exit : undefined,
		};

		const manifest: MvManifest = {
			version: 1,
			preset: "geometric",
			title: "",
			mml: "",
			audio: { mode: "soundfontKoe" },
			stage: {
				bgColor: "#12131a",
				bgFit: "cover",
				pulse: "none",
				fadeIn: false,
				fadeOut: false,
				palette: [],
			},
			sections: [],
			layers: [testLayer],
		};

		const song = { ...EMPTY_SONG, bpm: bpm > 0 ? bpm : 120, totalBars: 16 };
		const stepsPerSec = (song.bpm / 60) * MV_STEPS_PER_BEAT;
		let raf = 0;
		const start = performance.now();

		const loop = () => {
			const elapsed = (performance.now() - start) / 1000;
			// プレビュー用にループ再生させる (0 -> totalSteps)
			const currentStep = (elapsed * stepsPerSec) % (totalSteps + MV_STEPS_PER_BEAT);
			
			// Exitプレビュー時は退場が起きる直前のステップを与える
			let previewStep = currentStep;
			if (target === "exit") {
				const disappearStep = (testLayer.barRange?.[1] ?? 1) * 4 * MV_STEPS_PER_BEAT;
				previewStep = disappearStep - totalSteps + currentStep;
			}

			const frame: MvFrameState = {
				step: previewStep,
				timeSec: elapsed,
			};
			drawMvFrame(ctx, manifest, song, frame);
			raf = requestAnimationFrame(loop);
		};

		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [layer, entrance, exit, target, bpm]);

	return (
		<div className="relative overflow-hidden rounded-lg bg-black border border-gray-800">
			<canvas
				ref={canvasRef}
				width={MV_W}
				height={MV_H}
				className="block h-auto w-full"
				style={{ aspectRatio: `${MV_W} / ${MV_H}` }}
			/>
			<div className="absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-gray-300 backdrop-blur-sm">
				{target === "entrance" ? "✨ 登場プレビュー" : "✨ 退場プレビュー"}
			</div>
		</div>
	);
}

interface MvTransitionModalProps {
	layer: MvLayer;
	bpm?: number;
	initialTarget?: "entrance" | "exit";
	onApply: (entrance: MvEntrance | undefined, exit: MvExit | undefined) => void;
	onClose: () => void;
}

export default function MvTransitionModal({
	layer,
	bpm = 120,
	initialTarget = "entrance",
	onApply,
	onClose,
}: MvTransitionModalProps) {
	const [target, setTarget] = useState<"entrance" | "exit">(initialTarget);

	const [entrance, setEntrance] = useState<MvEntrance>(
		() => layer.entrance ?? { ...DEFAULT_MV_ENTRANCE, style: "fade" },
	);
	const [exit, setExit] = useState<MvExit>(
		() => layer.exit ?? { ...DEFAULT_MV_EXIT, style: "fade" },
	);

	const currentStyle =
		target === "entrance"
			? (entrance.style ?? (entrance.from !== "none" ? "slide" : "fade"))
			: (exit.style ?? (exit.to !== "none" ? "slide" : "fade"));

	const handleSelectStyle = (style: MvEntranceStyle) => {
		if (target === "entrance") {
			setEntrance((prev) => ({
				...prev,
				style,
				from: style === "slide" || style === "wipe" ? (prev.from === "none" ? "left" : prev.from) : prev.from,
			}));
		} else {
			setExit((prev) => ({
				...prev,
				style,
				to: style === "slide" || style === "wipe" ? (prev.to === "none" ? "right" : prev.to) : prev.to,
			}));
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center">
			<div className="flex h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-gray-900 sm:h-[88vh] sm:rounded-xl">
				{/* ヘッダー */}
				<div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
					<div className="flex items-center gap-2">
						<Sparkles className="h-4 w-4 text-blue-400" />
						<span className="text-sm font-bold text-gray-100">
							演出設定: {layer.name || layer.kind}
						</span>
					</div>
					<button
						onClick={onClose}
						className="rounded p-1 text-gray-400 hover:bg-gray-800"
					>
						<X size={18} />
					</button>
				</div>

				{/* 登場／退場 タブ切替 */}
				<div className="flex border-b border-gray-800 bg-gray-950/50 p-1">
					<button
						onClick={() => setTarget("entrance")}
						className={`flex-1 rounded-md py-2 text-xs font-bold transition-colors ${
							target === "entrance"
								? "bg-blue-600 text-white"
								: "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
						}`}
					>
						✨ 登場 (フェードイン)
					</button>
					<button
						onClick={() => setTarget("exit")}
						className={`flex-1 rounded-md py-2 text-xs font-bold transition-colors ${
							target === "exit"
								? "bg-purple-600 text-white"
								: "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
						}`}
					>
						✨ 退場 (フェードアウト)
					</button>
				</div>

				{/* ライブプレビュー (画面上部固定) */}
				<div className="shrink-0 space-y-2 border-b border-gray-800 p-3">
					<TransitionLivePreview
						layer={layer}
						entrance={entrance}
						exit={exit}
						target={target}
						bpm={bpm}
					/>
				</div>

				{/* 設定オプション & プリセットグリッド */}
				<div className="flex-1 space-y-4 overflow-y-auto p-3">
					{/* 長さ・方向・パラメータ設定 */}
					<div className="space-y-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
						<p className="text-[11px] font-bold text-gray-300">
							{target === "entrance" ? "登場の設定" : "退場の設定"}
						</p>

						{/* 拍数 */}
						<div className="flex items-center justify-between">
							<span className="text-[11px] text-gray-400">演出の長さ (拍)</span>
							<div className="flex gap-1">
								{[0.5, 1, 2, 4].map((b) => {
									const val = target === "entrance" ? entrance.beats : exit.beats;
									return (
										<button
											key={b}
											onClick={() =>
												target === "entrance"
													? setEntrance({ ...entrance, beats: b })
													: setExit({ ...exit, beats: b })
											}
											className={`rounded px-2 py-1 text-[10px] font-bold ${
												val === b
													? "bg-blue-600 text-white"
													: "bg-gray-800 text-gray-400 hover:bg-gray-700"
											}`}
										>
											{b}拍
										</button>
									);
								})}
							</div>
						</div>

						{/* 方向 (スライドまたはワイプ選択時) */}
						{(currentStyle === "slide" || currentStyle === "wipe") && (
							<div className="flex items-center justify-between">
								<span className="text-[11px] text-gray-400">
									{target === "entrance" ? "出てくる向き" : "消えていく方向"}
								</span>
								<select
									value={target === "entrance" ? entrance.from : exit.to}
									onChange={(e) => {
										const v = e.target.value;
										if (target === "entrance") {
											setEntrance({ ...entrance, from: v as MvEnterFrom });
										} else {
											setExit({ ...exit, to: v as MvExitTo });
										}
									}}
									className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-200"
								>
									{Object.entries(
										target === "entrance" ? MV_ENTER_FROM_LABELS : MV_EXIT_TO_LABELS,
									).map(([k, label]) => (
										<option key={k} value={k}>
											{label}
										</option>
									))}
								</select>
							</div>
						)}

						{/* 不透明度の変化 (フェード) */}
						<label className="flex items-center justify-between cursor-pointer">
							<span className="text-[11px] text-gray-400">
								不透明度を変化させる (フェード)
							</span>
							<input
								type="checkbox"
								checked={target === "entrance" ? entrance.fade : exit.fade}
								onChange={(e) =>
									target === "entrance"
										? setEntrance({ ...entrance, fade: e.target.checked })
										: setExit({ ...exit, fade: e.target.checked })
								}
								className="h-4 w-4 rounded border-gray-700 bg-gray-800 accent-blue-600"
							/>
						</label>
					</div>

					{/* プリセット選択グリッド */}
					{(["basic", "motion", "special"] as const).map((cat) => {
						const presets = TRANSITION_PRESETS.filter((p) => p.category === cat);
						return (
							<div key={cat} className="space-y-1.5">
								<p className="text-[11px] font-bold text-gray-400">
									{CATEGORY_LABELS[cat]}
								</p>
								<div className="grid grid-cols-2 gap-2">
									{presets.map((p) => {
										const isSelected = currentStyle === p.id;
										return (
											<button
												key={p.id}
												onClick={() => handleSelectStyle(p.id)}
												className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors ${
													isSelected
														? "border-blue-500 bg-blue-500/20 text-blue-200 font-bold"
														: "border-gray-800 bg-gray-800/60 text-gray-300 hover:bg-gray-800"
												}`}
											>
												<div className="flex items-center gap-1.5">
													<span className="text-sm">{p.icon}</span>
													<span className="text-[12px]">{p.name}</span>
												</div>
												<p className="text-[10px] text-gray-400 leading-tight">
													{p.description}
												</p>
											</button>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>

				{/* フッター */}
				<div className="flex shrink-0 gap-2 border-t border-gray-800 p-3">
					<button
						onClick={onClose}
						className="flex-1 rounded-lg border border-gray-700 py-2.5 text-sm text-gray-300"
					>
						キャンセル
					</button>
					<button
						onClick={() => {
							onApply(
								isMvEntranceInert(entrance) ? undefined : entrance,
								isMvExitInert(exit) ? undefined : exit,
							);
							onClose();
						}}
						className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white"
					>
						設定を適用
					</button>
				</div>
			</div>
		</div>
	);
}
