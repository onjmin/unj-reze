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

/** ラベル(WalkPreset.label)から方向配列(行順)を引く。方向転換ボタンの表示側が使う。 */
export function walkPresetWays(label: string | undefined): Way[] | null {
	if (!label) return null;
	return presets.find((p) => p.label === label)?.ways ?? null;
}

/**
 * `WalkPreset.label`(この投稿編集UIの規格名。例:"RPGEN") →
 * `lib/walk-sprite.ts` の `WalkStandard.id`(GameMakerアセット系の規格ID。例:"rpgen")。
 *
 * 両モジュールは同じ5規格(RPGEN/ツクール2000/XP/VX/MV)を別々に定義しており、
 * w/h/frames/ways の並びが完全一致することを前提にラベル文字列で対応づける
 * （walk-sprite.ts側にはRPGツクールという接頭辞が無く、ラベル文字列そのものは違う）。
 * SMC/ROW_ANIM はDotDrawingEditorの歩行グラ編集に無い規格なので対応が無い。
 * 一致しなければ undefined（呼び出し側は "auto" 等にフォールバックすること）。
 */
const PRESET_LABEL_TO_STD_ID: Record<string, string> = {
	RPGEN: "rpgen",
	RPGツクール2000: "rm2k",
	RPGツクールXP: "rmxp",
	RPGツクールVX: "rmvx",
	RPGツクールMV: "rmmv",
};

export function walkPresetToStdId(
	label: string | undefined,
): string | undefined {
	if (!label) return undefined;
	return PRESET_LABEL_TO_STD_ID[label];
}

/** 既知の規格ラベルか（サーバー側でクライアント由来の生文字列をそのまま保存しないための検証） */
export function isValidWalkPreset(label: unknown): label is string {
	return typeof label === "string" && presets.some((p) => p.label === label);
}

/** 未知のラベルを混入させない（クライアント由来の生文字列をそのままDBへ入れない） */
export function sanitizeWalkPreset(label: unknown): string | undefined {
	return isValidWalkPreset(label) ? label : undefined;
}

export function detectPreset(imgW: number, imgH: number): WalkPreset | null {
	for (const p of presets) {
		if (imgW === p.w * p.frames && imgH === p.h * p.ways.length) return p;
	}
	return null;
}
