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
	type ArrangementGenOptions,
	DEFAULT_ARRANGEMENT_BEATS,
	generateArrangementForGroup,
	type MvArrangementGlyphKind,
} from "@/lib/mv-shape-group-macro";

/** 何拍を1周に選べるか。 */
const BEATS_OPTIONS = [2, 4, 8, 16];

/** 第4幕のグリフ数として選べる値。「自動」は従来どおり4〜6を乱数で。 */
const ACT4_COUNT_OPTIONS: (4 | 5 | 6 | "auto")[] = ["auto", 4, 5, 6];

/** 第4幕に出すグリフ種のトグル候補。 */
const ACT4_KIND_OPTIONS: { value: MvArrangementGlyphKind; label: string }[] = [
	{ value: "bar", label: "バーチャート" },
	{ value: "can", label: "縞箱" },
	{ value: "tick", label: "目盛り" },
	{ value: "cross", label: "十字" },
	{ value: "dots", label: "ドット集合" },
	{ value: "frame", label: "四隅枠" },
	{ value: "geo", label: "幾何学模様（無限生成）" },
];

const GROWTH_SPEED_OPTIONS: { value: NonNullable<ArrangementGenOptions["growthSpeed"]>; label: string }[] = [
	{ value: "fast", label: "速い" },
	{ value: "normal", label: "普通" },
	{ value: "slow", label: "ゆっくり" },
];

/**
 * いま生成している特殊アレンジをループ再生するライブプレビュー。
 * `triggerBar` は常に0で生成しているので（実際の割り込み位置は後から編集できる）、
 * ここでは `groups` を渡さず——`isLayerVisible` はグループの連動判定を素通りし、
 * アレンジ側のレイヤーが常に見える——`beats` 拍ぶんで単純にループさせるだけでいい。
 */
