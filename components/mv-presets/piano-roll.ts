// 「ピアノロール」プリセット。
// 参考動画: [Touhou Style Arrangement] Out of Place Magical Girl
//   構成は「イントロ（ロールだけ）→ 白フラッシュ → キャラ絵/タイトルが出て以降ずっと表示」。
//   毎小節光るアクセントではない（そう見えたので過去に間違えて実装していた）。
//   `section` トリガーは「その場面に入った瞬間だけ」発火するので、場面の境目に置くとちょうどこの動きになる。
//
// ここではさらに、**同じロールを場面ごとに違う角度から見せる**。
// 4分近い尺で視点が1つのままだと、後半はただの繰り返しにしか見えない。
// 立体→円形→平面と見え方が変わるだけで、曲の展開が画にも出る。
// 曲のノートがそのまま絵になるので、素材を1枚も足さなくても成立する（背景・キャラは差し替え推奨）。

import type { MvLayer, MvManifest, MvSection, MvView, MvVisualizerLayer } from '@/lib/mv-config';
import { cloneManifest, mvTrack, rozePose, rozeRef, rozeUrl, type MvPresetEntry } from './shared';

const BARS = 64;

// ── 主旋律（l8）。1要素＝1小節 ──
const A1 = 'a b >c< b a g a r';
const A2 = 'e f g a g e d r';
const A3 = 'a b >c d c< b a r';
const A4 = 'g a b >c< b a g r';
const A5 = 'e g b >c< a g e r';
const A6 = 'd e f g f e d r';
const A7 = 'a2 g4 e4';

const MELODY = [
  A1, A2, A3, A4, A1, A2, A5, A7,   // 0-7   イントロ
  A1, A2, A3, A4, A1, A2, A5, A7,   // 8-15  本編
  A3, A4, A5, A6, A3, A4, A1, A7,   // 16-23 A
  A2, A6, A2, A6, A4, A5, A3, A7,   // 24-31 B
  A1, A3, A5, A4, A1, A3, A5, A7,   // 32-39 サビ
  A5, A6, A5, A6, A1, A2, A3, A7,   // 40-47 間奏
  A1, A2, A3, A4, A1, A2, A5, A7,   // 48-55 A′
  A1, A3, A5, A4, A2, A6, A7, A7,   // 56-63 アウトロ
];

// ── 対旋律（l8）──
const B1 = 'r4 e f e4 c4';
const B2 = 'r4 c d c4 d4';
const B3 = 'r4 e f g4 e4';
const B4 = 'r4 d e f4 d4';
const B5 = 'r1';
const B6 = 'e4 f4 g4 e4';

const COUNTER = [
  B5, B5, B5, B5, B5, B5, B5, B5,
  B1, B2, B3, B4, B1, B2, B3, B6,
  B3, B4, B1, B2, B3, B4, B6, B6,
  B2, B1, B2, B1, B4, B3, B6, B6,
  B6, B3, B6, B4, B6, B3, B6, B6,
  B5, B5, B1, B2, B3, B4, B6, B6,
  B1, B2, B3, B4, B1, B2, B3, B6,
  B6, B3, B6, B4, B2, B1, B5, B5,
];

// ── 低音（l2）──
const BASS = [
  'a a', 'a a', 'e e', 'e e', 'f f', 'f f', 'c c', 'c c',
  'a a', 'a a', 'e e', 'e e', 'g g', 'g g', 'e e', 'e e',
  'f f', 'f f', 'c c', 'c c', 'g g', 'g g', 'd d', 'd d',
  'a a', 'a a', 'f f', 'f f', 'g g', 'g g', 'e e', 'e e',
  'a a', 'a a', 'e e', 'e e', 'f f', 'f f', 'c c', 'c c',
  'f f', 'f f', 'g g', 'g g', 'a a', 'a a', 'e e', 'e e',
  'a a', 'a a', 'e e', 'e e', 'f f', 'f f', 'c c', 'c c',
  'f f', 'f f', 'g g', 'g g', 'a a', 'e e', 'a a', 'a a',
];

