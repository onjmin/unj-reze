"use client";

export type ToneType =
	| "dot-10"
	| "dot-20"
	| "dot-30"
	| "dot-40"
	| "dot-50"
	| "dot-60"
	| "line-45"
	| "cross"
	| "sand";

export interface ToneDefinition {
	id: ToneType;
	name: string;
	description: string;
}

export const TONE_DEFINITIONS: ToneDefinition[] = [
	{ id: "dot-10", name: "網点 10%", description: "薄い陰影・ハイライト" },
	{ id: "dot-20", name: "網点 20%", description: "肌の影や淡いトーン" },
	{ id: "dot-30", name: "網点 30%", description: "標準的な服や髪の影" },
	{ id: "dot-40", name: "網点 40%", description: "濃い服・背景の影" },
	{ id: "dot-50", name: "網点 50%", description: "50%グレーの市松網点" },
	{ id: "dot-60", name: "網点 60%", description: "濃色・暗がり" },
	{ id: "line-45", name: "斜線 (ハッチング)", description: "45度の均一な斜線" },
	{ id: "cross", name: "カケアミ (クロス)", description: "交差する網目トーン" },
	{ id: "sand", name: "砂目 (ノイズ)", description: "ざらざらした質感・砂嵐" },
];

const patternCache = new Map<string, HTMLCanvasElement>();

/**
 * トーンの繰り返しパターン用オフスクリーン Canvas を生成する
 */
export function getToneCanvas(type: ToneType, color = "#000000"): HTMLCanvasElement {
	const key = `${type}::${color}`;
	const cached = patternCache.get(key);
	if (cached) return cached;

	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;

	switch (type) {
		case "dot-10":
		case "dot-20":
		case "dot-30":
		case "dot-40":
		case "dot-50":
		case "dot-60": {
			// 8x8 グリッドでの網点
			const size = 8;
			canvas.width = size;
			canvas.height = size;
			ctx.clearRect(0, 0, size, size);
			ctx.fillStyle = color;

			// 半径を濃度に応じて計算
			const percentageMap: Record<string, number> = {
				"dot-10": 0.1,
				"dot-20": 0.2,
				"dot-30": 0.3,
				"dot-40": 0.4,
				"dot-50": 0.5,
				"dot-60": 0.6,
			};
			const ratio = percentageMap[type] ?? 0.2;
			const radius = Math.sqrt((ratio * (size * size)) / Math.PI);

			const drawDot = (cx: number, cy: number, r: number) => {
				ctx.beginPath();
				ctx.arc(cx, cy, Math.max(0.7, r), 0, Math.PI * 2);
				ctx.fill();
			};

			const halfRadius = radius * 0.72;
			drawDot(size / 2, size / 2, halfRadius);
			drawDot(0, 0, halfRadius);
			drawDot(size, 0, halfRadius);
			drawDot(0, size, halfRadius);
			drawDot(size, size, halfRadius);
			break;
		}

		case "line-45": {
			const size = 8;
			canvas.width = size;
			canvas.height = size;
			ctx.clearRect(0, 0, size, size);
			ctx.strokeStyle = color;
			ctx.lineWidth = 1.2;
			ctx.beginPath();
			ctx.moveTo(-1, size + 1);
			ctx.lineTo(size + 1, -1);
			ctx.moveTo(-1, 1);
			ctx.lineTo(1, -1);
			ctx.moveTo(size - 1, size + 1);
			ctx.lineTo(size + 1, size - 1);
			ctx.stroke();
			break;
		}

		case "cross": {
			const size = 8;
			canvas.width = size;
			canvas.height = size;
			ctx.clearRect(0, 0, size, size);
			ctx.strokeStyle = color;
			ctx.lineWidth = 1.0;
			ctx.beginPath();
			ctx.moveTo(-1, size + 1);
			ctx.lineTo(size + 1, -1);
			ctx.moveTo(-1, 1);
			ctx.lineTo(1, -1);
			ctx.moveTo(size - 1, size + 1);
			ctx.lineTo(size + 1, size - 1);
			ctx.moveTo(-1, -1);
			ctx.lineTo(size + 1, size + 1);
			ctx.moveTo(size - 1, -1);
			ctx.lineTo(size + 1, 1);
			ctx.moveTo(-1, size - 1);
			ctx.lineTo(1, size + 1);
			ctx.stroke();
			break;
		}

		case "sand": {
			const size = 16;
			canvas.width = size;
			canvas.height = size;
			ctx.clearRect(0, 0, size, size);
			ctx.fillStyle = color;
			const dotCount = Math.floor(size * size * 0.25);
			for (let i = 0; i < dotCount; i++) {
				const x = (i * 7 + (i % 3) * 5) % size;
				const y = (i * 11 + Math.floor(i / 3) * 3) % size;
				ctx.fillRect(x, y, 1, 1);
			}
			break;
		}
	}

	patternCache.set(key, canvas);
	return canvas;
}

/**
 * CanvasRenderingContext2D 用の CanvasPattern を作成する
 */
export function createTonePattern(
	ctx: CanvasRenderingContext2D,
	type: ToneType,
	color = "#000000",
): CanvasPattern | null {
	const pCanvas = getToneCanvas(type, color);
	return ctx.createPattern(pCanvas, "repeat");
}
