// ミュージックビデオ(MV)のデータモデル。UI非依存で、lib/game-config.ts と同じ立ち位置。
//
// 設計方針: AviUtl のような自由タイムラインは持たない。
//   - レイヤーは6種だけ（image / text / visualizer / lyrics / shape / effect）
//   - 動き・演出は enum から選ぶ（数値キーフレームは無い）
//   - 時間軸は「小節番号で区切ったセクション」だけ。レイヤーは表示するセクションIDを持つ
//   - 音と絵をつなぐのは MvModulator（トラックの鳴りを図形のパラメータへ四則演算で流す）
// この4点を固定することで、ゲーム機能と同じ「プリセットを選んで中身を差し替える」体験に収まる。
//
// 詳細: docs/mv-feature-design.md

import { parseChord } from "@onjmin/chord-parser";
import type { WayKey } from "./walk-sprite";

/** MVの論理解像度(16:9)。描画は常にこの座標系で行い、表示側が CSS transform で拡大する。 */
export const MV_W = 640;
export const MV_H = 360;

/** @onjmin/dtm の DEFAULT_STEPS_PER_BAR と同値。 */
export const MV_STEPS_PER_BAR = 192;
export const MV_BEATS_PER_BAR = 4;
export const MV_STEPS_PER_BEAT = MV_STEPS_PER_BAR / MV_BEATS_PER_BAR;

export type MvPresetKind = "pianoRoll" | "pixelStage" | "geometric";

// ───────────────── 音の出し方 ─────────────────

/**
 * 再生の重さと音質のトレードオフ。
 * - light        : @onjmin/dtm 内蔵の矩形波シンセ。ダウンロード無しで即鳴る。
 * - soundfont    : SoundFont の楽器音。歌詞トラックは楽器として鳴る。
 * - soundfontKoe : SoundFont の楽器音 ＋ koe による歌声合成。既定。
 */
export type MvAudioMode = "light" | "soundfont" | "soundfontKoe";

export const MV_AUDIO_MODE_LABELS: Record<MvAudioMode, string> = {
	light: "軽量（内蔵シンセ）",
	soundfont: "外部音源",
	soundfontKoe: "外部音源＋歌声",
};

export const MV_AUDIO_MODE_HINTS: Record<MvAudioMode, string> = {
	light:
		"音源をダウンロードしないので、すぐ鳴り始めます。音は素朴な矩形波です。",
	soundfont:
		"楽器の音がちゃんと鳴ります。歌詞トラックも楽器として演奏されます。",
	soundfontKoe:
		"楽器＋歌声。読み込みに少し時間がかかりますが、いちばん元の曲に近い鳴り方です。",
};

export const DEFAULT_MV_AUDIO_MODE: MvAudioMode = "soundfontKoe";

/**
 * 歩行グラ（`loopBeats` 指定）のコマ送り速度に一律で掛ける倍率。
 * 1周を `loopBeats` 拍ぴったりで送ると曲に対して足取りが重く見えるため、
 * 既定値は4倍。ユーザーがMV単位で自由な数値（小数可）に変更できる。
 */
export const DEFAULT_MV_WALK_SPEED = 4;

// ───────────────── 動き・見た目の共通enum ─────────────────

/**
 * レイヤーの動き。数値で自由に組むのではなく、この中から1つ選ぶ。
 * 強さだけ motionAmount で調整できる。
 */
export type MvMotion =
	| "none"
	/** 上下にゆっくり揺れる（キャラ絵の呼吸） */
	| "bob"
	/** 横へ流れて画面端で反対側から出てくる（シャチ・雲） */
	| "drift"
	/** 拍に合わせてわずかに横へずれる（奥行き演出） */
	| "parallax"
	/** じわじわ拡大（Ken Burns） */
	| "zoom"
	/** 拍の頭で膨らんで戻る */
	| "beatScale";

/**
 * 登場のときにどこから入ってくるか。'none' は移動せずその場に出る。
 * 「上下左右からスライドしてくる」を数値キーフレーム無しで指定するための enum。
 */
export type MvEnterFrom = "none" | "left" | "right" | "top" | "bottom";

export const MV_ENTER_FROM_LABELS: Record<MvEnterFrom, string> = {
	none: "その場（動かさない）",
	left: "左から",
	right: "右から",
	top: "上から",
	bottom: "下から",
};

export type MvExitTo = "none" | "left" | "right" | "top" | "bottom";

export const MV_EXIT_TO_LABELS: Record<MvExitTo, string> = {
	none: "その場（動かさない）",
	left: "左へ",
	right: "右へ",
	top: "上へ",
	bottom: "下へ",
};

export type MvEntranceStyle =
	| "none"
	| "fade"
	| "slide"
	| "zoom"
	| "zoomBounce"
	| "wipe"
	| "particle"
	| "afterimage"
	| "pixelate"
	| "glitch"
	| "flash";

export type MvExitStyle = MvEntranceStyle;

export const MV_TRANSITION_STYLE_LABELS: Record<MvEntranceStyle, string> = {
	none: "瞬時（演出なし）",
	fade: "フェード（不透明度）",
	slide: "スライド（移動）",
	zoom: "ズーム（拡大・縮小）",
	zoomBounce: "ポップ（バウンス）",
	wipe: "ワイプ（画面端からカット）",
	particle: "粒子（ドット分解・カバー）",
	afterimage: "残像（軌跡・分散）",
	pixelate: "モザイク（粗いドットへ分解）",
	glitch: "グリッチ（走査線が乱れて分解）",
	flash: "フラッシュ（白発光）",
};

/** プリセットグリッドの見出し分け。 */
export type MvTransitionCategory = "basic" | "movement" | "decompose";

export const MV_TRANSITION_CATEGORY_LABELS: Record<MvTransitionCategory, string> = {
	basic: "基本",
	movement: "移動",
	decompose: "分解・エフェクト",
};

export const MV_TRANSITION_STYLE_CATEGORY: Record<
	MvEntranceStyle,
	MvTransitionCategory
> = {
	none: "basic",
	fade: "basic",
	slide: "movement",
	zoom: "movement",
	zoomBounce: "movement",
	wipe: "movement",
	particle: "decompose",
	afterimage: "decompose",
	pixelate: "decompose",
	glitch: "decompose",
	flash: "decompose",
};

export const MV_TRANSITION_STYLE_DESCRIPTIONS: Record<MvEntranceStyle, string> = {
	none: "演出なしでその場にパッと出入りします。",
	fade: "じわっと透明度が変化して滑らかに出入りします。",
	slide: "指定した方向からスライドイン・スライドアウトします。",
	zoom: "拡大しながら出現、または小さくなりながら消えます。",
	zoomBounce: "跳ねるように勢いよく出現・縮んで退場します。",
	wipe: "画面端からカーテンが開閉するようにカットイン・アウトします。",
	particle: "光るドット粒子が画面を覆う／分解して消えます。",
	afterimage: "軌跡の残像が集まって出現／散らばって消失します。",
	pixelate: "細かい絵が大きなドットへ荒れていき、モザイクで隠れる・現れます。",
	glitch: "横縞が乱れてズレ、コマ落ちしながらデジタル的に分解・復元します。",
	flash: "一瞬白く光りながら出現・消失します。",
};

/**
 * レイヤーの登場演出。未指定なら「瞬時に出現」（従来の挙動）。
 * 起点は「そのレイヤーが出てきた場面の頭」で、`beats` 拍かけて定位置・不透明へ寄っていく。
 */
export interface MvEntrance {
	style?: MvEntranceStyle;
	from: MvEnterFrom;
	/** 透明から現れるか */
	fade: boolean;
	/** 演出にかける長さ（拍）。0以下なら瞬時に出る */
	beats: number;
	/** スライドの距離（論理px）。未指定なら横=画面幅の半分／縦=画面高さの半分。 */
	distance?: number;
}

/**
 * レイヤーの退場演出。未指定なら「瞬時に消える」。
 * 終点は「そのレイヤーが消える場面の頭 / 表示終了小節」で、`beats` 拍かけて消えていく。
 */
export interface MvExit {
	style?: MvExitStyle;
	to: MvExitTo;
	/** 透明へ消えるか */
	fade: boolean;
	/** 演出にかける長さ（拍）。0以下なら瞬時に消える */
	beats: number;
	/** スライドの距離（論理px）。 */
	distance?: number;
}

export const DEFAULT_MV_ENTRANCE: MvEntrance = {
	style: "fade",
	from: "none",
	fade: true,
	beats: 2,
};

export const DEFAULT_MV_EXIT: MvExit = {
	style: "fade",
	to: "none",
	fade: true,
	beats: 2,
};

/** 登場演出のスライド距離（論理px）。未指定時の既定を解決する。 */
export function mvEntranceDistance(entrance: MvEntrance): number {
	if (entrance.distance !== undefined) return entrance.distance;
	return entrance.from === "top" || entrance.from === "bottom"
		? MV_H / 2
		: MV_W / 2;
}

/** 退場演出のスライド距離（論理px）。未指定時の既定を解決する。 */
export function mvExitDistance(exit: MvExit): number {
	if (exit.distance !== undefined) return exit.distance;
	return exit.to === "top" || exit.to === "bottom" ? MV_H / 2 : MV_W / 2;
}