// ── 和音（l2）──
const Am = '[o3ao4co4e]2 [o3ao4co4e]2';
const F = '[o3fo3ao4c]2 [o3fo3ao4c]2';
const C = '[o3co3eo3g]2 [o3co3eo3g]2';
const G = '[o3go3bo4d]2 [o3go3bo4d]2';
const Em = '[o3eo3go3b]2 [o3eo3go3b]2';
const Dm = '[o3do3fo3a]2 [o3do3fo3a]2';

const CHORDS = [
  Am, Am, Em, Em, F, F, C, C,
  Am, Am, Em, Em, G, G, Em, Em,
  F, F, C, C, G, G, Dm, Dm,
  Am, Am, F, F, G, G, Em, Em,
  Am, Am, Em, Em, F, F, C, C,
  F, F, G, G, Am, Am, Em, Em,
  Am, Am, Em, Em, F, F, C, C,
  F, F, G, G, Am, Em, Am, Am,
];

const MML = [
  '#volume=50',
  mvTrack('@0 t150 q80 v100 o5 l8', MELODY, BARS),
  mvTrack('@1 t150 q70 v70 o4 l8', COUNTER, BARS),
  mvTrack('@2 t150 q60 v82 o2 l2', BASS, BARS),
  mvTrack('@3 t150 q50 v58 o3 l2', CHORDS, BARS),
].join('');

const FULL_RECT = { x: 0, y: 20, w: 640, h: 320 };

/** 場面ごとに視点だけを替えたロール。同じノートでも見え方が変わる。 */
function roll(id: string, sections: string[], view: Partial<MvView>, over: Partial<MvVisualizerLayer> = {}): MvVisualizerLayer {
  return {
    kind: 'visualizer',
    id,
    style: 'pianoRoll',
    // 参考動画はロールが画面全体を覆う。帯状に狭めると空白だらけの画面になる。
    rect: FULL_RECT,
    // 画面に映す小節数。4だと和音の長い音が画面幅いっぱいの帯になって板に見えないので、
    // 6小節ぶんを流して1音を短く見せる。
    amount: 6,
    glow: true,
    z: 10,
    opacity: 0.95,
    projection: 'perspective',
    view: { pitch: 16, yaw: -18, roll: 0, fov: 55, depth: 220, thickness: 10, ...view },
    sections,
    ...over,
  };
}

const SECTIONS: MvSection[] = [
  { id: 'intro', label: 'イントロ（ロールだけ）', startBar: 0 },
  { id: 'main', label: '本編', startBar: 8, transition: { style: 'flash', beats: 2 } },
  { id: 'a', label: 'A（見下ろす）', startBar: 16, transition: { style: 'fade', beats: 0.5 } },
  { id: 'b', label: 'B（反対から）', startBar: 24, transition: { style: 'fade', beats: 0.5 } },
  {
    id: 'sabi',
    label: 'サビ（広角）',
    startBar: 32,
    stage: { bgColor: '#241b33', palette: ['#f0abfc', '#67e8f9', '#fde047', '#fb7185', '#c4b5fd'] },
    transition: { style: 'flash', beats: 1.5 },
  },
  { id: 'inter', label: '間奏（円形）', startBar: 40, stage: { bgColor: '#101a2b' }, transition: { style: 'fade', beats: 2 } },
  { id: 'a2', label: 'A′', startBar: 48, transition: { style: 'fade', beats: 0.5 } },
  { id: 'end', label: 'アウトロ（平面）', startBar: 56, stage: { bgColor: '#0b1017' }, transition: { style: 'wipeRight', beats: 1.5 } },
];

const CHARA = 'pose-a';

