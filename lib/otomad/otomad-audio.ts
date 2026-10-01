// 音MAD の音。設計: docs/otomad-feature-design.md §4
//
// AudioContext を直接叩くサンプラー。時計は ctx.currentTime で、イベント（otomad-timeline.ts）を
// 先読みして AudioBufferSourceNode を予約する。原曲（backing）も同じ時計に置く。
// scheduleRange() は純粋で、実時間（AudioContext）とオフライン（OfflineAudioContext）の
// 両方から呼ぶ。だから書き出しの音は再生と同じになる。
//
// ガイド音（MML のシンセ）は dtm の studio.playNoteEvent に相対秒で投げる。書き出しには入れない。

import type { DtmStudio } from "@onjmin/dtm";
import { applyMasterVolume } from "@/lib/audio/master-volume";
import {
	dbToGain,
	type OtomadManifest,
	type OtomadTrack,
} from "./otomad-config";
import type { OtomadMediaCache } from "./otomad-media";
import type { OtomadEvent, OtomadTimeline } from "./otomad-timeline";

/** 予約の先読み（秒）と間隔（ms）。 */
const LOOKAHEAD_SEC = 0.3;
const TICK_MS = 50;
/** 再生開始までの余裕（秒）。 */
const START_DELAY_SEC = 0.15;
/** バスの音量。リミッターのアタック（2ms）を抜ける頭が 0 dB を超えないよう少し下げる。 */
const BUS_GAIN = 0.8;

interface Scheduled {
	stopAt: number;
	nodes: AudioNode[];
	src: AudioBufferSourceNode;
}

/** 1 イベントを ctx の絶対時刻 t0 基準で予約する。戻り値は止めるための node 群。 */
const scheduleEvent = (
	ctx: BaseAudioContext,
	destination: AudioNode,
	manifest: OtomadManifest,
	media: OtomadMediaCache,
	ev: OtomadEvent,
	t0: number,
	/** 曲のこの秒から再生する（途中の音符は offset を進める）。 */
	fromSec: number,
): Scheduled | null => {
	if (!ev.hasAudio) return null;
	const buffer = media.audioOf(ev.source.id);
	if (!buffer) return null;
	const track: OtomadTrack = manifest.tracks[ev.trackIdx];
	const a = track.audio;
	const nudge = (a.nudgeMs || 0) / 1000;
	const start = ev.startSec + nudge;
	const end = ev.endSec + nudge;
	if (end <= fromSec) return null;

	// 音符の途中から再開するときは素材側のオフセットも進める
	const late = Math.max(0, fromSec - start);
	const when = t0 + Math.max(start, fromSec);
	const sampleOffset = ev.inSec + late * ev.rate;
	const noteLen = end - Math.max(start, fromSec);
	let sampleLen = noteLen * ev.rate;
	const avail = (ev.outSec ?? buffer.duration) - sampleOffset;
	if (avail <= 0.005) return null;
	sampleLen = Math.min(sampleLen, avail);
	const playLen = sampleLen / ev.rate;

	const src = ctx.createBufferSource();
	src.buffer = buffer;
	src.playbackRate.value = ev.rate;

	const gain = ctx.createGain();
	const vel = a.velocityToGain ? Math.max(0.05, ev.velocity / 100) : 1;
	const g = dbToGain(a.gainDb + ev.source.gainDb) * vel;
	const attack = Math.max(0.001, (a.attackMs || 0) / 1000);
	const release = Math.max(0.003, (a.releaseMs || 0) / 1000);
	gain.gain.setValueAtTime(late > 0 ? g : 0, when);
	if (late === 0) gain.gain.linearRampToValueAtTime(g, when + Math.min(attack, playLen / 2));
	const relStart = when + Math.max(0, playLen - release);
	gain.gain.setValueAtTime(g, relStart);
	gain.gain.linearRampToValueAtTime(0, when + playLen);

	const nodes: AudioNode[] = [src, gain];
	let last: AudioNode = gain;
	src.connect(gain);
	if (a.pan && typeof ctx.createStereoPanner === "function") {
		const pan = ctx.createStereoPanner();
		pan.pan.value = Math.max(-1, Math.min(1, a.pan));
		last.connect(pan);
		last = pan;
		nodes.push(pan);
	}
	last.connect(destination);
	src.start(when, Math.max(0, sampleOffset), sampleLen + 0.005);
	return { stopAt: when + playLen + 0.02, nodes, src };
};

/** 原曲を t0 基準で置く。 */
const scheduleBacking = (
	ctx: BaseAudioContext,
	destination: AudioNode,
	manifest: OtomadManifest,
	media: OtomadMediaCache,
	t0: number,
	fromSec: number,
): Scheduled | null => {
	const b = manifest.backing;
	if (!b) return null;
	const buffer = media.audioOf(b.sourceId);
	if (!buffer) return null;
	// 曲の秒 s のとき原曲は offset + s にいる
	const mediaAtFrom = b.offsetSec + fromSec;
	let when = t0 + fromSec;
	let offset = mediaAtFrom;
	if (offset < 0) {
		when += -offset;
		offset = 0;
	}
	if (offset >= buffer.duration) return null;
	const src = ctx.createBufferSource();
	src.buffer = buffer;
	const gain = ctx.createGain();
	gain.gain.value = Math.max(0, Math.min(1, b.volume / 100));
	src.connect(gain);
	gain.connect(destination);
	src.start(when, offset);
	return { stopAt: when + (buffer.duration - offset), nodes: [src, gain], src };
};

