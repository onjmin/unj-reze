"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	MV_STEPS_PER_BAR,
	type MvLayer,
	type MvSection,
} from "@/lib/mv-config";

/**
 * レイヤーを「どの小節からどの小節まで出すか」で並べて見るタイムライン。
 *
 * 横軸の単位は小節。今までは各レイヤーの詳細設定を開かないと出す範囲が分からず、
 * 全体で何がいつ出ているのかを把握できなかった。ここでは全レイヤーを1画面に並べ、
 * 帯をドラッグして範囲を直せる。
 *
 * 範囲を持たないレイヤー（barRange 未指定＝曲全体で表示）は薄い帯で全幅に出す。
 * 帯に触った時点で「範囲あり」へ変わる。
 */

/** 1小節あたりの横幅（px）。小節数が多いときは縮めて全体を見渡せるようにする。 */
const MIN_BAR_W = 6;
const MAX_BAR_W = 34;
/** 端をつかめる幅。指で触るので狭すぎると掴めない。 */
const EDGE_PX = 14;
/** 名前列の幅。ここは横スクロールしても残す。 */
const NAME_W = 96;

type DragMode = "move" | "start" | "end";

interface DragState {
	layerId: string;
	mode: DragMode;
	/** つかんだ瞬間の小節位置 */
	grabBar: number;
	from: number;
	to: number;
}

export interface MvTimelineProps {
	layers: MvLayer[];
	sections: MvSection[];
	/** 曲全体の長さ（小節）。0のときは場面から推定する。 */
	totalBars: number;
	labelOf: (layer: MvLayer) => string;
	kindLabelOf: (layer: MvLayer) => string;
	selectedLayerId: string | null;
	onSelectLayer: (id: string) => void;
	onChangeRange: (id: string, range: [number, number] | undefined) => void;
	/** 目盛りをタップしたときの移動先。プレビューをその小節へ飛ばす。 */
	onSeekBar?: (bar: number) => void;
	/** 再生位置（小節）。未指定なら再生ヘッドを出さない。 */
	playheadBar?: number | null;
}

