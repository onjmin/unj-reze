import { sm127MusicUrl, sm127SfxUrl } from "@/lib/mario-sm127-assets";
import { sAnimUrl as sa } from "@/lib/rpgen-assets";
import { resolveSMCUrl } from "../../lib/smc-helper";
import {
	COLS,
	newObject,
	type PresetData,
	ROWS,
	type SceneDef,
} from "./shared";
import {
	smbOverworld,
	smbOverworldEnemies,
	smbUnderground,
	smbUndergroundEnemies,
} from "./vglc-stages";

// SMC-released-sprites (Level-Share-Square/SMC-released-sprites) via jsDelivr CDN
// ライセンス: 非商用無料、作者クレジット必須
// Credit: Cube, Fesh, Nitrox, NotAToon, Noveni, Red Bun, Smuglutena, TheCrushedJoycon, Tristaph
const SMC_CDN =
	"https://cdn.jsdelivr.net/gh/Level-Share-Square/SMC-released-sprites@main";
const smc = (path: string) => `${SMC_CDN}/${path}`;

// タイル用静止画 URL（#sx,sy,sw,sh クロップ付き）
// SMC スプライトシートから 16px セル単位で単一タイルを切り出す
const smcTile = (path: string, sx: number, sy: number, sw = 16, sh = 16) =>
	`${smc(path)}#${sx},${sy},${sw},${sh}`;
const smcRef = (url: string) => `url:${url.split("#")[0]}`; // imageRef 用(クロップなし参照)

// walk:smc:u:<url>#sx,sy,cropW,cropH,frames (水平ストリップ、左向き水平反転)
const smcWalk = (
	path: string,
	sx: number,
	sy: number,
	sw: number,
	sh: number,
	frames?: number,
) => {
	const fSuffix = frames ? `,${frames}` : "";
	return `walk:smc:u:${smc(path)}#${sx},${sy},${sw},${sh}${fSuffix}`;
};

// ── タイル用 SMC URL ──────────────────────────────────────────────────────
//  すべてスプライトシート。#sx,sy,sw,sh で実スプライトを切り出す（クロップ無し＝シート丸ごと1枚絵、
//  かつ各シートの (0,0) はマット背景の空白なので必ず実セルを指す）。SMCの不透明マット背景は
//  GameMaker 側がロード時に自動透明化（クロマキー）する。16pxグリッド整列セルは col*16,row*16 で取れる。
//  Retro_SMB1_Blocks (384×144): ?ブロック=(144,0) / 茶レンガ=(144,16)
//  Castle            (384×352): 城の石床（斑点）=(48,64)
//  Large_Pipes       (448×192): 単一の土管イラストで16pxグリッドに非整列。傘=pipeCap・胴=pipeBody の
//                    2欠片に切り出し、マップにマス単位で積んで任意高の土管を作る（cell-fill描画。
//                    胴は縦縞のみなので積んでも継ぎ目が出ない）。
//  Flag_Pole         (448×112): 旗竿（緑球+ポール+土台）(240,2,16,42)。imageOverflowTop で上へ伸ばす
//                    （ペナント旗は左側にあり除外）。
const RETRO = "SMW/Objects/Retro%20Skins/Retro_SMB1_Blocks.png";
const T = {
	brick: smcTile(RETRO, 144, 16, 16, 16),
	qBlock: smcTile(RETRO, 144, 0, 16, 16),
	stone: smcTile("SMW/Tilesets/Castle.png", 48, 64, 16, 16),
	pipeCap: smcTile("SMW/General%20tiles/Large_Pipes.png", 213, 0, 50, 24),
	pipeBody: smcTile("SMW/General%20tiles/Large_Pipes.png", 216, 30, 46, 18),
	goalFlag: smcTile(
		"SMW/Objects/Goals%20%26%20Checkpoints/Flag_Pole.png",
		240,
		2,
		16,
		42,
	),
};

