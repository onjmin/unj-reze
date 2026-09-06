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

export type FrameTemplate =
	// 基本
	| "4koma"
	| "2rows"
	| "3rows"
	| "single"
	| "grid2x2"
	| "threeCol"
	// ストーリー・大小混在
	| "storyStandard"
	| "storyClimaxBottom"
	| "storyCenterHighlight"
	| "topHeroBottomTwo"
	| "dialogueAsym"
	| "actionQuick"
	| "topWideBottomTwo"
	| "topTwoBottomWide"
	| "dynamicMix"
	// 縦長大コマ・左右分割
	| "rightVerticalLeftTwo"
	| "rightVerticalLeftThree"
	| "leftVerticalRightTwo"
	| "topWideBottomRightTall"
	| "topRightTallLeftTwoBottomWide";

// コマ割りの行構成。1行 = { heightWeight: 行の高さ比率, cols: 行内の各コマの幅比率 }
export interface FrameRowSpec {
	heightWeight: number;
	cols: number[];
}

// コマ割りの列構成。1列 = { widthWeight: 列の幅比率, rows: 列内の各コマの高さ比率 }
export interface FrameColSpec {
	widthWeight: number;
	rows: number[];
}

export const FRAME_ROW_TEMPLATES: Partial<Record<FrameTemplate, FrameRowSpec[]>> = {
	// 上段: 見開き的な広いコマ / 下段: 会話などの並列コマ2つ
	topWideBottomTwo: [
		{ heightWeight: 1, cols: [1] },
		{ heightWeight: 1, cols: [1, 1] },
	],
	// 上段: 並列コマ2つ / 下段: 締めの広いコマ
	topTwoBottomWide: [
		{ heightWeight: 1, cols: [1, 1] },
		{ heightWeight: 1, cols: [1] },
	],
	// 2x2の均等グリッド
	grid2x2: [
		{ heightWeight: 1, cols: [1, 1] },
		{ heightWeight: 1, cols: [1, 1] },
	],
	// 横3分割（テンポの速いカット割り用）
	threeCol: [{ heightWeight: 1, cols: [1, 1, 1] }],
	// 実際のストーリー漫画でよく見る「広い→細かい→大小混在」の可変レイアウト
	dynamicMix: [
		{ heightWeight: 1.2, cols: [1] },
		{ heightWeight: 1, cols: [1, 1, 1] },
		{ heightWeight: 1.4, cols: [2, 1] },
	],
	// 王道3段（上大・中2・下2）：状況説明・導入から入る
	storyStandard: [
		{ heightWeight: 1.3, cols: [1] },
		{ heightWeight: 1, cols: [1, 1] },
		{ heightWeight: 1, cols: [1, 1] },
	],
	// 引き・オチ（上2・中2・下大）：最後の決めゴマやオチ
	storyClimaxBottom: [
		{ heightWeight: 1, cols: [1, 1] },
		{ heightWeight: 1, cols: [1, 1] },
		{ heightWeight: 1.4, cols: [1] },
	],
	// 中段見せ場（上2・中大・下2）：中央の決定的な瞬間やアクション
	storyCenterHighlight: [
		{ heightWeight: 0.9, cols: [1, 1] },
		{ heightWeight: 1.4, cols: [1] },
		{ heightWeight: 0.9, cols: [1, 1] },
	],
	// インパクト大ゴマ（上70%特大・下2）：大迫力の見せゴマ＋状況補足
	topHeroBottomTwo: [
		{ heightWeight: 2.3, cols: [1] },
		{ heightWeight: 1, cols: [1, 1] },
	],
	// 会話・心理描写（上1・中2:1・下1:2）：左右比率を変えたリズミカルな会話劇
	dialogueAsym: [
		{ heightWeight: 1, cols: [1] },
		{ heightWeight: 1, cols: [2, 1] },
		{ heightWeight: 1, cols: [1, 2] },
	],
	// スピード展開（上3・中大・下2）：速いカットから大ゴマへの急展開
	actionQuick: [
		{ heightWeight: 0.9, cols: [1, 1, 1] },
		{ heightWeight: 1.4, cols: [1] },
		{ heightWeight: 1, cols: [1, 1] },
	],
};

export function generateFromRowSpecs(
	rows: FrameRowSpec[],
	contentX: number,
	contentY: number,
	contentW: number,
	contentH: number,
	rowGutter: number,
	colGutter: number,
): FrameBox[] {
	const totalRowWeight = rows.reduce((sum, r) => sum + r.heightWeight, 0);
	const totalRowGutter = rowGutter * (rows.length - 1);
	const availableH = contentH - totalRowGutter;

	const boxes: FrameBox[] = [];
	let y = contentY;
	for (const row of rows) {
		const rowH = (availableH * row.heightWeight) / totalRowWeight;
		const totalColWeight = row.cols.reduce((sum, c) => sum + c, 0);
		const totalColGutter = colGutter * (row.cols.length - 1);
		const availableW = contentW - totalColGutter;

		let x = contentX;
		for (const colWeight of row.cols) {
			const colW = (availableW * colWeight) / totalColWeight;
			boxes.push({ x, y, w: colW, h: rowH });
			x += colW + colGutter;
		}
		y += rowH + rowGutter;
	}
	return boxes;
}

