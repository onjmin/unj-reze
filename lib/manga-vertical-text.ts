"use client";

export interface MangaTextConfig {
	x: number; // 基準 x
	y: number; // 基準 y
	text: string;
	direction: "vertical" | "horizontal";
	fontSize: number;
	fontFamily: string;
	color: string;
	strokeColor?: string;
	strokeWidth?: number;
	lineHeight?: number; // 倍率 (例: 1.3)
}

/**
 * 縦書き時に90度回転すべき文字か判定
 */
function isRotateChar(char: string): boolean {
	const rotateChars = "ー―─～〜…‥()（）{}｛｝[]［］【】〈〉《》「」『』";
	return rotateChars.includes(char);
}

/**
 * 縦書き時に右上にシフトすべき句読点か判定
 */
function isPunctuation(char: string): boolean {
	return "、。，．,.".includes(char);
}

/**
 * 縦書き・横書きのテキストを CanvasRenderingContext2D に描画する
 */
export function drawMangaText(
	ctx: CanvasRenderingContext2D,
	config: MangaTextConfig,
): { width: number; height: number } {
	const {
		x,
		y,
		text,
		direction,
		fontSize,
		fontFamily,
		color,
		strokeColor = "#ffffff",
		strokeWidth = 0,
		lineHeight = 1.3,
	} = config;

	if (!text) return { width: 0, height: 0 };

	ctx.save();
	ctx.font = `bold ${fontSize}px ${fontFamily}`;
	ctx.textBaseline = "middle";
	ctx.textAlign = "center";

	const lines = text.split("\n");
	const lineSpacing = fontSize * lineHeight;

	if (direction === "horizontal") {
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		let maxW = 0;
		const totalH = lines.length * lineSpacing;

		lines.forEach((line, lineIdx) => {
			const ly = y + lineIdx * lineSpacing;
			const metrics = ctx.measureText(line);
			if (metrics.width > maxW) maxW = metrics.width;

			if (strokeWidth > 0 && strokeColor) {
				ctx.strokeStyle = strokeColor;
				ctx.lineWidth = strokeWidth * 2;
				ctx.lineJoin = "round";
				ctx.strokeText(line, x, ly);
			}
			ctx.fillStyle = color;
			ctx.fillText(line, x, ly);
		});

		ctx.restore();
		return { width: maxW, height: totalH };
	}

	// 縦書き (vertical-rl: 右から左へ改行、上から下へ文字)
	const totalW = lines.length * lineSpacing;
	let maxH = 0;

	lines.forEach((line, lineIdx) => {
		// 右端の列から順に描画
		const lx = x + (lines.length - 1 - lineIdx) * lineSpacing;
		const chars = Array.from(line);
		const colH = chars.length * (fontSize * 1.05);
		if (colH > maxH) maxH = colH;

		let curY = y + fontSize / 2;

		chars.forEach((char) => {
			ctx.save();
			if (isRotateChar(char)) {
				// 90度回転（時計回り）
				ctx.translate(lx, curY);
				ctx.rotate(Math.PI / 2);
				if (strokeWidth > 0 && strokeColor) {
					ctx.strokeStyle = strokeColor;
					ctx.lineWidth = strokeWidth * 2;
					ctx.lineJoin = "round";
					ctx.strokeText(char, 0, 0);
				}
				ctx.fillStyle = color;
				ctx.fillText(char, 0, 0);
			} else if (isPunctuation(char)) {
				// 句読点は右上に少しオフセット
				const px = lx + fontSize * 0.35;
				const py = curY - fontSize * 0.35;
				if (strokeWidth > 0 && strokeColor) {
					ctx.strokeStyle = strokeColor;
					ctx.lineWidth = strokeWidth * 2;
					ctx.lineJoin = "round";
					ctx.strokeText(char, px, py);
				}
				ctx.fillStyle = color;
				ctx.fillText(char, px, py);
			} else {
				if (strokeWidth > 0 && strokeColor) {
					ctx.strokeStyle = strokeColor;
					ctx.lineWidth = strokeWidth * 2;
					ctx.lineJoin = "round";
					ctx.strokeText(char, lx, curY);
				}
				ctx.fillStyle = color;
				ctx.fillText(char, lx, curY);
			}
			ctx.restore();

			curY += fontSize * 1.05;
		});
	});

	ctx.restore();
	return { width: totalW, height: maxH };
}
