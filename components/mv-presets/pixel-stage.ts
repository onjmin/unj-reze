// 「ドット絵ステージ」プリセット。
// 参考動画: _.mp4
//   ひとつの曲の中で **画面ごと別物になる2つの世界** が交互に来る。
//     黒の場面 = 黒地に枠付きのスプライト窓＋ステップ格子＋縦書き歌詞（残像つき）
//     夜の場面 = 全画面のイラストへ切り替わり、空を大きな影がゆっくり横切る
//   参考動画の切り替わりは 45秒 / 103秒 / 145秒 …と、どれも小節の頭にきっちり乗っている。
//   ここでは 8小節ごとに黒⇄夜を往復させ、夜へ入るときは白で抜け、黒へ戻るときは暗転する。
//
// 夜の場面の背景はユーザーが1枚絵を入れる前提だが、素材ゼロでも成立するよう
// 月（図形）とスカイライン（スペアナ）で仮の夜景を組んである。

import type { MvImageLayer, MvLayer, MvManifest, MvSection } from '@/lib/mv-config';
import {
  BEACH_NIGHT, beachWalk, cloneManifest, mvTrack, rest,
  rozeBeat, rozeRef, rozeSheetRow, rozeUrl, type MvPresetEntry,
} from './shared';

const BARS = 64;

// ── 旋律（l8）──
const M1 = 'e g a b a g e r';
const M2 = 'e g a b >c< b a r';
const M3 = 'a b >c d< b a g r';
const M4 = 'g a b a g e d r';
const M5 = 'r4 e g a g r4';
const M6 = 'e2 r2';
const M7 = 'b >c d c< b a g r';

const MELODY = [
  M6, 'r1', M5, 'r1', M6, 'r1', M5, 'r1',   // 0-7   イントロ
  M1, M2, M1, M4, M1, M2, M3, M4,           // 8-15  A（黒）
  M2, M3, M2, M4, M1, M2, M7, M4,           // 16-23 A′（黒）
  M3, M7, M3, M2, M7, M3, M2, M4,           // 24-31 夜
  M2, M7, M3, M2, M7, M3, M2, M1,           // 32-39 サビ（夜）
  M6, 'r1', M5, 'r1', M6, M5, M6, 'r1',     // 40-47 間奏（黒）
  M1, M2, M1, M4, M1, M2, M3, M4,           // 48-55 A″（黒）
  M2, M7, M3, M2, M7, M3, M1, M6,           // 56-63 サビ2（夜）
];

// ── 低音（l2、1小節2音）──
const BASS = [
  'a a', 'a a', 'f f', 'f f', 'c c', 'c c', 'g g', 'g g',
  'a a', 'a a', 'f f', 'f f', 'c c', 'c c', 'e e', 'e e',
  'a a', 'a a', 'f f', 'f f', 'd d', 'd d', 'e e', 'e e',
  'f f', 'f f', 'c c', 'c c', 'g g', 'g g', 'e e', 'e e',
  'a a', 'a a', 'f f', 'f f', 'c c', 'c c', 'g g', 'g g',
  'a a', 'a a', 'f f', 'f f', 'd d', 'd d', 'e e', 'e e',
  'a a', 'a a', 'f f', 'f f', 'c c', 'c c', 'e e', 'e e',
  'f f', 'f f', 'g g', 'g g', 'a a', 'a a', 'e e', 'a a',
];

// ── 和音（l2）──
const Am = '[o3ao4co4e]2 [o3ao4co4e]2';
const F = '[o3fo3ao4c]2 [o3fo3ao4c]2';
const C = '[o3co3eo3g]2 [o3co3eo3g]2';
const G = '[o3go3bo4d]2 [o3go3bo4d]2';
const Em = '[o3eo3go3b]2 [o3eo3go3b]2';
const Dm = '[o3do3fo3a]2 [o3do3fo3a]2';

const CHORDS = [
  Am, Am, F, F, C, C, G, G,
  Am, Am, F, F, C, C, Em, Em,
  Am, Am, F, F, Dm, Dm, Em, Em,
  F, F, C, C, G, G, Em, Em,
  Am, Am, F, F, C, C, G, G,
  Am, Am, F, F, Dm, Dm, Em, Em,
  Am, Am, F, F, C, C, Em, Em,
  F, F, G, G, Am, Am, Em, Am,
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
  'とけたまちなみに',
  'つきがしずんでる',
  'そらをとんでいる',
  'くろいかげのむれ',
  'まどのそとにだけ',
  'あおいひかりだけ',
  'だれもいないみち',
  'あるいてゆくだけ',
  'あさになるまえに',
  'きえてしまうゆめ',
  'こえもとどかない',
  'とおいうみのおと',
  'またあえるのなら',
  'このよるのはてで',
  'ひかりになりたい',
].join('\n');

