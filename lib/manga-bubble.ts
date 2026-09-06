"use client";

export type BubbleShape = "ellipse" | "roundRect" | "shout" | "thought";
export type TailDirection =
	| "none"
	| "bottom"
	| "bottom-left"
	| "bottom-right"
	| "left"
	| "right"
	| "top";

export interface BubbleConfig {
	x: number; // 中心 x
	y: number; // 中心 y
	w: number; // 幅
	h: number; // 高さ
	shape: BubbleShape;
	tail: TailDirection;
	tailLength?: number;
	borderWidth?: number;
	borderColor?: string;
	backgroundColor?: string;
}

/**
 * フキダシの輪郭パスを CanvasRenderingContext2D に描画する
 */
export function drawBubble(ctx: CanvasRenderingContext2D, config: BubbleConfig): void {
	const {
		x,
		y,
		w,
		h,
		shape,
		tail,
		tailLength = 28,
		borderWidth = 3,
		borderColor = "#000000",
		backgroundColor = "#ffffff",
	} = config;

	ctx.save();
	ctx.fillStyle = backgroundColor;
	ctx.strokeStyle = borderColor;
	ctx.lineWidth = borderWidth;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";

	const halfW = w / 2;
	const halfH = h / 2;

	ctx.beginPath();

	if (shape === "ellipse") {
		// 楕円
		ctx.ellipse(x, y, halfW, halfH, 0, 0, Math.PI * 2);
	} else if (shape === "roundRect") {
		// 角丸矩形
		const rx = 16;
		const ry = 16;
		const left = x - halfW;
		const top = y - halfH;
		const right = x + halfW;
		const bottom = y + halfH;

		ctx.moveTo(left + rx, top);
		ctx.lineTo(right - rx, top);
		ctx.quadraticCurveTo(right, top, right, top + ry);
		ctx.lineTo(right, bottom - ry);
		ctx.quadraticCurveTo(right, bottom, right - rx, bottom);
		ctx.lineTo(left + rx, bottom);
		ctx.quadraticCurveTo(left, bottom, left, bottom - ry);
		ctx.lineTo(left, top + ry);
		ctx.quadraticCurveTo(left, top, left + rx, top);
	} else if (shape === "thought") {
		// モコモコ雲型（12個程度の円弧で構成）
		const numArcs = 12;
		const angleStep = (Math.PI * 2) / numArcs;
		for (let i = 0; i < numArcs; i++) {
			const a1 = i * angleStep;
			const a2 = (i + 1) * angleStep;
			const midAngle = (a1 + a2) / 2;
			const rMid = 1.18; // 外側に膨らむ倍率
			const cx = x + Math.cos(a1) * halfW;
			const cy = y + Math.sin(a1) * halfH;
			const nx = x + Math.cos(a2) * halfW;
			const ny = y + Math.sin(a2) * halfH;
			const cpx = x + Math.cos(midAngle) * (halfW * rMid);
			const cpy = y + Math.sin(midAngle) * (halfH * rMid);

			if (i === 0) ctx.moveTo(cx, cy);
			ctx.quadraticCurveTo(cpx, cpy, nx, ny);
		}
	} else if (shape === "shout") {
		// ウニフラ（ギザギザ・叫び）
		const spikes = 22;
		const angleStep = (Math.PI * 2) / spikes;
		for (let i = 0; i < spikes; i++) {
			const a = i * angleStep;
			const nextA = (i + 0.5) * angleStep;
			// 谷
			const innerX = x + Math.cos(a) * (halfW * 0.85);
			const innerY = y + Math.sin(a) * (halfH * 0.85);
			// 山（トゲ）
			const outerDist = 1.15 + (i % 2 === 0 ? 0.2 : 0.05);
			const outerX = x + Math.cos(nextA) * (halfW * outerDist);
			const outerY = y + Math.sin(nextA) * (halfH * outerDist);

			if (i === 0) ctx.moveTo(innerX, innerY);
			ctx.lineTo(outerX, outerY);
			const endX = x + Math.cos((i + 1) * angleStep) * (halfW * 0.85);
			const endY = y + Math.sin((i + 1) * angleStep) * (halfH * 0.85);
			ctx.lineTo(endX, endY);
		}
	}

	ctx.closePath();
	ctx.fill();
	if (borderWidth > 0) ctx.stroke();

	// しっぽの描画
	if (tail !== "none" && shape !== "shout") {
		if (shape === "thought") {
			// モコモコ用の思考泡（大小2つの小円）
			let bubble1X = x;
			let bubble1Y = y + halfH + 12;
			let bubble2X = x;
			let bubble2Y = y + halfH + 26;

			if (tail === "bottom-left" || tail === "left") {
				bubble1X = x - halfW * 0.5;
				bubble1Y = y + halfH + 10;
				bubble2X = x - halfW * 0.75;
				bubble2Y = y + halfH + 24;
			} else if (tail === "bottom-right" || tail === "right") {
				bubble1X = x + halfW * 0.5;
				bubble1Y = y + halfH + 10;
				bubble2X = x + halfW * 0.75;
				bubble2Y = y + halfH + 24;
			}

			// 泡1
			ctx.beginPath();
			ctx.arc(bubble1X, bubble1Y, 7, 0, Math.PI * 2);
			ctx.fill();
			if (borderWidth > 0) ctx.stroke();

			// 泡2
			ctx.beginPath();
			ctx.arc(bubble2X, bubble2Y, 4.5, 0, Math.PI * 2);
			ctx.fill();
			if (borderWidth > 0) ctx.stroke();
		} else {
			// 通常の三角形しっぽ
			let base1X = x;
			let base1Y = y + halfH - 2;
			let base2X = x + 16;
			let base2Y = y + halfH - 2;
			let tipX = x + 8;
			let tipY = y + halfH + tailLength;

			if (tail === "bottom-left") {
				base1X = x - halfW * 0.4;
				base1Y = y + halfH - 2;
				base2X = x - halfW * 0.15;
				base2Y = y + halfH - 2;
				tipX = x - halfW * 0.55;
				tipY = y + halfH + tailLength;
			} else if (tail === "bottom-right") {
				base1X = x + halfW * 0.15;
				base1Y = y + halfH - 2;
				base2X = x + halfW * 0.4;
				base2Y = y + halfH - 2;
				tipX = x + halfW * 0.55;
				tipY = y + halfH + tailLength;
			} else if (tail === "left") {
				base1X = x - halfW + 2;
				base1Y = y - 8;
				base2X = x - halfW + 2;
				base2Y = y + 8;
				tipX = x - halfW - tailLength;
				tipY = y + 12;
			} else if (tail === "right") {
				base1X = x + halfW - 2;
				base1Y = y - 8;
				base2X = x + halfW - 2;
				base2Y = y + 8;
				tipX = x + halfW + tailLength;
				tipY = y + 12;
			} else if (tail === "top") {
				base1X = x - 8;
				base1Y = y - halfH + 2;
				base2X = x + 8;
				base2Y = y - halfH + 2;
				tipX = x;
				tipY = y - halfH - tailLength;
			}

			// しっぽの三角形パス
			ctx.beginPath();
			ctx.moveTo(base1X, base1Y);
			ctx.lineTo(tipX, tipY);
			ctx.lineTo(base2X, base2Y);
			ctx.closePath();
			ctx.fill();
			if (borderWidth > 0) ctx.stroke();

			// 接続部の境界線を消すためにもう一度内側を塗りつぶし
			ctx.beginPath();
			ctx.moveTo(base1X, base1Y);
			ctx.lineTo(base2X, base2Y);
			ctx.lineTo((base1X + base2X) / 2, (base1Y + base2Y) / 2 - 2);
			ctx.closePath();
			ctx.fill();
		}
	}

	ctx.restore();
}