// ── 敵/NPC 用 SMC walk/static URL ────────────────────────────────────────
// SMCスプライトはすべて 16×16px または 32x32px セル
// 走行アニメ: 水平ストリップ crop = (sx, sy, sw, sh, frames)
//   Goombas     448×176  →  3フレーム (160,0,96,16,3)
//   Beach_Koopa 448×128  →  2フレーム (200,0,32,32,2)
//   Bob-omb     448×144  →  2フレーム (184,0,32,16,2)
//   Dry_Bones   448× 96  →  2フレーム (176,0,48,32,2)
//   Blazin_Boos 448×272  →  4フレーム (184,0,80,16,4)
const E = {
	goombaRef: "walk:smc_json:Goomba",
	goombaUrl: resolveSMCUrl("images/goomba-sheet0.png"),
	koopaRef: "walk:smc_json:KoopaTroopa",
	koopaUrl: resolveSMCUrl("images/koopatroopa-sheet0.png"),
	bobOmbRef: "walk:smc_json:Bobomb",
	bobOmbUrl: resolveSMCUrl("images/bobomb-sheet0.png"),
	dryBonesRef: "walk:smc_json:DryBones",
	dryBonesUrl: resolveSMCUrl("images/drybones-sheet0.png"),
	booRef: "walk:smc_json:Boo",
	booUrl: resolveSMCUrl("images/bootrail-sheet1.png"),
	toadRef: "walk:smc_json:NPC:1NPC0",
	toadUrl: resolveSMCUrl("images/npc-sheet0.png"),
	princessRef: "walk:smc_json:NPC:1NPC1",
	princessUrl: resolveSMCUrl("images/npc-sheet0.png"),
};

// ── アイテム用 SMC スプライト ─────────────────────────────────────────────
// フィールドに落ちている取得アイテムを絵文字ではなく原作のドット絵で出す。
// SMC のアイテムはすべて shared-2-sheet0.png に同居している。
const ITEM_SHEET = resolveSMCUrl("images/shared-2-sheet0.png");
const smcItem = (name: string) => ({
	spriteRef: `walk:smc_json:${name}`,
	spriteUrl: ITEM_SHEET,
});
const IT = {
	dragonCoin: smcItem("DragonCoin"), // 🔴 レッドコイン（原作のドラゴンコイン）
	oneUp: smcItem("OneUp"), // 💚 1UPキノコ
	star: smcItem("Starman"), // ⭐ スーパースター
};

// 地下ネズミ: SMC に対応スプライトなし → RPGen を使用（id は rpgen-search API の id）
const sa93 = sa("UWDL7g");
const wr93 = `walk:auto:u:${sa("UWDL7g")}`;

// ── タイル定義 ─────────────────────────────────────────────────────────────
const tiles: PresetData["tiles"] = {
	0: { name: "空", color: "#5c94fc", passable: true },
	1: {
		name: "ブロック",
		color: "#8B4513",
		passable: false,
		imageRef: smcRef(T.brick),
		imageUrl: T.brick,
	},
	2: {
		name: "ハテナ",
		color: "#FFD700",
		passable: false,
		special: "item",
		imageRef: smcRef(T.qBlock),
		imageUrl: T.qBlock,
	},
	3: {
		name: "ゴール旗",
		color: "#32CD32",
		passable: true,
		special: "goal",
		imageRef: smcRef(T.goalFlag),
		imageUrl: T.goalFlag,
		imageOverflowTop: true,
	},
	4: {
		name: "土管",
		color: "#2aa02a",
		passable: false,
		imageRef: smcRef(T.pipeBody),
		imageUrl: T.pipeBody,
		imageScale2x: true,
	},
	5: {
		name: "岩床",
		color: "#555566",
		passable: false,
		imageRef: smcRef(T.stone),
		imageUrl: T.stone,
	},
	6: {
		name: "音符ブロック",
		color: "#e8b000",
		passable: false,
		special: "bounce",
	},
	7: {
		name: "チェックポイント",
		color: "#ff8800",
		passable: true,
		special: "checkpoint",
	},
	8: {
		name: "ツタ",
		color: "#22aa22",
		passable: true,
		special: "vine",
		imageRef: smcRef(T.pipeBody),
		imageUrl: T.pipeBody,
	},
	9: { name: "水", color: "#3a78f0", passable: true, special: "water" },
	10: { name: "溶岩", color: "#ff4400", passable: true, special: "lava" },
	11: {
		name: "壊せるブロック",
		color: "#c08840",
		passable: false,
		special: "destructible",
		imageRef: smcRef(T.brick),
		imageUrl: T.brick,
	},
	12: {
		name: "P スイッチ",
		color: "#4444ff",
		passable: false,
		special: "pswitch",
	},
	13: {
		name: "土管トップ",
		color: "#2aa02a",
		passable: false,
		imageRef: smcRef(T.pipeCap),
		imageUrl: T.pipeCap,
		imageScale2x: true,
		imageOverflowTop: true,
	},
	14: {
		name: "使用済みブロック",
		color: "#6b4a24",
		passable: false,
		special: "used",
		imageRef: smcRef(T.stone),
		imageUrl: T.stone,
	}, // ハテナを下から叩いた後の空ブロック
	15: {
		name: "すり抜け床",
		color: "#ffb366",
		passable: true,
		special: "oneway",
	},
	16: { name: "コイン", color: "#ffd700", passable: true, special: "coin" }, // エンジンが回転コインを描画
	17: {
		name: "ハテナ(アイテム)",
		color: "#ffa500",
		passable: false,
		special: "itemPowerup",
		imageRef: smcRef(T.qBlock),
		imageUrl: T.qBlock,
	}, // 叩くとキノコ/フラワーが出る（見た目はコインのハテナと同じ）
};