/**
 * 実際に使うスタイルを決める（`style` 未指定の古いデータ向けの読み替え）。
 *
 * `isMvEntranceInert` とエディタの「いま選ばれているプリセット」表示は、必ずこの関数を
 * 経由すること。別々にこの分岐を書くと片方だけ `fade` チェックを見落とすような食い違いが起き、
 * 「本当は"瞬時"設定なのにプリセット一覧では"フェード"が選ばれて見える」といった表示バグになる
 * （実際にエディタ側だけこの分岐を端折っていて起きていた）。
 */
export function resolveEntranceStyle(
	entrance: Pick<MvEntrance, "style" | "from" | "fade">,
): MvEntranceStyle {
	return (
		entrance.style ??
		(entrance.from !== "none" ? "slide" : entrance.fade ? "fade" : "none")
	);
}

/** 退場版。`resolveEntranceStyle` を参照。 */
export function resolveExitStyle(
	exit: Pick<MvExit, "style" | "to" | "fade">,
): MvExitStyle {
	return (
		exit.style ?? (exit.to !== "none" ? "slide" : exit.fade ? "fade" : "none")
	);
}

/** 何も起きない（＝瞬時に出現と同じ）登場演出か。 */
export function isMvEntranceInert(entrance: MvEntrance | undefined): boolean {
	if (!entrance) return true;
	if (entrance.beats <= 0) return true;
	return resolveEntranceStyle(entrance) === "none";
}

/** 何も起きない（＝瞬時に消えるのと同じ）退場演出か。 */
export function isMvExitInert(exit: MvExit | undefined): boolean {
	if (!exit) return true;
	if (exit.beats <= 0) return true;
	return resolveExitStyle(exit) === "none";
}

export type MvAnchor =
	| "topLeft"
	| "top"
	| "topRight"
	| "left"
	| "center"
	| "right"
	| "bottomLeft"
	| "bottom"
	| "bottomRight";

/** 背景そのものの拍演出。 */
export type MvStagePulse = "none" | "breathe" | "flash";

export type MvBgFit = "cover" | "contain" | "tile";

/** canvas の合成モード。図形を重ねたときの「足し算/掛け算」的な見え方を作る。 */
export type MvBlend =
	| "normal"
	| "add"
	| "multiply"
	| "screen"
	| "difference"
	| "exclusion"
	| "xor";

export const MV_BLEND_LABELS: Record<MvBlend, string> = {
	normal: "通常",
	add: "加算（明るく重ねる）",
	multiply: "乗算（暗く重ねる）",
	screen: "スクリーン",
	difference: "差の絶対値",
	exclusion: "除外",
	xor: "排他",
};

/** MvBlend → CanvasRenderingContext2D.globalCompositeOperation */
export const MV_BLEND_COMPOSITE: Record<MvBlend, GlobalCompositeOperation> = {
	normal: "source-over",
	add: "lighter",
	multiply: "multiply",
	screen: "screen",
	difference: "difference",
	exclusion: "exclusion",
	xor: "xor",
};

export type MvVisualizerStyle =
	/** ピアノロール（平面／立体／円形を projection で切り替える） */
	| "pianoRoll"
	/** ステップシーケンサ格子。拍ごとにマスが点灯する */
	| "stepGrid"
	/** 拍で同心円が広がる */
	| "rings"
	/** 音域別の縦棒スペアナ風 */
	| "bars";

/**
 * ピアノロールの見せ方。MIDITrail のような立体視・円形表示を切り替える。
 * - flat        : 真横から見た平面（従来）
 * - perspective : 奥行きのある板を任意の角度から見る（MIDITrail 既定に近い）
 * - circular    : 音域を円周に巻きつけ、時間を半径方向に流す
 */
export type MvProjection = "flat" | "perspective" | "circular";

export const MV_PROJECTION_LABELS: Record<MvProjection, string> = {
	flat: "平面",
	perspective: "立体（3D）",
	circular: "円形",
};

/** 立体ピアノロールの視点。角度はすべて度。 */
export interface MvView {
	/** 上下の見下ろし角。正で上から見る。 */
	pitch: number;
	/** 左右の回り込み角。 */
	yaw: number;
	/** 画面内の傾き。 */
	roll: number;
	/** 画角。小さいほど望遠（歪みが少ない）。 */
	fov: number;
	/** トラックのレーンを奥行き方向へ広げる幅（論理px）。0で全トラックが同一平面。 */
	depth: number;
	/** ノート1枚の厚み（奥行き方向）。 */
	thickness: number;
}

export const DEFAULT_MV_VIEW: MvView = {
	pitch: 16,
	yaw: -18,
	roll: 0,
	fov: 55,
	depth: 220,
	thickness: 10,
};

/**
 * ピアノロールの流し方。
 * - scroll : 再生位置に合わせて右から左へ流れる
 * - page   : 位置を固定し、`amount` 小節ぶんの譜面を丸ごと差し替える
 *
 * 参考動画（チョウチン少女）のロールは **横に一切動かない**。
 * 1ピクセル幅のスリットを時間方向に積む（x-t画像）と、斜めの筋が1本も出ず縦線しか出ない。
 * 譜面は4小節ぶんが固定位置に並び、4小節経つとページごと差し替わる。
 */
export type MvRollFlow = "scroll" | "page";

export const MV_ROLL_FLOW_LABELS: Record<MvRollFlow, string> = {
	scroll: "流れる（右から左へ）",
	page: "固定（小節ごとに譜面を差し替え）",
};

/**
 * 鳴った音がノート矩形から広がりながら消えていく輪郭＝**映像のリバーブ**。
 *
 * 参考動画をコマ送りすると、音の頭でノートが白く塗りつぶされ、
 * そのあと矩形の外へ白い枠が広がっていき、中身が暗くなっても枠だけが薄れながら残る。
 * これが無いと譜面がただの静止テクスチャに見える。
 */
export interface MvNoteEcho {
	/** 広がりきって消えるまでの長さ（拍）。0で余韻なし。 */
	beats: number;
	/** ノート矩形から何px外まで広がるか。 */
	spread: number;
	/** 輪郭の太さ。 */
	thickness: number;
}

/**
 * ノート1つの光り方。
 *
 * 参考動画の実測（地の色33 / 未発音47 / 発音242）では、
 * **まだ鳴っていない音は地の色+7%しかない**。全部を濃く描くと「音が鳴っている」情報が消える。
 */
export interface MvNoteLight {
	/** まだ鳴っていない音の濃さ 0..1。 */
	dim: number;
	/** 鳴り終わった音を消すか。false なら dim の濃さで残る（流れるロール向け）。 */
	fadeOut: boolean;
	/** 音の頭から広がって消える輪郭。 */
	echo?: MvNoteEcho;
	/** まだ鳴っていない音を予告（グレーアウト表示）せず、鳴った瞬間にだけ出すか。 */
	hideUnplayed?: boolean;
	/** ノートの基本色（未指定ならトラックの色）。 */
	color?: string;
	/** 音が鳴った（発光した）ときの色（未指定なら基本色または白）。 */
	activeColor?: string;
}

/** 平面ロールの既定。参考動画に寄せて「普段は薄く・鳴った瞬間だけ白く・余韻が広がる」。 */
export const DEFAULT_MV_NOTE_LIGHT: MvNoteLight = {
	dim: 0.2,
	fadeOut: false,
	echo: { beats: 0.5, spread: 7, thickness: 1.5 },
};

/**
 * 立体・円形ロールの既定。こちらは MIDITrail 準拠で、鳴っていない音も色のまま見せる
 * （板の並びそのものが絵になっているので、薄くすると何も見えなくなる）。
 */
export const DEFAULT_MV_NOTE_LIGHT_3D: MvNoteLight = {
	dim: 0.8,
	fadeOut: false,
};

/** 円形ピアノロールの形。 */
export interface MvRing {
	/** 内側の半径（論理px）。ここが「いま」の位置。 */
	innerRadius: number;
	/** 何度ぶんの円弧に音域を巻きつけるか。360で真円。 */
	sweep: number;
	/** 全体の回転（度）。 */
	rotate: number;
}

export const DEFAULT_MV_RING: MvRing = {
	innerRadius: 40,
	sweep: 360,
	rotate: -90,
};

// ───────────────── 音→絵のモジュレータ ─────────────────

/**
 * 図形パラメータを揺らす元の値。すべて 0..1 に正規化して返す。
 * - beat        : 拍の頭で1、次の拍の直前で0
 * - bar         : 小節の頭で1、小節末で0
 * - time        : 秒を周期1でのこぎり波にしたもの（連続回転などに使う）
 * - trackEnergy : そのトラックで今鳴っている音の強さの合計
 * - trackOnset  : そのトラックで直近に音が鳴ってからの減衰
 * - trackPitch  : そのトラックで今鳴っている音の高さ（曲の音域内での位置）
 * - constant    : 常に1（純粋な足し算/掛け算をしたいとき）
 */
export type MvModSource =
	| "beat"
	| "bar"
	| "phrase"
	| "time"
	| "spin"
	| "trackEnergy"
	| "trackOnset"
	| "trackPitch"
	| "constant";

/** モジュレータの当て先。 */
export type MvModTarget =
	| "size"
	| "rotation"
	| "opacity"
	| "x"
	| "y"
	| "thickness"
	| "sides"
	| "count";

/** 四則演算。基準値に対してどう混ぜるか。 */
export type MvModOp = "add" | "sub" | "mul" | "div";

