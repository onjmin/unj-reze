// 「灯りのステージ」プリセット。
// 参考動画: チョウチン少女.mp4
//
// コマ送りとスリットスキャン（1px幅の縦スリットを時間方向に積んだx-t画像）で分かった構造:
//
//   1. 画面に出ているのは **位置が固定されたピアノロール** で、横に一切動かない。
//      x-t画像に斜めの筋が1本も出ず、縦線しか出ない＝スクロールしていない。
//      譜面は4小節ぶんが固定位置に並び、4小節経つとページごと差し替わる
//      （＝以前「4小節ごとの場面転換」に見えていたものの正体はページ送り）。
//   2. ノートは **まだ鳴っていないあいだは地の色+7%** しかない（実測 地33 / 未発音47 / 発音242）。
//      鳴った瞬間だけ白く塗りつぶされる。全部を濃く描くと「今どれが鳴っているか」が画から消える。
//   3. 音の頭で、ノート矩形の外へ **白い輪郭が広がりながら薄れていく**。
//      中身が暗くなったあとも枠だけが残って消える——これが映像側のリバーブ。
//   4. 中央の大きな図形は静的なモチーフではなく、**1小節ぶんを拡大表示したロール**。
//      拍ごとに別の形に見えていたのは、そのとき鳴っている音が変わっていただけ。
//
// 小道具（提灯・立て看板）は画像ではなく図形で組んである。
// 素材ゼロで成立させつつ、ユーザーが画像レイヤーに置き換えられるようにするため。

import type { MvLayer, MvManifest, MvSection } from "@/lib/mv-config";
import {
	cloneManifest,
	type MvPresetEntry,
	mvTrack,
	rep,
	rest,
	rozeBeat,
	rozeRef,
	rozeUrl,
} from "./shared";

const BARS = 64;
/** 場面の周期。参考動画のページ送り（4小節）と同じ刻みで小道具と歌詞を動かす。 */
const SCENE_BARS = 8;

// ── 旋律（l8）──
const N1 = "e r g r a r b r";
const N2 = "a r g r e r d r";
const N3 = "b r >c< r b r a r";
const N4 = "e r e r g r g r";
const N6 = "a4 g4 e4 d4";

const MELODY = [
	...rep(2, N4, N1, N4, N2), // 0-7   静かな導入
	...rep(2, N1, N2, N3, N6), // 8-15
	...rep(2, N1, N2, N3, N6), // 16-23
	...rep(2, N3, N6, N1, N2), // 24-31
	...rep(2, N3, N6, N3, N6), // 32-39 いちばん濃いところ
	...rep(2, N4, N1, N4, N2), // 40-47
	...rep(2, N1, N2, N3, N6), // 48-55
	...rep(2, N4, N1, N4, N4), // 56-63 引いていく
];

// ── 低音（l1）──
const BASS = [
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
	"c",
	"c",
	"e",
	"e",
	"a",
	"a",
	"f",
	"f",
	"e",
	"e",
	"a",
	"a",
];

// ── 和音（l1、1小節1和音）──
const Am = "[o3ao4co4e]1";
const F = "[o3fo3ao4c]1";
const C = "[o3co3eo3g]1";
const G = "[o3go3bo4d]1";
const Em = "[o3eo3go3b]1";
const Dm = "[o3do3fo3a]1";

const PAD = [
	Am,
	Am,
	F,
	F,
	C,
	C,
	Em,
	Em,
	Am,
	Am,
	F,
	F,
	C,
	C,
	G,
	G,
	Am,
	Am,
	F,
	F,
	Dm,
	Dm,
	Em,
	Em,
	F,
	F,
	C,
	C,
	G,
	G,
	Em,
	Em,
	Am,
	Am,
	F,
	F,
	C,
	C,
	G,
	G,
	Am,
	Am,
	F,
	F,
	Dm,
	Dm,
	Em,
	Em,
	Am,
	Am,
	F,
	F,
	C,
	C,
	Em,
	Em,
	Am,
	Am,
	F,
	F,
	Em,
	Em,
	Am,
	Am,
];

// ── 歌（l8、1小節6音）──
const V1 = "e g a b a g r4";
const V2 = "a b >c< b a g r4";
const V3 = ">c< b a g a b r4";
const V4 = "g a b >c< b a r4";

const singPhrase = (a: string, b: string, c: string, d: string) => [
	a,
	b,
	"r1",
	c,
	d,
	"r1",
	"r1",
	"r1",
];

const VOCAL = [
	...rest(8),
	...singPhrase(V1, V2, V1, V4),
	...singPhrase(V2, V3, V2, V4),
	...rest(8),
	...singPhrase(V3, V4, V3, V1),
	...rest(8),
	...singPhrase(V1, V2, V4, V3),
	...singPhrase(V3, V4, V3, V1),
];

