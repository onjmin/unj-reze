"use client";

// かけあい動画のプレイヤー。設計: docs/talk-video-feature-design.md
//
// 再生の流れ（ユーザー操作の延長で行う）:
//   準備（TTS アセット・音源・感情モデル）→ 全行の計画 → 時間軸 → 先頭の行の鳴り出しを待つ → 描画ループ
//   （残りの行は lib/talk/talk-audio.ts の発話セッションが鳴らしながら 1 行ずつ置いていく）
//   初回は全行の計画の前に最初の行の合成を鳴らさずに始めておき、計画と重ねる（合成が遅いときに効く）。
// 時刻は発話セッションの時計から引く（session.timeSec()。AudioContext の時計を声に合わせたもの。
// 声が遅れたり行の途中で後ろへずれたりすると、絵もそのぶん待つ）。
// 一時停止は発話を止めて現在の行の頭を覚え、再開はそこから置き直す（行の途中からは再開しない）。
// シークバーは YouTube 風にドラッグできるが、声は行の途中から鳴らせない（dtm の speak に開始
// オフセットが無い）ので、離した位置を含む行の頭へ飛ぶ。ドラッグ中はその行を吹き出しで見せる。

import { Pause, Play, RotateCcw } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	planTalkCues,
	prepareTalkVoice,
	prerenderTalkHead,
	scheduleTalkSpeech,
	type TalkSpeechSession,
} from "@/lib/talk/talk-audio";
import { TALK_H, TALK_W, type TalkManifest, talkCharacterOf } from "@/lib/talk/talk-config";
import { drawTalkFrame, preloadTalkAssets } from "@/lib/talk/talk-engine";
import {
	buildTalkTimeline,
	cueAt,
	type TalkTimeline,
	type TalkTimelineCue,
} from "@/lib/talk/talk-timeline";