export const MV_MOD_SOURCE_LABELS: Record<MvModSource, string> = {
	beat: "拍",
	bar: "小節",
	// `bars` 小節ぶんを1フレーズとして、その頭で1→終わりで0へなめらかに減衰する。
	// 「8小節ごとに図形が現れて、残りの小節で引いていく」構造をカーブで表すためのもの。
	// op:"sub" で使えば逆向き（フレーズの終わりに向かって育つ＝サビ直前の盛り上がり）になる。
	phrase: "フレーズ（数小節を1周期）",
	// `time` は1秒ごとに0→1へ戻る鋸波。回転にそのまま使うと1秒ごとに角度が
	// ガクッと巻き戻り、滑らかに見えない。連続回転には `spin`(巻き戻らない経過秒数)を使う。
	time: "時間（1秒ごとに0→1、鋸波）",
	spin: "経過時間（巻き戻らない・連続回転向け）",
	trackEnergy: "トラックの鳴り",
	trackOnset: "トラックの打点",
	trackPitch: "トラックの音の高さ",
	constant: "定数",
};

export const MV_MOD_TARGET_LABELS: Record<MvModTarget, string> = {
	size: "大きさ",
	rotation: "回転",
	opacity: "濃さ",
	x: "横位置",
	y: "縦位置",
	thickness: "線の太さ",
	sides: "角の数",
	count: "個数",
};

export const MV_MOD_OP_LABELS: Record<MvModOp, string> = {
	add: "＋ 足す",
	sub: "− 引く",
	mul: "× 掛ける",
	div: "÷ 割る",
};

/**
 * 「音のどれか」を「図形のどれか」へ四則演算で流す1本の線。
 * 図形は基準値からはじめて、モジュレータを上から順に適用する。
 * これを重ねることで、単純な図形からでも複雑な動きが組める。
 */
export interface MvModulator {
	source: MvModSource;
	/** source が track系 のときの対象トラック(@n)。未指定なら全トラックの合計。 */
	track?: number;
	/** source==='phrase' のときの1フレーズの長さ（小節）。未指定は8。 */
	bars?: number;
	/**
	 * source==='phrase' のとき、フレーズの頭からの減衰ではなく
	 * **いちばん近い境目からの距離**で山を作る（境目で1、フレーズ中央で0）。
	 * 参考動画の実測で、中央ブロックが「4小節の境目の前後だけ出て、中盤は消える」
	 * 山型だったため。減衰のみだと境目の手前で立ち上がれず不連続になる。
	 */
	symmetric?: boolean;
	/**
	 * カーブの鋭さ。大きいほど「頭で一気に効いてすぐ収まる」効きになる（既定2）。
	 * beat/bar/phrase のような減衰カーブにだけ効く。
	 */
	curve?: number;
	/**
	 * source==='beat' のとき、1周期を何拍分にするか（既定1＝1拍ごと）。
	 * 0.5なら2倍速（半拍ごとに脈動）、0.25なら4倍速、2なら半分の速さ、というように
	 * 数値が小さいほど速くなる。
	 */
	periodBeats?: number;
	/**
	 * source==='beat' の発火位置を拍数ぶんずらす（既定0＝表拍のまま）。
	 * 0.5を入れると「裏拍」——拍と拍のちょうど中間で発火するようになる。
	 * `periodBeats` は周期の長さ、こちらは位相のずれで、意味が別物なので混同しないこと
	 * （周期を2倍速にしても、ずらす量は常に絶対の拍数ぶん＝0.5拍のまま変わらない）。
	 */
	phaseOffset?: number;
	target: MvModTarget;
	op: MvModOp;
	/** source(0..1) に掛けてから op を適用する係数。負の値も可。 */
	amount: number;
}

// ───────────────── ステージ ─────────────────

export interface MvRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface MvStage {
	bgColor: string;
	/** 背景画像の asset-ref（lib/asset-ref.ts）。未指定なら bgColor 一色。 */
	bgRef?: string;
	/** post: 参照は解決が要るため、ContentPicker が選択時に得た表示URLを焼いておく。 */
	bgUrl?: string;
	bgFit: MvBgFit;
	/** 背景を暗くする量 0..1。前景の文字を読ませるために使う。 */
	bgDim?: number;
	pulse: MvStagePulse;
	/** トラック別の色。ピアノロール/リング/バーが参照する。 */
	palette: string[];
	/** 開始時に黒からフェードインするか */
	fadeIn?: boolean;
	/** 終了時に黒へフェードアウトするか */
	fadeOut?: boolean;
	/** 動画全体のフォント（未指定時はドット字） */
	fontFamily?: string;
}

/**
 * 場面ごとに差し替えたい背景まわり。指定した項目だけが `MvStage` を上書きする。
 *
 * 参考動画は「黒地のスプライト窓」と「全画面の夜景イラスト」のように、
 * 場面が変わると**画面ごと別物になる**。背景がMV全体で1枚しか持てないと、
 * この切り替えをレイヤーの出し分けだけで作ることになり、
 * 全画面の1枚絵を image レイヤーで無理やり敷くしかなくなる（cover相当が効かない）。
 */
export interface MvSceneStage {
	bgColor?: string;
	bgRef?: string;
	bgUrl?: string;
	bgFit?: MvBgFit;
	bgDim?: number;
	pulse?: MvStagePulse;
	/** トラック色。場面ごとに配色を変えると同じロールでも別の絵に見える。 */
	palette?: string[];
}

/**
 * 場面の切り替わり方。
 * `cut` 以外は「新しい場面に入った瞬間から beats 拍かけて、覆いが晴れていく」演出。
 * 2画面ぶんを合成するクロスフェードではなく**単色からの明け**にしてあるのは、
 * 毎フレーム2回描くコストを払わずに「切り替わった」と分かる画にするため。
 */
export type MvTransitionStyle =
	| "cut"
	| "fade"
	| "flash"
	| "wipeLeft"
	| "wipeRight"
	| "wipeUp"
	| "wipeDown"
	| "dissolve";

export const MV_TRANSITION_LABELS: Record<MvTransitionStyle, string> = {
	cut: "そのまま切り替わる",
	fade: "暗転から明ける",
	flash: "光ってから現れる",
	wipeLeft: "左へ払う",
	wipeRight: "右へ払う",
	wipeUp: "上へ払う",
	wipeDown: "下へ払う",
	dissolve: "粒子がほどけて現れる",
};

/**
 * `dissolve` が使う粒子シート。白い点が敷き詰まった状態からほどけていく14コマ。
 * 黒地の上に加算合成で重ねる前提なので、黒い部分は何も足さない＝そのまま透ける。
 */
export const MV_PARTICLE_REVEAL_URL = "/assets/mv/particle-reveal.png";
export const MV_PARTICLE_REVEAL_FRAMES = 14;
/** 逆再生（画面を粒子で覆っていく15コマ）。画像レイヤーとして使える。 */
export const MV_PARTICLE_COVER_URL = "/assets/mv/particle-cover.png";
export const MV_PARTICLE_COVER_FRAMES = 15;

export interface MvTransition {
	style: MvTransitionStyle;
	/** 演出にかける長さ（拍）。0以下ならカットと同じ。 */
	beats: number;
	/** 覆いの色。fade は既定 #000000、flash は #ffffff。 */
	color?: string;
}

export const DEFAULT_MV_TRANSITION: MvTransition = { style: "fade", beats: 1 };

/** 何も起きない転換か。 */
export function isMvTransitionInert(t: MvTransition | undefined): boolean {
	return !t || t.style === "cut" || t.beats <= 0;
}

// ───────────────── レイヤー ─────────────────

interface MvLayerBase {
	id: string;
	/**
	 * 「レイヤー」タブでの見出し。未指定なら種類名(例:「ピアノロール」)にフォールバックするが、
	 * 同じ種類のレイヤーが何枚もあると見分けが付かなくなるので、名付けを強く推奨する。
	 */
	name?: string;
	/** 表示するセクションID。未指定＝全セクションで表示。 */
	sections?: string[];
	/**
	 * さらに小節単位で絞り込む [開始小節, 終了小節)。未指定＝絞り込みなし。
	 * `sections` は場面まるごとの出し分けだが、「この場面の中でもこの数小節だけ」
	 * のような細かい指定はできない。両方指定した場合はAND（両方満たす間だけ表示）。
	 */
	barRange?: [number, number];
	/** 描画順。小さいほど奥。 */
	z?: number;
	/** 0..1 */
	opacity?: number;
	/** 登場演出（スライドイン／フェードイン等）。未指定＝瞬時に出現。 */
	entrance?: MvEntrance;
	/** 退場演出（スライドアウト／フェードアウト等）。未指定＝瞬時に消える。 */
	exit?: MvExit;
	/**
	 * 所属するグループのID（`MvManifest.groups` のキー）。未指定＝どのグループにも属さない。
	 * 同じ groupId を持つレイヤーは `manifest.layers` 配列中で必ず連続して並ぶこと
	 * （グループの並び替え・追加・削除はこの連続性を前提にした操作なので、崩すと
	 * 「グループの一部だけ離れた場所に取り残される」壊れ方をする）。
	 * この不変条件は `lib/mv-layer-group.ts` のヘルパ経由でのみ操作すること。
	 */
	groupId?: string;
}

/**
 * レイヤーの入れ子グループ。「複数のレイヤーを1つの塊として一括編集・並び替えしたい」ための
 * 器——グループそのものは描画に一切関与しない（エンジンは `manifest.layers` を今までどおり
 * フラットに読むだけで、groupId の有無を意識しない）。表示順・並び替えの単位としてだけ効く。
 */
