// 音MAD の AviUtl 拡張編集オブジェクトファイル（.exo）書き出し。設計: docs/otomad-feature-design.md §6
//
// 1 音符 = 動画オブジェクト 1 つ（＋音声オブジェクト 1 つ）。RPPtoEXO と同じ系譜で、
// 「再生速度」に音程合わせの倍率（rate × 100）を写す。レイヤーはトラックごとに映像・音声の 2 本。
// 文字コードは Shift_JIS、改行は CRLF（AviUtl 1.x の exo の決まり）。
// ブラウザはファイルの絶対パスを知らないので、素材フォルダのパスは UI から受け取って `file=` に組み立てる。

import Encoding from "encoding-japanese";
import { OTOMAD_H, OTOMAD_W, type OtomadManifest, type OtomadSource } from "./otomad-config";
import type { OtomadEvent, OtomadTimeline } from "./otomad-timeline";

export interface OtomadExoOptions {
	/** 出力解像度。 */
	width: number;
	height: number;
	fps: number;
	/** 素材フォルダ（末尾の区切りは有っても無くてもよい）。空ならファイル名だけ。 */
	assetDir: string;
	/** 原曲も音声オブジェクトとして置く。 */
	includeBacking: boolean;
}

const fmt = (n: number, digits = 1): string => n.toFixed(digits);

const joinPath = (dir: string, name: string): string => {
	if (!dir) return name;
	const sep = dir.includes("/") && !dir.includes("\\") ? "/" : "\\";
	return dir.endsWith("\\") || dir.endsWith("/") ? dir + name : dir + sep + name;
};

