// 音MAD の素材の実体。設計: docs/otomad-feature-design.md §3
//
// ブラウザ側だけのモジュール（useEffect 等から呼ぶ。SSR で評価されるのは型と純粋関数だけ）。
//
// 1. ローカルファイル … IndexedDB（localforage、store `unj-otomad-files`）に Blob を置き、
//    manifest は `local.hash` だけを持つ。サーバーには一切送らない。
// 2. デコード … 音は AudioContext.decodeAudioData で AudioBuffer に（素材 1 つにつき 1 回）。
// 3. コマ取り … 映像は「時間軸が使う区間だけ」を OTOMAD_FRAME_FPS で <video> から取る。
//    <video> の seek は 50〜200ms かかるので再生中には触らず、全部先に取っておく。
//    1 コマは長辺 OTOMAD_FRAME_MAX に縮めた ImageBitmap。

import localforage from "localforage";
import {
	OTOMAD_FRAME_BUDGET,
	OTOMAD_FRAME_FPS,
	OTOMAD_FRAME_MAX,
	type OtomadLocalFile,
	type OtomadManifest,
	type OtomadSource,
	sourceHasAudio,
	sourceHasVisual,
} from "./otomad-config";
import { type OtomadTimeline, requiredVideoRanges } from "./otomad-timeline";

// ── ローカルファイル ─────────────────────────────────────────

let _files: LocalForage | null = null;
const fileStore = (): LocalForage => {
	if (!_files) {
		_files = localforage.createInstance({
			name: "unj-reze",
			storeName: "unj-otomad-files",
			description: "音MAD のローカル素材（Blob）",
		});
	}
	return _files;
};

const hex = (buf: ArrayBuffer): string =>
	Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

/** 内容のハッシュ（先頭 1MB・末尾 1MB・サイズ）。大きい mp4 を全量読まないため。 */
export const hashFile = async (file: Blob): Promise<string> => {
	const CH = 1024 * 1024;
	const head = await file.slice(0, Math.min(CH, file.size)).arrayBuffer();
	const tail =
		file.size > CH ? await file.slice(Math.max(CH, file.size - CH)).arrayBuffer() : new ArrayBuffer(0);
	const sizeBytes = new TextEncoder().encode(String(file.size));
	const joined = new Uint8Array(head.byteLength + tail.byteLength + sizeBytes.byteLength);
	joined.set(new Uint8Array(head), 0);
	joined.set(new Uint8Array(tail), head.byteLength);
	joined.set(sizeBytes, head.byteLength + tail.byteLength);
	return hex(await crypto.subtle.digest("SHA-256", joined)).slice(0, 32);
};

/** ファイルを IndexedDB に入れて識別子を返す。同じ内容なら同じ hash。 */
export const putLocalFile = async (file: File): Promise<OtomadLocalFile> => {
	const hash = await hashFile(file);
	await fileStore().setItem(hash, file);
	return { name: file.name, size: file.size, type: file.type, hash };
};

export const getLocalBlob = async (hash: string): Promise<Blob | null> => {
	try {
		const v = await fileStore().getItem<Blob>(hash);
		return v instanceof Blob ? v : null;
	} catch {
		return null;
	}
};

export const hasLocalBlob = async (hash: string): Promise<boolean> => (await getLocalBlob(hash)) !== null;

/** 参照されていない Blob を消す（下書き履歴が参照する hash は keep に入れて渡す）。 */
export const pruneLocalFiles = async (keep: Set<string>): Promise<number> => {
	const keys = await fileStore().keys();
	let n = 0;
	for (const k of keys) {
		if (!keep.has(k)) {
			await fileStore().removeItem(k);
			n++;
		}
	}
	return n;
};

/** manifest が参照するローカル hash。 */
export const collectLocalHashes = (manifest: OtomadManifest): string[] =>
	manifest.sources.flatMap((s) => (s.local ? [s.local.hash] : []));

// ── 素材 → 読み込める URL ────────────────────────────────────

/** 素材の実体を指す URL（http か blob:）。ローカルで Blob が無ければ null。 */
export const resolveSourceUrl = async (
	s: OtomadSource,
	objectUrls: Map<string, string>,
): Promise<string | null> => {
	if (s.url) return s.url;
	if (!s.local) return null;
	const cached = objectUrls.get(s.local.hash);
	if (cached) return cached;
	const blob = await getLocalBlob(s.local.hash);
	if (!blob) return null;
	const u = URL.createObjectURL(blob);
	objectUrls.set(s.local.hash, u);
	return u;
};