// 20小節 × 6音 = 120音 ＝ 15行 × 8音節。
const LYRICS = [
	"まちのはずれには",
	"あかりがともるよ",
	"ちいさなこえだけ",
	"きこえてくるみち",
	"もういちどみたい",
	"まわらないはりが",
	"とまりつづけてる",
	"しずかにゆれてる",
	"あかいひかりだけ",
	"みちをてらしてる",
	"だれかのわらいご",
	"こえがとおくなる",
	"いきているはずも",
	"ないよるのなかで",
	"あかりだけがゆれ",
].join("\n");

const MML = [
	"#volume=48",
	mvTrack("@0 t142 q60 v82 o5 l8", MELODY, BARS),
	mvTrack("@1 t142 q80 v72 o2 l1", BASS, BARS),
	mvTrack("@2 t142 q90 v46 o3 l1", PAD, BARS),
	mvTrack("@3 t142 q70 v88 o4 l8", VOCAL, BARS),
	`@@3 klatt v150 ${LYRICS}`,
].join("\n");

// ── 小道具のSVGパス（100×100 の箱で設計）──────────────────
/** 提灯の胴。ふくらんだ縦長。 */
const LANTERN_BODY = "M32,22 C32,10 68,10 68,22 L68,72 C68,84 32,84 32,72 Z";
/** 提灯の上下の口金。2つのサブパスは重ならないので穴にならない。 */
const LANTERN_CAP =
	"M36,10 L64,10 L64,20 L36,20 Z M36,74 L64,74 L64,84 L36,84 Z";
/** 提灯の骨。線で描く。 */
const LANTERN_RIBS = "M32,34 L68,34 M31,47 L69,47 M32,60 L68,60";
/** 立て看板（A型）。 */
const SIGN = "M50,14 L84,90 L16,90 Z";
/** 看板の「！」。 */
const SIGN_MARK = "M46,42 L54,42 L52,68 L48,68 Z M47,74 L53,74 L53,82 L47,82 Z";

const SCENES = BARS / SCENE_BARS;
const scene = (i: number) => `s${String(i).padStart(2, "0")}`;

/**
 * 場面。譜面そのものは4小節ごとにページが変わるので、場面は小道具と歌詞の出し分けだけを担当する。
 * 参考動画と同じでほとんどが**カット**（覆いを挟まずに切り替わる）。
 * 曲の折り返しにあたる32小節目だけ白く抜けて、後半に入ったことが分かるようにしてある。
 */
const SECTIONS: MvSection[] = Array.from({ length: SCENES }, (_, i) => ({
	id: scene(i),
	label: `${i * SCENE_BARS}小節〜`,
	startBar: i * SCENE_BARS,
	...(i === 4 ? { transition: { style: "flash" as const, beats: 1 } } : {}),
}));

