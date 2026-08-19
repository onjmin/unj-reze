// ゲームアセットの「参照」規約。実体(base64/バイナリ)は埋め込まず、短いURIで持つ。
// 詳細: docs/game-feature-design.md §3
//
//  画像/スプライト:
//    post:123            既存の画像投稿(id=123)の image_src を参照
//    walk:123#s0         既存の歩行グラ投稿を walk-cycle 規格で分割(方向s/フレーム0)
//    url:https://...     画像URL(直リンク or embed対応サイト)
//    tile:#2d5a27        単色タイル
//    emoji:🍄            絵文字スプライト
//    psd:<encodeURIComponent(url)>#<path1>|<path2>|...
//                        psdファイルをクライアント側でパースし、指定レイヤー(複数可、重ね合成)を
//                        1枚の画像として使う。解決は lib/mv-psd.ts（client-only）が担当するため、
//                        imageRefToUrl はここでは常に null を返す（post: と同様、別途解決が必要）。
//  BGM/SE:
//    youtube:VIDEO_ID    (素のYouTube URLも可)
//    mml:post:123        既存MML投稿(id=123)を参照
//    mml:T120 cdefg      インラインMML
//    none / 空           なし

import type { BgmAsset } from "./game-config";
import { parseTimeToSeconds } from "./embed";

type LoopOption = BgmAsset["loop"];

export interface ParsedRef {
	scheme: string;
	value: string;
	raw: string;
}

/** "scheme:rest" を分解。scheme が既知でなければ url とみなす。 */
export function parseRef(raw: string): ParsedRef | null {
	if (!raw) return null;
	const idx = raw.indexOf(":");
	if (idx === -1) return { scheme: "url", value: raw, raw };
	const scheme = raw.slice(0, idx);
	const value = raw.slice(idx + 1);
	const known = [
		"post",
		"walk",
		"url",
		"tile",
		"emoji",
		"psd",
		"youtube",
		"nicovideo",
		"soundcloud",
		"mml",
		"none",
		"direct",
	];
	if (!known.includes(scheme)) return { scheme: "url", value: raw, raw };
	return { scheme, value, raw };
}

