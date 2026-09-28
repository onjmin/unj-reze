// エンジンごとの「まっさら」テンプレート。見本プリセット（PRESETS）とは切り離してあり、
// 特定のゲームの中身（キャラ・台詞・BGM・素材）を一切持たない。
//
// 使いどころ:
//  - ギャラリーの「まっさらから作る」
//  - 設定の「まっさらにする」（いまのエンジンのテンプレートで作り直す）
//  - 「エンジン変換」（変換先エンジン固有の設定＝物理・プレイヤーの大きさ・layout25d 等の土台）
//  - 保存済みゲームの読み込みで preset が 'blank'（や見本に無いID）だったときの土台
// どれも presetId は 'blank' になる。
//
// テンプレートは「そのまま遊べる最小限」に留める。マップは地面（と外周の壁）だけ、
// 置物は東方のボス1体（ボスがいないとステージが即終わる）とアクションのゴール旗だけ。
// 効果音はエンジン内蔵のオリジナル音（lib/game-sfx.ts）だけを使う。

import { gameSfxRef } from "@/lib/game-sfx";
import {
	COLS,
	type Dir4,
	defaultDeathScreen,
	defaultTitleScreen,
	type EngineKind,
	type Layout25D,
	newObject,
	normalizeWall25D,
	type PresetData,
	ROWS,
	TILE_SIZE,
	type TileDef,
	VIEW_COLS,
	VIEW_H,
	VIEW_ROWS,
	VIEW_W,
	type Wall25D,
} from "./shared";

/** まっさらテンプレートを出すエンジン（mmo3d はギャラリーから外しているので出さない）。 */
export type TemplateEngine = Exclude<EngineKind, "mmo3d">;

/** ギャラリー「まっさらから作る」とエンジン変換の並び順。 */
export const TEMPLATE_ENGINES: TemplateEngine[] = [
	"rpg",
	"action",
	"onjReze",
	"touhou",
	"yume25d",
];

/** エンジンの表示名（ゲーム名ではなく「種類」）。 */
export const ENGINE_LABELS: Record<EngineKind, string> = {
	rpg: "RPG",
	action: "横スクロールアクション",
	onjReze: "見下ろしアクション",
	touhou: "弾幕シューティング",
	yume25d: "2.5D探索",
	mmo3d: "3D MMO",
};

/** ギャラリーでエンジンの中身を一言で伝えるキャッチコピー。 */
export const ENGINE_TAGLINES: Record<TemplateEngine, string> = {
	rpg: "マップを歩いて話す・調べる。戦闘もつけられる",
	action: "重力とジャンプで進む横スクロール",
	onjReze: "剣とボムで戦う見下ろし型",
	touhou: "ボスの弾幕をよけて撃つ",
	yume25d: "一人称／三人称で歩きまわる3D風の世界",
};

/** テンプレートのゲーム名（タイトル画面の見出し）。 */
const TEMPLATE_NAME = "あたらしいゲーム";

const grid = (rows: number, cols: number, fill: (r: number, c: number) => number) =>
	Array.from({ length: rows }, (_, r) =>
		Array.from({ length: cols }, (_, c) => fill(r, c)),
	);
const blankGrid = (rows: number, cols: number) => grid(rows, cols, () => 0);

/** 全エンジン共通の骨組み。エンジン固有の値は各テンプレートで上書きする。 */
const base = (
	engine: EngineKind,
	subtitle: string,
): Omit<PresetData, "player" | "tiles" | "map"> => ({
	id: "blank",
	name: TEMPLATE_NAME,
	engine,
	gravity: 0,
	friction: 0,
	objects: [],
	switches: [],
	items: [],
	weapons: [],
	armors: [],
	effects: [],
	sfx: {},
	titleScreen: { ...defaultTitleScreen(TEMPLATE_NAME), subtitle },
});

/** 見下ろし型（rpg / onjReze）の共通マップ：くさはら一面＋外周の壁。 */
const topDownTiles = (): Record<number, TileDef> => ({
	0: { name: "くさはら", color: "#4f9a4a", passable: true },
	1: { name: "かべ", color: "#6b6b76", passable: false },
	2: { name: "みち", color: "#b89a64", passable: true },
	3: { name: "みず", color: "#3f7fc4", passable: false },
});
const topDownMap = () =>
	grid(ROWS, COLS, (r, c) =>
		r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 ? 1 : 0,
	);
const topDownStart = () => ({
	x: TILE_SIZE * Math.floor(COLS / 2),
	y: TILE_SIZE * Math.floor(ROWS / 2),
});

