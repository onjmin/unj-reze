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
// 1:33〜1:35（≒26小節目）だけ参考動画は16分音符の速い連打になり、中央のzoomが
// いつもの四角い枠ではなく小さいドットが十字/放射状に散る形に一瞬変わる。
// 通常のN1（8分音符+休符）を密なランに差し替えて、その一小節だけ音を増やす。
const N1_BURST = "l16 e f g a b >c< b a g f e d e f g";

const MELODY = [
	...rep(2, N4, N1, N4, N2), // 0-7   静かな導入
	...rep(2, N1, N2, N3, N6), // 8-15
	...rep(2, N1, N2, N3, N6), // 16-23
	N3, N6, N1_BURST, N2, N3, N6, N1, N2, // 24-31 26小節目だけ密な連打
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

// ── 中央モチーフのアイコン差し替え（100×100の箱で設計）───────────
// 実測(8〜28秒・60fps・24x24二値化差分)で「拍(0.4225s=t142の四分音符)に一定間隔で
// 図形そのものが差し替わる」ことが分かった。滑らかな変形ではなく離散的なコマ送りなので、
// 枠(アウトライン)と中身(塗り)を別レイヤーにしたうえで、それぞれ4コマを1拍で一周させる
// （実測では1拍の中でさらに細かい差し替わりが見えたが、8コマぶんの形状は起こしきれない
// ため、観測できた主な形に絞って4コマへ単純化している）。
/** 枠0: 単純な正方形の輪郭。 */
const ZOOM_O0 = "M14,14 L86,14 L86,86 L14,86 Z";
/** 枠1: 四隅だけのブラケット（カメラのフォーカス枠のような形）。 */
const ZOOM_O1 =
	"M14,14 L34,14 M14,14 L14,34 M66,14 L86,14 M86,14 L86,34 M14,66 L14,86 M14,86 L34,86 M66,86 L86,86 M86,66 L86,86";
/** 枠2: ブラケット＋左右の小さい中空四角。 */
const ZOOM_O2 = `${ZOOM_O1} M30,44 L30,56 L42,56 L42,44 Z M58,44 L58,56 L70,56 L70,44 Z`;
/** 枠3: 上下の横線だけ（左右が開く瞬間）。 */
const ZOOM_O3 = "M14,14 L86,14 M14,86 L86,86";
const ZOOM_OUTLINE_ICONS = [ZOOM_O0, ZOOM_O1, ZOOM_O2, ZOOM_O3];

/** 中身0: ほぼ何も無い（差し替わりの合間、実測onpix=0の瞬間）。 */
const ZOOM_F0 = "M49.5,49.5 L50.5,49.5 L50.5,50.5 L49.5,50.5 Z";
/** 中身1: 中央の塗りつぶし四角（発音中のノート）。 */
const ZOOM_F1 = "M38,38 L62,38 L62,62 L38,62 Z";
/** 中身2: 左右に離れた2つの小さい塗りつぶし四角。 */
const ZOOM_F2 = "M30,44 L30,56 L42,56 L42,44 Z M58,44 L58,56 L70,56 L70,44 Z";
/** 中身3: 上下の太い帯（口金のようなタブ）。 */
const ZOOM_F3 = "M20,14 L80,14 L80,26 L20,26 Z M20,74 L80,74 L80,86 L20,86 Z";
const ZOOM_FILL_ICONS = [ZOOM_F0, ZOOM_F1, ZOOM_F2, ZOOM_F3];

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

	// ══ 中央。アイコン差し替えで実測どおりの「離散的な形の切り替わり」を描く ═══════
	// 旧実装はpianoRoll(音の高さ→縦位置に敷き詰める)だったが、これは参考動画を見ての
	// 想像で、実測(8〜28秒・60fps・24x24二値化差分)は否定している——変化は
	// 「鳴っている音の並び」ではなく、拍(0.4225s=t142の四分音符)に一定間隔で
	// 図形そのものが4コマ差し替わるアニメーションだった。lib/mv-engine.ts に
	// 追加した `iconCycle`（拍ロックで path を差し替える）でそれを直接描く。
	{
		kind: "shape",
		id: "zoom-fill",
		form: "path",
		path: ZOOM_FILL_ICONS[0],
		pathBox: [0, 0, 100, 100],
		iconCycle: { paths: ZOOM_FILL_ICONS, beats: 1 },
		x: 320,
		y: 180,
		size: 46,
		rotation: 0,
		color: "#d4d4d8",
		filled: true,
		thickness: 1,
		z: 20,
		modulators: [],
	},

	// ══ 左の提灯 ═══════════════════════════════════════════
	// 提灯の下から伸びる細い柄。bar を傾けて1本の棒にする
	// （path で線を描いても filled では塗られないので、棒は bar で作る）。
	{
		kind: "shape",
		id: "pole",
		form: "bar",
		// 実測: 縦は0.5倍換算。提灯本体の下端〜柄の先の長さに合わせて短縮。
		x: 145,
		y: 223,
		size: 29,
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
		// 実測: 中心は画面の22%×44%。横0.667/縦0.5倍換算で142,161。
		x: 142,
		y: 161,
		size: 49,
		rotation: 0,
		color: "#c0392b",
		filled: true,
		thickness: 1,
		z: 10,
		// 「低音の打点でわずかに膨らむ」という以前のmodulatorはpx単位の計測で裏取りしていなかった。
		// 8秒480フレームぶんの実測で提灯の幅は42pxで一切変化しなかった（分散ゼロ）ため撤回した。
		modulators: [],
	},
	{
		kind: "shape",
		id: "lantern-cap",
		form: "path",
		path: LANTERN_CAP,
		pathBox: [0, 0, 100, 100],
		x: 142,
		y: 161,
		size: 49,
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
		x: 142,
		y: 161,
		size: 49,
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
		// 実測: 中心は画面の76%×58%。横0.667/縦0.5倍換算で486,208。
		// 旧位置は上すぎ＆右に寄りすぎていた。
		x: 486,
		y: 208,
		size: 36,
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
		x: 486,
		y: 214,
		size: 36,
		rotation: 0,
		color: "#1c1917",
		filled: true,
		thickness: 1,
		z: 11,
		modulators: [],
	},

	// ══ 中央の枠。参考動画の「白い1本枠」 ═══════════════════════════
	// zoom-fill と中心を揃える。
	//
	// 実測(8〜28秒・60fps・24x24二値化サムネイルの差分でズーム領域を毎フレーム比較):
	// 「onpix=0」の瞬間（内容が最も少なくなる差し替わりの合間）が
	//   8.616 / 9.033 / 9.467 / 9.883 / 10.300 / 10.733 / 11.150 / 11.567 / 12.000s …
	// と、間隔0.416〜0.434s（平均約0.423s）でほぼ一定に繰り返す。
	// このMMLのテンポ t142 の四分音符 = 60/142 = 0.4225s と実測値がほぼ一致する
	// ＝ 鳴っている音（trackOnset）ではなく、拍そのもの（beat）に同期して
	// 一定間隔で切り替わっている。単純な静止した枠でもサイズの脈動でもなく、
	// ブラケット⇄正方形⇄横線だけ、と枠の**形そのもの**が拍ロックで差し替わって
	// いたので、zoom-fillと同じ `iconCycle` で近似する。
	{
		kind: "shape",
		id: "zoom-frame",
		form: "path",
		path: ZOOM_OUTLINE_ICONS[0],
		pathBox: [0, 0, 100, 100],
		iconCycle: { paths: ZOOM_OUTLINE_ICONS, beats: 1 },
		x: 320,
		y: 180,
		size: 36,
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

	// ══ 歌詞。場面によって出る側が入れ替わる ════════════════════
	// コマ送りで確認: 右と左は同時には出ない（以前の版は右を常時＋一部の場面だけ
	// 左も重ねていたが、参考動画は排他）。冒頭(s00)と中盤の折り返し直後(s05)だけ
	// 右、それ以外はずっと左——右→左→右→左と1曲で2回だけ入れ替わる。
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
		sections: [scene(0), scene(5)],
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
		sections: [scene(1), scene(2), scene(3), scene(4), scene(6), scene(7)],
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
	name: "ドット絵PV",
	description:
		"黒い舞台の左右に提灯と立て看板が立ち、そのあいだで中央のモチーフが4小節ごとに16回入れ替わる。足元にはうっすらとロールが流れる。",
	swapHint:
		"素材は要りません。左右の小道具は図形（SVGパス）なので、画像レイヤーに置き換えるとあなたの世界になります。",
	build: () => cloneManifest(MANIFEST),
};
