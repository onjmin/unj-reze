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
import { parseChord } from '@onjmin/chord-parser';

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

/**
 * 登場のときにどこから入ってくるか。'none' は移動せずその場に出る。
 * 「上下左右からスライドしてくる」を数値キーフレーム無しで指定するための enum。
 */
export type MvEnterFrom = 'none' | 'left' | 'right' | 'top' | 'bottom';

export const MV_ENTER_FROM_LABELS: Record<MvEnterFrom, string> = {
  none: 'その場（動かさない）',
  left: '左から',
  right: '右から',
  top: '上から',
  bottom: '下から',
};

/**
 * レイヤーの登場演出。未指定なら「瞬時に出現」（従来の挙動）。
 * 起点は「そのレイヤーが出てきた場面の頭」で、`beats` 拍かけて定位置・不透明へ寄っていく。
 * `from` と `fade` は独立なので、スライドのみ／フェードのみ／左からフェードイン、が全部作れる。
 */
export interface MvEntrance {
  from: MvEnterFrom;
  /** 透明から現れるか */
  fade: boolean;
  /** 演出にかける長さ（拍）。0以下なら瞬時に出る */
  beats: number;
  /** スライドの距離（論理px）。未指定なら横=画面幅の半分／縦=画面高さの半分。 */
  distance?: number;
}

export const DEFAULT_MV_ENTRANCE: MvEntrance = { from: 'none', fade: true, beats: 2 };

/** 登場演出のスライド距離（論理px）。未指定時の既定を解決する。 */
export function mvEntranceDistance(entrance: MvEntrance): number {
  if (entrance.distance !== undefined) return entrance.distance;
  return entrance.from === 'top' || entrance.from === 'bottom' ? MV_H / 2 : MV_W / 2;
}

/** 何も起きない（＝瞬時に出現と同じ）登場演出か。 */
export function isMvEntranceInert(entrance: MvEntrance | undefined): boolean {
  if (!entrance) return true;
  if (entrance.beats <= 0) return true;
  return entrance.from === 'none' && !entrance.fade;
}

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
export type MvRollFlow = 'scroll' | 'page';

export const MV_ROLL_FLOW_LABELS: Record<MvRollFlow, string> = {
  scroll: '流れる（右から左へ）',
  page: '固定（小節ごとに譜面を差し替え）',
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
export const DEFAULT_MV_NOTE_LIGHT_3D: MvNoteLight = { dim: 0.8, fadeOut: false };

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
  | 'cut' | 'fade' | 'flash' | 'wipeLeft' | 'wipeRight' | 'wipeUp' | 'wipeDown' | 'dissolve';

export const MV_TRANSITION_LABELS: Record<MvTransitionStyle, string> = {
  cut: 'そのまま切り替わる',
  fade: '暗転から明ける',
  flash: '光ってから現れる',
  wipeLeft: '左へ払う',
  wipeRight: '右へ払う',
  wipeUp: '上へ払う',
  wipeDown: '下へ払う',
  dissolve: '粒子がほどけて現れる',
};

/**
 * `dissolve` が使う粒子シート。白い点が敷き詰まった状態からほどけていく14コマ。
 * 黒地の上に加算合成で重ねる前提なので、黒い部分は何も足さない＝そのまま透ける。
 */
export const MV_PARTICLE_REVEAL_URL = '/assets/mv/particle-reveal.png';
export const MV_PARTICLE_REVEAL_FRAMES = 14;
/** 逆再生（画面を粒子で覆っていく15コマ）。画像レイヤーとして使える。 */
export const MV_PARTICLE_COVER_URL = '/assets/mv/particle-cover.png';
export const MV_PARTICLE_COVER_FRAMES = 15;

export interface MvTransition {
  style: MvTransitionStyle;
  /** 演出にかける長さ（拍）。0以下ならカットと同じ。 */
  beats: number;
  /** 覆いの色。fade は既定 #000000、flash は #ffffff。 */
  color?: string;
}

export const DEFAULT_MV_TRANSITION: MvTransition = { style: 'fade', beats: 1 };

/** 何も起きない転換か。 */
export function isMvTransitionInert(t: MvTransition | undefined): boolean {
  return !t || t.style === 'cut' || t.beats <= 0;
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
  playMode?: 'loop' | 'pingpong' | 'once';
  /**
   * 1周を何拍で回すか。指定すると `fps` より優先され、**曲のテンポに合わせて**コマが送られる。
   * 4コマのループに `loopBeats: 4` を入れれば1小節で1周する。
   * 秒で指定する `fps` だとテンポを変えた瞬間に絵と音がずれるので、拍で持てるようにしてある。
   */
  loopBeats?: number;
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
}

/**
 * 縦書き歌詞の積み上がる向き。
 * - rightToLeft : 右端を固定して、新しい行が左へ足されていく（参考動画3本ともこれ）
 * - leftToRight : `x` に最新行を置き、古い行が右へ流れていく
 */
export type MvLyricStack = 'rightToLeft' | 'leftToRight';

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
  /**
   * 縦書きのとき、行がどちら向きに積み上がるか。未指定は rightToLeft
   * （参考動画はどれも右端が固定で、新しい行が左へ足されていく）。
   */
  stack?: MvLyricStack;
  /** 過去の行を薄く残す段数（0で残像なし）。 */
  afterimage: number;
  /** 1行を何小節出しておくか。 */
  holdBars?: number;
  /** 1文字ずつタイピング表示するかどうか。 */
  typing?: boolean;
}

