// 「ステージ整列＋コード進行」プリセット。
// 参考動画: ことりがそらへとおちてゆく.mp4
//   横長の風景を背景に、ドット絵のキャラが横一列に並ぶ。下に歌詞の帯、いちばん下にコード進行バー。
//   参考動画の見どころは **並ぶ顔ぶれが曲の進行に合わせて増えていく** ところで、
//   3人で始まり、犬が加わり、最後は7体が横一列に並ぶ。ここでも8小節ごとに1体ずつ増やす。
// コード進行バーの色分けは utau-kit の chord-progression-animation-tool と同じ
// 「キーに対する度数で色相を決める」やり方。

import type { MvChordStep, MvLayer, MvManifest, MvSection } from '@/lib/mv-config';
import { cloneManifest, cookieRef, cookieUrl, cookieWalk, mvTrack, rest, type CookieKey, type MvPresetEntry } from './shared';

const BARS = 64;

// ── コード進行。MMLの和音・低音・コード進行バーの3つを1つの表から作る ──
// （別々に書くと必ずどこかでずれて、バーの表示と鳴っている和音が食い違う）
type ChordName = 'C#m7' | 'Aadd9' | 'B7' | 'G#m7' | 'F#m7' | 'E';

const CHORD_MML: Record<ChordName, string> = {
  'C#m7': '[o3c#o3eo3g#]2 [o3c#o3eo3g#]2',
  'Aadd9': '[o3ao4c#o4e]2 [o3ao4c#o4e]2',
  'B7': '[o3bo3d#o3f#]2 [o3bo3d#o3f#]2',
  'G#m7': '[o3g#o3bo4d#]2 [o3g#o3bo4d#]2',
  'F#m7': '[o3f#o3ao4c#]2 [o3f#o3ao4c#]2',
  'E': '[o3eo3g#o3b]2 [o3eo3g#o3b]2',
};

const CHORD_ROOT: Record<ChordName, string> = {
  'C#m7': 'c#', 'Aadd9': 'a', 'B7': 'b', 'G#m7': 'g#', 'F#m7': 'f#', 'E': 'e',
};

const VERSE: ChordName[] = ['C#m7', 'Aadd9', 'B7', 'G#m7', 'C#m7', 'Aadd9', 'F#m7', 'B7'];
const BRIDGE: ChordName[] = ['Aadd9', 'B7', 'C#m7', 'G#m7', 'Aadd9', 'B7', 'E', 'E'];
const SABI: ChordName[] = ['C#m7', 'Aadd9', 'B7', 'E', 'C#m7', 'Aadd9', 'F#m7', 'B7'];
const INTER: ChordName[] = ['F#m7', 'B7', 'E', 'C#m7', 'F#m7', 'B7', 'Aadd9', 'Aadd9'];

const PROGRESSION: ChordName[] = [
  ...VERSE, ...VERSE, ...BRIDGE, ...SABI, ...INTER, ...VERSE, ...SABI, ...BRIDGE,
];

// ── 旋律（l4）──
const S1 = 'e f# g# a';
const S2 = 'g# f# e d#';
const S3 = 'b a g# f#';
const S4 = 'e f# g# b';
const S5 = 'a g# f# e';
const S6 = 'c#2 b2';
const S7 = 'e1';

const MELODY = [
  S1, S2, S3, S4, S1, S2, S6, S7,   // 0-7   A
  S1, S2, S3, S4, S5, S2, S6, S7,   // 8-15  A′
  S3, S4, S5, S2, S3, S4, S6, S7,   // 16-23 B
  S4, S3, S1, S5, S4, S3, S6, S7,   // 24-31 サビ
  'r1', S6, 'r1', S6, S5, S2, S6, S7, // 32-39 間奏
  S1, S2, S3, S4, S1, S2, S6, S7,   // 40-47 A″
  S4, S3, S1, S5, S4, S3, S6, S7,   // 48-55 サビ2
  S3, S4, S5, S2, S1, S6, S7, S7,   // 56-63 アウトロ
];

// ── 歌（l8、1小節6音）──
const W1 = 'e f# g# a g# f# r4';
const W2 = 'b a g# f# e f# r4';
const W3 = 'g# a b >c#< b a r4';
const W4 = 'e g# b a g# e r4';

const singPhrase = (a: string, b: string, c: string, d: string) => [a, b, 'r1', c, d, 'r1', 'r1', 'r1'];

const VOCAL = [
  ...singPhrase(W1, W2, W1, W3),   // 0-7   A
  ...singPhrase(W1, W2, W4, W3),   // 8-15  A′
  ...rest(8),                      // 16-23 B
  ...singPhrase(W3, W4, W3, W2),   // 24-31 サビ
  ...rest(8),                      // 32-39 間奏
  ...singPhrase(W1, W2, W4, W3),   // 40-47 A″
  ...singPhrase(W3, W4, W3, W2),   // 48-55 サビ2
  ...rest(8),                      // 56-63 アウトロ
];

