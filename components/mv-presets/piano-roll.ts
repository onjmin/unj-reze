// 「ピアノロール」プリセット。
// 参考動画: [Touhou Style Arrangement] Out of Place Magical Girl
//   静止背景絵 ＋ 右にキャラ絵 ＋ 左上にタイトル/クレジット ＋ 中央帯に横スクロールのピアノロール。
// 曲のノートがそのまま絵になるので、素材を1枚も足さなくても成立する（背景・キャラは差し替え推奨）。

import type { MvManifest } from '@/lib/mv-config';
import { BUILTIN_WALK, BUILTIN_WALK_URL, cloneManifest, type MvPresetEntry } from './shared';

const MML = [
  '#volume=50',
  '@0 t150 q80 v100 o5 l8 a b >c< b a g a4 r4 e f g a g e d4 r4 a b >c< b a g a4 r4 e g b >c<4 a4 r4;',
  '@1 t150 q70 v70 o4 l8 r4 e f e c d e4 r4 r4 c d c <a b >c4 r4 r4 e f e c d e4 r4 r4 g a g e f g4 r4;',
  '@2 t150 q60 v82 o2 l4 a a e e f f c c a a e e g g e e;',
  '@3 t150 q50 v58 o3 l2 [o3ao4co4e]2 [o3ao4co4e]2 [o3fo3ao4c]2 [o3fo3ao4c]2 [o3ao4co4e]2 [o3ao4co4e]2 [o3eo3go3b]2 [o3eo3go3b]2;',
].join('');

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'pianoRoll',
  title: '無題のアレンジ',
  credit: 'Arranged by あなた',
  mml: MML,
  stage: {
    bgColor: '#1b2733',
    bgFit: 'cover',
    bgDim: 0.3,
    pulse: 'none',
    palette: ['#a3e635', '#38bdf8', '#fbbf24', '#f472b6', '#c4b5fd'],
  },
  sections: [{ id: 'main', label: '本編', startBar: 0 }],
  layers: [
    {
      kind: 'visualizer',
      id: 'roll',
      style: 'pianoRoll',
      rect: { x: 0, y: 104, w: 640, h: 168 },
      amount: 4,
      glow: true,
      z: 10,
      opacity: 0.95,
    },
    {
      kind: 'image',
      id: 'chara',
      ref: `url:${BUILTIN_WALK_URL}`,
      url: BUILTIN_WALK_URL,
      walk: BUILTIN_WALK,
      x: 540,
      y: 352,
      scale: 9,
      anchor: 'bottom',
      motion: 'bob',
      motionAmount: 3,
      pixelated: true,
      z: 20,
    },
    {
      kind: 'text',
      id: 'title',
      text: '無題のアレンジ',
      x: 20,
      y: 16,
      size: 22,
      color: '#f8fafc',
      anchor: 'topLeft',
      vertical: false,
      motion: 'none',
      bold: true,
      shadow: true,
      z: 30,
    },
    {
      kind: 'text',
      id: 'credit',
      text: 'Arranged by あなた',
      x: 20,
      y: 46,
      size: 13,
      color: '#cbd5e1',
      anchor: 'topLeft',
      vertical: false,
      motion: 'none',
      shadow: true,
      z: 30,
    },
  ],
};

export const PIANO_ROLL_PRESET: MvPresetEntry = {
  kind: 'pianoRoll',
  name: 'ピアノロール',
  description: '静止画の上に、曲のノートが横スクロールで流れる。アレンジ動画の定番レイアウト。',
  swapHint: '背景に1枚絵を、右のキャラをあなたのドット絵に差し替えると一気に完成します。',
  build: () => cloneManifest(MANIFEST),
};
