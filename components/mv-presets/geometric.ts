// 「ジオメトリック」プリセット。
// 参考動画: C.mp4（4分・暗いティール一色＋周辺減光）
//   中央に白い図形が「1種類だけ」置かれ、音が鳴った瞬間だけ濃く・太くなる。
//   参考動画の場面転換は **16秒ごと＝8小節ごと** にきっちり乗っていて、
//   そのたびに中央のモチーフが 点 → 輪 → 二重丸 → 角のある形 … と掛け替わる。
//   常時回転・波紋の連発・加算グローの類は一切使わない（動きは音の瞬間だけ）。
// 画像を1枚も使わないので、MMLだけ用意すれば完成する（＝いちばん手前の入口）。

import type {
	MvLayer,
	MvLayerGroup,
	MvManifest,
	MvSection,
	MvShapeLayer,
} from "@/lib/mv-config";
import { cloneManifest, type MvPresetEntry, mvTrack, rest } from "./shared";

const BARS = 64;

// ── 旋律。1要素＝1小節（l4＝4分音符4つ）。オクターブは断片の中で必ず戻す ──
const MELODY = [
	// イントロ: ほとんど鳴らない。図形が「たまに灯る」だけの時間
	...rest(2),
	"a2 r2",
	"r1",
	...rest(2),
	"e2 r2",
	"r1",
	// A
	"e a b a",
	"a2 r2",
	"g a b a",
	"g2 r2",
	"e a b a",
	"a b >c< b",
	"a1",
	"r1",
	// A'
	"e a b a",
	"a2 r2",
	"b >c d c<",
	"b2 r2",
	"a b >c< b",
	"g a b a",
	"e1",
	"r1",
	// B
	"a b >c< b",
	">c d e d<",
	"b >c d c<",
	"a2 b2",
	"g a b >c<",
	"b a g e",
	"a1",
	"a1",
	// サビ
	">e d c< b",
	"a b >c< b",
	">d c< b a",
	"g a b >c<",
	">e2 d2<",
	">c< b a g",
	"a1",
	"a1",
	// 間奏
	"r1",
	"a2 r2",
	"r1",
	"e2 r2",
	"r1",
	"g2 r2",
	...rest(2),
	// A''
	"e a b a",
	"a2 r2",
	"b >c d c<",
	"b2 r2",
	"a b >c< b",
	"g a b a",
	"e1",
	"r1",
	// アウトロ
	"e a b a",
	"a2 r2",
	"e2 g2",
	"a1",
	"r1",
	"a1",
	...rest(2),
];

// ── 低音。1小節1音（l1）──
const BASS = [
	"a",
	"a",
	"f",
	"f",
	"c",
	"c",
	"g",
	"g",
	"a",
	"a",
	"f",
	"f",
	"c",
	"c",
	"e",
	"e",
	"a",
	"a",
	"f",
	"f",
	"d",
	"d",
	"e",
	"e",
	"f",
	"f",
	"c",
	"c",
	"g",
	"g",
	"e",
	"e",
	"a",
	"a",
	"f",
	"f",
	"c",
	"c",
	"g",
	"g",
	"a",
	"a",
	"f",
	"f",
	"d",
	"d",
	"e",
	"e",
	"a",
	"a",
	"f",
	"f",
	"d",
	"d",
	"e",
	"e",
	"a",
	"a",
	"f",
	"f",
	"c",
	"c",
	"e",
	"a",
];

// ── 合図の高音。ここが鳴った小節だけ太い輪が出る（accent レイヤー）──
const ACCENT = [
	"r",
	"r",
	"r",
	"r",
	"r",
	"r",
	"r",
	"e",
	"r",
	"r",
	"r",
	"e",
	"r",
	"r",
	"r",
	"c",
	"r",
	"r",
	"r",
	"e",
	"r",
	"r",
	"r",
	"g",
	"r",
	"r",
	"e",
	"r",
	"r",
	"r",
	"c",
	"r",
	"e",
	"r",
	"r",
	"c",
	"r",
	"r",
	"g",
	"r",
	"r",
	"r",
	"r",
	"r",
	"r",
	"r",
	"r",
	"e",
	"r",
	"r",
	"r",
	"e",
	"r",
	"r",
	"r",
	"c",
	"r",
	"r",
	"e",
	"r",
	"r",
	"r",
	"r",
	"r",
];

const MML = [
	"#volume=45",
	mvTrack("@0 t92 q90 v88 o5 l4", MELODY, BARS),
	mvTrack("@1 t92 q90 v58 o3 l1", BASS, BARS),
	mvTrack("@2 t92 q30 v50 o6 l1", ACCENT, BARS),
].join("");

const INK = "#f5fffd";

/**
 * 中央の図形の共通形。
 * 「×トラックの打点」で普段は消し、「＋定数」で薄い輪郭だけ残す——
 * この2行が参考動画の「音が鳴った瞬間だけ濃くなる」の正体。
 */