export function colorToDataUrl(color: string): string {
	const safeColor = color || "#000000";
	return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="100%" height="100%" fill="${encodeURIComponent(safeColor)}"/></svg>`;
}

/** 画像参照を「いま表示に使えるURL」へ。post:/walk: は投稿の image_src 解決が要るため null を返す
 *  (エディタは ContentPicker が選択時に得た URL を別途キャッシュして使う)。 */
export function imageRefToUrl(raw: string): string | null {
	const ref = parseRef(raw);
	if (!ref) return null;
	switch (ref.scheme) {
		case "url":
			return ref.value;
		case "tile":
			return colorToDataUrl(ref.value);
		case "emoji":
			return null; // 絵文字: 描画側でfillText
		case "walk": {
			// URL由来の歩行グラはそのまま表示URLになる（投稿由来は解決が必要）。
			const wr = parseWalkRef(raw);
			return wr && wr.source.kind === "url" ? wr.source.url : null;
		}
		case "post":
			return null; // 投稿解決が必要
		case "psd":
			return null; // psdパース解決が必要（lib/mv-psd.ts、client-only）
		default:
			return null;
	}
}

/** `psd:<encodeURIComponent(url)>#<path1>|<path2>|...` を構築。単一レイヤーなら paths=[path] でよい。 */
export function buildPsdRef(url: string, paths: string[]): string {
	return `psd:${encodeURIComponent(url)}#${paths.join("|")}`;
}

export function isPsdRef(raw: string): boolean {
	return raw.startsWith("psd:");
}

/** psd: 参照を { url, paths } へ分解。psd参照でない/urlが空なら null。 */
export function parsePsdRef(raw: string): { url: string; paths: string[] } | null {
	if (!raw.startsWith("psd:")) return null;
	const rest = raw.slice(4);
	const hashIdx = rest.indexOf("#");
	const urlPart = hashIdx === -1 ? rest : rest.slice(0, hashIdx);
	const pathsPart = hashIdx === -1 ? "" : rest.slice(hashIdx + 1);
	let url: string;
	try {
		url = decodeURIComponent(urlPart);
	} catch {
		return null;
	}
	if (!url) return null;
	const paths = pathsPart ? pathsPart.split("|").filter(Boolean) : [];
	return { url, paths };
}

export function isImageRef(raw: string): boolean {
	const ref = parseRef(raw);
	return !!ref && ["post", "walk", "url", "tile"].includes(ref.scheme);
}

export interface LoopConfig {
	type: "bar" | "step" | "seconds";
	val: number;
	endType?: "none" | "bar" | "step" | "seconds";
	endVal?: number;
}

export interface BgmParams {
	loop?: LoopConfig;
	volume?: number;
	start?: number;
}

export function parseBgmParams(ref?: string): BgmParams {
	const result: BgmParams = {};
	if (!ref) return result;
	const hashIdx = ref.indexOf("#");
	if (hashIdx === -1) return result;
	const hash = ref.slice(hashIdx + 1);

	const parts = hash.split("&");
	for (const part of parts) {
		const [key, val] = part.split("=");
		if (key === "loop" && val) {
			const [startPart, endPart] = val.split(",");
			const [startType, startValStr] = startPart.split(":");
			const startVal = parseFloat(startValStr);
			if (startType && !isNaN(startVal)) {
				const loopConfig: LoopConfig = {
					type: startType as "bar" | "step" | "seconds",
					val: startVal,
				};
				if (endPart) {
					const [endType, endValStr] = endPart.split(":");
					const endVal = parseFloat(endValStr);
					if (endType && !isNaN(endVal)) {
						loopConfig.endType = endType as "none" | "bar" | "step" | "seconds";
						loopConfig.endVal = endVal;
					}
				}
				result.loop = loopConfig;
			}
		} else if (key === "vol" && val) {
			const vol = parseInt(val, 10);
			if (!isNaN(vol)) {
				result.volume = Math.max(0, Math.min(100, vol));
			}
		} else if ((key === "start" || key === "s" || key === "t") && val) {
			const start = parseFloat(val);
			if (!isNaN(start)) {
				result.start = Math.max(0, start);
			}
		}
	}
	return result;
}

export function updateRefBgmParams(ref: string, params: BgmParams): string {
	const base = ref.split("#")[0];
	const hashParts: string[] = [];

	if (params.loop) {
		let loopStr = `${params.loop.type}:${params.loop.val}`;
		if (
			params.loop.endType &&
			params.loop.endType !== "none" &&
			params.loop.endVal !== undefined
		) {
			loopStr += `,${params.loop.endType}:${params.loop.endVal}`;
		}
		hashParts.push(`loop=${loopStr}`);
	}
	if (params.volume !== undefined) {
		hashParts.push(`vol=${params.volume}`);
	}
	if (params.start !== undefined && params.start > 0) {
		hashParts.push(`start=${params.start}`);
	}

	if (hashParts.length === 0) return base;
	return `${base}#${hashParts.join("&")}`;
}

export function parseLoopFromRef(ref?: string): LoopConfig | null {
	return parseBgmParams(ref).loop || null;
}

export function updateRefLoop(
	ref: string,
	enabled: boolean,
	config?: LoopConfig,
): string {
	const params = parseBgmParams(ref);
	params.loop = enabled && config ? config : undefined;
	return updateRefBgmParams(ref, params);
}

export function getLoopOption(ref?: string): LoopOption {
	const params = parseBgmParams(ref);
	const loop = params.loop;
	if (!loop) return undefined;
	const opt: NonNullable<Exclude<LoopOption, boolean>> = {
		start: { [loop.type]: loop.val },
	};
	if (loop.endType && loop.endType !== "none" && loop.endVal !== undefined) {
		opt.end = { [loop.endType]: loop.endVal };
	}
	return opt;
}

export function getBgmVolume(ref?: string): number {
	const params = parseBgmParams(ref);
	return params.volume !== undefined ? params.volume : 50;
}

export function getBgmStart(ref?: string): number {
	const params = parseBgmParams(ref);
	return params.start !== undefined ? params.start : 0;
}

/** BGM参照を BgmManager が解釈できる {type, src, loop, volume, start} へ。
 *  mml:post:N はその投稿のMML本文(rawMml)が要るため省略可。 */
export function bgmRefToAsset(
	raw: string,
	rawMml?: string,
): {
	type: "youtube" | "nicovideo" | "soundcloud" | "mml" | "direct";
	src: string;
	loop?: LoopOption;
	volume?: number;
	start?: number;
} | null {
	const ref = parseRef(raw);
	if (!ref || ref.scheme === "none" || !ref.value) return null;

	const loopOption = getLoopOption(raw);
	const volume = getBgmVolume(raw);
	const start = getBgmStart(raw);

	let valStr = ref.value;
	const hashIdx = valStr.indexOf("#");
	if (hashIdx !== -1) {
		valStr = valStr.slice(0, hashIdx);
	}

	if (ref.scheme === "youtube")
		return { type: "youtube", src: toYoutubeWatchUrl(valStr), volume, start };
	if (ref.scheme === "nicovideo")
		return { type: "nicovideo", src: valStr, volume, start };
	if (ref.scheme === "soundcloud")
		return { type: "soundcloud", src: valStr, volume, start };
	if (ref.scheme === "direct")
		return { type: "direct", src: valStr, volume, start };
	if (ref.scheme === "url") {
		if (valStr.includes("nicovideo.jp"))
			return { type: "nicovideo", src: valStr, volume, start };
		if (valStr.includes("soundcloud.com"))
			return { type: "soundcloud", src: valStr, volume, start };
		if (valStr.includes("youtube.com") || valStr.includes("youtu.be"))
			return { type: "youtube", src: toYoutubeWatchUrl(valStr), volume, start };
		return { type: "direct", src: valStr, volume, start };
	}
	if (ref.scheme === "mml") {
		if (valStr.startsWith("post:")) {
			return rawMml
				? { type: "mml", src: rawMml, loop: loopOption, volume, start }
				: null;
		}
		return { type: "mml", src: valStr, loop: loopOption, volume, start };
	}
	return null;
}

/** 人間向けの短いラベル。 */
export function refLabel(raw: string): string {
	const ref = parseRef(raw);
	if (!ref || ref.scheme === "none" || !ref.value) return "なし";
	switch (ref.scheme) {
		case "post":
			return `画像投稿 #${ref.value}`;
		case "walk": {
			const wr = parseWalkRef(raw);
			if (!wr) return "歩行グラ";
			return wr.source.kind === "post"
				? `歩行グラ #${wr.source.postId}`
				: "歩行グラ";
		}
		case "url":
			return ref.value.length > 28 ? ref.value.slice(0, 26) + "…" : ref.value;
		case "tile":
			return `色 ${ref.value}`;
		case "emoji":
			return ref.value;
		case "youtube":
			return "YouTube BGM";
		case "nicovideo":
			return "ニコニコ BGM";
		case "soundcloud":
			return "SoundCloud BGM";
		case "mml":
			return ref.value.startsWith("post:")
				? `MML投稿 #${ref.value.slice(5)}`
				: "MML";
		case "direct":
			return ref.value.length > 28 ? ref.value.slice(0, 26) + "…" : ref.value;
		default:
			return ref.raw;
	}
}

export function youtubeRefFromUrl(url: string): string {
	const m = url.match(
		/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/,
	);
	const timeParam =
		url.match(/(?:[?&#](?:t|start|time_continue)=)([^&]+)/i)?.[1] || "";
	const startSeconds = parseTimeToSeconds(timeParam);
	const base = m ? `youtube:${m[1]}` : `youtube:${url}`;
	if (startSeconds !== undefined && startSeconds > 0) {
		return updateRefBgmParams(base, { start: startSeconds });
	}
	return base;
}

export function nicovideoRefFromUrl(url: string): string {
	const m = url.match(/(sm\d+|so\d+|nm\d+|\d+)/i);
	return m ? `nicovideo:${m[1]}` : `nicovideo:${url}`;
}

export function soundcloudRefFromUrl(url: string): string {
	return `soundcloud:${url}`;
}

/** youtube: scheme の値（素の動画ID、または生のYouTube URLも許容）を、BgmManager.extractVideoId
 *  が確実に解釈できるフル視聴URLへ正規化する。値が既に11桁のIDならそのまま埋め込む。 */
export function toYoutubeWatchUrl(val: string): string {
	const m = val.match(
		/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/,
	);
	const id = m ? m[1] : val.replace(/^youtube:/, "").split("#")[0];
	const params = parseBgmParams(val);
	const timeParam =
		val.match(/(?:[?&#](?:t|start|time_continue)=)([^&#]+)/i)?.[1] || "";
	const startSeconds =
		params.start && params.start > 0
			? params.start
			: parseTimeToSeconds(timeParam);

	if (startSeconds && startSeconds > 0) {
		return `https://www.youtube.com/watch?v=${id}&t=${startSeconds}s`;
	}
	return `https://www.youtube.com/watch?v=${id}`;
}

// ───────────────── 歩行グラ（アニメーション付きキャラチップ） ─────────────────
//
// 歩行グラは「シート画像 + 規格」で表す。規格(stdId)は省略時 'auto'（実寸から自動推定）。
// 形式: walk:<stdId>:<source>
//   stdId  = auto | rpgen | rm2k | rmxp | rmvx | rmmv
//   source = u:<url>   直リンクのシート画像（RPGen素材など）
//          = p:<postId> 既存の歩行グラ投稿（spriteUrl は選択時に解決してキャッシュ）
//   例: walk:auto:u:https://rpgen-search.pages.dev/data/images/sAnims/2158.png
//       walk:rpgen:p:123
// 後方互換: 旧 `walk:123`（=投稿123, 自動推定）も解釈する。

export interface WalkRef {
	stdId: string; // 'auto' or a WALK_STANDARDS id
	source: { kind: "url"; url: string } | { kind: "post"; postId: number };
	/**
	 * スプライトアトラス内のクロップ矩形 [sx, sy, sw, sh] (px)。
	 * 指定時は、この矩形を1行ストリップとして frames 分割してアニメーションする。
	 * SMC 形式アトラスで特定キャラのフレームを切り出す際に使用。
	 */
	crop?: [number, number, number, number];
	/**
	 * SMC ストリップのコマ数（省略時は lib/smc-sprite.ts が正方形コマとして幅/高さで自動算出）。
	 * 非正方形コマ（縦長の敵など）のとき #sx,sy,sw,sh,frames の5番目で明示する。
	 */
	frames?: number;
	/** セル下端からの距離(px)。正で上に、負で下にずらして揃える（既定0）。#…,frames,offsetY の6番目。 */
	offsetY?: number;
	/** 表示倍率（小数可）。指定時はセルへの自動フィットをせず、コマ実寸×この倍率で描く。#…,offsetY,scale の7番目。 */
	renderScale?: number;
	/** 簡易アニメ用: 対象行インデックス (既定 0)。#…,scale,row の8番目。 */
	row?: number;
	/** 簡易アニメ用: 再生モード ('loop' | 'pingpong' | 'once')。#…,row,playMode の9番目。 */
	playMode?: "loop" | "pingpong" | "once";
	/** 簡易アニメ用: フレームレート FPS (既定 6)。#…,playMode,fps の10番目。 */
	fps?: number;
}

const WALK_STD_IDS = new Set([
	"auto",
	"rpgen",
	"rm2k",
	"rmxp",
	"rmvx",
	"rmmv",
	"smc",
	"row_anim",
]);

export function buildWalkRef(stdId: string, source: WalkRef["source"]): string {
	const src = source.kind === "url" ? `u:${source.url}` : `p:${source.postId}`;
	return `walk:${WALK_STD_IDS.has(stdId) ? stdId : "auto"}:${src}`;
}

/**
 * `walk:...` を構造化。歩行グラでなければ null。旧 `walk:123` も解釈。
 *
 * SMC アトラスのクロップ付き形式:
 *   walk:smc:u:<url>#sx,sy,sw,sh
 * 例: walk:smc:u:https://cdn.../Goombas.png#0,0,64,32
 */
export function parseWalkRef(raw: string): WalkRef | null {
	if (!raw || !raw.startsWith("walk:")) return null;
	const rest = raw.slice("walk:".length);
	// 新形式: <stdId>:<source>
	const colon = rest.indexOf(":");
	if (colon !== -1) {
		const maybeStd = rest.slice(0, colon);
		if (WALK_STD_IDS.has(maybeStd)) {
			const srcStr = rest.slice(colon + 1);
			if (srcStr.startsWith("u:")) {
				const rawUrl = srcStr.slice(2);
				// クロップ指定 (#sx,sy,sw,sh) をURLフラグメントとして解析
				const hashIdx = rawUrl.indexOf("#");
				let url = rawUrl;
				let crop: [number, number, number, number] | undefined;
				let frames: number | undefined;
				let offsetY: number | undefined;
				let renderScale: number | undefined;
				let row: number | undefined;
				let playMode: "loop" | "pingpong" | "once" | undefined;
				let fps: number | undefined;
				if (hashIdx !== -1) {
					url = rawUrl.slice(0, hashIdx);
					const rawParts = rawUrl.slice(hashIdx + 1).split(",");
					const parts = rawParts.map(Number);
					if (parts.length >= 4 && parts.slice(0, 4).every((n) => !isNaN(n))) {
						crop = parts.slice(0, 4) as [number, number, number, number];
						if (parts.length >= 5 && !isNaN(parts[4]) && parts[4] > 0)
							frames = parts[4];
						if (parts.length >= 6 && !isNaN(parts[5])) offsetY = parts[5];
						if (parts.length >= 7 && !isNaN(parts[6]) && parts[6] > 0)
							renderScale = parts[6];
						if (parts.length >= 8 && !isNaN(parts[7]) && parts[7] >= 0)
							row = parts[7];
						if (
							parts.length >= 9 &&
							["loop", "pingpong", "once"].includes(rawParts[8])
						)
							playMode = rawParts[8] as "loop" | "pingpong" | "once";
						if (parts.length >= 10 && !isNaN(parts[9]) && parts[9] > 0)
							fps = parts[9];
					}
				}
				return {
					stdId: maybeStd,
					source: { kind: "url", url },
					crop,
					frames,
					offsetY,
					renderScale,
					row,
					playMode,
					fps,
				};
			}
			if (srcStr.startsWith("p:")) {
				const id = parseInt(srcStr.slice(2), 10);
				if (!isNaN(id))
					return { stdId: maybeStd, source: { kind: "post", postId: id } };
			}
		}
	}
	// 後方互換: walk:123 / walk:123#s0
	const legacyId = parseInt(rest, 10);
	if (!isNaN(legacyId))
		return { stdId: "auto", source: { kind: "post", postId: legacyId } };
	return null;
}

export function isWalkRef(raw: string): boolean {
	return !!parseWalkRef(raw);
}
