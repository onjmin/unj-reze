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

// ── 中央モチーフ（100×100の箱で設計）─────────────────────────
// 目視確認（コマ送りではなく通しで見た構造）: 8小節ごとに真ん中の単純な四角へ戻り、
// 残りの小節は図形がループするエフェクトになる。サビへ入る直前は複雑な図形になる
// （サビ自体も2番も同じ8小節周期のパターンを繰り返す）。
//
// 以前はこれを「離散的な図形をコマ送りで差し替える」(iconCycle)実装にしていたが、
// 速度をいくら上げても原理的にジャンプカットにしかならず(パスの補間=モーフィングは
// このエンジンに無い)、「滑らかでない」「コマが飛んでいる」と繰り返し指摘された。
// 図形差し替えというモデル自体が誤りで、実際に必要なのは**連続的なモジュレータ**
// による滑らか(かつイージングの効いた)な動き。`envelope()`(拍/小節ソース)は
// 毎フレーム計算し直す減衰カーブなので、離散ジャンプではなく滑らかに変化する。
// ただし「滑らかにする」ために回転する輪や星形へ置き換えたのも誤りだった。参考動画の
// 中央に出るのは終始 **太い・軸に沿った・回転しない** 図形（四隅ブラケット／塗り四角／
// 上下のタブ／左右の小さい中空四角／3段の破線列）で、回転する図形は1コマも出てこない。
//
// 正解は「図形を差し替える」でも「別の図形に置き換える」でもなく、
// **観察した図形要素を1つずつ別レイヤーに分解し、位置・大きさ・濃さを連続カーブで動かす**こと。
// 見た目の語彙は参考動画のまま、変化は全部トゥイーンになる（コマ飛びしない）。
//
// 構造は`phrase`ソース(8小節=SCENE_BARSを1周期として、頭で1→終わりで0へ減衰)で表し、
//   ・中央の四角      : `add`  → 8小節の頭でいちばん大きく、滑らかに引く
//   ・ブラケット/タブ : `sub`  → 四角と入れ替わりに開いてくる＝ループ図形エフェクト
//   ・破線列          : `sub`＋ゆるいcurve → 終盤にだけ急に育つ＝サビ直前の複雑さ
// と当て分ける。小節ごとの開閉は`bar`で付けるので、ループ部分は1小節周期で呼吸する。

// 寸法は全編1390フレームを走査して実測した（推測ではない）:
//   ・モチーフ全体   : 動画x 300〜660 ＝ canvas640換算で **幅240px**（±120）
//   ・中央のグレー四角: 約48px（size 24）。大きさは終始ほぼ一定
//   ・外枠           : 約120px（size 60）の細い線。以前は52pxで半分以下だった
//   ・枠の切れ目の小四角: 中心から±46px、約24px（size 12）
//   ・遠いフランキング : 中心から±88px、約56px（size 28）
/** 外枠。ほぼ閉じた大きな正方形だが、左右の辺の中央に切れ目があり小四角がはまる。 */
const ZOOM_FRAME =
	"M10,10 L90,10 M90,10 L90,38 M90,62 L90,90 M90,90 L10,90 M10,90 L10,62 M10,38 L10,10";
