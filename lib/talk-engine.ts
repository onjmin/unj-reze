// かけあい動画の描画。1 フレーム = drawTalkFrame(ctx, manifest, timeline, timeSec)。
//
// MV エンジン（lib/mv-engine.ts）と同じ画像解決（post:/url:/psd:）を使うが、時間は秒だけで
// 拍・小節を持たない。キャンバスは論理 640×360（TALK_W × TALK_H）。
//
// 描く順: 背景 → 聞き手 → 話者（少し大きく明るく）→ 字幕。
// 口パクは読み上げのモーラ列（母音付き）から引く。モーラ列が無い行は開閉を 8Hz で交互。
// 瞬きは MV の決定論スケジュール（seed）を秒→拍（120bpm 相当）に読み替えて使う。

import { imageRefToUrl, isPsdRef, parseRef } from "./asset-ref";
import { resolveBlinkState } from "./mv-blink";
import type { MvAssetRef, MvVowel } from "./mv-config";
import { peekPsdImage, preloadPsdRef } from "./mv-psd";
import {
	TALK_H,
	TALK_W,
	type TalkCharacter,
	type TalkExpression,
	type TalkManifest,
} from "./talk-config";
import { cueAt, moraAt, type TalkTimeline, type TalkTimelineCue } from "./talk-timeline";
import { loadImage, peekImage } from "./walk-sprite";

/** 秒 → 瞬きスケジュールの拍（120bpm 相当。MV の拍単位設定をそのまま使うため）。 */
const BLINK_BEATS_PER_SEC = 2;
/** 字幕ウィンドウの高さ（設計座標）。キャラの足元はこの上に乗る。 */
const SUBTITLE_H = 92;
const FONT_STACK =
	'"Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", system-ui, sans-serif';

// ── 画像の解決 ───────────────────────────────────────────────

const assetRefUrl = (ref: MvAssetRef | undefined): string | null => {
	if (!ref) return null;
	return ref.url ?? imageRefToUrl(ref.ref);
};

const emojiOf = (ref: MvAssetRef | undefined): string | null => {
	if (!ref) return null;
	const parsed = parseRef(ref.ref);
	return parsed?.scheme === "emoji" ? parsed.value : null;
};

const resolveRefImage = (ref: MvAssetRef | undefined): CanvasImageSource | null => {
	if (!ref) return null;
	if (isPsdRef(ref.ref)) {
		const canvas = peekPsdImage(ref.ref);
		return canvas && canvas.width > 0 ? canvas : null;
	}
	const url = assetRefUrl(ref);
	if (!url) return null;
	const img = peekImage(url);
	return img && img.naturalWidth > 0 ? img : null;
};

const imageSize = (src: CanvasImageSource): { w: number; h: number } => {
	if (src instanceof HTMLImageElement) return { w: src.naturalWidth, h: src.naturalHeight };
	if (src instanceof HTMLCanvasElement) return { w: src.width, h: src.height };
	const any = src as { width?: number; height?: number };
	return { w: any.width ?? 0, h: any.height ?? 0 };
};

/** manifest が参照する画像参照をすべて列挙する。 */
export function collectTalkAssetRefs(manifest: TalkManifest): MvAssetRef[] {
	const refs: MvAssetRef[] = [];
	if (manifest.stage.bg) refs.push(manifest.stage.bg);
	for (const ch of manifest.characters) {
		for (const face of Object.values(ch.faces)) if (face) refs.push(face);
		if (ch.eyes) refs.push(ch.eyes.open, ch.eyes.closed);
		if (ch.mouth) {
			refs.push(ch.mouth.closed, ch.mouth.open);
			for (const v of Object.values(ch.mouth.vowels ?? {})) if (v) refs.push(v);
		}
	}
	return refs;
}

/** 画像を全部読み込む。失敗した画像は無視して他を待つ（描画側は無い画像を飛ばす）。 */
export async function preloadTalkAssets(manifest: TalkManifest): Promise<void> {
	const urls = new Set<string>();
	const psd = new Set<string>();
	for (const ref of collectTalkAssetRefs(manifest)) {
		if (isPsdRef(ref.ref)) psd.add(ref.ref);
		else {
			const u = assetRefUrl(ref);
			if (u) urls.add(u);
		}
	}
	await Promise.all([
		...[...urls].map((u) => loadImage(u).catch(() => null)),
		...[...psd].map((r) =>
			preloadPsdRef(r).catch((err) => {
				console.warn("[talk] psdレイヤーの読み込みに失敗しました", r, err);
			}),
		),
	]);
}

// ── 1 フレーム ───────────────────────────────────────────────

export interface TalkDrawOptions {
	/** 画面中央に出す短いメッセージ（準備中など）。 */
	overlayText?: string;
	/** 準備の進捗 0..1（overlayText と一緒に細いバーを出す）。 */
	overlayProgress?: number;
}