/** 簡易リミッター（0 dB を超えない。講座の「マスターに ReaLimit」相当）。 */
export const createOtomadLimiter = (ctx: BaseAudioContext): DynamicsCompressorNode => {
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -3;
	comp.knee.value = 2;
	comp.ratio.value = 20;
	comp.attack.value = 0.002;
	comp.release.value = 0.08;
	return comp;
};

/**
 * [fromSec, toSec) に始まるイベントを予約する（純粋。実時間・オフライン共通）。
 * `playFrom` は曲のどこから再生しているか（途中の音符の offset 用）。
 */
export const scheduleRange = (
	ctx: BaseAudioContext,
	destination: AudioNode,
	manifest: OtomadManifest,
	media: OtomadMediaCache,
	timeline: OtomadTimeline,
	t0: number,
	playFrom: number,
	fromSec: number,
	toSec: number,
): Scheduled[] => {
	const out: Scheduled[] = [];
	for (const ev of timeline.events) {
		const nudge = (manifest.tracks[ev.trackIdx]?.audio.nudgeMs || 0) / 1000;
		const start = Math.max(ev.startSec + nudge, playFrom);
		if (start < fromSec || start >= toSec) continue;
		const s = scheduleEvent(ctx, destination, manifest, media, ev, t0, playFrom);
		if (s) out.push(s);
	}
	return out;
};

/** 全部をオフラインで描く（書き出し用）。 */
export const renderOtomadAudio = async (
	manifest: OtomadManifest,
	media: OtomadMediaCache,
	timeline: OtomadTimeline,
	sampleRate = 48000,
): Promise<AudioBuffer> => {
	const length = Math.max(1, Math.ceil(timeline.totalSec * sampleRate));
	const ctx = new OfflineAudioContext(2, length, sampleRate);
	// media の AudioBuffer は別の AudioContext で decode したものだが、AudioBufferSourceNode は
	// どのコンテキストでも同じ AudioBuffer を再生できる（sampleRate が違えばリサンプルされる）
	const master = ctx.createGain();
	master.gain.value = BUS_GAIN;
	const limiter = createOtomadLimiter(ctx);
	master.connect(limiter);
	limiter.connect(ctx.destination);
	scheduleRange(ctx, master, manifest, media, timeline, 0, 0, 0, timeline.totalSec + 1);
	scheduleBacking(ctx, master, manifest, media, 0, 0);
	return ctx.startRendering();
};

// ── 実時間の再生セッション ───────────────────────────────────

export interface OtomadPlaybackSession {
	/** 曲の現在秒。 */
	timeSec: () => number;
	stop: () => void;
	isRunning: () => boolean;
}

export interface StartOtomadPlaybackOptions {
	studio: DtmStudio;
	/** dtm の midiToUnits（ガイド音の音高）。`await import("@onjmin/dtm")` から渡す */
	midiToUnits: (midi: number) => number;
	manifest: OtomadManifest;
	media: OtomadMediaCache;
	timeline: OtomadTimeline;
	fromSec: number;
	onEnded?: () => void;
}

/**
 * fromSec から鳴らし始める。studio.audioContext の時計を使い、masterGain の下にぶら下げる。
 * 停止は予約済みの node を全部止める。
 */