export interface MvLayerGroup {
	id: string;
	/** レイヤー一覧での見出し。未指定なら「グループ」。 */
	name?: string;
	/** 折りたたみ状態（エディタの表示だけに使う。描画には影響しない）。 */
	collapsed?: boolean;
}

/**
 * スプライトの動かし方。
 *
 * - 歩行グラ規格（`stdId` が 'rpgen' や 'rmmv' など）は「行＝方向・列＝足踏み」なので `dir` で向きを選ぶ。
 * - MV向けのシートは「1行＝1つのアニメーション」で向きの概念が無い。この場合は
 *   `stdId: 'row_anim'` にして `crop` でその行だけを切り出し、`frames` 列ぶんを順に送る。
 */
export interface MvWalkSetting {
	/** lib/walk-sprite.ts の WalkStandard.id（'auto' / 'row_anim' 可） */
	stdId: string;
	crop?: [number, number, number, number];
	frames?: number;
	row?: number;
	dir?: WayKey;
	/** 足踏みのコマ/秒 */
	fps?: number;
	/** stdId==='row_anim' のときの再生のしかた。未指定は loop。 */
	playMode?: "loop" | "pingpong" | "once";
	/**
	 * 1周を何拍で回すか。指定すると `fps` より優先され、**曲のテンポに合わせて**コマが送られる。
	 * 4コマのループに `loopBeats: 4` を入れれば1小節で1周する。
	 * 秒で指定する `fps` だとテンポを変えた瞬間に絵と音がずれるので、拍で持てるようにしてある。
	 */
	loopBeats?: number;
	/** 素材ごとのコマ送り速度倍率（既定 1.0）。 */
	speed?: number;
}

export interface MvImageLayer extends MvLayerBase {
	kind: "image";
	/** asset-ref（url: / post: / walk: / tile:） */
	ref: string;
	/** 解決済み表示URL（post: 参照はこれが無いと描けない） */
	url?: string;
	x: number;
	y: number;
	scale: number;
	anchor: MvAnchor;
	motion: MvMotion;
	/** 動きの強さ。bob=振幅px / drift=px毎秒 / parallax=振幅px / zoom=1分あたりの倍率増 / beatScale=膨らむ倍率 */
	motionAmount?: number;
	/** 歩行グラとして分割表示する場合の設定。 */
	walk?: MvWalkSetting;
	/** 画像を囲む枠（_.mp4 のスプライト窓）。 */
	frame?: { color: string; width: number; padding: number };
	/** ドット絵を補間せず描く。 */
	pixelated?: boolean;
	/** 左右反転して描く（歩行グラの向きを変える、鏡像を並べる等）。 */
	flipH?: boolean;
	/** 上下反転して描く。 */
	flipV?: boolean;
	/** 登場演出（スライドイン／フェードイン）。未指定＝瞬時に出現。 */
	entrance?: MvEntrance;
	/**
	 * 同じ画像を並べる（x0o0x_ のように小さいキャラが何体も散らばる絵を1レイヤーで作る）。
	 * 1体ごとに位置・大きさ・濃さを少しずつずらす。
	 */
	repeat?: {
		count: number;
		/** 1体ごとの移動量（論理px） */
		dx: number;
		dy: number;
		/** 1体ごとの拡大率の変化（0で同じ大きさ） */
		scaleStep?: number;
		/** 1体ごとの不透明度の変化（負で奥ほど薄く） */
		alphaStep?: number;
		/** 1体ごとに歩行アニメの位相をずらす秒数（バラけた足踏みになる） */
		phase?: number;
	};
}

export interface MvTextLayer extends MvLayerBase {
	kind: "text";
	text: string;
	x: number;
	y: number;
	size: number;
	color: string;
	anchor: MvAnchor;
	/** 縦書き（1文字ずつ縦に積む） */
	vertical: boolean;
	motion: MvMotion;
	motionAmount?: number;
	bold?: boolean;
	shadow?: boolean;
}

export interface MvVisualizerLayer extends MvLayerBase {
	kind: "visualizer";
	style: MvVisualizerStyle;
	rect: MvRect;
	/** 対象トラック(@n)。未指定＝全トラック。 */
	tracks?: number[];
	/** pianoRoll=画面に映る小節数 / stepGrid=1小節の分割数 / rings=同時に出す輪の数 / bars=棒の本数 */
	amount?: number;
	/** 線・枠の太さ */
	thickness?: number;
	glow?: boolean;
	/** pianoRoll のみ。平面／立体／円形の切り替え。未指定は flat。 */
	projection?: MvProjection;
	/** pianoRoll(flat) のみ。流れるか、位置を固定してページで差し替えるか。未指定は scroll。 */
	flow?: MvRollFlow;
	/** ノートの明暗と余韻。未指定は projection ごとの既定（平面は薄め、立体は濃いまま）。 */
	light?: MvNoteLight;
	/**
	 * 縦に映す音域 [低い音, 高い音]（MIDIノート番号）。未指定なら曲全体の音域。
	 * 曲全体を1枚に収めるとノート1枚が数pxになるので、**拡大表示したいときはここを狭める**。
	 * 参考動画の中央にある大きな四角は、狭い音域を大きく映したロール。
	 */
	pitchRange?: [number, number];
	/** projection==='perspective' のときの視点。 */
	view?: MvView;
	/** projection==='circular' のときの形。 */
	ring?: MvRing;
}

/**
 * 行の中の一部を色つきの下地で塗る指定。
 * 参考動画（運び屋さん）は「つき」「かぜ」「はな」といった語だけ、
 * **文字色ではなく背後の矩形**が色で塗られる（マーカーで引いたような見え方）。
 */
export interface MvLyricMark {
	/** 塗り始める文字位置（0始まり） */
	from: number;
	/** 塗り終わる文字位置（この文字は含まない） */
	to: number;
	color: string;
}

export interface MvLyricLine {
	/** 表示を始める小節（0始まり、小数可） */
	bar: number;
	text: string;
	/** どの歌詞トラック(@@n)由来か。手入力なら undefined。 */
	trackId?: number;
	/** 行の一部を色つきの下地で塗る。手入力の歌詞でだけ指定できる。 */
	marks?: MvLyricMark[];
	/**
	 * この行から新しいまとまりを始める（＝それまでに積み上がった行を全部消してから出す）。
	 * 未指定/falseなら直前までの行に積み重ねて出す。曲によってどこで区切りたいかは
	 * ケースバイケースなので、行ごとにUIで切り替えられるようにしている。
	 */
	resetBefore?: boolean;
}

/**
 * `一括貼り付け` で受け付ける行フォーマット。1行 =
 *   `<記号>[分:秒(.小数)]歌詞`   例: `L[00:19.70]ノイズまみれの世界で`
 * `#`で始まる行（場面見出し・演出メモ）は無視する。空行も無視する。
 * 先頭の記号は「その行をどんな質感で出すか」の合図——`MV_LYRIC_TAG_COLORS`
 * の色をその行まるごとの下地(marks)にする。曲のBPMから秒→小節に換算する。
 */
export const MV_LYRIC_TAG_COLORS: Record<string, string> = {
	// E: デジタル・バグ・ノイズ（ドット/バグ質感）
	E: "#4ade80",
	// L: 有機的なノイズ・波形（素の歌詞行にも使う既定）
	L: "#67e8f9",
	// W: キーボード・システムログ（タイピング質感）
	W: "#fbbf24",
	// P: 極太・フラッシュ（サビの最高潮）
	P: "#f4f4f5",
	// F: ブレる画面（グリッチ質感）
	F: "#f87171",
	// M: 立体・グラフィカル（エモい質感）
	M: "#c4b5fd",
};

const LYRIC_BULK_LINE_RE = /^([A-Za-z])\[(\d{1,2}):(\d{1,2}(?:\.\d+)?)\](.+)$/;

/** `mm:ss.cc` 表記1行ぶんをパースして秒に直す。 */
function parseLyricTimestampSec(mm: string, ss: string): number {
	return Number(mm) * 60 + Number(ss);
}

/** `#【Aメロ】（テーマ：…）` のような場面見出し行から見出し文字列を取り出す。 */
const LYRIC_SECTION_HEADER_RE = /^#\s*【(.+?)】/;

/**
 * 一括貼り付けテキストを `MvLyricLine[]` に変換する（場面見出しは無視してひとまとめにする）。
 * bpmは4/4固定（`MV_BEATS_PER_BAR`）で小節に換算するのに使う。
 * 記号が `MV_LYRIC_TAG_COLORS` に無い場合は色を付けずそのまま取り込む。
 */
export function parseLyricsBulkText(text: string, bpm: number): MvLyricLine[] {
	// 場面見出しごとの区切りは、そのまま「積み上げをリセットする」自然な境界として扱う。
	// 先頭の場面は積むものが無いのでリセット不要（resetBeforeは2つめ以降の見出しにだけ付く）。
	return parseLyricsBulkGroups(text, bpm).flatMap((g, gi) =>
		g.lines.map((line, li) =>
			gi > 0 && li === 0 ? { ...line, resetBefore: true } : line,
		),
	);
}

/**
 * 一括貼り付けテキストを `#【Aメロ】` のような場面見出しごとにグループ分けする。
 * Aメロ/Bメロ/サビで歌詞の出す位置や見た目（縦横・色・出す側）を変えたい場合、
 * 見出しごとに別々の歌詞レイヤーとして取り込めるようにするための下ごしらえ。
 * 見出しが1つも無ければ、全行が空見出し("")の1グループにまとまる。
 */