const rpgTemplate = (): PresetData => ({
	...base("rpg", "方向キーで歩く ／ Z で話す・調べる"),
	player: {
		emoji: "🧑",
		color: "#4f7fe0",
		speed: 3,
		jumpPower: 0,
		w: TILE_SIZE,
		h: TILE_SIZE,
		start: topDownStart(),
	},
	tiles: topDownTiles(),
	map: topDownMap(),
	overlayMap: blankGrid(ROWS, COLS),
	overheadMap: blankGrid(ROWS, COLS),
	sfx: {
		cursor: gameSfxRef("menuMove"),
		confirm: gameSfxRef("menuConfirm"),
		cancel: gameSfxRef("menuCancel"),
		save: gameSfxRef("save"),
		levelup: gameSfxRef("levelUp"),
		clear: gameSfxRef("clear"),
	},
});

const onjRezeTemplate = (): PresetData => ({
	...base("onjReze", "方向キーで移動 ／ X で剣 ／ C でボム ／ Z で話す"),
	player: {
		emoji: "🧑",
		color: "#66aaff",
		speed: 3,
		jumpPower: 0,
		w: TILE_SIZE,
		h: TILE_SIZE,
		start: topDownStart(),
	},
	tiles: topDownTiles(),
	map: topDownMap(),
	overlayMap: blankGrid(ROWS, COLS),
	overheadMap: blankGrid(ROWS, COLS),
	sfx: {
		shot: gameSfxRef("shoot"),
		damage: gameSfxRef("hurt"),
		levelup: gameSfxRef("levelUp"),
		save: gameSfxRef("save"),
		clear: gameSfxRef("clear"),
	},
});

/** 横スクロール：下2段が地面、右端の手前にゴール旗。タイル一覧には はしご・すり抜け床・
 *  壊せるブロック・チェックポイントも入れておく（塗るだけで使える）。 */
const actionTemplate = (): PresetData => {
	const groundTop = ROWS - 2;
	const map = grid(ROWS, COLS, (r) => (r >= groundTop ? 1 : 0));
	map[groundTop - 1][COLS - 2] = 3; // ゴール旗
	return {
		...base("action", "←→で移動 ／ Z・スペースでジャンプ ／ X でショット"),
		gravity: 0.42,
		friction: 0.85,
		player: {
			emoji: "🧒",
			color: "#4fa8e0",
			speed: 4.5,
			jumpPower: -9.5,
			w: 20,
			h: 32,
			start: { x: TILE_SIZE * 2, y: TILE_SIZE * (groundTop - 1) },
			hearts: 3,
		},
		tiles: {
			0: { name: "そら", color: "#9fd4f2", passable: true },
			1: { name: "じめん", color: "#8a5a2b", passable: false },
			2: { name: "ブロック", color: "#c07a3a", passable: false },
			3: { name: "ゴール", color: "#f2d94e", passable: true, special: "goal" },
			4: { name: "はしご", color: "#c08030", passable: true, special: "ladder" },
			5: {
				name: "すり抜け床",
				color: "#7fa8d0",
				passable: true,
				special: "oneway",
			},
			6: {
				name: "壊せるブロック",
				color: "#a06040",
				passable: false,
				special: "destructible",
			},
			7: {
				name: "チェックポイント",
				color: "#ff8800",
				passable: true,
				special: "checkpoint",
			},
		},
		map,
		overlayMap: blankGrid(ROWS, COLS),
		overheadMap: blankGrid(ROWS, COLS),
		sfx: {
			jump: { ref: "mml:t150o5l32cg", src: "t150o5l32cg", type: "mml" },
			shot: gameSfxRef("shoot"),
			damage: gameSfxRef("hurt"),
			clear: gameSfxRef("clear"),
		},
	};
};

/** 弾幕：画面固定（15×11）。ボスがいないとステージが即終わるので、
 *  全方位に撃つだけのボスを1体だけ置く。 */
const touhouTemplate = (): PresetData => ({
	...base("touhou", "方向キーで移動（弾は自動連射）／ Shift で低速移動 ／ X でボム"),
	player: {
		emoji: "✨",
		color: "#ff5a8a",
		speed: 4.5,
		jumpPower: 0,
		w: 24,
		h: 24,
		start: { x: VIEW_W / 2 - 12, y: VIEW_H - 60 },
		bombCount: 3,
	},
	tiles: {
		0: { name: "よぞら", color: "#0b0b2a", passable: true },
		1: { name: "かべ", color: "#1a1a3a", passable: false },
	},
	map: grid(VIEW_ROWS, VIEW_COLS, (_, c) =>
		c === 0 || c === VIEW_COLS - 1 ? 1 : 0,
	),
	phases: [{ id: "boss", kind: "boss", label: "ボス戦", scoreBonus: 10000 }],
	objects: [
		newObject({
			emoji: "👾",
			col: 7,
			row: 1,
			phase: 0,
			hp: 100,
			bullet: "none",
			bulletSpeed: 0,
			bulletColor: "#fff",
			fireRate: 999,
			isBoss: true,
			name: "ボス",
			miniScript: `
moveTo(${VIEW_W / 2}, 80, 90)
rot = 0
while true
  for i in range(0, 11, 1)
    shot(rot + i * 30, 2.2, 4)
  end for
  rot = rot + 7
  wait(6)
end while
`.trim(),
		}),
	],
	sfx: {
		graze: gameSfxRef("graze"),
		damage: gameSfxRef("hurt"),
		spellcard: gameSfxRef("spellCast"),
		clear: gameSfxRef("clear"),
	},
});

