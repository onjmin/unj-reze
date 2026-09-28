import { gameSfxRef } from "@/lib/game-sfx";
import { sAnimUrl as sa, spriteUrl as sp } from "@/lib/rpgen-assets";
import {
	FUSATSU_BATTLE,
	FUSATSU_BOSS,
	FUSATSU_CASTLE,
	FUSATSU_CAVE,
	FUSATSU_FIELD,
	FUSATSU_TOWN,
} from "./bgm-library";
import {
	chest,
	type EncounterEnemy,
	type EnemyDialogueLine,
	type EnemyMove,
	type EventCommand,
	type ItemDef,
	localSysTileUrl,
	newObject,
	type ObjectDef,
	type PresetData,
	type SceneDef,
	TILE_SIZE,
} from "./shared";

// ══════════════════════════════════════════════════════════════════════════
//  不殺RPG ―― ログのはざま
//  ROM専の「ナナシ」は、dat落ちする スレの さいごの レスを よもうとして がめんに ふれ、
//  スレの なかへ すいこまれてしまった。そこは dat落ちした スレの なかみと、だれにも レスを
//  もらえなかった じゅうにんたちが のこっている『ログのはざま』。
//  おちた スレを ずっと ほしゅ して まわっている ろうそくの「ホシュ」と ふたりで、
//  dat落ちの谷 → ほしゅ横丁 → ながれの ちていこ → かこログの しょこ を ぬけ、
//  1000を こえた スレを しめている『1001』を ひらいて 次スレへ でる。
//  （既存の不殺RPGの 地域の ならび・敵の 役まわりを なぞらないよう、ネット掲示板の 文化から 組み立ててある。）
//
//  戦闘は パーティ制の弾幕よけ（battle.style 'deltarune'＝エディタ表記「弾幕よけ（パーティ）」）。
//  ・ナナシ（party[0]）は「こうどう」（はなす／ほめる／レスする）で 敵意ゲージを ためて「みのがす」。
//  ・ホシュ（party[1]）は TP を つかう「まほう」（ほしゅ＝なかま全員回復／あげ＝攻撃）。
//    TP は 弾を かすめる（グレイズ）か「まもる」で たまる。
//  ・「たたかう」は タイミングバー。たおしても みのがしても 先へ すすめる（みのがし＝EXPなし・ゴールドのみ）。
//  ・最後の ボス（isBoss）を たおすか みのがすと クリア。道中の 番人は isBoss を つけない
//   （isBoss の敵を たおした／みのがした時点で クリア扱いに なるため）。
//  ・シーンは 一方通行（もどる ワープは 置かない）。シーンに 入りなおすと たおした敵が 復活するので、
//    番人を こえたあとに もどってこられないように している。
// ══════════════════════════════════════════════════════════════════════════

// id は rpgen-search API の id フィールド（ハッシュ文字列）。
// 汎用の歩行グラ／静止画だけを使う（既存作品のキャラを描いた素材は使わない）。
const wr = (id: string) => `walk:auto:u:${sa(id)}`;
const ir = (id: string) => `url:${sp(id)}`;

/** 歩行グラ（sAnims）。名前は RPGEN 上の素材名。 */
const SPR = {
	nanashi: "jkAwdz", // 白い少女 → 主人公ナナシ
	onchan: "oLrlUq", // おんちゃん → 谷の じゅうにん
	oni: "m9nxuZ", // 赤鬼 → スレぬしの イッチ（谷の番人）
	cat: "nhYqpO", // 黒猫（二足歩行）→ くろねこ商店
	copyBot: "r9YCz5", // ロボ → コピペロボ
	banBot: "gmLHHM", // ガラクタ風の ロボット → キセイ（ちていこの番人）
	merchant: "XCnbu9", // 男Ⅹ → ながれの しょうにん
	librarian: "SmiIJl", // シスター → しょこの ししょ
} as const;

/** 静止画スプライト（sprites）。タイル・置物に使う。 */
const DECO = {
	stone: "lP5YiFj", // 石畳
	brick: "vcyXmCw", // 茶色 壁
	water: "4vGDOZE", // 水1
	floor: "sTJ89N", // 石床
	shelf: "X1eDb1H", // 本棚
	sign: "4vT7OGY", // 看板
	nanJ: "lIjiPk", // なんJ民 → ほしゅの おっちゃん
} as const;

// ── エフェクトの id（effects に 実体。絵は public/assets/game-effects のオリジナル、音は lib/game-sfx） ──
const FX_FLAME = "fx-flame";
const FX_HEAL = "fx-heal";

// ── タイル定義 ─────────────────────────────────────────────────────────────
const tiles: PresetData["tiles"] = {
	// dat落ちの谷
	0: { name: "たにの じめん", color: "#5c4b3b", passable: true },
	1: { name: "がけ", color: "#2a2019", passable: false },
	2: { name: "つもった かこログ", color: "#d8ccb0", passable: true },
	3: { name: "ひかりごけ", color: "#4f7a5c", passable: true },
	// ほしゅ横丁（ゆうぐれの 路地。おちばが まう）
	4: { name: "おちばの みち", color: "#b58a55", passable: true },
	5: { name: "いしがき", color: "#6b5f55", passable: false },
	6: {
		name: "いしだたみ",
		color: "#7d7f86",
		passable: true,
		imageRef: ir(DECO.stone),
		imageUrl: sp(DECO.stone),
	},
	7: {
		name: "レンガの いえ",
		color: "#8a4f36",
		passable: false,
		imageRef: ir(DECO.brick),
		imageUrl: sp(DECO.brick),
	},
	// ながれの ちていこ
	8: { name: "どうくつの ゆか", color: "#22304c", passable: true },
	9: { name: "どうくつの かべ", color: "#0c1324", passable: false },
	10: {
		name: "みず",
		color: "#1c3f8e",
		passable: false,
		imageRef: ir(DECO.water),
		imageUrl: sp(DECO.water),
	},
	11: { name: "はし", color: "#7a5a34", passable: true },
	// かこログの しょこ
	12: {
		name: "しょこの ゆか",
		color: "#a7a9ad",
		passable: true,
		imageRef: ir(DECO.floor),
		imageUrl: sp(DECO.floor),
	},
	13: { name: "しょこの かべ", color: "#1d1a26", passable: false },
	14: {
		name: "ほんだな",
		color: "#5a4030",
		passable: false,
		imageRef: ir(DECO.shelf),
		imageUrl: sp(DECO.shelf),
	},
	15: { name: "あかい じゅうたん", color: "#7a2a34", passable: true },
};

// ── マップ記法 ────────────────────────────────────────────────────────────
// 谷:     . じめん  V がけ  p かこログ  m ひかりごけ
// 横丁:   s おちばの みち  T いしがき  r いしだたみ  B いえ
// ちていこ: c ゆか  C かべ  w みず  b はし
// しょこ:  f ゆか  A かべ  S ほんだな  a じゅうたん
const LEGEND: Record<string, number> = {
	".": 0,
	V: 1,
	p: 2,
	m: 3,
	s: 4,
	T: 5,
	r: 6,
	B: 7,
	c: 8,
	C: 9,
	w: 10,
	b: 11,
	f: 12,
	A: 13,
	S: 14,
	a: 15,
};
const M = (rows: string[]): number[][] =>
	rows.map((r) => [...r].map((ch) => LEGEND[ch] ?? 0));

