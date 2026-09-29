import type * as oekaki from "@onjmin/oekaki";

export type FlipAxis = "horizontal" | "vertical";

/** RGBA の画素列を左右（または上下）に反転した新しい配列を返す */
export function flipPixels(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	axis: FlipAxis,
): Uint8ClampedArray<ArrayBuffer> {
	const dst = new Uint8ClampedArray(src.length);
	const src32 = new Uint32Array(src.buffer, src.byteOffset, width * height);
	const dst32 = new Uint32Array(dst.buffer, 0, width * height);
	for (let y = 0; y < height; y++) {
		const row = y * width;
		if (axis === "horizontal") {
			for (let x = 0; x < width; x++) {
				dst32[row + x] = src32[row + width - 1 - x];
			}
		} else {
			dst32.set(
				src32.subarray((height - 1 - y) * width, (height - y) * width),
				row,
			);
		}
	}
	return dst;
}

/**
 * レイヤーの描画内容そのものを反転し、履歴に積む（見た目だけの `oekaki.flipped` とは別物）。
 * `respectLock` が false のときは非表示・ロック中のレイヤーも反転する——
 * キャンバス全体の反転で一部のレイヤーだけ取り残されると絵がずれるため。
 */
export function flipLayers(
	layers: oekaki.LayeredCanvas[],
	axis: FlipAxis,
	{ respectLock }: { respectLock: boolean },
) {
	for (const layer of layers) {
		if (respectLock && !layer.editable) continue;
		const width = layer.canvas.width;
		const src = layer.data;
		layer.data = flipPixels(src, width, src.length / 4 / width, axis);
		layer.modified();
		layer.trace();
	}
}
