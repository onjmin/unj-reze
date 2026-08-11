"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
	MV_H,
	MV_STEPS_PER_BEAT,
	MV_W,
	type MvManifest,
	type MvSection,
	type MvShapeLayer,
} from "@/lib/mv-config";
import { EMPTY_SONG, drawMvFrame, type MvFrameState } from "@/lib/mv-engine";
import {
	type MvMotionCustomToggle,
	type MvSceneMotionConfig,
	DEFAULT_SCENE_MOTION,
	MV_BEAT_SYNC_SPEED_OPTIONS,
	MV_MOTION_PRESETS,
	resolveSceneModulators,
} from "@/lib/mv-shape-motion";

/** アイコン用の小さいSVGプレビュー（静止画。グリッド内で常時再生すると重いので線画だけ）。 */
function PresetIcon({ path }: { path: string }) {
	return (
		<svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
			<path d={path} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
		</svg>
	);
}

/** 今選んでいる組み合わせを実際に動かして見せる、モーダル上部のライブプレビュー。 */
function MotionLivePreview({
	baseLayer,
	modulators,
	bpm,
}: {
	baseLayer: MvShapeLayer;
	modulators: ReturnType<typeof resolveSceneModulators>;
	/** 実際の曲のBPM。省略時はEMPTY_SONGの既定値。 */
	bpm?: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const manifest: MvManifest = {
			version: 1,
			preset: "geometric",
			title: "",
			mml: "",
			audio: { mode: "soundfontKoe" },
			stage: {
				bgColor: "#111113",
				bgFit: "cover",
				pulse: "none",
				fadeIn: false,
				fadeOut: false,
				palette: [],
			},
			sections: [],
			layers: [{ ...baseLayer, id: "preview", modulators }],
		};
		// 実際の曲のBPMで動かさないと、ビート同期プリセットの体感速度が
		// 本編と食い違って見える（以前は120固定でズレていた）。
		const song = { ...EMPTY_SONG, bpm: bpm && bpm > 0 ? bpm : EMPTY_SONG.bpm };
		const stepsPerSec = (song.bpm / 60) * MV_STEPS_PER_BEAT;
		let raf = 0;
		const start = performance.now();
		const loop = () => {
			const elapsed = (performance.now() - start) / 1000;
			const frame: MvFrameState = { step: elapsed * stepsPerSec, timeSec: elapsed };
			drawMvFrame(ctx, manifest, song, frame);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [baseLayer, modulators, bpm]);

	return (
		<canvas
			ref={canvasRef}
			width={MV_W}
			height={MV_H}
			className="block h-auto w-full rounded bg-black"
			style={{ aspectRatio: `${MV_W} / ${MV_H}` }}
		/>
	);
}

interface MvShapeMotionModalProps {
	baseLayer: MvShapeLayer;
	sections: MvSection[];
	/** その場面が何小節あるか（`速さ`のフレーズ長をこの範囲内に収めるため）。 */
	sceneBars: (sectionId: string) => number;
	/** 実際の曲のBPM。プレビューの体感速度を本編と合わせるために使う。 */
	bpm?: number;
	initial?: Record<string, MvSceneMotionConfig>;
	/** 開いた直後に選んでおく場面タブ。省略時は sections の先頭。 */
	initialSceneId?: string;
	onApply: (perScene: Record<string, MvSceneMotionConfig>) => void;
	onClose: () => void;
}

/**
 * 「真ん中の図形の動き方設定」モーダル。
 * - 場面タブで切り替えながら、場面ごとに別々の動きを設定できる。
 * - プリセットはアイコングリッドから選ぶ（モバイルは2列）。
 * - 上部のライブプレビューが選んだ内容を即座に反映する。
 * - 「独自の動きを組み合わせる」でプリセットの上に移動/回転/拡大縮小を追加できる。
 */
export default function MvShapeMotionModal({
	baseLayer,
	sections,
	sceneBars,
	bpm,
	initial,
	initialSceneId,
	onApply,
	onClose,
}: MvShapeMotionModalProps) {
	const sceneList = sections.length > 0 ? sections : [
		{ id: "__all__", label: "全体", startBar: 0 } as MvSection,
	];
	const [activeSceneId, setActiveSceneId] = useState(
		(initialSceneId && sceneList.some((s) => s.id === initialSceneId)
			? initialSceneId
			: sceneList[0]?.id) ?? "__all__",
	);
	const [perScene, setPerScene] = useState<Record<string, MvSceneMotionConfig>>(
		() =>
			Object.fromEntries(
				sceneList.map((s) => [s.id, initial?.[s.id] ?? DEFAULT_SCENE_MOTION]),
			),
	);

	// 実際に触った場面だけを保存対象にする。sceneList全件ぶんの既定値を
	// 常に適用してしまうと、「この場面だけ変えたい」つもりで開いても、
	// 一度もタブを開いていない他の場面まで DEFAULT_SCENE_MOTION（ビート同期）で
	// 上書きしてしまい、既存の動きが消える事故になる。
	const [touchedScenes, setTouchedScenes] = useState<Set<string>>(
		() => new Set(Object.keys(initial ?? {})),
	);

	/**
	 * 「触った場面だけ保存」だけだと、ふつうに動きを付けたいだけの人が
	 * 開いた1場面ぶんしか設定できず、「特定の小節でしか動かない」状態になる。
	 * 適用範囲を明示的に選ばせて、既定は状況で振り分ける:
	 * - まだ場面ごとの動きを持っていない（初めて設定する）→ 全場面。ふつうはこれが期待される。
	 * - すでに場面ごとに作り込んでいる → この場面だけ。作った動きを消さない。
	 */
	const [applyAll, setApplyAll] = useState(
		() => Object.keys(initial ?? {}).length === 0,
	);
	const cfg = perScene[activeSceneId] ?? DEFAULT_SCENE_MOTION;
	const setCfg = (next: MvSceneMotionConfig) => {
		setPerScene((p) => ({ ...p, [activeSceneId]: next }));
		setTouchedScenes((s) => new Set(s).add(activeSceneId));
	};

	const bars = sceneBars(activeSceneId);
	const modulators = resolveSceneModulators(cfg, bars);

	const setCustom = (patch: Partial<MvMotionCustomToggle>) =>
		setCfg({ ...cfg, custom: { ...cfg.custom, ...patch } });

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
			<div className="flex h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-gray-900 sm:h-[88vh] sm:rounded-xl">
				<div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
					<span className="text-sm font-bold text-gray-100">図形の動き方設定</span>
					<button
						onClick={onClose}
						className="rounded p-1 text-gray-400 hover:bg-gray-800"
					>
						<X size={18} />
					</button>
				</div>

				{/*
					プレビューはスクロールしないと見えないと使い物にならない
					（プリセットを押すたびに毎回スクロールして戻ることになる）ので、
					スクロール領域の外＝常に画面内に固定して出す。
				*/}
				<div className="shrink-0 space-y-2 border-b border-gray-800 p-3">
					<MotionLivePreview
						baseLayer={baseLayer}
						modulators={modulators}
						bpm={bpm}
					/>
					<div className="rounded border border-blue-500/30 bg-blue-500/10 p-2 text-[10px] text-gray-300 leading-relaxed">
						画面中央の図形（四角・円・十字など）が曲の拍や場面に合わせて動くアニメーション効果です。
						上のプレビューで動きを確認しながら設定できます。
					</div>
				</div>

				<div className="flex-1 space-y-4 overflow-y-auto p-3">
					{/* 適用範囲。ここを選ばせないと「開いた場面でしか動かない」事故になる */}
					<div>
						<p className="mb-1 text-[10px] font-bold text-gray-300">どこに適用するか</p>
						<div className="grid grid-cols-2 gap-1.5">
							<button
								onClick={() => setApplyAll(true)}
								className={`rounded-lg border px-2 py-2 text-[11px] ${
									applyAll
										? "border-blue-500 bg-blue-500/20 font-bold text-blue-200"
										: "border-gray-700 bg-gray-800/60 text-gray-300 hover:bg-gray-800"
								}`}
							>
								曲の最初から最後まで
							</button>
							<button
								onClick={() => setApplyAll(false)}
								className={`rounded-lg border px-2 py-2 text-[11px] ${
									applyAll
										? "border-gray-700 bg-gray-800/60 text-gray-300 hover:bg-gray-800"
										: "border-blue-500 bg-blue-500/20 font-bold text-blue-200"
								}`}
							>
								選んだ場面だけ
							</button>
						</div>
						<p className="mt-1 text-[10px] leading-relaxed text-gray-500">
							{applyAll
								? "いま選んでいる動きを、この図形が出るすべての場面に同じように適用します。"
								: "下のタブで選んだ場面だけに適用します。他の場面の動きはそのまま残ります。"}
						</p>
					</div>

					{/* 場面選択タブ */}
					<div>
						<p className="mb-1 text-[10px] font-bold text-gray-300">
							{applyAll ? "動きを確認する場面" : "設定対象の場面"}
						</p>
						<div className="flex gap-1.5 overflow-x-auto pb-1">
							{sceneList.map((s) => (
								<button
									key={s.id}
									onClick={() => setActiveSceneId(s.id)}
									className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap ${
										activeSceneId === s.id
											? "bg-blue-600 text-white font-bold"
											: "bg-gray-800 text-gray-300 hover:bg-gray-700"
									}`}
								>
									{s.label}
								</button>
							))}
						</div>
					</div>

					{/* プリセットグリッド */}
					<div>
						<p className="mb-1 text-[10px] font-bold text-gray-300">動きのプリセットを選択</p>
						<div className="grid grid-cols-2 gap-2">
							{MV_MOTION_PRESETS.map((p) => (
								<button
									key={p.id}
									onClick={() => setCfg({ ...cfg, presetId: p.id })}
									className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors ${
										cfg.presetId === p.id
											? "border-blue-500 bg-blue-500/20 text-blue-200 font-bold"
											: "border-gray-700 bg-gray-800/60 text-gray-300 hover:bg-gray-800"
									}`}
								>
									<PresetIcon path={p.icon} />
									<span className="text-[11px]">{p.name}</span>
								</button>
							))}
						</div>
						{cfg.presetId === "beatSync" && (
							<div className="mt-2 rounded bg-gray-900/60 p-2">
								<p className="mb-1 text-[10px] text-gray-400">
									ビート同期の周期の速さ
								</p>
								<div className="flex flex-wrap gap-1.5">
									{MV_BEAT_SYNC_SPEED_OPTIONS.map((opt) => (
										<button
											key={opt.value}
											onClick={() =>
												setCfg({ ...cfg, beatSyncSpeed: opt.value })
											}
											className={`rounded-full px-2.5 py-1 text-[10px] whitespace-nowrap ${
												(cfg.beatSyncSpeed ?? 1) === opt.value
													? "bg-blue-600 text-white font-bold"
													: "bg-gray-800 text-gray-300 hover:bg-gray-700"
											}`}
										>
											{opt.label}
										</button>
									))}
								</div>
							</div>
						)}
					</div>

					{/* 独自の動きを組み合わせる */}
					<div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 space-y-2">
						<p className="text-[11px] font-bold text-gray-200">
							独自の動きを組み合わせる（手動調整）
						</p>

						<label className="flex items-center gap-2 py-1 cursor-pointer">
							<input
								type="checkbox"
								checked={cfg.custom.move}
								onChange={(e) => setCustom({ move: e.target.checked })}
								className="h-4 w-4 accent-blue-500"
							/>
							<span className="flex-1 text-[12px] text-gray-200 font-medium">移動（X/Y 往復揺れ）</span>
						</label>
						{cfg.custom.move && (
							<div className="mb-2 ml-6 space-y-1 rounded bg-gray-900/60 p-2">
								<div className="flex justify-between text-[10px]">
									<span className="text-gray-400">往復の速度</span>
									<span className="font-mono text-blue-300">{cfg.custom.moveSpeedBars} 小節で1往復</span>
								</div>
								<input
									type="range"
									min={0.5}
									max={8}
									step={0.5}
									value={cfg.custom.moveSpeedBars}
									onChange={(e) =>
										setCustom({ moveSpeedBars: Number(e.target.value) })
									}
									className="w-full min-h-8 accent-blue-500"
								/>
							</div>
						)}

						<label className="flex items-center gap-2 py-1 cursor-pointer">
							<input
								type="checkbox"
								checked={cfg.custom.rotate}
								onChange={(e) => setCustom({ rotate: e.target.checked })}
								className="h-4 w-4 accent-blue-500"
							/>
							<span className="flex-1 text-[12px] text-gray-200 font-medium">回転（くるくる回転）</span>
						</label>
						{cfg.custom.rotate && (
							<div className="mb-2 ml-6 space-y-1 rounded bg-gray-900/60 p-2">
								<div className="flex justify-between text-[10px]">
									<span className="text-gray-400">回転速度</span>
									<span className="font-mono text-blue-300">{cfg.custom.rotateSpeed}度 / 秒</span>
								</div>
								<input
									type="range"
									min={-180}
									max={180}
									step={5}
									value={cfg.custom.rotateSpeed}
									onChange={(e) =>
										setCustom({ rotateSpeed: Number(e.target.value) })
									}
									className="w-full min-h-8 accent-blue-500"
								/>
							</div>
						)}

						<label className="flex items-center gap-2 py-1 cursor-pointer">
							<input
								type="checkbox"
								checked={cfg.custom.scale}
								onChange={(e) => setCustom({ scale: e.target.checked })}
								className="h-4 w-4 accent-blue-500"
							/>
							<span className="flex-1 text-[12px] text-gray-200 font-medium">拡大縮小（伸び縮み）</span>
						</label>
						{cfg.custom.scale && (
							<div className="ml-6 space-y-1 rounded bg-gray-900/60 p-2">
								<div className="flex justify-between text-[10px]">
									<span className="text-gray-400">伸び縮みの周期</span>
									<span className="font-mono text-blue-300">{cfg.custom.scaleSpeedBars} 小節で1周期</span>
								</div>
								<input
									type="range"
									min={0.5}
									max={8}
									step={0.5}
									value={cfg.custom.scaleSpeedBars}
									onChange={(e) =>
										setCustom({ scaleSpeedBars: Number(e.target.value) })
									}
									className="w-full min-h-8 accent-blue-500"
								/>
							</div>
						)}
					</div>
				</div>

				<div className="flex shrink-0 gap-2 border-t border-gray-800 p-3">
					<button
						onClick={onClose}
						className="flex-1 rounded-lg border border-gray-700 py-2.5 text-sm text-gray-300"
					>
						キャンセル
					</button>
					<button
						onClick={() => {
							// 全場面へ適用するときは、いま選んでいる場面の設定を全場面へ配る。
							// 「触った場面だけ」を配ると他の場面は既定値のまま残り、
							// 結局その場面でしか動かないという元のバグに戻ってしまう。
							const next = applyAll
								? Object.fromEntries(sceneList.map((s) => [s.id, cfg]))
								: Object.fromEntries(
										Object.entries(perScene).filter(([id]) =>
											touchedScenes.has(id),
										),
									);
							onApply(next);
							onClose();
						}}
						className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white"
					>
						適用
					</button>
				</div>
			</div>
		</div>
	);
}