// ── 敵の定義 ──────────────────────────────────────────────────────────────
// 1体ぶんの能力・弾幕・セリフを1か所にまとめ、フィールドの徘徊シンボル（symbol）と
// ランダムエンカウント（encounter）の両方から同じ定義を使う。
// dialogue の actUsed は battle.moves の「こうどう」名（はなす／ほめる／レスする）と一致させる。
interface FoeSpec {
	name: string;
	emoji: string;
	hp: number;
	atk: number;
	def: number;
	exp: number;
	gold: number;
	/** 通常攻撃の弾幕（MiniScript）。技側の miniScript が優先。 */
	miniScript?: string;
	/** 通常攻撃の予告セリフ（HP割合／直前の「こうどう」／敵意ゲージで出し分け）。 */
	dialogue: (string | EnemyDialogueLine)[];
	moves?: EnemyMove[];
	/** フィールドで使う歩行グラ（SPR のキー）。省略時は絵文字。 */
	spriteId?: string;
}

/** フィールドを うろつく シンボルエンカウントの敵。 */
const symbol = (
	f: FoeSpec,
	col: number,
	row: number,
	opts: {
		behavior?: ObjectDef["behavior"];
		speed?: number;
		/** 1回で現れる最大数。ストーリー上の一体キャラ（番人）は 1。 */
		encounterMax?: number;
		isBoss?: boolean;
		outroDialogue?: ObjectDef["outroDialogue"];
	} = {},
): ObjectDef =>
	newObject({
		name: f.name,
		emoji: f.emoji,
		col,
		row,
		hp: f.hp,
		atk: f.atk,
		def: f.def,
		exp: f.exp,
		gold: f.gold,
		moves: f.moves,
		miniScript: f.miniScript,
		dialogue: f.dialogue,
		behavior: opts.behavior ?? "still",
		speed: opts.speed ?? 1.0,
		hazard: true,
		encounterMax: opts.encounterMax ?? 2,
		isBoss: opts.isBoss,
		outroDialogue: opts.outroDialogue,
		...(f.spriteId
			? { spriteRef: wr(f.spriteId), spriteUrl: sa(f.spriteId) }
			: {}),
	});

/** ランダムエンカウント用（シーンの randomEncounters）。 */
const encounter = (f: FoeSpec): EncounterEnemy => ({
	name: f.name,
	emoji: f.emoji,
	hp: f.hp,
	atk: f.atk,
	def: f.def,
	exp: f.exp,
	gold: f.gold,
	moves: f.moves,
	miniScript: f.miniScript,
	dialogue: f.dialogue,
});

// ── 会話・置物のファクトリ ───────────────────────────────────────────────
/** 近づくと 頭上に セリフが出る 住人。 */
const npc = (
	emoji: string,
	col: number,
	row: number,
	message: string,
	look?: { spriteRef: string; spriteUrl: string },
): ObjectDef =>
	newObject({
		emoji,
		col,
		row,
		behavior: "still",
		hazard: false,
		speed: 0,
		message,
		...look,
	});

/** 歩行グラの見た目。 */
const walk = (id: string) => ({ spriteRef: wr(id), spriteUrl: sa(id) });
/** 静止画の見た目。 */
const deco = (id: string) => ({ spriteRef: ir(id), spriteUrl: sp(id) });

/** しらべると メッセージウィンドウが出る 置物（看板・ただよう かきこみ など）。 */
const readable = (
	emoji: string,
	col: number,
	row: number,
	lines: string[],
	look?: { spriteRef: string; spriteUrl: string },
): ObjectDef =>
	newObject({
		emoji,
		col,
		row,
		behavior: "still",
		hazard: false,
		speed: 0,
		...look,
		pages: [
			{
				conditions: {},
				commands: lines.map((text) => ({ type: "message", text })),
			},
		],
	});

/** さわると HP が まんたんに なる ろうそく（無料の回復ポイント）。 */
const candle = (col: number, row: number): ObjectDef =>
	newObject({
		emoji: "🕯️",
		col,
		row,
		behavior: "still",
		hazard: false,
		speed: 0,
		pages: [
			{
				conditions: {},
				commands: [
					{
						type: "message",
						text: "ろうそくの ひが ゆらゆら ゆれている。\n……なんだか あたたかい。",
					},
					{ type: "playEffect", effectId: FX_HEAL, target: "player" },
					{ type: "restoreHp" },
					{ type: "message", text: "HPが まんたんに なった！" },
				],
			},
		],
	});

/** ふむと 1回だけ 会話が 流れる 床イベント（番人の 前口上など）。
 *  ふんだあとは 条件を みたす ページが なくなるので 消える（見えない床イベントとして ずっと 残ることもない）。 */
const cutscene = (
	col: number,
	row: number,
	commands: EventCommand[],
	emoji = "",
): ObjectDef =>
	newObject({
		emoji,
		col,
		row,
		objType: "event",
		behavior: "still",
		hazard: false,
		speed: 0,
		// 絵文字を出さない床イベントは、エディタでだけ イベントマーカーを 半透明で出す
		...(emoji ? {} : { editorSprite: localSysTileUrl(7, 8) }),
		pages: [
			{
				trigger: "playerTouch",
				conditions: { selfSwitchId: "A", selfSwitchValue: false },
				commands: [
					...commands,
					{ type: "setSelfSwitch", id: "A", value: true },
				],
			},
		],
	});

/** つぎの シーンへの 出口（一方通行）。 */
const exitTo = (
	emoji: string,
	col: number,
	row: number,
	sceneId: string,
	entryCol: number,
	entryRow: number,
): ObjectDef =>
	newObject({
		emoji,
		col,
		row,
		objType: "warp",
		hazard: false,
		hp: 1,
		speed: 0,
		behavior: "still",
		bullet: "none",
		message: "",
		warpSceneId: sceneId,
		warpEntryCol: entryCol,
		warpEntryRow: entryRow,
	});

/** ひとばん とまれる ネットカフェ（ゴールドで HP 全回復）。 */
const inn = (
	emoji: string,
	col: number,
	row: number,
	price: number,
	greet: string,
	look?: { spriteRef: string; spriteUrl: string },
): ObjectDef =>
	newObject({
		emoji,
		col,
		row,
		behavior: "still",
		hazard: false,
		speed: 0,
		...look,
		pages: [
			{
				conditions: {},
				commands: [
					{
						type: "choice",
						text: greet,
						choices: [
							{
								label: `とまる（${price}G）`,
								commands: [
									{
										type: "ifGold",
										amount: price,
										then: [
											{ type: "changeGold", amount: -price },
											{
												type: "playEffect",
												effectId: FX_HEAL,
												target: "player",
											},
											{ type: "restoreHp" },
											{
												type: "message",
												text: "リクライニングせきで ぐっすり ねむった。\nHPが まんたんに なった！",
											},
										],
										else: [
											{
												type: "message",
												text: "ゴールドが たりないみたい……",
											},
										],
									},
								],
							},
							{ label: "やめておく", commands: [] },
						],
					},
				],
			},
		],
	});

// ══════════════════════════════════════════════════════════════════════════
// シーン1：dat落ちの谷（開始地点）
// ══════════════════════════════════════════════════════════════════════════
/** わらいの「ｗ」が 生えて しげった くさ。 */
const KUSA: FoeSpec = {
	name: "くさ",
	emoji: "🌿",
	hp: 18,
	atk: 5,
	def: 1,
	exp: 3,
	gold: 6,
	// 下から にょきにょき 生えてくる ｗ（みどりの 弾が ゆっくり 上へ）
	miniScript: `
while true
  shotAngle(randF(20, 156), 182, 270, randF(1.2, 1.8), 4, 3)
  wait(12)
end while
`.trim(),
	dialogue: [
		{ text: "ｗｗｗ レス きたｗｗｗ うれしいｗ", actUsed: "レスする" },
		{ text: "ｗ？ なんの はなしｗ", actUsed: "はなす" },
		{ text: "くさ……（てれて ちょっと かれた）", actUsed: "ほめる" },
		{ text: "ｗ…… かれそう……", hpBelowPct: 30 },
		{ text: "おおきな くさに なれそうｗ", mercyAbovePct: 70 },
		{ text: "ｗｗｗｗｗ", hpAbovePct: 80 },
		"くさ はえる……",
	],
};