/** 話者と、その行の頭からの経過秒。時間軸が無いときは最初の行を「話していない」扱いで出す。 */
interface SpeakingState {
	current: TalkTimelineCue | null;
	tInCue: number;
	speaking: boolean;
}

const speakingStateAt = (timeline: TalkTimeline | null, timeSec: number): SpeakingState => {
	if (!timeline) return { current: null, tInCue: 0, speaking: false };
	const current = cueAt(timeline, timeSec);
	if (!current) return { current: null, tInCue: 0, speaking: false };
	const tInCue = timeSec - current.startSec;
	return { current, tInCue, speaking: tInCue < current.durationSec };
};

export function drawTalkFrame(
	ctx: CanvasRenderingContext2D,
	manifest: TalkManifest,
	timeline: TalkTimeline | null,
	timeSec: number,
	options: TalkDrawOptions = {},
): void {
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	drawBackground(ctx, manifest);

	const state = speakingStateAt(timeline, timeSec);
	const speakerId = state.current?.cue.speaker ?? null;
	const expression: TalkExpression = state.current?.cue.expression ?? "neutral";

	// 聞き手を先に、話者を後に（手前に）描く。
	const ordered = [...manifest.characters].sort((a, b) => {
		const sa = a.id === speakerId ? 1 : 0;
		const sb = b.id === speakerId ? 1 : 0;
		return sa - sb;
	});
	for (const ch of ordered) {
		const isSpeaker = ch.id === speakerId;
		drawCharacter(ctx, ch, {
			expression: isSpeaker ? expression : "neutral",
			isSpeaker,
			timeSec,
			state,
		});
	}

	if (state.current) drawSubtitle(ctx, manifest, state.current);
	if (options.overlayText) drawOverlay(ctx, options.overlayText, options.overlayProgress);
	ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, manifest: TalkManifest): void {
	ctx.fillStyle = manifest.stage.bgColor || "#000";
	ctx.fillRect(0, 0, TALK_W, TALK_H);
	const bg = resolveRefImage(manifest.stage.bg);
	if (!bg) return;
	const { w, h } = imageSize(bg);
	if (w === 0 || h === 0) return;
	// cover
	const scale = Math.max(TALK_W / w, TALK_H / h);
	const dw = w * scale;
	const dh = h * scale;
	ctx.drawImage(bg, (TALK_W - dw) / 2, (TALK_H - dh) / 2, dw, dh);
}

interface CharacterDrawState {
	expression: TalkExpression;
	isSpeaker: boolean;
	timeSec: number;
	state: SpeakingState;
}

function mouthRef(ch: TalkCharacter, s: CharacterDrawState): MvAssetRef | null {
	const mouth = ch.mouth;
	if (!mouth) return null;
	if (!s.isSpeaker || !s.state.speaking || !s.state.current) return mouth.closed;
	const cue = s.state.current;
	if (cue.morae.length > 0) {
		const m = moraAt(cue.morae, s.state.tInCue);
		if (!m) return mouth.closed;
		const vowel = m.vowel as MvVowel;
		if (vowel === "n") return mouth.closed;
		return mouth.vowels?.[vowel] ?? mouth.open;
	}
	// モーラ列が無い（推定長の行）: 8Hz で開閉
	return Math.floor(s.state.tInCue * 8) % 2 === 0 ? mouth.open : mouth.closed;
}

