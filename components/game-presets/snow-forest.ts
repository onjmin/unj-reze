import { sAnimUrl as sa } from "@/lib/rpgen-assets";
import {
	newObject,
	type PresetData,
	ROWS,
	type SceneDef,
	TILE_SIZE,
} from "./shared";

// 雪原を氷ブロックで飛び渡る、原作なしのオリジナル横スクロールアクション。
// 参考動画（22〜30秒あたりの氷原ジャンプ区間）の雰囲気に寄せた配色・スケール。
// キャラクター素材: ユーザー提供の歩行グラ(72x128, 24x32セル×4行)。左右で綺麗な
// ミラー対になっている行が無いため、右向き3コマの1行だけを smc 規格(手動クロップ+
// 左移動時の水平反転)で使う。詳細はプレイヤー spriteRef のコメント参照。
// 環境素材: リポジトリ同梱の雪チップ（public/assets/rpg-reze/Base.png 195〜210行目、
// 「雪 木・地面装飾」「雪 崖」セクション）。木・氷ブロック・雪だるまは格子1マスに収めず、
// 現物より大きいオブジェクトとして自由サイズで配置する（動画の"あえて大きく描く"演出に合わせる）。
// 敵の歩行アニメのみ rpgen-search（CC相当のフリー素材DB）から調達。

const PLAYER_SPRITE_URL = "https://i.imgur.com/4LCRj5M.png";
const BASE_URL = "/assets/rpg-reze/Base.png"; // 16pxグリッドの同梱タイルシート

// ── rpgen-search 素材（歩行アニメのみ）───────────────────────────────────────
const R = {
	snowmanWalk: sa("UejLXD"), // 雪だるま（歩行、敵用）
	rabbitWalk: sa("o6dlqi"), // うさぎ（歩行、無害な小動物）
};

// ── Base.png 切り出しヘルパー（16pxグリッド、col/row 単位）───────────────────
// タイル用：1マス分をそのまま cell-fill で使う（クロップのみ、アニメなし）。
const tileChip = (col: number, row: number) =>
	`${BASE_URL}#${col * 16},${row * 16},16,16`;
// オブジェクト用：任意の複数マス分を1枚絵として切り出し、"smc" 手動クロップ規格
// （frames=1固定＝アニメなしの静止画）で任意サイズに拡縮描画する。
// 格子1マスに収める制約は無い（TileDef ではなく ObjectDef の w/h は自由数値）。
const objChip = (col: number, row: number, w: number, h: number) =>
	`walk:smc:u:${BASE_URL}#${col * 16},${row * 16},${w * 16},${h * 16},1`;

// ── タイル定義（地面のみ。氷ブロック/木/雪だるまはオブジェクト化） ─────────────
const tiles: PresetData["tiles"] = {
	0: { name: "空", color: "#8fd2e8", passable: true },
	1: {
		name: "雪の地面",
		color: "#e9f2f7",
		passable: false,
		imageRef: `url:${BASE_URL}`,
		imageUrl: tileChip(1, 203),
	},
	2: {
		name: "雪の地面(下層)",
		color: "#c9d3da",
		passable: false,
		imageRef: `url:${BASE_URL}`,
		imageUrl: tileChip(1, 204),
	},
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
};

// ── 装飾/足場オブジェクトのファクトリ ─────────────────────────────────────────
// すべて「下端＝bottomRow の上端」「水平中央＝centerCol」を基準に、
// crop の縦横比を保ったまま heightPx へ拡縮する（格子に収める必要はない）。
const deco = (
	crop: [col: number, row: number, w: number, h: number],
	centerCol: number,
	bottomRow: number,
	heightPx: number,
	emoji = "🌲",
) => {
	const [cc, cr, cw, ch] = crop;
	const aspect = cw / ch;
	const h = heightPx;
	const w = Math.round(h * aspect);
	const row = bottomRow - 1 + h / TILE_SIZE;
	const col = centerCol - w / TILE_SIZE / 2;
	return newObject({
		emoji,
		col,
		row,
		w,
		h,
		objType: "npc",
		behavior: "still",
		hazard: false,
		hp: 1,
		speed: 0,
		bullet: "none",
		message: "",
		through: true,
		spriteRef: objChip(cc, cr, cw, ch),
		spriteUrl: BASE_URL,
	});
};

// 浮遊する氷ブロック（objType:'platform'＝上に乗れる足場）。topRow は足場の踏み面。
const icePlatform = (
	crop: [col: number, row: number, w: number, h: number],
	centerCol: number,
	topRow: number,
	heightPx: number,
) => {
	const [cc, cr, cw, ch] = crop;
	const aspect = cw / ch;
	const h = heightPx;
	const w = Math.round(h * aspect);
	const row = topRow + h / TILE_SIZE - 1;
	const col = centerCol - w / TILE_SIZE / 2;
	return newObject({
		emoji: "🧊",
		col,
		row,
		w,
		h,
		objType: "platform",
		behavior: "still",
		hazard: false,
		hp: 1,
		speed: 0,
		bullet: "none",
		message: "",
		spriteRef: objChip(cc, cr, cw, ch),
		spriteUrl: BASE_URL,
	});
};

// クロップ定義（col,row,w,h / 16pxグリッド単位）
const CROP = {
	pineBig: [0, 197, 2, 4] as [number, number, number, number], // 雪の松（大）
	greenBig: [2, 197, 2, 4] as [number, number, number, number], // 常緑樹（大）
	frostTree: [4, 197, 2, 4] as [number, number, number, number], // 霜枯れの木
	bush: [6, 197, 1, 1] as [number, number, number, number], // 雪の茂み
	log: [6, 198, 2, 1] as [number, number, number, number], // 雪の倒木
	snowman: [3, 208, 1, 2] as [number, number, number, number], // 雪だるま（飾り）
	iceBlob: [0, 203, 3, 3] as [number, number, number, number], // 氷ブロック（大・角丸）
	icePill: [3, 207, 3, 1] as [number, number, number, number], // 氷ブロック（平たい）
};