/** ｶﾞｯ を まっている ぬるぽ。 */
const NURUPO: FoeSpec = {
	name: "ぬるぽ",
	emoji: "🫥",
	hp: 14,
	atk: 4,
	def: 1,
	exp: 2,
	gold: 5,
	// よこから ひょこっと とびだす
	miniScript: `
while true
  shotSide(true, randF(20, 156), 1.6, 3, 8)
  wait(14)
end while
`.trim(),
	dialogue: [
		{ text: "ｶﾞｯ！…… それや、それが ほしかったんや", actUsed: "レスする" },
		{ text: "……ｶﾞｯ って して くれへんの？", actUsed: "はなす" },
		{ text: "ぬ、ぬるぽ……（うれしそうだ）", actUsed: "ほめる" },
		{ text: "ぬる……ぽ……", hpBelowPct: 30 },
		"ぬるぽ",
	],
};

/** 3にちで かきこみが とまった スレの カレンダー。 */
const MIKKA: FoeSpec = {
	name: "みっかぼうず",
	emoji: "📅",
	hp: 22,
	atk: 4,
	def: 2,
	exp: 4,
	gold: 7,
	dialogue: [
		{ text: "レス？ ……じゃあ もう 1にち がんばる", actUsed: "レスする" },
		{ text: "……あしたから ほんき だす", actUsed: "はなす" },
		{ text: "3にちも つづいたって ほめられた……", actUsed: "ほめる" },
		{ text: "……きょうは もう ええわ……", hpBelowPct: 30 },
		{ text: "4にちめ、いけそうな きが する", mercyAbovePct: 70 },
		"……3にちで とまってもうた スレやねん……",
	],
	moves: [
		{
			name: "くりこし",
			power: 5,
			// きのうの ぶんの ページが ぱらぱら 降る
			miniScript: `
while true
  shotRain(randF(1.2, 2.0), 3, 7)
  wait(9)
end while
`.trim(),
		},
	],
};

/** 谷の番人。スレを 1000まで うめたい スレぬし（「レスする」で 敵意が 下がる＝スレが のびる）。 */
const ICCHI: FoeSpec = {
	name: "スレぬしの イッチ",
	emoji: "👹",
	hp: 150,
	atk: 13,
	def: 10,
	exp: 40,
	gold: 40,
	spriteId: SPR.oni,
	// 通常攻撃：オレンジの レスが ゆっくり 降る
	miniScript: `
while true
  shotRain(randF(1.3, 1.9), 5, 7)
  wait(15)
end while
`.trim(),
	dialogue: [
		{
			text: "レス きたで！ あと ちょいで 1000や！",
			actUsed: "レスする",
			mercyAbovePct: 60,
		},
		{ text: "おっ レス きたやんけ！ のびてきたで！", actUsed: "レスする" },
		{ text: "……で、なんの はなしや。スレチやぞ", actUsed: "はなす" },
		{ text: "せやろ？ ワイの スレ ええやろ？", actUsed: "ほめる" },
		{ text: "ワイの スレ…… おちてまう……", hpBelowPct: 30 },
		{ text: "もう すぐ 1000や…… ありがとな", mercyAbovePct: 80 },
		{ text: "まだまだ いくで！ スレ たてたんは ワイや！", hpAbovePct: 80 },
		"ここで ずっと かきこもうや！",
	],
	moves: [
		{
			name: "かくさん きぼう",
			power: 10,
			// 上から 扇形に ひろがる レス
			miniScript: `
setDuration(300)
while true
  a = rand(60, 120)
  for i in range(-2, 2, 1)
    shotAngle(88, -4, a + i * 14, 1.8, 4, 1)
  end for
  wait(24)
end while
`.trim(),
			dialogue: [
				{ text: "みんなに ひろめてや！", hpAbovePct: 50 },
				"ひろまれ…… ワイの スレ……",
			],
		},
	],
};

const valleyMap = M([
	"VVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
	"VVVVVVVVVVVVppppppVVVVVVVVVVVV",
	"VVVVVVVVVVVppppppppVVVVVVVVVVV",
	"VVVVVVVVVVVppppppppVVVVVVVVVVV",
	"VVVVVVVVVVV.pppppp.VVVVVVVVVVV",
	"VVVVVVVVVVVVVV.VVVVVVVVVVVVVVV",
	"VV.pp...m.................p.VV",
	"VV..................p......mVV",
	"VV...VV....VV....VV....VV...VV",
	"VV...VV....VV....VV....VV...VV",
	"VVm......p...........m......VV",
	"VV.m.....................pp.VV",
	"VVVV..VVVVVVVV..VVVVVVVV..VVVV",
	"VV.......mVVVV..VVVV.......pVV",
	"VV........VVVV..VVVV........VV",
	"VV........VVVV..VVVV........VV",
	"VV........VVVV..VVVV........VV",
	"VVmm......VVVV..VVVV......ppVV",
	"VVVVVVVVVVVVVV.VVVVVVVVVVVVVVV",
	"VVVVVVVVVVVVVV.VVVVVVVVVVVVVVV",
	"VVVVVVVVVVVVVV.VVVVVVVVVVVVVVV",
	"VVVVVVVVVVVVVV.VVVVVVVVVVVVVVV",
	"VVVVVVVVVVVVVV.VVVVVVVVVVVVVVV",
	"VVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
]);