// 20小節 × 6音 = 120音 ＝ 15行 × 8音節。
const LYRICS = [
  'ことりがそらへと',
  'おちてゆくところ',
  'ゆうやけがにじむ',
  'みずしぶきのおと',
  'とりはとんでいた',
  'つきはおぼろげに',
  'はなはかおるだけ',
  'つゆははかなくて',
  'ひろがるみなもに',
  'ゆらりとゆれてる',
  'あさやけのなかで',
  'きみをさがしてる',
  'こえがきこえたら',
  'そらへとかえろう',
  'ひかりのなかへと',
].join('\n');

const MML = [
  '#volume=50',
  mvTrack('@0 t118 q80 v96 o5 l4', MELODY, BARS),
  mvTrack('@1 t118 q60 v78 o2 l2', PROGRESSION.map(c => `${CHORD_ROOT[c]} ${CHORD_ROOT[c]}`), BARS),
  mvTrack('@2 t118 q50 v52 o3 l2', PROGRESSION.map(c => CHORD_MML[c]), BARS),
  mvTrack('@3 t118 q70 v88 o4 l8', VOCAL, BARS),
  `@@3 klatt v150 ${LYRICS}`,
].join('\n');

const CHORD_STEPS: MvChordStep[] = PROGRESSION.map((label, bar) => ({ bar, label }));

// ── 場面。夕暮れへ向かって地の色が沈んでいく ─────────────────
const SECTIONS: MvSection[] = [
  { id: 'a1', label: 'A（3人）', startBar: 0, stage: { bgColor: '#9db3c9', bgDim: 0.02 } },
  { id: 'a2', label: 'A′（4人目）', startBar: 8, stage: { bgColor: '#9db3c9', bgDim: 0.02 }, transition: { style: 'fade', beats: 1 } },
  { id: 'b', label: 'B（5人目）', startBar: 16, stage: { bgColor: '#96a9bf', bgDim: 0.05 }, transition: { style: 'fade', beats: 1 } },
  { id: 'sabi', label: 'サビ（6人目）', startBar: 24, stage: { bgColor: '#b0a2b0', bgDim: 0 }, transition: { style: 'flash', beats: 1 } },
  { id: 'inter', label: '間奏', startBar: 32, stage: { bgColor: '#8b93ab', bgDim: 0.16 }, transition: { style: 'fade', beats: 1.5 } },
  { id: 'a3', label: 'A″（7人目）', startBar: 40, stage: { bgColor: '#a8a0ae', bgDim: 0.08 }, transition: { style: 'fade', beats: 1 } },
  { id: 'sabi2', label: 'サビ2（全員）', startBar: 48, stage: { bgColor: '#c39a8e', bgDim: 0 }, transition: { style: 'flash', beats: 1 } },
  { id: 'end', label: 'アウトロ（夕暮れ）', startBar: 56, stage: { bgColor: '#7c6f84', bgDim: 0.2 }, transition: { style: 'fade', beats: 2 } },
];

const ALL = SECTIONS.map(s => s.id);
/** i 番目のキャラが並びに加わる場面から最後まで。 */
const fromSection = (idx: number) => ALL.slice(idx);

/**
 * 横一列の立ち位置。参考動画と同じで、真ん中から外へ広がるように増える。
 * 1コマ160×240の素材を高さ56px前後に落とすので scale は 0.23 前後。
 * ループの拍数を1体ずつずらしてあり、全員が同じ動きで揃わないようにしてある。
 */
const CAST: { char: CookieKey; x: number; joinAt: number; scale: number; loopBeats: number }[] = [
  { char: 'nyn-a', x: 246, joinAt: 0, scale: 0.24, loopBeats: 2 },
  { char: 'mgr-a', x: 320, joinAt: 0, scale: 0.24, loopBeats: 4 },
  { char: 'mot-a', x: 394, joinAt: 0, scale: 0.24, loopBeats: 2 },
  { char: 'nyn-b', x: 172, joinAt: 1, scale: 0.23, loopBeats: 4 },
  { char: 'mot-b', x: 468, joinAt: 2, scale: 0.23, loopBeats: 2 },
  { char: 'mgr-b', x: 100, joinAt: 3, scale: 0.22, loopBeats: 4 },
  { char: 'nyn-c', x: 540, joinAt: 5, scale: 0.22, loopBeats: 2 },
];

