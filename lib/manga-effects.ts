"use client";

export interface FocusLineConfig {
	cx: number; // 集中線の中心 x
	cy: number; // 集中線の中心 y
	innerRadius: number; // 中心の抜き半径（キャラクターの顔など）
	maxRadius: number; // 外側の到達半径
	lineCount: number; // 本数
	lineWidth: number; // 線の太さ
	color?: string;
}

export interface SpeedLineConfig {
	direction: "horizontal" | "vertical";
	density: number; // 線の間隔 (px)
	lineWidth: number;
	length: number;
	color?: string;
	width: number;
	height: number;
}

export interface FrameBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type FrameTemplate = "4koma" | "2rows" | "3rows" | "single";

/**
 * 集中線を CanvasRenderingContext2D に描画する
 */
export function drawFocusLines(
	ctx: CanvasRenderingContext2D,
	config: FocusLineConfig,
): void {
	const {
		cx,
		cy,
		innerRadius,
		maxRadius,
		lineCount,
		lineWidth,
		color = "#000000",
	} = config;

	ctx.save();
	ctx.fillStyle = color;

	const angleStep = (Math.PI * 2) / lineCount;

	for (let i = 0; i < lineCount; i++) {
		// わずかな角度の揺らぎ
		const jitter = ((i * 17) % 7 - 3) * 0.005;
		const angle = i * angleStep + jitter;

		// 内側の尖った頂点
		const innerDist = innerRadius + ((i * 13) % 25);
		const tipX = cx + Math.cos(angle) * innerDist;
		const tipY = cy + Math.sin(angle) * innerDist;

		// 外側の2点（三角形の底辺）
		const baseAngle1 = angle - (lineWidth / innerDist) * 1.5;
		const baseAngle2 = angle + (lineWidth / innerDist) * 1.5;

		const base1X = cx + Math.cos(baseAngle1) * maxRadius;
		const base1Y = cy + Math.sin(baseAngle1) * maxRadius;
		const base2X = cx + Math.cos(baseAngle2) * maxRadius;
		const base2Y = cy + Math.sin(baseAngle2) * maxRadius;

		ctx.beginPath();
		ctx.moveTo(tipX, tipY);
		ctx.lineTo(base1X, base1Y);
		ctx.lineTo(base2X, base2Y);
		ctx.closePath();
		ctx.fill();
	}

	ctx.restore();
}

/**
 * 流線（スピード線）を CanvasRenderingContext2D に描画する
 */
export function drawSpeedLines(
	ctx: CanvasRenderingContext2D,
	config: SpeedLineConfig,
): void {
	const {
		direction,
		density = 16,
		lineWidth = 2,
		color = "#000000",
		width,
		height,
	} = config;

	ctx.save();
	ctx.fillStyle = color;

	if (direction === "horizontal") {
		const count = Math.ceil(height / density);
		for (let i = 0; i < count; i++) {
			const y = i * density + ((i * 11) % 7);
			const lineLen = width * 0.4 + ((i * 31) % (width * 0.5));
			const startX = (i % 2 === 0) ? 0 : width - lineLen;

			ctx.beginPath();
			ctx.moveTo(startX, y);
			ctx.lineTo(startX + lineLen, y + (i % 2 === 0 ? 0.5 : -0.5));
			ctx.lineTo(startX + lineLen, y + lineWidth);
			ctx.lineTo(startX, y + lineWidth);
			ctx.closePath();
			ctx.fill();
		}
	} else {
		const count = Math.ceil(width / density);
		for (let i = 0; i < count; i++) {
			const x = i * density + ((i * 11) % 7);
			const lineLen = height * 0.4 + ((i * 31) % (height * 0.5));
			const startY = (i % 2 === 0) ? 0 : height - lineLen;

			ctx.beginPath();
			ctx.moveTo(x, startY);
			ctx.lineTo(x + lineWidth, startY);
			ctx.lineTo(x + (i % 2 === 0 ? 0.5 : -0.5), startY + lineLen);
			ctx.lineTo(x, startY + lineLen);
			ctx.closePath();
			ctx.fill();
		}
	}

	ctx.restore();
}

/**
 * プリセットのコマ枠リストを計算する
 */
export function generateFrameBoxes(
	template: FrameTemplate,
	canvasWidth: number,
	canvasHeight: number,
	margin = 40,
	gutter = 24,
): FrameBox[] {
	const contentW = canvasWidth - margin * 2;
	const contentH = canvasHeight - margin * 2;

	switch (template) {
		case "4koma": {
			const rows = 4;
			const boxH = (contentH - gutter * (rows - 1)) / rows;
			return Array.from({ length: rows }, (_, i) => ({
				x: margin,
				y: margin + i * (boxH + gutter),
				w: contentW,
				h: boxH,
			}));
		}

		case "2rows": {
			const rows = 2;
			const boxH = (contentH - gutter * (rows - 1)) / rows;
			return Array.from({ length: rows }, (_, i) => ({
				x: margin,
				y: margin + i * (boxH + gutter),
				w: contentW,
				h: boxH,
			}));
		}

		case "3rows": {
			const rows = 3;
			const boxH = (contentH - gutter * (rows - 1)) / rows;
			return Array.from({ length: rows }, (_, i) => ({
				x: margin,
				y: margin + i * (boxH + gutter),
				w: contentW,
				h: boxH,
			}));
		}

		case "single":
		default: {
			return [
				{
					x: margin,
					y: margin,
					w: contentW,
					h: contentH,
				},
			];
		}
	}
}

/**
 * コマ枠を CanvasRenderingContext2D に描画する
 */
export function drawFrames(
	ctx: CanvasRenderingContext2D,
	boxes: FrameBox[],
	borderWidth = 4,
	borderColor = "#000000",
): void {
	ctx.save();
	ctx.strokeStyle = borderColor;
	ctx.lineWidth = borderWidth;
	ctx.lineJoin = "miter";

	for (const box of boxes) {
		ctx.strokeRect(box.x, box.y, box.w, box.h);
	}

	ctx.restore();
}
