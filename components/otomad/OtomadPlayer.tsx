"use client";

// 音MAD のプレイヤー。設計: docs/otomad-feature-design.md
//
// 再生の流れ: MML を解析（parseMvSong）→ 時間軸（buildOtomadTimeline）→ 素材の読み込み
// （OtomadMediaCache.prepare: 音のデコードと、使う区間のコマ取り）→ サンプラーを予約
// （startOtomadPlayback）→ 描画ループ。時刻は AudioContext の時計（session.timeSec()）。
// 一時停止・シークは任意の秒で、途中の音符は続きから鳴る（サンプルなので正確にできる）。
//
// manifest が変わったら時間軸を作り直す。素材・区間が同じならコマは再利用される
// （OtomadMediaCache は同じインスタンスを持ち続ける）。

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
import { getStudio } from "@/lib/mml/dtm";
import { EMPTY_SONG, type MvSong, parseMvSong } from "@/lib/mv/mv-engine";
import { type OtomadPlaybackSession, startOtomadPlayback } from "@/lib/otomad/otomad-audio";
import { OTOMAD_H, OTOMAD_W, type OtomadManifest } from "@/lib/otomad/otomad-config";
import { type OtomadDrawOptions, drawOtomadFrame, preloadOtomadImages } from "@/lib/otomad/otomad-engine";
import { OtomadMediaCache, type OtomadMediaWarning } from "@/lib/otomad/otomad-media";
import {
	buildOtomadTimeline,
	EMPTY_OTOMAD_TIMELINE,
	type OtomadTimeline,
} from "@/lib/otomad/otomad-timeline";