export function parseLyricsBulkGroups(
	text: string,
	bpm: number,
): { label: string; lines: MvLyricLine[] }[] {
	const secondsPerBar = (60 / Math.max(1, bpm)) * MV_BEATS_PER_BAR;
	const groups: { label: string; lines: MvLyricLine[] }[] = [];
	let current: { label: string; lines: MvLyricLine[] } | null = null;

	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		const header = line.match(LYRIC_SECTION_HEADER_RE);
		if (header) {
			current = { label: header[1], lines: [] };
			groups.push(current);
			continue;
		}
		if (line.startsWith("#")) continue; // 演出メモなどのただのコメント

		const m = line.match(LYRIC_BULK_LINE_RE);
		if (!m) continue;
		const [, tag, mm, ss, body] = m;
		const sec = parseLyricTimestampSec(mm, ss);
		const bar = sec / secondsPerBar;
		const color = MV_LYRIC_TAG_COLORS[tag.toUpperCase()];
		const parsedLine: MvLyricLine = {
			bar: Math.round(bar * 1000) / 1000,
			text: body,
			...(color ? { marks: [{ from: 0, to: body.length, color }] } : {}),
		};
		if (!current) {
			current = { label: "", lines: [] };
			groups.push(current);
		}
		current.lines.push(parsedLine);
	}

	for (const g of groups) g.lines.sort((a, b) => a.bar - b.bar);
	return groups.filter((g) => g.lines.length > 0);
}

/**
 * 歌詞の行が流れていく向き。1行目は必ず開始位置(x,y)に出て、
 * 2行目以降がこの向きへ足されていく（＝開始位置から見てどちら側へ伸びるか）。
 *
 * 縦書きは left / right、横書きは up / down を使う。
 * 旧データの 'rightToLeft' / 'leftToRight' も読めるようにしてある（resolveLyricStack）。
 */
export type MvLyricStack = "left" | "right" | "up" | "down";

/** 旧データに入っている値。読むときだけ受け付けて新しい向きへ寄せる。 */
type LegacyLyricStack = "rightToLeft" | "leftToRight";

export const MV_LYRIC_STACK_LABELS: Record<MvLyricStack, string> = {
	left: "左へ流れる",
	right: "右へ流れる",
	up: "上へ積み上がる",
	down: "下へ積み下がる",
};

/**
 * 保存された向きを、そのレイヤーの書字方向で使える値へ正規化する。
 *
 * 縦書きに 'up' のような噛み合わない値が入っていても破綻させない。
 * 既定は縦書き＝左（参考動画はどれも右端固定で左へ伸びる）、横書き＝上。
 */
export function resolveLyricStack(layer: MvLyricsLayer): MvLyricStack {
	const raw = layer.stack as MvLyricStack | LegacyLyricStack | undefined;
	const v =
		raw === "rightToLeft" ? "left" : raw === "leftToRight" ? "right" : raw;
	if (layer.vertical) return v === "right" ? "right" : "left";
	return v === "down" ? "down" : "up";
}

export interface MvLyricsLayer extends MvLayerBase {
	kind: "lyrics";
	/** 'mml' = MMLの歌詞トラック(@@n)から自動同期 / 'manual' = 小節番号つき手入力 */
	source: "mml" | "manual";
	lines?: MvLyricLine[];
	/**
	 * source==='mml' のとき画面に出す歌詞トラックID(@@n の n)。
	 * 全部出すと画面が埋まるので、既定では最初に見つかった1本だけを使う。
	 * 明示的に全部出したいときだけ 'all' にする。
	 */
	trackId?: number | "all";
	x: number;
	y: number;
	anchor: MvAnchor;
	size: number;
	color: string;
	vertical: boolean;
	/**
	 * 縦書きのとき、行がどちら向きに積み上がるか。未指定は rightToLeft
	 * （参考動画はどれも右端が固定で、新しい行が左へ足されていく）。
	 */
	stack?: MvLyricStack;
	/** 過去の行を薄く残す段数（0で残像なし）。同時に見える行数は afterimage+1。 */
	afterimage: number;
	/** 1行を何小節出しておくか。 */
	holdBars?: number;
	/** 1文字ずつタイピング表示するかどうか。 */
	typing?: boolean;
	/**
	 * ここに挙げた小節（以上）に来た最初の行から、それまでの積み上げを全部消して出し直す。
	 * `MvLyricLine.resetBefore`（手入力の行に直接付けるフラグ）と同じ効果を、
	 * source==='mml' のように行を直接編集できない歌詞にも掛けられるようにするための入り口。
	 * 手入力でも併用可（両方の指定がOR条件で効く）。
	 */
	resetBars?: number[];
}

/** 図形の形。 */
export type MvShapeForm =
	| "circle"
	| "ring"
	| "square"
	| "diamond"
	| "triangle"
	| "polygon"
	| "cross"
	| "bar"
	| "path"
	| "doubleFrame"
	| "ripple";

export const MV_SHAPE_FORM_LABELS: Record<MvShapeForm, string> = {
	circle: "円（塗り）",
	ring: "輪（線）",
	square: "四角",
	diamond: "ひし形",
	triangle: "三角",
	polygon: "多角形",
	cross: "十字",
	bar: "棒",
	path: "自由な形（SVG）",
	doubleFrame: "二重枠",
	ripple: "波紋",
};

/** モーダルの図形ピッカーでの見出しカテゴリ。 */
export type MvShapeFormCategory = "basic" | "frame" | "wave";

export const MV_SHAPE_FORM_CATEGORY: Record<MvShapeForm, MvShapeFormCategory> =
	{
		circle: "basic",
		ring: "basic",
		square: "basic",
		diamond: "basic",
		triangle: "basic",
		polygon: "basic",
		cross: "basic",
		bar: "basic",
		path: "basic",
		doubleFrame: "frame",
		ripple: "wave",
	};

export const MV_SHAPE_FORM_CATEGORY_LABELS: Record<
	MvShapeFormCategory,
	string
> = {
	basic: "基本図形",
	frame: "枠・フレーム",
	wave: "波・帯",
};

/** モーダルの図形ピッカーに出す一言説明。 */
export const MV_SHAPE_FORM_DESCRIPTIONS: Record<MvShapeForm, string> = {
	circle: "塗りつぶした円。",
	ring: "線だけの輪。",
	square: "正方形。塗り/線どちらも。",
	diamond: "45度回した四角＝ひし形。",
	triangle: "正三角形。",
	polygon: "角の数を指定できる多角形。",
	cross: "十字の線。",
	bar: "横に長い帯。スペアナの棒などに。",
	path: "SVGを貼り付けて取り込む自由形状。",
	doubleFrame:
		"内外2本の正方形の枠が小節ごとに軽く息をする。キャラや文字を囲うのに。",
	ripple: "輪が小節の頭から外へ広がって消える。1小節でぴったりループ。",
};

/**
 * 音に反応する図形。C.mp4 のような「単純な形＋演算の重ねがけ」を作るためのレイヤー。
 * 基準値（size/rotation/...）に modulators を順に適用した結果を描く。
 */
export interface MvShapeLayer extends MvLayerBase {
	kind: "shape";
	form: MvShapeForm;
	x: number;
	y: number;
	size: number;
	/** 度 */
	rotation: number;
	color: string;
	/** 塗るか、線だけか。 */
	filled: boolean;
	thickness: number;
	/**
	 * 縦横比（縦÷横）。1なら正方形/正円のまま、0.5なら縦半分に潰れ、2なら縦に2倍伸びる。
	 * barAspectとは別物——barAspectは'bar'専用の帯の太さ、こちらは全formに効く縦方向の拡縮。
	 * 未指定は1（そのまま）。
	 */
	aspect?: number;
	/** form==='polygon' のときの角数。 */
	sides?: number;
	/**
	 * form==='path' のときの形。SVGの d 属性そのまま（複数サブパス可）。
	 * 参考動画のような込み入った形は、この欄へSVGを貼り付けて取り込む。
	 */
	path?: string;
	/**
	 * path の設計座標系（SVGの viewBox 相当）[x, y, w, h]。
	 * この箱の中心が図形の中心、箱の長辺が size×2 になるよう拡縮して描く。未指定は [0,0,100,100]。
	 */
	pathBox?: [number, number, number, number];
	/**
	 * form==='bar' のときの縦横比（高さ ÷ 幅）。既定 0.32。
	 * 帯や罫線のように「横に長くて薄い」形を作るときに小さくする。
	 */
	barAspect?: number;
	/** 同じ図形を何個並べるか（1で単体）。 */
	count?: number;
	/** count>1 のときの1個あたりのサイズ差。 */
	spread?: number;
	/** count>1 のときに1個ごとに足す回転（度）。 */
	spin?: number;
	/** count>1 のときの1個あたりの位置ずれ（論理px）。横に並べた棒グループなどに使う。 */
	offsetX?: number;
	offsetY?: number;
	/**
	 * count>1 のときに、1個ごとにモジュレータの評価を何ステップ遅らせるか。
	 * 波が端から端へ伝わるような「ずれた反応」が作れる（線が順に伸び縮みする類の演出）。
	 */
	stagger?: number;
	blend?: MvBlend;
	modulators: MvModulator[];
	/**
	 * form==='path' のとき、`path` の代わりに複数の形を順番に切り替える。
	 * 参考動画のコマ送り実測で見つかった「なめらかに動くのではなく、離散的な形が
	 * 差し替わる」動きを再現するためのもの（灯りのステージ プリセットの中央モチーフなど）。
	 *
	 * 進み方は2種類:
	 * - `{ beats, resetEveryBars? }` : 一定間隔（拍ロック）で1コマずつ進む。
	 *   `resetEveryBars` を指定すると、その小節数ごとに1コマ目(小節の頭)へ戻り、
	 *   残りの小節でコマ2以降を順にめぐる（目視確認: 8小節ごとに単純な形へ戻り、
	 *   残りの小節でループする構造だったため）。指定時は `beats` は使われない。
	 * - `{ advance: "onset", track }` : 指定トラックの**発音のたびに**1コマ進む。
	 *   音のある場所と図形の切り替わりが一致しないケースが目視で確認されたため、
	 *   中央モチーフには不採用——発音回数に律速したい別の演出向けの選択肢として残す。
	 */
	iconCycle?:
		| { paths: string[]; beats: number; resetEveryBars?: number }
		| { paths: string[]; advance: "onset"; track?: number };
	/**
	 * @deprecated 場面ごとに動きを変える仕組みは廃止した。
	 *
	 * 「同じ図形なのに小節によって動きが違う」は作り手にも見る人にも分かりにくく、
	 * 設定した動きが一部の小節でしか効かないように見える事故の温床だった。
	 * 動きはレイヤーの持ち物＝曲全体で1つ（`modulators`）に統一している。
	 *
	 * 保存済みデータを読むためだけに残してある。書き込んではいけない。
	 * 読むときは `resolveShapeModulators()` を通すこと。
	 */
	modulatorsByScene?: Record<string, MvModulator[]>;
	/** @deprecated modulatorsByScene と同じ理由で廃止。読み取り専用。 */
	motionPresetByScene?: Record<string, MvShapeMotionPreset>;
	/** 「図形の動き方設定」モーダルの選択内容（復元用）。曲全体で1つ。 */
	motionPreset?: MvShapeMotionPreset;
}

