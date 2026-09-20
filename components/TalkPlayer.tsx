"use client";

// かけあい動画のプレイヤー。設計: docs/talk-video-feature-design.md
//
// 再生の流れ（ユーザー操作の延長で行う）:
//   準備（TTS アセット・音源・感情モデル）→ 全行の計画 → 時間軸 → 発話を絶対時刻で全部置く → 描画ループ
// 時刻は AudioContext の時計から引く（timeSec = ctx.currentTime - t0）。
// 一時停止は発話を止めて現在の行の頭を覚え、再開はそこから置き直す（行の途中からは再開しない）。

import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStudio } from "@/lib/dtm";
import {
	planTalkCues,
	prepareTalkVoice,
	scheduleTalkSpeech,
	type TalkSpeechSession,
} from "@/lib/talk-audio";
import { TALK_H, TALK_W, type TalkManifest } from "@/lib/talk-config";
import { drawTalkFrame, preloadTalkAssets } from "@/lib/talk-engine";
import { buildTalkTimeline, cueAt, type TalkTimeline } from "@/lib/talk-timeline";

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
	session: TalkSpeechSession | null;
	/** 時間軸の 0 秒に対応する AudioContext クロック秒（再生中のみ有効）。 */
	t0: number;
	/** 一時停止中の位置（行の頭の秒）。 */
	pausedAt: number;
	/** 再生中に時計が戻れる下限（＝いま始めた行の頭の秒）。合成待ちで声が遅れたとき用。 */
	minSec: number;
	audioNow: () => number;
	/** 開始の世代。連続タップで古い非同期の開始が新しい開始を上書きしないようにする。 */
	startGen: number;
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
		t0: 0,
		pausedAt: 0,
		minSec: 0,
		audioNow: () => 0,
		startGen: 0,
	});

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
		if (r.status === "playing") return Math.max(r.minSec, r.audioNow() - r.t0);
		if (r.status === "preparing") return r.minSec;
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
			setStatusSync("preparing");
			const tl = await ensureTimeline();
			if (gen !== r.startGen) return; // 待っている間に別の開始/停止があった
			if (tl.cues.length === 0) {
				setStatusSync("ended");
				return;
			}
			const idx = Math.max(0, Math.min(tl.cues.length - 1, fromIndex));
			const studio = await getStudio();
			// 先頭の行の合成を待つあいだの表示（待たずに始めると頭が欠ける・無音になる）。
			// 待っているあいだはこれから始める行を映す（時計の下限を先に入れておく）。
			r.minSec = tl.cues[idx]?.startSec ?? 0;
			setPrepSync({ text: "まもなく再生します…" });
			const session = await scheduleTalkSpeech(manifest, tl, idx);
			if (gen !== r.startGen) {
				session.stop();
				return;
			}
			setPrepSync(null);
			r.session = session;
			r.t0 = session.t0;
			r.audioNow = () => studio.audioContext.currentTime;
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

	const handleSeek = useCallback(
		(index: number) => {
			if (rt.current.status === "preparing") return;
			void startFrom(index);
		},
		[startFrom],
	);

	const total = timeline?.totalSec ?? 0;
	const ratio = total > 0 ? Math.max(0, Math.min(1, progressSec / total)) : 0;

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
			{/* 進行バー（行の区切りにマーカー）。クリックでその行の頭へ */}
			<div className="relative mt-1 h-3 w-full">
				<div className="absolute inset-y-1 left-0 right-0 rounded bg-gray-700/70" />
				<div
					className="absolute inset-y-1 left-0 rounded bg-yellow-400/80"
					style={{ width: `${ratio * 100}%` }}
				/>
				{timeline?.cues.map((c) => (
					<button
						key={c.cue.id}
						type="button"
						title={`${c.index + 1}: ${c.cue.text.slice(0, 20)}`}
						onClick={(e) => {
							e.stopPropagation();
							handleSeek(c.index);
						}}
						className="absolute top-0 h-3 w-1.5 -ml-0.5 bg-white/70 hover:bg-white rounded-sm"
						style={{ left: `${total > 0 ? (c.startSec / total) * 100 : 0}%` }}
					/>
				))}
			</div>
		</div>
	);
}
