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

	/** 配置の傾向。"centered" (デフォルト: 中央集中) / "scattered" (全体分散) */
	clusterType?: "centered" | "scattered";
	/** 図形の種類の傾向。"sharp" (直線的) / "round" (丸みを帯びたもの) / "all" (すべて) */
	shapeStyle?: "sharp" | "round" | "all";
	/** 線の太さ。"thick" (太め) / "thin" (細め) / "random" (ランダム) */
	thickness?: "thick" | "thin" | "random";
	/** モノクロ配色にするか（白・グレー基調） */
	monochrome?: boolean;
	/** 左右対称に配置するかどうか */
	symmetric?: boolean;
}

const SHARP_FORMS: MvShapeForm[] = [
	"square",
	"diamond",
	"triangle",
	"polygon",
	"cross",
	"bar",
	"doubleFrame",
];

const ROUND_FORMS: MvShapeForm[] = ["circle", "ring", "ripple"];

const MONOCHROME_PALETTE = ["#ffffff", "#cccccc", "#999999", "#555555"];

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
	const centerY = MV_H / 2;

	// パレットの決定
	const basePalette =
		options.palette && options.palette.length > 0
			? options.palette
			: FALLBACK_PALETTE;
	const palette = options.monochrome ? MONOCHROME_PALETTE : basePalette;

	const pairCount =
		options.pairCount ?? 2 + Math.floor(Math.random() * 3); // 2〜4組
	const includeCenter = options.includeCenter ?? Math.random() < 0.5;
	const speedValues = MV_MOTION_SPEED_OPTIONS.map((o) => o.value);
	const presetIds = MV_MOTION_PRESETS.map((p) => p.id);

	// 図形リストの決定
	let forms = RANDOM_FORMS;
	const style = options.shapeStyle ?? "sharp";
	if (style === "sharp") forms = SHARP_FORMS;
	else if (style === "round") forms = ROUND_FORMS;

	const isCentered = (options.clusterType ?? "centered") === "centered";
	const thicknessMode = options.thickness ?? "thick";
	const isSymmetric = options.symmetric ?? true;

	const layers: MvShapeLayer[] = [];

	const randomMotion = (): MvSceneMotionConfig => ({
		presetId: pick(presetIds),
		beatSyncSpeed: pick(speedValues),
		// 裏拍は控えめに——全部裏拍にすると単に「遅れて見える」だけで対称の面白さが
		// 埋もれるので、3枚に1組くらいの頻度に留める。
		offbeat: Math.random() < 0.3,
	});

	const buildShapeBase = (): Omit<MvShapeLayer, "id" | "x" | "y" | "z"> => {
		const form = pick(forms);
		const cfg = randomMotion();

		// 太さの決定
		let thickness = randRange(1.5, 6);
		if (thicknessMode === "thick") {
			thickness = randRange(4, 12);
		} else if (thicknessMode === "thin") {
			thickness = randRange(1, 3);
		}

		// 中央集中の場合はサイズを大きめにしやすくする
		let minSize = 18;
		let maxSize = 70;
		if (isCentered) {
			minSize = 30;
			maxSize = 120; // エンブレム風に大きめの図形を許容
		}

		return {
			kind: "shape",
			form,
			size: randRange(minSize, maxSize),
			rotation: Math.round(randRange(0, 359)),
			color: pick(palette),
			filled: Math.random() < 0.4,
			thickness,
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
		if (isSymmetric) {
			const base = buildShapeBase();
			let dx: number;
			let y: number;
			if (isCentered) {
				dx = randRange(10, 100);
				y = centerY + randRange(-80, 80);
			} else {
				dx = randRange(30, axisX - 20);
				y = randRange(30, MV_H - 30);
			}

			const left: MvShapeLayer = {
				...base,
				id: mvUid("shp"),
				x: axisX - dx,
				y,
				z: nextZ(),
			};
			const right: MvShapeLayer = {
				...base,
				id: mvUid("shp"),
				x: axisX + dx,
				y,
				z: nextZ(),
				rotation: (360 - base.rotation) % 360,
				modulators: resolveSceneModulators(base.motionPreset as MvSceneMotionConfig),
			};
			layers.push(left, right);
		} else {
			// 非対称モード：完全に独立した図形を2つ（1ペア分）生成
			for (let j = 0; j < 2; j++) {
				const base = buildShapeBase();
				const indDx = isCentered ? randRange(-100, 100) : randRange(-axisX + 20, axisX - 20);
				const indY = isCentered ? centerY + randRange(-80, 80) : randRange(30, MV_H - 30);
				layers.push({
					...base,
					id: mvUid("shp"),
					x: axisX + indDx,
					y: indY,
					z: nextZ(),
				});
			}
		}
	}

	// センター用図形（isSymmetric=false でも中心の目安として生成しても良いが、非対称なら不要かもしれない。ただ数合わせとして残す）
	if (includeCenter) {
		const base = buildShapeBase();
		let y = centerY;
		let x = axisX;
		if (!isCentered) {
			y = randRange(30, MV_H - 30);
			if (!isSymmetric) x = randRange(30, MV_W - 30);
		} else if (!isSymmetric) {
			x = axisX + randRange(-30, 30);
		}
		
		layers.push({
			...base,
			id: mvUid("shp"),
			x,
			y,
			z: nextZ(),
			rotation: isSymmetric ? 0 : base.rotation, // 軸上非対称を防ぐために対称時は水平固定
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
	const group: MvLayerGroup = { id: groupId, name: "自動生成図形" };
	return { group, layers };
}

/**
 * 既存の図形グループのレイヤー配列を元にして、展開の変化に使える
 * 「特殊アレンジ」のレイヤー配列を生成する。
 */
export function generateArrangementForGroup(
	existingLayers: MvShapeLayer[],
	nextZ: () => number,
): { group: MvLayerGroup; layers: MvShapeLayer[] } {
	const newGroupId = mvUid("grp");
	const group: MvLayerGroup = { id: newGroupId, name: "特殊アレンジ" };
	const layers: MvShapeLayer[] = [];

	// 元のレイヤーをベースに、動きを激しくした複製を作る
	for (const orig of existingLayers) {
		const newLayer: MvShapeLayer = {
			...orig,
			id: mvUid("shp"),
			groupId: newGroupId,
			z: nextZ(),
			// モジュレータ（動き）のスピードを倍速にする
			modulators:
				orig.modulators?.map((m) => {
					if (m.source === "beat") {
						return { ...m, periodBeats: (m.periodBeats ?? 1) / 2 };
					}
					return m;
				}) ?? [],
		};

		// 激しい回転を追加
		newLayer.modulators.push({
			source: "beat",
			target: "rotation",
			op: "add",
			amount: orig.x < MV_W / 2 ? 45 : -45, // 左右で逆回転
			periodBeats: 0.5,
		});

		// サイズの脈動を追加
		newLayer.modulators.push({
			source: "beat",
			target: "size",
			op: "add",
			amount: 20,
			periodBeats: 0.5,
		});

		layers.push(newLayer);
	}

	// 画面いっぱいに広がる閃光用のバー（十字）を追加
	for (let i = 0; i < 2; i++) {
		layers.push({
			kind: "shape",
			form: "bar",
			id: mvUid("shp"),
			groupId: newGroupId,
			x: MV_W / 2,
			y: MV_H / 2,
			z: nextZ(),
			rotation: i === 0 ? 0 : 90,
			color: "#ffffff",
			size: MV_W,
			thickness: 4,
			filled: false,
			count: 1,
			spread: 0,
			spin: 0,
			blend: "normal",
			modulators: [
				{
					source: "beat",
					target: "size",
					op: "add",
					amount: MV_W,
					periodBeats: 0.5,
				},
				{
					source: "beat",
					target: "thickness",
					op: "add",
					amount: 10,
					periodBeats: 0.5,
				},
			],
		});
	}

	return { group, layers };
}
