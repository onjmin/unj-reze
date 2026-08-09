import type {
	MvLayer,
	MvModulator,
	MvShapeForm,
	MvShapeLayer,
} from "./mv-config";
import { mvUid } from "./mv-config";

/**
 * 「参考動画を1px単位で再現する」のをやめて、汎用の**エフェクトテンプレート**を
 * 部品として用意し、組み合わせて使う方式にする。
 *
 * 各テンプレートは以下を満たす:
 * - `barsPerLoop` 小節でぴったりループする（`phrase`/`bar` ソースは小節境界で
 *   自動的に頭へ戻る envelope なので、これを使う限り継ぎ目のない繰り返しになる）。
 * - パラメータ(位置・大きさ・色・ループ長・向き)だけで見た目を変えられる。
 * - 1テンプレート = 1〜数枚の `MvShapeLayer`（既存のレイヤー種別のみ使用。
 *   保存・編集・レイヤー一覧タブは全部そのまま流用できる）。
 */

export interface MvEffectTemplateParams {
	x: number;
	y: number;
	size: number;
	color: string;
	/** 何小節で1周するか。1以上。 */
	barsPerLoop: number;
	/** 0〜1。テンプレート全体の濃さ。 */
	opacity: number;
	/** テンプレートによっては角数・本数などに使う（無ければ無視される）。 */
	count: number;
}

export const DEFAULT_TEMPLATE_PARAMS: MvEffectTemplateParams = {
	x: 320,
	y: 180,
	size: 40,
	color: "#f4f4f5",
	barsPerLoop: 1,
	opacity: 1,
	count: 6,
};

export type MvEffectTemplateCategory =
	| "frame"
	| "particle"
	| "glow"
	| "burst"
	| "wave"
	| "geometry";

export const MV_EFFECT_TEMPLATE_CATEGORY_LABELS: Record<
	MvEffectTemplateCategory,
	string
> = {
	frame: "枠・フレーム",
	particle: "粒子",
	glow: "発光",
	burst: "放射",
	wave: "波・帯",
	geometry: "図形",
};

export interface MvEffectTemplateDef {
	id: string;
	name: string;
	category: MvEffectTemplateCategory;
	/** テンプレート選択モーダルでの説明（1行）。 */
	description: string;
	/** このパラメータ一式でレイヤーを組み立てる。呼ぶたびに新しいidを振る。 */
	build: (p: MvEffectTemplateParams) => MvLayer[];
}

function baseShape(
	id: string,
	form: MvShapeForm,
	p: MvEffectTemplateParams,
	extra: Partial<Omit<MvShapeLayer, "kind" | "id" | "form">> & {
		modulators: MvModulator[];
	},
): MvShapeLayer {
	return {
		kind: "shape",
		id,
		form,
		x: p.x,
		y: p.y,
		size: p.size,
		rotation: 0,
		color: p.color,
		filled: false,
		thickness: 2,
		z: 20,
		opacity: p.opacity,
		...extra,
	};
}