function motif(
	over: Partial<MvShapeLayer> & { id: string; sections: string[] },
): MvShapeLayer {
	return {
		kind: "shape",
		form: "ring",
		x: 320,
		y: 180,
		size: 40,
		rotation: 0,
		color: INK,
		filled: false,
		thickness: 1.2,
		z: 20,
		modulators: [
			{
				source: "trackOnset",
				track: 0,
				target: "opacity",
				op: "mul",
				amount: 1,
			},
			{ source: "constant", target: "opacity", op: "add", amount: 0.16 },
			{
				source: "trackOnset",
				track: 0,
				target: "thickness",
				op: "add",
				amount: 2.4,
			},
		],
		...over,
	};
}

// 場面は8小節ごと。参考動画の転換周期（16秒＝8小節）に合わせてある。
const SECTIONS: MvSection[] = [
	{
		id: "intro",
		label: "イントロ（点）",
		startBar: 0,
		stage: { bgColor: "#0e423c" },
	},
	{
		id: "a",
		label: "輪",
		startBar: 8,
		stage: { bgColor: "#0e423c" },
		transition: { style: "fade", beats: 0.75 },
	},
	{
		id: "b",
		label: "二重丸",
		startBar: 16,
		stage: { bgColor: "#0d3b3f" },
		transition: { style: "fade", beats: 0.75 },
	},
	{
		id: "c",
		label: "四角とひし形",
		startBar: 24,
		stage: { bgColor: "#123f36" },
		transition: { style: "fade", beats: 0.75 },
	},
	// サビだけ地の色が上がり、転換も白で抜ける
	{
		id: "sabi",
		label: "サビ（十字）",
		startBar: 32,
		stage: { bgColor: "#12574d" },
		transition: { style: "flash", beats: 0.75 },
	},
	{
		id: "inter",
		label: "間奏（同心円）",
		startBar: 40,
		stage: { bgColor: "#0b3a36" },
		transition: { style: "fade", beats: 1 },
	},
	{
		id: "d",
		label: "三角",
		startBar: 48,
		stage: { bgColor: "#103f45" },
		transition: { style: "fade", beats: 0.75 },
	},
	{
		id: "end",
		label: "アウトロ（点へ戻る）",
		startBar: 56,
		stage: { bgColor: "#081f1d" },
		transition: { style: "fade", beats: 1.5 },
	},
];