// ── マップ生成（地面のみタイル。氷ブロック/木はオブジェクトとして別途配置） ─────
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
const groundSeg = (c0: number, c1: number) => {
	fillRect(c0, c1, GROUND_TOP, GROUND_TOP, 1);
	fillRect(c0, c1, GROUND_TOP + 1, ROWS - 1, 2);
};
const placeCheckpoint = (col: number, topRow: number) => {
	map[topRow][col] = 4;
};
const placeGoal = (col: number, topRow: number) => {
	map[topRow][col] = 3;
};

// 序盤：出発点
groundSeg(0, 7);
// 登り切った先の高台（雪だるまが徘徊）
groundSeg(22, 29);
// 中間の休憩地帯（うさぎがはねている）
groundSeg(38, 45);
placeCheckpoint(40, GROUND_TOP);
// フィナーレ：ゴール地点
groundSeg(63, 79);
placeGoal(77, GROUND_TOP);

// ── 背景の遠景木（淡く・小さく・密集） ────────────────────────────────────────
const bgTrees = (() => {
	const arr: ReturnType<typeof deco>[] = [];
	let col = -1;
	let i = 0;
	while (col < WCOLS + 2) {
		const crop = i % 2 === 0 ? CROP.frostTree : CROP.pineBig;
		arr.push(deco(crop, col, 4, 90 + (i % 3) * 12));
		col += 2 + (i % 3);
		i++;
	}
	return arr;
})();

// ── 中景木（少し大きく・はっきり） ────────────────────────────────────────────
const midTrees = [
	deco(CROP.frostTree, 5, 3, 150),
	deco(CROP.pineBig, 20, 3, 185),
	deco(CROP.frostTree, 34, 3, 145),
	deco(CROP.pineBig, 50, 3, 200),
	deco(CROP.frostTree, 62, 3, 150),
	deco(CROP.greenBig, 72, 3, 175),
];

// ── 前景の大きな松（動画のように画面手前で大きく描く） ────────────────────────
const fgTrees = [
	deco(CROP.pineBig, 1, GROUND_TOP - 1, TILE_SIZE * 6),
	deco(CROP.frostTree, 44, GROUND_TOP - 1, TILE_SIZE * 5),
	deco(CROP.greenBig, 66, GROUND_TOP - 1, TILE_SIZE * 5.5),
];

// ── 地面まわりの小物 ──────────────────────────────────────────────────────
const groundDeco = [
	deco(CROP.bush, 6, GROUND_TOP - 1, TILE_SIZE),
	deco(CROP.log, 9, GROUND_TOP - 1, TILE_SIZE * 0.6),
	deco(CROP.bush, 42, GROUND_TOP - 1, TILE_SIZE),
	deco(CROP.snowman, 74, GROUND_TOP - 1, TILE_SIZE * 2, "⛄"),
];

// ── 浮遊する氷ブロック（動画のジグザグに跳び渡る構成） ────────────────────────
const icePlatforms = [
	icePlatform(CROP.iceBlob, 10, 11, TILE_SIZE * 3),
	icePlatform(CROP.icePill, 14.5, 9, TILE_SIZE * 1.5),
	icePlatform(CROP.iceBlob, 19, 7, TILE_SIZE * 3),
	icePlatform(CROP.icePill, 31, 9, TILE_SIZE * 1.5),
	icePlatform(CROP.iceBlob, 35.5, 11, TILE_SIZE * 3),
	icePlatform(CROP.icePill, 49, 10, TILE_SIZE * 1.5),
	icePlatform(CROP.iceBlob, 54, 7, TILE_SIZE * 3),
	icePlatform(CROP.icePill, 59, 10, TILE_SIZE * 1.5),
];

// ── 敵/アイテム ────────────────────────────────────────────────────────────
const creatures = [
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
];

const items = [
	newObject({
		emoji: "❄️",
		col: 14,
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
		col: 48,
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
		col: 53,
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

const objects = [
	...bgTrees,
	...midTrees,
	...icePlatforms,
	...groundDeco,
	...fgTrees,
	...creatures,
	...items,
];

const scene1: SceneDef = {
	id: "forest",
	name: "雪原ステージ",
	map,
	objects,
	weather: { kind: "snow", intensity: 0.7, speed: 0.7, opacity: 0.8 },
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
		// 提供元シート(72x128, 24x32セル×4行)は「上/右/下/左」の4方向格子だが、
		// きれいな横向き3コマ歩行が揃っているのは1行（y=32〜64）だけで、もう1行は
		// 正面寄り＋腕を伸ばすポーズで左右ミラーの対になっていない。4方向格子として
		// 読むと「向きが変わって見えない」原因になるため、その1行だけを横ストリップ
		// として切り出し、左移動時は水平反転(smc規格のflipH)で表現する。
		spriteRef: `walk:smc:u:${PLAYER_SPRITE_URL}#0,32,72,32,3`,
		spriteUrl: PLAYER_SPRITE_URL,
	},
	tiles,
	map: JSON.parse(JSON.stringify(map)),
	objects: [...objects],
	scenes: [scene1],
	scroll: { worldCols: WCOLS },
	weather: { kind: "snow", intensity: 0.7, speed: 0.7, opacity: 0.8 },
	items: [
		{
			id: "snowCrystal",
			name: "雪の結晶",
			emoji: "❄️",
			description:
				"氷ブロックの上や高台に隠れているきらめく結晶。集めても集めなくても先へ進める",
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