export default function MvTimeline({
	layers,
	sections,
	totalBars,
	labelOf,
	kindLabelOf,
	selectedLayerId,
	onSelectLayer,
	onChangeRange,
	onSeekBar,
	playheadBar,
}: MvTimelineProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const [drag, setDrag] = useState<DragState | null>(null);
	const [zoom, setZoom] = useState(14);

	// 曲を読み込む前は totalBars が 0 になる。場面の終わりまでは必ず引きたいので、
	// 場面の最後＋8小節を下限にしておく（空のタイムラインだと何も掴めない）。
	const lastSectionBar = sections.reduce((m, s) => Math.max(m, s.startBar), 0);
	const bars = Math.max(8, Math.ceil(totalBars || 0), lastSectionBar + 8);
	const barW = Math.min(MAX_BAR_W, Math.max(MIN_BAR_W, zoom));
	const width = bars * barW;

	/** 目盛りの間隔。詰まって読めなくならないよう、拡大率で間引く。 */
	const tickEvery = barW >= 24 ? 1 : barW >= 12 ? 2 : barW >= 8 ? 4 : 8;

	const rangeOf = useCallback(
		(l: MvLayer): [number, number] => l.barRange ?? [0, bars],
		[bars],
	);

	const barAtClientX = useCallback(
		(clientX: number): number => {
			const el = trackRef.current;
			if (!el) return 0;
			const rect = el.getBoundingClientRect();
			return (clientX - rect.left) / barW;
		},
		[barW],
	);

	// ドラッグ中はポインタを画面のどこへ動かしても追従させたいので window で拾う。
	// 帯の上だけで拾うと、素早く動かしたときに簡単に外れて掴み直しになる。
	useEffect(() => {
		if (!drag) return;
		const onMove = (e: PointerEvent) => {
			const delta = barAtClientX(e.clientX) - drag.grabBar;
			const span = drag.to - drag.from;
			let from = drag.from;
			let to = drag.to;
			if (drag.mode === "move") {
				from = drag.from + delta;
				to = from + span;
				// 曲の外へ出さない。掴んだ長さは保ったまま端で止める。
				if (from < 0) {
					from = 0;
					to = span;
				}
				if (to > bars) {
					to = bars;
					from = bars - span;
				}
			} else if (drag.mode === "start") {
				from = Math.min(drag.to - 1, Math.max(0, drag.from + delta));
			} else {
				to = Math.max(drag.from + 1, Math.min(bars, drag.to + delta));
			}
			const snap = (v: number) => Math.round(v * 2) / 2; // 0.5小節刻み
			onChangeRange(drag.layerId, [snap(from), snap(to)]);
		};
		const onUp = () => setDrag(null);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
		};
	}, [drag, barAtClientX, bars, onChangeRange]);

	const startDrag = (e: React.PointerEvent, l: MvLayer) => {
		const [from, to] = rangeOf(l);
		const grabBar = barAtClientX(e.clientX);
		const leftPx = (grabBar - from) * barW;
		const rightPx = (to - grabBar) * barW;
		const mode: DragMode =
			leftPx <= EDGE_PX ? "start" : rightPx <= EDGE_PX ? "end" : "move";
		onSelectLayer(l.id);
		setDrag({ layerId: l.id, mode, grabBar, from, to });
	};

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-2">
				<p className="text-[10px] leading-relaxed text-gray-400">
					帯をドラッグで移動、左右の端をドラッグで長さを変更（0.5小節きざみ）。
				</p>
				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onClick={() => setZoom((z) => Math.max(MIN_BAR_W, z - 4))}
						className="h-7 w-7 rounded border border-gray-700 bg-gray-800 text-[13px] text-gray-300"
						aria-label="縮小"
					>
						−
					</button>
					<button
						type="button"
						onClick={() => setZoom((z) => Math.min(MAX_BAR_W, z + 4))}
						className="h-7 w-7 rounded border border-gray-700 bg-gray-800 text-[13px] text-gray-300"
						aria-label="拡大"
					>
						＋
					</button>
				</div>
			</div>

			<div className="flex rounded border border-gray-700 bg-gray-900/70">
				{/* 名前列。横スクロールしてもどのレイヤーの行か分かるよう固定する */}
				<div
					className="shrink-0 border-r border-gray-700"
					style={{ width: NAME_W }}
				>
					<div className="h-7 border-b border-gray-700 px-1.5 py-1 text-[9px] text-gray-500">
						小節 →
					</div>
					{layers.map((l) => (
						<button
							type="button"
							key={l.id}
							onClick={() => onSelectLayer(l.id)}
							className={`block h-8 w-full overflow-hidden border-b border-gray-800 px-1.5 text-left ${
								selectedLayerId === l.id ? "bg-blue-600/25" : ""
							}`}
						>
							<span className="block truncate text-[10px] font-medium text-gray-200">
								{labelOf(l)}
							</span>
							<span className="block truncate text-[8px] text-gray-500">
								{kindLabelOf(l)}
							</span>
						</button>
					))}
				</div>

				<div ref={scrollRef} className="flex-1 overflow-x-auto">
					<div ref={trackRef} style={{ width }} className="relative">
						{/* 目盛り。タップでその小節へ移動する */}
						<button
							type="button"
							onClick={(e) => {
								if (!onSeekBar) return;
								onSeekBar(Math.max(0, Math.floor(barAtClientX(e.clientX))));
							}}
							className="relative block h-7 w-full border-b border-gray-700"
							style={{ width }}
							aria-label="この小節へ移動"
						>
							{Array.from({ length: Math.ceil(bars / tickEvery) }, (_, i) => {
								const bar = i * tickEvery;
								return (
									<span
										key={bar}
										className="absolute top-0 h-full border-l border-gray-700/70 pl-0.5 text-[8px] leading-7 text-gray-500"
										style={{ left: bar * barW }}
									>
										{bar}
									</span>
								);
							})}
							{/* 場面の切れ目。どこがサビかを見ながら範囲を決められるように */}
							{sections.map((s) => (
								<span
									key={s.id}
									className="absolute top-0 h-full border-l border-amber-500/60"
									style={{ left: s.startBar * barW }}
									title={s.label}
								/>
							))}
						</button>

						{/* 場面の縦線を行側にも通す（帯と場面の対応を目で追えるように） */}
						<div className="pointer-events-none absolute inset-x-0 bottom-0 top-7">
							{sections.map((s) => (
								<span
									key={s.id}
									className="absolute top-0 h-full border-l border-amber-500/25"
									style={{ left: s.startBar * barW }}
								/>
							))}
							{playheadBar != null && (
								<span
									className="absolute top-0 h-full border-l-2 border-blue-400"
									style={{ left: playheadBar * barW }}
								/>
							)}
						</div>

						{layers.map((l) => {
							const [from, to] = rangeOf(l);
							const whole = !l.barRange;
							const selected = selectedLayerId === l.id;
							return (
								<div
									key={l.id}
									className="relative h-8 border-b border-gray-800"
								>
									<div
										role="button"
										tabIndex={0}
										onPointerDown={(e) => {
											e.preventDefault();
											startDrag(e, l);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												onSelectLayer(l.id);
											}
										}}
										title={
											whole
												? "曲全体で表示中（触ると範囲指定になります）"
												: `${from} 〜 ${to} 小節`
										}
										className={`absolute top-1 h-6 touch-none rounded border ${
											whole
												? "border-dashed border-gray-600 bg-gray-700/30"
												: selected
													? "border-blue-400 bg-blue-500/45"
													: "border-blue-500/50 bg-blue-500/25"
										}`}
										style={{
											left: from * barW,
											width: Math.max(barW * 0.5, (to - from) * barW),
										}}
									>
										{/* 端のつまみ。細い帯だと潰れるので、広いときだけ出す */}
										{!whole && (to - from) * barW > EDGE_PX * 2.5 && (
											<>
												<span className="absolute inset-y-0 left-0 w-1.5 rounded-l bg-blue-300/70" />
												<span className="absolute inset-y-0 right-0 w-1.5 rounded-r bg-blue-300/70" />
											</>
										)}
										<span className="pointer-events-none absolute inset-0 truncate px-2 text-[9px] leading-6 text-gray-100">
											{whole ? "曲全体" : `${from}〜${to}`}
										</span>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{/* 選択中のレイヤーだけ数値でも直せるようにする（ドラッグは細かい値を狙えない） */}
			{(() => {
				const l = layers.find((x) => x.id === selectedLayerId);
				if (!l) return null;
				const [from, to] = rangeOf(l);
				return (
					<div className="flex flex-wrap items-center gap-1.5 rounded border border-gray-700 bg-gray-800/60 p-2">
						<span className="text-[10px] font-bold text-gray-300">
							{labelOf(l)}
						</span>
						{l.barRange ? (
							<>
								<input
									type="number"
									step={0.5}
									value={from}
									onChange={(e) =>
										onChangeRange(l.id, [Number(e.target.value), to])
									}
									className="min-h-8 w-16 rounded border border-gray-700 bg-gray-800 px-1.5 text-[11px] text-gray-100 outline-none"
								/>
								<span className="text-[10px] text-gray-400">
									小節 〜（この小節を含まない）
								</span>
								<input
									type="number"
									step={0.5}
									value={to}
									onChange={(e) =>
										onChangeRange(l.id, [from, Number(e.target.value)])
									}
									className="min-h-8 w-16 rounded border border-gray-700 bg-gray-800 px-1.5 text-[11px] text-gray-100 outline-none"
								/>
								<button
									type="button"
									onClick={() => onChangeRange(l.id, undefined)}
									className="min-h-8 rounded border border-gray-700 px-2 text-[10px] text-gray-300 hover:text-blue-300"
								>
									曲全体に戻す
								</button>
							</>
						) : (
							<button
								type="button"
								onClick={() => onChangeRange(l.id, [0, Math.min(8, bars)])}
								className="min-h-8 rounded border border-gray-700 px-2 text-[10px] text-gray-300 hover:text-blue-300"
							>
								小節を指定して出す
							</button>
						)}
					</div>
				);
			})()}
		</div>
	);
}

/** 再生ステップから小節へ。タイムラインの再生ヘッド用。 */
export function stepToBar(step: number): number {
	return step / MV_STEPS_PER_BAR;
}
