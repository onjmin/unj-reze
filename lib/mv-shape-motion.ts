import type { MvModulator, MvShapeMotionPreset } from "./mv-config";

/**
 * 「図形の動き方」設定モーダル用のプリセット。エフェクトテンプレート(mv-effect-templates.ts)
 * とは別物——こちらは**既存1個の図形の modulators だけ**を組み立てる。
 *
 * すべて `source: "beat"` の拍周期の動きだけにしてある（以前あった「回転しっぱなし」
 * 「往復移動」のような拍と無関係な動きは削除した）。曲のテンポと絶対に合う・
 * 音ゲー的な「拍ごとに何かが起きる」動きだけに絞り、その分だけ効かせ方の種類を増やす方針。
 * 周期の速さは全プリセット共通の `beatSyncSpeed`（モーダルの速さ選択）で変える。
 */
export interface MvMotionPreset {
	id: string;
	name: string;
	/** グリッドの見出し分け。 */
	category: MvMotionCategory;
	/** グリッドに置くミニアイコン用のSVGパス（0..24の正方形で設計）。 */
	icon: string;
	build: () => MvModulator[];
}

export type MvMotionCategory = "size" | "opacity" | "bounce" | "rotate" | "combo";

export const MV_MOTION_CATEGORY_LABELS: Record<MvMotionCategory, string> = {
	size: "大きさ・太さ",
	opacity: "現れる・消える",
	bounce: "はねる",
	rotate: "回転",
	combo: "複合",
};

