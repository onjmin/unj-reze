declare module "gifenc" {
	export interface QuantizeOptions {
		format?: string;
		oneBitAlpha?: boolean | number;
		clearAlpha?: boolean;
		clearAlphaThreshold?: number;
		clearAlphaColor?: number;
	}

	export interface WriteFrameOptions {
		palette?: number[][];
		delay?: number;
		transparent?: boolean;
		transparentIndex?: number;
		dispose?: number;
		repeat?: number;
	}

	export interface GIFEncoderInstance {
		writeFrame: (
			index: Uint8Array,
			width: number,
			height: number,
			opts?: WriteFrameOptions,
		) => void;
		finish: () => void;
		bytes: () => Uint8Array;
		bytesView: () => Uint8Array;
		reset: () => void;
	}

	export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GIFEncoderInstance;
	export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors?: number, opts?: QuantizeOptions): number[][];
	export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
	export function nearestColorIndex(palette: number[][], color: number[]): number;
}