/** 図形の形。 */
export type MvShapeForm = 'circle' | 'ring' | 'square' | 'diamond' | 'triangle' | 'polygon' | 'cross' | 'bar' | 'path';

export const MV_SHAPE_FORM_LABELS: Record<MvShapeForm, string> = {
  circle: '円（塗り）',
  ring: '輪（線）',
  square: '四角',
  diamond: 'ひし形',
  triangle: '三角',
  polygon: '多角形',
  cross: '十字',
  bar: '棒',
  path: '自由な形（SVG）',
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
}

/** 画面全体にかかる演出。 */
export type MvEffectStyle = 'flash' | 'invert' | 'shake' | 'zoomPunch' | 'strobe' | 'vignette' | 'tint';

export const MV_EFFECT_STYLE_LABELS: Record<MvEffectStyle, string> = {
  flash: 'フラッシュ（白く光る）',
  invert: '色反転',
  shake: '画面ゆれ',
  zoomPunch: 'ズームパンチ',
  strobe: 'ストロボ',
  vignette: '周辺減光',
  // 参考動画（運び屋さん）は終盤で画面全体が夕焼け色へ切り替わる。
  // 明るさは残したまま色味だけ差し替えたいので、塗りつぶしではなく色の合成で作る。
  tint: '色を染める（画面全体）',
};

/** 演出の発火タイミング。 */
export type MvTrigger = 'always' | 'beat' | 'bar' | 'bars' | 'note' | 'section';

export const MV_TRIGGER_LABELS: Record<MvTrigger, string> = {
  always: 'ずっと',
  beat: '拍ごと',
  bar: '小節ごと',
  bars: '指定した小節だけ',
  note: '指定トラックの音',
  section: '場面が変わったとき',
};

export interface MvEffectLayer extends MvLayerBase {
  kind: 'effect';
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
}

/** コード進行バーの1ブロック。 */
export interface MvChordStep {
  /** 鳴り始める小節（0始まり、小数可） */
  bar: number;
  /** 表示名（"F#m7" など。そのまま描画する） */
  label: string;
}

export type MvChordColorMode =
  | 'iwashi'
  | 'budou'
  | 'kotori'
  | 'asayake'
  | 'degree'
  | 'fixed';

export const MV_CHORD_COLOR_MODE_LABELS: Record<MvChordColorMode, string> = {
  iwashi: 'イワシがつちからはえてくるんだ風',
  budou: 'ブドウがかげからのぞいてるんだ風',
  kotori: 'ことりがそらへとおちてゆく風',
  asayake: 'あさやけもゆうやけもないんだ風',
  degree: '度数で色分け',
  fixed: '単色',
};

/**
 * 画面下のコード進行バー。
 * ブロックを小節位置で並べ、いま鳴っているコードを強調する。
 * 色はテーマまたは「キーに対する度数」で決める（utau-kit の chord-progression-animation-tool と同じ考え方）。
 */
export interface MvChordBarLayer extends MvLayerBase {
  kind: 'chordBar';
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
  kind: 'degree';
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
  basis: 'chord' | 'key';
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
  '1', '♭9', '9', '♭3', '3', '11', '♯11', '5', '♯5', '13', '♭7', '7',
] as const;

export function chordToneLabel(semitonesFromRoot: number): string {
  return MV_CHORD_TONE_NAMES[((semitonesFromRoot % 12) + 12) % 12];
}

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