const formatSec = (sec: number): string => {
	const s = Math.max(0, Math.floor(sec));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type Status = "idle" | "preparing" | "playing" | "paused" | "ended";

/** 時間軸（音符→イベント）に効く部分だけの署名。素材の長さ・タイトルなどは含めない。 */
const timelineSignature = (m: OtomadManifest): string =>
	JSON.stringify({
		mml: m.mml,
		lead: m.leadInSec,
		tracks: m.tracks,
		backing: m.backing,
		guide: m.guide,
		sources: m.sources.map((s) => ({
			id: s.id,
			kind: s.kind,
			url: s.url,
			hash: s.local?.hash,
			inSec: s.inSec,
			outSec: s.outSec,
			baseNote: s.baseNote,
			gainDb: s.gainDb,
			crop: s.crop,
		})),
	});

interface Prep {
	text: string;
	progress?: number;
}

export interface OtomadPlayerHandle {
	/** 時間軸と素材を用意する（書き出しの前に呼ぶ）。 */
	prepare: () => Promise<{ timeline: OtomadTimeline; media: OtomadMediaCache } | null>;
	getMedia: () => OtomadMediaCache | null;
	getTimeline: () => OtomadTimeline | null;
	/** いま映している秒（停止中は停止位置）。 */
	getTimeSec: () => number;
	stop: () => void;
}

export interface OtomadPlayerProps {
	manifest: OtomadManifest;
	className?: string;
	onEnded?: () => void;
	/** 素材の読み込み結果（長さ・警告）。エディタが manifest に書き戻す。 */
	onMediaReady?: (info: { durations: Map<string, number>; warnings: OtomadMediaWarning[]; tainted: boolean }) => void;
	/** 曲の解析結果（トラック一覧など。エディタ用）。 */
	onSongParsed?: (song: MvSong) => void;
	/** エディタ用の描画オプション（slot の枠）。 */
	drawOptions?: OtomadDrawOptions;
	/** キャンバス上のポインタ操作（slot のドラッグ）。論理座標で渡す。 */
	onCanvasPointer?: (e: { type: "down" | "move" | "up"; x: number; y: number; shift: boolean }) => boolean;
	handleRef?: (h: OtomadPlayerHandle | null) => void;
}

interface PlayerRuntime {
	status: Status;
	prep: Prep | null;
	song: MvSong;
	timeline: OtomadTimeline | null;
	media: OtomadMediaCache | null;
	mediaReadyFor: OtomadTimeline | null;
	session: OtomadPlaybackSession | null;
	pausedAt: number;
	startGen: number;
	scrubSec: number | null;
}

export default function OtomadPlayer({
	manifest,
	className,
	onEnded,
	onMediaReady,
	onSongParsed,
	drawOptions,
	onCanvasPointer,
	handleRef,
}: OtomadPlayerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [status, setStatus] = useState<Status>("idle");
	const [prep, setPrep] = useState<Prep | null>(null);
	const [timeline, setTimeline] = useState<OtomadTimeline | null>(null);
	const [progressSec, setProgressSec] = useState(0);
	const [scrubSec, setScrubSec] = useState<number | null>(null);
	const barRef = useRef<HTMLDivElement>(null);
	const rt = useRef<PlayerRuntime>({
		status: "idle",
		prep: null,
		song: EMPTY_SONG,
		timeline: null,
		media: null,
		mediaReadyFor: null,
		session: null,
		pausedAt: 0,
		startGen: 0,
		scrubSec: null,
	});
	// 描画ループ・非同期処理から最新の props を読むための ref（render 中には触らず effect で同期する）
	const drawOptionsRef = useRef(drawOptions);
	const manifestRef = useRef(manifest);
	const onMediaReadyRef = useRef(onMediaReady);
	const onSongParsedRef = useRef(onSongParsed);
	useEffect(() => {
		drawOptionsRef.current = drawOptions;
		manifestRef.current = manifest;
		onMediaReadyRef.current = onMediaReady;
		onSongParsedRef.current = onSongParsed;
	}, [drawOptions, manifest, onMediaReady, onSongParsed]);

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
		if (r.status === "playing") return r.session?.timeSec() ?? r.pausedAt;
		if (r.status === "preparing") return r.pausedAt;
		if (r.scrubSec !== null) return r.scrubSec;
		if (r.status === "paused") return r.pausedAt;
		if (r.status === "ended") return r.timeline?.totalSec ?? 0;
		return r.pausedAt;
	}, []);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const r = rt.current;
		drawOtomadFrame(ctx, manifestRef.current, r.timeline, r.media, currentTimeSec(), {
			...(drawOptionsRef.current ?? {}),
			edgeFade: r.status === "playing",
			overlayText: r.prep?.text,
			overlayProgress: r.prep?.progress,
		});
	}, [currentTimeSec]);

	const stopSession = useCallback(() => {
		rt.current.session?.stop();
		rt.current.session = null;
	}, []);

	// 曲の解析と時間軸（manifest が変わるたび）。素材の読み込みは再生時に遅延する。
	// 時間軸に関わらない変更（タイトル・クレジット・素材の長さの書き戻しなど）では再生を止めない
	// （準備中に長さが書き戻されて開始が中断され、初回だけ再生ボタンを 2 回押す羽目になっていた）。
	// 反映済みの時間軸の署名。解析が完了して反映したときにだけ更新する（effect の開始時に更新すると、
	// 開発モードの二重実行で 2 回目が「変わっていない」と誤判定して解析を飛ばし、時間軸が空のままになる）。
	const appliedSignature = useRef<string>("");
	useEffect(() => {
		let alive = true;
		const r = rt.current;
		const sig = timelineSignature(manifest);
		if (sig === appliedSignature.current && r.timeline) {
			draw();
			return;
		}
		r.startGen++;
		const wasActive = r.status === "playing" || r.status === "preparing";
		if (wasActive) r.pausedAt = Math.min(r.pausedAt, currentTimeSec());
		stopSession();
		r.mediaReadyFor = null;
		void parseMvSong(manifest.mml).then((song) => {
			if (!alive) return;
			appliedSignature.current = sig;
			if (wasActive) setStatusSync("paused");
			setPrepSync(null);
			r.song = song;
			onSongParsedRef.current?.(song);
			const tl = buildOtomadTimeline(manifest, song);
			r.timeline = tl;
			if (r.pausedAt > tl.totalSec) r.pausedAt = 0;
			setTimeline(tl);
			setProgressSec(r.pausedAt);
			draw();
		});
		void preloadOtomadImages(manifest).then(() => {
			if (alive) draw();
		});
		return () => {
			alive = false;
		};
	}, [manifest, draw, stopSession, setStatusSync, setPrepSync, currentTimeSec]);

	// 描画ループ
	useEffect(() => {
		if (status !== "playing") {
			draw();
			return;
		}
		let alive = true;
		let raf = 0;
		const loop = () => {
			if (!alive) return;
			draw();
			setProgressSec(currentTimeSec());
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
		};
	}, [status, draw, currentTimeSec]);

	useEffect(() => {
		draw();
	}, [prep, drawOptions, draw]);

	useEffect(
		() => () => {
			stopSession();
			rt.current.media?.destroy();
			rt.current.media = null;
		},
		[stopSession],
	);

	/** 時間軸と素材を用意する。 */
	const ensureReady = useCallback(async (): Promise<{ timeline: OtomadTimeline; media: OtomadMediaCache } | null> => {
		const r = rt.current;
		const studio = await getStudio();
		if (!r.media) r.media = new OtomadMediaCache(studio.audioContext);
		const song = r.song.totalSteps > 0 || !manifestRef.current.mml.trim() ? r.song : await parseMvSong(manifestRef.current.mml);
		r.song = song;
		const tl = r.timeline ?? buildOtomadTimeline(manifestRef.current, song);
		r.timeline = tl;
		if (r.mediaReadyFor !== tl) {
			setPrepSync({ text: "素材を読み込み中…", progress: 0 });
			await r.media.prepare(manifestRef.current, tl, (p) => {
				setPrepSync({
					text: p.label ? `素材を読み込み中… ${p.label}` : "素材を読み込み中…",
					progress: p.total > 0 ? p.done / p.total : 0,
				});
			});
			r.mediaReadyFor = tl;
			onMediaReadyRef.current?.({
				durations: new Map(r.media.durations),
				warnings: [...r.media.warnings],
				tainted: r.media.hasTaint(),
			});
			setPrepSync(null);
		}
		return { timeline: tl, media: r.media };
	}, [setPrepSync]);

	const startFrom = useCallback(
		async (fromSec: number) => {
			const r = rt.current;
			const gen = ++r.startGen;
			stopSession();
			r.pausedAt = Math.max(0, fromSec);
			setProgressSec(r.pausedAt);
			setStatusSync("preparing");
			const ready = await ensureReady();
			if (gen !== r.startGen) return;
			if (!ready || ready.timeline.totalSec <= 0) {
				setStatusSync("idle");
				return;
			}
			const studio = await getStudio();
			const dtm = await import("@onjmin/dtm");
			if (gen !== r.startGen) return;
			const from = Math.min(r.pausedAt, ready.timeline.totalSec);
			r.session = startOtomadPlayback({
				studio,
				midiToUnits: (m) => dtm.midiToUnits(m) as unknown as number,
				manifest: manifestRef.current,
				media: ready.media,
				timeline: ready.timeline,
				fromSec: from,
				onEnded: () => {
					if (gen !== r.startGen) return;
					r.session = null;
					r.pausedAt = 0;
					setStatusSync("ended");
					onEnded?.();
				},
			});
			setStatusSync("playing");
		},
		[ensureReady, stopSession, setStatusSync, onEnded],
	);

	const pause = useCallback(() => {
		const r = rt.current;
		if (r.status !== "playing") return;
		r.pausedAt = currentTimeSec();
		r.startGen++;
		stopSession();
		setProgressSec(r.pausedAt);
		setStatusSync("paused");
	}, [currentTimeSec, stopSession, setStatusSync]);

	const handleToggle = useCallback(() => {
		const r = rt.current;
		if (r.status === "preparing") return;
		if (r.status === "playing") {
			pause();
			return;
		}
		void startFrom(r.status === "ended" ? 0 : r.pausedAt);
	}, [pause, startFrom]);

	const seekTo = useCallback(
		(sec: number) => {
			const r = rt.current;
			const total = r.timeline?.totalSec ?? 0;
			const t = Math.max(0, Math.min(total, sec));
			if (r.status === "playing" || r.status === "preparing") {
				void startFrom(t);
				return;
			}
			r.pausedAt = t;
			setProgressSec(t);
			if (r.status === "ended" || r.status === "idle") setStatusSync("paused");
			else draw();
		},
		[startFrom, setStatusSync, draw],
	);

	useEffect(() => {
		if (!handleRef) return;
		handleRef({
			prepare: ensureReady,
			getMedia: () => rt.current.media,
			getTimeline: () => rt.current.timeline,
			getTimeSec: () => currentTimeSec(),
			stop: () => {
				const r = rt.current;
				r.startGen++;
				stopSession();
				if (r.status !== "idle") setStatusSync("paused");
			},
		});
		return () => handleRef(null);
	}, [handleRef, ensureReady, stopSession, setStatusSync, currentTimeSec]);

	// ── シークバー ──
	const barTimeline = timeline ?? EMPTY_OTOMAD_TIMELINE;
	const total = barTimeline.totalSec;
	const shownSec = scrubSec ?? progressSec;
	const ratio = total > 0 ? Math.max(0, Math.min(1, shownSec / total)) : 0;

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
	const updateScrub = useCallback(
		(sec: number | null) => {
			rt.current.scrubSec = sec;
			setScrubSec(sec);
			if (rt.current.status !== "playing") draw();
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
			const sec = secFromPointer(e.clientX);
			updateScrub(null);
			seekTo(sec);
		},
		[updateScrub, secFromPointer, seekTo],
	);
	const handleBarPointerCancel = useCallback(() => updateScrub(null), [updateScrub]);
	const handleBarKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLDivElement>) => {
			const bars = barTimeline.barSec;
			const cur = progressSec;
			if (e.key === " " || e.key === "k") {
				e.preventDefault();
				handleToggle();
				return;
			}
			let next: number | null = null;
			if (e.key === "ArrowLeft") {
				const prev = [...bars].reverse().find((b) => b < cur - 0.3);
				next = prev ?? 0;
			} else if (e.key === "ArrowRight") {
				const n = bars.find((b) => b > cur + 1e-3);
				next = n ?? total;
			} else if (e.key === "Home") next = 0;
			else if (e.key === "End") next = total;
			if (next === null) return;
			e.preventDefault();
			seekTo(next);
		},
		[barTimeline, progressSec, total, handleToggle, seekTo],
	);

	// ── キャンバス上のポインタ（エディタの slot ドラッグ） ──
	const toLogical = (e: ReactPointerEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		return {
			x: ((e.clientX - rect.left) / rect.width) * OTOMAD_W,
			y: ((e.clientY - rect.top) / rect.height) * OTOMAD_H,
		};
	};
	const dragging = useRef(false);
	/** ドラッグ直後の click（pointerup と同時に来る）で再生が始まらないようにする。 */
	const suppressClick = useRef(false);
	const handleCanvasPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (!onCanvasPointer || e.button !== 0) return;
		const p = toLogical(e);
		if (onCanvasPointer({ type: "down", ...p, shift: e.shiftKey })) {
			dragging.current = true;
			e.currentTarget.setPointerCapture(e.pointerId);
			e.stopPropagation();
		}
	};
	const handleCanvasPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (!onCanvasPointer || !dragging.current) return;
		onCanvasPointer({ type: "move", ...toLogical(e), shift: e.shiftKey });
	};
	const handleCanvasPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (!onCanvasPointer || !dragging.current) return;
		dragging.current = false;
		suppressClick.current = true;
		e.currentTarget.releasePointerCapture(e.pointerId);
		onCanvasPointer({ type: "up", ...toLogical(e), shift: e.shiftKey });
		e.stopPropagation();
	};
	const handleCanvasClick = () => {
		if (suppressClick.current) {
			suppressClick.current = false;
			return;
		}
		if (dragging.current) return;
		handleToggle();
	};

	const scrubBar = scrubSec !== null && total > 0 ? Math.max(0, barTimeline.barSec.filter((b) => b <= scrubSec).length - 1) : null;

	return (
		<div className={`relative w-full select-none ${className ?? ""}`}>
			<div
				className="relative w-full bg-black rounded overflow-hidden cursor-pointer touch-none"
				style={{ aspectRatio: `${OTOMAD_W} / ${OTOMAD_H}` }}
				onClick={handleCanvasClick}
				onPointerDown={handleCanvasPointerDown}
				onPointerMove={handleCanvasPointerMove}
				onPointerUp={handleCanvasPointerUp}
			>
				<canvas ref={canvasRef} width={OTOMAD_W} height={OTOMAD_H} className="block w-full h-full" />
				{(status === "idle" || status === "paused" || status === "ended") && !prep && (
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
			<div className="mt-1 flex h-5 w-full items-center gap-2 px-1 text-white">
				<button
					type="button"
					onClick={handleToggle}
					disabled={status === "preparing"}
					aria-label={status === "playing" ? "一時停止" : "再生"}
					className="flex h-5 w-5 shrink-0 items-center justify-center text-white/80 hover:text-white disabled:opacity-40"
				>
					{status === "playing" ? <Pause size={14} /> : status === "ended" ? <RotateCcw size={14} /> : <Play size={14} />}
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
					className={`group relative h-5 flex-1 touch-none outline-none ${status === "preparing" ? "cursor-wait" : "cursor-pointer"}`}
				>
					<div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-gray-700/70 transition-[height] group-hover:h-1.5" />
					<div
						className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded bg-pink-400/80 transition-[height] group-hover:h-1.5"
						style={{ width: `${ratio * 100}%` }}
					/>
					{barTimeline.barSec.slice(1, -1).map((b, i) => (
						<div
							key={i}
							className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-black/70"
							style={{ left: `${total > 0 ? (b / total) * 100 : 0}%` }}
						/>
					))}
					<div
						className={`pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-300 shadow transition-transform group-hover:scale-100 group-focus-visible:scale-100 ${scrubSec !== null ? "scale-100" : "scale-0"}`}
						style={{ left: `${ratio * 100}%` }}
					/>
					{scrubSec !== null && (
						<div
							className="pointer-events-none absolute bottom-full mb-1.5 rounded bg-black/85 px-2 py-1 text-[11px] leading-tight shadow whitespace-nowrap"
							style={{ left: `${ratio * 100}%`, transform: `translateX(-${ratio * 100}%)` }}
						>
							{scrubBar !== null && <span className="text-gray-300 mr-1">{scrubBar + 1} 小節</span>}
							<span className="tabular-nums">{formatSec(scrubSec)}</span>
						</div>
					)}
				</div>
				<div className="shrink-0 text-[10px] tabular-nums text-white/70">
					{formatSec(shownSec)} / {formatSec(total)}
				</div>
			</div>
		</div>
	);
}

/** 既定の描画オプション（エディタ以外）。 */
export const OTOMAD_PLAYER_PLAIN: OtomadDrawOptions = {};
export const useOtomadDrawOptions = (highlight: OtomadDrawOptions["highlight"], outlines: boolean) =>
	useMemo<OtomadDrawOptions>(() => ({ highlight, showSlotOutlines: outlines }), [highlight, outlines]);
