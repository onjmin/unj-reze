import {
	sAnimUrl as sa,
	spriteUrl as sp,
	soundUrl as su,
} from "@/lib/rpgen-assets";
import {
	newObject,
	type PresetData,
	VIEW_COLS,
	VIEW_H,
	VIEW_ROWS,
	VIEW_W,
} from "./shared";

// ── MiniScript テンプレート ────────────────────────────────────────────────

// 道中BGM（YouTube）
const DOCHU_BGM_URL = "https://www.youtube.com/watch?v=tTEj519jm9k";
// ボス戦BGM（YouTube）
const BOSS_BGM_URL = "https://www.youtube.com/watch?v=Yf6CIacmFJo";

/** YouTube URL → ref 文字列 */
const ytRef = (url: string) => url;

// id は rpgen-search API の id フィールド（ハッシュ文字列）
const walkRef = (id: string) => `walk:auto:u:${sa(id)}`;
const ir = (id: string) => `url:${sp(id)}`;

/**
 * 「試しにプリセットを見るだけ」の最小サンプル：自機 + ボス1体 + 弾幕1パターンのみ。
 * 会話パート・道中雑魚・中ボスは持たず、フェーズはボス戦1本だけにしてある。
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
		// ボム設定
		bombCount: 3,
		bombSpellName: "霊符「夢想天生」",
		bombCutinCharName: "博麗霊夢",
		bombCutinImageUrl: "https://i.imgur.com/4M92pLV.png",
		bombCutinImageX: 0,
		bombCutinImageY: -50,
		bombCutinScale: 1,
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

	// ── BGM ──────────────────────────────────────────────────────────────────
	bgm: { ref: ytRef(DOCHU_BGM_URL), src: DOCHU_BGM_URL, type: "youtube" },
	bossBgm: { ref: ytRef(BOSS_BGM_URL), src: BOSS_BGM_URL, type: "youtube" },

	// ─────────────────────────────────────────────────────────────────────────
	// フェーズ定義（最小サンプル：ボス戦のみ1本）
	// ─────────────────────────────────────────────────────────────────────────
	phases: [
		{
			id: "boss",
			kind: "boss",
			label: "ボス戦",
			scoreBonus: 10000,
		},
	],

	objects: [
		// ボス1体・弾幕1パターンのみのシンプル構成
		newObject({
			emoji: "🌸",
			col: 7,
			row: 1,
			phase: 0,
			hp: 100,
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
		}),
	],
	// タイトル／エンディング画面はエンジン非依存のオーバーレイなので東方エンジンでも表示される。
	titleScreen: {
		enabled: true,
		heading: "東方弾幕ごっこ",
		subtitle: "方向キーで移動（弾は自動連射）／ Shift で低速移動 ／ X でボム",
		textColor: "#ffd0e6",
		menu: [{ kind: "newGame", label: "はじめる" }],
	},
	ending: {
		enabled: true,
		heading: "ALL CLEAR",
		message: "ボスを突破した！\n\n——好きに改造して自分だけの弾幕を作ってみよう。",
		textColor: "#ffd0e6",
	},
	sfx: {
		graze: {
			ref: `direct:${su("8x4RbZ")}`,
			src: su("8x4RbZ"),
			type: "direct" as const,
		},
		damage: {
			ref: `direct:${su("EWsh6F")}#vol=25`,
			src: su("EWsh6F"),
			type: "direct" as const,
		},
		spellcard: {
			ref: `direct:${su("JrcaUb")}`,
			src: su("JrcaUb"),
			type: "direct" as const,
		},
		// クリア時のファンファーレ（全フェーズ突破 → エンディング画面）
		clear: {
			ref: `direct:${su("CvnSzp")}`,
			src: su("CvnSzp"),
			type: "direct" as const,
		},
	},
};