/** 4幕それぞれのラベルと、進捗バー上での区間(0..1)。 */
const ARRANGEMENT_ACTS = [
	{ label: "第1幕：タメ→暗転", from: 0, to: 0.25 },
	{ label: "第2幕：エンブレム連続フラッシュ", from: 0.25, to: 0.5 },
	{ label: "第3幕：対角の角括弧", from: 0.5, to: 0.75 },
	{ label: "第4幕：グリフ同時多発", from: 0.75, to: 1 },
];

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
	const barRef = useRef<HTMLButtonElement>(null);
	const playheadRef = useRef<HTMLDivElement>(null);
	const actLabelRef = useRef<HTMLSpanElement>(null);
	// 動画プレビューのシークバーと同じ発想——再生位置はDOM直操作で毎フレーム
	// 更新する（Reactのstateにすると60fpsでの再レンダーになってしまう）。
	// クリック/ドラッグでの頭出しは、時計の基準点(startRef)をずらすことで実現する
	// （経過時間の計算式はそのまま、原点だけ動かす）。
	const startRef = useRef(0);
	const loopSecRef = useRef(1);

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
		loopSecRef.current = loopSec;
		startRef.current = performance.now();
		let raf = 0;
		const loop = () => {
			const elapsed = ((performance.now() - startRef.current) / 1000) % loopSec;
			const frame: MvFrameState = { step: elapsed * stepsPerSec, timeSec: elapsed };
			ctx.clearRect(0, 0, MV_W, MV_H);
			drawMvFrame(ctx, manifest, song, frame);

			const frac = loopSec > 0 ? elapsed / loopSec : 0;
			if (playheadRef.current) playheadRef.current.style.left = `${frac * 100}%`;
			const actIndex = Math.min(
				ARRANGEMENT_ACTS.length - 1,
				Math.floor(frac * ARRANGEMENT_ACTS.length),
			);
			if (actLabelRef.current) {
				actLabelRef.current.textContent = ARRANGEMENT_ACTS[actIndex].label;
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [layers, beats, bpm]);

	// バー上のクリック/ドラッグで頭出し。時計の原点(startRef)を
	// 「その位置に相当する経過時間ぶん過去」へずらすだけで、以降は普通に
	// 再生が続く（動画プレイヤーのシークと同じ挙動）。
	const seekTo = (clientX: number) => {
		const bar = barRef.current;
		if (!bar) return;
		const rect = bar.getBoundingClientRect();
		const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		const desiredElapsed = frac * loopSecRef.current;
		startRef.current = performance.now() - desiredElapsed * 1000;
	};

	return (
		<div className="space-y-1.5">
			<canvas
				ref={canvasRef}
				width={MV_W}
				height={MV_H}
				className="block h-auto w-full rounded bg-black"
				style={{ aspectRatio: `${MV_W} / ${MV_H}` }}
			/>
			<button
				type="button"
				ref={barRef}
				onClick={(e) => seekTo(e.clientX)}
				onMouseDown={(e) => {
					if (e.buttons !== 1) return;
					const onMove = (ev: MouseEvent) => seekTo(ev.clientX);
					const onUp = () => {
						window.removeEventListener("mousemove", onMove);
						window.removeEventListener("mouseup", onUp);
					};
					window.addEventListener("mousemove", onMove);
					window.addEventListener("mouseup", onUp);
				}}
				className="relative block h-4 w-full cursor-pointer overflow-visible rounded bg-transparent p-0"
				aria-label="再生位置をシーク"
			>
				<div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
					{ARRANGEMENT_ACTS.map((act) => (
						<div
							key={act.label}
							className="h-full border-r border-gray-900 bg-purple-600/40 last:border-r-0"
							style={{ width: `${(act.to - act.from) * 100}%` }}
						/>
					))}
				</div>
				<div
					ref={playheadRef}
					className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
					style={{ left: "0%" }}
				/>
			</button>
			<span ref={actLabelRef} className="block text-[10px] text-gray-400">
				第1幕：タメ→暗転
			</span>
		</div>
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
	// 要件が「毎回すべて乱数まかせ」では狙った絵に当てにくくなってきたため、
	// 主要パラメータだけモーダルで固定できるようにしてある。指定していない
	// 部分（グリフの配置・色味の細部など）は引き続き乱数で振れる。
	const [act4Count, setAct4Count] = useState<4 | 5 | 6 | "auto">("auto");
	const [act4Kinds, setAct4Kinds] = useState<MvArrangementGlyphKind[]>(
		ACT4_KIND_OPTIONS.map((o) => o.value),
	);
	const [growthSpeed, setGrowthSpeed] =
		useState<NonNullable<ArrangementGenOptions["growthSpeed"]>>("normal");
	const [centerPop, setCenterPop] = useState(true);

	const buildGenOptions = (): ArrangementGenOptions => ({
		act4Count: act4Count === "auto" ? undefined : act4Count,
		act4Kinds,
		growthSpeed,
		centerPop,
	});

	// endBar は指定した拍数どおり（小節へ切り上げない）。切り上げると
	// 「2拍と指定したのに1小節ぶん再生される」というズレになる。
	const [result, setResult] = useState(() =>
		generateArrangementForGroup(
			sourceLayers,
			makePreviewNextZ(),
			sourceGroupId,
			{ triggerBar: 0, endBar: DEFAULT_ARRANGEMENT_BEATS / MV_BEATS_PER_BAR },
			buildGenOptions(),
		),
	);

	const regenerate = (nextBeats: number, overrides?: Partial<ArrangementGenOptions>) => {
		setResult(
			generateArrangementForGroup(
				sourceLayers,
				makePreviewNextZ(),
				sourceGroupId,
				{ triggerBar: 0, endBar: nextBeats / MV_BEATS_PER_BAR },
				{ ...buildGenOptions(), ...overrides },
			),
		);
	};

	const toggleAct4Kind = (kind: MvArrangementGlyphKind) => {
		setAct4Kinds((prev) => {
			// 最後の1つは外させない（全種類ゼロだと第4幕に何も出なくなり分かりにくい）。
			if (prev.includes(kind) && prev.length === 1) return prev;
			const next = prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind];
			regenerate(beats, { act4Kinds: next });
			return next;
		});
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

					<div>
						<p className="mb-1 text-[10px] font-bold text-gray-300">第4幕のグリフ数</p>
						<div className="flex flex-wrap gap-1.5">
							{ACT4_COUNT_OPTIONS.map((opt) => (
								<button
									key={opt}
									onClick={() => {
										setAct4Count(opt);
										regenerate(beats, { act4Count: opt === "auto" ? undefined : opt });
									}}
									className={`rounded-full px-2.5 py-1 text-[10px] whitespace-nowrap ${
										act4Count === opt
											? "bg-blue-600 text-white font-bold"
											: "bg-gray-800 text-gray-300 hover:bg-gray-700"
									}`}
								>
									{opt === "auto" ? "自動" : `${opt}個`}
								</button>
							))}
						</div>
					</div>

					<div>
						<p className="mb-1 text-[10px] font-bold text-gray-300">第4幕に出すグリフ種</p>
						<div className="flex flex-wrap gap-1.5">
							{ACT4_KIND_OPTIONS.map((opt) => (
								<button
									key={opt.value}
									onClick={() => toggleAct4Kind(opt.value)}
									className={`rounded-full px-2.5 py-1 text-[10px] whitespace-nowrap ${
										act4Kinds.includes(opt.value)
											? "bg-blue-600 text-white font-bold"
											: "bg-gray-800 text-gray-300 hover:bg-gray-700"
									}`}
								>
									{opt.label}
								</button>
							))}
						</div>
					</div>

					<div>
						<p className="mb-1 text-[10px] font-bold text-gray-300">
							種から本来の形へ育つ速さ
						</p>
						<div className="flex flex-wrap gap-1.5">
							{GROWTH_SPEED_OPTIONS.map((opt) => (
								<button
									key={opt.value}
									onClick={() => {
										setGrowthSpeed(opt.value);
										regenerate(beats, { growthSpeed: opt.value });
									}}
									className={`rounded-full px-2.5 py-1 text-[10px] whitespace-nowrap ${
										growthSpeed === opt.value
											? "bg-blue-600 text-white font-bold"
											: "bg-gray-800 text-gray-300 hover:bg-gray-700"
									}`}
								>
									{opt.label}
								</button>
							))}
						</div>
					</div>

					<label className="flex items-center gap-2 text-[10px] text-gray-300">
						<input
							type="checkbox"
							checked={centerPop}
							onChange={(e) => {
								setCenterPop(e.target.checked);
								regenerate(beats, { centerPop: e.target.checked });
							}}
							className="h-3.5 w-3.5"
						/>
						突拍子もなく出現する図形に、中心から湧き出すポップインを併用する
					</label>

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