/** 上下のタブ。太い横棒（「⊏⊐」状態のときだけ出る）。 */
const ZOOM_TAB = "M8,38 L92,38 L92,62 L8,62 Z";
/** 左右に付く小さい中空四角。枠の切れ目にはまる。 */
const ZOOM_SIDE_BOX = "M22,22 L78,22 L78,78 L22,78 Z";
// 参考動画の左右要素は「細い線画」ではなく **太いベタ塗りの面**。
// 以前は鍵盤風の縦棒や3段の破線といった細かいテクスチャで描いていたが、
// 参考動画は白い面の比率が高く「重い・はっきりした」シルエットになっている。
// 線ではなく面で構成し直す。
/** 左右の巨大な白い縦長ボックス（ベタ塗り）。中央が消えている間の主役。 */
const ZOOM_BLOCK = "M18,4 L82,4 L82,96 L18,96 Z";
/** 太い二本の水平線（ベタ塗りの帯）。ボックスと交代で出る。 */
const ZOOM_TWOBAR =
	"M2,20 L98,20 L98,40 L2,40 Z M2,60 L98,60 L98,80 L2,80 Z";

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

	// ══ 中央モチーフ。全編1390フレームの走査で得た実測寸法で組む ══════════
	// ① 8小節の頭 → 中央のグレー四角＋上下の太いタブ（「⊏⊐」状態）
	// ② そのあと   → タブが引き、大きな外枠と切れ目の小四角が開いてくる
	// ③ 小節ごと   → 遠い左右の要素が「破線列」と「鍵盤箱」で交互に入れ替わる
	// 全部 phrase(8小節) と bar(1小節) の連続カーブなので、変化はすべてトゥイーン。
	{
		kind: "shape",
		id: "zoom-square",
		form: "square",
		x: 320,
		y: 180,
		// 実測: 約48px（size 24）。参考動画では大きさがほぼ一定なので変動も小さくする。
		size: 22,
		rotation: 0,
		// 実測: 白い枠に対してはっきり暗いグレー。明るすぎると枠と同化する。
		color: "#8b8b90",
		filled: true,
		thickness: 1,
		z: 20,
		modulators: [
			// 実測: 中央ブロックはインク分布が二値的（0付近が64%、濃い側が20%）で、
			// 4小節のうち約1.5小節しか出ていない。常時表示だったのが最大の乖離だった。
			// symmetric で「境目=1・フレーズ中央=0」の山にし、curve4 で
			// 実測カーブ(0.25小節→61%, 0.5→34%, 0.75→13%)に合わせる。
			{
				source: "phrase",
				bars: MOTIF_BARS,
				symmetric: true,
				curve: 4,
				target: "opacity",
				op: "mul",
				amount: 1,
			},
			// 実測の下限（中盤でも12%前後は残る）
			{ source: "constant", target: "opacity", op: "add", amount: 0.12 },
			{
				source: "phrase",
				bars: MOTIF_BARS,
				symmetric: true,
				curve: 4,
				target: "size",
				op: "add",
				amount: 4,
			},
		],
	},
	// 外枠。実測120px幅（size 60）。以前は52pxで半分以下だった。
	// 8小節の頭では畳まれ、四角が引くのと入れ替わりに開く＝ループ図形エフェクトの主役。
	{
		kind: "shape",
		id: "zoom-frame",
		form: "path",
		path: ZOOM_FRAME,
		pathBox: [0, 0, 100, 100],
		x: 320,
		y: 180,
		size: 60,
		rotation: 0,
		color: "#f4f4f5",
		filled: false,
		thickness: 3,
		z: 19,
		modulators: [
			// 実測: モチーフ全幅は1小節内で202〜230px(video)とほぼ一定＝枠は常時出ている。
			// 以前の phrase ゲートは「8小節の頭で消える」誤った動きを作っていた。
			{ source: "bar", target: "size", op: "add", amount: 5 },
		],
	},
	// 枠の左右の切れ目にはまる小四角。実測 ±46px・約24px（size 12）。
	{
		kind: "shape",
		id: "zoom-side-l",
		form: "path",
		path: ZOOM_SIDE_BOX,
		pathBox: [0, 0, 100, 100],
		x: 274,
		y: 180,
		size: 12,
		rotation: 0,
		color: "#f4f4f5",
		filled: false,
		thickness: 3,
		z: 20,
		// 枠と一体の部品なので枠と同じく常時表示。
		modulators: [],
	},
	{
		kind: "shape",
		id: "zoom-side-r",
		form: "path",
		path: ZOOM_SIDE_BOX,
		pathBox: [0, 0, 100, 100],
		x: 366,
		y: 180,
		size: 12,
		rotation: 0,
		color: "#f4f4f5",
		filled: false,
		thickness: 3,
		z: 20,
		// 枠と一体の部品なので枠と同じく常時表示。
		modulators: [],
	},
	// 上下の太いタブ。8小節の頭でだけ出る「⊏⊐」状態。
	{
		kind: "shape",
		id: "zoom-tab-top",
		form: "path",
		path: ZOOM_TAB,
		pathBox: [0, 0, 100, 100],
		x: 320,
		y: 146,
		size: 34,
		rotation: 0,
		color: "#f4f4f5",
		filled: true,
		thickness: 1,
		z: 18,
		modulators: [
			{
				source: "phrase",
				bars: MOTIF_BARS,
				symmetric: true,
				curve: 4,
				target: "opacity",
				op: "mul",
				amount: 1,
			},
			{ source: "bar", target: "y", op: "sub", amount: 5 },
		],
	},
	{
		kind: "shape",
		id: "zoom-tab-bottom",
		form: "path",
		path: ZOOM_TAB,
		pathBox: [0, 0, 100, 100],
		x: 320,
		y: 214,
		size: 34,
		rotation: 0,
		color: "#f4f4f5",
		filled: true,
		thickness: 1,
		z: 18,
		modulators: [
			{
				source: "phrase",
				bars: MOTIF_BARS,
				symmetric: true,
				curve: 4,
				target: "opacity",
				op: "mul",
				amount: 1,
			},
			{ source: "bar", target: "y", op: "add", amount: 5 },
		],
	},
	// 遠いフランキング。実測 中心から±88px・約56px幅（size 28）。
	// 破線列と鍵盤箱を`bar`の表裏で当て、1小節ごとに交互へ入れ替わるようにする。
	{
		kind: "shape",
		id: "zoom-dash-l",
		form: "path",
		path: ZOOM_TWOBAR,
		pathBox: [0, 0, 100, 100],
		x: 244,
		y: 180,
		size: 40,
		rotation: 0,
		color: "#f4f4f5",
		filled: true,
		thickness: 1,
		z: 21,
		modulators: [
			{ source: "bar", target: "opacity", op: "mul", amount: 1 },
		],
	},
	{
		kind: "shape",
		id: "zoom-dash-r",
		form: "path",
		path: ZOOM_TWOBAR,
		pathBox: [0, 0, 100, 100],
		x: 396,
		y: 180,
		size: 40,
		rotation: 0,
		color: "#f4f4f5",
		filled: true,
		thickness: 1,
		z: 21,
		modulators: [
			{ source: "bar", target: "opacity", op: "mul", amount: 1 },
		],
	},
	{
		kind: "shape",
		id: "zoom-key-l",
		form: "path",
		path: ZOOM_BLOCK,
		pathBox: [0, 0, 100, 100],
		x: 244,
		y: 180,
		size: 40,
		rotation: 0,
		color: "#f4f4f5",
		filled: true,
		thickness: 1,
		z: 21,
		modulators: [
			// 中央ブロックの山の**逆**。中央が消えている間だけ現れることで、
			// 「中央の四角」⇄「左右の巨大な白ボックス」とメインモチーフ自体が入れ替わる。
			{
				source: "phrase",
				bars: MOTIF_BARS,
				symmetric: true,
				curve: 4,
				target: "opacity",
				op: "sub",
				amount: 0.95,
			},
		],
	},
	{
		kind: "shape",
		id: "zoom-key-r",
		form: "path",
		path: ZOOM_BLOCK,
		pathBox: [0, 0, 100, 100],
		x: 396,
		y: 180,
		size: 40,
		rotation: 0,
		color: "#f4f4f5",
		filled: true,
		thickness: 1,
		z: 21,
		modulators: [
			// 中央ブロックの山の**逆**。中央が消えている間だけ現れることで、
			// 「中央の四角」⇄「左右の巨大な白ボックス」とメインモチーフ自体が入れ替わる。
			{
				source: "phrase",
				bars: MOTIF_BARS,
				symmetric: true,
				curve: 4,
				target: "opacity",
				op: "sub",
				amount: 0.95,
			},
		],
	},
	// サビ直前の場面だけ、モチーフの外端（実測 ±120px）にもう一列足して密度を上げる。
	// curveをゆるく(0.4)すると序盤はほとんど出ず、終わり際に一気に育つ＝サビへの助走。
	{
		kind: "shape",
		id: "zoom-outer-l",
		form: "path",
		path: ZOOM_TWOBAR,
		pathBox: [0, 0, 100, 100],
		x: 190,
		y: 180,
		size: 24,
		rotation: 0,
		color: "#f4f4f5",
		filled: true,
		thickness: 1,
		sections: PRE_CHORUS,
		z: 21,
		modulators: [
			{
				source: "phrase",
				bars: SCENE_BARS,
				curve: 0.4,
				target: "opacity",
				op: "sub",
				amount: 1,
			},
		],
	},
	{
		kind: "shape",
		id: "zoom-outer-r",
		form: "path",
		path: ZOOM_TWOBAR,
		pathBox: [0, 0, 100, 100],
		x: 450,
		y: 180,
		size: 24,
		rotation: 0,
		color: "#f4f4f5",
		filled: true,
		thickness: 1,
		sections: PRE_CHORUS,
		z: 21,
		modulators: [
			{
				source: "phrase",
				bars: SCENE_BARS,
				curve: 0.4,
				target: "opacity",
				op: "sub",
				amount: 1,
			},
		],
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