const isHttp = (u: string) => /^https?:\/\//.test(u);

// ── 時間軸に依らない素材情報（長さ・音高推定） ───────────────

/**
 * メディア要素の長さを確定させる。MediaRecorder が作った webm は duration が Infinity のまま
 * 来るので、末尾へ seek して確定させてから読む（よく知られた回避策）。
 */
const settleDuration = (el: HTMLMediaElement): Promise<number> =>
	new Promise<number>((resolve) => {
		if (Number.isFinite(el.duration)) {
			resolve(el.duration);
			return;
		}
		const onUpdate = () => {
			el.removeEventListener("timeupdate", onUpdate);
			el.removeEventListener("durationchange", onUpdate);
			el.currentTime = 0;
			resolve(Number.isFinite(el.duration) ? el.duration : 0);
		};
		el.addEventListener("timeupdate", onUpdate);
		el.addEventListener("durationchange", onUpdate);
		el.currentTime = 1e101;
		setTimeout(onUpdate, 3000);
	});

/** 素材の長さ（秒）。音声・映像はメディア要素のメタデータ、画像は 0。 */
export const probeSourceDuration = async (url: string, kind: OtomadSource["kind"]): Promise<number> => {
	if (kind === "image") return 0;
	return new Promise<number>((resolve) => {
		const el = document.createElement(kind === "video" ? "video" : "audio");
		el.preload = "metadata";
		if (isHttp(url)) el.crossOrigin = "anonymous";
		const done = (v: number) => {
			el.removeAttribute("src");
			el.load();
			resolve(v);
		};
		el.onloadedmetadata = () => void settleDuration(el).then(done);
		el.onerror = () => done(0);
		el.src = url;
	});
};

/**
 * 区間の基本周波数を自己相関で推定して MIDI ノート番号で返す（素材の baseNote 用）。
 * 声の 1 音素材を想定（60〜1000Hz）。推定できなければ null。
 */
export const estimateBaseNote = (buffer: AudioBuffer, inSec: number, outSec?: number): number | null => {
	const sr = buffer.sampleRate;
	const data = buffer.getChannelData(0);
	const from = Math.max(0, Math.floor(inSec * sr));
	const to = Math.min(data.length, Math.floor((outSec ?? inSec + 0.5) * sr));
	if (to - from < sr * 0.04) return null;
	// 区間の真ん中あたり 60ms ずつ 5 窓を取って中央値（頭の子音と尻尾を避ける）
	const win = Math.floor(sr * 0.06);
	const minLag = Math.floor(sr / 1000);
	const maxLag = Math.floor(sr / 60);
	const estimates: number[] = [];
	const span = to - from - win;
	if (span <= 0) return null;
	for (let k = 0; k < 5; k++) {
		const start = from + Math.floor((span * (k + 1)) / 6);
		let energy = 0;
		for (let i = 0; i < win; i++) energy += data[start + i] * data[start + i];
		if (energy < 1e-4) continue;
		let bestLag = 0;
		let best = 0;
		for (let lag = minLag; lag <= maxLag; lag++) {
			let sum = 0;
			for (let i = 0; i < win - lag; i++) sum += data[start + i] * data[start + i + lag];
			const norm = sum / (win - lag);
			if (norm > best) {
				best = norm;
				bestLag = lag;
			}
		}
		if (bestLag > 0 && best > (energy / win) * 0.3) {
			const hz = sr / bestLag;
			estimates.push(69 + 12 * Math.log2(hz / 440));
		}
	}
	if (estimates.length === 0) return null;
	estimates.sort((a, b) => a - b);
	return Math.round(estimates[Math.floor(estimates.length / 2)] * 10) / 10;
};

/** 先頭の無音を飛ばした位置（秒）。しきい値は dB（既定 -40）。見つからなければ from のまま。 */
export const findAudioOnset = (buffer: AudioBuffer, fromSec: number, thresholdDb = -40): number => {
	const sr = buffer.sampleRate;
	const data = buffer.getChannelData(0);
	const th = 10 ** (thresholdDb / 20);
	for (let i = Math.max(0, Math.floor(fromSec * sr)); i < data.length; i++) {
		if (Math.abs(data[i]) >= th) return Math.max(0, i / sr - 0.002);
	}
	return fromSec;
};