/**
 * 図形に効かせる動き。曲全体で1つ。
 *
 * `modulators` が空でも、廃止した場面別データ(modulatorsByScene)しか持たない
 * 古い保存データがあるので、その場合は最初に見つかった場面ぶんを曲全体の動きとして拾う。
 * こうしないと、以前に作ったMVの図形が読み込んだ瞬間に全部止まってしまう。
 */
export function resolveShapeModulators(
	layer: MvShapeLayer,
): MvModulator[] | undefined {
	if (layer.modulators && layer.modulators.length > 0) return layer.modulators;
	const legacy = layer.modulatorsByScene;
	if (legacy) {
		for (const mods of Object.values(legacy)) {
			if (mods && mods.length > 0) return mods;
		}
	}
	return layer.modulators;
}

/** 「図形の動き方設定」モーダルの選択内容そのもの。 */
export interface MvShapeMotionPreset {
	/** MV_MOTION_PRESETS のid。すべて拍(beat)に同期する動きで、周期は beatSyncSpeed で変える。 */
	presetId: string;
	/** 動きの周期の速さ（拍数/周期）。既定1。0.5で2倍速、0.25で4倍速。 */
	beatSyncSpeed?: number;
	/**
	 * 裏拍で発火させるか（既定false＝表拍）。trueにすると発火タイミングを
	 * 半拍(0.5拍)ぶんずらす——`beatSyncSpeed`で周期を変えても、ずらす量は常に
	 * 絶対の半拍のまま（周期に比例してずれる方式だと「裏拍」の感覚とズレるため）。
	 */
	offbeat?: boolean;
	/**
	 * @deprecated 「独自の動きを組み合わせる」パネル（拍に同期しない自由な移動/回転/拡縮）は
	 * 廃止した。動きは拍周期のプリセットだけに統一している。
	 * 保存済みデータを読むためだけに残してあり、新規には書き込まない。
	 */
	custom?: {
		move: boolean;
		moveSpeedBars: number;
		rotate: boolean;
		rotateSpeed: number;
		scale: boolean;
		scaleSpeedBars: number;
	};
}

/** 画面全体にかかる演出。 */
export type MvEffectStyle =
	// 光・色
	| "flash"
	| "invert"
	| "strobe"
	| "vignette"
	| "tint"
	| "hueShift"
	| "bloom"
	// 揺らす・動かす
	| "shake"
	| "zoomPunch"
	| "roll"
	// 歪ませる・壊す
	| "rgbShift"
	| "glitch"
	| "pixelate"
	| "zoomBlur"
	| "shockwave"
	| "mirror"
	| "trail"
	// 画面の質感
	| "scanlines"
	| "filmGrain"
	| "letterbox";

export const MV_EFFECT_STYLE_LABELS: Record<MvEffectStyle, string> = {
	flash: "フラッシュ（白く光る）",
	invert: "色反転",
	strobe: "ストロボ",
	vignette: "周辺減光",
	// 参考動画（運び屋さん）は終盤で画面全体が夕焼け色へ切り替わる。
	// 明るさは残したまま色味だけ差し替えたいので、塗りつぶしではなく色の合成で作る。
	tint: "色を染める（画面全体）",
	hueShift: "色相をまわす",
	bloom: "光をにじませる（ブルーム）",
	shake: "画面ゆれ",
	zoomPunch: "ズームパンチ",
	roll: "画面を傾ける（ロール）",
	rgbShift: "色ズレ（RGBずらし）",
	glitch: "グリッチ（横に裂ける）",
	pixelate: "モザイク（粗いドット）",
	zoomBlur: "放射ブラー（ズーム流れ）",
	shockwave: "衝撃波（輪が広がる）",
	mirror: "ミラー（左右に折り返す）",
	trail: "残像（尾を引く）",
	scanlines: "走査線（ブラウン管）",
	filmGrain: "フィルムノイズ（ざらつき）",
	letterbox: "シネスコ帯（上下の黒帯）",
};

/** 演出ピッカーでの見出しカテゴリ。20種類あるので分類しないと選べない。 */
export type MvEffectCategory = "light" | "move" | "distort" | "texture";

export const MV_EFFECT_CATEGORY: Record<MvEffectStyle, MvEffectCategory> = {
	flash: "light",
	invert: "light",
	strobe: "light",
	vignette: "light",
	tint: "light",
	hueShift: "light",
	bloom: "light",
	shake: "move",
	zoomPunch: "move",
	roll: "move",
	rgbShift: "distort",
	glitch: "distort",
	pixelate: "distort",
	zoomBlur: "distort",
	shockwave: "distort",
	mirror: "distort",
	trail: "distort",
	scanlines: "texture",
	filmGrain: "texture",
	letterbox: "texture",
};

export const MV_EFFECT_CATEGORY_LABELS: Record<MvEffectCategory, string> = {
	light: "光・色",
	move: "揺らす・動かす",
	distort: "歪ませる・壊す",
	texture: "画面の質感",
};

export const MV_EFFECT_STYLE_DESCRIPTIONS: Record<MvEffectStyle, string> = {
	flash: "画面いっぱいを一瞬だけ塗る。キメの1発に。",
	invert: "色を反転させる。1拍だけ入れると強烈に効く。",
	strobe: "点いたり消えたりを刻む。長さ（拍）が点滅の周期。",
	vignette: "四隅を暗く落として真ん中へ視線を集める。",
	tint: "明るさはそのままに色味だけ差し替える。夕焼け・夜への転換に。",
	hueShift: "画面ぜんぶの色相をぐるっと回す。サビで一気に別の色へ。",
	bloom: "明るいところが光って滲む。ネオンや逆光の質感に。",
	shake: "画面全体を細かく揺らす。キックに合わせると重くなる。",
	zoomPunch: "一瞬グッと寄る。拍の頭に入れると前へ出る。",
	roll: "画面ごと左右に傾ける。揺れとは別方向の勢いが出る。",
	rgbShift: "赤と青を左右にずらす。安っぽくならない王道の壊し方。",
	glitch: "横に裂けてズレる。通信不良のような一瞬の破綻に。",
	pixelate: "粗いドットへ潰す。チップチューンや回想の入りに。",
	zoomBlur: "中心から外へ放射状に流れる。落ちる直前の一撃に。",
	shockwave: "指定した点から輪が広がって画面を押しのける。",
	mirror: "片側を反転して折り返す。万華鏡のような対称画になる。",
	trail: "前のコマを薄く残して尾を引く。強いほど長く残る。",
	scanlines: "横線を重ねてブラウン管っぽくする。ずっと点けっぱなしで使う。",
	filmGrain: "ざらついたノイズを乗せる。フィルムや古い映像の質感に。",
	letterbox: "上下に黒帯を出す。映画のワンシーンのように見せる。",
};

/**
 * 発火してから消えるまでの形。
 * 線形だけだと「鋭いキック」も「じわっと来るサビ」も同じ顔になるので、
 * 減衰カーブを選べるようにしてある。
 */
export type MvEffectCurve = "linear" | "exp" | "soft" | "swell" | "hold";

export const MV_EFFECT_CURVE_LABELS: Record<MvEffectCurve, string> = {
	linear: "まっすぐ減る",
	exp: "鋭く落ちる（打楽器向き）",
	soft: "ゆっくり落ちる（余韻）",
	swell: "ふくらんで消える",
	hold: "出しっぱなし→最後に切る",
};

/** 色の指定が効く演出。効かない演出で色欄を出すと「変えたのに何も起きない」になる。 */
export const MV_EFFECT_USES_COLOR: ReadonlySet<MvEffectStyle> =
	new Set<MvEffectStyle>([
		"flash",
		"strobe",
		"vignette",
		"tint",
		"scanlines",
		"letterbox",
		"shockwave",
	]);