const LAYERS: MvLayer[] = [
  // ── 場面ごとのロール ───────────────────────────────────
  roll('roll-intro', ['intro'], { pitch: 8, yaw: -6, fov: 48, depth: 150, thickness: 8 }),
  roll('roll-main', ['main'], {}),
  roll('roll-a', ['a'], { pitch: 26, yaw: -30, depth: 270 }),
  roll('roll-b', ['b'], { pitch: 10, yaw: 24, depth: 200 }),
  roll('roll-sabi', ['sabi'], { pitch: 30, yaw: -34, fov: 64, depth: 330, thickness: 14 }, { amount: 4 }),
  // 間奏だけ円形。音域が輪になって巻きつくので、同じ曲でも別の絵に見える
  roll('roll-inter', ['inter'], {}, {
    projection: 'circular',
    ring: { innerRadius: 46, sweep: 320, rotate: -100 },
    rect: { x: 160, y: 10, w: 340, h: 340 },
    amount: 6,
  }),
  roll('roll-a2', ['a2'], { pitch: 18, yaw: 30, depth: 250 }),
  // アウトロは真横から。譜面がそのまま流れて終わる。
  // 平面ロールの既定は「普段は薄く・鳴った瞬間だけ白く」なので、
  // ここは主役として見せるぶん dim を上げて、余韻だけ効かせる。
  roll('roll-end', ['end'], {}, {
    projection: 'flat',
    amount: 6,
    light: { dim: 0.5, fadeOut: false, echo: { beats: 0.6, spread: 8, thickness: 1.5 } },
  }),

  // ── 「本編」に入った瞬間に一度だけ光る ─────────────────────
  // sections で本編だけに絞らないと、イントロの開始（0小節目）でも startBar=0 として誤発火する。
  {
    kind: 'effect',
    id: 'reveal-flash',
    style: 'flash',
    trigger: 'section',
    sections: ['main'],
    amount: 0.9,
    decayBeats: 2,
    color: '#ffffff',
  },
  // サビ頭だけズームパンチ
  {
    kind: 'effect',
    id: 'sabi-punch',
    style: 'zoomPunch',
    trigger: 'bars',
    bars: [32],
    amount: 0.8,
    decayBeats: 2,
  },

  // ── 本編以降ずっと出続けるキャラ絵とタイトル ──────────────────
  {
    kind: 'image',
    id: 'chara',
    ref: rozeRef(CHARA),
    url: rozeUrl(CHARA),
    // 6コマを2小節で1周。曲が速くなればアニメも速くなる。
    walk: rozePose('a', 8),
    x: 552,
    y: 356,
    scale: 0.62,
    anchor: 'bottom',
    motion: 'bob',
    motionAmount: 3,
    pixelated: true,
    z: 20,
    sections: ['main', 'a', 'b', 'sabi', 'a2'],
    entrance: { from: 'right', fade: true, beats: 2, distance: 120 },
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
    sections: ['main', 'a', 'b', 'sabi', 'a2'],
    opacity: 0.95,
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
    sections: ['main', 'a', 'b', 'sabi', 'a2'],
  },
  // アウトロは中央にタイトルだけを残す
  {
    kind: 'text',
    id: 'title-end',
    text: '無題のアレンジ',
    x: 320,
    y: 176,
    size: 20,
    color: '#f8fafc',
    anchor: 'center',
    vertical: false,
    motion: 'none',
    bold: true,
    shadow: true,
    z: 30,
    sections: ['end'],
  },
];

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'pianoRoll',
  title: '無題のアレンジ',
  credit: 'Arranged by あなた',
  mml: MML,
  audio: { mode: 'soundfontKoe' },
  stage: {
    bgColor: '#1b2733',
    bgFit: 'cover',
    bgDim: 0.3,
    pulse: 'none',
    fadeIn: true,
    fadeOut: true,
    palette: ['#a3e635', '#38bdf8', '#fbbf24', '#f472b6', '#c4b5fd'],
  },
  sections: SECTIONS,
  layers: LAYERS,
};

export const PIANO_ROLL_PRESET: MvPresetEntry = {
  kind: 'pianoRoll',
  name: 'ピアノロール',
  description: 'イントロはロールだけ、8小節目でフラッシュしてタイトルとキャラ絵が現れる。以降は場面ごとに視点が変わり、間奏で円形・アウトロで平面になる64小節構成。',
  swapHint: '背景に1枚絵を、右のキャラをあなたのドット絵に差し替えると一気に完成します。「場面」タブで視点が変わる小節数を調整できます。',
  build: () => cloneManifest(MANIFEST),
};
