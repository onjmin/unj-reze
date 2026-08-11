import {
	MV_H,
	MV_W,
	mvUid,
	type MvLayerGroup,
	type MvShapeForm,
	type MvShapeLayer,
} from "./mv-config";
import {
	MV_MOTION_PRESETS,
	MV_MOTION_SPEED_OPTIONS,
	resolveSceneModulators,
	type MvSceneMotionConfig,
} from "./mv-shape-motion";

/**
 * 「幾何学的な図形のアニメーション・レイヤー群をワンボタンで生成する」マクロ。
 *
 * 生成物は必ず**左右対称**（画面中央の縦線を軸にした線対称）になるようにしてある。
 * 図形を1つ乱数で決めたら、その鏡写しの相方を必ずセットで作る——バラバラに
 * ランダム配置すると対称に "見える" ことはまず無いので、対称性は最初から
 * ペア単位で保証する設計にした（生成してから対称かどうかを判定する方式は取っていない）。
 * 軸の真上に置く「中心の1枚」だけは相方が要らない（自分自身が鏡像になるため）。
 *
 * 'path'（SVG貼り付け前提の自由形状）は乱数で妥当な絵にならないので候補から外す。
 */

const RANDOM_FORMS: MvShapeForm[] = [
	"circle",
	"ring",
	"square",
	"diamond",
	"triangle",
	"polygon",
	"cross",
	"bar",
	"doubleFrame",
	"ripple",
];

const FALLBACK_PALETTE = ["#ffffff", "#a3e635", "#38bdf8", "#fbbf24", "#f472b6"];

function pick<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function randRange(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

export interface SymmetricShapeGroupOptions {
	/** 何組（ペア）作るか。未指定はランダムで2〜4組。 */
	pairCount?: number;
	/** 軸の真上に相方無しの1枚を足すか。未指定は50%の確率。 */
	includeCenter?: boolean;
	/** 色の候補。未指定は既定パレット。空配列は既定パレットへフォールバック。 */
	palette?: string[];
}

/**
 * 対称な図形グループの中身（レイヤー配列）を新しく作る。グループの実体
 * （`MvLayerGroup` レコード）は呼び出し側で保持している既存のIDを使うか
 * 新規に払い出すか選べるよう、ここでは受け取った `groupId` をそのまま全レイヤーへ
 * 付けるだけにしてある（グループの新規作成／中身の作り直しの両方から使えるように）。
 */
export function buildSymmetricShapeGroupLayers(
	groupId: string,
	nextZ: () => number,
	options: SymmetricShapeGroupOptions = {},
): MvShapeLayer[] {
	const axisX = MV_W / 2;
	const palette =
		options.palette && options.palette.length > 0
			? options.palette
			: FALLBACK_PALETTE;
	const pairCount =
		options.pairCount ?? 2 + Math.floor(Math.random() * 3); // 2〜4組
	const includeCenter = options.includeCenter ?? Math.random() < 0.5;
	const speedValues = MV_MOTION_SPEED_OPTIONS.map((o) => o.value);
	const presetIds = MV_MOTION_PRESETS.map((p) => p.id);

	const layers: MvShapeLayer[] = [];

	const randomMotion = (): MvSceneMotionConfig => ({
		presetId: pick(presetIds),
		beatSyncSpeed: pick(speedValues),
		// 裏拍は控えめに——全部裏拍にすると単に「遅れて見える」だけで対称の面白さが
		// 埋もれるので、3枚に1組くらいの頻度に留める。
		offbeat: Math.random() < 0.3,
	});

	const buildShapeBase = (): Omit<MvShapeLayer, "id" | "x" | "y" | "z"> => {
		const form = pick(RANDOM_FORMS);
		const cfg = randomMotion();
		return {
			kind: "shape",
			form,
			size: randRange(18, 70),
			rotation: Math.round(randRange(0, 359)),
			color: pick(palette),
			filled: Math.random() < 0.4,
			thickness: randRange(1.5, 6),
			count: 1,
			spread: 0,
			spin: 0,
			blend: "normal",
			sides: form === "polygon" ? 3 + Math.floor(Math.random() * 6) : undefined,
			modulators: resolveSceneModulators(cfg),
			motionPreset: cfg,
			groupId,
		};
	};

	for (let i = 0; i < pairCount; i++) {
		const base = buildShapeBase();
		const dx = randRange(30, axisX - 20);
		const y = randRange(30, MV_H - 30);
		const z = nextZ();

		const left: MvShapeLayer = {
			...base,
			id: mvUid("shp"),
			x: axisX - dx,
			y,
			z,
		};
		// 相方は見た目(form/size/色/太さ/動き)を丸ごと共有し、位置とrotationだけ
		// 鏡写しにする——動きまで独立に乱数で振ると「対称」に見えなくなるため。
		const right: MvShapeLayer = {
			...base,
			id: mvUid("shp"),
			x: axisX + dx,
			y,
			z,
			rotation: (360 - base.rotation) % 360,
			modulators: resolveSceneModulators(base.motionPreset as MvSceneMotionConfig),
		};
		layers.push(left, right);
	}

	if (includeCenter) {
		const base = buildShapeBase();
		layers.push({
			...base,
			id: mvUid("shp"),
			x: axisX,
			y: randRange(30, MV_H - 30),
			z: nextZ(),
			rotation: 0, // 軸上の1枚は左右非対称な傾きだと軸ズレして見えるので水平に固定
		});
	}

	return layers;
}

/** 新規グループ一式（グループレコード＋中身のレイヤー）を作る。 */
export function generateSymmetricShapeGroup(
	nextZ: () => number,
	options: SymmetricShapeGroupOptions = {},
): { group: MvLayerGroup; layers: MvShapeLayer[] } {
	const groupId = mvUid("grp");
	const layers = buildSymmetricShapeGroupLayers(groupId, nextZ, options);
	const group: MvLayerGroup = { id: groupId, name: "対称図形" };
	return { group, layers };
}