export const MV_EFFECT_TEMPLATES: MvEffectTemplateDef[] = [
	{
		id: "doubleFrame",
		name: "二重枠",
		category: "frame",
		description: "内外2本の正方形の枠が小節ごとに軽く息をする。キャラや文字を囲うのに。",
		build: (p) => {
			const outer = mvUid("tpl");
			const inner = mvUid("tpl");
			return [
				baseShape(outer, "square", p, {
					thickness: 2,
					modulators: [
						{ source: "bar", target: "size", op: "add", amount: p.size * 0.06 },
					],
				}),
				baseShape(inner, "square", { ...p, size: p.size * 0.82 }, {
					thickness: 2,
					modulators: [
						{ source: "bar", target: "size", op: "add", amount: p.size * 0.05 },
					],
				}),
			];
		},
	},
	{
		id: "ringPulse",
		name: "波紋",
		category: "wave",
		description: "輪が小節の頭から外へ広がって消える。1小節でぴったりループ。",
		build: (p) => [
			baseShape(mvUid("tpl"), "ring", p, {
				thickness: 2.5,
				modulators: [
					{
						source: "phrase",
						bars: p.barsPerLoop,
						target: "size",
						op: "add",
						amount: p.size * 1.4,
					},
					{
						source: "phrase",
						bars: p.barsPerLoop,
						target: "opacity",
						op: "mul",
						amount: 1,
					},
				],
			}),
		],
	},
	{
		id: "particleOrbit",
		name: "粒子リング",
		category: "particle",
		description: "小さい粒がリング状に並び、小節ごとに大きさが呼吸する。",
		build: (p) => [
			baseShape(mvUid("tpl"), "circle", { ...p, size: p.size * 0.1 }, {
				filled: true,
				count: Math.max(3, Math.min(24, Math.round(p.count))),
				spread: 0,
				spin: 360 / Math.max(3, Math.round(p.count)),
				offsetX: 0,
				modulators: [
					{
						source: "phrase",
						bars: p.barsPerLoop,
						symmetric: true,
						curve: 2,
						target: "size",
						op: "add",
						amount: p.size * 0.06,
					},
				],
			}),
		],
	},
	{
		id: "sunburstSweep",
		name: "放射スイープ",
		category: "burst",
		description: "放射状の線が小節ごとに開いてから畳まれる。サビの決めに。",
		build: (p) => [
			baseShape(mvUid("tpl"), "cross", p, {
				thickness: 2,
				sides: Math.max(3, Math.min(16, Math.round(p.count))),
				modulators: [
					{
						source: "phrase",
						bars: p.barsPerLoop,
						symmetric: true,
						curve: 3,
						target: "size",
						op: "add",
						amount: p.size * 0.9,
					},
					{
						source: "phrase",
						bars: p.barsPerLoop,
						target: "rotation",
						op: "add",
						amount: 45,
					},
				],
			}),
		],
	},
	{
		id: "softGlow",
		name: "やわらかい発光",
		category: "glow",
		description: "塗りの円がゆっくり膨らんでは縮む、控えめな発光。背景の空気感に。",
		build: (p) => [
			baseShape(mvUid("tpl"), "circle", p, {
				filled: true,
				thickness: 1,
				modulators: [
					{
						source: "phrase",
						bars: p.barsPerLoop,
						symmetric: true,
						curve: 1.5,
						target: "size",
						op: "add",
						amount: p.size * 0.35,
					},
					{
						source: "phrase",
						bars: p.barsPerLoop,
						symmetric: true,
						curve: 1.5,
						target: "opacity",
						op: "mul",
						amount: 0.6,
					},
					{ source: "constant", target: "opacity", op: "add", amount: 0.25 },
				],
			}),
		],
	},
	{
		id: "polygonSpin",
		name: "多角形回転",
		category: "geometry",
		description: "多角形の輪郭が小節ごとに1回転して頭へ戻る。歯車のような硬い動き。",
		build: (p) => [
			baseShape(mvUid("tpl"), "polygon", p, {
				thickness: 2.5,
				sides: Math.max(3, Math.min(12, Math.round(p.count))),
				modulators: [
					{
						source: "phrase",
						bars: p.barsPerLoop,
						target: "rotation",
						op: "sub",
						amount: 360 / Math.max(3, Math.round(p.count)),
					},
				],
			}),
		],
	},
	{
		id: "ribbonSweep",
		name: "帯スイープ",
		category: "wave",
		description: "太い帯が横切って小節の頭で戻る。切り替わりの合図に。",
		build: (p) => [
			baseShape(mvUid("tpl"), "bar", p, {
				filled: true,
				barAspect: 0.12,
				thickness: 1,
				modulators: [
					{
						source: "phrase",
						bars: p.barsPerLoop,
						target: "x",
						op: "add",
						amount: p.size * 2.2,
					},
					{
						source: "phrase",
						bars: p.barsPerLoop,
						symmetric: true,
						curve: 1,
						target: "opacity",
						op: "mul",
						amount: 1,
					},
				],
			}),
		],
	},
	{
		id: "pulseBarRows",
		name: "点滅バー列",
		category: "wave",
		description:
			"細い横棒が何段も並び、段ごとに少しずつ位相をずらして点滅する。譜面の帯のような賑やかさに。",
		build: (p) => [
			baseShape(mvUid("tpl"), "bar", p, {
				filled: true,
				barAspect: 0.12,
				thickness: 1,
				count: Math.max(2, Math.min(12, Math.round(p.count))),
				offsetY: p.size * 0.16,
				// stagger で1段ごとに評価時刻をずらす＝段ごとに違う位相で点滅する
				// （score帯の「行ごとにバラバラに光る」ラフさを再現）。
				stagger: 6,
				modulators: [
					{
						source: "bar",
						target: "opacity",
						op: "mul",
						amount: 1,
					},
					{ source: "constant", target: "opacity", op: "add", amount: 0.15 },
				],
			}),
		],
	},
];

export function findMvEffectTemplate(id: string): MvEffectTemplateDef | undefined {
	return MV_EFFECT_TEMPLATES.find((t) => t.id === id);
}
