// 音MAD の mp4 書き出し。設計: docs/otomad-feature-design.md §6
//
// 本命はオフライン描画: 音は OfflineAudioContext（renderOtomadAudio、再生と同じスケジューラ）、
// 映像は drawOtomadFrame を 1/fps 秒刻みで VideoFrame にして VideoEncoder へ。mp4-muxer で多重化する。
// 実時間録画（MV の MediaRecorder 方式）と違い、重い端末でもコマが落ちない。
//
// WebCodecs が無いブラウザ向けに、MV と同じ実時間録画（canvas.captureStream + MediaRecorder）も置く。

import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { renderOtomadAudio } from "./otomad-audio";
import { OTOMAD_H, OTOMAD_W, type OtomadManifest } from "./otomad-config";
import { drawOtomadFrame } from "./otomad-engine";
import type { OtomadMediaCache } from "./otomad-media";
import type { OtomadTimeline } from "./otomad-timeline";

export interface OtomadExportOptions {
	manifest: OtomadManifest;
	timeline: OtomadTimeline;
	media: OtomadMediaCache;
	/** 出力の幅（高さは 16:9）。640 か 1280。 */
	width: number;
	fps: number;
	onProgress?: (p: { phase: "audio" | "video" | "mux"; ratio: number }) => void;
	signal?: AbortSignal;
}

export const canExportOffline = (): boolean =>
	typeof VideoEncoder !== "undefined" &&
	typeof AudioEncoder !== "undefined" &&
	typeof VideoFrame !== "undefined" &&
	typeof OfflineAudioContext !== "undefined";

const AUDIO_RATE = 48000;
const AUDIO_CHUNK = 1024;

/**
 * メインスレッドに息をさせる。setTimeout(0) はタブが背面にあると 1 秒単位に間引かれるので
 * （14 秒の動画の書き出しが 2 分かかった）、間引かれない MessageChannel で譲る。
 */
const yieldToMain = (): Promise<void> =>
	new Promise((resolve) => {
		const ch = new MessageChannel();
		ch.port1.onmessage = () => {
			ch.port1.close();
			resolve();
		};
		ch.port2.postMessage(0);
	});

/** 解像度に見合った H.264 のレベル。 */
const avcCodecFor = (width: number): string => (width > 854 ? "avc1.4d4028" : "avc1.4d401f");

export const exportOtomadMp4 = async (opts: OtomadExportOptions): Promise<Blob> => {
	const { manifest, timeline, media, fps, onProgress, signal } = opts;
	const width = Math.round(opts.width / 2) * 2;
	const height = Math.round((width * OTOMAD_H) / OTOMAD_W / 2) * 2;
	const throwIfAborted = () => {
		if (signal?.aborted) throw new DOMException("書き出しを中止しました", "AbortError");
	};

	// 1. 音をオフラインで描く
	onProgress?.({ phase: "audio", ratio: 0 });
	const audio = await renderOtomadAudio(manifest, media, timeline, AUDIO_RATE);
	throwIfAborted();
	onProgress?.({ phase: "audio", ratio: 1 });

	// 2. エンコーダとマルチプレクサ
	const muxer = new Muxer({
		target: new ArrayBufferTarget(),
		video: { codec: "avc", width, height, frameRate: fps },
		audio: { codec: "aac", sampleRate: AUDIO_RATE, numberOfChannels: 2 },
		fastStart: "in-memory",
		firstTimestampBehavior: "offset",
	});
	let encodeError: unknown = null;
	const videoEncoder = new VideoEncoder({
		output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
		error: (e) => {
			encodeError = e;
		},
	});
	const videoConfig: VideoEncoderConfig = {
		codec: avcCodecFor(width),
		width,
		height,
		// 720p 4Mbps / 360p 2Mbps（YouTube の 720p 相当。8Mbps だと 2 分で 116MB になった）
		bitrate: width > 854 ? 4_000_000 : 2_000_000,
		framerate: fps,
		latencyMode: "quality",
	};
	const support = await VideoEncoder.isConfigSupported(videoConfig);
	if (!support.supported) throw new Error("この環境では H.264 の書き出しができません");
	videoEncoder.configure(videoConfig);

	const audioEncoder = new AudioEncoder({
		output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
		error: (e) => {
			encodeError = e;
		},
	});
	audioEncoder.configure({
		codec: "mp4a.40.2",
		sampleRate: AUDIO_RATE,
		numberOfChannels: 2,
		bitrate: 192_000,
	});

	// 3. 音を 1024 サンプルずつ投入
	const ch0 = audio.getChannelData(0);
	const ch1 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : ch0;
	for (let i = 0; i < audio.length; i += AUDIO_CHUNK) {
		const n = Math.min(AUDIO_CHUNK, audio.length - i);
		const planar = new Float32Array(n * 2);
		planar.set(ch0.subarray(i, i + n), 0);
		planar.set(ch1.subarray(i, i + n), n);
		const data = new AudioData({
			format: "f32-planar",
			sampleRate: AUDIO_RATE,
			numberOfFrames: n,
			numberOfChannels: 2,
			timestamp: Math.round((i / AUDIO_RATE) * 1_000_000),
			data: planar,
		});
		audioEncoder.encode(data);
		data.close();
		if (audioEncoder.encodeQueueSize > 16) await yieldToMain();
	}

	// 4. 映像を 1 コマずつ描いて投入
	const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : document.createElement("canvas");
	if (!(canvas instanceof OffscreenCanvas)) {
		canvas.width = width;
		canvas.height = height;
	}
	const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
	if (!ctx) throw new Error("canvas を作れませんでした");
	const totalFrames = Math.max(1, Math.ceil(timeline.totalSec * fps));
	const frameUs = Math.round(1_000_000 / fps);
	for (let f = 0; f < totalFrames; f++) {
		throwIfAborted();
		if (encodeError) throw encodeError;
		const t = f / fps;
		ctx.save();
		ctx.setTransform(width / OTOMAD_W, 0, 0, height / OTOMAD_H, 0, 0);
		drawOtomadFrame(ctx, manifest, timeline, media, t);
		ctx.restore();
		const frame = new VideoFrame(canvas, { timestamp: f * frameUs, duration: frameUs });
		videoEncoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
		frame.close();
		while (videoEncoder.encodeQueueSize > 8) await yieldToMain();
		if (f % 5 === 0) {
			onProgress?.({ phase: "video", ratio: f / totalFrames });
			// 描画ループに息をさせる（進捗表示が止まらないように）
			await yieldToMain();
		}
	}
	onProgress?.({ phase: "mux", ratio: 0 });
	await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
	if (encodeError) throw encodeError;
	videoEncoder.close();
	audioEncoder.close();
	muxer.finalize();
	onProgress?.({ phase: "mux", ratio: 1 });
	return new Blob([muxer.target.buffer], { type: "video/mp4" });
};

