// 組み込みの「表面素材」＝床・壁にそのまま貼れるシームレステクスチャと、空のパノラマ。
//
// これを足した経緯: yume25d へ 3D モデル（家・鳥居・電柱など）を揃えたあと実際に町を建てたところ、
// **床と壁のテクスチャが1枚も無い**ことが分かった。内蔵は手続き生成のドット模様（むらさきの床・
// ゆめレンガ等）だけで、道路も舗装もブロック塀も無く、写実寄りのモデルを並べても紫の夢床の上に
// 浮いてしまう。内蔵タイルシート（RPGEN/レゼ）は 16px の RPG チップなので、画風の面でも噛み合わない。
//
// 素材はすべて CC0（ambientCG / Poly Haven）。表示義務は無いが出所は残す。
// エンジンは低解像度・最近傍補間で描くので、地面・壁は 512px、空パノラマは 2048x1024 へ落としてある。
// 置き場は組み込み専用の R2（unj-builtin）。components/game-presets/model-catalog.ts と同じ方針。

const BUILTIN = "https://pub-07d0a11104d64dcfbe036c7ec263ac55.r2.dev";

export interface SurfaceAsset {
	key: string;
	/** 一覧に出す日本語名 */
	label: string;
	url: string;
	/** どこに貼る想定か。sky は Layout25D.skyRef（360度パノラマ）へ。 */
	kind: "floor" | "wall" | "sky";
	/** 出所（CC0 なので表示義務は無いが残す） */
	credit: string;
	/** キーワード検索の対象 */
	tags: string;
}

export const SURFACE_CATALOG: SurfaceAsset[] = [
	{
		key: "road-line",
		label: "道路（センターライン）",
		url: `${BUILTIN}/textures/road-line.jpg`,
		kind: "floor",
		credit: "Road007 / ambientCG (CC0)",
		tags: "road 道路 舗装 アスファルト 白線 車道 street",
	},
	{
		key: "road",
		label: "アスファルト",
		url: `${BUILTIN}/textures/road.jpg`,
		kind: "floor",
		credit: "Clean Asphalt / Poly Haven (CC0)",
		tags: "asphalt アスファルト 道路 舗装 路面",
	},
	{
		key: "pavement",
		label: "歩道（平板ブロック）",
		url: `${BUILTIN}/textures/pavement.jpg`,
		kind: "floor",
		credit: "PavingStones133 / ambientCG (CC0)",
		tags: "pavement 歩道 舗装 平板 ブロック sidewalk 街",
	},
	{
		key: "tactile-paving",
		label: "点字ブロック",
		url: `${BUILTIN}/textures/tactile-paving.jpg`,
		kind: "floor",
		credit: "TactilePaving003 / ambientCG (CC0)",
		tags: "tactile 点字ブロック 黄色 歩道 駅 バリアフリー",
	},
	{
		key: "pavement-stone",
		label: "石畳",
		url: `${BUILTIN}/textures/pavement-stone.jpg`,
		kind: "floor",
		credit: "PavingStones132 / ambientCG (CC0)",
		tags: "stone 石畳 敷石 参道 広場 pavement",
	},
	{
		key: "dirt",
		label: "土",
		url: `${BUILTIN}/textures/dirt.jpg`,
		kind: "floor",
		credit: "Ground102 / ambientCG (CC0)",
		tags: "dirt 土 地面 land 泥 未舗装",
	},
	{
		key: "gravel",
		label: "砂利",
		url: `${BUILTIN}/textures/gravel.jpg`,
		kind: "floor",
		credit: "Gravel022 / ambientCG (CC0)",
		tags: "gravel 砂利 じゃり 小石 駐車場",
	},
	{
		key: "gravel-white",
		label: "玉砂利（白）",
		url: `${BUILTIN}/textures/gravel-white.jpg`,
		kind: "floor",
		credit: "Gravel023 / ambientCG (CC0)",
		tags: "gravel 玉砂利 白 神社 参道 庭",
	},
	{
		key: "grass",
		label: "芝生",
		url: `${BUILTIN}/textures/grass.jpg`,
		kind: "floor",
		credit: "Grass005 / ambientCG (CC0)",
		tags: "grass 芝 芝生 草 公園 庭",
	},
	{
		key: "block-wall",
		label: "ブロック塀",
		url: `${BUILTIN}/textures/block-wall.jpg`,
		kind: "wall",
		credit: "Plaster Brick Pattern / Poly Haven (CC0)",
		tags: "wall ブロック塀 塀 壁 コンクリート 外壁",
	},
	{
		key: "block-wall-2",
		label: "ブロック塀（灰）",
		url: `${BUILTIN}/textures/block-wall-2.jpg`,
		kind: "wall",
		credit: "Concrete Block Wall 03 / Poly Haven (CC0)",
		tags: "wall ブロック塀 塀 壁 コンクリート 灰色",
	},
	{
		key: "concrete",
		label: "コンクリート壁",
		url: `${BUILTIN}/textures/concrete.jpg`,
		kind: "wall",
		credit: "Concrete Wall 004 / Poly Haven (CC0)",
		tags: "concrete コンクリート 壁 打ちっぱなし ビル",
	},
	{
		key: "roof-tiles",
		label: "瓦屋根",
		url: `${BUILTIN}/textures/roof-tiles.jpg`,
		kind: "wall",
		credit: "Grey Roof Tiles 02 / Poly Haven (CC0)",
		tags: "roof 瓦 屋根 和風 民家",
	},
	{
		key: "wood-planks",
		label: "杉板",
		url: `${BUILTIN}/textures/wood-planks.jpg`,
		kind: "wall",
		credit: "Japanese Cedar Planks / Poly Haven (CC0)",
		tags: "wood 板 木 杉 板塀 和風 外壁",
	},
	{
		key: "wood-dark",
		label: "板（濃い）",
		url: `${BUILTIN}/textures/wood-dark.jpg`,
		kind: "wall",
		credit: "Dark Planks / Poly Haven (CC0)",
		tags: "wood 板 木 板塀 焼杉 外壁 床",
	},
	{
		key: "corrugated",
		label: "トタン",
		url: `${BUILTIN}/textures/corrugated.jpg`,
		kind: "wall",
		credit: "CorrugatedSteel009 / ambientCG (CC0)",
		tags: "metal トタン 波板 倉庫 工場 外壁",
	},
	{
		key: "sky-day",
		label: "空（昼）",
		url: `${BUILTIN}/textures/sky-day.jpg`,
		kind: "sky",
		credit: "Kloofendal 48d Partly Cloudy (Pure Sky) / Poly Haven (CC0)",
		tags: "sky 空 昼 青空 雲 背景 パノラマ",
	},
	{
		key: "sky-dusk",
		label: "空（夕暮れ）",
		url: `${BUILTIN}/textures/sky-dusk.jpg`,
		kind: "sky",
		credit: "Kloppenheim 06 (Pure Sky) / Poly Haven (CC0)",
		tags: "sky 空 夕方 夕暮れ 黄昏 背景 パノラマ",
	},
];
