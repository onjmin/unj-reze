"use client";

export type BubbleShape = "none" | "ellipse" | "roundRect" | "shout" | "thought";
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

/** しっぽが向く方向（中心から見た角度。canvas 座標なので y は下向き） */
const TAIL_ANGLE: Record<Exclude<TailDirection, "none">, number> = {
	bottom: Math.PI / 2,
	"bottom-left": Math.PI * 0.62,
	"bottom-right": Math.PI * 0.38,
	left: Math.PI,
	right: 0,
	top: -Math.PI / 2,
};

/** 輪郭が基準楕円からどれだけ外へ膨らむか（モコモコの瘤・ウニフラのトゲ） */
function outlineScale(shape: BubbleShape): number {
	if (shape === "thought") return 1.18;
	if (shape === "shout") return 1.35;
	return 1;
}

/** 中心から角度 theta の向きに伸ばしたときの、輪郭との交点 */
function edgePoint(
	shape: BubbleShape,
	x: number,
	y: number,
	halfW: number,
	halfH: number,
	theta: number,
): { x: number; y: number } {
	const c = Math.cos(theta);
	const s = Math.sin(theta);

	if (shape === "roundRect") {
		// 矩形との交点（角丸ぶんは無視。しっぽの付け根は内側に埋めるので影響しない）
		const tx = c !== 0 ? halfW / Math.abs(c) : Number.POSITIVE_INFINITY;
		const ty = s !== 0 ? halfH / Math.abs(s) : Number.POSITIVE_INFINITY;
		const t = Math.min(tx, ty);
		return { x: x + c * t, y: y + s * t };
	}

	return { x: x + c * halfW, y: y + s * halfH };
}

interface TailGeometry {
	base1: { x: number; y: number };
	base2: { x: number; y: number };
	tip: { x: number; y: number };
}

/**
 * 三角のしっぽの座標。
 * 付け根（base1/base2）は**フキダシの輪郭より内側**に置く。輪郭と一緒に
 * 塗り潰して継ぎ目を消すので、内側から生やす方が本体と確実に繋がる。
 */
function computeTailGeometry(config: BubbleConfig): TailGeometry | null {
	const { x, y, w, h, shape, tail, tailLength = 28 } = config;
	if (tail === "none" || shape === "none" || shape === "shout" || shape === "thought") {
		return null;
	}

	const halfW = w / 2;
	const halfH = h / 2;
	const theta = TAIL_ANGLE[tail];
	const edge = edgePoint(shape, x, y, halfW, halfH, theta);

	const dx = edge.x - x;
	const dy = edge.y - y;
	const dist = Math.hypot(dx, dy) || 1;
	const ux = dx / dist;
	const uy = dy / dist;
	// 輪郭に沿う向き（法線を 90 度回したもの）
	const px = -uy;
	const py = ux;

	// 付け根の幅。細すぎても太すぎてもフキダシに見えないので上下限を設ける
	const neckHalf = Math.max(9, Math.min(22, Math.min(halfW, halfH) * 0.34));
	// 付け根を輪郭より内側へ埋める量
	const anchorDist = dist * 0.88;
	const ax = x + ux * anchorDist;
	const ay = y + uy * anchorDist;

	// 巻き方向を本体（時計回り）に揃える。逆向きだと nonzero 塗りで穴が開く
	return {
		base1: { x: ax + px * neckHalf, y: ay + py * neckHalf },
		base2: { x: ax - px * neckHalf, y: ay - py * neckHalf },
		tip: { x: x + ux * (dist + tailLength), y: y + uy * (dist + tailLength) },
	};
}

/** モコモコ用の思考泡（小円 2 つ）。雲の外側に並べる */
function computeThoughtDots(
	config: BubbleConfig,
): { x: number; y: number; r: number }[] | null {
	const { x, y, w, h, shape, tail } = config;
	if (shape !== "thought" || tail === "none") return null;

	const halfW = w / 2;
	const halfH = h / 2;
	const theta = TAIL_ANGLE[tail];
	const edge = edgePoint(shape, x, y, halfW, halfH, theta);
	const dx = edge.x - x;
	const dy = edge.y - y;
	const dist = (Math.hypot(dx, dy) || 1) * outlineScale(shape);
	const ux = dx / (Math.hypot(dx, dy) || 1);
	const uy = dy / (Math.hypot(dx, dy) || 1);

	const r1 = 8;
	const r2 = 5;
	const d1 = dist + 6 + r1;
	const d2 = d1 + r1 + 9 + r2;

	return [
		{ x: x + ux * d1, y: y + uy * d1, r: r1 },
		{ x: x + ux * d2, y: y + uy * d2, r: r2 },
	];
}