export function generateFromColSpecs(
	cols: FrameColSpec[],
	contentX: number,
	contentY: number,
	contentW: number,
	contentH: number,
	rowGutter: number,
	colGutter: number,
): FrameBox[] {
	const totalColWeight = cols.reduce((sum, c) => sum + c.widthWeight, 0);
	const totalColGutter = colGutter * (cols.length - 1);
	const availableW = contentW - totalColGutter;

	const boxes: FrameBox[] = [];
	let x = contentX;
	for (const col of cols) {
		const colW = (availableW * col.widthWeight) / totalColWeight;
		const totalRowWeight = col.rows.reduce((sum, r) => sum + r, 0);
		const totalRowGutter = rowGutter * (col.rows.length - 1);
		const availableH = contentH - totalRowGutter;

		let y = contentY;
		for (const rowWeight of col.rows) {
			const rowH = (availableH * rowWeight) / totalRowWeight;
			boxes.push({ x, y, w: colW, h: rowH });
			y += rowH + rowGutter;
		}
		x += colW + colGutter;
	}
	return boxes;
}

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
	// 漫画のコマ間隔の基本ルール：同じ段(横)に並ぶコマ同士の間隔は狭く、
	// 段と段(縦)の間隔は広くとる（視線を横→次の段へ大きく切り替えさせるため）。
	// gutter を「段の間隔」の基準とし、「同段コマの間隔」はその6割程度に狭める。
	const rowGutter = gutter;
	const colGutter = Math.round(gutter * 0.6);

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

		case "single": {
			return [
				{
					x: margin,
					y: margin,
					w: contentW,
					h: contentH,
				},
			];
		}

		// 縦長大コマ・左右分割系
		case "rightVerticalLeftTwo": {
			// 左列: 2段 / 右列: 縦長大コマ (幅比 1.1)
			return generateFromColSpecs(
				[
					{ widthWeight: 1.0, rows: [1, 1] },
					{ widthWeight: 1.1, rows: [1] },
				],
				margin,
				margin,
				contentW,
				contentH,
				rowGutter,
				colGutter,
			);
		}

		case "rightVerticalLeftThree": {
			// 左列: 3段 / 右列: 縦長大コマ (幅比 1.15)
			return generateFromColSpecs(
				[
					{ widthWeight: 1.0, rows: [1, 1, 1] },
					{ widthWeight: 1.15, rows: [1] },
				],
				margin,
				margin,
				contentW,
				contentH,
				rowGutter,
				colGutter,
			);
		}

		case "leftVerticalRightTwo": {
			// 左列: 縦長大コマ (幅比 1.1) / 右列: 2段
			return generateFromColSpecs(
				[
					{ widthWeight: 1.1, rows: [1] },
					{ widthWeight: 1.0, rows: [1, 1] },
				],
				margin,
				margin,
				contentW,
				contentH,
				rowGutter,
				colGutter,
			);
		}

		case "topWideBottomRightTall": {
			// 上段: 横大コマ (高さ比 1.0) / 下段: 右縦長＋左2段 (高さ比 1.8)
			const topWeight = 1.0;
			const bottomWeight = 1.8;
			const totalH = contentH - rowGutter;
			const topH = (totalH * topWeight) / (topWeight + bottomWeight);
			const bottomH = (totalH * bottomWeight) / (topWeight + bottomWeight);

			const topBox: FrameBox = {
				x: margin,
				y: margin,
				w: contentW,
				h: topH,
			};

			const bottomBoxes = generateFromColSpecs(
				[
					{ widthWeight: 1.0, rows: [1, 1] },
					{ widthWeight: 1.1, rows: [1] },
				],
				margin,
				margin + topH + rowGutter,
				contentW,
				bottomH,
				rowGutter,
				colGutter,
			);

			return [topBox, ...bottomBoxes];
		}

		case "topRightTallLeftTwoBottomWide": {
			// 上段: 右縦長＋左2段 (高さ比 1.8) / 下段: 横大コマ (高さ比 1.0)
			const topWeight = 1.8;
			const bottomWeight = 1.0;
			const totalH = contentH - rowGutter;
			const topH = (totalH * topWeight) / (topWeight + bottomWeight);
			const bottomH = (totalH * bottomWeight) / (topWeight + bottomWeight);

			const topBoxes = generateFromColSpecs(
				[
					{ widthWeight: 1.0, rows: [1, 1] },
					{ widthWeight: 1.1, rows: [1] },
				],
				margin,
				margin,
				contentW,
				topH,
				rowGutter,
				colGutter,
			);

			const bottomBox: FrameBox = {
				x: margin,
				y: margin + topH + rowGutter,
				w: contentW,
				h: bottomH,
			};

			return [...topBoxes, bottomBox];
		}

		default: {
			const rowSpecs = FRAME_ROW_TEMPLATES[template];
			if (!rowSpecs) {
				return [{ x: margin, y: margin, w: contentW, h: contentH }];
			}
			return generateFromRowSpecs(
				rowSpecs,
				margin,
				margin,
				contentW,
				contentH,
				rowGutter,
				colGutter,
			);
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
