// 「窓のステージ」プリセット。
// 参考動画: x0o0x_.mp4
//   真っ黒な画面の中央に、白い1本線の四角い「窓」だけがずっと置かれている。
//   場面が変わると **窓の中身だけが入れ替わる**（空 → キャラ → 灯り → 石 → 空）。
//   窓の左右と真下には同じドット絵が並び、その後ろにうっすらと横線（低い不透明度のロール）が流れる。
//   歌詞は右端に縦書きで積み上がり、古い列は薄くなって10列ぶんの壁になる。
//   参考動画の大きな切り替わりは 41秒 / 71秒 / 131秒 …と、おおむね16小節ごとに来る。
//
// 「窓」は画像の枠ではなく図形として置いてある。中身が空の場面でも枠だけ残すため。

import type { MvImageLayer, MvLayer, MvManifest, MvSection } from '@/lib/mv-config';
import { cloneManifest, mvTrack, rep, rest, rozeBeat, rozeRef, rozeSheetRow, rozeUrl, type MvPresetEntry } from './shared';

const BARS = 64;

// ── 分散和音（l8）。1要素＝1小節 ──
const X1 = 'a r >c< r e r >c< r';
const X2 = 'f r a r >c< r a r';
const X3 = 'e r g r b r g r';
const X4 = 'd r f r a r f r';

const ARP = [
  ...rep(2, X1, X1, X2, X2),   // 0-7   イントロ
  ...rep(2, X1, X2, X3, X4),   // 8-15  A
  ...rep(2, X1, X2, X3, X4),   // 16-23 A′
  ...rep(2, X2, X2, X4, X4),   // 24-31 空白の場面
  ...rep(2, X1, X3, X1, X3),   // 32-39 サビ
  ...rep(2, X2, X4, X2, X4),   // 40-47 間奏
  ...rep(2, X1, X2, X3, X4),   // 48-55 A″
  ...rep(2, X1, X1, X2, X2),   // 56-63 アウトロ
];

// ── 低音（l1）──
const BASS = [
  'a', 'a', 'f', 'f', 'a', 'a', 'f', 'f',
  'a', 'a', 'f', 'f', 'c', 'c', 'd', 'd',
  'a', 'a', 'f', 'f', 'c', 'c', 'd', 'd',
  'f', 'f', 'f', 'f', 'd', 'd', 'd', 'd',
  'a', 'a', 'e', 'e', 'a', 'a', 'e', 'e',
  'f', 'f', 'd', 'd', 'f', 'f', 'd', 'd',
  'a', 'a', 'f', 'f', 'c', 'c', 'd', 'd',
  'a', 'a', 'f', 'f', 'a', 'a', 'a', 'a',
];

// ── 和音（l1）──
const Am = '[o3ao4co4e]1';
const F = '[o3fo3ao4c]1';
const C = '[o3co3eo3g]1';
const Dm = '[o3do3fo3a]1';
const Em = '[o3eo3go3b]1';

const PAD = [
  Am, Am, F, F, Am, Am, F, F,
  Am, Am, F, F, C, C, Dm, Dm,
  Am, Am, F, F, C, C, Dm, Dm,
  F, F, F, F, Dm, Dm, Dm, Dm,
  Am, Am, Em, Em, Am, Am, Em, Em,
  F, F, Dm, Dm, F, F, Dm, Dm,
  Am, Am, F, F, C, C, Dm, Dm,
  Am, Am, F, F, Am, Am, Am, Am,
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
  'よるにみつけたの',
  'ちいさないきもの',
  'つれてかえるみち',
  'だれもしらないで',
  'まどのそとはよる',
  'しずかにねむるよ',
  'あさがきたのなら',
  'どこへゆくのだろ',
  'にげてもにげても',
  'おいかけてくるの',
  'くらいみずのそこ',
  'しずんでいくだけ',
  'ひかりがきえたら',
  'くらいへやのすみ',
  'こえをきかせてよ',
].join('\n');

const MML = [
  '#volume=46',
  mvTrack('@0 t112 q50 v76 o4 l8', ARP, BARS),
  mvTrack('@1 t112 q80 v70 o2 l1', BASS, BARS),
  mvTrack('@2 t112 q90 v42 o3 l1', PAD, BARS),
  mvTrack('@3 t112 q70 v88 o4 l8', VOCAL, BARS),
  `@@3 klatt v150 ${LYRICS}`,
].join('\n');