export const MV_MOTION_PRESETS: MvMotionPreset[] = [
	{
		id: "beatSync",
		name: "拍ごとに脈動（大きさ）",
		category: "size",
		icon: "M4,12 A8,8 0 1,1 20,12 A8,8 0 1,1 4,12 M9,12 A3,3 0 1,1 15,12 A3,3 0 1,1 9,12",
		build: () => [{ source: "beat", target: "size", op: "add", amount: 10 }],
	},
	{
		id: "beatPunch",
		name: "拍ごとに一瞬ポップ（強め）",
		category: "size",
		icon: "M12,2 L12,7 M12,17 L12,22 M2,12 L7,12 M17,12 L22,12 M5.6,5.6 L8.4,8.4 M15.6,15.6 L18.4,18.4 M5.6,18.4 L8.4,15.6 M15.6,8.4 L18.4,5.6",
		// curveを高くすると「頭で一気に効いてすぐ収まる」効きになる。beatSyncより鋭い。
		build: () => [
			{ source: "beat", target: "size", op: "add", amount: 22, curve: 5 },
		],
	},
	{
		id: "beatThicken",
		name: "拍ごとに輪郭が太くなる",
		category: "size",
		icon: "M12,3 A9,9 0 1,1 3,12 A9,9 0 1,1 12,3 M12,7 A5,5 0 1,1 7,12 A5,5 0 1,1 12,7",
		build: () => [
			{ source: "beat", target: "thickness", op: "add", amount: 4, curve: 3 },
		],
	},
	{
		id: "beatFade",
		name: "拍ごとにフェード（現れて消える）",
		category: "opacity",
		icon: "M4,12 A8,8 0 1,1 20,12",
		// 濃さの基準値は1なので op:'mul' で 0..1 の範囲に収まる（足し算だと上限を超えて破綻する）。
		build: () => [
			{ source: "beat", target: "opacity", op: "mul", amount: 1, curve: 1.4 },
		],
	},
	{
		id: "beatFlicker",
		name: "拍ごとに明滅（強め・ストロボ風）",
		category: "opacity",
		icon: "M13,2 L6,13 L11,13 L9,22 L18,10 L13,10 Z",
		build: () => [
			{ source: "beat", target: "opacity", op: "mul", amount: 1, curve: 7 },
		],
	},
	{
		id: "beatSpinKick",
		name: "拍ごとに回転がはねる（90度）",
		category: "rotate",
		icon: "M12,3 A9,9 0 1 1 3,12 M3,12 L3,6 M3,12 L9,12",
		build: () => [
			{ source: "beat", target: "rotation", op: "add", amount: 90, curve: 3 },
		],
	},
	{
		id: "beatSpinKick180",
		name: "拍ごとに回転がはねる（180度）",
		category: "rotate",
		icon: "M12,3 A9,9 0 1 1 3,12 M3,12 L3,6 M3,12 L9,12",
		build: () => [
			{ source: "beat", target: "rotation", op: "add", amount: 180, curve: 3 },
		],
	},
	{
		id: "beatSpinKick360",
		name: "拍ごとに回転がはねる（360度）",
		category: "rotate",
		icon: "M12,3 A9,9 0 1 1 3,12 M3,12 L3,6 M3,12 L9,12",
		build: () => [
			{ source: "beat", target: "rotation", op: "add", amount: 360, curve: 3 },
		],
	},
	{
		id: "beatBounceX",
		name: "拍ごとに横へ弾む",
		category: "bounce",
		icon: "M3,12 L21,12 M16,7 L21,12 L16,17 M8,7 L3,12 L8,17",
		build: () => [
			{ source: "beat", target: "x", op: "add", amount: 26, curve: 3 },
		],
	},
	{
		id: "beatBounceY",
		name: "拍ごとに縦へ弾む（バウンド）",
		category: "bounce",
		icon: "M12,3 L12,21 M7,8 L12,3 L17,8 M7,16 L12,21 L17,16",
		// 上下反転：叩かれて上へ跳ねてから重力で戻る、というボールのバウンドに寄せる。
		build: () => [
			{ source: "beat", target: "y", op: "add", amount: -26, curve: 3 },
		],
	},
	{
		id: "beatCountPulse",
		name: "拍ごとに個数が増減（複数表示のときだけ効果あり）",
		category: "bounce",
		icon: "M6,12 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0 M11,12 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0 M16,12 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0",
		build: () => [
			{ source: "beat", target: "count", op: "add", amount: 2, curve: 2 },
		],
	},
	{
		id: "beatPunch2",
		name: "拍ごとに2回ポップ（タッタッ）",
		category: "combo",
		icon: "M6,12 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0 M11,12 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0 M16,12 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0",
		build: () => [
			{ source: "beat", target: "count", op: "add", amount: 2, curve: 2 },
		],
	},
	{
		id: "beatBurst",
		name: "拍ごとに膨らんで消える（バースト）",
		category: "combo",
		icon: "M12,12 L12,4 M12,12 L12,20 M12,12 L4,12 M12,12 L20,12 M12,12 L6.3,6.3 M12,12 L17.7,17.7 M12,12 L6.3,17.7 M12,12 L17.7,6.3",
		build: () => [
			{ source: "beat", target: "size", op: "add", amount: 20, curve: 2.4 },
			{ source: "beat", target: "opacity", op: "mul", amount: 1, curve: 1.6 },
		],
	},
	{
		id: "beatSpinFade",
		name: "拍ごとに回転しながら明滅",
		category: "combo",
		icon: "M12,3 A9,9 0 1 1 3,12 M3,12 L3,6 M3,12 L9,12 M15,15 L19,19 M19,15 L15,19",
		build: () => [
			{ source: "beat", target: "rotation", op: "add", amount: 40, curve: 2.5 },
			{ source: "beat", target: "opacity", op: "mul", amount: 0.85, curve: 2 },
		],
	},
];

/**
 * 廃止したプリセットIDを近い新プリセットへ読み替える。
 *
 * 「独自の動きを組み合わせる」廃止に合わせて、拍と無関係だった旧プリセット
 * （回転しっぱなし・往復移動・ランダム等）も削除した。過去に作られたMVがこれらの
 * presetIdを保存済みなので、読み込んだ瞬間に動きが消えて見えないよう、近い新プリセットへ
 * 丸め込む。
 */
const LEGACY_PRESET_ALIAS: Record<string, string> = {
	rotateOnly: "beatSpinKick",
	moveX: "beatBounceX",
	moveY: "beatBounceY",
	scaleMove: "beatPunch",
	rotateScale: "beatSpinFade",
	random: "beatBurst",
};