const fileNameOf = (s: OtomadSource): string => {
	if (s.local) return s.local.name;
	if (s.url) {
		// 絶対 URL でも相対パス（内蔵素材）でも、最後のパス要素をファイル名にする
		const path = s.url.split(/[?#]/)[0];
		const last = path.split("/").pop();
		if (last && /\.[a-z0-9]{2,4}$/i.test(last)) {
			try {
				return decodeURIComponent(last);
			} catch {
				return last;
			}
		}
	}
	return s.name;
};

/** exo の本文（文字列、CRLF）。 */
export const buildOtomadExoText = (
	manifest: OtomadManifest,
	timeline: OtomadTimeline,
	opts: OtomadExoOptions,
): string => {
	const { width, height, fps, assetDir, includeBacking } = opts;
	const toFrame = (sec: number) => Math.max(1, Math.round(sec * fps) + 1);
	const totalFrames = Math.max(1, Math.round(timeline.totalSec * fps));
	const sx = width / OTOMAD_W;
	const sy = height / OTOMAD_H;
	const lines: string[] = [];
	lines.push("[exedit]");
	lines.push(`width=${width}`);
	lines.push(`height=${height}`);
	lines.push(`rate=${fps}`);
	lines.push("scale=1");
	lines.push(`length=${totalFrames}`);
	lines.push("audio_rate=44100");
	lines.push("audio_ch=2");

	let objIndex = 0;
	const layerBase = (trackIdx: number) => trackIdx * 2 + 1;

	const pushVideo = (ev: OtomadEvent, layer: number) => {
		const track = manifest.tracks[ev.trackIdx];
		const slot = track.visual.slots[Math.min(ev.slot, track.visual.slots.length - 1)];
		const start = toFrame(ev.startSec);
		const end = Math.max(start, toFrame(Math.min(ev.visibleUntilSec, timeline.totalSec)) - 1);
		const speed = track.visual.stretch ? ev.rate * 100 : 100;
		// 拡大率: slot の幅を素材の幅に合わせる（素材の元サイズは AviUtl 側で決まるので、
		// 論理 640 幅を 100% として slot 幅の比で近似する）
		const zoom = ((slot?.w ?? OTOMAD_W) / OTOMAD_W) * 100 * sx;
		const x = ((slot?.x ?? OTOMAD_W / 2) - OTOMAD_W / 2) * sx;
		const y = ((slot?.y ?? OTOMAD_H / 2) - OTOMAD_H / 2) * sy;
		lines.push(`[${objIndex}]`);
		lines.push(`start=${start}`);
		lines.push(`end=${end}`);
		lines.push(`layer=${layer}`);
		lines.push("overlay=1");
		lines.push("camera=0");
		lines.push(`[${objIndex}.0]`);
		if (ev.source.kind === "image") {
			lines.push("_name=画像ファイル");
		} else {
			lines.push("_name=動画ファイル");
			lines.push(`再生位置=${Math.max(1, Math.round(ev.inSec * fps) + 1)}`);
			lines.push(`再生速度=${fmt(speed)}`);
			lines.push("ループ再生=0");
			lines.push("アルファチャンネルを読み込む=0");
		}
		lines.push(`file=${joinPath(assetDir, fileNameOf(ev.source))}`);
		lines.push(`[${objIndex}.1]`);
		lines.push("_name=標準描画");
		lines.push(`X=${fmt(x)}`);
		lines.push(`Y=${fmt(y)}`);
		lines.push("Z=0.0");
		lines.push(`拡大率=${fmt(zoom, 2)}`);
		lines.push(`透明度=${fmt((1 - track.visual.opacity) * 100)}`);
		lines.push(`回転=${fmt(slot?.rotate ?? 0)}`);
		lines.push("blend=0");
		if (ev.flip) {
			lines.push(`[${objIndex}.2]`);
			lines.push("_name=反転");
			lines.push("上下反転=0");
			lines.push("左右反転=1");
			lines.push("輝度反転=0");
			lines.push("色相反転=0");
			lines.push("透明度反転=0");
		}
		objIndex++;
	};

	const pushAudio = (ev: OtomadEvent, layer: number) => {
		const start = toFrame(ev.startSec);
		const end = Math.max(start, toFrame(Math.min(ev.endSec, timeline.totalSec)) - 1);
		lines.push(`[${objIndex}]`);
		lines.push(`start=${start}`);
		lines.push(`end=${end}`);
		lines.push(`layer=${layer}`);
		lines.push("overlay=1");
		lines.push("audio=1");
		lines.push(`[${objIndex}.0]`);
		lines.push("_name=音声ファイル");
		lines.push(`再生位置=${fmt(ev.inSec, 2)}`);
		lines.push(`再生速度=${fmt(ev.rate * 100)}`);
		lines.push("ループ再生=0");
		lines.push("動画ファイルと連携=0");
		lines.push(`file=${joinPath(assetDir, fileNameOf(ev.source))}`);
		lines.push(`[${objIndex}.1]`);
		lines.push("_name=標準再生");
		const track = manifest.tracks[ev.trackIdx];
		const vel = track.audio.velocityToGain ? ev.velocity / 100 : 1;
		lines.push(`音量=${fmt(Math.min(500, 100 * vel * 10 ** ((track.audio.gainDb + ev.source.gainDb) / 20)))}`);
		lines.push(`左右=${fmt(track.audio.pan * 100)}`);
		objIndex++;
	};

	for (const ev of timeline.events) {
		const base = layerBase(ev.trackIdx);
		if (ev.hasVisual) pushVideo(ev, base);
		if (ev.hasAudio) pushAudio(ev, base + 1);
	}

	if (includeBacking && manifest.backing) {
		const src = manifest.sources.find((s) => s.id === manifest.backing?.sourceId);
		if (src) {
			const off = manifest.backing.offsetSec;
			const startSec = off < 0 ? -off : 0;
			lines.push(`[${objIndex}]`);
			lines.push(`start=${toFrame(startSec)}`);
			lines.push(`end=${totalFrames}`);
			lines.push(`layer=${layerBase(manifest.tracks.length) + 1}`);
			lines.push("overlay=1");
			lines.push("audio=1");
			lines.push(`[${objIndex}.0]`);
			lines.push("_name=音声ファイル");
			lines.push(`再生位置=${fmt(Math.max(0, off), 2)}`);
			lines.push("再生速度=100.0");
			lines.push("ループ再生=0");
			lines.push("動画ファイルと連携=0");
			lines.push(`file=${joinPath(assetDir, fileNameOf(src))}`);
			lines.push(`[${objIndex}.1]`);
			lines.push("_name=標準再生");
			lines.push(`音量=${fmt(manifest.backing.volume)}`);
			lines.push("左右=0.0");
			objIndex++;
		}
	}
	return `${lines.join("\r\n")}\r\n`;
};

/** Shift_JIS のバイト列にして Blob で返す。 */
export const buildOtomadExo = (manifest: OtomadManifest, timeline: OtomadTimeline, opts: OtomadExoOptions): Blob => {
	const text = buildOtomadExoText(manifest, timeline, opts);
	const codes = Encoding.convert(Encoding.stringToCode(text), { to: "SJIS", from: "UNICODE" });
	return new Blob([new Uint8Array(codes)], { type: "application/octet-stream" });
};