// 8小節ごとの場面。窓の中身と、周りに並ぶ影の数が入れ替わる。
const SECTIONS: MvSection[] = [
  { id: 'intro', label: 'イントロ（窓だけ）', startBar: 0 },
  { id: 'a', label: 'A（窓に住人）', startBar: 8, transition: { style: 'fade', beats: 1 } },
  { id: 'a2', label: 'A′（影が増える）', startBar: 16, transition: { style: 'fade', beats: 0.5 } },
  { id: 'empty', label: '間（窓だけに戻る）', startBar: 24, transition: { style: 'fade', beats: 2 } },
  { id: 'sabi', label: 'サビ（総出）', startBar: 32, transition: { style: 'flash', beats: 1 } },
  { id: 'inter', label: '間奏（灯りへ）', startBar: 40, transition: { style: 'fade', beats: 1.5 } },
  { id: 'a3', label: 'A″', startBar: 48, transition: { style: 'fade', beats: 0.5 } },
  { id: 'end', label: 'アウトロ（石だけ残る）', startBar: 56, transition: { style: 'fade', beats: 2 } },
];

const OCCUPIED = ['a', 'a2', 'sabi', 'a3'];
const CAST_SECTIONS = ['a', 'a2', 'sabi', 'a3'];

/** 窓の中に納まる住人。窓の中央に置き、枠は図形側が持つ。 */
function occupant(id: string, key: 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g', sections: string[], scale: number): MvImageLayer {
  return {
    kind: 'image',
    id,
    ref: rozeRef(`beat-${key}`),
    url: rozeUrl(`beat-${key}`),
    walk: rozeBeat(key, 4),
    x: 320,
    y: 150,
    scale,
    anchor: 'center',
    motion: 'none',
    pixelated: true,
    sections,
    entrance: { from: 'none', fade: true, beats: 2 },
    z: 20,
  };
}

/** 窓のまわりに並ぶ影。64pxシートの行違いで、同じ子が別の動きをする。 */
function chorus(id: string, row: number, over: Partial<MvImageLayer>): MvImageLayer {
  return {
    kind: 'image',
    id,
    ref: rozeRef('sheet-a'),
    url: rozeUrl('sheet-a'),
    walk: rozeSheetRow(row, 4),
    x: 78,
    y: 236,
    scale: 0.85,
    anchor: 'bottom',
    motion: 'none',
    pixelated: true,
    entrance: { from: 'none', fade: true, beats: 2 },
    z: 12,
    ...over,
  };
}