export function findMvMotionPreset(id: string): MvMotionPreset | undefined {
	const direct = MV_MOTION_PRESETS.find((p) => p.id === id);
	if (direct) return direct;
	const alias = LEGACY_PRESET_ALIAS[id];
	return alias ? MV_MOTION_PRESETS.find((p) => p.id === alias) : undefined;
}

/**
 * @deprecated 「独自の動きを組み合わせる」パネル（拍と無関係な自由な移動/回転/拡縮）は
 * 廃止した。この関数は過去に保存された `MvShapeMotionPreset.custom` を読むためだけに残してある
 * （resolveSceneModulators が呼ぶ。新規のUIからはもう作られない）。
 */
export type MvMotionCustomToggle = NonNullable<MvShapeMotionPreset["custom"]>;

function buildLegacyCustomModulators(c: MvMotionCustomToggle): MvModulator[] {
	const mods: MvModulator[] = [];
	if (c.move) {
		mods.push({
			source: "phrase",
			target: "y",
			op: "add",
			amount: 50,
			bars: c.moveSpeedBars,
			symmetric: true,
			curve: 1.5,
		});
	}
	if (c.rotate) {
		mods.push({
			source: "phrase",
			target: "rotation",
			op: "add",
			amount: 360,
			bars: 8 / c.rotateSpeed,
		});
	}
	if (c.scale) {
		mods.push({
			source: "phrase",
			target: "size",
			op: "add",
			amount: 20,
			bars: c.scaleSpeedBars,
			symmetric: true,
			curve: 1.5,
		});
	}
	return mods;
}

/** 1つの図形に対する動きの設定一式（曲全体で1つ）。 */
export type MvSceneMotionConfig = MvShapeMotionPreset;

export const DEFAULT_SCENE_MOTION: MvSceneMotionConfig = {
	// 何も選ばず開いたときに図形が完全に静止しているとアニメーション機能に
	// 気づきにくいので、既定はビート同期（拍ごとに脈動）にしておく。
	presetId: "beatSync",
	beatSyncSpeed: 1,
};

/** 動きの周期の速さの選択肢。数値は「1周期が何拍分か」＝小さいほど速い。全プリセット共通。 */
export const MV_MOTION_SPEED_OPTIONS: { value: number; label: string }[] = [
	{ value: 4, label: "1/4倍速（4拍で1周期）" },
	{ value: 2, label: "1/2倍速（2拍で1周期）" },
	{ value: 1, label: "標準（1拍ごと）" },
	{ value: 0.5, label: "2倍速（半拍ごと）" },
	{ value: 0.25, label: "4倍速（1/4拍ごと）" },
];

export function resolveSceneModulators(cfg: MvSceneMotionConfig): MvModulator[] {
	const preset = findMvMotionPreset(cfg.presetId);
	const base = preset ? preset.build() : [];
	// 速さは全プリセット共通。source:'beat' の周期だけを選んだ速さへ差し替える
	// （プリセットによって size/opacity/rotation など対象は違っても、速さの概念は1つ）。
	const speed = cfg.beatSyncSpeed;
	const withSpeed =
		speed && speed !== 1
			? base.map((m) =>
					m.source === "beat" ? { ...m, periodBeats: speed } : m,
				)
			: base;
	// 裏拍：発火位置を半拍ぶんずらす。speedで周期を伸縮していても「半拍」は絶対量のまま
	// （既存の phaseOffset があれば足し込む——通常プリセットは未設定＝0なので影響しない）。
	const withOffbeat = cfg.offbeat
		? withSpeed.map((m) =>
				m.source === "beat"
					? { ...m, phaseOffset: (m.phaseOffset ?? 0) + 0.5 }
					: m,
			)
		: withSpeed;
	// 旧「独自の動きを組み合わせる」の名残。UIはもう無いが、過去の保存データに
	// custom が付いていれば動きが消えないよう読み続ける。
	return cfg.custom
		? [...withOffbeat, ...buildLegacyCustomModulators(cfg.custom)]
		: withOffbeat;
}