export const startOtomadPlayback = (opts: StartOtomadPlaybackOptions): OtomadPlaybackSession => {
	const { studio, manifest, media, timeline, fromSec, onEnded, midiToUnits } = opts;
	const ctx = studio.audioContext;
	if (ctx.state === "suspended") void ctx.resume();
	const bus = ctx.createGain();
	bus.gain.value = BUS_GAIN;
	const limiter = createOtomadLimiter(ctx);
	bus.connect(limiter);
	limiter.connect(studio.masterGain);
	const t0 = ctx.currentTime + START_DELAY_SEC - fromSec;
	let running = true;
	let scheduledUpTo = fromSec;
	const live: Scheduled[] = [];

	const backing = scheduleBacking(ctx, bus, manifest, media, t0, fromSec);
	if (backing) live.push(backing);

	const guideFor = (ev: OtomadEvent) => {
		if (!manifest.guide.enabled) return;
		const when = t0 + ev.startSec - ctx.currentTime;
		if (when < -0.05) return;
		try {
			studio.playNoteEvent({
				trackId: String(ev.track),
				pitchUnits: midiToUnits(ev.pitch) as never,
				velocity: ev.velocity,
				volume: Math.max(0, Math.min(100, manifest.guide.volume)),
				when: Math.max(0, when),
				duration: Math.max(0.03, ev.endSec - ev.startSec),
			});
		} catch {
			// ガイドが鳴らなくても進行は止めない
		}
	};

	const pump = () => {
		if (!running) return;
		const now = ctx.currentTime - t0;
		const until = now + LOOKAHEAD_SEC;
		if (until > scheduledUpTo) {
			const added = scheduleRange(ctx, bus, manifest, media, timeline, t0, fromSec, scheduledUpTo, until);
			live.push(...added);
			if (manifest.guide.enabled) {
				for (const ev of timeline.events) {
					const s = Math.max(ev.startSec, fromSec);
					if (s >= scheduledUpTo && s < until) guideFor(ev);
				}
			}
			scheduledUpTo = until;
		}
		// 鳴り終わった node を捨てる
		for (let i = live.length - 1; i >= 0; i--) {
			if (live[i].stopAt < ctx.currentTime - 0.1) {
				for (const n of live[i].nodes) n.disconnect();
				live.splice(i, 1);
			}
		}
		if (now >= timeline.totalSec) {
			stop();
			onEnded?.();
			return;
		}
		timer = window.setTimeout(pump, TICK_MS);
	};
	let timer = window.setTimeout(pump, 0);

	const stop = () => {
		if (!running) return;
		running = false;
		window.clearTimeout(timer);
		for (const s of live) {
			try {
				s.src.stop();
			} catch {
				// 既に止まっている
			}
			for (const n of s.nodes) n.disconnect();
		}
		live.length = 0;
		bus.disconnect();
		limiter.disconnect();
	};

	return {
		timeSec: () => Math.max(fromSec, ctx.currentTime - t0),
		stop,
		isRunning: () => running,
	};
};

/** 素材の区間を 1 回だけ鳴らす（試聴）。rate で音程を変えられる。止める関数を返す。 */
export const auditionSample = (
	studio: DtmStudio,
	buffer: AudioBuffer,
	inSec: number,
	outSec: number | undefined,
	rate = 1,
	gainDb = 0,
): (() => void) => {
	const ctx = studio.audioContext;
	if (ctx.state === "suspended") void ctx.resume();
	const src = ctx.createBufferSource();
	src.buffer = buffer;
	src.playbackRate.value = rate;
	const gain = ctx.createGain();
	gain.gain.value = dbToGain(gainDb);
	src.connect(gain);
	gain.connect(studio.masterGain);
	const len = Math.max(0.01, (outSec ?? buffer.duration) - inSec);
	src.start(ctx.currentTime + 0.02, Math.max(0, inSec), len);
	return () => {
		try {
			src.stop();
		} catch {
			// 既に止まっている
		}
		src.disconnect();
		gain.disconnect();
	};
};

/**
 * MML を dtm（SoundFont）で実時間再生しながら WAV に録音する。原曲（off vocal）を MML から作る用。
 * 戻り値の offsetSec は「曲の 0 秒時点で WAV が何秒にいるか」（backing.offsetSec にそのまま入れる）。
 * dtm は play() の時点から SEQUENCER_START_DELAY 後に曲の 0 秒を置くので、録音開始との差を測って返す。
 * サイトの音量設定に関係なく 100% で録る（録音中だけマスタを上げ、終わったら戻す）。
 */
export const recordMmlBacking = async (
	studio: DtmStudio,
	mml: string,
	/** 曲の長さ（秒）。onStop が来なくてもこの長さ＋余韻で止める保険。 */
	expectedSec: number,
	onProgress?: (p: { step: number }) => void,
	signal?: AbortSignal,
): Promise<{ blob: Blob; offsetSec: number }> => {
	const dtm = await import("@onjmin/dtm");
	const ctx = studio.audioContext;
	if (ctx.state === "suspended") await ctx.resume();
	studio.setMasterVolume(100);
	const restore = () => studio.setMasterVolume(applyMasterVolume(100));
	const recStart = ctx.currentTime;
	studio.startWavRecording();
	let playback: ReturnType<DtmStudio["play"]> | null = null;
	let offsetSec = 0;
	try {
		const ended = new Promise<void>((resolve) => {
			const playStart = ctx.currentTime;
			playback = studio.play(mml, {
				onTick: (step) => onProgress?.({ step }),
				onStop: () => resolve(),
				// 検証用ブラウザや裏タブ（document.hidden）でも止まらないように。録音は再生の継続が前提
				pauseWhenHidden: false,
			});
			offsetSec = playStart + dtm.SEQUENCER_START_DELAY - recStart;
			// onStop が来ない環境向けの保険（曲の長さ＋残響）
			window.setTimeout(resolve, (expectedSec + 3) * 1000);
		});
		const abort = new Promise<never>((_, reject) => {
			signal?.addEventListener("abort", () => reject(new DOMException("録音を中止しました", "AbortError")), { once: true });
		});
		await Promise.race([ended, abort]);
		// 残響・リリースのぶん少し待ってから止める
		await new Promise((r) => setTimeout(r, 1500));
		const blob = await studio.stopWavRecording();
		return { blob, offsetSec };
	} catch (err) {
		await studio.stopWavRecording().catch(() => null);
		throw err;
	} finally {
		(playback as ReturnType<DtmStudio["play"]> | null)?.destroy();
		restore();
	}
};
