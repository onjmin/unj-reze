import { sAnimUrl as sa, spriteUrl as sp } from "@/lib/rpgen-assets";
import { newObject, type PresetData, ROWS, type SceneDef } from "./shared";

// 雪原を氷ブロックで飛び渡る、原作なしのオリジナル横スクロールアクション。
// キャラクター素材: ユーザー提供のツクール2000規格(24×32・3コマ・4方向)歩行グラ。
// 装飾/敵素材: rpgen-search（CC相当のフリー素材DB）から調達。マリオ系(SMC)のような
// 版権キャラクター依存は一切なし。

const PLAYER_SPRITE_URL = "https://i.imgur.com/4LCRj5M.png";

// ── rpgen-search 素材 ─────────────────────────────────────────────────────
const R = {
	treeTop: sp("Ej6yh8h"), // 松の葉（上）
	treeTrunk: sp("SmfbIIr"), // 松の幹（下）
	snowmanDeco: sp("5RhQJJ"), // 雪だるま（静止・飾り）
	snowmanWalk: sa("UejLXD"), // 雪だるま（歩行、敵用）
	rabbitWalk: sa("o6dlqi"), // うさぎ（歩行、無害な小動物）
};
const ir = (url: string) => `url:${url}`;

// ── タイル定義 ─────────────────────────────────────────────────────────────
const tiles: PresetData["tiles"] = {
	0: { name: "空", color: "#bfe6ff", passable: true },
	1: { name: "雪の地面", color: "#eaf6ff", passable: false },
	2: { name: "氷ブロック", color: "#a6e6ff", passable: false },
	3: {
		name: "ゴール",
		color: "#ffe066",
		passable: true,
		special: "goal",
	},
	4: {
		name: "チェックポイント",
		color: "#ff8800",
		passable: true,
		special: "checkpoint",
	},
	5: {
		name: "松の葉",
		color: "#2f6b4f",
		passable: true,
		imageRef: ir(R.treeTop),
		imageUrl: R.treeTop,
	},
	6: {
		name: "松の幹",
		color: "#5b3a24",
		passable: true,
		imageRef: ir(R.treeTrunk),
		imageUrl: R.treeTrunk,
	},
	7: {
		name: "雪だるま(飾り)",
		color: "#ffffff",
		passable: true,
		imageRef: ir(R.snowmanDeco),
		imageUrl: R.snowmanDeco,
	},
};

// ── マップ生成 ─────────────────────────────────────────────────────────────
const WCOLS = 80;
const GROUND_TOP = ROWS - 2; // 13（rows 13,14 が地面本体）

const map: number[][] = Array.from({ length: ROWS }, () =>
	Array(WCOLS).fill(0),
);

const fillRect = (
	c0: number,
	c1: number,
	r0: number,
	r1: number,
	tileId: number,
) => {
	for (let r = r0; r <= r1; r++) {
		for (let c = c0; c <= c1; c++) {
			if (map[r] && c >= 0 && c < WCOLS) map[r][c] = tileId;
		}
	}
};
const groundSeg = (c0: number, c1: number) =>
	fillRect(c0, c1, GROUND_TOP, ROWS - 1, 1);
const iceSeg = (c0: number, c1: number, row: number) =>
	fillRect(c0, c1, row, row + 1, 2);
const placeTree = (col: number, topRow: number) => {
	map[topRow - 2][col] = 5;
	map[topRow - 1][col] = 6;
};
const placeSnowmanDeco = (col: number, topRow: number) => {
	map[topRow - 1][col] = 7;
};
const placeCheckpoint = (col: number, topRow: number) => {
	map[topRow][col] = 4;
};
const placeGoal = (col: number, topRow: number) => {
	map[topRow][col] = 3;
};

// 序盤：出発点
groundSeg(0, 7);
placeTree(2, GROUND_TOP);
placeTree(6, GROUND_TOP);

// 氷ブロックを飛び渡って上へ抜ける最初の登り
iceSeg(10, 11, 11);
iceSeg(14, 15, 9);
iceSeg(18, 19, 7);

// 登り切った先の高台（雪だるまが徘徊）
groundSeg(22, 29);
placeCheckpoint(22, 7);
placeTree(26, 7);

// 高台から段々に降りる
iceSeg(31, 32, 9);
iceSeg(35, 36, 11);

// 中間の休憩地帯（うさぎがはねている）
groundSeg(38, 45);
placeTree(39, GROUND_TOP);
placeTree(43, GROUND_TOP);
placeCheckpoint(40, GROUND_TOP);

