// 「灯りのステージ」プリセット。
// 参考動画: チョウチン少女.mp4
//   ほぼ黒い舞台の左右に「小道具」がひとつずつ置かれ、そのあいだで中央のモチーフだけが替わり続ける。
//   計測すると **約6.8秒＝4小節ごと** にモチーフが入れ替わっていて、
//   枠だけ → 枠と点 → 太い括弧 → 破線の段 → 縦棒の束 → 小さな四角 … と巡る。
//   画面の下半分には、うっすらとした横線（＝低い不透明度のピアノロール）が流れ続ける。
//   歌詞は左右の端に縦書きで出て、場面によって出る側が入れ替わる。
//
// 小道具（提灯・立て看板）は画像ではなく図形（SVGパス）で組んである。
// 素材ゼロで成立させつつ、ユーザーが画像レイヤーに置き換えられるようにするため。

import type { MvLayer, MvManifest, MvSection, MvShapeLayer } from '@/lib/mv-config';
import { BUILTIN_CHARS, charRef, charUrl, charWalk, cloneManifest, mvTrack, rep, rest, type MvPresetEntry } from './shared';

const BARS = 64;
/** モチーフが入れ替わる周期。参考動画の実測（約6.8秒＝4小節）に合わせてある。 */
const SCENE_BARS = 4;

// ── 旋律（l8）──
const N1 = 'e r g r a r b r';
const N2 = 'a r g r e r d r';
const N3 = 'b r >c< r b r a r';
const N4 = 'e r e r g r g r';
const N6 = 'a4 g4 e4 d4';

const MELODY = [
  ...rep(2, N4, N1, N4, N2),        // 0-7   静かな導入
  ...rep(2, N1, N2, N3, N6),        // 8-15
  ...rep(2, N1, N2, N3, N6),        // 16-23
  ...rep(2, N3, N6, N1, N2),        // 24-31
  ...rep(2, N3, N6, N3, N6),        // 32-39 いちばん濃いところ
  ...rep(2, N4, N1, N4, N2),        // 40-47
  ...rep(2, N1, N2, N3, N6),        // 48-55
  ...rep(2, N4, N1, N4, N4),        // 56-63 引いていく
];

// ── 低音（l1）──
const BASS = [
  'a', 'a', 'f', 'f', 'c', 'c', 'e', 'e',
  'a', 'a', 'f', 'f', 'c', 'c', 'g', 'g',
  'a', 'a', 'f', 'f', 'd', 'd', 'e', 'e',
  'f', 'f', 'c', 'c', 'g', 'g', 'e', 'e',
  'a', 'a', 'f', 'f', 'c', 'c', 'g', 'g',
  'a', 'a', 'f', 'f', 'd', 'd', 'e', 'e',
  'a', 'a', 'f', 'f', 'c', 'c', 'e', 'e',
  'a', 'a', 'f', 'f', 'e', 'e', 'a', 'a',
];

// ── 和音（l1、1小節1和音）──
const Am = '[o3ao4co4e]1';
const F = '[o3fo3ao4c]1';
const C = '[o3co3eo3g]1';
const G = '[o3go3bo4d]1';
const Em = '[o3eo3go3b]1';
const Dm = '[o3do3fo3a]1';

const PAD = [
  Am, Am, F, F, C, C, Em, Em,
  Am, Am, F, F, C, C, G, G,
  Am, Am, F, F, Dm, Dm, Em, Em,
  F, F, C, C, G, G, Em, Em,
  Am, Am, F, F, C, C, G, G,
  Am, Am, F, F, Dm, Dm, Em, Em,
  Am, Am, F, F, C, C, Em, Em,
  Am, Am, F, F, Em, Em, Am, Am,
];

// ── 歌（l8、1小節6音）──
const V1 = 'e g a b a g r4';
const V2 = 'a b >c< b a g r4';
const V3 = '>c< b a g a b r4';
const V4 = 'g a b >c< b a r4';

