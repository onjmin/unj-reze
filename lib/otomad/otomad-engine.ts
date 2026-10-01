// 音MAD の描画。1 フレーム = drawOtomadFrame(ctx, manifest, timeline, media, timeSec)。
// 設計: docs/otomad-feature-design.md §5
//
// 画の主役は「素材の窓」。各トラックの表示中イベント（show に従う）ごとに、素材のコマ
// （OtomadMediaCache.frameAt）を slot の矩形へ cover で描く。演出は flip / hitZoom / pitchY の
// 3 つだけ。キャンバスは論理 640×360（OTOMAD_W × OTOMAD_H）。実時間再生とオフライン書き出しの
// 両方がこの関数を呼ぶので、ここは時刻だけに依存する純粋な描画にしておく。

import { imageRefToUrl } from "@/lib/assets/asset-ref";
import { loadImage, peekImage } from "@/lib/assets/walk-sprite";
import type { MvAssetRef } from "@/lib/mv/mv-config";
import { OTOMAD_H, OTOMAD_W, type OtomadManifest, type OtomadSlot } from "./otomad-config";
import type { OtomadMediaCache } from "./otomad-media";
import { type OtomadEvent, type OtomadTimeline, mediaTimeOf, visibleEventsAt } from "./otomad-timeline";

const FONT_STACK = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", system-ui, sans-serif';
/** 曲頭・曲尾のフェード（秒）。 */
const EDGE_FADE_SEC = 0.3;

const assetRefUrl = (ref: MvAssetRef | undefined): string | null => {
	if (!ref) return null;
	return ref.url ?? imageRefToUrl(ref.ref);
};

/** 背景画像の先読み。 */
export const preloadOtomadImages = async (manifest: OtomadManifest): Promise<void> => {
	const u = assetRefUrl(manifest.stage.bg);
	if (u) await loadImage(u).catch(() => null);
};

export interface OtomadDrawOptions {
	/** 準備中などの重ね文字。 */
	overlayText?: string;
	overlayProgress?: number;
	/** 選択中の slot を枠で示す（エディタ）。 */
	highlight?: { trackIdx: number; slot: number } | null;
	/** 窓の枠をすべて薄く描く（エディタで位置を見るため）。 */
	showSlotOutlines?: boolean;
	/** 曲頭・曲尾のフェードを掛ける（再生中・書き出し時）。停止中は掛けない（時刻 0 で真っ黒になる）。既定 true。 */
	edgeFade?: boolean;
}

const drawCover = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	img: CanvasImageSource,
	sw: number,
	sh: number,
	crop: [number, number, number, number] | undefined,
	srcW: number,
	srcH: number,
	dw: number,
	dh: number,
	fit: "cover" | "contain" = "cover",
) => {
	// crop は素材の元画素座標。コマは縮小されているので比率で合わせる
	let sx = 0;
	let sy = 0;
	let cw = sw;
	let ch = sh;
	if (crop && srcW > 0 && srcH > 0) {
		const kx = sw / srcW;
		const ky = sh / srcH;
		sx = crop[0] * kx;
		sy = crop[1] * ky;
		cw = Math.max(1, crop[2] * kx);
		ch = Math.max(1, crop[3] * ky);
	}
	if (fit === "contain") {
		// contain: 全体を窓に収める（余白は透明のまま）
		const scale = Math.min(dw / cw, dh / ch);
		const w = cw * scale;
		const h = ch * scale;
		ctx.drawImage(img, sx, sy, cw, ch, -w / 2, -h / 2, w, h);
		return;
	}
	// cover: 窓を埋めるように拡大して中央でトリミング
	const scale = Math.max(dw / cw, dh / ch);
	const fw = dw / scale;
	const fh = dh / scale;
	const fx = sx + (cw - fw) / 2;
	const fy = sy + (ch - fh) / 2;
	ctx.drawImage(img, fx, fy, fw, fh, -dw / 2, -dh / 2, dw, dh);
};

const bitmapSize = (img: CanvasImageSource): { w: number; h: number } => {
	const any = img as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
	return { w: any.naturalWidth ?? any.width ?? 0, h: any.naturalHeight ?? any.height ?? 0 };
};

const drawSlotOutline = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	slot: OtomadSlot,
	color: string,
	width: number,
	label?: string,
) => {
	ctx.save();
	ctx.translate(slot.x, slot.y);
	if (slot.rotate) ctx.rotate((slot.rotate * Math.PI) / 180);
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.setLineDash([6, 4]);
	ctx.strokeRect(-slot.w / 2, -slot.h / 2, slot.w, slot.h);
	if (label) {
		ctx.setLineDash([]);
		ctx.font = `bold 11px ${FONT_STACK}`;
		ctx.fillStyle = color;
		ctx.textBaseline = "top";
		ctx.fillText(label, -slot.w / 2 + 4, -slot.h / 2 + 3);
	}
	ctx.restore();
};