const LAYERS: MvLayer[] = [
  // ══ 背後のうっすらした横線 ══════════════════════════════
  // 参考動画の譜面は横に動かないので `page`（位置を固定して小節ごとに差し替え）。
  // 薄さは layer.opacity ではなく light.dim で作る——全体を薄くすると
  // 「鳴っていない音」と「鳴っている音」の差まで潰れて、全部が同じに光って見える。
  {
    kind: 'visualizer',
    id: 'haze',
    style: 'pianoRoll',
    projection: 'flat',
    flow: 'page',
    rect: { x: 60, y: 232, w: 520, h: 76 },
    amount: 2,
    thickness: 1,
    light: { dim: 0.12, fadeOut: true, echo: { beats: 0.5, spread: 5, thickness: 1 } },
    sections: ['a', 'a2', 'sabi', 'inter', 'a3'],
    z: 6,
  },

  // ══ 中央の窓（全編ずっと居る白い枠）════════════════════════
  {
    kind: 'shape',
    id: 'window',
    form: 'square',
    x: 320,
    y: 150,
    size: 58,
    rotation: 0,
    color: '#ffffff',
    filled: false,
    thickness: 1.4,
    z: 18,
    modulators: [],
  },

  // ══ 窓の中身。場面ごとに入れ替わる ══════════════════════════
  // 枠（半径58＝116px四方）に収まるよう、16pxのコマは4倍まで
  occupant('resident', 'c', OCCUPIED, 0.3),
  occupant('light', 'g', ['inter'], 0.3),
  // アウトロは小さな石だけが残る
  {
    kind: 'shape',
    id: 'stone',
    form: 'diamond',
    x: 320,
    y: 150,
    size: 9,
    rotation: 0,
    color: '#7dd3fc',
    filled: true,
    thickness: 1,
    sections: ['end'],
    z: 20,
    modulators: [
      { source: 'trackOnset', track: 1, target: 'size', op: 'add', amount: 3 },
      { source: 'trackOnset', track: 1, target: 'opacity', op: 'mul', amount: 1 },
      { source: 'constant', target: 'opacity', op: 'add', amount: 0.5 },
    ],
  },
  // 窓の下に引かれる白い線（曲の終わりの合図）
  {
    kind: 'shape',
    id: 'underline',
    form: 'bar',
    x: 320,
    y: 224,
    size: 38,
    barAspect: 0.09,
    rotation: 0,
    color: '#ffffff',
    filled: true,
    thickness: 1,
    sections: ['end'],
    z: 20,
    modulators: [],
  },

  // ══ 窓を囲む影たち ═════════════════════════════════════
  // 左右に1体ずつ（repeat で1レイヤーのまま2体）
  chorus('chorus-side', 1, {
    x: 96,
    y: 236,
    repeat: { count: 2, dx: 452, dy: 0, phase: 0.4 },
    sections: CAST_SECTIONS,
  }),
  // 窓の真下にもう1体。サビだけ左右がさらに増える
  chorus('chorus-front', 3, {
    x: 320,
    y: 302,
    sections: ['a2', 'sabi', 'a3'],
    entrance: { from: 'bottom', fade: true, beats: 2, distance: 40 },
    z: 14,
  }),
  chorus('chorus-extra', 5, {
    x: 168,
    y: 268,
    repeat: { count: 2, dx: 304, dy: 0, phase: 0.7 },
    sections: ['sabi'],
    entrance: { from: 'none', fade: true, beats: 1 },
    z: 13,
  }),
  // 左端に立つ灯り
  {
    kind: 'image',
    id: 'torch',
    ref: rozeRef('beat-e'),
    url: rozeUrl('beat-e'),
    walk: rozeBeat('e', 4),
    x: 26,
    y: 246,
    // 参考動画の左端の灯りは窓の住人よりずっと小さい小道具
    scale: 0.16,
    // 左端の影と重ならない位置へ
    anchor: 'bottom',
    motion: 'bob',
    motionAmount: 1.2,
    pixelated: true,
    sections: ['a', 'inter', 'a3'],
    entrance: { from: 'left', fade: true, beats: 2, distance: 40 },
    z: 12,
  },

  // ══ 右端に積み上がる縦書き歌詞 ═══════════════════════════
  // 参考動画は曲の終わりまで列が残る。新しい列が左、古い列が右へ流れていく。
  {
    kind: 'lyrics',
    id: 'lyrics',
    source: 'mml',
    trackId: 3,
    // 右端固定・左へ伸びる積み方（参考動画と同じ）
    x: 612,
    y: 32,
    stack: 'rightToLeft',
    anchor: 'topLeft',
    size: 12,
    color: '#f4f4f5',
    vertical: true,
    afterimage: 9,
    holdBars: 20,
    z: 40,
  },
];

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'pixelStage',
  title: '無題のよる',
  mml: MML,
  audio: { mode: 'soundfontKoe' },
  stage: {
    bgColor: '#000000',
    bgFit: 'cover',
    pulse: 'none',
    fadeIn: true,
    fadeOut: true,
    palette: ['#e5e7eb', '#c7cbd1', '#9aa0a6', '#f4f4f5'],
  },
  sections: SECTIONS,
  layers: LAYERS,
};

export const WINDOW_FRAME_PRESET: MvPresetEntry = {
  kind: 'pixelStage',
  name: '窓のステージ',
  description: '黒地の中央にある白い窓の中身が8小節ごとに入れ替わり、周りに並ぶ影が増減する。右端には縦書き歌詞が10列ぶん積み上がる。',
  swapHint: '窓の中身（住人・灯り）をあなたのドット絵に差し替えるだけで一気に自分のものになります。窓の枠は図形レイヤーなので大きさも変えられます。',
  build: () => cloneManifest(MANIFEST),
};