/** フキダシ本体の輪郭を path に積む */
function buildBodyPath(path: Path2D, config: BubbleConfig): void {
	const { x, y, w, h, shape } = config;
	const halfW = w / 2;
	const halfH = h / 2;

	if (shape === "ellipse") {
		// 楕円
		path.ellipse(x, y, halfW, halfH, 0, 0, Math.PI * 2);
	} else if (shape === "roundRect") {
		// 角丸矩形
		const rx = Math.min(16, halfW);
		const ry = Math.min(16, halfH);
		const left = x - halfW;
		const top = y - halfH;
		const right = x + halfW;
		const bottom = y + halfH;

		path.moveTo(left + rx, top);
		path.lineTo(right - rx, top);
		path.quadraticCurveTo(right, top, right, top + ry);
		path.lineTo(right, bottom - ry);
		path.quadraticCurveTo(right, bottom, right - rx, bottom);
		path.lineTo(left + rx, bottom);
		path.quadraticCurveTo(left, bottom, left, bottom - ry);
		path.lineTo(left, top + ry);
		path.quadraticCurveTo(left, top, left + rx, top);
	} else if (shape === "thought") {
		// モコモコ雲型（12個程度の円弧で構成）
		const numArcs = 12;
		const angleStep = (Math.PI * 2) / numArcs;
		for (let i = 0; i < numArcs; i++) {
			const a1 = i * angleStep;
			const a2 = (i + 1) * angleStep;
			const midAngle = (a1 + a2) / 2;
			const rMid = outlineScale("thought"); // 外側に膨らむ倍率
			const cx = x + Math.cos(a1) * halfW;
			const cy = y + Math.sin(a1) * halfH;
			const nx = x + Math.cos(a2) * halfW;
			const ny = y + Math.sin(a2) * halfH;
			const cpx = x + Math.cos(midAngle) * (halfW * rMid);
			const cpy = y + Math.sin(midAngle) * (halfH * rMid);

			if (i === 0) path.moveTo(cx, cy);
			path.quadraticCurveTo(cpx, cpy, nx, ny);
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

			if (i === 0) path.moveTo(innerX, innerY);
			path.lineTo(outerX, outerY);
			const endX = x + Math.cos((i + 1) * angleStep) * (halfW * 0.85);
			const endY = y + Math.sin((i + 1) * angleStep) * (halfH * 0.85);
			path.lineTo(endX, endY);
		}
	}

	path.closePath();
}

/**
 * フキダシの描画範囲（しっぽ・トゲ・思考泡・線の太さを含む外接矩形）。
 * プレビューの倍率計算に使う。
 */
export function getBubbleBounds(config: BubbleConfig): {
	x: number;
	y: number;
	w: number;
	h: number;
} {
	const { x, y, w, h, shape, borderWidth = 3 } = config;
	if (shape === "none") return { x: x - w / 2, y: y - h / 2, w, h };

	const scale = outlineScale(shape);
	let left = x - (w / 2) * scale;
	let right = x + (w / 2) * scale;
	let top = y - (h / 2) * scale;
	let bottom = y + (h / 2) * scale;

	const tail = computeTailGeometry(config);
	if (tail) {
		left = Math.min(left, tail.tip.x);
		right = Math.max(right, tail.tip.x);
		top = Math.min(top, tail.tip.y);
		bottom = Math.max(bottom, tail.tip.y);
	}

	const dots = computeThoughtDots(config);
	if (dots) {
		for (const d of dots) {
			left = Math.min(left, d.x - d.r);
			right = Math.max(right, d.x + d.r);
			top = Math.min(top, d.y - d.r);
			bottom = Math.max(bottom, d.y + d.r);
		}
	}

	// 線は輪郭の外側にも太さぶん乗る
	const pad = borderWidth;
	return {
		x: left - pad,
		y: top - pad,
		w: right - left + pad * 2,
		h: bottom - top + pad * 2,
	};
}

/**
 * フキダシの輪郭パスを CanvasRenderingContext2D に描画する
 */
export function drawBubble(ctx: CanvasRenderingContext2D, config: BubbleConfig): void {
	const {
		shape,
		borderWidth = 3,
		borderColor = "#000000",
		backgroundColor = "#ffffff",
	} = config;

	if (shape === "none") return;

	const tail = computeTailGeometry(config);
	const dots = computeThoughtDots(config);

	// 本体・しっぽ・思考泡を 1 本の Path2D にまとめる。
	// まとめて塗ることで、付け根の継ぎ目（本体の輪郭がしっぽを横切る線、
	// しっぽの底辺の線）が塗りに隠れて 1 つの形に見える。
	// 巻き方向は全て同じ（時計回り）なので nonzero 塗りで穴は開かない。
	const path = new Path2D();
	buildBodyPath(path, config);

	if (tail) {
		path.moveTo(tail.base1.x, tail.base1.y);
		path.lineTo(tail.base2.x, tail.base2.y);
		path.lineTo(tail.tip.x, tail.tip.y);
		path.closePath();
	}

	if (dots) {
		for (const d of dots) {
			path.moveTo(d.x + d.r, d.y);
			path.arc(d.x, d.y, d.r, 0, Math.PI * 2);
		}
	}

	ctx.save();
	ctx.fillStyle = backgroundColor;
	ctx.strokeStyle = borderColor;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";

	if (borderWidth > 0) {
		// 先に線 → 後から塗り。内側半分が塗りで隠れるので、線幅を倍に取ると
		// 輪郭の外側にちょうど borderWidth ぶん残る。継ぎ目が出ないのはこの順序のおかげ。
		ctx.lineWidth = borderWidth * 2;
		ctx.stroke(path);
	}
	ctx.fill(path);

	ctx.restore();
}