/** 1 イベントの窓を描く。 */
const drawWindow = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	manifest: OtomadManifest,
	timeline: OtomadTimeline,
	media: OtomadMediaCache,
	ev: OtomadEvent,
	t: number,
) => {
	const track = manifest.tracks[ev.trackIdx];
	const v = track.visual;
	const slot = v.slots[Math.min(ev.slot, v.slots.length - 1)];
	if (!slot) return;
	const img = media.frameAt(ev.source.id, mediaTimeOf(ev, track, t));
	if (!img) return;
	const { w: sw, h: sh } = bitmapSize(img);
	if (sw <= 0 || sh <= 0) return;
	const orig = media.sizeOf(ev.source.id) ?? { w: sw, h: sh };

	// 音の頭で拡大して 1 拍で戻す
	const beatSec = timeline.secPerStep * 48;
	const age = Math.max(0, t - ev.startSec);
	const hit = Math.max(0, 1 - age / beatSec);
	const zoom = 1 + (Math.max(1, v.hitZoom) - 1) * hit * hit;
	const dy = v.pitchY ? -(ev.pitch - (timeline.trackCenterPitch[ev.trackIdx] ?? 60)) * v.pitchY : 0;

	ctx.save();
	ctx.globalAlpha *= Math.max(0, Math.min(1, v.opacity));
	ctx.translate(slot.x, slot.y + dy);
	if (slot.rotate) ctx.rotate((slot.rotate * Math.PI) / 180);
	ctx.scale(zoom * (ev.flip ? -1 : 1), zoom);
	ctx.beginPath();
	ctx.rect(-slot.w / 2, -slot.h / 2, slot.w, slot.h);
	ctx.clip();
	// ドット絵のような透過画像は contain のほうが自然（cover は端が切れる）
	ctx.imageSmoothingEnabled = !(ev.source.kind === "image" && (orig.w <= 128 || orig.h <= 128));
	drawCover(ctx, img, sw, sh, ev.source.crop, orig.w, orig.h, slot.w, slot.h, v.fit ?? "cover");
	ctx.restore();
};

export const drawOtomadFrame = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	manifest: OtomadManifest,
	timeline: OtomadTimeline | null,
	media: OtomadMediaCache | null,
	timeSec: number,
	options: OtomadDrawOptions = {},
): void => {
	// 呼び出し側の変換（書き出しの拡大など）はそのまま使う。ここで setTransform でリセットしないこと
	// （リセットすると 1280×720 の書き出しが左上 640×360 に小さく描かれる）。
	ctx.save();
	ctx.globalAlpha = 1;
	ctx.imageSmoothingEnabled = true;

	// 背景
	ctx.fillStyle = manifest.stage.bgColor || "#000";
	ctx.fillRect(0, 0, OTOMAD_W, OTOMAD_H);
	const bgUrl = assetRefUrl(manifest.stage.bg);
	if (bgUrl) {
		const img = peekImage(bgUrl);
		if (img && img.naturalWidth > 0) {
			ctx.save();
			ctx.translate(OTOMAD_W / 2, OTOMAD_H / 2);
			drawCover(ctx, img, img.naturalWidth, img.naturalHeight, undefined, img.naturalWidth, img.naturalHeight, OTOMAD_W, OTOMAD_H);
			ctx.restore();
		}
	}
	if (manifest.stage.bgDim > 0) {
		ctx.fillStyle = `rgba(0,0,0,${Math.min(1, manifest.stage.bgDim)})`;
		ctx.fillRect(0, 0, OTOMAD_W, OTOMAD_H);
	}

	// 窓（z 順。同じ z ならトラック順）
	if (timeline && media) {
		const visible = visibleEventsAt(timeline, timeSec);
		visible.sort(
			(a, b) =>
				manifest.tracks[a.trackIdx].visual.z - manifest.tracks[b.trackIdx].visual.z ||
				a.trackIdx - b.trackIdx ||
				a.startSec - b.startSec,
		);
		for (const ev of visible) drawWindow(ctx, manifest, timeline, media, ev, timeSec);
	}

	// 曲頭・曲尾のフェード
	if (options.edgeFade !== false && timeline && timeline.totalSec > 0) {
		const tail = timeline.totalSec - timeSec;
		let fade = 0;
		if (timeSec < EDGE_FADE_SEC) fade = 1 - timeSec / EDGE_FADE_SEC;
		else if (tail < EDGE_FADE_SEC) fade = 1 - Math.max(0, tail) / EDGE_FADE_SEC;
		if (fade > 0) {
			ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`;
			ctx.fillRect(0, 0, OTOMAD_W, OTOMAD_H);
		}
	}

	// エディタ用の枠（フェードより上）
	if (options.showSlotOutlines || options.highlight) {
		manifest.tracks.forEach((track, ti) => {
			if (track.visual.kind !== "window") return;
			track.visual.slots.forEach((slot, si) => {
				const hl = options.highlight && options.highlight.trackIdx === ti && options.highlight.slot === si;
				if (!hl && !options.showSlotOutlines) return;
				drawSlotOutline(
					ctx,
					slot,
					hl ? "rgba(96,165,250,0.95)" : "rgba(255,255,255,0.35)",
					hl ? 2 : 1,
					`@${track.track}${track.visual.slots.length > 1 ? ` #${si + 1}` : ""}`,
				);
			});
		});
	}

	// 重ね文字（準備中など）
	if (options.overlayText) {
		ctx.fillStyle = "rgba(0,0,0,0.55)";
		ctx.fillRect(0, 0, OTOMAD_W, OTOMAD_H);
		ctx.fillStyle = "#fff";
		ctx.font = `bold 18px ${FONT_STACK}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(options.overlayText, OTOMAD_W / 2, OTOMAD_H / 2 - 10);
		if (options.overlayProgress !== undefined) {
			const w = 240;
			const x = (OTOMAD_W - w) / 2;
			const y = OTOMAD_H / 2 + 14;
			ctx.fillStyle = "rgba(255,255,255,0.25)";
			ctx.fillRect(x, y, w, 6);
			ctx.fillStyle = "#facc15";
			ctx.fillRect(x, y, w * Math.max(0, Math.min(1, options.overlayProgress)), 6);
		}
	}
	ctx.restore();
};
