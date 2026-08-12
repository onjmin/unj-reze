// 「灯りのステージ」プリセット。
// 参考動画: チョウチン少女.mp4
//
// コマ送り計測と通し目視、両方で分かった構造（互いに補正し合っている——履歴は各定数の
// コメント・gitログ参照）:
//
//   1. 画面下端の帯は **位置が固定されたピアノロール** で、横に一切動かない。
//      譜面は4小節ぶんが固定位置に並び、4小節経つとページごと差し替わる。
//   2. ノートは **まだ鳴っていないあいだは地の色+9%** しかない。鳴った瞬間だけ白く
//      塗りつぶされ、音の頭でノート矩形の外へ白い輪郭が広がりながら薄れていく(余韻)。
//   3. 中央の大きな図形は「1小節を拡大したロール」でも「発音のたびに切り替わる」
//      でもなく、**8小節(=SCENE_BARS)ごとに単純な四角へ戻り、残りの小節で図形が
//      ループするコマ送りアニメ**（サビ直前は最も複雑な図形になる。サビ自体・2番も
//      同じ周期を繰り返す）。コマ送りだけを頼りに「拍ロック」「発音ロック」と
//      早合点しては通し視聴での指摘で撤回する、を2回繰り返した末の結論。
//
// 小道具（提灯・立て看板）は画像ではなく図形で組んである。
// 素材ゼロで成立させつつ、ユーザーが画像レイヤーに置き換えられるようにするため。

import type { MvLayer, MvManifest, MvSection } from "@/lib/mv-config";
import {
	DEFAULT_TEMPLATE_PARAMS,
	findMvEffectTemplate,
} from "@/lib/mv-effect-templates";
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
/**
 * 中央モチーフの周期。参考動画を全編4632フレーム走査した実測値。
 * 中央ブロックの出現率は 小節0=84.5% / 0.5=34% / 0.75〜3.0=10〜16% /
 * 3.5=57% / 3.75=85% となり、小節0〜3.75のパターンが小節4〜7.75で
 * 寸分違わず繰り返される＝**4小節周期**。場面(SCENE_BARS=8)とは別物。
 */
const MOTIF_BARS = 4;

// ── 旋律（l8）──
const N1 = "e r g r a r b r";
const N2 = "a r g r e r d r";
const N3 = "b r >c< r b r a r";
const N4 = "e r e r g r g r";
const N6 = "a4 g4 e4 d4";
// 1:33〜1:35（≒26小節目）だけ参考動画は16分音符の速い連打になり、中央のzoomが
// いつもの四角い枠ではなく小さいドットが十字/放射状に散る形に一瞬変わる。
// 通常のN1（8分音符+休符）を密なランに差し替えて、その一小節だけ音を増やす。
const N1_BURST = "l16 e f g a b >c< b a g f e d e f g";