const MML = [
  '#volume=50',
  mvTrack('@0 t128 q80 v96 o4 l8', MELODY, BARS),
  mvTrack('@1 t128 q60 v76 o2 l2', BASS, BARS),
  mvTrack('@2 t128 q50 v52 o3 l2', CHORDS, BARS),
  mvTrack('@3 t128 q70 v88 o5 l8', VOCAL, BARS),
  `@@3 klatt v150 ${LYRICS}`,
].join('\n');

/** 枠付きのスプライト窓。参考動画の「白い1本枠に囲われたドット絵」。 */
function window_(id: string, sections: string[], x: number, y: number, scale: number, row: number, flipH = false): MvImageLayer {
  return {
    kind: 'image',
    id,
    ref: rozeRef('sheet-a'),
    url: rozeUrl('sheet-a'),
    walk: rozeSheetRow(row, 4),
    x,
    y,
    scale,
    anchor: 'center',
    motion: 'none',
    pixelated: true,
    frame: { color: '#ffffff', width: 1, padding: 22 },
    flipH,
    sections,
    entrance: { from: 'none', fade: true, beats: 1 },
    z: 20,
  };
}

// 黒の場面と夜の場面が8小節ごとに入れ替わる。
// 夜の場面だけ `stage` で地の色を差し替えているので、背景を1枚絵にするならここに入れる。
const NIGHT = { bgColor: '#141a33', bgDim: 0.1 };
const BLACK = { bgColor: '#000000', bgRef: '' };

const SECTIONS: MvSection[] = [
  { id: 'intro', label: 'イントロ（黒）', startBar: 0, stage: BLACK },
  { id: 'a', label: 'A（黒）', startBar: 8, stage: BLACK, transition: { style: 'fade', beats: 0.5 } },
  { id: 'a2', label: 'A′（黒・窓が2つ）', startBar: 16, stage: BLACK, transition: { style: 'fade', beats: 0.5 } },
  { id: 'night', label: '夜（全画面）', startBar: 24, stage: NIGHT, transition: { style: 'flash', beats: 1.5 } },
  { id: 'sabi', label: 'サビ（夜）', startBar: 32, stage: NIGHT, transition: { style: 'wipeUp', beats: 1 } },
  { id: 'inter', label: '間奏（黒へ戻る）', startBar: 40, stage: BLACK, transition: { style: 'fade', beats: 2 } },
  { id: 'a3', label: 'A″（黒）', startBar: 48, stage: BLACK, transition: { style: 'fade', beats: 0.5 } },
  { id: 'sabi2', label: 'サビ2（夜）', startBar: 56, stage: NIGHT, transition: { style: 'flash', beats: 1.5 } },
];

const BLACK_SECTIONS = ['intro', 'a', 'a2', 'inter', 'a3'];
const NIGHT_SECTIONS = ['night', 'sabi', 'sabi2'];