// ── シーン1：地上ステージ (VGLC SMB 1-1 全長 202 列) ────────────────────────
// Source: TheVGLC/TheVGLC Super Mario Bros/Processed/mario-1-1.txt (CC BY-NC-SA 4.0)
// 穴・階段・ゴール旗(タイル3, col 198)込みの原作再現。敵は VGLC の 'E' 座標から生成。
const scene1Map = smbOverworld.map((row) => [...row]);
const WCOLS = scene1Map[0].length;
scene1Map[13][100] = 7; // 中間チェックポイント（地上ルート中間地点）

// VGLC 'E' 出現位置から敵を生成。原作 1-1 は col 106 だけノコノコ、他は全てクリボー。
const owEnemies = smbOverworldEnemies.map(({ col, row }) =>
	col === 106
		? newObject({
				emoji: "🐢",
				col,
				row,
				behavior: "walker",
				speed: 1.2,
				hazard: true,
				hp: 2,
				bullet: "none",
				stompable: true,
				shell: true,
				spriteRef: E.koopaRef,
				spriteUrl: E.koopaUrl,
			})
		: newObject({
				emoji: "🐛",
				col,
				row,
				behavior: "patrolH",
				speed: 1,
				hazard: true,
				hp: 1,
				bullet: "none",
				stompable: true,
				spriteRef: E.goombaRef,
				spriteUrl: E.goombaUrl,
			}),
);