/** 秒 → m:ss。 */
const formatSec = (sec: number): string => {
	const s = Math.max(0, Math.floor(sec));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** 時刻 t を含む行（間も含む。範囲外は端の行）。 */
const cueIndexAt = (tl: TalkTimeline, t: number): number => {
	if (tl.cues.length === 0) return -1;
	const c = cueAt(tl, t);
	if (c) return c.index;
	return t <= 0 ? 0 : tl.cues.length - 1;
};

type Status = "idle" | "preparing" | "playing" | "paused" | "ended";

interface Prep {
	text: string;
	progress?: number;
}

export interface TalkPlayerProps {
	manifest: TalkManifest;
	className?: string;
	/** 再生が最後まで終わったとき。 */
	onEnded?: () => void;
}

/** 描画ループが読む可変状態。React の state とは別に ref にまとめて持つ（毎フレーム参照するため）。 */
interface PlayerRuntime {
	status: Status;
	prep: Prep | null;
	timeline: TalkTimeline | null;
	/** 発話セッション（再生中のみ）。時刻（声に合わせて動く時計）もここから引く。 */
	session: TalkSpeechSession | null;
	/** 一時停止中の位置（行の頭の秒）。 */
	pausedAt: number;
	/** 再生中に時計が戻れる下限（＝いま始めた行の頭の秒）。合成待ちで声が遅れたとき用。 */
	minSec: number;
	/** 開始の世代。連続タップで古い非同期の開始が新しい開始を上書きしないようにする。 */
	startGen: number;
	/** シークバーをドラッグ中に映す秒（再生中以外。null ならドラッグしていない）。 */
	scrubSec: number | null;
}

export default function TalkPlayer({ manifest, className, onEnded }: TalkPlayerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [status, setStatus] = useState<Status>("idle");
	const [prep, setPrep] = useState<Prep | null>(null);
	const [timeline, setTimeline] = useState<TalkTimeline | null>(null);
	const [progressSec, setProgressSec] = useState(0);
	const rt = useRef<PlayerRuntime>({
		status: "idle",
		prep: null,
		timeline: null,
		session: null,
		pausedAt: 0,
		minSec: 0,
		startGen: 0,
		scrubSec: null,
	});
	/** ドラッグ中の位置（秒）。表示用。 */
	const [scrubSec, setScrubSec] = useState<number | null>(null);
	const barRef = useRef<HTMLDivElement>(null);

	/** 状態は ref と state の両方へ同時に入れる（ref をエフェクトで追うと連続タップの判定が 1 レンダー遅れる）。 */
	const setStatusSync = useCallback((s: Status) => {
		rt.current.status = s;
		setStatus(s);
	}, []);
	const setPrepSync = useCallback((p: Prep | null) => {
		rt.current.prep = p;
		setPrep(p);
	}, []);

	const currentTimeSec = useCallback((): number => {
		const r = rt.current;
		if (r.status === "playing") return Math.max(r.minSec, r.session?.timeSec() ?? r.minSec);
		if (r.status === "preparing") return r.minSec;
		if (r.scrubSec !== null && r.timeline) return r.scrubSec;
		if (r.status === "paused") return r.pausedAt;
		if (r.status === "ended") return r.timeline?.totalSec ?? 0;
		return 0;
	}, []);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const r = rt.current;
		drawTalkFrame(ctx, manifest, r.timeline, currentTimeSec(), {
			overlayText: r.prep?.text,
			overlayProgress: r.prep?.progress,
		});
	}, [manifest, currentTimeSec]);

	const stopSession = useCallback(() => {
		rt.current.session?.stop();
		rt.current.session = null;
	}, []);

	// 台本が編集されたら計画（時間軸）を捨てる。エディタはプレビューを出しっぱなしにするので、
	// これが無いと最初に計画した台本のまま鳴り続ける。再生中・準備中なら止めてから捨てる
	// （見本の切り替えなど。鳴らしたままだと古い台本の声と新しい絵がずれる）。
	const shownManifest = useRef(manifest);
	useEffect(() => {
		if (shownManifest.current === manifest) return;
		shownManifest.current = manifest;
		const r = rt.current;
		r.startGen++; // 進行中の開始処理（準備・合成待ち）を無効にする
		stopSession();
		r.timeline = null;
		r.pausedAt = 0;
		r.minSec = 0;
		r.scrubSec = null;
		setScrubSec(null);
		setTimeline(null);
		setProgressSec(0);
		setPrepSync(null);
		if (r.status !== "idle") setStatusSync("idle");
	}, [manifest, setStatusSync, setPrepSync, stopSession]);

	// 画像の先読み（声とは独立）
	useEffect(() => {
		let alive = true;
		void preloadTalkAssets(manifest).then(() => {
			if (alive) draw();
		});
		return () => {
			alive = false;
		};
	}, [manifest, draw]);

	// 描画ループ（再生中だけ回す。止まっているときは状態変化のたびに 1 枚描く）
	useEffect(() => {
		if (status !== "playing") {
			draw();
			return;
		}
		let alive = true;
		let raf = 0;
		const loop = () => {
			if (!alive) return;
			const t = currentTimeSec();
			const tl = rt.current.timeline;
			draw();
			setProgressSec(t);
			if (tl && t >= tl.totalSec) {
				stopSession();
				setStatusSync("ended");
				onEnded?.();
				return;
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
		};
	}, [status, draw, currentTimeSec, stopSession, onEnded, setStatusSync]);

	useEffect(() => {
		draw();
	}, [prep, draw]);

	useEffect(() => () => stopSession(), [stopSession]);

	/** 準備と計画（初回のみ重い）。時間軸を作って返す。 */
	const ensureTimeline = useCallback(async (): Promise<TalkTimeline> => {
		const existing = rt.current.timeline;
		if (existing) return existing;
		setPrepSync({ text: "ボイスを準備中…", progress: 0 });
		await prepareTalkVoice(manifest, (loaded, total) => {
			setPrepSync({ text: "ボイスを準備中…", progress: total > 0 ? loaded / total : 0 });
		});
		setPrepSync({ text: "台本を読んでいます…", progress: 0 });
		// 最初の行の合成を先に始めておき、全行の計画と重ねる（時間軸が無い＝最初の行から再生する）
		await prerenderTalkHead(manifest);
		const plans = await planTalkCues(manifest, (done, total) => {
			setPrepSync({ text: "台本を読んでいます…", progress: total > 0 ? done / total : 0 });
		});
		const tl = buildTalkTimeline(manifest, plans);
		rt.current.timeline = tl;
		setTimeline(tl);
		setPrepSync(null);
		return tl;
	}, [manifest, setPrepSync]);

	/** fromIndex 行目から再生を始める（ユーザー操作の延長で呼ぶ）。 */
	const startFrom = useCallback(
		async (fromIndex: number) => {
			const r = rt.current;
			const gen = ++r.startGen;
			stopSession();
			r.minSec = r.timeline?.cues[fromIndex]?.startSec ?? 0;
			setProgressSec(r.minSec);
			setStatusSync("preparing");
			const tl = await ensureTimeline();
			if (gen !== r.startGen) return; // 待っている間に別の開始/停止があった
			if (tl.cues.length === 0) {
				setStatusSync("ended");
				return;
			}
			const idx = Math.max(0, Math.min(tl.cues.length - 1, fromIndex));
			// 先頭の行の最初のチャンクの合成を待つあいだの表示（待たずに始めると頭が欠ける）。
			// 待っているあいだはこれから始める行を映す（時計の下限を先に入れておく）。
			r.minSec = tl.cues[idx]?.startSec ?? 0;
			setProgressSec(r.minSec);
			setPrepSync({ text: "まもなく再生します…" });
			const session = await scheduleTalkSpeech(manifest, tl, idx);
			if (gen !== r.startGen) {
				session.stop();
				return;
			}
			setPrepSync(null);
			r.session = session;
			setStatusSync("playing");
		},
		[ensureTimeline, manifest, stopSession, setStatusSync, setPrepSync],
	);

	const handleToggle = useCallback(() => {
		const r = rt.current;
		if (r.status === "preparing") return;
		if (r.status === "playing") {
			const t = currentTimeSec();
			const cue = r.timeline ? cueAt(r.timeline, t) : null;
			r.pausedAt = cue ? cue.startSec : 0;
			r.startGen++;
			stopSession();
			setProgressSec(r.pausedAt); // 再開はこの行の頭からなので、バーもそこへ戻す
			setStatusSync("paused");
			return;
		}
		let from = 0;
		if (r.status === "paused" && r.timeline) {
			from = r.timeline.cues.findIndex((c) => c.startSec >= r.pausedAt - 1e-6);
			if (from < 0) from = 0;
		}
		void startFrom(from);
	}, [currentTimeSec, startFrom, stopSession, setStatusSync]);

	/**
	 * index 行目の頭へ飛ぶ。再生中ならそこから鳴らし直し、止まっているなら止めたまま
	 * （YouTube と同じ）。まだ計画していなければ（初回）再生を始める。
	 */
	const seekToIndex = useCallback(
		(index: number) => {
			const r = rt.current;
			// 初回の準備中は計画が二重に走るので受けない（合成待ちなら startFrom が世代で捌く）
			if (r.status === "preparing" && !r.timeline) return;
			if (r.status === "playing" || r.status === "preparing" || !r.timeline) {
				void startFrom(index);
				return;
			}
			r.startGen++;
			stopSession();
			r.pausedAt = r.timeline.cues[index]?.startSec ?? 0;
			setProgressSec(r.pausedAt);
			if (r.status === "paused") draw();
			else setStatusSync("paused");
		},
		[startFrom, stopSession, setStatusSync, draw],
	);

	// バーの目盛りは、計画前は文字数からの推定長で描く（押せば計画して、その行から始める）。
	const estimated = useMemo(() => buildTalkTimeline(manifest, new Map()), [manifest]);
	const barTimeline = timeline ?? estimated;
	const total = barTimeline.totalSec;
	const shownSec = scrubSec ?? progressSec;
	const ratio = total > 0 ? Math.max(0, Math.min(1, shownSec / total)) : 0;
	const scrubCue: TalkTimelineCue | null =
		scrubSec !== null ? (barTimeline.cues[cueIndexAt(barTimeline, scrubSec)] ?? null) : null;

	const secFromPointer = useCallback(
		(clientX: number): number => {
			const bar = barRef.current;
			if (!bar || total <= 0) return 0;
			const rect = bar.getBoundingClientRect();
			const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
			return x * total;
		},
		[total],
	);

	/** ドラッグ中の位置を反映する。止まっているときは画面もその行の頭で映す。 */
	const updateScrub = useCallback(
		(sec: number | null) => {
			const r = rt.current;
			setScrubSec(sec);
			const tl = r.timeline;
			r.scrubSec = sec !== null && tl ? (tl.cues[cueIndexAt(tl, sec)]?.startSec ?? 0) : null;
			if (r.status !== "playing") draw();
		},
		[draw],
	);

	const handleBarPointerDown = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			if (e.button !== 0 || total <= 0) return;
			e.stopPropagation();
			e.currentTarget.setPointerCapture(e.pointerId);
			updateScrub(secFromPointer(e.clientX));
		},
		[total, updateScrub, secFromPointer],
	);
	const handleBarPointerMove = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
			updateScrub(secFromPointer(e.clientX));
		},
		[updateScrub, secFromPointer],
	);
	const handleBarPointerUp = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
			e.currentTarget.releasePointerCapture(e.pointerId);
			const index = cueIndexAt(barTimeline, secFromPointer(e.clientX));
			updateScrub(null);
			if (index >= 0) seekToIndex(index);
		},
		[barTimeline, updateScrub, secFromPointer, seekToIndex],
	);
	const handleBarPointerCancel = useCallback(() => updateScrub(null), [updateScrub]);

	/** ← → で前後の行、Home / End で先頭・最後の行、スペースで再生／一時停止。 */
	const handleBarKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLDivElement>) => {
			const n = barTimeline.cues.length;
			if (n === 0) return;
			const cur = Math.max(0, cueIndexAt(barTimeline, progressSec));
			let next: number | null = null;
			if (e.key === "ArrowLeft") {
				// 行の途中なら行の頭へ、頭にいれば前の行へ（プレイヤーの「前へ」と同じ）
				const head = barTimeline.cues[cur]?.startSec ?? 0;
				next = progressSec - head > 0.5 ? cur : cur - 1;
			} else if (e.key === "ArrowRight") next = cur + 1;
			else if (e.key === "Home") next = 0;
			else if (e.key === "End") next = n - 1;
			else if (e.key === " " || e.key === "k") {
				e.preventDefault();
				handleToggle();
				return;
			}
			if (next === null) return;
			e.preventDefault();
			seekToIndex(Math.max(0, Math.min(n - 1, next)));
		},
		[barTimeline, progressSec, seekToIndex, handleToggle],
	);

	const scrubSpeaker = scrubCue ? talkCharacterOf(manifest, scrubCue.cue.speaker) : null;
	const busy = status === "preparing" && !timeline;

	return (
		<div className={`relative w-full select-none ${className ?? ""}`}>
			<div
				className="relative w-full bg-black rounded overflow-hidden cursor-pointer"
				style={{ aspectRatio: `${TALK_W} / ${TALK_H}` }}
				onClick={handleToggle}
			>
				<canvas
					ref={canvasRef}
					width={TALK_W}
					height={TALK_H}
					className="block w-full h-full"
				/>
				{(status === "idle" || status === "paused" || status === "ended") && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<div className="w-14 h-14 rounded-full bg-black/60 border border-white/40 flex items-center justify-center text-white">
							{status === "ended" ? <RotateCcw size={24} /> : <Play size={26} />}
						</div>
					</div>
				)}
				{status === "playing" && (
					<div className="absolute top-2 right-2 text-white/70 pointer-events-none">
						<Pause size={16} />
					</div>
				)}
			</div>
			{/* 操作列: 再生ボタン・シークバー（行の区切りに目盛り、ドラッグで移動）・時刻 */}
			<div className="mt-1 flex h-5 w-full items-center gap-2 px-1 text-white">
				<button
					type="button"
					onClick={handleToggle}
					disabled={status === "preparing"}
					aria-label={status === "playing" ? "一時停止" : "再生"}
					className="flex h-5 w-5 shrink-0 items-center justify-center text-white/80 hover:text-white disabled:opacity-40"
				>
					{status === "playing" ? (
						<Pause size={14} />
					) : status === "ended" ? (
						<RotateCcw size={14} />
					) : (
						<Play size={14} />
					)}
				</button>
				<div
					ref={barRef}
					role="slider"
					tabIndex={0}
					aria-label="再生位置"
					aria-valuemin={0}
					aria-valuemax={Math.round(total)}
					aria-valuenow={Math.round(shownSec)}
					aria-valuetext={`${formatSec(shownSec)} / ${formatSec(total)}`}
					onPointerDown={handleBarPointerDown}
					onPointerMove={handleBarPointerMove}
					onPointerUp={handleBarPointerUp}
					onPointerCancel={handleBarPointerCancel}
					onKeyDown={handleBarKeyDown}
					className={`group relative h-5 flex-1 touch-none outline-none ${
						busy ? "cursor-wait" : "cursor-pointer"
					}`}
				>
					<div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-gray-700/70 transition-[height] group-hover:h-1.5" />
					<div
						className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded bg-yellow-400/80 transition-[height] group-hover:h-1.5"
						style={{ width: `${ratio * 100}%` }}
					/>
					{barTimeline.cues.slice(1).map((c) => (
						<div
							key={c.cue.id}
							className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-black/70"
							style={{ left: `${total > 0 ? (c.startSec / total) * 100 : 0}%` }}
						/>
					))}
					<div
						className={`pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-300 shadow transition-transform group-hover:scale-100 group-focus-visible:scale-100 ${
							scrubSec !== null ? "scale-100" : "scale-0"
						}`}
						style={{ left: `${ratio * 100}%` }}
					/>
					{/* ドラッグ中: 離すとどの行の頭から始まるか */}
					{scrubCue && (
						<div
							className="pointer-events-none absolute bottom-full mb-1.5 max-w-[80%] rounded bg-black/85 px-2 py-1 text-[11px] leading-tight shadow"
							style={{ left: `${ratio * 100}%`, transform: `translateX(-${ratio * 100}%)` }}
						>
							<div className="whitespace-nowrap text-[10px] text-gray-300">
								{scrubCue.index + 1}/{barTimeline.cues.length}
								{scrubSpeaker && (
									<span className="ml-1 font-bold" style={{ color: scrubSpeaker.color }}>
										{scrubSpeaker.name}
									</span>
								)}
								<span className="ml-1 tabular-nums">
									{timeline ? "" : "約"}
									{formatSec(scrubCue.startSec)}から
								</span>
							</div>
							<div className="truncate">{scrubCue.cue.subtitle ?? scrubCue.cue.text}</div>
						</div>
					)}
				</div>
				<div className="shrink-0 text-[10px] tabular-nums text-white/70">
					{formatSec(shownSec)} / {timeline ? "" : "約"}
					{formatSec(total)}
				</div>
			</div>
		</div>
	);
}