function qualityToHue(quality: string): number {
  if (quality.includes('maj7') || quality.includes('Δ') || quality.includes('△')) return 120;
  if (quality.includes('maj') || quality.includes('M')) return 110;
  if (quality.includes('m7') || quality.includes('-7')) return 200;
  if (quality.includes('7')) return 330;
  if (quality.includes('dim') || quality.includes('〇')) return 280;
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
  lastColor?: string
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
    case 'iwashi': {
      // イワシがつちからはえてくるんだ風
      let h = qualityToHue(quality);
      if (deg === 6 && quality.includes('m7')) {
        h = (h + 30) % 360;
      }
      h = (h + rootPitch * 2) % 360;
      return `hsl(${h}, 65%, 35%)`;
    }
    case 'budou': {
      // ブドウがかげからのぞいてるんだ風
      if (deg === 6 && quality === 'm7') return `hsl(220, 65%, 35%)`;
      if (quality.includes('maj')) return `hsl(140, 65%, 35%)`;
      if (quality.includes('dim')) return `hsl(280, 65%, 32%)`;
      if (quality.includes('m7')) return `hsl(210, 65%, 35%)`;
      if (quality.includes('7')) return `hsl(10, 65%, 35%)`;
      return `hsl(50, 65%, 35%)`;
    }
    case 'kotori': {
      // ことりがそらへとおちてゆく風
      const degreeHueMap: Record<number, number> = {
        1: 0, 2: 40, 3: 80, 4: 120, 5: 160, 6: 200, 7: 240,
      };
      const d = deg ?? 1;
      const baseHue = degreeHueMap[d] ?? 0;
      const baseColor = `hsl(${baseHue}, 65%, 35%)`;
      if (baseColor === lastColor) {
        return `hsl(${baseHue}, 65%, 26%)`;
      }
      return baseColor;
    }
    case 'asayake': {
      // あさやけもゆうやけもないんだ風
      if (deg === 3) return `hsl(200, 65%, 35%)`;
      if (quality.includes('maj7')) return `hsl(100, 65%, 35%)`;
      if (quality.includes('m7')) return `hsl(210, 65%, 32%)`;
      return `hsl(40, 65%, 35%)`;
    }
    case 'degree': {
      if (deg === null) return 'hsl(0, 0%, 25%)';
      return `hsl(${MV_DEGREE_HUE[deg]}, 55%, 32%)`;
    }
    case 'fixed':
    default:
      return '';
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
  degree: '度数（頭の上の数字）',
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

/**
 * いまの場面で実際に使う背景設定。場面の指定が無い項目は全体設定のまま。
 *
 * `bgRef`/`bgUrl` は対にして扱う——場面側が背景画像を指定したとき、
 * 全体側の解決済みURLが残っていると別の絵が出てしまうため、両方まとめて差し替える。
 * `bgRef: ''`（空文字）は「この場面は背景画像なし」の意味で、全体の背景画像を打ち消す。
 */
export function resolveSceneStage(stage: MvStage, section: MvSection | null): MvStage {
  const s = section?.stage;
  if (!s) return stage;
  const merged: MvStage = { ...stage };
  if (s.bgColor !== undefined) merged.bgColor = s.bgColor;
  if (s.bgFit !== undefined) merged.bgFit = s.bgFit;
  if (s.bgDim !== undefined) merged.bgDim = s.bgDim;
  if (s.pulse !== undefined) merged.pulse = s.pulse;
  if (s.palette !== undefined && s.palette.length > 0) merged.palette = s.palette;
  if (s.bgRef !== undefined || s.bgUrl !== undefined) {
    merged.bgRef = s.bgRef;
    merged.bgUrl = s.bgUrl;
  }
  return merged;
}

/** レイヤーが、いまのセクションで表示対象かどうか。 */
export function isLayerVisible(layer: MvLayer, sectionId: string | null): boolean {
  if (!layer.sections || layer.sections.length === 0) return true;
  if (!sectionId) return true;
  return layer.sections.includes(sectionId);
}

/**
 * そのレイヤーが「出てきた」小節。登場演出の起点に使う。
 * 場面指定が無ければ曲頭(0)。
 * 連続する場面にまたがって表示されるときは、その連続の先頭を返す
 * ——場面が変わるたびに登場演出をやり直すと、出っぱなしの絵が何度も飛び込んでくるため。
 */
export function layerAppearBar(layer: MvLayer, sections: MvSection[], sectionId: string | null): number {
  if (!layer.sections || layer.sections.length === 0) return 0;
  if (!sectionId) return 0;
  const sorted = [...sections].sort((a, b) => a.startBar - b.startBar);
  let idx = sorted.findIndex(s => s.id === sectionId);
  if (idx < 0) return 0;
  while (idx > 0 && layer.sections.includes(sorted[idx - 1].id)) idx--;
  return sorted[idx].startBar;
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
      fadeIn: true,
      fadeOut: true,
    },
    layers: [],
    sections: [{ id: 'main', label: '本編', startBar: 0 }],
  };
}
