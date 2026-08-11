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
	MV_TRANSITION_CATEGORY_LABELS,
	MV_TRANSITION_STYLE_CATEGORY,
	MV_TRANSITION_STYLE_DESCRIPTIONS,
	MV_TRANSITION_STYLE_LABELS,
	MV_W,
	resolveEntranceStyle,
	resolveExitStyle,
	type MvEnterFrom,
	type MvEntrance,
	type MvEntranceStyle,
	type MvExit,
	type MvExitTo,
	type MvLayer,
	type MvManifest,
	type MvTransitionCategory,
} from "@/lib/mv-config";
import { drawMvFrame, EMPTY_SONG, type MvFrameState } from "@/lib/mv-engine";

/**
 * プリセットの名前・説明・カテゴリ分けは `mv-config.ts` の
 * `MV_TRANSITION_STYLE_LABELS` / `_DESCRIPTIONS` / `_CATEGORY` が正。
 * 以前はここに同じ内容を別々に持っていて、エンジン側の型(`MvEntranceStyle`)に
 * 新しいスタイルを増やしてもこちらを直し忘れると一覧に出てこない、という
 * 二重管理の事故があった（"グリッチ"新設のタイミングで一本化した）。
 */
const CATEGORY_ORDER: MvTransitionCategory[] = ["basic", "movement", "decompose"];
const STYLE_ORDER = Object.keys(MV_TRANSITION_STYLE_LABELS) as MvEntranceStyle[];

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
	/**
	 * 「触った側だけ保存」の判定用。
	 *
	 * 以前は登場タブだけ編集して適用しても、退場が `layer.exit` に無かったのに
	 * 常に既定値（2拍フェード）が書き込まれていた——`exit` の初期stateが
	 * `DEFAULT_MV_EXIT`(=非inert)から始まるため、触っていなくても
	 * `onApply` はそれをそのまま渡してしまっていた。編集を始めた時点で真にする。
	 */
	const [touchedEntrance, setTouchedEntrance] = useState(!!layer.entrance);
	const [touchedExit, setTouchedExit] = useState(!!layer.exit);

	/** 触った印を付けながら更新する。以降の入力欄はすべてこれ経由にすること。 */
	const updateEntrance = (patch: Partial<MvEntrance>) => {
		setTouchedEntrance(true);
		setEntrance((prev) => ({ ...prev, ...patch }));
	};
	const updateExit = (patch: Partial<MvExit>) => {
		setTouchedExit(true);
		setExit((prev) => ({ ...prev, ...patch }));
	};

	// プリセットのハイライトは `isMvEntranceInert`/`isMvExitInert` と同じ判定式を
	// 使うこと。以前はここだけ `entrance.fade` の分岐を端折っていたため、
	// 「真に瞬時(なし)」の設定を開いても一覧では"フェード"が選ばれて見える食い違いがあった。
	const currentStyle =
		target === "entrance" ? resolveEntranceStyle(entrance) : resolveExitStyle(exit);

	const handleSelectStyle = (style: MvEntranceStyle) => {
		if (target === "entrance") {
			updateEntrance({
				style,
				from:
					style === "slide" || style === "wipe"
						? entrance.from === "none"
							? "left"
							: entrance.from
						: entrance.from,
			});
		} else {
			updateExit({
				style,
				to:
					style === "slide" || style === "wipe"
						? exit.to === "none"
							? "right"
							: exit.to
						: exit.to,
			});
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
						登場 (フェードイン)
					</button>
					<button
						onClick={() => setTarget("exit")}
						className={`flex-1 rounded-md py-2 text-xs font-bold transition-colors ${
							target === "exit"
								? "bg-purple-600 text-white"
								: "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
						}`}
					>
						退場 (フェードアウト)
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
													? updateEntrance({ beats: b })
													: updateExit({ beats: b })
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
											updateEntrance({ from: v as MvEnterFrom });
										} else {
											updateExit({ to: v as MvExitTo });
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
										? updateEntrance({ fade: e.target.checked })
										: updateExit({ fade: e.target.checked })
								}
								className="h-4 w-4 rounded border-gray-700 bg-gray-800 accent-blue-600"
							/>
						</label>
					</div>

					{/* プリセット選択グリッド */}
					{CATEGORY_ORDER.map((cat) => {
						const presets = STYLE_ORDER.filter(
							(id) => MV_TRANSITION_STYLE_CATEGORY[id] === cat,
						);
						if (presets.length === 0) return null;
						return (
							<div key={cat} className="space-y-1.5">
								<p className="text-[11px] font-bold text-gray-400">
									{MV_TRANSITION_CATEGORY_LABELS[cat]}
								</p>
								<div className="grid grid-cols-2 gap-2">
									{presets.map((id) => {
										const isSelected = currentStyle === id;
										return (
											<button
												key={id}
												onClick={() => handleSelectStyle(id)}
												className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors ${
													isSelected
														? "border-blue-500 bg-blue-500/20 text-blue-200 font-bold"
														: "border-gray-800 bg-gray-800/60 text-gray-300 hover:bg-gray-800"
												}`}
											>
												<div className="flex items-center gap-1.5">
													<span className="text-[12px]">
														{MV_TRANSITION_STYLE_LABELS[id]}
													</span>
												</div>
												<p className="text-[10px] text-gray-400 leading-tight">
													{MV_TRANSITION_STYLE_DESCRIPTIONS[id]}
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
							// 触っていない側は既存の値をそのまま持ち回す（未編集なら undefined→undefined）。
							// 以前はここで常に entrance/exit 両方をローカルstateの値で上書きしていたため、
							// 「登場だけ設定したいのに適用したら退場にも既定のフェードが付いていた」
							// という事故になっていた。
							onApply(
								touchedEntrance
									? isMvEntranceInert(entrance)
										? undefined
										: entrance
									: layer.entrance,
								touchedExit
									? isMvExitInert(exit)
										? undefined
										: exit
									: layer.exit,
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