const LAYERS: MvLayer[] = [
  // ── 仮の風景。背景に1枚絵を入れたらこの2枚は消してよい ──────────
  // shape の size は「中心からの半径」なので、bar は幅 size*2・高さ size*2*barAspect になる。
  {
    kind: 'shape',
    id: 'hill',
    form: 'bar',
    x: 320,
    y: 244,
    size: 340,
    barAspect: 0.353,
    rotation: 0,
    color: '#6b7a5a',
    filled: true,
    thickness: 1,
    z: 2,
    modulators: [],
  },
  {
    kind: 'shape',
    id: 'road',
    form: 'bar',
    x: 320,
    y: 282,
    size: 340,
    barAspect: 0.088,
    rotation: 0,
    color: '#9ca3af',
    filled: true,
    thickness: 1,
    z: 3,
    modulators: [],
  },

  // ── キャラの整列。場面が進むごとに1体ずつ、下からせり上がって加わる ──
  ...CAST.map((c, i) => ({
    kind: 'image' as const,
    id: `cast${i}`,
    ref: cookieRef(c.char),
    url: cookieUrl(c.char),
    walk: cookieWalk(c.char, c.loopBeats),
    x: c.x,
    y: 276,
    scale: c.scale,
    anchor: 'bottom' as const,
    motion: 'bob' as const,
    motionAmount: 1.5,
    pixelated: true,
    z: 20 + i,
    ...(c.joinAt > 0
      ? {
        sections: fromSection(c.joinAt),
        entrance: { from: 'bottom' as const, fade: true, beats: 2, distance: 40 },
      }
      : {}),
  })),

  // ── キャラの頭の上に出る度数 ────────────────────────────
  // 参考動画（運び屋さん）と同じで、いま鳴っているコードの根音から数えたコードトーン名。
  // 旋律・低音・和音の3トラックをそれぞれ別のキャラの頭上に割り当てている。
  ...([
    { id: 'deg-mel', track: 0, x: 320, joinAt: 0 },
    { id: 'deg-bass', track: 1, x: 246, joinAt: 0 },
    { id: 'deg-chord', track: 2, x: 394, joinAt: 0 },
    { id: 'deg-vox', track: 3, x: 172, joinAt: 1 },
  ].map(dg => ({
    kind: 'degree' as const,
    id: dg.id,
    track: dg.track,
    x: dg.x,
    y: 208,
    anchor: 'top' as const,
    size: 12,
    color: '#f8fafc',
    bold: true,
    shadow: true,
    basis: 'chord' as const,
    key: 'E',
    chordLayerId: 'chords',
    hold: true,
    z: 40,
    ...(dg.joinAt > 0 ? { sections: fromSection(dg.joinAt) } : {}),
  }))),

  // ── 歌詞の帯（横書き・画面下）──────────────────────────
  {
    kind: 'shape',
    id: 'lyric-band',
    form: 'bar',
    x: 320,
    y: 310,
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
    trackId: 3,
    x: 320,
    y: 310,
    anchor: 'center',
    size: 13,
    color: '#f9fafb',
    vertical: false,
    afterimage: 0,
    holdBars: 2,
    typing: true,
    z: 55,
  },

  // ── コード進行バー（いちばん下）。64小節ぶんを4小節ずつ送る ────────
  {
    kind: 'chordBar',
    id: 'chords',
    rect: { x: 0, y: 338, w: 640, h: 22 },
    key: 'E',
    colorMode: 'kotori',
    color: '#1f2937',
    activeColor: '#3f6212',
    textColor: '#e5e7eb',
    size: 9,
    // 参考動画は1画面に2小節ぶんだけ。ブロックが横に長く、次のコードが読める幅になる。
    windowBars: 2,
    z: 60,
    chords: CHORD_STEPS,
  },

  {
    kind: 'text',
    id: 'title',
    text: '無題のうた',
    x: 12,
    y: 10,
    size: 11,
    color: '#1f2937',
    anchor: 'topLeft',
    vertical: false,
    motion: 'none',
    shadow: false,
    opacity: 0.7,
    z: 61,
  },

  // ── サビ頭だけ、空が一瞬明るくなる ──────────────────────
  {
    kind: 'effect',
    id: 'sabi-flash',
    style: 'flash',
    trigger: 'bars',
    bars: [24, 48],
    amount: 0.5,
    decayBeats: 2,
    color: '#fff7ed',
  },
];

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'pixelStage',
  title: '無題のうた',
  mml: MML,
  audio: { mode: 'soundfontKoe' },
  stage: {
    bgColor: '#9db3c9',
    bgFit: 'cover',
    bgDim: 0.02,
    pulse: 'none',
    fadeIn: true,
    fadeOut: true,
    palette: ['#f9a8d4', '#93c5fd', '#fcd34d', '#a7f3d0', '#c4b5fd'],
  },
  sections: SECTIONS,
  layers: LAYERS,
};

export const STAGE_CAST_PRESET: MvPresetEntry = {
  kind: 'pixelStage',
  name: 'ステージ整列＋コード進行',
  description: '風景の前にドット絵キャラが並び、8小節ごとに1体ずつ仲間が増えていく。下に歌詞の帯と64小節ぶんのコード進行バー。',
  swapHint: '背景に風景の1枚絵を入れ、キャラをあなたのドット絵に差し替えてください。コードは「レイヤー」タブのコード進行バーで編集できます。',
  build: () => cloneManifest(MANIFEST),
};