const LAYERS: MvLayer[] = [
	// ══ 背景の譜面。画面いっぱいに4小節ぶんを固定表示する ═══════════
	// opacity では下げない。全体を薄くすると「未発音」と「発音」の差まで潰れて
	// 全部が同じくらい光って見えてしまう（差は light.dim でつける）。
	{
		kind: "visualizer",
		id: "score",
		style: "pianoRoll",
		projection: "flat",
		flow: "page",
		rect: { x: -10, y: 24, w: 660, h: 320 },
		amount: 4,
		thickness: 1,
		light: {
			dim: 0.09,
			fadeOut: true,
			echo: { beats: 0.45, spread: 6, thickness: 1 },
		},
		z: 4,
	},

	// ══ 中央。同じ譜面を1小節ぶんだけ拡大して見せる ════════════════
	// 参考動画で「4小節ごとに形が変わるモチーフ」に見えていたものの正体がこれ。
	// 拍ごとに別の形に見えるのは、そのとき鳴っている音が変わっているだけ。
	{
		kind: "visualizer",
		id: "zoom",
		style: "pianoRoll",
		projection: "flat",
		flow: "page",
		rect: { x: 236, y: 120, w: 168, h: 104 },
		// トラックは絞らない。旋律だけにすると休符の小節で中身が空になる
		// （参考動画の中央は常に何かが映っている）。
		amount: 1,
		thickness: 1,
		// 狭い音域を大きく映す。曲全体の音域を収めるとノートが3pxに潰れて、
		// 参考動画の「大きな四角がひとつ」にならない。窓の外の音はオクターブで畳み込まれる。
		pitchRange: [60, 66],
		light: {
			dim: 0.22,
			fadeOut: true,
			echo: { beats: 0.6, spread: 14, thickness: 2 },
		},
		z: 20,
	},

	// ══ 左の提灯 ═══════════════════════════════════════════
	// 提灯の下から伸びる細い柄。bar を傾けて1本の棒にする
	// （path で線を描いても filled では塗られないので、棒は bar で作る）。
	{
		kind: "shape",
		id: "pole",
		form: "bar",
		x: 100,
		y: 226,
		size: 62,
		barAspect: 0.024,
		rotation: 100,
		color: "#6b7280",
		filled: true,
		thickness: 1,
		z: 8,
		modulators: [],
	},
	{
		kind: "shape",
		id: "lantern",
		form: "path",
		path: LANTERN_BODY,
		pathBox: [0, 0, 100, 100],
		x: 94,
		y: 122,
		size: 30,
		rotation: 0,
		color: "#c0392b",
		filled: true,
		thickness: 1,
		z: 10,
		modulators: [
			// 低音の打点でほんのわずかに膨らむ。揺れではなく「灯りが息をする」感じ
			{
				source: "trackOnset",
				track: 1,
				target: "size",
				op: "add",
				amount: 1.8,
			},
		],
	},
	{
		kind: "shape",
		id: "lantern-cap",
		form: "path",
		path: LANTERN_CAP,
		pathBox: [0, 0, 100, 100],
		x: 94,
		y: 122,
		size: 30,
		rotation: 0,
		color: "#4c0d0d",
		filled: true,
		thickness: 1,
		z: 11,
		modulators: [],
	},
	{
		kind: "shape",
		id: "lantern-ribs",
		form: "path",
		path: LANTERN_RIBS,
		pathBox: [0, 0, 100, 100],
		x: 94,
		y: 122,
		size: 30,
		rotation: 0,
		color: "#7f1d1d",
		filled: false,
		thickness: 1.6,
		z: 12,
		modulators: [],
	},

	// ══ 右の立て看板 ═══════════════════════════════════════
	{
		kind: "shape",
		id: "sign",
		form: "path",
		path: SIGN,
		pathBox: [0, 0, 100, 100],
		x: 548,
		y: 172,
		size: 30,
		rotation: 0,
		color: "#eab308",
		filled: true,
		thickness: 1,
		z: 10,
		modulators: [],
	},
	{
		kind: "shape",
		id: "sign-mark",
		form: "path",
		path: SIGN_MARK,
		pathBox: [0, 0, 100, 100],
		x: 548,
		y: 178,
		size: 30,
		rotation: 0,
		color: "#1c1917",
		filled: true,
		thickness: 1,
		z: 11,
		modulators: [],
	},

	// ══ 中央の譜面を囲う枠。参考動画の「白い1本枠」 ═════════════════
	// bar の高さは size*2*barAspect なので、拡大ロールの rect（168×104）にぴったり合わせる。
	{
		kind: "shape",
		id: "zoom-frame",
		form: "bar",
		x: 320,
		y: 172,
		size: 84,
		barAspect: 0.619,
		rotation: 0,
		color: "#f4f4f5",
		filled: false,
		thickness: 1.6,
		z: 19,
		modulators: [],
	},

	// ══ 下に現れる小さな影 ══════════════════════════════════
	{
		kind: "image",
		id: "visitor",
		ref: rozeRef("beat-a"),
		url: rozeUrl("beat-a"),
		// 4コマを1小節で1周。テンポを変えても拍に乗ったまま。
		walk: rozeBeat("a", 4),
		x: 320,
		y: 322,
		scale: 0.42,
		anchor: "bottom",
		motion: "none",
		pixelated: true,
		sections: [scene(2), scene(3), scene(6), scene(7)],
		entrance: { from: "bottom", fade: true, beats: 2, distance: 30 },
		z: 26,
	},

	// ══ 歌詞。場面によって出る側が入れ替わる ════════════════════
	{
		kind: "lyrics",
		id: "lyrics-right",
		source: "mml",
		trackId: 3,
		x: 618,
		y: 40,
		stack: "rightToLeft",
		anchor: "topLeft",
		size: 13,
		color: "#e5e7eb",
		vertical: true,
		afterimage: 3,
		holdBars: 8,
		z: 40,
	},
	{
		kind: "lyrics",
		id: "lyrics-left",
		source: "mml",
		trackId: 3,
		x: 22,
		y: 40,
		anchor: "topLeft",
		size: 13,
		color: "#e5e7eb",
		vertical: true,
		afterimage: 1,
		holdBars: 4,
		sections: [scene(2), scene(3), scene(6), scene(7)],
		z: 40,
	},

	// ══ 全編: わずかな周辺減光 ═══════════════════════════════
	{
		kind: "effect",
		id: "vignette",
		style: "vignette",
		trigger: "always",
		amount: 0.4,
		color: "#000000",
	},
];

const MANIFEST: MvManifest = {
	version: 1,
	preset: "geometric",
	title: "無題の夜",
	mml: MML,
	audio: { mode: "soundfontKoe" },
	stage: {
		bgColor: "#171717",
		bgFit: "cover",
		pulse: "none",
		fadeIn: true,
		fadeOut: true,
		palette: ["#d4d4d8", "#a1a1aa", "#71717a", "#52525b"],
	},
	sections: SECTIONS,
	layers: LAYERS,
};

export const LANTERN_PRESET: MvPresetEntry = {
	kind: "geometric",
	name: "灯りのステージ",
	description:
		"黒い舞台の左右に提灯と立て看板が立ち、そのあいだで中央のモチーフが4小節ごとに16回入れ替わる。足元にはうっすらとロールが流れる。",
	swapHint:
		"素材は要りません。左右の小道具は図形（SVGパス）なので、画像レイヤーに置き換えるとあなたの世界になります。",
	build: () => cloneManifest(MANIFEST),
};
