import { GIFEncoder, quantize, applyPalette } from "gifenc";
import JSZip from "jszip";

/* ------------------------------------------------------------------
   ダウンロードヘルパー
------------------------------------------------------------------ */
export const downloadBlob = (blob: Blob, fileName: string) => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadDataUrl = (dataUrl: string, fileName: string) => {
	const link = document.createElement("a");
	link.href = dataUrl;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};

/* ------------------------------------------------------------------
   キャンバスリサイズ（ドット絵用・アンチエイリアス無効化）
------------------------------------------------------------------ */
export const resizeCanvas = (
	source: HTMLCanvasElement,
	targetWidth: number,
	targetHeight: number,
): HTMLCanvasElement => {
	const canvas = document.createElement("canvas");
	canvas.width = targetWidth;
	canvas.height = targetHeight;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return canvas;
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(
		source,
		0,
		0,
		source.width,
		source.height,
		0,
		0,
		targetWidth,
		targetHeight,
	);
	return canvas;
};

/* ------------------------------------------------------------------
   1枚絵 PNG エクスポート
------------------------------------------------------------------ */
export const exportSinglePng = (
	canvas: HTMLCanvasElement,
	targetWidth?: number,
	targetHeight?: number,
	fileName = "drawing.png",
) => {
	if (
		targetWidth &&
		targetHeight &&
		(targetWidth !== canvas.width || targetHeight !== canvas.height)
	) {
		const resized = resizeCanvas(canvas, targetWidth, targetHeight);
		downloadDataUrl(resized.toDataURL("image/png"), fileName);
	} else {
		downloadDataUrl(canvas.toDataURL("image/png"), fileName);
	}
};

/* ------------------------------------------------------------------
   スプライトシート (PNG) エクスポート
   - アニメ: frames (列数) × 1 (行数) または 指定行数列数
   - 歩行グラ: frames (列数) × ways (行数)
------------------------------------------------------------------ */
export interface SpriteSheetGrid {
	columns: number;
	rows: number;
	cellWidth: number;
	cellHeight: number;
	frames: (HTMLCanvasElement | null)[];
}

export const generateSpriteSheetCanvas = ({
	columns,
	rows,
	cellWidth,
	cellHeight,
	frames,
}: SpriteSheetGrid): HTMLCanvasElement => {
	const joinedCanvas = document.createElement("canvas");
	joinedCanvas.width = cellWidth * columns;
	joinedCanvas.height = cellHeight * rows;
	const ctx = joinedCanvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return joinedCanvas;

	ctx.imageSmoothingEnabled = false;

	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < columns; x++) {
			const index = y * columns + x;
			const sourceCanvas = frames[index];
			if (!sourceCanvas) continue;

			ctx.drawImage(
				sourceCanvas,
				0,
				0,
				sourceCanvas.width,
				sourceCanvas.height,
				x * cellWidth,
				y * cellHeight,
				cellWidth,
				cellHeight,
			);
		}
	}

	return joinedCanvas;
};

export const exportSpriteSheet = (
	grid: SpriteSheetGrid,
	fileName = "sprite_sheet.png",
) => {
	const canvas = generateSpriteSheetCanvas(grid);
	downloadDataUrl(canvas.toDataURL("image/png"), fileName);
};

/* ------------------------------------------------------------------
   GIF アニメーション エクスポート (gifenc)
------------------------------------------------------------------ */
export interface GifExportOptions {
	frames: HTMLCanvasElement[];
	width: number;
	height: number;
	fps: number;
	fileName?: string;
	transparent?: boolean;
	backgroundColor?: string;
}