// ── 実時間録画（WebCodecs が無いときの代替。MV の startExportMp4 と同じ方式） ──

export interface RealtimeExportOptions {
	canvas: HTMLCanvasElement;
	audioTrack: MediaStreamTrack | null;
	/** 再生を頭から始める。 */
	play: () => Promise<void> | void;
	/** 再生を止める。 */
	stop: () => void;
	durationSec: number;
	onProgress?: (ratio: number) => void;
}

export const exportOtomadRealtime = (opts: RealtimeExportOptions): { promise: Promise<{ blob: Blob; ext: string }>; cancel: () => void } => {
	const { canvas, audioTrack, play, stop, durationSec, onProgress } = opts;
	const candidates: Array<{ mimeType: string; ext: string }> = [
		{ mimeType: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4" },
		{ mimeType: "video/mp4", ext: "mp4" },
		{ mimeType: "video/webm;codecs=h264", ext: "mp4" },
		{ mimeType: "video/webm;codecs=vp9", ext: "webm" },
		{ mimeType: "video/webm", ext: "webm" },
	];
	const selected =
		candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mimeType)) ??
		{ mimeType: "video/webm", ext: "webm" };
	let cancelled = false;
	let recorder: MediaRecorder | null = null;
	let timer = 0;
	const promise = new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
		(async () => {
			const stream = canvas.captureStream(30);
			const tracks = [...stream.getVideoTracks()];
			if (audioTrack) tracks.push(audioTrack);
			const combined = new MediaStream(tracks);
			const chunks: Blob[] = [];
			try {
				recorder = new MediaRecorder(combined, { mimeType: selected.mimeType, videoBitsPerSecond: 5_000_000 });
			} catch {
				recorder = new MediaRecorder(combined);
			}
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunks.push(e.data);
			};
			recorder.onstop = () => {
				stop();
				if (cancelled) {
					reject(new DOMException("書き出しを中止しました", "AbortError"));
					return;
				}
				resolve({ blob: new Blob(chunks, { type: recorder?.mimeType || selected.mimeType }), ext: selected.ext });
			};
			recorder.start(100);
			const started = performance.now();
			await play();
			timer = window.setInterval(() => {
				const elapsed = (performance.now() - started) / 1000;
				onProgress?.(Math.min(1, elapsed / durationSec));
				if (elapsed >= durationSec + 0.4) {
					window.clearInterval(timer);
					recorder?.stop();
				}
			}, 100);
		})().catch(reject);
	});
	const cancel = () => {
		cancelled = true;
		window.clearInterval(timer);
		if (recorder && recorder.state !== "inactive") recorder.stop();
		else stop();
	};
	return { promise, cancel };
};
