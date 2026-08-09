import type { MvModulator, MvShapeLayer } from "./mv-config";

/**
 * 「図形の動き方」設定モーダル用のプリセット。エフェクトテンプレート(mv-effect-templates.ts)
 * とは別物——こちらは**既存1個の図形の modulators だけ**を組み立てる。新しいレイヤーを
 * 増やさず、場面ごとに動き方だけ変えたいときに使う。
 */
export interface MvMotionPreset {
	id: string;
	name: string;
	/** グリッドに置くミニアイコン用のSVGパス（0..24の正方形で設計）。 */
	icon: string;
	build: (bars: number) => MvModulator[];
}

export const MV_MOTION_PRESETS: MvMotionPreset[] = [
	{
		id: "static",
		name: "静止",
		icon: "M6,6 L18,6 L18,18 L6,18 Z",
		build: () => [],
	},
	{
		id: "rotateOnly",
		name: "回転のみ",
		icon: "M12,3 A9,9 0 1 1 3,12 M3,12 L3,6 M3,12 L9,12",
		build: () => [{ source: "spin", target: "rotation", op: "mul", amount: 60 }],
	},
	{
		id: "moveX",
		name: "横移動",
		icon: "M3,12 L21,12 M16,7 L21,12 L16,17 M8,7 L3,12 L8,17",
		build: (bars) => [
			{
				source: "phrase",
				bars,
				symmetric: true,
				curve: 1,
				target: "x",
				op: "add",
				amount: 40,
			},
		],
	},
	{
		id: "moveY",
		name: "縦移動",
		icon: "M12,3 L12,21 M7,8 L12,3 L17,8 M7,16 L12,21 L17,16",
		build: (bars) => [
			{
				source: "phrase",
				bars,
				symmetric: true,
				curve: 1,
				target: "y",
				op: "add",
				amount: 24,
			},
		],
	},
	{
		id: "beatSync",
		name: "ビート同期",
		icon: "M4,12 L8,12 L10,4 L14,20 L16,12 L20,12",
		build: () => [{ source: "beat", target: "size", op: "add", amount: 10 }],
	},
	{
		id: "scaleMove",
		name: "拡大縮小と移動",
		icon: "M4,4 L10,4 L10,10 L4,10 Z M14,14 L20,14 L20,20 L14,20 Z",
		build: (bars) => [
			{
				source: "phrase",
				bars,
				symmetric: true,
				curve: 2,
				target: "size",
				op: "add",
				amount: 14,
			},
			{
				source: "phrase",
				bars,
				symmetric: true,
				curve: 1,
				target: "x",
				op: "add",
				amount: 20,
			},
		],
	},
	{
		id: "rotateScale",
		name: "回転＋拡大縮小",
		icon: "M12,4 A8,8 0 1 1 4,12 M12,12 L12,7 M12,12 L16,12",
		build: (bars) => [
			{ source: "spin", target: "rotation", op: "mul", amount: 40 },
			{
				source: "phrase",
				bars,
				symmetric: true,
				curve: 2,
				target: "size",
				op: "add",
				amount: 10,
			},
		],
	},
	{
		id: "random",
		name: "ランダム",
		icon: "M5,5 L19,19 M19,5 L5,19 M12,4 L12,7 M12,17 L12,20",
		build: (bars) => {
			const pool = MV_MOTION_PRESETS.filter(
				(p) => p.id !== "random" && p.id !== "static",
			);
			const pick = pool[Math.floor(Math.random() * pool.length)];
			return pick ? pick.build(bars) : [];
		},
	},
];

export function findMvMotionPreset(id: string): MvMotionPreset | undefined {
	return MV_MOTION_PRESETS.find((p) => p.id === id);
}

/** 「独自の動きを組み合わせる」パネルのチェック状態。 */
export interface MvMotionCustomToggle {
	move: boolean;
	moveSpeedBars: number;
	rotate: boolean;
	rotateSpeed: number;
	scale: boolean;
	scaleSpeedBars: number;
}

export const DEFAULT_MOTION_CUSTOM: MvMotionCustomToggle = {
	move: false,
	moveSpeedBars: 2,
	rotate: false,
	rotateSpeed: 40,
	scale: false,
	scaleSpeedBars: 2,
};

export function buildCustomModulators(c: MvMotionCustomToggle): MvModulator[] {
	const mods: MvModulator[] = [];
	if (c.move) {
		mods.push({
			source: "phrase",
			bars: c.moveSpeedBars,
			symmetric: true,
			curve: 1,
			target: "x",
			op: "add",
			amount: 30,
		});
	}
	if (c.rotate) {
		mods.push({ source: "spin", target: "rotation", op: "mul", amount: c.rotateSpeed });
	}
	if (c.scale) {
		mods.push({
			source: "phrase",
			bars: c.scaleSpeedBars,
			symmetric: true,
			curve: 2,
			target: "size",
			op: "add",
			amount: 10,
		});
	}
	return mods;
}

/** 1つの場面(小節範囲)に対する動きの設定一式。 */
export interface MvSceneMotionConfig {
	presetId: string;
	custom: MvMotionCustomToggle;
}

export const DEFAULT_SCENE_MOTION: MvSceneMotionConfig = {
	presetId: "static",
	custom: DEFAULT_MOTION_CUSTOM,
};

export function resolveSceneModulators(
	cfg: MvSceneMotionConfig,
	bars: number,
): MvModulator[] {
	const preset = findMvMotionPreset(cfg.presetId);
	return [...(preset ? preset.build(bars) : []), ...buildCustomModulators(cfg.custom)];
}

/**
 * ベースの図形レイヤーと「場面id→動き設定」から、場面ごとのレイヤー一式を作る。
 * 同じ見た目(form/x/y/size/色など)を複製し、modulatorsとsectionsだけ場面ごとに変える。
 * idは `${baseId}__motion__${sceneId}` で統一し、呼び出し側はこのプレフィックスを持つ
 * レイヤーを丸ごと入れ替えれば再適用できる。
 */
export function buildMotionLayers(
	base: MvShapeLayer,
	perScene: Record<string, MvSceneMotionConfig>,
	sceneBarsMap: Record<string, number>,
): MvShapeLayer[] {
	const groupPrefix = `${base.id}__motion__`;
	return Object.entries(perScene).map(([sceneId, cfg]) => ({
		...base,
		id: `${groupPrefix}${sceneId}`,
		sections: [sceneId],
		modulators: resolveSceneModulators(cfg, sceneBarsMap[sceneId] ?? 4),
	}));
}

export function motionGroupPrefix(baseId: string): string {
	return `${baseId}__motion__`;
}