/** MIDI ノート番号 → 「A3 +12」のような表記。 */
export const noteNameOf = (midi: number): string => {
	const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
	const rounded = Math.round(midi);
	const cents = Math.round((midi - rounded) * 100);
	const name = `${names[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
	return cents === 0 ? name : `${name} ${cents > 0 ? "+" : ""}${cents}`;
};

// ── メディアキャッシュ ───────────────────────────────────────

export interface OtomadMediaProgress {
	done: number;
	total: number;
	label: string;
}

interface FrameStrip {
	fps: number;
	/** 区間の頭（秒）。 */
	fromSec: number;
	frames: ImageBitmap[];
}

interface SourceMedia {
	audio?: AudioBuffer;
	/** 映像のコマ（区間ごと）。 */
	strips: FrameStrip[];
	image?: ImageBitmap;
	width: number;
	height: number;
	/** CORS 無しの URL で canvas が汚染される素材（書き出しできない）。 */
	tainted: boolean;
	missing: boolean;
	/** 音声トラックの無い動画。音のデコードを試し直さない。 */
	silentVideo?: boolean;
}

export interface OtomadMediaWarning {
	sourceId: string;
	message: string;
}

/**
 * 素材の実体をまとめて持つ。prepare() で時間軸が要る分だけ読み込む。
 * manifest が変わったら prepare() を呼び直す（同じ素材・同じ区間のコマは再利用する）。
 */
export class OtomadMediaCache {
	private media = new Map<string, SourceMedia>();
	private objectUrls = new Map<string, string>();
	/** 素材ごとの実体のキー（url か hash）。変わったら取り直す。 */
	private identity = new Map<string, string>();
	private audioKeyOf = new Map<string, string>();
	warnings: OtomadMediaWarning[] = [];
	/** 読み込み済みの素材 id → 長さ（秒）。manifest の durationSec に書き戻す用。 */
	durations = new Map<string, number>();

	constructor(private readonly audioContext: BaseAudioContext) {}

	private identityOf(s: OtomadSource): string {
		return s.url ? `url:${s.url}` : s.local ? `local:${s.local.hash}` : "none";
	}

	audioOf(sourceId: string): AudioBuffer | null {
		return this.media.get(sourceId)?.audio ?? null;
	}

	isMissing(sourceId: string): boolean {
		return this.media.get(sourceId)?.missing ?? true;
	}

	hasTaint(): boolean {
		for (const m of this.media.values()) if (m.tainted) return true;
		return false;
	}

	/**
	 * 素材の音を（時間軸に関係なく）読み込む。エディタの試聴・音程推定・無音切りに使う。
	 * 読めなければ null。
	 */
	async ensureAudio(s: OtomadSource): Promise<AudioBuffer | null> {
		if (!sourceHasAudio(s)) return null;
		const existing = this.media.get(s.id);
		if (existing?.audio && this.identity.get(s.id) === this.identityOf(s)) return existing.audio;
		const url = await resolveSourceUrl(s, this.objectUrls);
		if (!url) return null;
		try {
			const res = await fetch(url);
			const buf = await this.audioContext.decodeAudioData(await res.arrayBuffer());
			const m: SourceMedia = existing ?? { strips: [], width: 0, height: 0, tainted: false, missing: false };
			if (existing && this.identity.get(s.id) !== this.identityOf(s)) {
				this.dispose(existing);
				m.strips = [];
				m.image = undefined;
			}
			m.audio = buf;
			m.missing = false;
			this.media.set(s.id, m);
			this.identity.set(s.id, this.identityOf(s));
			this.durations.set(s.id, buf.duration);
			return buf;
		} catch (err) {
			console.warn("[otomad] 音声のデコードに失敗", s.name, err);
			return null;
		}
	}

	/** 素材の元画素サイズ（crop の上限）。 */
	sizeOf(sourceId: string): { w: number; h: number } | null {
		const m = this.media.get(sourceId);
		return m && m.width > 0 ? { w: m.width, h: m.height } : null;
	}

	/** 素材の時刻 t（秒）のコマ。無ければ最寄りの区間の端、画像ならその画像。 */
	frameAt(sourceId: string, t: number): ImageBitmap | null {
		const m = this.media.get(sourceId);
		if (!m) return null;
		if (m.image) return m.image;
		let best: FrameStrip | null = null;
		let bestDist = Number.POSITIVE_INFINITY;
		for (const s of m.strips) {
			const end = s.fromSec + s.frames.length / s.fps;
			const d = t < s.fromSec ? s.fromSec - t : t >= end ? t - end : 0;
			if (d < bestDist) {
				bestDist = d;
				best = s;
			}
		}
		if (!best || best.frames.length === 0) return null;
		const i = Math.max(0, Math.min(best.frames.length - 1, Math.floor((t - best.fromSec) * best.fps)));
		return best.frames[i];
	}

	/**
	 * 時間軸が要る素材を読み込む。音は全部、映像は使う区間だけ。
	 * 進捗は onProgress に。失敗した素材は warnings に残して他を続ける。
	 */
	async prepare(
		manifest: OtomadManifest,
		timeline: OtomadTimeline,
		onProgress?: (p: OtomadMediaProgress) => void,
	): Promise<void> {
		this.warnings = [];
		const ranges = requiredVideoRanges(timeline, manifest);
		const used = new Set<string>();
		for (const ev of timeline.events) used.add(ev.source.id);
		if (manifest.backing) used.add(manifest.backing.sourceId);

		// 捨てる: 無くなった素材・実体が変わった素材
		for (const [id, m] of this.media) {
			const s = manifest.sources.find((x) => x.id === id);
			if (!s || this.identity.get(id) !== this.identityOf(s)) {
				this.dispose(m);
				this.media.delete(id);
				this.identity.delete(id);
				this.audioKeyOf.delete(id);
			}
		}

		// 必要コマ数を見積もって予算を超えるなら fps を落とす
		let fps = OTOMAD_FRAME_FPS;
		let totalFrames = 0;
		for (const list of ranges.values()) for (const [a, b] of list) totalFrames += (b - a) * fps;
		while (totalFrames > OTOMAD_FRAME_BUDGET && fps > 7.5) {
			fps /= 2;
			totalFrames /= 2;
		}

		const jobs: Array<() => Promise<void>> = [];
		let done = 0;
		let total = 0;
		const tick = (label: string) => {
			done++;
			onProgress?.({ done, total, label });
		};

		for (const s of manifest.sources) {
			if (!used.has(s.id)) continue;
			const url = await resolveSourceUrl(s, this.objectUrls);
			const existing = this.media.get(s.id);
			const m: SourceMedia = existing ?? {
				strips: [],
				width: 0,
				height: 0,
				tainted: false,
				missing: false,
			};
			this.media.set(s.id, m);
			this.identity.set(s.id, this.identityOf(s));
			if (!url) {
				m.missing = true;
				this.warnings.push({
					sourceId: s.id,
					message: `「${s.name}」のファイルが見つかりません（選び直してください）`,
				});
				continue;
			}
			m.missing = false;

			if (sourceHasAudio(s) && !m.audio && !m.silentVideo) {
				total++;
				jobs.push(async () => {
					try {
						const res = await fetch(url);
						const buf = await res.arrayBuffer();
						m.audio = await this.audioContext.decodeAudioData(buf);
						this.durations.set(s.id, m.audio.duration);
					} catch (err) {
						if (s.kind === "video") {
							// 音声トラックの無い動画（画面録画など）。映像だけ使う
							m.silentVideo = true;
						} else {
							console.warn("[otomad] 音声のデコードに失敗", s.name, err);
							this.warnings.push({ sourceId: s.id, message: `「${s.name}」の音声を読めませんでした` });
						}
					}
					tick(`${s.name} の音`);
				});
			}

			if (s.kind === "image" && !m.image) {
				total++;
				jobs.push(async () => {
					try {
						const img = await loadImageElement(url);
						m.width = img.naturalWidth;
						m.height = img.naturalHeight;
						m.image = await createImageBitmap(img);
						m.tainted = isHttp(url) && !(await canReadPixels(m.image));
					} catch (err) {
						console.warn("[otomad] 画像の読み込みに失敗", s.name, err);
						this.warnings.push({ sourceId: s.id, message: `「${s.name}」の画像を読めませんでした` });
					}
					tick(s.name);
				});
			}

			if (s.kind === "video" && sourceHasVisual(s)) {
				const want = ranges.get(s.id) ?? [];
				// 既に持っている区間（同じ fps）は再利用。足りない区間だけ取る
				const need = want.filter(
					([a, b]) =>
						!m.strips.some(
							(st) =>
								st.fps === fps && st.fromSec <= a + 1e-3 && st.fromSec + st.frames.length / st.fps >= b - 1e-3,
						),
				);
				const neededFrames = need.reduce((n, [a, b]) => n + Math.ceil((b - a) * fps), 0);
				if (neededFrames > 0) {
					total += neededFrames;
					jobs.push(async () => {
						try {
							await this.grabFrames(s, url, need, fps, m, () => tick(`${s.name} のコマ`));
						} catch (err) {
							console.warn("[otomad] 映像のコマ取りに失敗", s.name, err);
							this.warnings.push({ sourceId: s.id, message: `「${s.name}」の映像を読めませんでした` });
						}
					});
				}
			}
		}

		onProgress?.({ done, total, label: "" });
		// 音は並列、映像のコマ取りは <video> を占有するので直列になる（grabFrames 内で順に seek）
		await Promise.all(jobs.map((j) => j()));
	}

	private async grabFrames(
		s: OtomadSource,
		url: string,
		ranges: Array<[number, number]>,
		fps: number,
		m: SourceMedia,
		onFrame: () => void,
	): Promise<void> {
		const video = document.createElement("video");
		video.muted = true;
		video.playsInline = true;
		video.preload = "auto";
		if (isHttp(url)) video.crossOrigin = "anonymous";
		video.src = url;
		await new Promise<void>((resolve, reject) => {
			video.onloadedmetadata = () => resolve();
			video.onerror = () => reject(new Error("video load error"));
		});
		const duration = await settleDuration(video);
		this.durations.set(s.id, duration);
		m.width = video.videoWidth;
		m.height = video.videoHeight;
		const scale = Math.min(1, OTOMAD_FRAME_MAX / Math.max(1, video.videoWidth, video.videoHeight));
		const w = Math.max(1, Math.round(video.videoWidth * scale));
		const h = Math.max(1, Math.round(video.videoHeight * scale));
		const off = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
		if (!(off instanceof OffscreenCanvas)) {
			off.width = w;
			off.height = h;
		}
		const ctx = off.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
		if (!ctx) throw new Error("no 2d context");

		const seekTo = (t: number) =>
			new Promise<void>((resolve) => {
				const onSeeked = () => {
					video.removeEventListener("seeked", onSeeked);
					resolve();
				};
				video.addEventListener("seeked", onSeeked);
				video.currentTime = Math.min(t, Math.max(0, (video.duration || t) - 1e-3));
			});

		let taintChecked = false;
		for (const [a, b] of ranges) {
			const n = Math.max(1, Math.ceil((b - a) * fps));
			const frames: ImageBitmap[] = [];
			for (let i = 0; i < n; i++) {
				await seekTo(a + i / fps);
				let bmp: ImageBitmap;
				try {
					ctx.drawImage(video, 0, 0, w, h);
					bmp = await createImageBitmap(off);
				} catch {
					// CORS 無しの動画で canvas が汚染されたとき。縮小だけして直接取る（表示はできる）
					bmp = await createImageBitmap(video, { resizeWidth: w, resizeHeight: h });
				}
				if (!taintChecked) {
					taintChecked = true;
					m.tainted = isHttp(url) && !(await canReadPixels(bmp));
					if (m.tainted)
						this.warnings.push({
							sourceId: s.id,
							message: `「${s.name}」は CORS 許可が無く、書き出しに使えません（再生はできます）`,
						});
				}
				frames.push(bmp);
				onFrame();
			}
			m.strips.push({ fps, fromSec: a, frames });
		}
		video.removeAttribute("src");
		video.load();
	}

	private dispose(m: SourceMedia) {
		for (const st of m.strips) for (const f of st.frames) f.close();
		m.image?.close();
	}

	destroy() {
		for (const m of this.media.values()) this.dispose(m);
		this.media.clear();
		for (const u of this.objectUrls.values()) URL.revokeObjectURL(u);
		this.objectUrls.clear();
	}
}

const loadImageElement = (url: string): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const img = new Image();
		if (isHttp(url)) img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("image load error"));
		img.src = url;
	});

/** 1 画素読んで canvas が汚染されていないか確かめる。 */
const canReadPixels = async (bmp: ImageBitmap): Promise<boolean> => {
	try {
		const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
		if (!(c instanceof OffscreenCanvas)) {
			c.width = 1;
			c.height = 1;
		}
		const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
		if (!ctx) return true;
		ctx.drawImage(bmp, 0, 0, 1, 1);
		ctx.getImageData(0, 0, 1, 1);
		return true;
	} catch {
		return false;
	}
};
