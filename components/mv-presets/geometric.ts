// 「ジオメトリック」プリセット。
// 参考動画: C.mp4
//   暗いティール一色＋周辺減光の静かな画面の中央に、白い図形が「1種類だけ」置かれる。
//   図形は音が鳴った瞬間だけ濃く・太くなり、鳴っていない間は消え入りそうな薄さで残る。
//   曲が進むと場面ごとにモチーフが変わる: 点 → 細い輪 → 二重の輪＋芯 → ひし形と四角。
//   常時回転・波紋の連発・加算グローの類は一切使わない（動きは音の瞬間だけ）。
// 画像を1枚も使わないので、MMLだけ用意すれば完成する（＝いちばん手前の入口）。

import type { MvManifest } from '@/lib/mv-config';
import { cloneManifest, type MvPresetEntry } from './shared';

const MML = [
  '#volume=45',
  '@0 t92 q90 v88 o5 l2 e a >c< b a e g a e a >c< b a e d e g b >d c< b g a b e a >c< b a g e d;',
  '@1 t92 q90 v58 o3 l1 a f c g a f d e f c g d a f e a;',
  '@2 t92 q30 v50 o6 l1 r r r r e r r c r r g r e r c e;',
].join('');

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'geometric',
  title: '無題のトラック',
  mml: MML,
  audio: { mode: 'soundfontKoe' },
  stage: {
    bgColor: '#0e423c',
    bgFit: 'cover',
    // 背景は静止。呼吸させると全編が同じ律動になってしまう（参考動画は無音部で完全に静止する）
    pulse: 'none',
    fadeIn: true,
    fadeOut: true,
    palette: ['#f5fffd', '#e0f5f1', '#cdeae5', '#b7ded7'],
  },
  // 場面ごとに中央のモチーフを掛け替える。単調ループにしないための骨格。
  sections: [
    { id: 'intro', label: '点', startBar: 0 },
    { id: 'a', label: '輪', startBar: 4 },
    { id: 'b', label: '二重丸', startBar: 8 },
    { id: 'c', label: 'ひし形', startBar: 12 },
  ],
  layers: [
    // ── 全編: 周辺減光。参考動画の「四隅が沈んだ暗い画面」 ──────────
    {
      kind: 'effect',
      id: 'vignette',
      style: 'vignette',
      trigger: 'always',
      amount: 0.55,
      color: '#031512',
    },

    // ── 場面1: 中央の小さな点。メロディでわずかに膨らむだけ ──────────
    {
      kind: 'shape',
      id: 'dot',
      form: 'circle',
      x: 320,
      y: 180,
      size: 3,
      rotation: 0,
      color: '#f5fffd',
      filled: true,
      thickness: 1,
      z: 20,
      sections: ['intro'],
      modulators: [
        { source: 'trackEnergy', track: 0, target: 'size', op: 'add', amount: 4 },
      ],
    },

    // ── 場面2: 細い輪。音が鳴った瞬間だけ濃く太くなる ────────────────
    // 「×トラックの打点」で普段は消し、「＋定数」で薄い輪郭だけ残すのが肝。
    {
      kind: 'shape',
      id: 'ring-a',
      form: 'ring',
      x: 320,
      y: 180,
      size: 44,
      rotation: 0,
      color: '#f5fffd',
      filled: false,
      thickness: 1.2,
      z: 20,
      sections: ['a'],
      modulators: [
        { source: 'trackOnset', track: 0, target: 'opacity', op: 'mul', amount: 1 },
        { source: 'constant', target: 'opacity', op: 'add', amount: 0.16 },
        { source: 'trackOnset', track: 0, target: 'thickness', op: 'add', amount: 2.4 },
        { source: 'trackEnergy', track: 0, target: 'size', op: 'add', amount: 6 },
      ],
    },

    // ── 場面3: 二重の輪＋ベースで灯る芯（的のかたち） ────────────────
    {
      kind: 'shape',
      id: 'ring-b',
      form: 'ring',
      x: 320,
      y: 180,
      size: 26,
      rotation: 0,
      color: '#f5fffd',
      filled: false,
      thickness: 1.4,
      count: 2,
      spread: 22,
      z: 20,
      sections: ['b'],
      modulators: [
        { source: 'trackOnset', track: 0, target: 'opacity', op: 'mul', amount: 1 },
        { source: 'constant', target: 'opacity', op: 'add', amount: 0.15 },
        { source: 'trackOnset', track: 0, target: 'thickness', op: 'add', amount: 3 },
      ],
    },
    {
      kind: 'shape',
      id: 'core-b',
      form: 'circle',
      x: 320,
      y: 180,
      size: 12,
      rotation: 0,
      color: '#f5fffd',
      filled: true,
      thickness: 1,
      z: 21,
      sections: ['b'],
      modulators: [
        { source: 'trackOnset', track: 1, target: 'opacity', op: 'mul', amount: 1.1 },
        { source: 'constant', target: 'opacity', op: 'add', amount: 0.05 },
        { source: 'trackOnset', track: 1, target: 'size', op: 'add', amount: 4 },
      ],
    },

    // ── 場面4: 細い四角の枠＋ベースで満ちるひし形 ───────────────────
    {
      kind: 'shape',
      id: 'frame-c',
      form: 'square',
      x: 320,
      y: 180,
      size: 34,
      rotation: 0,
      color: '#f5fffd',
      filled: false,
      thickness: 1,
      z: 20,
      sections: ['c'],
      modulators: [
        { source: 'trackOnset', track: 0, target: 'opacity', op: 'mul', amount: 1 },
        { source: 'constant', target: 'opacity', op: 'add', amount: 0.15 },
      ],
    },
    {
      kind: 'shape',
      id: 'diamond-c',
      form: 'diamond',
      x: 320,
      y: 180,
      size: 30,
      rotation: 0,
      color: '#f5fffd',
      filled: true,
      thickness: 1,
      z: 21,
      sections: ['c'],
      modulators: [
        { source: 'trackOnset', track: 1, target: 'opacity', op: 'mul', amount: 1.2 },
        { source: 'constant', target: 'opacity', op: 'add', amount: 0.04 },
      ],
    },

    // ── 全編: 高音の合図でだけ現れる太い輪（アクセント） ─────────────
    {
      kind: 'shape',
      id: 'accent',
      form: 'ring',
      x: 320,
      y: 180,
      size: 46,
      rotation: 0,
      color: '#f5fffd',
      filled: false,
      thickness: 3.5,
      z: 22,
      modulators: [
        { source: 'trackOnset', track: 2, target: 'opacity', op: 'mul', amount: 1.4 },
        { source: 'trackOnset', track: 2, target: 'size', op: 'add', amount: 10 },
      ],
    },
  ],
};

export const GEOMETRIC_PRESET: MvPresetEntry = {
  kind: 'geometric',
  name: 'ジオメトリック',
  description: '暗い画面の中央にひとつだけ置かれた白い図形が、音の瞬間だけ濃くなる。場面ごとに点→輪→二重丸→ひし形と姿を変える。',
  swapHint: '「場面」タブで区切りを増やし、図形レイヤーの表示場面を割り当てると、モチーフの掛け替えを自由に組めます。',
  build: () => cloneManifest(MANIFEST),
};
