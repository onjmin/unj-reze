"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	MV_H,
	MV_STEPS_PER_BEAT,
	MV_W,
	type MvManifest,
	type MvShapeLayer,
} from "@/lib/mv-config";
import { drawMvFrame, EMPTY_SONG, type MvFrameState } from "@/lib/mv-engine";
import {
	DEFAULT_SCENE_MOTION,
	MV_MOTION_CATEGORY_LABELS,
	MV_MOTION_PRESETS,
	MV_MOTION_SPEED_OPTIONS,
	type MvMotionCategory,
	type MvSceneMotionConfig,
	resolveSceneModulators,
	findMvMotionPreset,
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
			layers: [
				{
					...baseLayer,
					id: "preview",
					modulators,
					modulatorsByScene: undefined,
					motionPresetByScene: undefined,
				},
			],
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
	/** 実際の曲のBPM。プレビューの体感速度を本編と合わせるために使う。 */
	bpm?: number;
	initial?: MvSceneMotionConfig;
	onApply: (cfg: MvSceneMotionConfig) => void;
	onClose: () => void;
}

/** グリッドをカテゴリ見出しで区切って並べる順番。 */
const MOTION_CATEGORY_ORDER: MvMotionCategory[] = [
	"size",
	"opacity",
	"bounce",
	"rotate",
	"combo",
];

/**
 * 「真ん中の図形の動き方設定」モーダル。
 *
 * 動きは**曲全体で1つ**。以前は場面タブで小節ごとに違う動きを付けられたが、
 * 「設定したのに一部の小節でしか効かない」ようにしか見えず、作る側にも
 * 見る側にも分かりにくかったのでやめた。
 *
 * プリセットは**すべて拍(beat)に同期する動き**だけに絞ってある。拍と無関係な
 * 「回転しっぱなし」「往復移動」や、それらを手で組み合わせる「独自の動き」パネルは
 * 廃止し、その分だけ拍周期の効かせ方（大きさ／濃さ／位置／回転／複合）を増やした。
 * 速さ（何拍で1周期か）は選んだプリセットに関わらず共通で1つ選ぶ。
 *
 * - プリセットはカテゴリ見出し付きのアイコングリッドから選ぶ（モバイルは2列）。
 * - 上部のライブプレビューが選んだ内容を即座に反映する。
 */
export default function MvShapeMotionModal({
	baseLayer,
	bpm,
	initial,
	onApply,
	onClose,
}: MvShapeMotionModalProps) {
	const [cfg, setCfg] = useState<
		MvSceneMotionConfig & { initialSpeed?: number }
	>(() => {
		if (initial) return initial;
		const beatMod = baseLayer.modulators?.find((m) => m.source === "beat");
		const detectedSpeed = beatMod?.periodBeats ?? 1;
		return {
			presetId: "custom_existing",
			beatSyncSpeed: detectedSpeed,
			initialSpeed: detectedSpeed,
		};
	});

	const modulators = resolveSceneModulators(cfg, baseLayer.modulators);

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
						図形（四角・円・十字など）が曲の拍に合わせて動くアニメーション効果です。
						ここで決めた動きは<b className="text-blue-200">曲の最初から最後まで</b>効きます。
						どの小節に図形を出すかは「レイヤー」タブのタイムラインで決めてください。
					</div>
				</div>

				<div className="flex-1 space-y-4 overflow-y-auto p-3">
					{/* 速さ。全プリセット共通の「1周期が何拍か」なので、種類の選択より先に出す。 */}
					<div>
						<p className="mb-1 text-[10px] font-bold text-gray-300">周期の速さ</p>
						<div className="flex flex-wrap gap-1.5">
							{MV_MOTION_SPEED_OPTIONS.map((opt) => (
								<button
									key={opt.value}
									onClick={() => setCfg({ ...cfg, beatSyncSpeed: opt.value })}
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
						<label className="mt-1.5 flex items-center gap-2 py-0.5 cursor-pointer">
							<input
								type="checkbox"
								checked={!!cfg.offbeat}
								onChange={(e) => setCfg({ ...cfg, offbeat: e.target.checked })}
								className="h-4 w-4 accent-blue-500"
							/>
							<span className="text-[11px] text-gray-200">
								裏拍で鳴らす（半拍分ずらす）
							</span>
						</label>
					</div>

					{/* 動きの強さ（回転角度など）の上書き */}
					{findMvMotionPreset(cfg.presetId)?.category === "rotate" && (
						<div className="mt-3 border-t border-gray-800 pt-3">
							<p className="mb-1 text-[10px] font-bold text-gray-300">回転角度</p>
							<label className="flex items-center gap-2">
								<input
									type="number"
									value={
										cfg.amountOverride ??
										findMvMotionPreset(cfg.presetId)?.build().find(m => m.target === 'rotation')?.amount ??
										90
									}
									onChange={(e) =>
										setCfg({ ...cfg, amountOverride: Number(e.target.value) })
									}
									className="w-20 rounded bg-gray-800 px-2 py-1 text-xs text-white"
								/>
								<span className="text-[10px] text-gray-400">度</span>
								{cfg.amountOverride !== undefined && (
									<button
										onClick={() => setCfg({ ...cfg, amountOverride: undefined })}
										className="ml-2 text-[10px] text-blue-400 hover:underline"
									>
										デフォルトに戻す
									</button>
								)}
							</label>
						</div>
					)}

					{/* プリセットグリッド。カテゴリごとに見出しを分ける（種類が多いので平置きだと探しにくい）。 */}
					{MOTION_CATEGORY_ORDER.map((cat) => {
						const presets = MV_MOTION_PRESETS.filter((p) => p.category === cat);
						if (presets.length === 0) return null;
						return (
							<div key={cat}>
								<p className="mb-1 text-[10px] font-bold text-gray-300">
									{MV_MOTION_CATEGORY_LABELS[cat]}
								</p>
								<div className="grid grid-cols-2 gap-2">
									{presets.map((p) => (
										<button
											key={p.id}
											onClick={() => setCfg({ ...cfg, presetId: p.id })}
											className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors ${
												cfg.presetId === p.id
													? "border-blue-500 bg-blue-500/20 text-blue-200 font-bold"
													: "border-gray-700 bg-gray-800/60 text-gray-300 hover:bg-gray-800"
											}`}
										>
											<PresetIcon path={p.icon} />
											<span className="text-[11px] leading-tight">{p.name}</span>
										</button>
									))}
								</div>
							</div>
						);
					})}
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
							onApply(cfg);
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