/** 2.5D：くさはらの床一面＋外周の壁。map/tiles は使わない（型を満たすだけの空データ）。 */
const yume25dTemplate = (): PresetData => {
	const size = 12;
	const walls: Wall25D[] = [];
	const W = (col: number, row: number, dir: Dir4) =>
		normalizeWall25D(col, row, dir, 10);
	for (let c = 0; c < size; c++) walls.push(W(c, 0, 0), W(c, size - 1, 2));
	for (let r = 0; r < size; r++) walls.push(W(0, r, 3), W(size - 1, r, 1));
	const half = Math.floor(size / 2);
	const layout25d: Layout25D = {
		cols: size,
		rows: size,
		floor: grid(size, size, () => 1),
		ceiling: false,
		ceilingTex: 13,
		walls,
		billboards: [],
		textures: {
			1: { id: 1, name: "くさはら", kind: "floor", color: "#5a9a4e" },
			2: { id: 2, name: "つち", kind: "floor", color: "#8a6a44" },
			10: { id: 10, name: "レンガ", kind: "wall", color: "#a0664a" },
			11: { id: 11, name: "いし", kind: "wall", color: "#7a7a86" },
			13: { id: 13, name: "てんじょう", kind: "wall", color: "#5a5060" },
			20: { id: 20, name: "き", kind: "sprite", color: "#2c6b3f", emoji: "🌲" },
		},
		wallHeight: 1,
		skyColor: "#8ec5e8",
		fogColor: "#b8d6ea",
		fogNear: 4,
		fogFar: 18,
		start: { col: half, row: half, dir: 0 },
		timeOfDay: "day",
	};
	return {
		...base("yume25d", "方向キーで歩く ／ ドラッグで見まわす ／ 近づいて調べる"),
		player: {
			emoji: "🙂",
			color: "#b9a6e8",
			speed: 2,
			jumpPower: 0,
			w: 24,
			h: 24,
			start: { x: TILE_SIZE * half, y: TILE_SIZE * half },
		},
		tiles: { 0: { name: "なし", color: "#000000", passable: true } },
		map: blankGrid(ROWS, COLS),
		layout25d,
		deathScreen: defaultDeathScreen(),
	};
};

/** 3D MMO：ギャラリーには出さないが、engine==='mmo3d' の 'blank' を読み込んだときの土台。 */
const mmo3dTemplate = (): PresetData => ({
	...base(
		"mmo3d",
		"ドラッグで視点移動 ／ WASDで移動 ／ Shiftダッシュ ／ タップで攻撃",
	),
	player: {
		emoji: "🧑",
		color: "#ffb300",
		speed: 2,
		jumpPower: 0,
		w: 24,
		h: 24,
		start: { x: TILE_SIZE * 8, y: TILE_SIZE * 8 },
	},
	tiles: { 0: { name: "なし", color: "#000000", passable: true } },
	map: blankGrid(ROWS, COLS),
	deathScreen: defaultDeathScreen(),
	mmo3dConfig: { renderer: "three" },
});

const TEMPLATE_FACTORIES: Record<EngineKind, () => PresetData> = {
	rpg: rpgTemplate,
	action: actionTemplate,
	onjReze: onjRezeTemplate,
	touhou: touhouTemplate,
	yume25d: yume25dTemplate,
	mmo3d: mmo3dTemplate,
};

/** 知っているエンジン名か。投稿されたマニフェストの engine は誰でも書けるので、
 *  'constructor' / 'toString' のような Object.prototype のキーも弾く（素のオブジェクト引きだと関数が返る）。 */
export const isEngineKind = (engine: unknown): engine is EngineKind =>
	typeof engine === "string" &&
	Object.prototype.hasOwnProperty.call(TEMPLATE_FACTORIES, engine);

/** エンジンのまっさらテンプレートを新しく作る（毎回別オブジェクトなので、そのまま編集してよい）。
 *  未知のエンジン名（壊れたJSONなど）は rpg として扱う。id は常に 'blank'。 */
export function createEngineTemplate(engine: EngineKind): PresetData {
	return (isEngineKind(engine) ? TEMPLATE_FACTORIES[engine] : rpgTemplate)();
}
