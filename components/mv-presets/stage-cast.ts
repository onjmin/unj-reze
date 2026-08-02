// 「ステージ整列」プリセット。
// 参考動画: ことりがそらへとおちてゆく.mp4
//   横長の風景を背景に、ドット絵のキャラが横一列に並ぶ。
//   下に歌詞の帯、いちばん下にコード進行バーが流れる。
// コード進行バーの色分けは utau-kit の chord-progression-animation-tool と同じ
// 「キーに対する度数で色相を決める」やり方。

import type { MvManifest } from '@/lib/mv-config';
import { cloneManifest, DQ_CAST, type MvPresetEntry } from './shared';

const MML = [
  '#volume=50',
  '@0 t118 q80 v96 o5 l4 e f# g# a g# f# e d# e f# g# a b a g# f# e f# g# a g# f# e d# c# d# e f# g#2;',
  '@1 t118 q70 v66 o4 l2 c# c# a a b b g# g# c# c# a a f# f# b b;',
  '@2 t118 q60 v78 o2 l4 c# c# g# g# a a e e b b f# f# c# c# g# g#;',
  '@3 t118 q50 v52 o3 l2 [o3c#o3eo3g#]2 [o3c#o3eo3g#]2 [o3ao4c#o4e]2 [o3ao4c#o4e]2 [o3bo3d#o3f#]2 [o3bo3d#o3f#]2 [o3g#o3bo4d#]2 [o3g#o3bo4d#]2;',
].join('');

/** 横一列に並ぶキャラ。x を等間隔に置いていく。 */
const CAST_X = [110, 200, 290, 380, 470];

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'pixelStage',
  title: '無題のうた',
  mml: MML,
  audio: { mode: 'soundfontKoe' },
  stage: {
    bgColor: '#6b7a5a',
    bgFit: 'cover',
    bgDim: 0.05,
    pulse: 'none',
    fadeIn: true,
    fadeOut: true,
    palette: ['#f9a8d4', '#93c5fd', '#fcd34d', '#a7f3d0', '#c4b5fd'],
  },
  sections: [
    { id: 'a', label: 'Aメロ', startBar: 0 },
    { id: 'sabi', label: 'サビ', startBar: 8 },
  ],
  layers: [
    // ── 仮の地面。背景に1枚絵を入れたら消してよい。
    // shape の size は「中心からの半径」なので、bar は幅 size*2・高さ size*0.32 になる。
    {
      kind: 'shape',
      id: 'road',
      form: 'bar',
      x: 320,
      y: 262,
      size: 330,
      barAspect: 0.06,
      rotation: 0,
      color: '#9ca3af',
      filled: true,
      thickness: 1,
      z: 2,
      modulators: [],
    },

    // ── キャラの整列。1体ずつ image レイヤーとして置く ────────────
    ...CAST_X.map((x, i) => ({
      kind: 'image' as const,
      id: `cast${i}`,
      ref: `url:${DQ_CAST[i % DQ_CAST.length]}`,
      url: DQ_CAST[i % DQ_CAST.length],
      x,
      y: 250,
      scale: 3,
      anchor: 'bottom' as const,
      motion: 'bob' as const,
      motionAmount: 1.5,
      pixelated: true,
      z: 20 + i,
      // 後半で人数が増える演出。前半は3体だけ出す。
      ...(i >= 3 ? { sections: ['sabi'] } : {}),
    })),

    // ── 歌詞の帯（横書き・画面下） ────────────────────────────
    {
      kind: 'shape',
      id: 'lyric-band',
      form: 'bar',
      x: 320,
      y: 306,
      size: 320,
      barAspect: 0.075,
      rotation: 0,
      color: '#111827',
      filled: true,
      thickness: 1,
      opacity: 0.82,
      z: 50,
      modulators: [],
    },
    {
      kind: 'lyrics',
      id: 'lyrics',
      source: 'mml',
      x: 320,
      y: 300,
      anchor: 'center',
      size: 13,
      color: '#f9fafb',
      vertical: false,
      afterimage: 0,
      holdBars: 2,
      typing: true,
      z: 55,
    },

    // ── コード進行バー（いちばん下） ──────────────────────────
    {
      kind: 'chordBar',
      id: 'chords',
      rect: { x: 0, y: 338, w: 640, h: 22 },
      key: 'E',
      colorMode: 'degree',
      color: '#1f2937',
      activeColor: '#3f6212',
      textColor: '#e5e7eb',
      size: 9,
      z: 60,
      chords: [
        { bar: 0, label: 'C#m7' }, { bar: 1, label: 'Aadd9' },
        { bar: 2, label: 'B7' }, { bar: 3, label: 'G#m7' },
        { bar: 4, label: 'C#m7' }, { bar: 5, label: 'Aadd9' },
        { bar: 6, label: 'F#m7' }, { bar: 7, label: 'B7' },
        { bar: 8, label: 'Aadd9' }, { bar: 9, label: 'B7' },
        { bar: 10, label: 'C#m7' }, { bar: 11, label: 'G#m7' },
        { bar: 12, label: 'Aadd9' }, { bar: 13, label: 'B7' },
        { bar: 14, label: 'E' }, { bar: 15, label: 'E' },
      ],
    },

    {
      kind: 'text',
      id: 'title',
      text: '無題のうた',
      x: 12,
      y: 10,
      size: 11,
      color: '#e5e7eb',
      anchor: 'topLeft',
      vertical: false,
      motion: 'none',
      shadow: true,
      opacity: 0.75,
      z: 61,
    },
  ],
};

export const STAGE_CAST_PRESET: MvPresetEntry = {
  kind: 'pixelStage',
  name: 'ステージ整列＋コード進行',
  description: '風景の前にドット絵キャラが並び、下に歌詞の帯とコード進行バーが出る。',
  swapHint: '背景に風景の1枚絵を入れ、キャラをあなたのドット絵に差し替えてください。コード進行はレイヤー設定で編集できます。',
  build: () => cloneManifest(MANIFEST),
};