const singPhrase = (a: string, b: string, c: string, d: string) => [a, b, 'r1', c, d, 'r1', 'r1', 'r1'];

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
  'まちのはずれには',
  'あかりがともるよ',
  'ちいさなこえだけ',
  'きこえてくるみち',
  'もういちどみたい',
  'まわらないはりが',
  'とまりつづけてる',
  'しずかにゆれてる',
  'あかいひかりだけ',
  'みちをてらしてる',
  'だれかのわらいご',
  'こえがとおくなる',
  'いきているはずも',
  'ないよるのなかで',
  'あかりだけがゆれ',
].join('\n');

const MML = [
  '#volume=48',
  mvTrack('@0 t142 q60 v82 o5 l8', MELODY, BARS),
  mvTrack('@1 t142 q80 v72 o2 l1', BASS, BARS),
  mvTrack('@2 t142 q90 v46 o3 l1', PAD, BARS),
  mvTrack('@3 t142 q70 v88 o4 l8', VOCAL, BARS),
  `@@3 klatt v150 ${LYRICS}`,
].join('\n');

// ── 小道具のSVGパス（100×100 の箱で設計）──────────────────
/** 提灯の胴。ふくらんだ縦長。 */
const LANTERN_BODY = 'M32,22 C32,10 68,10 68,22 L68,72 C68,84 32,84 32,72 Z';
/** 提灯の上下の口金。2つのサブパスは重ならないので穴にならない。 */
const LANTERN_CAP = 'M36,10 L64,10 L64,20 L36,20 Z M36,74 L64,74 L64,84 L36,84 Z';
/** 提灯の骨。線で描く。 */
const LANTERN_RIBS = 'M32,34 L68,34 M31,47 L69,47 M32,60 L68,60';
/** 立て看板（A型）。 */
const SIGN = 'M50,14 L84,90 L16,90 Z';
/** 看板の「！」。 */
const SIGN_MARK = 'M46,42 L54,42 L52,68 L48,68 Z M47,74 L53,74 L53,82 L47,82 Z';

const SCENES = 16;
const scene = (i: number) => `s${String(i).padStart(2, '0')}`;

/**
 * 4小節ごとの場面。参考動画と同じでほとんどが**カット**（覆いを挟まずに切り替わる）。
 * 曲の折り返しにあたる32小節目だけ白く抜けて、後半に入ったことが分かるようにしてある。
 */
const SECTIONS: MvSection[] = Array.from({ length: SCENES }, (_, i) => ({
  id: scene(i),
  label: `${i * SCENE_BARS}小節〜`,
  startBar: i * SCENE_BARS,
  ...(i === 8 ? { transition: { style: 'flash' as const, beats: 1 } } : {}),
}));

const INK = '#f4f4f5';

/** 中央のモチーフの共通形。音の打点で少しだけ濃くなる。 */
function motif(over: Partial<MvShapeLayer> & { id: string; sections: string[] }): MvShapeLayer {
  return {
    kind: 'shape',
    form: 'square',
    x: 320,
    y: 172,
    size: 34,
    rotation: 0,
    color: INK,
    filled: false,
    thickness: 2,
    z: 20,
    modulators: [
      { source: 'trackOnset', track: 0, target: 'opacity', op: 'mul', amount: 1 },
      { source: 'constant', target: 'opacity', op: 'add', amount: 0.55 },
    ],
    ...over,
  };
}

// モチーフの巡り。7種を16場面へ配り、前半と後半で同じ形が戻ってくる。
const SC_FRAME = [scene(0), scene(8)];
const SC_FRAME_DOTS = [scene(1), scene(9)];
const SC_BRACKET = [scene(2), scene(10)];
const SC_DASH = [scene(3), scene(7), scene(11), scene(15)];
const SC_PIPES = [scene(4), scene(12)];
const SC_DOTS = [scene(5), scene(13)];
const SC_SOLID = [scene(6), scene(14)];

