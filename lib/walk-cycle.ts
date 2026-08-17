export type Way = {
	key: string;
	label: string;
};

export const way = {
	w: { key: "w", label: "後" },
	a: { key: "a", label: "左" },
	s: { key: "s", label: "前" },
	d: { key: "d", label: "右" },
	q: { key: "q", label: "左後" },
	e: { key: "e", label: "右後" },
	z: { key: "z", label: "左前" },
	c: { key: "c", label: "右前" },
} as const;

export interface WalkPreset {
	label: string;
	w: number;
	h: number;
	frames: number;
	ways: Way[];
}

export const presets: WalkPreset[] = [
	{
		label: "RPGEN",
		w: 16,
		h: 16,
		frames: 2,
		ways: [way.w, way.d, way.s, way.a],
	},
	{
		label: "RPGツクール2000",
		w: 24,
		h: 32,
		frames: 3,
		ways: [way.w, way.d, way.s, way.a],
	},
	{
		label: "RPGツクールXP",
		w: 32,
		h: 48,
		frames: 4,
		ways: [way.s, way.a, way.d, way.w],
	},
	{
		label: "RPGツクールVX",
		w: 32,
		h: 32,
		frames: 3,
		ways: [way.s, way.a, way.d, way.w],
	},
	{
		label: "RPGツクールMV",
		w: 48,
		h: 48,
		frames: 3,
		ways: [way.s, way.a, way.d, way.w],
	},
];

export const toI = (x: number, y: number, frames: number) => x + y * frames;
export const toXY = (i: number, frames: number): [number, number] => [
	i % frames,
	Math.floor(i / frames),
];

/** ラベル(WalkPreset.label)から方向数(行数)を引く。表示側のSpriteImageが使う。 */
export function walkPresetRows(label: string | undefined): number {
	if (!label) return 1;
	return presets.find((p) => p.label === label)?.ways.length ?? 1;
}

export function detectPreset(imgW: number, imgH: number): WalkPreset | null {
	for (const p of presets) {
		if (imgW === p.w * p.frames && imgH === p.h * p.ways.length) return p;
	}
	return null;
}
