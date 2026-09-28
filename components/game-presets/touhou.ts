import { gameSfxRef } from "@/lib/game-sfx";
import { sAnimUrl as sa, spriteUrl as sp } from "@/lib/rpgen-assets";
import { TOUHOU_BOSS, TOUHOU_STAGE } from "./bgm-library";
import {
	type DialogueLine,
	newObject,
	type PresetData,
	VIEW_COLS,
	VIEW_H,
	VIEW_ROWS,
	VIEW_W,
} from "./shared";

// 東方Project の二次創作（上海アリス幻樂団「東方Project」二次創作ガイドラインに沿ったファン作品）。
// キャラクター名・スペルカード名は原作のものを使うが、原作ゲームの画像・音声・楽曲は一切使わない
// （BGM は bgm-library.ts のオリジナル MML、効果音は内蔵のオリジナル合成音）。
// 二次創作であることはタイトル画面とエンディングに明記する。

// ── MiniScript テンプレート ────────────────────────────────────────────────

/** 道中 wave 敵共通：上から降下しながら自機狙い弾を撃ち、下へ退場する */
const waveMiniScript = (
	shots: number,
	fireInterval: number,
	speed: number,
	color: number,
	jitter: number,
) =>
	`
wait(row * 25)
moveTo(startX, 90, 50)
wait(10)
for t in range(0, ${shots - 1}, 1)
  shotPlayer(${speed}, ${color}, ${jitter})
  wait(${fireInterval})
end for
moveTo(startX, ${VIEW_H + 50}, 70)
exit()
`.trim();

/** 道中 wave 敵（自機方向への扇状弾バージョン） */
const waveSpreadScript = (
	shots: number,
	fireInterval: number,
	ways: number,
	spread: number,
	speed: number,
	color: number,
) =>
	`
wait(row * 25)
moveTo(startX, 90, 50)
wait(10)
for t in range(0, ${shots - 1}, 1)
  shotN(${ways}, getPlayerAngle(), ${spread}, ${speed}, ${color})
  wait(${fireInterval})
end for
moveTo(startX, ${VIEW_H + 50}, 70)
exit()
`.trim();

// id は rpgen-search API の id フィールド（ハッシュ文字列）
const walkRef = (id: string) => `walk:auto:u:${sa(id)}`;
const ir = (id: string) => `url:${sp(id)}`;

/** 道中の妖精（col=出現列、row=出現の時間差段） */
const fairy = (
	col: number,
	row: number,
	spriteId: string,
	miniScript: string,
	speed = 1.0,
) =>
	newObject({
		emoji: "🧚",
		col,
		row,
		phase: 0,
		speed,
		hp: 2,
		bullet: "none",
		miniScript,
		spriteRef: walkRef(spriteId),
		spriteUrl: sa(spriteId),
	});

// 会話の話者。立ち絵画像は持たせず絵文字で出す（side で左右に振り分ける）。
const REIMU = { speaker: "霊夢", emoji: "🎀", side: "left" } as const;
const CIRNO = { speaker: "チルノ", emoji: "🌸", side: "right" } as const;
const line = (
	who: typeof REIMU | typeof CIRNO,
	text: string,
): DialogueLine => ({ ...who, text });

/**
 * 見本：道中（妖精5体）→ ボス戦（通常弾幕＋スペルカード2枚）の2フェーズ。
 * HP が triggerHp を下回るとスペルカードに切り替わる。
 */