/**
 * 描き終わった画を読み直して作る演出。
 * 1フレームに何度もキャンバスを読み戻すぶん重いので、editor側で枚数を注意できるようにしてある。
 */
export const MV_EFFECT_POST_STYLES: ReadonlySet<MvEffectStyle> =
	new Set<MvEffectStyle>([
		"rgbShift",
		"glitch",
		"pixelate",
		"zoomBlur",
		"shockwave",
		"mirror",
		"bloom",
		"hueShift",
		"trail",
	]);

/** 演出の発火タイミング。 */
export type MvTrigger = "always" | "beat" | "bar" | "bars" | "note" | "section";

export const MV_TRIGGER_LABELS: Record<MvTrigger, string> = {
	always: "ずっと",
	beat: "拍ごと",
	bar: "小節ごと",
	bars: "指定した小節だけ",
	note: "指定トラックの音",
	section: "場面が変わったとき",
};

export interface MvEffectLayer extends MvLayerBase {
	kind: "effect";
	style: MvEffectStyle;
	trigger: MvTrigger;
	/** trigger==='note' のとき対象にするトラック(@n)。未指定＝全トラック。 */
	tracks?: number[];
	/**
	 * trigger==='bars' のとき発火する小節番号（0始まり、小数可）。
	 * 「サビ頭の8小節目だけ光らせる」のような、狙った瞬間だけの演出に使う。
	 */
	bars?: number[];
	/** 効きの強さ 0..1 */
	amount: number;
	/** 減衰の長さ（拍）。短いほど鋭い。 */
	decayBeats?: number;
	/** flash / strobe / vignette の色。 */
	color?: string;
	/**
	 * 発火の間隔倍率。trigger==='beat'/'bar' のとき、2なら2拍（2小節）に1回になる。
	 * ハーフタイムや「2小節に1回だけ」といった間引きを、小節を全部書き出さずに作るため。
	 * 未指定は1（毎回）。
	 */
	every?: number;
	/**
	 * 発火位相のずらし（拍）。0.5で裏拍へ寄る。
	 * 拍の頭に全部が揃うと平坦になるので、演出ごとにずらせるようにしてある。
	 */
	offsetBeats?: number;
	/** 発火してから消えるまでの形。未指定は linear。 */
	curve?: MvEffectCurve;
	/**
	 * shockwave の中心。未指定は画面中央。
	 * 「キャラの立ち位置から波が出る」を作るために座標で持てるようにしてある。
	 */
	x?: number;
	y?: number;
}

/** コード進行バーの1ブロック。 */
export interface MvChordStep {
	/** 鳴り始める小節（0始まり、小数可） */
	bar: number;
	/** 表示名（"F#m7" など。そのまま描画する） */
	label: string;
}

export type MvChordColorMode =
	| "iwashi"
	| "budou"
	| "kotori"
	| "asayake"
	| "degree"
	| "fixed";

export const MV_CHORD_COLOR_MODE_LABELS: Record<MvChordColorMode, string> = {
	iwashi: "イワシがつちからはえてくるんだ風",
	budou: "ブドウがかげからのぞいてるんだ風",
	kotori: "ことりがそらへとおちてゆく風",
	asayake: "あさやけもゆうやけもないんだ風",
	degree: "度数で色分け",
	fixed: "単色",
};

/**
 * 画面下のコード進行バー。
 * ブロックを小節位置で並べ、いま鳴っているコードを強調する。
 * 色はテーマまたは「キーに対する度数」で決める（utau-kit の chord-progression-animation-tool と同じ考え方）。
 */
export interface MvChordBarLayer extends MvLayerBase {
	kind: "chordBar";
	rect: MvRect;
	chords: MvChordStep[];
	/** 度数の基準キー（"C" / "F#" など）。色分けに使う。 */
	key: string;
	/** カラーテーマまたは色分けモード */
	colorMode: MvChordColorMode;
	/** colorMode==='fixed' のときの色、および degree のときのベース明度用。 */
	color: string;
	/** いま鳴っているブロックの色。 */
	activeColor: string;
	textColor: string;
	size: number;
	/** 1画面に表示する小節数（未指定なら2） */
	windowBars?: number;
}

/**
 * キャラの頭の上に出る「度数」。
 *
 * 参考動画（運び屋さん）を拡大すると `9` `♭7` `5` と書かれている。
 * `2` ではなく `9`、`7` ではなく `♭7` という書き方なので、これは調に対する音階度数ではなく
 * **いま鳴っているコードの根音から数えたコードトーン名**。
 * 同じ音を伸ばしたままでもコードが変わると数字が変わる。
 */
export interface MvDegreeLayer extends MvLayerBase {
	kind: "degree";
	/** 数字の元になるトラック(@n)。そのトラックでいま鳴っている音を読む。 */
	track: number;
	x: number;
	y: number;
	anchor: MvAnchor;
	size: number;
	color: string;
	bold?: boolean;
	shadow?: boolean;
	/**
	 * 度数の数え方。
	 * - chord : コード進行バーの、いまの小節のコードの根音から数える（参考動画はこれ）
	 * - key   : `key` で指定した調の主音から数える
	 */
	basis: "chord" | "key";
	/** basis==='key' のとき、および参照先にコードが無い区間の基準。 */
	key: string;
	/** 参照するコード進行バーのレイヤーID。未指定なら最初に見つかった chordBar。 */
	chordLayerId?: string;
	/**
	 * 自前のコード進行。バーを画面に出さずに数字だけ出したいときに使う
	 * （参考動画にはコード進行バーが無く、頭の上の数字だけがある）。
	 * 指定するとこちらが優先される。
	 */
	chords?: MvChordStep[];
	/** 音が切れても直前の数字を出し続ける。false なら鳴っている間だけ出る。 */
	hold?: boolean;
}

export type MvLayer =
	| MvImageLayer
	| MvTextLayer
	| MvVisualizerLayer
	| MvLyricsLayer
	| MvShapeLayer
	| MvEffectLayer
	| MvChordBarLayer
	| MvDegreeLayer;

/**
 * 根音からの半音差 → コードトーン名。
 * 2半音を「2」ではなく「9」と書くのが参考動画の流儀（テンション表記）。
 */
export const MV_CHORD_TONE_NAMES = [
	"1",
	"♭9",
	"9",
	"♭3",
	"3",
	"11",
	"♯11",
	"5",
	"♯5",
	"13",
	"♭7",
	"7",
] as const;

export function chordToneLabel(semitonesFromRoot: number): string {
	return MV_CHORD_TONE_NAMES[((semitonesFromRoot % 12) + 12) % 12];
}

/** 音名 → 半音（0-11）。 */
export const MV_ROOT_TO_PITCH: Record<string, number> = {
	C: 0,
	"C#": 1,
	Db: 1,
	D: 2,
	"D#": 3,
	Eb: 3,
	E: 4,
	F: 5,
	"F#": 6,
	Gb: 6,
	G: 7,
	"G#": 8,
	Ab: 8,
	A: 9,
	"A#": 10,
	Bb: 10,
	B: 11,
};

/** 度数 → 色相。utau-kit の degreeHueMap と同じ並び。 */
export const MV_DEGREE_HUE: Record<number, number> = {
	1: 0,
	2: 40,
	3: 80,
	4: 120,
	5: 160,
	6: 200,
	7: 240,
};

