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

import type { WayKey } from './walk-sprite';

/** MVの論理解像度(16:9)。描画は常にこの座標系で行い、表示側が CSS transform で拡大する。 */
export const MV_W = 640;
export const MV_H = 360;

/** @onjmin/dtm の DEFAULT_STEPS_PER_BAR と同値。 */
export const MV_STEPS_PER_BAR = 192;
export const MV_BEATS_PER_BAR = 4;
export const MV_STEPS_PER_BEAT = MV_STEPS_PER_BAR / MV_BEATS_PER_BAR;

export type MvPresetKind = 'pianoRoll' | 'pixelStage' | 'geometric';

// ───────────────── 音の出し方 ─────────────────

/**
 * 再生の重さと音質のトレードオフ。
 * - light        : @onjmin/dtm 内蔵の矩形波シンセ。ダウンロード無しで即鳴る。
 * - soundfont    : SoundFont の楽器音。歌詞トラックは楽器として鳴る。
 * - soundfontKoe : SoundFont の楽器音 ＋ koe による歌声合成。既定。
 */
export type MvAudioMode = 'light' | 'soundfont' | 'soundfontKoe';

export const MV_AUDIO_MODE_LABELS: Record<MvAudioMode, string> = {
  light: '軽量（内蔵シンセ）',
  soundfont: '外部音源',
  soundfontKoe: '外部音源＋歌声',
};

export const MV_AUDIO_MODE_HINTS: Record<MvAudioMode, string> = {
  light: '音源をダウンロードしないので、すぐ鳴り始めます。音は素朴な矩形波です。',
  soundfont: '楽器の音がちゃんと鳴ります。歌詞トラックも楽器として演奏されます。',
  soundfontKoe: '楽器＋歌声。読み込みに少し時間がかかりますが、いちばん元の曲に近い鳴り方です。',
};

export const DEFAULT_MV_AUDIO_MODE: MvAudioMode = 'soundfontKoe';

// ───────────────── 動き・見た目の共通enum ─────────────────

/**
 * レイヤーの動き。数値で自由に組むのではなく、この中から1つ選ぶ。
 * 強さだけ motionAmount で調整できる。
 */
export type MvMotion =
  | 'none'
  /** 上下にゆっくり揺れる（キャラ絵の呼吸） */
  | 'bob'
  /** 横へ流れて画面端で反対側から出てくる（シャチ・雲） */
  | 'drift'
  /** 拍に合わせてわずかに横へずれる（奥行き演出） */
  | 'parallax'
  /** じわじわ拡大（Ken Burns） */
  | 'zoom'
  /** 拍の頭で膨らんで戻る */
  | 'beatScale';

export type MvAnchor =
  | 'topLeft' | 'top' | 'topRight'
  | 'left' | 'center' | 'right'
  | 'bottomLeft' | 'bottom' | 'bottomRight';

/** 背景そのものの拍演出。 */
export type MvStagePulse = 'none' | 'breathe' | 'flash';

export type MvBgFit = 'cover' | 'contain' | 'tile';

/** canvas の合成モード。図形を重ねたときの「足し算/掛け算」的な見え方を作る。 */
export type MvBlend = 'normal' | 'add' | 'multiply' | 'screen' | 'difference' | 'exclusion' | 'xor';

export const MV_BLEND_LABELS: Record<MvBlend, string> = {
  normal: '通常',
  add: '加算（明るく重ねる）',
  multiply: '乗算（暗く重ねる）',
  screen: 'スクリーン',
  difference: '差の絶対値',
  exclusion: '除外',
  xor: '排他',
};

/** MvBlend → CanvasRenderingContext2D.globalCompositeOperation */
export const MV_BLEND_COMPOSITE: Record<MvBlend, GlobalCompositeOperation> = {
  normal: 'source-over',
  add: 'lighter',
  multiply: 'multiply',
  screen: 'screen',
  difference: 'difference',
  exclusion: 'exclusion',
  xor: 'xor',
};

