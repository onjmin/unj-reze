// 「ジオメトリック」プリセット。
// 参考動画: C.mp4
//   暗いラジアルグラデが拍で呼吸し、音符ごとに同心円の波紋が広がる。
//   中央では単純な図形に四則演算のモジュレータを重ねがけして、複雑な脈動を作る。
//   トラックごとに反応する図形を分けてあるので、曲の各パートが別々の形として見える。
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
  audio: { mode: 'soundfontKoe' },
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

    // ── 中央の芯: メロディ(@0)の鳴りで膨らみ、拍で締まる ──────────
    // 「トラックの鳴り × 大きさ」→「拍 ÷ 大きさ」の順に掛けることで、
    // 単に脈打つのではなく、拍の頭で一度きゅっと縮んでから開く動きになる。
    {
      kind: 'shape',
      id: 'core',
      form: 'circle',
      x: 320,
      y: 180,
      size: 10,
      rotation: 0,
      color: '#f0fdfa',
      filled: true,
      thickness: 1,
      blend: 'add',
      z: 20,
      modulators: [
        { source: 'trackEnergy', track: 0, target: 'size', op: 'add', amount: 26 },
        // 拍の頭でいったん縮んでから開く。割り算ではなく引き算にしているのは、
        // 0へ近づく値で割ると図形が発散してしまうため。
        { source: 'beat', target: 'size', op: 'sub', amount: 12 },
        { source: 'trackOnset', track: 0, target: 'opacity', op: 'mul', amount: 1.4 },
      ],
    },

    // ── ベース(@1)に反応する四角。回転と大きさを別々の演算で動かす ──
    {
      kind: 'shape',
      id: 'frame',
      form: 'diamond',
      x: 320,
      y: 180,
      size: 54,
      rotation: 0,
      color: '#5eead4',
      filled: false,
      thickness: 1.4,
      count: 3,
      spread: 26,
      spin: 14,
      stagger: 24,
      blend: 'add',
      z: 18,
      modulators: [
        { source: 'trackEnergy', track: 1, target: 'size', op: 'add', amount: 34 },
        { source: 'time', target: 'rotation', op: 'add', amount: 90 },
        { source: 'trackOnset', track: 1, target: 'thickness', op: 'add', amount: 2 },
        { source: 'bar', target: 'opacity', op: 'mul', amount: 1.1 },
      ],
    },

    // ── 伴奏(@2)は薄い多角形。差の絶対値で重ねて、交差部が抜けて見える ──
    {
      kind: 'shape',
      id: 'halo',
      form: 'polygon',
      x: 320,
      y: 180,
      size: 96,
      rotation: 0,
      color: '#67e8f9',
      filled: false,
      thickness: 1,
      sides: 6,
      count: 2,
      spread: 34,
      spin: 30,
      blend: 'difference',
      opacity: 0.85,
      z: 16,
      modulators: [
        { source: 'trackEnergy', track: 2, target: 'size', op: 'add', amount: 40 },
        { source: 'trackPitch', track: 0, target: 'sides', op: 'add', amount: 5 },
        { source: 'time', target: 'rotation', op: 'sub', amount: 60 },
      ],
    },

    // ── メロディの音で画面がわずかに光る ──────────────────────
    {
      kind: 'effect',
      id: 'pulse-flash',
      style: 'flash',
      trigger: 'note',
      tracks: [0],
      amount: 0.12,
      decayBeats: 0.4,
      color: '#ccfbf1',
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
  description: '暗い画面が拍で呼吸し、図形が音に反応して脈打つ。画像を用意しなくても成立する。',
  swapHint: '図形レイヤーの「音との連動」を足したり引いたりすると、動きの複雑さを変えられます。',
  build: () => cloneManifest(MANIFEST),
};
