"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	MV_BEATS_PER_BAR,
	MV_H,
	MV_STEPS_PER_BEAT,
	MV_W,
	type MvLayerGroup,
	type MvManifest,
	type MvShapeLayer,
} from "@/lib/mv-config";
import { drawMvFrame, EMPTY_SONG, type MvFrameState } from "@/lib/mv-engine";
import {
	DEFAULT_ARRANGEMENT_BEATS,
	generateArrangementForGroup,
} from "@/lib/mv-shape-group-macro";

/** 何拍を1周に選べるか。 */
const BEATS_OPTIONS = [2, 4, 8, 16];

/**
 * いま生成している特殊アレンジをループ再生するライブプレビュー。
 * `triggerBar` は常に0で生成しているので（実際の割り込み位置は後から編集できる）、
 * ここでは `groups` を渡さず——`isLayerVisible` はグループの連動判定を素通りし、
 * アレンジ側のレイヤーが常に見える——`beats` 拍ぶんで単純にループさせるだけでいい。
 */
function ArrangementLivePreview({
	layers,
	beats,
	bpm,
}: {
	layers: MvShapeLayer[];
	beats: number;
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
			layers,
		};
		const song = { ...EMPTY_SONG, bpm: bpm && bpm > 0 ? bpm : EMPTY_SONG.bpm };
		const stepsPerSec = (song.bpm / 60) * MV_STEPS_PER_BEAT;
		const loopSteps = Math.max(1, beats) * MV_STEPS_PER_BEAT;
		const loopSec = loopSteps / stepsPerSec;
		let raf = 0;
		const start = performance.now();
		const loop = () => {
			const elapsed = ((performance.now() - start) / 1000) % loopSec;
			const frame: MvFrameState = { step: elapsed * stepsPerSec, timeSec: elapsed };
			ctx.clearRect(0, 0, MV_W, MV_H);
			drawMvFrame(ctx, manifest, song, frame);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [layers, beats, bpm]);

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

interface MvArrangementModalProps {
	/** アレンジ元グループのID。 */
	sourceGroupId: string;
	/** アレンジ元グループの中身（図形レイヤーのみ）。 */
	sourceLayers: MvShapeLayer[];
	/** 実際の曲のBPM。プレビューの体感速度を本編と合わせるために使う。 */
	bpm?: number;
	onApply: (result: { group: MvLayerGroup; layers: MvShapeLayer[] }) => void;
	onClose: () => void;
}

/** 生成のたびに振り直す使い捨てのZ採番（プレビュー用・実際の重なり順は挿入時に振り直す）。 */
function makePreviewNextZ(): () => number {
	let z = 0;
	return () => {
		z += 10;
		return z;
	};
}

/**
 * 「特殊アレンジを生成」専用モーダル。
 *
 * 以前はボタン1つでいきなりレイヤーを挿入していたため、結果が気に入らなくても
 * 「削除してもう一度ボタンを押す」を繰り返すしかなく、しかもその都度レイヤー一覧が
 * 増減して探しづらかった。ここでは挿入前に：
 * 1. 長さ（何拍）を選ぶ
 * 2. その場でループ再生プレビューしながら「生成しなおす」で型を振り直せる
 * 3. 気に入ったらそのままレイヤーとして挿入する
 * という手順にして、当たりが出るまで手元で確認してから確定できるようにしてある。
 */
export default function MvArrangementModal({
	sourceGroupId,
	sourceLayers,
	bpm,
	onApply,
	onClose,
}: MvArrangementModalProps) {
	const [beats, setBeats] = useState(DEFAULT_ARRANGEMENT_BEATS);
	const [result, setResult] = useState(() =>
		generateArrangementForGroup(sourceLayers, makePreviewNextZ(), sourceGroupId, {
			triggerBar: 0,
			endBar: Math.max(1, Math.ceil(DEFAULT_ARRANGEMENT_BEATS / MV_BEATS_PER_BAR)),
		}),
	);

	const regenerate = (nextBeats: number) => {
		setResult(
			generateArrangementForGroup(sourceLayers, makePreviewNextZ(), sourceGroupId, {
				triggerBar: 0,
				endBar: Math.max(1, Math.ceil(nextBeats / MV_BEATS_PER_BAR)),
			}),
		);
	};

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
			<div className="flex h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-gray-900 sm:h-[88vh] sm:rounded-xl">
				<div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
					<span className="text-sm font-bold text-gray-100">特殊アレンジを生成</span>
					<button
						onClick={onClose}
						className="rounded p-1 text-gray-400 hover:bg-gray-800"
					>
						<X size={18} />
					</button>
				</div>

				{/* プレビューはスクロール外＝常に画面内固定（生成しなおすたびに毎回スクロールして
					戻るのを避けるため、`MvShapeMotionModal` と同じ構成にしてある）。 */}
				<div className="shrink-0 space-y-2 border-b border-gray-800 p-3">
					<ArrangementLivePreview layers={result.layers} beats={beats} bpm={bpm} />
					<div className="rounded border border-blue-500/30 bg-blue-500/10 p-2 text-[10px] text-gray-300 leading-relaxed">
						アレンジ元のグループを加工して、割り込み用の変化を作ります。
						気に入らなければ「生成しなおす」で型を振り直し、決まったら挿入してください。
						どの小節に割り込むかは挿入後にグループの表示欄で調整できます。
					</div>
				</div>

				<div className="flex-1 space-y-4 overflow-y-auto p-3">
					<div>
						<p className="mb-1 text-[10px] font-bold text-gray-300">長さ（拍）</p>
						<div className="flex flex-wrap gap-1.5">
							{BEATS_OPTIONS.map((opt) => (
								<button
									key={opt}
									onClick={() => {
										setBeats(opt);
										regenerate(opt);
									}}
									className={`rounded-full px-2.5 py-1 text-[10px] whitespace-nowrap ${
										beats === opt
											? "bg-blue-600 text-white font-bold"
											: "bg-gray-800 text-gray-300 hover:bg-gray-700"
									}`}
								>
									{opt}拍
								</button>
							))}
						</div>
					</div>

					<button
						onClick={() => regenerate(beats)}
						className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-purple-600/50 py-2.5 text-xs font-bold text-purple-300 hover:bg-purple-900/20"
					>
						<RefreshCw size={13} />
						生成しなおす
					</button>
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
							onApply(result);
							onClose();
						}}
						className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white"
					>
						この内容を挿入
					</button>
				</div>
			</div>
		</div>
	);
}
