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
import { effectiveStage, OTOMAD_H, OTOMAD_W, type OtomadManifest, type OtomadSlot, sortedScenes } from "./otomad-config";
import type { OtomadMediaCache } from "./otomad-media";
import { type OtomadEvent, type OtomadTimeline, mediaTimeOf, sceneIndexAtSec, visibleEventsAt } from "./otomad-timeline";

const FONT_STACK = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", system-ui, sans-serif';
/** 曲頭・曲尾のフェード（秒）。 */
const EDGE_FADE_SEC = 0.3;

const assetRefUrl = (ref: MvAssetRef | undefined): string | null => {
	if (!ref) return null;
	return ref.url ?? imageRefToUrl(ref.ref);
};

/** 背景画像の先読み（場面ごとの背景も）。 */
export const preloadOtomadImages = async (manifest: OtomadManifest): Promise<void> => {
	const urls = [assetRefUrl(manifest.stage.bg), ...sortedScenes(manifest).map((sc) => (sc.stage?.bg ? assetRefUrl(sc.stage.bg) : null))];
	await Promise.all(urls.filter((u): u is string => !!u).map((u) => loadImage(u).catch(() => null)));
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

/** 窓の形のパス（中心原点）。 */
const windowPath = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	shape: "rect" | "circle" | "hexagon" | "diamond",
	w: number,
	h: number,
) => {
	ctx.beginPath();
	if (shape === "circle") ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
	else if (shape === "hexagon") {
		for (let i = 0; i < 6; i++) {
			const a = (Math.PI / 3) * i - Math.PI / 6;
			const x = (Math.cos(a) * w) / 2;
			const y = (Math.sin(a) * h) / 2;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.closePath();
	} else if (shape === "diamond") {
		ctx.moveTo(0, -h / 2);
		ctx.lineTo(w / 2, 0);
		ctx.lineTo(0, h / 2);
		ctx.lineTo(-w / 2, 0);
		ctx.closePath();
	} else ctx.rect(-w / 2, -h / 2, w, h);
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
	const v = ev.sceneIdx >= 0 ? timeline.scenes[ev.sceneIdx].visuals[ev.trackIdx] : timeline.baseVisuals[ev.trackIdx];
	if (!v) return;
	const slot = v.slots[Math.min(ev.slot, v.slots.length - 1)];
	if (!slot) return;
	const img = media.frameAt(ev.source.id, mediaTimeOf(ev, v, t));
	if (!img) return;
	const { w: sw, h: sh } = bitmapSize(img);
	if (sw <= 0 || sh <= 0) return;
	const orig = media.sizeOf(ev.source.id) ?? { w: sw, h: sh };

	// 音の頭の演出。1 拍で戻す（hit は 1→0）
	const beatSec = timeline.secPerStep * 48;
	const age = Math.max(0, t - ev.startSec);
	const hit = ev.hit ? Math.max(0, 1 - age / beatSec) : 0;
	const strength = Math.max(0, Math.min(0.5, (v.hitZoom || 1) - 1)); // 0〜0.5
	const style = v.hitStyle ?? "zoom";
	let sx = 1;
	let sy = 1;
	let ox = 0;
	let oy = 0;
	let rot = 0;
	let flash = 0;
	switch (style) {
		case "zoom":
			sx = sy = 1 + strength * hit * hit;
			break;
		case "bounce": {
			// 減衰振動（スネアの「プルン」）。下端を支点に縦へ伸び縮み、横は逆に動く
			const osc = Math.sin(age * 28) * Math.exp(-age * 9) * strength * 2;
			sy = 1 + osc;
			sx = 1 - osc * 0.5;
			oy = (slot.h / 2) * (1 - sy);
			break;
		}
		case "shake":
			ox = Math.sin(age * 90) * slot.w * 0.08 * hit * (strength * 2 + 0.5);
			break;
		case "flash":
			flash = hit;
			sx = sy = 1 + strength * 0.3 * hit;
			break;
		case "spin":
			rot = (1 - (1 - hit) ** 3) * 360;
			break;
		case "slide":
			ox = (ev.flip ? 1 : -1) * slot.w * 0.25 * hit * hit * (strength * 2 + 0.5);
			break;
	}
	// 円形配置の回転（重心のまわり）
	let cx = slot.x;
	let cy = slot.y;
	if (v.orbitDegPerBeat && v.slots.length > 1) {
		const gx = v.slots.reduce((a, s) => a + s.x, 0) / v.slots.length;
		const gy = v.slots.reduce((a, s) => a + s.y, 0) / v.slots.length;
		const a = ((t / beatSec) * v.orbitDegPerBeat * Math.PI) / 180;
		const dx = slot.x - gx;
		const dyy = slot.y - gy;
		cx = gx + dx * Math.cos(a) - dyy * Math.sin(a);
		cy = gy + dx * Math.sin(a) + dyy * Math.cos(a);
	}
	const dy = v.pitchY ? -(ev.pitch - (timeline.trackCenterPitch[ev.trackIdx] ?? 60)) * v.pitchY : 0;
	// 拍の脈動（全窓共通）
	if (v.beatPulse) {
		const phase = (t / beatSec) % 1;
		const p = 1 + Math.max(0, Math.min(0.5, v.beatPulse)) * (1 - phase) ** 2;
		sx *= p;
		sy *= p;
	}
	// 流す（画面端で折り返し）
	if (v.scrollPerBeat && (v.scrollPerBeat.x || v.scrollPerBeat.y)) {
		const beats = t / beatSec;
		const wrap = (val: number, size: number, span: number) => {
			const period = span + size;
			return ((((val + size / 2) % period) + period) % period) - size / 2;
		};
		cx = wrap(cx + beats * v.scrollPerBeat.x, slot.w, OTOMAD_W);
		cy = wrap(cy + beats * v.scrollPerBeat.y, slot.h, OTOMAD_H);
	}

	const shape = v.shape ?? "rect";
	const fit = v.fit ?? "cover";
	let alpha = Math.max(0, Math.min(1, v.opacity));
	if (v.velocityToOpacity) alpha *= Math.max(0.15, Math.min(1, ev.velocity / 100));
	const paint = (px: number, py: number, flipX: boolean, flipY: boolean) => {
		ctx.save();
		ctx.globalAlpha *= alpha;
		ctx.translate(px + ox * (flipX ? -1 : 1), py + dy + oy);
		if (slot.rotate) ctx.rotate(((slot.rotate * (flipX !== flipY ? -1 : 1)) * Math.PI) / 180);
		if (rot) ctx.rotate(((rot * (flipX !== flipY ? -1 : 1)) * Math.PI) / 180);
		ctx.scale(sx * (flipX ? -1 : 1), sy * (flipY ? -1 : 1));
		if (v.frame && v.frame.width > 0) {
			ctx.strokeStyle = v.frame.color;
			ctx.lineWidth = v.frame.width;
			windowPath(ctx, shape, slot.w, slot.h);
			ctx.stroke();
		}
		windowPath(ctx, shape, slot.w, slot.h);
		ctx.clip();
		// ドット絵のような透過画像は contain のほうが自然（cover は端が切れる）
		ctx.imageSmoothingEnabled = !(ev.source.kind === "image" && (orig.w <= 128 || orig.h <= 128));
		drawCover(ctx, img, sw, sh, ev.source.crop, orig.w, orig.h, slot.w, slot.h, fit);
		if (flash > 0) {
			// 描いた画素だけ明るくする（透過部分は光らない）
			ctx.globalCompositeOperation = "lighter";
			ctx.globalAlpha *= flash * 0.8;
			drawCover(ctx, img, sw, sh, ev.source.crop, orig.w, orig.h, slot.w, slot.h, fit);
		}
		ctx.restore();
	};
	paint(cx, cy, ev.flip, false);
	const mirror = v.mirror ?? "none";
	if (mirror === "horizontal" || mirror === "quad") paint(OTOMAD_W - cx, cy, !ev.flip, false);
	if (mirror === "vertical" || mirror === "quad") paint(cx, OTOMAD_H - cy, ev.flip, true);
	if (mirror === "quad") paint(OTOMAD_W - cx, OTOMAD_H - cy, !ev.flip, true);
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

	// 背景（場面の上書きを反映）
	const sceneIdx = timeline ? sceneIndexAtSec(timeline, timeSec) : -1;
	const scene = timeline && sceneIdx >= 0 ? timeline.scenes[sceneIdx] : null;
	const stage = effectiveStage(manifest.stage, scene?.scene ?? null);
	// 画面全体のフィルタ（場面の雰囲気。反転・白黒など）。重ね文字と枠には掛けない
	if (stage.filter && "filter" in ctx) {
		try {
			ctx.filter = stage.filter;
		} catch {
			// 読めないフィルタは無視
		}
	}
	ctx.fillStyle = stage.bgColor || "#000";
	ctx.fillRect(0, 0, OTOMAD_W, OTOMAD_H);
	const bgUrl = assetRefUrl(stage.bg);
	if (bgUrl) {
		const img = peekImage(bgUrl);
		if (img && img.naturalWidth > 0) {
			ctx.save();
			ctx.translate(OTOMAD_W / 2, OTOMAD_H / 2);
			drawCover(ctx, img, img.naturalWidth, img.naturalHeight, undefined, img.naturalWidth, img.naturalHeight, OTOMAD_W, OTOMAD_H);
			ctx.restore();
		}
	}
	if (stage.bgDim > 0) {
		ctx.fillStyle = `rgba(0,0,0,${Math.min(1, stage.bgDim)})`;
		ctx.fillRect(0, 0, OTOMAD_W, OTOMAD_H);
	}

	// 窓（z 順。同じ z ならトラック順）
	if (timeline && media) {
		const visible = visibleEventsAt(timeline, timeSec);
		const zOf = (ev: OtomadEvent) => (ev.sceneIdx >= 0 ? timeline.scenes[ev.sceneIdx].visuals[ev.trackIdx] : timeline.baseVisuals[ev.trackIdx])?.z ?? 0;
		visible.sort((a, b) => zOf(a) - zOf(b) || a.trackIdx - b.trackIdx || a.startSec - b.startSec);
		for (const ev of visible) drawWindow(ctx, manifest, timeline, media, ev, timeSec);
	}

	if ("filter" in ctx) ctx.filter = "none";

	// 場面の転換（単色からの明け。MV と同じく 2 画面を合成しない）
	if (scene?.scene.transition && scene.scene.transition.style !== "cut" && timeline) {
		const tr = scene.scene.transition;
		const dur = Math.max(0.05, tr.beats * timeline.secPerStep * 48);
		const age = timeSec - scene.startSec;
		if (age >= 0 && age < dur) {
			const k = age / dur;
			ctx.save();
			if (tr.style === "fade" || tr.style === "flash") {
				ctx.fillStyle = tr.style === "fade" ? `rgba(0,0,0,${1 - k})` : `rgba(255,255,255,${(1 - k) ** 2})`;
				ctx.fillRect(0, 0, OTOMAD_W, OTOMAD_H);
			} else {
				ctx.fillStyle = "#000";
				const e = 1 - (1 - k) ** 2;
				if (tr.style === "wipeLeft") ctx.fillRect(0, 0, OTOMAD_W * (1 - e), OTOMAD_H);
				else if (tr.style === "wipeRight") ctx.fillRect(OTOMAD_W * e, 0, OTOMAD_W * (1 - e), OTOMAD_H);
				else if (tr.style === "wipeUp") ctx.fillRect(0, 0, OTOMAD_W, OTOMAD_H * (1 - e));
				else ctx.fillRect(0, OTOMAD_H * e, OTOMAD_W, OTOMAD_H * (1 - e));
			}
			ctx.restore();
		}
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

	// エディタ用の枠（フェードより上）。いまの場面の配置を描く
	if (options.showSlotOutlines || options.highlight) {
		manifest.tracks.forEach((track, ti) => {
			const vis = timeline ? ((sceneIdx >= 0 ? timeline.scenes[sceneIdx].visuals[ti] : timeline.baseVisuals[ti]) ?? track.visual) : track.visual;
			if (vis.kind !== "window") return;
			vis.slots.forEach((slot, si) => {
				const hl = options.highlight && options.highlight.trackIdx === ti && options.highlight.slot === si;
				if (!hl && !options.showSlotOutlines) return;
				drawSlotOutline(
					ctx,
					slot,
					hl ? "rgba(96,165,250,0.95)" : "rgba(255,255,255,0.35)",
					hl ? 2 : 1,
					`@${track.track}${vis.slots.length > 1 ? ` #${si + 1}` : ""}`,
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