const sceneValley: SceneDef = {
	id: "valley",
	name: "dat落ちの谷",
	map: valleyMap,
	bgm: FUSATSU_FIELD,
	randomEncounters: [encounter(KUSA), encounter(NURUPO), encounter(MIKKA)],
	encounterRate: 22,
	objects: [
		// ホシュとの出会い（すいこまれて 出てきた ログの山から 出る 1マスの通路。ふむと なかまに なる）
		cutscene(
			14,
			5,
			[
				{
					type: "message",
					text: "ちいさな ろうそくが ふわふわ うかんでいる……",
				},
				{
					type: "message",
					text: "ホシュ「おっ、がめんの むこうから すいこまれてきたんか。だいじょうぶか？\nここは『ログのはざま』。dat落ちした スレの なかみが のこる ところや」",
				},
				{
					type: "message",
					text: "ホシュ「ワイは ホシュ。おちた スレが さむならんように、\nずっと ほしゅ して まわっとるんや」",
				},
				{
					type: "message",
					text: "ホシュ「もとの がめんに もどりたいんやろ？ でぐちは 次スレの とびらや。\nほな、ワイも ついてったるわ」",
				},
				{ type: "message", text: "🕯️ ホシュが なかまに くわわった！" },
				{
					type: "message",
					text: "ホシュ「ここの じゅうにんは、だれにも レスを もらえんで\nさみしがっとるだけや。たおさんでも ええ」",
				},
				{
					type: "message",
					text: "ホシュ「たたかいに なったら『こうどう』で こころを ひらかせて、\n『みのがす』で にがしたろ。ワイは『まほう』で てつだうで」",
				},
			],
			"🕯️",
		),
		// 谷の じゅうにん・回復の ろうそく（左の へや）
		npc(
			"🙂",
			6,
			14,
			"ここは dat落ちの谷や。dat落ちした スレは、ぜんぶ いちど ここへ ながれつくんやで。ろうそくに さわると げんきに なるで。",
			walk(SPR.onchan),
		),
		candle(3, 14),
		chest(8, 16, [{ type: "giveItem", itemId: "muffler", count: 1 }]),
		// 右の へや（たからもの）
		chest(25, 14, [{ type: "giveItem", itemId: "waribashi", count: 1 }]),
		chest(26, 16, [{ type: "giveItem", itemId: "onigiri", count: 2 }]),
		chest(21, 16, [{ type: "changeGold", amount: 30 }]),
		// 谷の じゅうにん（シンボルエンカウント）
		symbol(KUSA, 8, 7, { behavior: "random" }),
		symbol(KUSA, 21, 10, { behavior: "random" }),
		symbol(MIKKA, 15, 10, { behavior: "random", speed: 0.8 }),
		// 番人の へやの 前の 看板
		readable(
			"🪧",
			16,
			11,
			[
				"看板「この さき スレぬしの へや。\n※1000まで うめてから おかえりください」",
			],
			deco(DECO.sign),
		),
		// 番人の 前口上（1マスの 通路を ふむと 1回だけ 流れる）
		cutscene(14, 18, [
			{
				type: "message",
				text: "おおきな オニが みちを ふさいでいる……",
			},
			{
				type: "message",
				text: "イッチ「まてや。ワイは この スレの >>1、イッチや。\nこの スレ、あと すこしで 1000 いくねん」",
			},
			{
				type: "message",
				text: "イッチ「さきへ すすむんなら、ワイの スレを\n1000まで うめてからに せえ！」",
			},
			{
				type: "message",
				text: "ホシュ「……たたかわんでも ええ。『レスする』で スレを\nのばしたったら、きっと とおしてくれるで」",
			},
		]),
		symbol(ICCHI, 14, 20, { encounterMax: 1, speed: 0 }),
		// 出口 → ほしゅ横丁
		exitTo("🕳️", 14, 22, "town", 14, 1),
	],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン2：ほしゅ横丁（おちばの まう ゆうぐれの 路地。まいにち ほしゅが かきこまれる）
// ══════════════════════════════════════════════════════════════════════════
/** よその レスを くわえて いく まとめの カラス。 */
const MATOME_CROW: FoeSpec = {
	name: "まとめガラス",
	emoji: "🐦",
	hp: 28,
	atk: 8,
	def: 4,
	exp: 9,
	gold: 14,
	// 左右から 交互に かすめとりに くる
	miniScript: `
while true
  shotSide(true, randF(20, 156), 2.0, 4, 7)
  wait(13)
  shotSide(false, randF(20, 156), 2.0, 4, 7)
  wait(13)
end while
`.trim(),
	dialogue: [
		{
			text: "カァ？ ワイに レス？ ……まとめんと とっとくわ",
			actUsed: "レスする",
		},
		{ text: "カァ！ その はなし、まとめて ええか？", actUsed: "はなす" },
		{ text: "カァ…… ほめても てんさいは せえへんで", actUsed: "ほめる" },
		{ text: "カァ…… はねが ぬけてきた……", hpBelowPct: 30 },
		{ text: "カァ！ おまえの レス、げんぶんで のこしとくわ", mercyAbovePct: 70 },
		"カァ！ その レス まとめたろか！",
	],
};

/** ほしゅ しか いわなくなった ちょうちん。 */
const HOSHU_LANTERN: FoeSpec = {
	name: "ほしゅちょうちん",
	emoji: "🏮",
	hp: 26,
	atk: 7,
	def: 5,
	exp: 8,
	gold: 12,
	// ハートを ねらって とんでくる ひのこ
	miniScript: `
while true
  shotAimed(1.6, 5, 7)
  wait(20)
end while
`.trim(),
	dialogue: [
		{ text: "ほしゅ…… ほしゅ…… あ、レス ありがとう", actUsed: "レスする" },
		{ text: "ほしゅ。……ほかの ことば わすれてもうた", actUsed: "はなす" },
		{ text: "ほしゅ！（ぽっと あかるく なった）", actUsed: "ほめる" },
		{ text: "ほ……しゅ……（ひが きえそうだ）", hpBelowPct: 30 },
		"ほしゅ。ほしゅ。ほしゅ。",
	],
};

/** なんでも あげたがる ふうせんの こども。 */
const AGE_BALLOON: FoeSpec = {
	name: "あげふうせん",
	emoji: "🎈",
	hp: 22,
	atk: 7,
	def: 3,
	exp: 7,
	gold: 10,
	// 下から ふわふわ あがってくる ふうせん
	miniScript: `
while true
  shotAngle(randF(20, 156), 182, 270, randF(0.9, 1.5), 3, 2)
  wait(9)
end while
`.trim(),
	dialogue: [
		{ text: "わーい、レスで あがった！", actUsed: "レスする" },
		{ text: "sage？ なにそれ、あげよ あげよ！", actUsed: "はなす" },
		{ text: "えへへ、もっと たかく とべそう！", actUsed: "ほめる" },
		{ text: "しぼんでまう～", hpBelowPct: 30 },
		"age！ age！",
	],
};

/** 横丁の番人。スレの ルール（sage進行）を まもらせたい sageけいさつ。 */
const SAGE_POLICE: FoeSpec = {
	name: "sageけいさつ",
	emoji: "👮",
	hp: 180,
	atk: 16,
	def: 13,
	exp: 55,
	gold: 60,
	// 通常攻撃：ハートを ねらって とぶ ふえの ひびき
	miniScript: `
while true
  shotAimed(2.1, 5, 3)
  wait(18)
end while
`.trim(),
	dialogue: [
		{
			text: "……sage で レスしとるな。ええ こころがけや",
			actUsed: "レスする",
			mercyAbovePct: 60,
		},
		{ text: "レスは ええけど、あげたら あかんで！", actUsed: "レスする" },
		{ text: "……はなしは きく。ルールは まもれよ", actUsed: "はなす" },
		{ text: "な、なんや。ほめても ルールは かわらんで", actUsed: "ほめる" },
		{ text: "くっ…… ルールが…… まもれへん……", hpBelowPct: 30 },
		{ text: "おまえ、なかなか マナーの ええ やつやな", mercyAbovePct: 70 },
		{ text: "ここは sage進行や！ さわぐやつは とおさへん！", hpAbovePct: 80 },
		"スレの ルールは ぜったいや！",
	],
	moves: [
		{
			name: "sageの おもし",
			power: 12,
			// ハートが おもくなって 下に おちる（重力モード）。足元を はしる 弾を ジャンプで よける。
			// ときどき 中くらいの 高さにも 1発 まぜて、とびっぱなしだと あたるようにしてある
			undertaleMode: "blue",
			miniScript: `
setDuration(300)
while true
  shotSide(true, 166, 2.2, 5, 3)
  wait(30)
  shotSide(false, 166, 2.6, 5, 3)
  wait(30)
  shotSide(true, 120, 2.0, 4, 3)
  wait(20)
end while
`.trim(),
			dialogue: ["sage は おもたいやろ？ それが ルールの おもみや！"],
		},
		{
			name: "テンプレ せつめい",
			power: 10,
			// よこ一列の 弾の かべ。すきまは 毎回 ちがう ばしょに あく
			miniScript: `
setDuration(280)
while true
  gap = rand(1, 7)
  for i in range(0, 9, 1)
    if i != gap and i != gap + 1
      shot(8 + i * 18, -6, 0, 1.6, 5, 3)
    end if
  end for
  wait(46)
end while
`.trim(),
			dialogue: ["まずは >>1 の テンプレを よめ！"],
		},
	],
};

const townMap = M([
	"TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
	"TsssssssssssssrrsssssssssTTTTT",
	"TsssssssssssssrrsssssssssTTTTT",
	"TsssssssssTTssrrsssssssssTTTTT",
	"TsssBBBBBsTTssrrssssBBBBBTTTTT",
	"TsssBBBBBsssssrrssssBBBBBTTTTT",
	"TsssBBBBBsssssrrssssBBBBBTTTTT",
	"TsssssssssssssrrsssssssssTTTTT",
	"TsssssssssssssrrsssssssssTTTTT",
	"TsssssssssssssrrsssssssssTTTTT",
	"TsssssssssssssrrsssssssssTTTTT",
	"TrrrrrrrrrrrrrrrrrrrrrrrrrrrrT",
	"TrrrrrrrrrrrrrrrrrrrrrrrrTTTTT",
	"TsssssssssssssrrsssssssssTTTTT",
	"TsssssssssssssrrsssssssssTTTTT",
	"TsssssssssssssrrsssssssssTTTTT",
	"TsssBBBBBsssssrrssssBBBBBTTTTT",
	"TsssBBBBBsssssrrssssBBBBBTTTTT",
	"TsssBBBBBsssssrrssssBBBBBTTTTT",
	"TsssssssssssssrrssTTsssssTTTTT",
	"TsTTssssssssssrrssTTsssssTTTTT",
	"TsTTssssssssssrrsssssssssTTTTT",
	"TsssssssssssssrrsssssssssTTTTT",
	"TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
]);

const sceneTown: SceneDef = {
	id: "town",
	name: "ほしゅ横丁",
	map: townMap,
	bgm: FUSATSU_TOWN,
	weather: { kind: "leaves", intensity: 0.5, speed: 0.6, opacity: 0.8 },
	randomEncounters: [
		encounter(MATOME_CROW),
		encounter(HOSHU_LANTERN),
		encounter(AGE_BALLOON),
	],
	encounterRate: 20,
	objects: [
		readable(
			"🪧",
			13,
			2,
			["看板「ようこそ ほしゅ横丁へ。\nまいにちの ほしゅを わすれずに」"],
			deco(DECO.sign),
		),
		inn(
			"💺",
			6,
			7,
			20,
			"ネットカフェの てんちょう「いらっしゃい。リクライニングせき、\nひとばん 20ゴールドや。ドリンクバーも つけとくで」",
		),
		newObject({
			emoji: "🐱",
			col: 22,
			row: 7,
			behavior: "still",
			hazard: false,
			speed: 0,
			...walk(SPR.cat),
			shopItems: [
				{ itemId: "onigiri", price: 8 },
				{ itemId: "nurucha", price: 12 },
				{ itemId: "oden", price: 18 },
				{ itemId: "bat", price: 45 },
				{ itemId: "dotera", price: 40 },
			],
			pages: [
				{
					conditions: {},
					commands: [
						{
							type: "message",
							text: "くろねこ「いらっしゃい。バットは やきう せんようやないで。\nなんにでも つかえるで」",
						},
					],
				},
			],
		}),
		npc(
			"🧑",
			7,
			15,
			"ほしゅ。……ほしゅ。……これで 3650にち れんぞく や。やめたら スレが おちてまうからな。",
			deco(DECO.nanJ),
		),
		npc(
			"🧒",
			16,
			9,
			"よこちょうの でぐちの sageけいさつ、こわいけど ほんまは やさしいんやで。ルールを まもらん ひとが きらいなだけ。",
		),
		chest(3, 19, [{ type: "giveItem", itemId: "nurucha", count: 2 }]),
		symbol(MATOME_CROW, 10, 8, { behavior: "patrolH" }),
		symbol(HOSHU_LANTERN, 20, 14),
		symbol(HOSHU_LANTERN, 12, 20, { behavior: "random", speed: 0.6 }),
		// 番人の 前口上（でぐちへ つづく 1マスの 道）
		cutscene(25, 11, [
			{
				type: "message",
				text: "ふえを くわえた けいかんが こちらを にらんでいる……",
			},
			{
				type: "message",
				text: "けいかん「ピピーッ！ ここから さきは sage進行の いき。\nあげて さわぐ やつは とおさへんで！」",
			},
			{
				type: "message",
				text: "けいかん「……おまえ、さっきから メール欄 からっぽやんけ。\nあげとるやろ！ ルール いはんや！」",
			},
			{
				type: "message",
				text: "ホシュ「ほんまは ルールを まもりたい だけの ひとなんや。\nはなしを きいたったら ええ」",
			},
		]),
		symbol(SAGE_POLICE, 27, 11, { encounterMax: 1, speed: 0 }),
		// 出口 → ながれの ちていこ
		exitTo("🚪", 28, 11, "lake", 2, 2),
	],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン3：ながれの ちていこ（ながされた スレが しずむ 地底湖）
// ══════════════════════════════════════════════════════════════════════════
const COPY_BOT: FoeSpec = {
	name: "コピペロボ",
	emoji: "🤖",
	hp: 34,
	atk: 11,
	def: 6,
	exp: 13,
	gold: 18,
	spriteId: SPR.copyBot,
	// まいかい まったく おなじ ならびの 弾（コピペ）
	miniScript: `
while true
  for i in range(0, 4, 1)
    shot(20 + i * 34, -6, 0, 2.0, 4, 6)
  end for
  wait(34)
end while
`.trim(),
	dialogue: [
		{
			text: "レス ありがとう！ レス ありがとう！ レス ありがとう！",
			actUsed: "レスする",
		},
		{ text: "はなしかけてくれて（ｒｙ", actUsed: "はなす" },
		{ text: "ほめても なにも でえへんで（コピペ）", actUsed: "ほめる" },
		{ text: "こ、こ、こぴぺ が…… とぎれ……", hpBelowPct: 30 },
		"（いつもの コピペ）（いつもの コピペ）",
	],
};

/** ながされた かきこみを つめた ボトルレター。 */
const BOTTLE_LETTER: FoeSpec = {
	name: "ボトルレター",
	emoji: "🍾",
	hp: 36,
	atk: 11,
	def: 6,
	exp: 14,
	gold: 20,
	// 左右から 同時に ながれてくる
	miniScript: `
while true
  y = randF(30, 146)
  shotSide(true, y, 2.2, 4, 4)
  shotSide(false, 176 - y, 2.2, 4, 4)
  wait(20)
end while
`.trim(),
	dialogue: [
		{ text: "ちゃぷ…… へんじが きた……！", actUsed: "レスする" },
		{ text: "ちゃぷ？ なかみ よんでくれるん？", actUsed: "はなす" },
		{ text: "びんの いろ、きれいやろ？", actUsed: "ほめる" },
		{ text: "ちゃぷ…… しずんでまう……", hpBelowPct: 30 },
		"ちゃぷちゃぷ…… だれか ひろって……",
	],
};

/** きえそうな レスが まるく なった あぶく。 */
const BUBBLE: FoeSpec = {
	name: "あぶく",
	emoji: "🫧",
	hp: 30,
	atk: 10,
	def: 5,
	exp: 12,
	gold: 16,
	// まんなかで くるくる まわりながら あぶくを はきだす
	miniScript: `
a = 0
while true
  shotAngle(88, 20, a, 1.3, 4, 2)
  shotAngle(88, 20, a + 180, 1.3, 4, 2)
  a = a + 17
  wait(10)
end while
`.trim(),
	dialogue: [
		{ text: "ぷか～…… うれしい～", actUsed: "レスする" },
		{ text: "ぷかぷか…… なんやった？", actUsed: "はなす" },
		{ text: "まんまる やろ～", actUsed: "ほめる" },
		{ text: "はじけてまう～", hpBelowPct: 30 },
		"ぷか～……",
	],
};

/** ちていこの番人。ながれた スレへの かきこみを きせい する ロボット。 */
const KISEI: FoeSpec = {
	name: "キセイ",
	emoji: "🤖",
	hp: 210,
	atk: 19,
	def: 15,
	exp: 75,
	gold: 70,
	spriteId: SPR.banBot,
	// 通常攻撃：画面の はしから ハートを ねらう あかい 弾
	miniScript: `
while true
  shotAimed(2.3, 5, 1)
  wait(16)
end while
`.trim(),
	dialogue: [
		{
			text: "……きせい、かいじょ しても ええ？",
			actUsed: "レスする",
			mercyAbovePct: 60,
		},
		{
			text: "レス けんしゅつ…… きせい たいしょう…… ではない……？",
			actUsed: "レスする",
		},
		{ text: "かいわ ログを きろく します", actUsed: "はなす" },
		{
			text: "エラー： ほめられた ときの ルールが ありません",
			actUsed: "ほめる",
		},
		{ text: "システム ていし まで あと すこし……", hpBelowPct: 30 },
		{ text: "……あなたは あらし では ありませんね", mercyAbovePct: 70 },
		{ text: "この さきは かきこみ きんし です", hpAbovePct: 80 },
		"アクセス きせい ちゅう です",
	],
	moves: [
		{
			name: "アクきんの や",
			power: 13,
			// ハートは うごけない（シールドモード）。とんでくる むきに 方向キーで たてを かまえる
			undertaleMode: "green",
			miniScript: `
setDuration(300)
while true
  d = rand(0, 3)
  if d == 0
    shot(-6, 88, 2.2, 0, 5, 1)
  else if d == 1
    shot(182, 88, -2.2, 0, 5, 1)
  else if d == 2
    shot(88, -6, 0, 2.2, 5, 1)
  else
    shot(88, 182, 0, -2.2, 5, 1)
  end if
  wait(26)
end while
`.trim(),
			dialogue: [
				"アクセス きんし の や を はっしゃ します。たてで ふせいで ください",
			],
		},
		{
			name: "きせいの あらし",
			power: 15,
			// あかと むらさきの 弾が みっしり 降る
			miniScript: `
setDuration(280)
while true
  shotRain(randF(1.8, 2.6), 4, 1)
  shotRain(randF(1.8, 2.6), 4, 2)
  wait(9)
end while
`.trim(),
		},
	],
};

const lakeMap = M([
	"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
	"CccccccccccccccccccccCCccccccC",
	"CcccccCCcccccccccccccCCccccccC",
	"CcccccCCcccccccccccccccccccccC",
	"CccccccccccccccccccccccccccccC",
	"CccccccccccccccccccccccccccccC",
	"CwwwwwwwwwwwwwbwwwwwwwwwwwwwwC",
	"CwwwwwwwwwwwwwbwwwwwwwwwwwwwwC",
	"CwwwwwwwwwwwwwbwwwwwwwwwwwwwwC",
	"CwwwwwwwwwwwwwbwwwwwwwwwwwwwwC",
	"CwwwwwwwwwwwwwbwwwwwwwwwwwwwwC",
	"CwwwwwwwwwwwwwbwwwwwwwwwwwwwwC",
	"CwwwwwwwwwwwwwbwwwwwwwwwwwwwwC",
	"CwwwwwwwwwwwwwbwwwwwwwwwwwwwwC",
	"CwwwwwwwwwwwwwbwwwwwwwwwwwwwwC",
	"CwwwwwwwwwwwwwbwwwwwwwwwwwwwwC",
	"CccccccccccccccccccccccccccccC",
	"CcccccccccccccccccccccCCcccccC",
	"CcccCCccccccccccccccccCCcccccC",
	"CcccCCcccccccccccccccccccccccC",
	"CcccccccccCCcccccccccccccccccC",
	"CcccccccccCCcccccccccccccccccC",
	"CccccccccccccccccccccccccccccC",
	"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
]);

const sceneLake: SceneDef = {
	id: "lake",
	name: "ながれの ちていこ",
	map: lakeMap,
	bgm: FUSATSU_CAVE,
	randomEncounters: [
		encounter(BOTTLE_LETTER),
		encounter(BUBBLE),
		encounter(COPY_BOT),
	],
	encounterRate: 18,
	objects: [
		// きたの きし
		readable("📜", 9, 4, [
			"ふるい かきこみが ただよっている……\n『だれか おるか？ ……おらんか』",
		]),
		candle(12, 4),
		newObject({
			emoji: "🧳",
			col: 25,
			row: 3,
			behavior: "still",
			hazard: false,
			speed: 0,
			...walk(SPR.merchant),
			shopItems: [
				{ itemId: "oden", price: 18 },
				{ itemId: "curry", price: 35 },
				{ itemId: "headphones", price: 110 },
			],
			pages: [
				{
					conditions: {},
					commands: [
						{
							type: "message",
							text: "ながれの しょうにん「ながれてきた もんは なんでも うるで。\nヘッドホンは あらしの こえが きこえへんように なる すぐれもんや」",
						},
					],
				},
			],
		}),
		chest(27, 1, [{ type: "giveItem", itemId: "pudding", count: 1 }]),
		symbol(COPY_BOT, 18, 3, { behavior: "random" }),
		readable(
			"🪧",
			15,
			5,
			["看板「この さき ながれの はし。\n※きせい ちゅう」"],
			deco(DECO.sign),
		),
		// 番人の 前口上（はしの 上）
		cutscene(14, 7, [
			{
				type: "message",
				text: "はしの まんなかに ロボットが たちふさがっている……",
			},
			{
				type: "message",
				text: "キセイ「ピピッ。ここは ながれの ちていこ。\nながれた スレへの かきこみは きせい たいしょう です」",
			},
			{
				type: "message",
				text: "キセイ「あなたの かきこみ りれきを しらべて います……」",
			},
			{
				type: "message",
				text: "ホシュ「きかいやけど、ちゃんと はなしは きいてくれるはずや。\nレスで つたえたろ」",
			},
		]),
		symbol(KISEI, 14, 11, { encounterMax: 1, speed: 0 }),
		// みなみの きし
		readable("📜", 19, 18, [
			"ふるい かきこみが ただよっている……\n『この スレ みとる やつ、げんきに しとるか？』",
		]),
		chest(2, 21, [{ type: "giveItem", itemId: "keyboard", count: 1 }]),
		symbol(COPY_BOT, 8, 17, { behavior: "random" }),
		// 出口 → かこログの しょこ
		exitTo("🕳️", 27, 21, "archive", 14, 1),
	],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン4：かこログの しょこ（おちた スレを ぜんぶ しまっておく しょこ）
// ══════════════════════════════════════════════════════════════════════════
/** さいごの ボス。1000を こえた スレを しめる『1001』（次スレの とびらの じょうまえ）。
 *  「おわった スレは しずかに ねむらせる」のが しごとで、だれも かきこめないように している。
 *  たおしても みのがしても クリア（isBoss）。 */
const LOCK_1001: FoeSpec = {
	name: "1001",
	emoji: "🔒",
	hp: 280,
	atk: 20,
	def: 17,
	exp: 300,
	gold: 0,
	// 通常攻撃：上の いろんな ばしょから 3まいずつ 降ってくる ページ
	miniScript: `
while true
  x = randF(20, 156)
  for i in range(-1, 1, 1)
    shotAngle(x, -4, 90 + i * 18, 2.0, 4, 7)
  end for
  wait(20)
end while
`.trim(),
	dialogue: [
		{
			text: "……1000を こえた スレに、まだ レスが つくんか",
			actUsed: "レスする",
			mercyAbovePct: 60,
		},
		{
			text: "かきこみ できません。……できへん、はずなんやけどな",
			actUsed: "レスする",
		},
		{ text: "はなしても かわらん。スレは いつか おちる", actUsed: "はなす" },
		{ text: "ほめても あかへんで。……わるい きは せんけど", actUsed: "ほめる" },
		{ text: "……ここまで か……", hpBelowPct: 20 },
		{ text: "しまるのが ワイの しごとや。ひくに ひけん", hpBelowPct: 50 },
		{ text: "……おまえら、しつこいな。ええ いみで", mercyAbovePct: 70 },
		"このスレッドは 1000を こえました。もう かけません",
	],
	moves: [
		{
			name: "ログの あらし",
			power: 15,
			// オレンジと むらさきの ページが ながい あいだ みっしり 降る
			miniScript: `
setDuration(320)
while true
  shotRain(randF(1.6, 2.4), 4, 7)
  shotRain(randF(1.6, 2.4), 4, 2)
  wait(8)
end while
`.trim(),
			dialogue: [
				{ text: "まだや…… まだ しめきれてへん……", hpBelowPct: 30 },
				"おわった スレは、しずかに ねむらせたれ",
			],
		},
		{
			name: "たてよみ",
			power: 16,
			// 3本の よこ線の うえだけを うごける（レーンモード）。1本だけ あいている 線へ にげる
			undertaleMode: "purple",
			miniScript: `
setDuration(320)
while true
  free = rand(0, 2)
  for i in range(0, 2, 1)
    if i != free
      shotSide(i % 2 == 0, 40 + i * 48, 2.4, 6, 6)
    end if
  end for
  wait(36)
end while
`.trim(),
			dialogue: ["たてに よんでみい。……『か・け・な・い』や"],
		},
		{
			name: "レスバトル",
			power: 14,
			// ハートから 弾を うてる（Z / Enter）。降ってくる ことばを うちおとす
			undertaleMode: "yellow",
			miniScript: `
setDuration(300)
while true
  shotPlayer(randF(20, 156), -6, 1.8, 6, 1)
  wait(16)
end while
`.trim(),
			dialogue: [
				{ text: "……ことばで かえしてくるんか", actUsed: "はなす" },
				"レスバトル や！ いいかえして みい！",
			],
		},
	],
};

const archiveMap = M([
	"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
	"AAAAAAAAAASSffaaffSSAAAAAAAAAA",
	"AAAAAAAAAASSffaaffSSAAAAAAAAAA",
	"AAAAAAAAAASSSfaafSSSAAAAAAAAAA",
	"AAAAAAAAAASSffaaffSSAAAAAAAAAA",
	"AAAAAAAAAASSffaaffSSAAAAAAAAAA",
	"AAAAAAAAAASSSfaafSSSAAAAAAAAAA",
	"AAAAAAAAAASSffaaffSSAAAAAAAAAA",
	"AAAAAAAAAASSffaaffSSAAAAAAAAAA",
	"AAAAAAAAAASSSfaafSSSAAAAAAAAAA",
	"AAAAAAAAAASSffaaffSSAAAAAAAAAA",
	"AAAAAAAAAASSffaaffSSAAAAAAAAAA",
	"AAAAAAAAAASSffaaffSSAAAAAAAAAA",
	"AAAAAAAAAASSSSaSSSSSAAAAAAAAAA",
	"AAAAAfffffffffaafffffffffAAAAA",
	"AAAAAfSSSSffffaaffffSSSSfAAAAA",
	"AAAAAfSSSSffffaaffffSSSSfAAAAA",
	"AAAAAfffffffffaafffffffffAAAAA",
	"AAAAAfffffffffaafffffffffAAAAA",
	"AAAAAfSSSSffffaaffffSSSSfAAAAA",
	"AAAAAfSSSSffffaaffffSSSSfAAAAA",
	"AAAAAfffffffffaafffffffffAAAAA",
	"AAAAAffffffffffffffffffffAAAAA",
	"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
]);

const sceneArchive: SceneDef = {
	id: "archive",
	name: "かこログの しょこ",
	map: archiveMap,
	bgm: FUSATSU_CASTLE,
	// ほこりが きらきら ただよう
	weather: { kind: "sparkles", intensity: 0.3, speed: 0.4, opacity: 0.5 },
	objects: [
		npc(
			"🧕",
			16,
			4,
			"ここは かこログの しょこ。おちた スレは ぜんぶ ここに ならんでいます。いちばん おくの とびらは 次スレへ つづいて いますが、1001が かぎを かけて しまいました。",
			walk(SPR.librarian),
		),
		readable("📜", 13, 8, [
			"ほんだなに ふるい スレが しまわれている……\n『【はじまり】 この いたの いちばん さいしょの スレ』",
		]),
		chest(16, 10, [{ type: "giveItem", itemId: "curry", count: 2 }]),
		candle(13, 11),
		// 1001との 対話（へやへの 1マスの いりぐち）。どちらを えらんでも たたかいに なる
		cutscene(14, 13, [
			{
				type: "message",
				text: "おくの とびらに、おおきな じょうまえが ぶらさがっている……",
			},
			{
				type: "message",
				text: "1001「このスレッドは 1000を こえました。\nもう かけないので、ここで おしまいです」",
			},
			{
				type: "choice",
				text: "1001「……かいても かいても、スレは いつか おちる。\nそれでも まだ かくんか？」",
				choices: [
					{
						label: "かく",
						commands: [
							{
								type: "message",
								text: "1001「……ほな、その レスで ワイを あけてみい」",
							},
						],
					},
					{
						label: "……わからない",
						commands: [
							{
								type: "message",
								text: "1001「わからんでも ええ。\nワイは しまるのが しごとや。それだけや」",
							},
						],
					},
				],
			},
			{
				type: "message",
				text: "ホシュ「ナナシ、こわさんでも ええ。\n1001にも レスで こたえたろ」",
			},
		]),
		readable("📕", 10, 17, [
			"ほんを ひらくと、たくさんの レスが ならんでいる。\n『おつ』『おつ』『おつ』……",
		]),
		readable("📗", 19, 17, [
			"『この スレは 1000を こえました。\nあたらしい スレを たててください。』",
		]),
		symbol(LOCK_1001, 14, 20, {
			encounterMax: 1,
			speed: 0,
			isBoss: true,
			outroDialogue: [
				{
					speaker: "1001",
					emoji: "🔒",
					text: "……1000を こえても、まだ かきこむ やつが おるんやな。",
				},
				{
					speaker: "ホシュ",
					emoji: "🕯️",
					side: "right",
					text: "おちても、だれかが また スレを たてる。\nワイは ずっと それを みてきたんや。",
				},
				{
					speaker: "ナナシ",
					emoji: "👧",
					side: "right",
					text: "……次スレ、いっしょに たてよう。",
				},
				{
					speaker: "1001",
					emoji: "🔓",
					text: "……ほな、>>1 は まかせたで。\n次スレで あおな。",
				},
			],
		}),
	],
};

// ══════════════════════════════════════════════════════════════════════════
// アイテム・装備
// ══════════════════════════════════════════════════════════════════════════
const CONSUMABLES: ItemDef[] = [
	{
		id: "onigiri",
		name: "ほしゅおにぎり",
		emoji: "🍙",
		description: "HPを 15 回復する。ほしゅする ひとの さしいれ",
		category: "consumable",
		healHp: 15,
	},
	{
		id: "nurucha",
		name: "ぬるいおちゃ",
		emoji: "🍵",
		description: "HPを 22 回復する。いれてから だいぶ たっている",
		category: "consumable",
		healHp: 22,
	},
	{
		id: "oden",
		name: "おでん",
		emoji: "🍢",
		description: "HPを 30 回復する。ほしゅ横丁の めいぶつ",
		category: "consumable",
		healHp: 30,
	},
	{
		id: "curry",
		name: "カレー",
		emoji: "🍛",
		description: "HPを 45 回復する。ながれの しょうにんの とくせい",
		category: "consumable",
		healHp: 45,
	},
	{
		id: "pudding",
		name: "なまえつきプリン",
		emoji: "🍮",
		description: "HPを 90 回復する。ふたに だれかの なまえが かいてある",
		category: "consumable",
		healHp: 90,
	},
];

/** 装備品。手に入れると その場で 装備される（items の category）。
 *  攻撃力・守備力の ボーナスは weapons / armors 側から 引かれるので、同じ id で 両方に 入れておく。 */
interface Gear {
	id: string;
	name: string;
	emoji: string;
	description: string;
	atkBonus?: number;
	defBonus?: number;
}
const WEAPON_GEAR: Gear[] = [
	{
		id: "waribashi",
		name: "わりばし",
		emoji: "🥢",
		description: "きれいに われた。こうげき力＋4",
		atkBonus: 4,
	},
	{
		id: "bat",
		name: "やきうバット",
		emoji: "🏏",
		description: "よく しなる。こうげき力＋10",
		atkBonus: 10,
	},
	{
		id: "keyboard",
		name: "メカニカルキーボード",
		emoji: "⌨️",
		description: "カチャカチャ うるさい。こうげき力＋18",
		atkBonus: 18,
	},
];
const ARMOR_GEAR: Gear[] = [
	{
		id: "muffler",
		name: "マフラー",
		emoji: "🧣",
		description: "くびもとが あたたかい。しゅび力＋4",
		defBonus: 4,
	},
	{
		id: "dotera",
		name: "どてら",
		emoji: "🧥",
		description: "よふかしの おとも。しゅび力＋9",
		defBonus: 9,
	},
	{
		id: "headphones",
		name: "ヘッドホン",
		emoji: "🎧",
		description: "あらしの こえが きこえなくなる。しゅび力＋15",
		defBonus: 15,
	},
];

// ══════════════════════════════════════════════════════════════════════════
// プリセット本体
// ══════════════════════════════════════════════════════════════════════════
export const fusatsu: PresetData = {
	id: "fusatsu",
	name: "不殺RPG",
	engine: "rpg",
	gravity: 0,
	friction: 0,
	player: {
		emoji: "👧",
		color: "#6ecbff",
		speed: 3,
		jumpPower: 0,
		w: TILE_SIZE,
		h: TILE_SIZE,
		start: { x: TILE_SIZE * 14, y: TILE_SIZE * 2 }, // 谷の かこログの 山の うえ
		spriteRef: wr(SPR.nanashi),
		spriteUrl: sa(SPR.nanashi),
	},
	tiles,
	map: JSON.parse(JSON.stringify(valleyMap)),
	objects: [...sceneValley.objects],
	scenes: [sceneValley, sceneTown, sceneLake, sceneArchive],
	scroll: { worldCols: 30, worldRows: 24 },
	battle: {
		playerName: "ナナシ",
		// パーティ制の弾幕よけ（エディタ表記「弾幕よけ（パーティ）」）。タイミングバーの たたかう・
		// こうどうで 敵意を さげて みのがす・TP の まほう・まもる。
		style: "deltarune",
		// エンカウント演出は 黒フラッシュ＋パーティ戦の 和音（sfx.encounter）
		encounterEffect: "flash",
		// ハートは 方向キー（と 画面の 十字キー）だけで うごかす
		dodgePointer: false,
		maxHp: 30,
		maxMp: 0,
		atk: 8,
		def: 6,
		gold: 0,
		moves: [
			// mercy 持ちの技は「こうどう」：ダメージを あたえず 敵意ゲージを ためる（満タンで「みのがす」）。
			// どの 敵も 2回くらいで みのがせる かずに してある。敵ごとの 反応は dialogue の actUsed で かえている。
			{ name: "はなす", cost: 0, power: 0, mercy: 40 },
			{ name: "ほめる", cost: 0, power: 0, mercy: 50 },
			{ name: "レスする", cost: 0, power: 0, mercy: 60 },
		],
		labels: {
			attack: "たたかう",
			move: "こうどう",
			flee: "にげる",
			item: "もちもの",
			mercy: "みのがす",
		},
		// party[0]＝フィールドの 操作キャラ（ナナシ）。HP は フィールドと 共有し、レベルアップで のびる。
		// party[1]＝ホシュ。戦闘の たびに maxHp から はじまる 同行キャラ。呪文を もつので 2番目の
		// コマンドが「まほう」に なる（「こうどう」は ナナシだけ）。
		party: [
			{
				id: "nanashi",
				name: "ナナシ",
				emoji: "👧",
				maxHp: 30,
				color: "#6ecbff",
			},
			{
				id: "hoshu",
				name: "ホシュ",
				emoji: "🕯️",
				maxHp: 28,
				color: "#ffb347",
				spells: [
					// なかま全員を 回復（たおれた なかまも 回復量が たりれば たちあがる）
					{ name: "ほしゅ", tpCost: 32, power: 24, heal: true },
					// スレを おしあげる ほのお（タイミングバー なしの 確定ダメージ）
					{ name: "あげ", tpCost: 50, power: 30, effectId: FX_FLAME },
				],
			},
		],
		growth: { hp: 6, mp: 0, atk: 2, def: 2, agility: 1 },
	},
	items: [
		...CONSUMABLES,
		...WEAPON_GEAR.map((g) => ({ ...g, category: "weapon" as const })),
		...ARMOR_GEAR.map((g) => ({ ...g, category: "armor" as const })),
	],
	weapons: WEAPON_GEAR.map((g) => ({ ...g, restrictTo: ["nanashi"] })),
	armors: ARMOR_GEAR.map((g) => ({ ...g, restrictTo: ["nanashi"] })),
	effects: [
		{
			id: FX_FLAME,
			name: "炎",
			imageRef: "url:/assets/game-effects/flame.png",
			imageUrl: "/assets/game-effects/flame.png",
			frameCount: 12,
			fps: 15,
			sfx: gameSfxRef("effectFire"),
		},
		{
			id: FX_HEAL,
			name: "回復",
			imageRef: "url:/assets/game-effects/heal.png",
			imageUrl: "/assets/game-effects/heal.png",
			frameCount: 12,
			fps: 15,
			sfx: gameSfxRef("effectHeal"),
		},
	],
	titleScreen: {
		enabled: true,
		heading: "不殺RPG",
		subtitle: "ログのはざまで、だれも ころさない",
		bgmRef: FUSATSU_CAVE.ref,
		textColor: "#ffffff",
		menu: [{ kind: "newGame", label: "スレを ひらく" }],
	},
	ending: {
		enabled: true,
		heading: "おわり",
		message:
			"1001の じょうまえが はずれて、とびらが ひらいた。\nナナシと ホシュと ログのはざまの みんなは\nまっさらな 次スレへ なだれこんでいった。\n\nその日、あたらしい スレが たった。\n【朗報】ログのはざまから みんなで かえってきた\n\n——レスが ひとつ あれば、スレは また のびる。",
		bgmRef: FUSATSU_TOWN.ref,
		textColor: "#ffe9a8",
	},
	bgm: FUSATSU_FIELD,
	battleBgm: FUSATSU_BATTLE,
	bossBgm: FUSATSU_BOSS,
	// エンジン内蔵のオリジナルSE（lib/game-sfx.ts）。cursor/confirm/cancel/text は フィールドの メニューと
	// NPC の 頭上セリフでも 戦闘と 同じ 音を 鳴らすための 指定。
	sfx: {
		encounter: gameSfxRef("encounterParty"),
		levelup: gameSfxRef("levelUp"),
		purchase: gameSfxRef("menuConfirm"),
		inn: gameSfxRef("heal"),
		save: gameSfxRef("save"),
		damage: gameSfxRef("hurt"),
		clear: gameSfxRef("clear"),
		cursor: gameSfxRef("menuMove"),
		confirm: gameSfxRef("menuConfirm"),
		cancel: gameSfxRef("menuCancel"),
		text: gameSfxRef("textVoice"),
	},
};