const LAYERS: MvLayer[] = [
	// ── 全編: 周辺減光。参考動画の「四隅が沈んだ暗い画面」 ──────────
	{
		kind: "effect",
		id: "vignette",
		style: "vignette",
		trigger: "always",
		amount: 0.55,
		color: "#031512",
	},

	// ── 点。イントロとアウトロで同じ形に戻る（円環構成）──────────────
	motif({
		id: "dot",
		form: "circle",
		size: 3,
		filled: true,
		sections: ["intro", "end"],
		modulators: [
			{ source: "trackEnergy", track: 0, target: "size", op: "add", amount: 4 },
		],
	}),

	// ── 細い輪 ────────────────────────────────────────────
	motif({
		id: "ring-a",
		size: 44,
		sections: ["a"],
		modulators: [
			{
				source: "trackOnset",
				track: 0,
				target: "opacity",
				op: "mul",
				amount: 1,
			},
			{ source: "constant", target: "opacity", op: "add", amount: 0.16 },
			{
				source: "trackOnset",
				track: 0,
				target: "thickness",
				op: "add",
				amount: 2.4,
			},
			{ source: "trackEnergy", track: 0, target: "size", op: "add", amount: 6 },
		],
	}),

	// ── 二重の輪＋ベースで灯る芯（的のかたち）────────────────────
	// この2枚は「的」という1つのモチーフを成す組なので、レイヤーの
	// 「グループ化」機能の実例として最初からグループにしてある（見た目は変わらない・
	// 一覧でまとめて動かせるだけの整理）。
	motif({
		id: "ring-b",
		size: 26,
		thickness: 1.4,
		count: 2,
		spread: 22,
		sections: ["b"],
		groupId: "grp-target-b",
	}),
	motif({
		id: "core-b",
		form: "circle",
		size: 12,
		filled: true,
		z: 21,
		sections: ["b"],
		groupId: "grp-target-b",
		modulators: [
			{
				source: "trackOnset",
				track: 1,
				target: "opacity",
				op: "mul",
				amount: 1.1,
			},
			{ source: "constant", target: "opacity", op: "add", amount: 0.05 },
			{ source: "trackOnset", track: 1, target: "size", op: "add", amount: 4 },
		],
	}),

	// ── 細い四角の枠＋ベースで満ちるひし形 ─────────────────────
	// こちらもグループ化の実例（枠＋中身のひし形で1つのモチーフ）。
	motif({
		id: "frame-c",
		form: "square",
		size: 34,
		thickness: 1,
		sections: ["c"],
		groupId: "grp-frame-c",
		modulators: [
			{
				source: "trackOnset",
				track: 0,
				target: "opacity",
				op: "mul",
				amount: 1,
			},
			{ source: "constant", target: "opacity", op: "add", amount: 0.15 },
		],
	}),
	motif({
		id: "diamond-c",
		form: "diamond",
		size: 30,
		filled: true,
		z: 21,
		sections: ["c"],
		groupId: "grp-frame-c",
		modulators: [
			{
				source: "trackOnset",
				track: 1,
				target: "opacity",
				op: "mul",
				amount: 1.2,
			},
			{ source: "constant", target: "opacity", op: "add", amount: 0.04 },
		],
	}),

	// ── サビ: 十字と、その外を囲む輪。いちばん大きい画 ───────────────
	motif({
		id: "cross-s",
		form: "cross",
		size: 58,
		thickness: 1.4,
		z: 21,
		sections: ["sabi"],
		modulators: [
			{
				source: "trackOnset",
				track: 0,
				target: "opacity",
				op: "mul",
				amount: 1,
			},
			{ source: "constant", target: "opacity", op: "add", amount: 0.2 },
			{
				source: "trackOnset",
				track: 0,
				target: "thickness",
				op: "add",
				amount: 3,
			},
			{
				source: "trackEnergy",
				track: 0,
				target: "size",
				op: "add",
				amount: 10,
			},
		],
	}),
	motif({
		id: "ring-s",
		size: 78,
		thickness: 1,
		sections: ["sabi"],
		modulators: [
			{
				source: "trackOnset",
				track: 1,
				target: "opacity",
				op: "mul",
				amount: 1,
			},
			{ source: "constant", target: "opacity", op: "add", amount: 0.1 },
			{ source: "trackOnset", track: 1, target: "size", op: "add", amount: 8 },
		],
	}),

	// ── 間奏: 同心円が3重に。低音の打点で外側から順に灯る（stagger）──
	motif({
		id: "rings-i",
		size: 22,
		thickness: 1,
		count: 3,
		spread: 30,
		stagger: 24,
		sections: ["inter"],
		modulators: [
			{
				source: "trackOnset",
				track: 1,
				target: "opacity",
				op: "mul",
				amount: 1,
			},
			{ source: "constant", target: "opacity", op: "add", amount: 0.09 },
			{
				source: "trackOnset",
				track: 1,
				target: "thickness",
				op: "add",
				amount: 1.8,
			},
		],
	}),

	// ── 三角。1つは上向き、もう1つは伏せて重ねる ─────────────────
	// 上向き＋逆向きの三角で六芒星ふうに重なる組。これもグループ化の実例。
	motif({
		id: "tri-d",
		form: "triangle",
		size: 40,
		thickness: 1.2,
		sections: ["d"],
		groupId: "grp-star-d",
	}),
	motif({
		id: "tri-d2",
		form: "triangle",
		size: 40,
		rotation: 180,
		thickness: 1,
		z: 21,
		sections: ["d"],
		groupId: "grp-star-d",
		modulators: [
			{
				source: "trackOnset",
				track: 1,
				target: "opacity",
				op: "mul",
				amount: 1,
			},
			{ source: "constant", target: "opacity", op: "add", amount: 0.08 },
		],
	}),

	// ── 全編: 高音の合図でだけ現れる太い輪（アクセント）─────────────
	motif({
		id: "accent",
		size: 46,
		thickness: 3.5,
		z: 22,
		sections: [],
		modulators: [
			{
				source: "trackOnset",
				track: 2,
				target: "opacity",
				op: "mul",
				amount: 1.4,
			},
			{ source: "trackOnset", track: 2, target: "size", op: "add", amount: 10 },
		],
	}),
];

// 上の LAYERS に groupId で振り分けた3組。「グループ化」機能の実例として、
// 初期データの時点でいくつかのレイヤーが最初からグループ化された状態にしてある。
const GROUPS: MvLayerGroup[] = [
	{ id: "grp-target-b", name: "的（二重丸）" },
	{ id: "grp-frame-c", name: "四角とひし形" },
	{ id: "grp-star-d", name: "三角の組" },
];

const MANIFEST: MvManifest = {
	version: 1,
	preset: "geometric",
	title: "無題のトラック",
	mml: MML,
	audio: { mode: "soundfontKoe" },
	stage: {
		bgColor: "#0e423c",
		bgFit: "cover",
		// 背景は静止。呼吸させると全編が同じ律動になってしまう（参考動画は無音部で完全に静止する）
		pulse: "none",
		fadeIn: true,
		fadeOut: true,
		palette: ["#f5fffd", "#e0f5f1", "#cdeae5", "#b7ded7"],
	},
	sections: SECTIONS,
	layers: LAYERS,
	groups: GROUPS,
};

export const GEOMETRIC_PRESET: MvPresetEntry = {
	kind: "geometric",
	name: "音ハメサークル",
	description:
		"暗い画面の中央にひとつだけ置かれた白い図形が、音の瞬間だけ濃くなる。8小節ごとに点→輪→二重丸→十字→同心円…と姿を変える64小節構成。",
	swapHint:
		"素材は要りません。「場面」タブで場面ごとの地の色と切り替え方を、「レイヤー」タブで各場面のモチーフを差し替えられます。",
	build: () => cloneManifest(MANIFEST),
};