const LAYERS: MvLayer[] = [
  // ══ 画面下のうっすらした横線（低い不透明度のロール）══════════
  {
    kind: 'visualizer',
    id: 'haze',
    style: 'pianoRoll',
    projection: 'flat',
    rect: { x: -20, y: 250, w: 680, h: 96 },
    amount: 8,
    thickness: 1,
    opacity: 0.16,
    z: 4,
  },

  // ══ 左の提灯 ═══════════════════════════════════════════
  // 提灯の下から伸びる細い柄。bar を傾けて1本の棒にする
  // （path で線を描いても filled では塗られないので、棒は bar で作る）。
  {
    kind: 'shape', id: 'pole', form: 'bar',
    x: 100, y: 226, size: 62, barAspect: 0.024, rotation: 100,
    color: '#6b7280', filled: true, thickness: 1, z: 8,
    modulators: [],
  },
  {
    kind: 'shape', id: 'lantern', form: 'path', path: LANTERN_BODY, pathBox: [0, 0, 100, 100],
    x: 94, y: 122, size: 30, rotation: 0, color: '#c0392b', filled: true, thickness: 1, z: 10,
    modulators: [
      // 低音の打点でほんのわずかに膨らむ。揺れではなく「灯りが息をする」感じ
      { source: 'trackOnset', track: 1, target: 'size', op: 'add', amount: 1.8 },
    ],
  },
  {
    kind: 'shape', id: 'lantern-cap', form: 'path', path: LANTERN_CAP, pathBox: [0, 0, 100, 100],
    x: 94, y: 122, size: 30, rotation: 0, color: '#4c0d0d', filled: true, thickness: 1, z: 11,
    modulators: [],
  },
  {
    kind: 'shape', id: 'lantern-ribs', form: 'path', path: LANTERN_RIBS, pathBox: [0, 0, 100, 100],
    x: 94, y: 122, size: 30, rotation: 0, color: '#7f1d1d', filled: false, thickness: 1.6, z: 12,
    modulators: [],
  },

  // ══ 右の立て看板 ═══════════════════════════════════════
  {
    kind: 'shape', id: 'sign', form: 'path', path: SIGN, pathBox: [0, 0, 100, 100],
    x: 548, y: 172, size: 30, rotation: 0, color: '#eab308', filled: true, thickness: 1, z: 10,
    modulators: [],
  },
  {
    kind: 'shape', id: 'sign-mark', form: 'path', path: SIGN_MARK, pathBox: [0, 0, 100, 100],
    x: 548, y: 178, size: 30, rotation: 0, color: '#1c1917', filled: true, thickness: 1, z: 11,
    modulators: [],
  },

  // ══ 中央のモチーフ（4小節ごとに掛け替わる）══════════════════
  // 枠だけ
  motif({ id: 'm-frame', sections: SC_FRAME, size: 40 }),
  // 枠＋中の点
  motif({ id: 'm-frame2', sections: SC_FRAME_DOTS, size: 40 }),
  motif({
    id: 'm-frame2-dots', sections: SC_FRAME_DOTS, form: 'square', size: 5, filled: true,
    count: 2, offsetX: 44, x: 298, z: 21,
  }),
  // 太い括弧（左右に寄せた厚い塊）
  motif({
    id: 'm-bracket', sections: SC_BRACKET, form: 'bar', size: 14, barAspect: 1.6, filled: true,
    count: 2, offsetX: 52, x: 294,
  }),
  motif({
    id: 'm-bracket-in', sections: SC_BRACKET, form: 'bar', size: 6, barAspect: 2.2, filled: true,
    count: 2, offsetX: 28, x: 306, z: 21,
  }),
  // 破線の段（左右2群）
  motif({
    id: 'm-dash-l', sections: SC_DASH, form: 'bar', size: 13, barAspect: 0.14, filled: true,
    count: 3, offsetY: 12, x: 250, y: 158,
  }),
  motif({
    id: 'm-dash-r', sections: SC_DASH, form: 'bar', size: 13, barAspect: 0.14, filled: true,
    count: 3, offsetY: 12, x: 390, y: 158,
  }),
  // 縦棒の束（左右2群）
  motif({
    id: 'm-pipe-l', sections: SC_PIPES, form: 'bar', size: 16, barAspect: 0.16, rotation: 90, filled: true,
    count: 4, offsetX: 9, x: 250,
  }),
  motif({
    id: 'm-pipe-r', sections: SC_PIPES, form: 'bar', size: 16, barAspect: 0.16, rotation: 90, filled: true,
    count: 4, offsetX: 9, x: 386,
  }),
  // 小さな四角が2つ
  motif({
    id: 'm-dots', sections: SC_DOTS, form: 'square', size: 9, filled: true,
    count: 2, offsetX: 66, x: 288,
  }),
  // 塗りつぶしの灰色
  motif({
    id: 'm-solid', sections: SC_SOLID, form: 'square', size: 17, filled: true, color: '#9ca3af',
  }),

  // ══ 上のちいさな白い箱（たまに出る）══════════════════════
  motif({
    id: 'chip', sections: [scene(3), scene(9), scene(12)], form: 'bar', size: 13, barAspect: 0.5,
    filled: true, x: 392, y: 44, z: 25,
  }),

  // ══ 下に現れる小さな影 ══════════════════════════════════
  {
    kind: 'image',
    id: 'visitor',
    ref: charRef(BUILTIN_CHARS[1]),
    url: charUrl(BUILTIN_CHARS[1]),
    walk: charWalk('s', 3),
    x: 320,
    y: 300,
    scale: 3,
    anchor: 'bottom',
    motion: 'bob',
    motionAmount: 1.2,
    pixelated: true,
    sections: [scene(5), scene(6), scene(13), scene(14)],
    entrance: { from: 'bottom', fade: true, beats: 2, distance: 30 },
    z: 26,
  },

  // ══ 歌詞。場面によって出る側が入れ替わる ════════════════════
  {
    kind: 'lyrics',
    id: 'lyrics-right',
    source: 'mml',
    trackId: 3,
    x: 596,
    y: 40,
    anchor: 'topLeft',
    size: 13,
    color: '#e5e7eb',
    vertical: true,
    afterimage: 3,
    holdBars: 8,
    z: 40,
  },
  {
    kind: 'lyrics',
    id: 'lyrics-left',
    source: 'mml',
    trackId: 3,
    x: 22,
    y: 40,
    anchor: 'topLeft',
    size: 13,
    color: '#e5e7eb',
    vertical: true,
    afterimage: 1,
    holdBars: 4,
    sections: [scene(4), scene(5), scene(6), scene(7), scene(12), scene(13), scene(14), scene(15)],
    z: 40,
  },

  // ══ 全編: わずかな周辺減光 ═══════════════════════════════
  {
    kind: 'effect',
    id: 'vignette',
    style: 'vignette',
    trigger: 'always',
    amount: 0.4,
    color: '#000000',
  },
];

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'geometric',
  title: '無題の夜',
  mml: MML,
  audio: { mode: 'soundfontKoe' },
  stage: {
    bgColor: '#171717',
    bgFit: 'cover',
    pulse: 'none',
    fadeIn: true,
    fadeOut: true,
    palette: ['#d4d4d8', '#a1a1aa', '#71717a', '#52525b'],
  },
  sections: SECTIONS,
  layers: LAYERS,
};

export const LANTERN_PRESET: MvPresetEntry = {
  kind: 'geometric',
  name: '灯りのステージ',
  description: '黒い舞台の左右に提灯と立て看板が立ち、そのあいだで中央のモチーフが4小節ごとに16回入れ替わる。足元にはうっすらとロールが流れる。',
  swapHint: '素材は要りません。左右の小道具は図形（SVGパス）なので、画像レイヤーに置き換えるとあなたの世界になります。',
  build: () => cloneManifest(MANIFEST),
};