const scene1: SceneDef = {
	id: "overworld",
	name: "地上ステージ",
	map: scene1Map,
	objects: [
		...owEnemies,
		// ボム兵（オリジナル要素, SMC: Bob-omb.png walk:smc 2フレーム）。踏むと倒せる。
		newObject({
			emoji: "💥",
			col: 33,
			row: 13,
			behavior: "patrolH",
			speed: 1,
			hazard: true,
			hp: 1,
			bullet: "none",
			stompable: true,
			name: "ボム兵",
			spriteRef: E.bobOmbRef,
			spriteUrl: E.bobOmbUrl,
		}),
		// キラー（終盤の平地に直進で飛来）。弾扱いなので踏めない。
		newObject({
			emoji: "💣",
			col: 145,
			row: 12,
			behavior: "walker",
			speed: 2.5,
			hazard: true,
			hp: 1,
			bullet: "none",
			name: "キラー",
			spriteRef: E.bobOmbRef,
			spriteUrl: E.bobOmbUrl,
		}),
		// テレサ（ブロック密集地帯で追尾, SMC: Blazin_Boos.png walk:smc 2フレーム）
		newObject({
			emoji: "👻",
			col: 132,
			row: 8,
			behavior: "chase",
			speed: 0.8,
			hazard: true,
			hp: 1,
			bullet: "none",
			name: "テレサ",
			spriteRef: E.booRef,
			spriteUrl: E.booUrl,
		}),
		// キノピオ NPC (SMC: Toad_NPCs.png 静止表示)
		newObject({
			emoji: "🍄",
			col: 3,
			row: 13,
			behavior: "still",
			hazard: false,
			hp: 1,
			bullet: "none",
			objType: "npc",
			message:
				"キノピオだよ！この先には穴があるから気をつけて！オレンジのチェックポイントを踏むと、やられてもそこから再開できるよ！",
			w: 32,
			h: 64,
			spriteRef: E.toadRef,
			spriteUrl: E.toadUrl,
		}),
		// ピーチ姫（ゴール旗の先, SMC: Princesses.png 静止表示）
		newObject({
			emoji: "👸",
			col: 200,
			row: 13,
			behavior: "still",
			hazard: false,
			hp: 1,
			bullet: "none",
			objType: "npc",
			message: "マリオ！助けに来てくれてありがとう！",
			w: 32,
			h: 64,
			spriteRef: E.princessRef,
			spriteUrl: E.princessUrl,
		}),
		// 土管ワープ→地下（4本目の土管の上に乗ると入れる）
		newObject({
			emoji: "⬇️",
			col: 57,
			row: 9,
			objType: "warp",
			hazard: false,
			hp: 1,
			speed: 0,
			behavior: "still",
			bullet: "none",
			message: "",
			warpSceneId: "underground",
			warpEntryCol: 2,
			warpEntryRow: 11,
		}),
		// 土管ワープ→秘密の地下（2本目の土管）
		newObject({
			emoji: "⬇️",
			col: 38,
			row: 10,
			objType: "warp",
			hazard: false,
			hp: 1,
			speed: 0,
			behavior: "still",
			bullet: "none",
			message: "",
			warpSceneId: "underground2",
			warpEntryCol: 2,
			warpEntryRow: ROWS - 4,
		}),
		// レッドコイン（土管の上と高層ブロックの上）
		newObject({
			emoji: "🔴",
			col: 46,
			row: 9,
			objType: "item",
			hazard: false,
			hp: 1,
			speed: 0,
			behavior: "still",
			bullet: "none",
			itemId: "redCoin",
			message: "",
			...IT.dragonCoin,
		}),
		newObject({
			emoji: "🔴",
			col: 122,
			row: 5,
			objType: "item",
			hazard: false,
			hp: 1,
			speed: 0,
			behavior: "still",
			bullet: "none",
			itemId: "redCoin",
			message: "",
			...IT.dragonCoin,
		}),
		// スター（原作でスターが入っているレンガの位置）
		newObject({
			emoji: "⭐",
			col: 101,
			row: 9,
			objType: "item",
			hazard: false,
			hp: 1,
			speed: 0,
			behavior: "still",
			bullet: "none",
			itemId: "star",
			message: "",
			...IT.star,
		}),
		// 1UP キノコ（原作の隠しブロック付近）
		newObject({
			emoji: "💚",
			col: 64,
			row: 9,
			objType: "item",
			hazard: false,
			hp: 1,
			speed: 0,
			behavior: "still",
			bullet: "none",
			itemId: "oneUp",
			message: "",
			...IT.oneUp,
		}),
		// 動くリフト（3マス幅の穴の上）
		newObject({
			emoji: "🛹",
			col: 87,
			row: 10,
			objType: "platform",
			name: "movingPlatform",
			hazard: false,
			hp: 1,
			speed: 1.0,
			behavior: "patrolH",
			bullet: "none",
		}),
	],
};

// ── シーン2：地下ステージ1 (VGLC SMB 1-2 全長 158 列) ───────────────────────
// Source: TheVGLC/TheVGLC Super Mario Bros/Processed/mario-1-2.txt (CC BY-NC-SA 4.0)
// コイン列・天井裏の抜け道・終盤の大穴（リフトで渡る）込みの原作再現。
const scene2Map = smbUnderground.map((row) => [...row]);

// VGLC 'E' 出現位置からクリボーを生成
const ugEnemies = smbUndergroundEnemies.map(({ col, row }) =>
	newObject({
		emoji: "🐛",
		col,
		row,
		behavior: "patrolH",
		speed: 1,
		hazard: true,
		hp: 1,
		bullet: "none",
		stompable: true,
		spriteRef: E.goombaRef,
		spriteUrl: E.goombaUrl,
	}),
);