export const touhou: PresetData = {
	id: "touhou",
	name: "東方(弾幕)",
	engine: "touhou",
	gravity: 0,
	friction: 0,
	player: {
		emoji: "🎀",
		color: "#ff0000",
		speed: 4.5,
		jumpPower: 0,
		w: 24,
		h: 24,
		start: { x: VIEW_W / 2 - 12, y: VIEW_H - 60 },
		// 東方Projectシート (sheet no 17) の先頭キャラ
		spriteRef: walkRef("pqnkMA"),
		spriteUrl: sa("pqnkMA"),
		// ボム設定（カットインの立ち絵は出典の分からない画像を使わないため持たせない＝名前だけ出る）
		bombCount: 3,
		bombSpellName: "霊符「夢想天生」",
		bombCutinCharName: "博麗霊夢",
	},
	tiles: {
		0: {
			name: "夜空",
			color: "#0B0B2A",
			passable: true,
			imageRef: ir("X1lgbYC"),
			imageUrl: sp("X1lgbYC"),
		},
		1: {
			name: "壁",
			color: "#1a1a3a",
			passable: false,
			imageRef: ir("vcyXmCw"),
			imageUrl: sp("vcyXmCw"),
		},
	},
	map: Array.from({ length: VIEW_ROWS }, () =>
		Array.from({ length: VIEW_COLS }, (_, x) =>
			x === 0 || x === VIEW_COLS - 1 ? 1 : 0,
		),
	),

	// ── BGM（オリジナル MML）────────────────────────────────────────────────
	bgm: TOUHOU_STAGE,
	bossBgm: TOUHOU_BOSS,

	// ─────────────────────────────────────────────────────────────────────────
	// フェーズ定義
	//   0: 道中   (wave) - 妖精が時間差で降りてきて撃って帰る。BGM は道中曲のまま
	//   1: ボス戦 (boss) - 会話 → ボス戦BGMへ切り替え、スペルカードあり → 撃破後の会話
	// ─────────────────────────────────────────────────────────────────────────
	phases: [
		{
			id: "wave1",
			kind: "wave",
			label: "道中",
			scoreBonus: 500,
		},
		{
			id: "boss",
			kind: "boss",
			label: "ボス戦",
			scoreBonus: 10000,
			dialogue: [
				line(REIMU, "やけに冷えると思ったら…あんたの仕業ね。"),
				line(CIRNO, "ここから先は通さないよ！まとめて凍らせてやる！"),
				line(REIMU, "はいはい、さっさと片付けるわよ。"),
			],
			outroDialogue: [
				line(CIRNO, "う…今日はちょっと調子が悪かっただけなんだから…"),
				line(REIMU, "次からは調子に乗らないことね。"),
				line(CIRNO, "ぜ、絶対リベンジしてやる〜！"),
			],
		},
	],

	objects: [
		// ── フェーズ 0：道中（妖精5体。row が大きいほど遅れて降りてくる）──────────
		fairy(4, 0, "qyR3Q0", waveMiniScript(3, 75, 2.5, 5, 10)),
		fairy(10, 0, "qyR3Q0", waveMiniScript(3, 75, 2.5, 5, 10)),
		fairy(5, 1, "dFy4bF", waveSpreadScript(3, 80, 3, 30, 2.0, 8), 0.9),
		fairy(9, 1, "dFy4bF", waveSpreadScript(3, 80, 3, 30, 2.0, 8), 0.9),
		fairy(7, 2, "qyR3Q0", waveMiniScript(4, 70, 2.2, 6, 15), 0.8),

		// ── フェーズ 1：ボス戦（チルノ）────────────────────────────────────────
		// 通常弾幕（回転する12方向リング）＋スペルカード2枚。
		newObject({
			emoji: "🌸",
			col: 7,
			row: 1,
			phase: 1,
			hp: 200,
			bullet: "none",
			bulletSpeed: 0,
			bulletColor: "#fff",
			fireRate: 999,
			isBoss: true,
			name: "チルノ",
			spriteRef: `url:${sp("NM9zuG")}`,
			spriteUrl: sp("NM9zuG"),
			miniScript: `
moveTo(${VIEW_W / 2}, 80, 90)
rot = 0
while true
  for i in range(0, 11, 1)
    shot(rot + i * 30, 2.5, 4)
  end for
  rot = rot + 7
  wait(4)
end while
`.trim(),
			spellCards: [
				{
					name: "凍符「パーフェクトフリーズ」",
					triggerHp: 130,
					// 12方向リング ＋ 自機狙いの加速弾
					miniScript: `
moveTo(rand(80, ${VIEW_W - 80}), 80, 40)
while true
  for i in range(0, 11, 1)
    shot(i * 30, 2.6, 4)
  end for
  shotPlayerAccel(1.2, 0.08, 4.0, 150, 3, 6)
  wait(5)
end while
`.trim(),
				},
				{
					name: "雪符「ダイアモンドブリザード」",
					triggerHp: 50,
					// 加速弾 ＋ 自機方向への扇状弾。加速弾は180フレームで消える
					miniScript: `
moveTo(${VIEW_W / 2}, 65, 25)
while true
  for i in range(0, 7, 1)
    shotPlayerAccel(0.5, 0.12, 5.0, 180, 1, 4)
  end for
  shotN(6, getPlayerAngle(), 30, 3.2, 4)
  wait(4)
end while
`.trim(),
				},
			],
		}),
	],
	// タイトル／エンディング画面はエンジン非依存のオーバーレイなので東方エンジンでも表示される。
	titleScreen: {
		enabled: true,
		heading: "東方弾幕ごっこ",
		subtitle:
			"【東方Projectの二次創作です】 方向キーで移動（弾は自動連射）／ Shift で低速移動 ／ X でボム",
		textColor: "#ffd0e6",
		menu: [{ kind: "newGame", label: "はじめる" }],
	},
	ending: {
		enabled: true,
		heading: "ALL CLEAR",
		message:
			"道中もボスも すべて突破した！\nチルノの氷はとけ、幻想郷に静けさが戻った。\n\n※この作品は東方Projectの二次創作です（原作：上海アリス幻樂団）。",
		textColor: "#ffd0e6",
	},
	// 効果音は内蔵のオリジナル合成音（lib/game-sfx）。
	sfx: {
		graze: gameSfxRef("graze"),
		damage: gameSfxRef("hurt"),
		spellcard: gameSfxRef("spellCast"),
		// クリア時のジングル（全フェーズ突破 → エンディング画面）
		clear: gameSfxRef("clear"),
	},
};
