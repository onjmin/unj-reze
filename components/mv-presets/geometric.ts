// 「ジオメトリック」プリセット。
// 参考動画: C.mp4
//   暗いラジアルグラデが拍で呼吸し、音符ごとに同心円の波紋が広がる。中央の芯が脈動する。
// 画像を1枚も使わないので、MMLだけ用意すれば完成する（＝いちばん手前の入口）。

import type { MvManifest } from '@/lib/mv-config';
import { cloneManifest, type MvPresetEntry } from './shared';

const MML = [
  '#volume=45',
  '@0 t92 q90 v88 o5 l2 e a >c< b a e g a e a >c< b a e d e;',
  '@1 t92 q90 v58 o3 l1 a f c g a f d e;',
  '@2 t92 q40 v40 o4 l4 r1 [o4ao4co5e]4 r1 [o4fo4ao5c]4 r1 [o4co4eo4g]4 r1 [o4eo4go4b]4;',
].join('');

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'geometric',
  title: '無題のトラック',
  mml: MML,
  stage: {
    bgColor: '#03181c',
    bgFit: 'cover',
    pulse: 'breathe',
    palette: ['#5eead4', '#2dd4bf', '#99f6e4', '#67e8f9'],
  },
  sections: [{ id: 'main', label: '本編', startBar: 0 }],
  layers: [
    {
      kind: 'visualizer',
      id: 'ripple',
      style: 'rings',
      rect: { x: 0, y: 0, w: 640, h: 360 },
      amount: 7,
      thickness: 1.5,
      z: 10,
    },
    {
      kind: 'text',
      id: 'title',
      text: '無題のトラック',
      x: 320,
      y: 330,
      size: 12,
      color: '#a7f3d0',
      anchor: 'center',
      vertical: false,
      motion: 'none',
      opacity: 0.6,
      z: 30,
    },
  ],
};

export const GEOMETRIC_PRESET: MvPresetEntry = {
  kind: 'geometric',
  name: 'ジオメトリック',
  description: '暗い画面が拍で呼吸し、音符ごとに波紋が広がる。画像を用意しなくても成立する。',
  build: () => cloneManifest(MANIFEST),
};
