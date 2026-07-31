// ミュージックビデオ(MV)のデータモデル。UI非依存で、lib/game-config.ts と同じ立ち位置。
//
// 設計方針: AviUtl のような自由タイムラインは持たない。
//   - レイヤーは4種だけ（image / text / visualizer / lyrics）
//   - 動きは MvMotion の enum から選ぶ（数値キーフレームは無い）
//   - 時間軸は「小節番号で区切ったセクション」だけ。レイヤーは表示するセクションIDを持つ
// この3点を固定することで、ゲーム機能と同じ「プリセットを選んで中身を差し替える」体験に収まる。
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

export type MvVisualizerStyle =
  /** 横スクロールのピアノロール（東方アレンジ動画の帯） */
  | 'pianoRoll'
  /** ステップシーケンサ格子。拍ごとにマスが点灯する */
  | 'stepGrid'
  /** 拍で同心円が広がる */
  | 'rings'
  /** 音域別の縦棒スペアナ風 */
  | 'bars';

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
  /** pianoRoll=画面に映る小節数 / stepGrid=1行のマス数 / rings=同時に出す輪の数 / bars=棒の本数 */
  amount?: number;
  /** 線・枠の太さ */
  thickness?: number;
  glow?: boolean;
}

export interface MvLyricLine {
  /** 表示を始める小節（0始まり、小数可） */
  bar: number;
  text: string;
}

export interface MvLyricsLayer extends MvLayerBase {
  kind: 'lyrics';
  /** 'mml' = MMLの歌詞トラック(@@n)から自動同期 / 'manual' = 小節番号つき手入力 */
  source: 'mml' | 'manual';
  lines?: MvLyricLine[];
  /** source==='mml' のとき対象にする歌詞トラックID。未指定＝最初に見つかったもの。 */
  trackId?: number;
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

export type MvLayer = MvImageLayer | MvTextLayer | MvVisualizerLayer | MvLyricsLayer;

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
  stage: MvStage;
  layers: MvLayer[];
  sections: MvSection[];
}

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