/** "F#m7" のような表示名からルート音名を切り出す。 */
export function chordRootName(label: string): string {
	const m = label.match(/^([A-G][#b]?)/);
	return m ? m[1] : "C";
}

/** キーに対する度数（1-7）。スケール外なら null。 */
export function chordDegree(label: string, key: string): number | null {
	const root = MV_ROOT_TO_PITCH[chordRootName(label)] ?? 0;
	const keyPitch = MV_ROOT_TO_PITCH[key] ?? 0;
	const diff = (root - keyPitch + 12) % 12;
	const scaleMap: (number | null)[] = [
		1,
		null,
		2,
		null,
		3,
		4,
		null,
		5,
		null,
		6,
		null,
		7,
	];
	return scaleMap[diff];
}

function qualityToHue(quality: string): number {
	if (
		quality.includes("maj7") ||
		quality.includes("Δ") ||
		quality.includes("△")
	)
		return 120;
	if (quality.includes("maj") || quality.includes("M")) return 110;
	if (quality.includes("m7") || quality.includes("-7")) return 200;
	if (quality.includes("7")) return 330;
	if (quality.includes("dim") || quality.includes("〇")) return 280;
	return 50;
}

/**
 * utau-kit の chord-progression-animation-tool に基づくコード色相テーマ計算。
 * @onjmin/chord-parser の parseChord を使ってルート音とクオリティを正確に分解する。
 */
export function getChordThemeColor(
	label: string,
	key: string,
	colorMode: MvChordColorMode,
	lastColor?: string,
): string {
	let rootPitch = MV_ROOT_TO_PITCH[chordRootName(label)] ?? 0;
	const quality = label.slice(chordRootName(label).length);
	try {
		const parsed = parseChord(label);
		rootPitch = parsed.root;
	} catch {
		// parse 失敗時はフォールバック
	}

	const deg = chordDegree(label, key);

	switch (colorMode) {
		case "iwashi": {
			// イワシがつちからはえてくるんだ風
			let h = qualityToHue(quality);
			if (deg === 6 && quality.includes("m7")) {
				h = (h + 30) % 360;
			}
			h = (h + rootPitch * 2) % 360;
			return `hsl(${h}, 65%, 35%)`;
		}
		case "budou": {
			// ブドウがかげからのぞいてるんだ風
			if (deg === 6 && quality === "m7") return `hsl(220, 65%, 35%)`;
			if (quality.includes("maj")) return `hsl(140, 65%, 35%)`;
			if (quality.includes("dim")) return `hsl(280, 65%, 32%)`;
			if (quality.includes("m7")) return `hsl(210, 65%, 35%)`;
			if (quality.includes("7")) return `hsl(10, 65%, 35%)`;
			return `hsl(50, 65%, 35%)`;
		}
		case "kotori": {
			// ことりがそらへとおちてゆく風
			const degreeHueMap: Record<number, number> = {
				1: 0,
				2: 40,
				3: 80,
				4: 120,
				5: 160,
				6: 200,
				7: 240,
			};
			const d = deg ?? 1;
			const baseHue = degreeHueMap[d] ?? 0;
			const baseColor = `hsl(${baseHue}, 65%, 35%)`;
			if (baseColor === lastColor) {
				return `hsl(${baseHue}, 65%, 26%)`;
			}
			return baseColor;
		}
		case "asayake": {
			// あさやけもゆうやけもないんだ風
			if (deg === 3) return `hsl(200, 65%, 35%)`;
			if (quality.includes("maj7")) return `hsl(100, 65%, 35%)`;
			if (quality.includes("m7")) return `hsl(210, 65%, 32%)`;
			return `hsl(40, 65%, 35%)`;
		}
		case "degree": {
			if (deg === null) return "hsl(0, 0%, 25%)";
			return `hsl(${MV_DEGREE_HUE[deg]}, 55%, 32%)`;
		}
		case "fixed":
		default:
			return "";
	}
}

/**
 * 場面の切替点。キーフレームではなく「ここから別の絵になる」という区切りだけを持つ。
 *
 * レイヤーの出し分け（`MvLayer.sections`）に加えて、**場面そのものが背景と転換を持つ**。
 * 参考動画はどれも 4/8/16小節の周期でまるごと画が変わるので、
 * 「この小節から、この背景で、こう切り替わる」を1行で書けないと長尺で持たない。
 */
export interface MvSection {
	id: string;
	label: string;
	/** 0始まりの小節番号 */
	startBar: number;
	/** この場面のあいだだけ `MvStage` を上書きする項目。未指定の項目は全体の設定のまま。 */
	stage?: MvSceneStage;
	/** この場面へ入るときの切り替え方。未指定＝カット。 */
	transition?: MvTransition;
}

export interface MvManifest {
	version: 1;
	preset: MvPresetKind;
	title: string;
	credit?: string;
	/** 楽曲本体。@onjmin/dtm のMML。MVの時間軸はすべてこれ由来。 */
	mml: string;
	/** 音の出し方。未指定なら DEFAULT_MV_AUDIO_MODE。 */
	audio?: { mode: MvAudioMode };
	/** 歩行グラのコマ送り速度倍率。未指定なら DEFAULT_MV_WALK_SPEED。 */
	walkSpeed?: number;
	stage: MvStage;
	layers: MvLayer[];
	sections: MvSection[];
	/** レイヤーの入れ子グループ。未指定/空＝どのレイヤーもグループに属さない。 */
	groups?: MvLayerGroup[];
}

// ───────────────── ラベル ─────────────────

export const MV_PRESET_LABELS: Record<MvPresetKind, string> = {
	pianoRoll: "ピアノロール",
	pixelStage: "ドット絵ステージ",
	geometric: "ジオメトリック",
};

export const MV_MOTION_LABELS: Record<MvMotion, string> = {
	none: "動かさない",
	bob: "ゆらす",
	drift: "流す",
	parallax: "奥行き",
	zoom: "ズーム",
	beatScale: "拍で脈動",
};

export const MV_VISUALIZER_LABELS: Record<MvVisualizerStyle, string> = {
	pianoRoll: "ピアノロール",
	stepGrid: "ステップ格子",
	rings: "波紋",
	bars: "スペアナ",
};

export const MV_LAYER_KIND_LABELS: Record<MvLayer["kind"], string> = {
	image: "画像",
	text: "文字",
	visualizer: "ビジュアライザ",
	lyrics: "歌詞",
	shape: "図形",
	effect: "演出",
	chordBar: "コード進行バー",
	degree: "度数（頭の上の数字）",
};

// ───────────────── ヘルパ ─────────────────

/** セクションIDの一覧から、指定小節に該当するセクションを返す（先頭より前なら最初のセクション）。 */
export function sectionAtBar(
	sections: MvSection[],
	bar: number,
): MvSection | null {
	if (sections.length === 0) return null;
	const sorted = [...sections].sort((a, b) => a.startBar - b.startBar);
	let current = sorted[0];
	for (const s of sorted) {
		if (bar >= s.startBar) current = s;
		else break;
	}
	return current;
}

/**
 * いまの場面で実際に使う背景設定。場面の指定が無い項目は全体設定のまま。
 *
 * `bgRef`/`bgUrl` は対にして扱う——場面側が背景画像を指定したとき、
 * 全体側の解決済みURLが残っていると別の絵が出てしまうため、両方まとめて差し替える。
 * `bgRef: ''`（空文字）は「この場面は背景画像なし」の意味で、全体の背景画像を打ち消す。
 */
export function resolveSceneStage(
	stage: MvStage,
	section: MvSection | null,
): MvStage {
	const s = section?.stage;
	if (!s) return stage;
	const merged: MvStage = { ...stage };
	if (s.bgColor !== undefined) merged.bgColor = s.bgColor;
	if (s.bgFit !== undefined) merged.bgFit = s.bgFit;
	if (s.bgDim !== undefined) merged.bgDim = s.bgDim;
	if (s.pulse !== undefined) merged.pulse = s.pulse;
	if (s.palette !== undefined && s.palette.length > 0)
		merged.palette = s.palette;
	if (s.bgRef !== undefined || s.bgUrl !== undefined) {
		merged.bgRef = s.bgRef;
		merged.bgUrl = s.bgUrl;
	}
	return merged;
}

/** レイヤーが、いまのセクションで表示対象かどうか。 */
export function isLayerVisible(
	layer: MvLayer,
	sectionId: string | null,
	bar?: number,
): boolean {
	if (layer.sections && layer.sections.length > 0 && sectionId) {
		if (!layer.sections.includes(sectionId)) return false;
	}
	if (layer.barRange && bar !== undefined) {
		const [from, to] = layer.barRange;
		if (bar < from || bar >= to) return false;
	}
	return true;
}

/**
 * そのレイヤーが「出てきた」小節。登場演出の起点に使う。
 * 場面指定が無ければ曲頭(0)。
 * 連続する場面にまたがって表示されるときは、その連続の先頭を返す
 * ——場面が変わるたびに登場演出をやり直すと、出っぱなしの絵が何度も飛び込んでくるため。
 */
export function layerAppearBar(
	layer: MvLayer,
	sections: MvSection[],
	sectionId: string | null,
): number {
	if (layer.barRange) return layer.barRange[0];
	if (!layer.sections || layer.sections.length === 0) return 0;
	if (!sectionId) return 0;
	const sorted = [...sections].sort((a, b) => a.startBar - b.startBar);
	let idx = sorted.findIndex((s) => s.id === sectionId);
	if (idx < 0) return 0;
	while (idx > 0 && layer.sections.includes(sorted[idx - 1].id)) idx--;
	return sorted[idx].startBar;
}

/**
 * そのレイヤーが「消える」小節。退場演出の終点に使う。
 */
export function layerDisappearBar(
	layer: MvLayer,
	sections: MvSection[],
	sectionId: string | null,
	totalBars: number,
): number {
	if (layer.barRange) return layer.barRange[1];
	if (!layer.sections || layer.sections.length === 0) return totalBars;
	if (!sectionId) return totalBars;
	const sorted = [...sections].sort((a, b) => a.startBar - b.startBar);
	let idx = sorted.findIndex((s) => s.id === sectionId);
	if (idx < 0) return totalBars;
	while (
		idx < sorted.length - 1 &&
		layer.sections.includes(sorted[idx + 1].id)
	) {
		idx++;
	}
	const nextSec = sorted[idx + 1];
	return nextSec ? nextSec.startBar : totalBars;
}

export function mvAudioMode(manifest: MvManifest): MvAudioMode {
	return manifest.audio?.mode ?? DEFAULT_MV_AUDIO_MODE;
}

export function mvWalkSpeed(manifest: MvManifest): number {
	return manifest.walkSpeed ?? DEFAULT_MV_WALK_SPEED;
}

let uidCounter = 0;
/** レイヤー/セクションのID生成。 */
export function mvUid(prefix: string): string {
	uidCounter += 1;
	return `${prefix}_${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

/** 空のMV（プリセット未選択時のフォールバック）。 */
export function emptyMvManifest(): MvManifest {
	return {
		version: 1,
		preset: "geometric",
		title: "無題のMV",
		mml: "",
		audio: { mode: DEFAULT_MV_AUDIO_MODE },
		stage: {
			bgColor: "#05070c",
			bgFit: "cover",
			pulse: "none",
			palette: ["#7dd3fc", "#a3e635", "#fbbf24", "#f87171", "#60a5fa"],
			fadeIn: true,
			fadeOut: true,
		},
		layers: [],
		sections: [{ id: "main", label: "本編", startBar: 0 }],
	};
}