function drawCharacter(
	ctx: CanvasRenderingContext2D,
	ch: TalkCharacter,
	s: CharacterDrawState,
): void {
	const faceRef = ch.faces[s.expression] ?? ch.faces.neutral;
	const emoji = emojiOf(faceRef);
	const img = emoji ? null : resolveRefImage(faceRef);
	if (!img && !emoji) return;

	const baseH = TALK_H * 0.62 * (ch.scale || 1) * (s.isSpeaker ? 1.03 : 1);
	const cx = ch.side === "left" ? TALK_W * 0.27 : TALK_W * 0.73;
	const bottom = TALK_H - SUBTITLE_H + 14 + (ch.y || 0);
	const alpha = s.isSpeaker ? 1 : 0.82;

	ctx.save();
	ctx.globalAlpha = alpha;
	if (emoji) {
		const size = baseH * 0.9;
		ctx.font = `${size}px ${FONT_STACK}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "alphabetic";
		if (ch.flipH) {
			ctx.translate(cx, 0);
			ctx.scale(-1, 1);
			ctx.translate(-cx, 0);
		}
		ctx.fillText(emoji, cx, bottom - size * 0.12);
		ctx.restore();
		return;
	}
	const size = imageSize(img as CanvasImageSource);
	if (size.w === 0 || size.h === 0) {
		ctx.restore();
		return;
	}
	// 切り出し矩形（walk: シートの 1 コマ等）があればその範囲だけを使う。
	const src = faceRef?.crop ?? [0, 0, size.w, size.h];
	const scale = baseH / src[3];
	const dw = src[2] * scale;
	const dh = baseH;
	const dx = cx - dw / 2;
	const dy = bottom - dh;
	if (ch.flipH) {
		ctx.translate(cx, 0);
		ctx.scale(-1, 1);
		ctx.translate(-cx, 0);
	}
	ctx.imageSmoothingEnabled = true;
	drawCropped(ctx, img as CanvasImageSource, src, dx, dy, dw, dh);
	// 目（瞬き）と口は土台と同じ矩形へ重ねる（MV の character レイヤーと同じ前提）。
	if (ch.eyes) {
		const closed = resolveBlinkState(ch.eyes.blink, s.timeSec * BLINK_BEATS_PER_SEC) === "closed";
		const ref = closed ? ch.eyes.closed : ch.eyes.open;
		const eye = resolveRefImage(ref);
		if (eye) drawCropped(ctx, eye, ref.crop, dx, dy, dw, dh);
	}
	const mRef = mouthRef(ch, s);
	if (mRef) {
		const m = resolveRefImage(mRef);
		if (m) drawCropped(ctx, m, mRef.crop, dx, dy, dw, dh);
	}
	ctx.restore();
}

/** crop があれば元画像のその範囲だけを、無ければ全体を dx,dy,dw,dh へ描く。 */
function drawCropped(
	ctx: CanvasRenderingContext2D,
	img: CanvasImageSource,
	crop: [number, number, number, number] | undefined,
	dx: number,
	dy: number,
	dw: number,
	dh: number,
): void {
	if (crop) ctx.drawImage(img, crop[0], crop[1], crop[2], crop[3], dx, dy, dw, dh);
	else ctx.drawImage(img, dx, dy, dw, dh);
}

/** 字幕。行の頭で全文を出す（YMM 風）。2 行まで自動改行。 */
function drawSubtitle(
	ctx: CanvasRenderingContext2D,
	manifest: TalkManifest,
	cue: TalkTimelineCue,
): void {
	const ch = manifest.characters.find((c) => c.id === cue.cue.speaker);
	const sub = manifest.stage.subtitle;
	const text = cue.cue.subtitle ?? cue.cue.text;
	const pad = 14;
	const x = 16;
	const y = TALK_H - SUBTITLE_H - 8;
	const w = TALK_W - 32;
	const h = SUBTITLE_H;

	ctx.save();
	if (sub.style === "window") {
		ctx.fillStyle = "rgba(10, 12, 24, 0.86)";
		roundRect(ctx, x, y, w, h, 10);
		ctx.fill();
		ctx.lineWidth = 2;
		ctx.strokeStyle = ch?.color ?? "#ffffff";
		roundRect(ctx, x, y, w, h, 10);
		ctx.stroke();
	} else {
		ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
		ctx.fillRect(0, y, TALK_W, h + 8);
	}

	// 話者名
	ctx.textBaseline = "top";
	ctx.textAlign = "left";
	let textTop = y + pad;
	if (ch) {
		ctx.font = `bold 15px ${FONT_STACK}`;
		ctx.fillStyle = ch.color;
		ctx.fillText(ch.name, x + pad, y + 8);
		textTop = y + 8 + 20;
	}
	// 本文
	const fontSize = sub.fontSize || 22;
	ctx.font = `bold ${fontSize}px ${FONT_STACK}`;
	const lines = wrapText(ctx, text, w - pad * 2).slice(0, 2);
	ctx.lineJoin = "round";
	ctx.lineWidth = 4;
	ctx.strokeStyle = sub.outline || "#000";
	ctx.fillStyle = sub.color || "#fff";
	lines.forEach((line, i) => {
		const ly = textTop + i * (fontSize + 6);
		ctx.strokeText(line, x + pad, ly);
		ctx.fillText(line, x + pad, ly);
	});
	ctx.restore();
}

function drawOverlay(ctx: CanvasRenderingContext2D, text: string, progress?: number): void {
	ctx.save();
	ctx.fillStyle = "rgba(0,0,0,0.45)";
	ctx.fillRect(0, 0, TALK_W, TALK_H);
	ctx.font = `bold 18px ${FONT_STACK}`;
	ctx.fillStyle = "#fff";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(text, TALK_W / 2, TALK_H / 2 - 10);
	if (progress !== undefined) {
		const bw = 220;
		const bx = (TALK_W - bw) / 2;
		const by = TALK_H / 2 + 12;
		ctx.fillStyle = "rgba(255,255,255,0.25)";
		ctx.fillRect(bx, by, bw, 6);
		ctx.fillStyle = "#facc15";
		ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, progress)), 6);
	}
	ctx.restore();
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

/** 文字単位で折り返す（日本語前提。空白でも切る）。 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
	const lines: string[] = [];
	for (const para of text.split("\n")) {
		let line = "";
		for (const chr of para) {
			const next = line + chr;
			if (line && ctx.measureText(next).width > maxW) {
				lines.push(line);
				line = chr;
			} else line = next;
		}
		lines.push(line);
	}
	return lines;
}