export type MvVisualizerStyle =
  /** ピアノロール（平面／立体／円形を projection で切り替える） */
  | 'pianoRoll'
  /** ステップシーケンサ格子。拍ごとにマスが点灯する */
  | 'stepGrid'
  /** 拍で同心円が広がる */
  | 'rings'
  /** 音域別の縦棒スペアナ風 */
  | 'bars';

/**
 * ピアノロールの見せ方。MIDITrail のような立体視・円形表示を切り替える。
 * - flat        : 真横から見た平面（従来）
 * - perspective : 奥行きのある板を任意の角度から見る（MIDITrail 既定に近い）
 * - circular    : 音域を円周に巻きつけ、時間を半径方向に流す
 */
export type MvProjection = 'flat' | 'perspective' | 'circular';

export const MV_PROJECTION_LABELS: Record<MvProjection, string> = {
  flat: '平面',
  perspective: '立体（3D）',
  circular: '円形',
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
  /** ノート板の奥行き（論理px）。大きいほど長いトンネルになる。 */
  depth: number;
  /** ノートの厚み（立体表示のときの高さ）。 */
  thickness: number;
}

export const DEFAULT_MV_VIEW: MvView = {
  pitch: 28,
  yaw: 0,
  roll: 0,
  fov: 55,
  depth: 900,
  thickness: 6,
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
export type MvModSource = 'beat' | 'bar' | 'time' | 'trackEnergy' | 'trackOnset' | 'trackPitch' | 'constant';

/** モジュレータの当て先。 */
export type MvModTarget = 'size' | 'rotation' | 'opacity' | 'x' | 'y' | 'thickness' | 'sides' | 'count';

/** 四則演算。基準値に対してどう混ぜるか。 */
export type MvModOp = 'add' | 'sub' | 'mul' | 'div';

export const MV_MOD_SOURCE_LABELS: Record<MvModSource, string> = {
  beat: '拍',
  bar: '小節',
  time: '時間（連続）',
  trackEnergy: 'トラックの鳴り',
  trackOnset: 'トラックの打点',
  trackPitch: 'トラックの音の高さ',
  constant: '定数',
};

export const MV_MOD_TARGET_LABELS: Record<MvModTarget, string> = {
  size: '大きさ',
  rotation: '回転',
  opacity: '濃さ',
  x: '横位置',
  y: '縦位置',
  thickness: '線の太さ',
  sides: '角の数',
  count: '個数',
};

export const MV_MOD_OP_LABELS: Record<MvModOp, string> = {
  add: '＋ 足す',
  sub: '− 引く',
  mul: '× 掛ける',
  div: '÷ 割る',
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
}

// ───────────────── レイヤー ─────────────────

interface MvLayerBase {
  id: string;
  /** 表示するセクションID。未指定＝全セクションで表示。 */
  sections?: string[];
  /** 描画順。小さいほど奥。 */
  z?: number;
  /** 0..1 */
  opacity?: number;
}

export interface MvWalkSetting {
  /** lib/walk-sprite.ts の WalkStandard.id（'auto' 可） */
  stdId: string;
  crop?: [number, number, number, number];
  frames?: number;
  row?: number;
  dir?: WayKey;
  /** 足踏みのコマ/秒 */
  fps?: number;
}

export interface MvImageLayer extends MvLayerBase {
  kind: 'image';
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
  kind: 'text';
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
  kind: 'visualizer';
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
  /** projection==='perspective' のときの視点。 */
  view?: MvView;
  /** projection==='circular' のときの形。 */
  ring?: MvRing;
}

export interface MvLyricLine {
  /** 表示を始める小節（0始まり、小数可） */
  bar: number;
  text: string;
  /** どの歌詞トラック(@@n)由来か。手入力なら undefined。 */
  trackId?: number;
}

export interface MvLyricsLayer extends MvLayerBase {
  kind: 'lyrics';
  /** 'mml' = MMLの歌詞トラック(@@n)から自動同期 / 'manual' = 小節番号つき手入力 */
  source: 'mml' | 'manual';
  lines?: MvLyricLine[];
  /**
   * source==='mml' のとき画面に出す歌詞トラックID(@@n の n)。
   * 全部出すと画面が埋まるので、既定では最初に見つかった1本だけを使う。
   * 明示的に全部出したいときだけ 'all' にする。
   */
  trackId?: number | 'all';
  x: number;
  y: number;
  anchor: MvAnchor;
  size: number;
  color: string;
  vertical: boolean;
  /** 過去の行を薄く残す段数（0で残像なし）。 */
  afterimage: number;
  /** 1行を何小節出しておくか。 */
  holdBars?: number;
}

/** 図形の形。 */
export type MvShapeForm = 'circle' | 'ring' | 'square' | 'diamond' | 'triangle' | 'polygon' | 'cross' | 'bar';

export const MV_SHAPE_FORM_LABELS: Record<MvShapeForm, string> = {
  circle: '円（塗り）',
  ring: '輪（線）',
  square: '四角',
  diamond: 'ひし形',
  triangle: '三角',
  polygon: '多角形',
  cross: '十字',
  bar: '棒',
};

/**
 * 音に反応する図形。C.mp4 のような「単純な形＋演算の重ねがけ」を作るためのレイヤー。
 * 基準値（size/rotation/...）に modulators を順に適用した結果を描く。
 */
export interface MvShapeLayer extends MvLayerBase {
  kind: 'shape';
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
  /** form==='polygon' のときの角数。 */
  sides?: number;
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
}

/** 画面全体にかかる演出。 */
export type MvEffectStyle = 'flash' | 'invert' | 'shake' | 'zoomPunch' | 'strobe' | 'vignette';

export const MV_EFFECT_STYLE_LABELS: Record<MvEffectStyle, string> = {
  flash: 'フラッシュ（白く光る）',
  invert: '色反転',
  shake: '画面ゆれ',
  zoomPunch: 'ズームパンチ',
  strobe: 'ストロボ',
  vignette: '周辺減光',
};

/** 演出の発火タイミング。 */
export type MvTrigger = 'always' | 'beat' | 'bar' | 'note' | 'section';

export const MV_TRIGGER_LABELS: Record<MvTrigger, string> = {
  always: 'ずっと',
  beat: '拍ごと',
  bar: '小節ごと',
  note: '指定トラックの音',
  section: '場面が変わったとき',
};

export interface MvEffectLayer extends MvLayerBase {
  kind: 'effect';
  style: MvEffectStyle;
  trigger: MvTrigger;
  /** trigger==='note' のとき対象にするトラック(@n)。未指定＝全トラック。 */
  tracks?: number[];
  /** 効きの強さ 0..1 */
  amount: number;
  /** 減衰の長さ（拍）。短いほど鋭い。 */
  decayBeats?: number;
  /** flash / strobe / vignette の色。 */
  color?: string;
}

/** コード進行バーの1ブロック。 */
export interface MvChordStep {
  /** 鳴り始める小節（0始まり、小数可） */
  bar: number;
  /** 表示名（"F#m7" など。そのまま描画する） */
  label: string;
}

/**
 * 画面下のコード進行バー。
 * ブロックを小節位置で並べ、いま鳴っているコードを強調する。
 * 色は「キーに対する度数」で決める（utau-kit の chord-progression-animation-tool と同じ考え方）。
 */
export interface MvChordBarLayer extends MvLayerBase {
  kind: 'chordBar';
  rect: MvRect;
  chords: MvChordStep[];
  /** 度数の基準キー（"C" / "F#" など）。色分けに使う。 */
  key: string;
  /** 'degree' = 度数で色分け / 'fixed' = 全部同じ色 */
  colorMode: 'degree' | 'fixed';
  /** colorMode==='fixed' のときの色、および degree のときのベース明度用。 */
  color: string;
  /** いま鳴っているブロックの色。 */
  activeColor: string;
  textColor: string;
  size: number;
  /** 1画面に表示する小節数（未指定なら2） */
  windowBars?: number;
}

export type MvLayer =
  | MvImageLayer
  | MvTextLayer
  | MvVisualizerLayer
  | MvLyricsLayer
  | MvShapeLayer
  | MvEffectLayer
  | MvChordBarLayer;

/** 音名 → 半音（0-11）。 */
export const MV_ROOT_TO_PITCH: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** 度数 → 色相。utau-kit の degreeHueMap と同じ並び。 */
export const MV_DEGREE_HUE: Record<number, number> = {
  1: 0, 2: 40, 3: 80, 4: 120, 5: 160, 6: 200, 7: 240,
};

/** "F#m7" のような表示名からルート音名を切り出す。 */
export function chordRootName(label: string): string {
  const m = label.match(/^([A-G][#b]?)/);
  return m ? m[1] : 'C';
}

/** キーに対する度数（1-7）。スケール外なら null。 */
export function chordDegree(label: string, key: string): number | null {
  const root = MV_ROOT_TO_PITCH[chordRootName(label)] ?? 0;
  const keyPitch = MV_ROOT_TO_PITCH[key] ?? 0;
  const diff = (root - keyPitch + 12) % 12;
  const scaleMap: (number | null)[] = [1, null, 2, null, 3, 4, null, 5, null, 6, null, 7];
  return scaleMap[diff];
}

/** 場面の切替点。キーフレームではなく「ここから別の絵になる」という区切りだけを持つ。 */
export interface MvSection {
  id: string;
  label: string;
  /** 0始まりの小節番号 */
  startBar: number;
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
  stage: MvStage;
  layers: MvLayer[];
  sections: MvSection[];
}

// ───────────────── ラベル ─────────────────

export const MV_PRESET_LABELS: Record<MvPresetKind, string> = {
  pianoRoll: 'ピアノロール',
  pixelStage: 'ドット絵ステージ',
  geometric: 'ジオメトリック',
};

export const MV_MOTION_LABELS: Record<MvMotion, string> = {
  none: '動かさない',
  bob: 'ゆらす',
  drift: '流す',
  parallax: '奥行き',
  zoom: 'ズーム',
  beatScale: '拍で脈動',
};

export const MV_VISUALIZER_LABELS: Record<MvVisualizerStyle, string> = {
  pianoRoll: 'ピアノロール',
  stepGrid: 'ステップ格子',
  rings: '波紋',
  bars: 'スペアナ',
};

export const MV_LAYER_KIND_LABELS: Record<MvLayer['kind'], string> = {
  image: '画像',
  text: '文字',
  visualizer: 'ビジュアライザ',
  lyrics: '歌詞',
  shape: '図形',
  effect: '演出',
  chordBar: 'コード進行バー',
};

// ───────────────── ヘルパ ─────────────────

/** セクションIDの一覧から、指定小節に該当するセクションを返す（先頭より前なら最初のセクション）。 */
export function sectionAtBar(sections: MvSection[], bar: number): MvSection | null {
  if (sections.length === 0) return null;
  const sorted = [...sections].sort((a, b) => a.startBar - b.startBar);
  let current = sorted[0];
  for (const s of sorted) {
    if (bar >= s.startBar) current = s;
    else break;
  }
  return current;
}

/** レイヤーが、いまのセクションで表示対象かどうか。 */
export function isLayerVisible(layer: MvLayer, sectionId: string | null): boolean {
  if (!layer.sections || layer.sections.length === 0) return true;
  if (!sectionId) return true;
  return layer.sections.includes(sectionId);
}

export function mvAudioMode(manifest: MvManifest): MvAudioMode {
  return manifest.audio?.mode ?? DEFAULT_MV_AUDIO_MODE;
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
    preset: 'geometric',
    title: '無題のMV',
    mml: '',
    audio: { mode: DEFAULT_MV_AUDIO_MODE },
    stage: {
      bgColor: '#05070c',
      bgFit: 'cover',
      pulse: 'none',
      palette: ['#7dd3fc', '#a3e635', '#fbbf24', '#f87171', '#60a5fa'],
    },
    layers: [],
    sections: [{ id: 'main', label: '本編', startBar: 0 }],
  };
}