const MELODY = [
	...rep(2, N4, N1, N4, N2), // 0-7   静かな導入
	...rep(2, N1, N2, N3, N6), // 8-15
	...rep(2, N1, N2, N3, N6), // 16-23
	N3,
	N6,
	N1_BURST,
	N2,
	N3,
	N6,
	N1,
	N2, // 24-31 26小節目だけ密な連打
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

// ── 中央モチーフ ─────────────────────────────────────────
// 「参考動画を再現する」のをやめ、汎用のエフェクトテンプレート(lib/mv-effect-templates.ts)を
// 組み合わせる方式にした。各テンプレートは `phrase`/`bar` ソースだけで組んであるので
// 指定した小節数でぴったりループする。ここでは中央に「二重枠」、その左右に
// 「粒子リング」を配置し、8小節に1回サビ前だけ「放射スイープ」を重ねる。

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

/**
 * サビ直前の場面。ここだけ複雑な図形が終盤へ向けて育ち、次の場面(サビ)へ雪崩れ込む。
 * s04 が1番のサビ（32小節目・唯一フラッシュで抜ける折り返し）なので直前は s03。
 * 2番も同じ形で繰り返すため、後半のサビ(s07)の直前 s06 にも同じ盛り上がりを置く。
 */
const PRE_CHORUS = [scene(3), scene(6)];

/** テンプレート未登録なら気づけるようthrowする（存在しないidを打ったときの事故防止）。 */
function FIND(id: string) {
	const t = findMvEffectTemplate(id);
	if (!t) throw new Error(`unknown effect template: ${id}`);
	return t;
}

const LAYERS: MvLayer[] = [
	// ══ 背景の譜面。画面いっぱいに4小節ぶんを固定表示する ═══════════
	// opacity では下げない。全体を薄くすると「未発音」と「発音」の差まで潰れて
	// 全部が同じくらい光って見えてしまう（差は light.dim でつける）。
	// 参考動画は静かな導入（0〜15小節=s00,s01）のあいだ背景に譜面が一切出ない。
	// 曲が動き出す s02 から出す＝「音が増えてきたら背景も動き出す」という順序を再現する。
	// コマ送りで見直すと、常時点いているわけではなく **画面下端のごく細い帯**に、
	// 8分音符のアルペジオ（旋律トラックのr抜き刻み）が来たときだけ短く光る程度。
	// PAD(和音)やBASSまで映すと全音符が敷き詰まって「常時表示」に見えてしまうので、
	// 旋律トラックだけに絞り、面積も画面の2/3から下端の帯に縮める。
	// 「曲が濃くなる後半にかけて帯が太くなる」という以前の追記(score-build/score-thick)は
	// 低解像度サムネイルの印象だけで足したもので、実測(x-t/ピクセル計測)で裏取りしていなかった。
	// 撤回する。pitchRange も未指定だと曲全体(全トラック合算)の音域をそのまま使ってしまい
	// 「一部だけ」であるはずの帯にトラック全体の縦幅を割り当てる誤りだったので指定する。
	{
		kind: "visualizer",
		id: "score",
		style: "pianoRoll",
		projection: "flat",
		flow: "page",
		tracks: [0],
		// MELODYはo5中心（おおよそd5〜c6）。pitchRange未指定だと曲全体(o2のBASSまで)の
		// 音域をこの帯に割り当ててしまい、旋律の実際の音域が帯の一部にしか映らなくなる。
		pitchRange: [62, 74],
		// 実測（参考動画960x720、縦はcanvas実寸360なので0.5倍換算）: 帯はy≈278〜318。
		rect: { x: 0, y: 278, w: 640, h: 40 },
		amount: 4,
		thickness: 1,
		light: {
			dim: 0.09,
			fadeOut: true,
			echo: { beats: 0.45, spread: 6, thickness: 1 },
		},
		sections: SECTIONS.slice(2).map((s) => s.id),
		z: 4,
	},

	// ══ 下に現れる小さな影 ══════════════════════════════════
	{
		kind: "image",
		id: "visitor",
		ref: rozeRef("beat-a"),
		url: rozeUrl("beat-a"),
		// 4コマを1小節で1周。テンポを変えても拍に乗ったまま。
		// 実測: 足先が画面の97%あたり。縦0.5倍換算でy≈349、ほぼ最下段。
		walk: rozeBeat("a", 4),
		x: 320,
		y: 349,
		scale: 0.42,
		anchor: "bottom",
		motion: "none",
		pixelated: true,
		// 参考動画は曲全体で一度だけ、s02のあいだだけ姿を見せてすぐ消える。
		// 何度も出し入れすると「常連の小道具」に見えてしまい、一瞬すれ違う影の感じが消える。
		sections: [scene(2)],
		entrance: { from: "bottom", fade: true, beats: 2, distance: 30 },
		z: 26,
	},

	// ══ 歌詞。表(右)＝メインの歌詞、裏(左)＝残像多めのエコー的な添え書きとして同時表示 ══
	// 以前は「右と左は同時に出ない」と早合点して場面ごとの排他表示にしていたが、
	// 90秒地点だけ見て一般化した誤りだった（実際は同時表示される）。撤回して常時同時表示に戻す。
	{
		kind: "lyrics",
		id: "lyrics-right",
		source: "mml",
		trackId: 3,
		x: 618,
		y: 40,
		stack: "left",
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
	// geometric(音ハメサークル)と同じkindだと findMvPreset("geometric") が
	// 配列内で先に来る方に化けてしまう衝突があった。pixelStageは実装削除済みで
	// 空いているので、名前(ドット絵PV)どおりこちらに寄せて衝突を解消する。
	kind: "pixelStage",
	name: "ドット絵PV",
	description:
		"黒い舞台の左右に提灯と立て看板が立ち、そのあいだで中央の四角と輪が8小節ごとに膨らみ直しながら回り続ける。足元にはうっすらとロールが流れる。",
	swapHint:
		"素材は要りません。左右の小道具は図形（SVGパス）なので、画像レイヤーに置き換えるとあなたの世界になります。",
	build: () => cloneManifest(MANIFEST),
};