const scene2: SceneDef = {
	id: "underground",
	name: "地下ステージ1",
	map: scene2Map,
	bgm: {
		ref: `direct:${sm127MusicUrl("underground")}`,
		src: sm127MusicUrl("underground"),
		type: "direct",
	},
	objects: [
		...ugEnemies,
		// 地下ネズミ（オリジナル要素。SMCに対応スプライトなし → RPGen維持）
		newObject({
			emoji: "🐀",
			col: 5,
			row: ROWS - 2,
			behavior: "patrolH",
			speed: 1.2,
			hazard: true,
			hp: 1,
			bullet: "none",
			spriteRef: wr93,
			spriteUrl: sa93,
		}),
		// ホネクッパ（SMC: Dry_Bones.png walk:smc 2フレーム 16px）。踏むと崩れる。
		newObject({
			emoji: "💀",
			col: 8,
			row: ROWS - 2,
			behavior: "patrolH",
			speed: 1,
			hazard: true,
			hp: 3,
			bullet: "none",
			stompable: true,
			name: "ホネクッパ",
			spriteRef: E.dryBonesRef,
			spriteUrl: E.dryBonesUrl,
		}),
		// 終盤の大穴（cols 138-144）を渡る上下リフト
		newObject({
			emoji: "🛹",
			col: 139,
			row: 11,
			objType: "platform",
			name: "movingPlatform",
			hazard: false,
			hp: 1,
			speed: 1.2,
			behavior: "patrolV",
			bullet: "none",
		}),
		newObject({
			emoji: "🛹",
			col: 142,
			row: 7,
			objType: "platform",
			name: "movingPlatform",
			hazard: false,
			hp: 1,
			speed: 1.2,
			behavior: "patrolV",
			bullet: "none",
		}),
		// シャインかけら（コイン列の上と、天井裏の抜け道）
		newObject({
			emoji: "✨",
			col: 44,
			row: 5,
			objType: "item",
			hazard: false,
			hp: 1,
			speed: 0,
			behavior: "still",
			bullet: "none",
			itemId: "shineShard",
			message: "",
		}),
		newObject({
			emoji: "✨",
			col: 120,
			row: 2,
			objType: "item",
			hazard: false,
			hp: 1,
			speed: 0,
			behavior: "still",
			bullet: "none",
			itemId: "shineShard",
			message: "",
		}),
		// 出口（終端の床）→ 地上の5本目の土管の上へ
		newObject({
			emoji: "⬆️",
			col: 156,
			row: 13,
			objType: "warp",
			hazard: false,
			hp: 1,
			speed: 0,
			behavior: "still",
			bullet: "none",
			message: "",
			warpSceneId: "overworld",
			warpEntryCol: 163,
			warpEntryRow: 10,
		}),
	],
};

// ── シーン3：秘密の地下ステージ ─────────────────────────────────────────────
const scene3Map = Array.from({ length: ROWS }, (_, y) =>
	Array.from({ length: COLS }, (_, x) => {
		if (y <= 1) return 5;
		if (y >= ROWS - 2) return 5;
		if (x === COLS - 3 && y >= ROWS - 4) return y === ROWS - 4 ? 13 : 4; // 土管（傘+胴）
		if (y === ROWS - 5 && x % 3 === 0 && x > 1 && x < COLS - 4) return 2;
		if (y === ROWS - 8 && x % 4 === 1 && x > 1 && x < COLS - 4) return 6; // 音符ブロック
		if (y === ROWS - 6 && x >= 4 && x <= 8) return 5;
		if (y === ROWS - 6 && x >= 12 && x <= 16) return 5;
		// ツタゾーン
		if (x >= 17 && x <= 18 && y >= ROWS - 9 && y <= ROWS - 3) return 8;
		return 0;
	}),
);