export const exportGif = async ({
	frames,
	width,
	height,
	fps,
	fileName = "animation.gif",
	transparent = true,
	backgroundColor,
}: GifExportOptions): Promise<Blob> => {
	const gif = GIFEncoder();
	const delay = Math.max(1, Math.round(1000 / Math.max(1, fps)));

	const tempCanvas = document.createElement("canvas");
	tempCanvas.width = width;
	tempCanvas.height = height;
	const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
	if (!tempCtx) throw new Error("Could not create canvas 2d context");
	tempCtx.imageSmoothingEnabled = false;

	for (const source of frames) {
		tempCtx.clearRect(0, 0, width, height);

		if (backgroundColor && !transparent) {
			tempCtx.fillStyle = backgroundColor;
			tempCtx.fillRect(0, 0, width, height);
		}

		tempCtx.drawImage(
			source,
			0,
			0,
			source.width,
			source.height,
			0,
			0,
			width,
			height,
		);

		const imgData = tempCtx.getImageData(0, 0, width, height);
		const rgba = imgData.data;

		// 透過対応パレット量子化
		let transparentIndex = -1;
		if (transparent) {
			let hasTransparent = false;
			for (let i = 3; i < rgba.length; i += 4) {
				if (rgba[i] < 128) {
					hasTransparent = true;
					rgba[i] = 0; // 完全透明に正規化
				} else {
					rgba[i] = 255;
				}
			}
			const palette = quantize(rgba, 256);
			if (hasTransparent) {
				const index = applyPalette(rgba, palette);
				for (let i = 0; i < palette.length; i++) {
					const [r, g, b] = palette[i];
					for (let p = 0; p < rgba.length; p += 4) {
						if (rgba[p + 3] === 0 && rgba[p] === r && rgba[p + 1] === g && rgba[p + 2] === b) {
							transparentIndex = i;
							break;
						}
					}
					if (transparentIndex >= 0) break;
				}
				if (transparentIndex < 0) {
					transparentIndex = 0;
				}
				gif.writeFrame(index, width, height, {
					palette,
					delay,
					transparent: true,
					transparentIndex,
				});
			} else {
				const index = applyPalette(rgba, palette);
				gif.writeFrame(index, width, height, { palette, delay });
			}
		} else {
			const palette = quantize(rgba, 256);
			const index = applyPalette(rgba, palette);
			gif.writeFrame(index, width, height, { palette, delay });
		}
	}

	gif.finish();
	const bytes = gif.bytes();
	const blob = new Blob([bytes as BlobPart], { type: "image/gif" });
	downloadBlob(blob, fileName);
	return blob;
};

/* ------------------------------------------------------------------
   個別フレーム (ZIP) エクスポート
------------------------------------------------------------------ */
export interface ZipExportOptions {
	frames: { name: string; canvas: HTMLCanvasElement }[];
	width?: number;
	height?: number;
	fileName?: string;
}

export const exportFramesZip = async ({
	frames,
	width,
	height,
	fileName = "frames.zip",
}: ZipExportOptions): Promise<Blob> => {
	const zip = new JSZip();

	for (const { name, canvas } of frames) {
		const targetCanvas =
			width && height && (canvas.width !== width || canvas.height !== height)
				? resizeCanvas(canvas, width, height)
				: canvas;

		const dataUrl = targetCanvas.toDataURL("image/png");
		const base64 = dataUrl.split(",")[1];
		zip.file(name, base64, { base64: true });
	}

	const blob = await zip.generateAsync({ type: "blob" });
	downloadBlob(blob, fileName);
	return blob;
};

/* ------------------------------------------------------------------
   Windows Animated Cursor (.ani) ZIP エクスポート (rpgen-walk 準拠)
------------------------------------------------------------------ */
const strToBytes = (s: string): Uint8Array =>
	Uint8Array.from(s, (c) => c.charCodeAt(0));

const createCur = (
	png: Uint8Array,
	w: number,
	h: number,
	hotspotX = 0,
	hotspotY = 0,
): Uint8Array => {
	const headerSize = 6 + 16;
	const buf = new ArrayBuffer(headerSize + png.length);
	const dv = new DataView(buf);
	let off = 0;

	dv.setUint16(off, 0, true);
	off += 2; // Reserved
	dv.setUint16(off, 2, true);
	off += 2; // Type: 2 = Cursor
	dv.setUint16(off, 1, true);
	off += 2; // Count

	dv.setUint8(off++, w === 256 ? 0 : w);
	dv.setUint8(off++, h === 256 ? 0 : h);
	dv.setUint8(off++, 0); // Color count
	dv.setUint8(off++, 0); // Reserved
	dv.setUint16(off, hotspotX, true);
	off += 2;
	dv.setUint16(off, hotspotY, true);
	off += 2;
	dv.setUint32(off, png.length, true);
	off += 4;
	dv.setUint32(off, headerSize, true); // Offset

	new Uint8Array(buf, headerSize).set(png);
	return new Uint8Array(buf);
};

