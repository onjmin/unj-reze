import type {
	MvModulator,
	MvShapeLayer,
	MvShapeMotionPreset,
} from "./mv-config";

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
		// 角度は「元の向きに経過ぶんを足す」。掛け算にすると元の向きが0の図形
		// （＝追加した直後の図形はすべてこれ）で 0×経過=0 になり、永久に回らない。
		build: () => [{ source: "spin", target: "rotation", op: "add", amount: 60 }],
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
		// 速さ(periodBeats)はプリセット自体には持たせず、resolveSceneModulatorsで
		// cfg.beatSyncSpeed から後付けする（既定1＝1拍ごと）。
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
			{ source: "spin", target: "rotation", op: "add", amount: 40 },
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
export type MvMotionCustomToggle = MvShapeMotionPreset["custom"];

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
		mods.push({ source: "spin", target: "rotation", op: "add", amount: c.rotateSpeed });
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
export type MvSceneMotionConfig = MvShapeMotionPreset;

export const DEFAULT_SCENE_MOTION: MvSceneMotionConfig = {
	// 何も選ばず開いたときに図形が完全に静止しているとアニメーション機能に
	// 気づきにくいので、既定はビート同期（拍ごとに脈動）にしておく。
	presetId: "beatSync",
	beatSyncSpeed: 1,
	custom: DEFAULT_MOTION_CUSTOM,
};

/** ビート同期の速さの選択肢。数値は「1周期が何拍分か」＝小さいほど速い。 */
export const MV_BEAT_SYNC_SPEED_OPTIONS: { value: number; label: string }[] = [
	{ value: 4, label: "1/4倍速（4拍で1周期）" },
	{ value: 2, label: "1/2倍速（2拍で1周期）" },
	{ value: 1, label: "標準（1拍ごと）" },
	{ value: 0.5, label: "2倍速（半拍ごと）" },
	{ value: 0.25, label: "4倍速（1/4拍ごと）" },
];

export function resolveSceneModulators(
	cfg: MvSceneMotionConfig,
	bars: number,
): MvModulator[] {
	const preset = findMvMotionPreset(cfg.presetId);
	const base = preset ? preset.build(bars) : [];
	// beatSyncのときだけ、source==='beat'の周期を選んだ速さへ差し替える。
	const withSpeed =
		cfg.presetId === "beatSync" && cfg.beatSyncSpeed && cfg.beatSyncSpeed !== 1
			? base.map((m) =>
					m.source === "beat" ? { ...m, periodBeats: cfg.beatSyncSpeed } : m,
				)
			: base;
	return [...withSpeed, ...buildCustomModulators(cfg.custom)];
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