const scene3: SceneDef = {
	id: "underground2",
	name: "秘密の地下ステージ",
	map: scene3Map,
	bgm: {
		ref: `direct:${sm127MusicUrl("secretCourse")}`,
		src: sm127MusicUrl("secretCourse"),
		type: "direct",
	},
	objects: [
		newObject({
			emoji: "⬆️",
			col: COLS - 3,
			row: ROWS - 5,
			objType: "warp",
			hazard: false,
			hp: 1,
			speed: 0,
			behavior: "still",
			bullet: "none",
			message: "",
			warpSceneId: "overworld",
			warpEntryCol: 40,
			warpEntryRow: 13,
		}),
		// 壊せるブロックの先にシャインかけら
		newObject({
			emoji: "✨",
			col: COLS - 5,
			row: ROWS - 6,
			objType: "item",
			hazard: false,
			hp: 1,
			speed: 0,
			behavior: "still",
			bullet: "none",
			itemId: "shineShard",
			message: "",
		}),
	],
};

export const mario: PresetData = {
	id: "mario",
	name: "マリオ",
	engine: "action",
	gravity: 0.5,
	friction: 0.85,
	player: {
		emoji: "🦝",
		color: "#ff4444",
		speed: 5,
		jumpPower: -8.0,
		w: 24,
		h: 64,
		start: { x: 64, y: 352 },
		hearts: 3,
		spriteRef: "walk:smc_json:PlayerSprite:1Idle0_3",
		spriteUrl: resolveSMCUrl("images/playersprite-sheet0.png"),
	},
	tiles,
	map: JSON.parse(JSON.stringify(scene1Map)),
	objects: [...scene1.objects],
	scenes: [scene1, scene2, scene3],
	scroll: { worldCols: WCOLS },
	items: [
		{
			id: "redCoin",
			name: "レッドコイン",
			emoji: "🔴",
			description: "8枚集めるとご褒美アイテムが出現する特別なコイン",
		},
		{
			id: "shineShard",
			name: "シャインかけら",
			emoji: "✨",
			description: "5枚集めるとシャインスプライトが完成する",
		},
		{
			id: "oneUp",
			name: "1UPキノコ",
			emoji: "💚",
			description: "残機が1増える緑色のキノコ",
		},
		{
			id: "superMushroom",
			name: "スーパーキノコ",
			emoji: "🍄",
			description: "ハートを1つ回復するキノコ",
		},
		{
			id: "fireFlower",
			name: "ファイアフラワー",
			emoji: "🌸",
			description: "ファイアマリオになりファイアボールを撃てる",
		},
		{
			id: "star",
			name: "スーパースター",
			emoji: "⭐",
			description: "一定時間無敵になり敵に触れるだけで倒せる",
		},
		{
			id: "metalCap",
			name: "メタルキャップ",
			emoji: "⚙️",
			description: "一定時間金属マリオに変身。水中でも沈んで歩ける",
		},
		{
			id: "wingCap",
			name: "ウィングキャップ",
			emoji: "🪽",
			description: "一定時間飛行できる赤い帽子",
		},
		{
			id: "vanishCap",
			name: "バニッシュキャップ",
			emoji: "🌫️",
			description: "一定時間透明になり特定の壁をすり抜けられる",
		},
	],
	titleScreen: {
		enabled: true,
		heading: "スーパーマリオ",
		subtitle: "冒険の始まりだ！",
		textColor: "#ffe000",
		menu: [{ kind: "newGame", label: "はじめから" }],
	},
	ending: {
		enabled: true,
		heading: "GAME CLEAR!",
		message:
			"おめでとう！ピーチ姫を救出した！\nマリオ、あなたは本当のヒーローよ！",
		textColor: "#ffe000",
	},
	bgm: {
		ref: "https://www.youtube.com/watch?v=ps5akYt1WLQ",
		src: "https://www.youtube.com/watch?v=ps5akYt1WLQ",
		type: "youtube",
	},
	sfx: {
		jump: {
			ref: `direct:${sm127SfxUrl("jump")}`,
			src: sm127SfxUrl("jump"),
			type: "direct",
		},
		clear: {
			ref: `direct:${sm127SfxUrl("starCoin")}`,
			src: sm127SfxUrl("starCoin"),
			type: "direct",
		},
		damage: {
			ref: `direct:${sm127SfxUrl("damage")}`,
			src: sm127SfxUrl("damage"),
			type: "direct",
		},
		coin: { ref: "mml:t180o6l16b>e8", src: "t180o6l16b>e8", type: "mml" }, // 定番のコイン音 (B→E)
	},
};