const makeListChunk = (listId: string, parts: Uint8Array[]): Uint8Array => {
	const bodySize = 4 + parts.reduce((s, p) => s + p.length, 0);
	const chunk = new Uint8Array(8 + bodySize);
	chunk.set(strToBytes("LIST"), 0);
	new DataView(chunk.buffer).setUint32(4, bodySize, true);
	chunk.set(strToBytes(listId), 8);
	let pos = 12;
	for (const p of parts) {
		chunk.set(p, pos);
		pos += p.length;
	}
	return chunk;
};

const buildAni = (cursors: Uint8Array[], fps = 8): Uint8Array => {
	const n = cursors.length;
	const jif = Math.max(1, Math.round(60 / Math.max(1, fps)));

	const anih = new ArrayBuffer(36);
	const av = new DataView(anih);
	av.setUint32(0, 36, true);
	av.setUint32(4, n, true); // cFrames
	av.setUint32(8, n, true); // cSteps
	av.setUint32(24, jif, true); // JifRate
	av.setUint32(32, 1, true); // flags: 1 = ANI_HEADER_FLAG

	const rate = new Uint32Array(n).fill(jif);
	const seq = Uint32Array.from({ length: n }, (_, i) => i);

	const makeChunk = (
		id: string,
		data: ArrayBuffer | Uint8Array,
	): Uint8Array => {
		const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
		const pad = payload.length & 1 ? 1 : 0;
		const chunk = new Uint8Array(8 + payload.length + pad);
		chunk.set(strToBytes(id), 0);
		new DataView(chunk.buffer).setUint32(4, payload.length, true);
		chunk.set(payload, 8);
		return chunk;
	};

	const iconChunks = cursors.map((c) => makeChunk("icon", c));
	const framList = makeListChunk("fram", iconChunks);

	const chunks = [
		makeChunk("anih", anih),
		makeChunk("rate", rate.buffer),
		makeChunk("seq ", seq.buffer),
		framList,
	];

	const size = chunks.reduce((s, c) => s + c.length, 4);
	const riff = new Uint8Array(8 + size);
	riff.set(strToBytes("RIFF"), 0);
	new DataView(riff.buffer).setUint32(4, size, true);
	riff.set(strToBytes("ACON"), 8);

	let pos = 12;
	for (const c of chunks) {
		riff.set(c, pos);
		pos += c.length;
	}

	return riff;
};

export interface WalkAniExportOptions {
	ways: { label: string; key: string }[];
	frames: number;
	width: number;
	height: number;
	fps?: number;
	getFrameCanvas: (wayIndex: number, frameIndex: number) => HTMLCanvasElement | null;
	fileName?: string;
}

export const exportWalkAsAniZip = async ({
	ways,
	frames,
	width,
	height,
	fps = 8,
	getFrameCanvas,
	fileName = "cursors.zip",
}: WalkAniExportOptions): Promise<Blob> => {
	const zip = new JSZip();

	for (let y = 0; y < ways.length; y++) {
		const cursors: Uint8Array[] = [];
		const wayInfo = ways[y];

		for (let x = 0; x < frames; x++) {
			const source = getFrameCanvas(y, x);
			if (!source) continue;

			const resized = resizeCanvas(source, width, height);
			const dataUrl = resized.toDataURL("image/png");
			const base64 = dataUrl.split(",")[1];
			const png = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

			cursors.push(createCur(png, width, height));
		}

		if (cursors.length > 0) {
			const ani = buildAni(cursors, fps);
			const wayLabel = wayInfo?.label ? `_${wayInfo.label}` : "";
			zip.file(`cursor_${y + 1}${wayLabel}.ani`, ani);
		}
	}

	const blob = await zip.generateAsync({ type: "blob" });
	downloadBlob(blob, fileName);
	return blob;
};