const LAYERS: MvLayer[] = [
  // ══ 黒の場面 ═══════════════════════════════════════════
  window_('window', ['intro', 'a', 'inter', 'a3'], 320, 136, 1.3, 0),
  window_('window-l', ['a2'], 236, 136, 1, 2),
  window_('window-r', ['a2'], 404, 136, 1, 5, true),
  {
    kind: 'visualizer',
    id: 'grid',
    style: 'stepGrid',
    rect: { x: 212, y: 232, w: 216, h: 48 },
    tracks: [0, 1],
    amount: 8,
    thickness: 1,
    sections: BLACK_SECTIONS,
    z: 10,
  },
  {
    kind: 'text',
    id: 'stamp',
    text: '01',
    x: 190,
    y: 244,
    size: 10,
    color: '#6b7280',
    anchor: 'topRight',
    vertical: false,
    motion: 'none',
    sections: BLACK_SECTIONS,
    z: 30,
  },
  {
    kind: 'text',
    id: 'title',
    text: '無題のドット絵MV',
    x: 24,
    y: 24,
    size: 12,
    color: '#9ca3af',
    anchor: 'topLeft',
    vertical: false,
    motion: 'none',
    sections: ['intro'],
    z: 30,
  },

  // ══ 夜の場面 ═══════════════════════════════════════════
  // 沈んだ月。ベースの打点でわずかに脈打つだけで、動き回らせない
  {
    kind: 'shape',
    id: 'moon',
    form: 'circle',
    x: 330,
    y: 84,
    size: 32,
    rotation: 0,
    color: '#b3341f',
    filled: true,
    thickness: 1,
    opacity: 0.92,
    sections: NIGHT_SECTIONS,
    z: 3,
    modulators: [
      { source: 'trackOnset', track: 1, target: 'size', op: 'add', amount: 3 },
    ],
  },
  // 夜の海辺。4コマのアニメが2小節で1周する（波が拍に乗って寄せる）。
  // 背景そのもの（MvStage.bgUrl）は静止画しか敷けないので、画像レイヤーとして全画面に置く。
  {
    kind: 'image',
    id: 'beach',
    ref: `walk:row_anim:u:${BEACH_NIGHT.url}`,
    url: BEACH_NIGHT.url,
    walk: beachWalk(8),
    x: 320,
    y: 180,
    // 256×192 を画面(640×360)いっぱいに。max(640/256, 360/192) = 2.5
    scale: 2.5,
    anchor: 'center',
    motion: 'none',
    pixelated: true,
    sections: NIGHT_SECTIONS,
    z: 2,
  },
  // 建物の窓。鳴っている音域だけがぽつぽつ灯る
  {
    kind: 'visualizer',
    id: 'windows',
    style: 'bars',
    rect: { x: 0, y: 250, w: 640, h: 80 },
    amount: 22,
    thickness: 6,
    opacity: 0.28,
    sections: NIGHT_SECTIONS,
    z: 7,
  },
  // 空をゆっくり横切る影
  {
    kind: 'image',
    id: 'drifter',
    ref: rozeRef('sheet-b'),
    url: rozeUrl('sheet-b'),
    walk: rozeSheetRow(1, 4),
    x: 0,
    y: 110,
    scale: 1.1,
    anchor: 'center',
    motion: 'drift',
    motionAmount: 38,
    pixelated: true,
    sections: NIGHT_SECTIONS,
    z: 12,
  },
  // 手前に立つ影。サビだけ現れて、下からせり上がる
  {
    kind: 'image',
    id: 'foreground',
    ref: rozeRef('beat-f'),
    url: rozeUrl('beat-f'),
    // 14コマを2小節で1周。ゆっくりした揺れになる。
    walk: rozeBeat('f', 8),
    x: 150,
    y: 362,
    scale: 0.68,
    anchor: 'bottom',
    motion: 'parallax',
    motionAmount: 5,
    pixelated: true,
    sections: ['sabi', 'sabi2'],
    entrance: { from: 'bottom', fade: true, beats: 3, distance: 90 },
    z: 22,
  },

  // ══ 歌詞 ══════════════════════════════════════════════
  // 黒の場面は右、夜の場面は左。場面が変わると文字の位置ごと入れ替わる。
  {
    kind: 'lyrics',
    id: 'lyrics-right',
    source: 'mml',
    trackId: 3,
    x: 470,
    y: 44,
    anchor: 'topLeft',
    size: 15,
    color: '#f3f4f6',
    vertical: true,
    afterimage: 5,
    holdBars: 10,
    sections: BLACK_SECTIONS,
    z: 40,
  },
  {
    kind: 'lyrics',
    id: 'lyrics-left',
    source: 'mml',
    trackId: 3,
    x: 26,
    y: 44,
    anchor: 'topLeft',
    size: 15,
    color: '#e8eefc',
    vertical: true,
    afterimage: 4,
    holdBars: 8,
    sections: NIGHT_SECTIONS,
    z: 40,
  },

  // ══ 全編の演出 ═════════════════════════════════════════
  // 夜の場面だけ四隅を沈ませて、黒の場面との差をはっきりさせる
  {
    kind: 'effect',
    id: 'night-vignette',
    style: 'vignette',
    trigger: 'always',
    amount: 0.5,
    color: '#050914',
    sections: NIGHT_SECTIONS,
  },
  // サビ頭だけ画面が沈み込む
  {
    kind: 'effect',
    id: 'sabi-punch',
    style: 'zoomPunch',
    trigger: 'bars',
    bars: [32, 56],
    amount: 0.7,
    decayBeats: 2,
  },
];

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'pixelStage',
  title: '無題のドット絵MV',
  mml: MML,
  audio: { mode: 'soundfontKoe' },
  stage: {
    bgColor: '#000000',
    bgFit: 'cover',
    pulse: 'none',
    fadeIn: true,
    fadeOut: true,
    palette: ['#e5e7eb', '#93c5fd', '#a5b4fc', '#fbbf24', '#f9a8d4'],
  },
  sections: SECTIONS,
  layers: LAYERS,
};

export const PIXEL_STAGE_PRESET: MvPresetEntry = {
  kind: 'pixelStage',
  name: 'ドット絵ステージ',
  description: '黒地のスプライト窓と格子の場面と、全画面の夜景の場面が8小節ごとに入れ替わる。歌詞の位置も場面ごと左右に移る64小節構成。',
  swapHint: '「場面」タブで夜の場面（夜／サビ／サビ2）の背景に1枚絵を入れ、窓のドット絵をあなたのキャラに差し替えると参考動画そのものになります。',
  build: () => cloneManifest(MANIFEST),
};