// 終盤：ジグザグに飛び渡る最後の氷ブロック群
iceSeg(48, 50, 10);
iceSeg(53, 55, 7);
iceSeg(58, 60, 10);

// フィナーレ：ゴール地点
groundSeg(63, 79);
placeTree(65, GROUND_TOP);
placeTree(70, GROUND_TOP);
placeSnowmanDeco(74, GROUND_TOP);
placeGoal(77, GROUND_TOP);

// ── オブジェクト ───────────────────────────────────────────────────────────
const objects = [
	// 雪だるま（敵・踏みつけ可）：高台を徘徊
	newObject({
		emoji: "⛄",
		col: 25,
		row: 5,
		behavior: "patrolH",
		speed: 1,
		hazard: true,
		hp: 1,
		bullet: "none",
		stompable: true,
		name: "ゆきだるま",
		spriteRef: `walk:auto:u:${R.snowmanWalk}`,
		spriteUrl: R.snowmanWalk,
	}),
	// うさぎ（無害な小動物・演出）：休憩地帯を跳ね回る
	newObject({
		emoji: "🐇",
		col: 41,
		row: 11,
		behavior: "patrolH",
		speed: 1.5,
		hazard: false,
		hp: 1,
		bullet: "none",
		name: "ゆきうさぎ",
		spriteRef: `walk:auto:u:${R.rabbitWalk}`,
		spriteUrl: R.rabbitWalk,
	}),
	// 雪の結晶（任意収集アイテム）
	newObject({
		emoji: "❄️",
		col: 15,
		row: 8,
		objType: "item",
		hazard: false,
		hp: 1,
		speed: 0,
		behavior: "still",
		bullet: "none",
		itemId: "snowCrystal",
		message: "",
	}),
	newObject({
		emoji: "❄️",
		col: 49,
		row: 9,
		objType: "item",
		hazard: false,
		hp: 1,
		speed: 0,
		behavior: "still",
		bullet: "none",
		itemId: "snowCrystal",
		message: "",
	}),
	newObject({
		emoji: "❄️",
		col: 54,
		row: 6,
		objType: "item",
		hazard: false,
		hp: 1,
		speed: 0,
		behavior: "still",
		bullet: "none",
		itemId: "snowCrystal",
		message: "",
	}),
];

const scene1: SceneDef = {
	id: "forest",
	name: "雪原ステージ",
	map,
	objects,
};

export const snowForest: PresetData = {
	id: "snowForest",
	name: "こおりの森",
	engine: "action",
	gravity: 0.42,
	friction: 0.85,
	player: {
		emoji: "👧",
		color: "#4fa8e0",
		speed: 4.5,
		jumpPower: -9.5,
		w: 20,
		h: 32,
		start: { x: 64, y: 320 },
		hearts: 3,
		spriteRef: `walk:rm2k:u:${PLAYER_SPRITE_URL}`,
		spriteUrl: PLAYER_SPRITE_URL,
	},
	tiles,
	map: JSON.parse(JSON.stringify(map)),
	objects: [...objects],
	scenes: [scene1],
	scroll: { worldCols: WCOLS },
	items: [
		{
			id: "snowCrystal",
			name: "雪の結晶",
			emoji: "❄️",
			description: "氷ブロックの上や高台に隠れているきらめく結晶。集めても集めなくても先へ進める",
		},
	],
	titleScreen: {
		enabled: true,
		heading: "こおりの森",
		subtitle: "氷の足場を、跳んで、跳んで。",
		textColor: "#eaf6ff",
		menu: [{ kind: "newGame", label: "はじめる" }],
	},
	ending: {
		enabled: true,
		heading: "GOAL!",
		message: "森の終わりに着いた。\n静かな雪の音だけが残る。",
		textColor: "#eaf6ff",
	},
	bgm: {
		ref: "mml:t108o5l8cdefgfedc<b>cd<b>cdefgfedc<b>c4",
		src: "t108o5l8cdefgfedc<b>cd<b>cdefgfedc<b>c4",
		type: "mml",
	},
	sfx: {
		jump: { ref: "mml:t150o6l16c", src: "t150o6l16c", type: "mml" },
		clear: {
			ref: "mml:t160o6l8cdefg",
			src: "t160o6l8cdefg",
			type: "mml",
		},
		damage: { ref: "mml:t120o3l8c", src: "t120o3l8c", type: "mml" },
		coin: { ref: "mml:t180o6l16b>e8", src: "t180o6l16b>e8", type: "mml" },
	},
};
