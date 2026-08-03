// 「運び屋」プリセット。
// 参考動画: 運び屋さん(再現).mp4
//
// コマ送りと全長のモンタージュで分かった構造:
//
//   1. **カメラは1つ、場面転換は最後まで無い**。駅舎・ホーム・ポストが最初から最後まで同じ位置に居る。
//      シーン検出にかかるのは 137.4秒（全体の82%）のたった1点だけ。
//      場面を8小節ごとに入れ替える作りとは正反対で、動かさないことがこの動画の作り。
//   2. その1点で **画面全体が夕焼け色へ切り替わる**（実測 空 181,202,224→247,184,44 /
//      床 37,38,33→56,17,26）。明るさの構造は残ったまま色味だけ変わるので、
//      塗りつぶしではなく色の合成（`effect: 'tint'`）で作る。
//   3. キャラの頭の上に **度数** が出る。`9` `♭7` `5` と書かれていて、`2`ではなく`9`、
//      `7`ではなく`♭7` なので、調に対する音階度数ではなく
//      **いま鳴っているコードの根音から数えたコードトーン名**（`MvDegreeLayer`）。
//      画面にコード進行バーは出ていないので、進行は度数レイヤーが自前で持つ。
//   4. 下部の歌詞帯は1行を中央に出すだけだが、**特定の語の背後だけが色つきの矩形で塗られる**
//      （文字色は白のまま）。`MvLyricLine.marks` がこれ。
//
// 駅舎・ホーム・ポストは図形で組んであるので素材ゼロで成立する。背景に1枚絵を入れるなら
// 「場面」タブで差し替えて、図形レイヤーを消せばよい。

import type { MvChordStep, MvLayer, MvLyricLine, MvManifest, MvSection } from '@/lib/mv-config';
import { cloneManifest, cookieRef, cookieUrl, cookieWalk, mvTrack, rest, type CookieKey, type MvPresetEntry } from './shared';

const BARS = 64;

// ── コード進行。MMLの和音・低音・頭上の度数を1つの表から作る ──
type ChordName = 'Am' | 'F' | 'C' | 'G' | 'Em' | 'Dm';

const CHORD_MML: Record<ChordName, string> = {
  Am: '[o3ao4co4e]2 [o3ao4co4e]2',
  F: '[o3fo3ao4c]2 [o3fo3ao4c]2',
  C: '[o3co3eo3g]2 [o3co3eo3g]2',
  G: '[o3go3bo4d]2 [o3go3bo4d]2',
  Em: '[o3eo3go3b]2 [o3eo3go3b]2',
  Dm: '[o3do3fo3a]2 [o3do3fo3a]2',
};

const CHORD_ROOT: Record<ChordName, string> = {
  Am: 'a', F: 'f', C: 'c', G: 'g', Em: 'e', Dm: 'd',
};

const A: ChordName[] = ['Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G'];
const B: ChordName[] = ['Am', 'Am', 'F', 'F', 'Dm', 'Dm', 'Em', 'Em'];
const S: ChordName[] = ['F', 'F', 'C', 'C', 'G', 'G', 'Em', 'Am'];

const PROGRESSION: ChordName[] = [...A, ...A, ...B, ...S, ...A, ...B, ...S, ...A];

/** 度数レイヤーが自前で持つ進行。画面にバーは出さない。 */
const CHORDS: MvChordStep[] = PROGRESSION.map((label, bar) => ({ bar, label }));

// ── 旋律（l8）──
const D1 = 'e g a b a g e r';
const D2 = 'a b >c< b a g a r';
const D3 = 'g a b a g e d r';
const D4 = 'e2 r2';

const MELODY = [
  D4, 'r1', D4, 'r1', D1, D3, D1, 'r1',
  D1, D2, D1, D3, D1, D2, D3, 'r1',
  D2, D3, D2, D1, D2, D3, D1, 'r1',
  D2, D1, D2, D3, D1, D2, D1, 'r1',
  D1, D2, D1, D3, D1, D2, D3, 'r1',
  D2, D3, D2, D1, D2, D3, D1, 'r1',
  D2, D1, D2, D3, D1, D2, D1, 'r1',
  D4, 'r1', D1, D3, D4, 'r1', D4, 'r1',
];

// ── 歌（l8、1小節6音）──
const W1 = 'e g a b a g r4';
const W2 = 'a b >c< b a g r4';
const W3 = '>c< b a g a b r4';
const W4 = 'g a b >c< b a r4';

const singPhrase = (a: string, b: string, c: string, d: string) => [a, b, 'r1', c, d, 'r1', 'r1', 'r1'];

const VOCAL = [
  ...rest(8),
  ...singPhrase(W1, W2, W1, W4),
  ...singPhrase(W2, W3, W2, W4),
  ...singPhrase(W3, W4, W3, W1),
  ...rest(8),
  ...singPhrase(W1, W2, W4, W3),
  ...singPhrase(W3, W4, W3, W1),
  ...rest(8),
];

const MML = [
  '#volume=48',
  mvTrack('@0 t100 q70 v88 o5 l8', MELODY, BARS),
  mvTrack('@1 t100 q60 v76 o2 l2', PROGRESSION.map(c => `${CHORD_ROOT[c]} ${CHORD_ROOT[c]}`), BARS),
  mvTrack('@2 t100 q50 v50 o3 l2', PROGRESSION.map(c => CHORD_MML[c]), BARS),
  mvTrack('@3 t100 q70 v90 o4 l8', VOCAL, BARS),
].join('');

// ── 歌詞。1行ずつ中央に出し、語の背後だけ色を敷く ──────────────
// 手入力にしてあるのは、MML由来の行には語ごとの色指定を持たせられないため。
const MARK_MOON = '#808000';
const MARK_WIND = '#008080';
const MARK_FLOWER = '#800080';

const LYRICS: MvLyricLine[] = [
  { bar: 8, text: 'あのよへの おくりもので' },
  { bar: 10, text: 'あてさきも じゅうしょも すうじも' },
  { bar: 12, text: 'それが わかった' },
  { bar: 14, text: 'はこびやさんは' },
  { bar: 16, text: 'このせかいには もういないけど' },
  { bar: 18, text: 'いるきが していて ならないんだ' },
  { bar: 20, text: 'みなもの したに います' },
  { bar: 22, text: 'つきも みえず なにもなく', marks: [{ from: 0, to: 2, color: MARK_MOON }] },
  { bar: 24, text: 'かぜも ふかず', marks: [{ from: 0, to: 2, color: MARK_WIND }] },
  { bar: 26, text: 'はなも ちらず', marks: [{ from: 0, to: 2, color: MARK_FLOWER }] },
  { bar: 28, text: 'もう なにも' },
  { bar: 32, text: 'おとといの てがみが' },
  { bar: 34, text: 'とどいたら ありえないの' },
  { bar: 36, text: 'ぶんしょうに なっているの' },
  { bar: 38, text: 'おしえていないはず なのに' },
  { bar: 40, text: 'くらい とりに なっている' },
  { bar: 44, text: 'でんしゃから みえる' },
  { bar: 46, text: 'このせかいには もういないけど' },
  { bar: 48, text: 'いるきが していて ならないんだ' },
  { bar: 52, text: 'みなもの したに います' },
  { bar: 56, text: 'つきも みえず なにもなく', marks: [{ from: 0, to: 2, color: MARK_MOON }] },
  { bar: 58, text: 'かぜも ふかず', marks: [{ from: 0, to: 2, color: MARK_WIND }] },
  { bar: 60, text: 'もう なにも' },
];

// 場面は2つだけ。参考動画は最後まで同じ画で、82%地点で色だけが変わる。
const SECTIONS: MvSection[] = [
  { id: 'day', label: '本編', startBar: 0 },
  { id: 'sunset', label: '夕焼け（色が変わる）', startBar: 52, transition: { style: 'flash', beats: 1.5 } },
];

const ALL = ['day', 'sunset'];

// ── 立ち位置。足元はホームの高さ(y=250)に揃える ──────────────
const CAST: { key: CookieKey; x: number; loopBeats: number }[] = [
  { key: 'nyn-a', x: 150, loopBeats: 4 },
  { key: 'mot-a', x: 305, loopBeats: 2 },
  { key: 'mgr-a', x: 430, loopBeats: 4 },
];

const INK = '#f8fafc';

const LAYERS: MvLayer[] = [
  // ══ 駅舎 ═══════════════════════════════════════════════
  // 屋根。bar の高さは size*2*barAspect
  {
    kind: 'shape', id: 'roof', form: 'bar', x: 280, y: 65, size: 210, barAspect: 0.081,
    rotation: 0, color: '#6b4636', filled: true, thickness: 1, z: 4, modulators: [],
  },
  // 本体
  {
    kind: 'shape', id: 'wall', form: 'bar', x: 280, y: 166, size: 190, barAspect: 0.442,
    rotation: 0, color: '#4a3a3a', filled: true, thickness: 1, z: 5, modulators: [],
  },
  // 入口（暗がり）
  {
    kind: 'shape', id: 'door-dark', form: 'bar', x: 340, y: 195, size: 34, barAspect: 1.62,
    rotation: 0, color: '#140f12', filled: true, thickness: 1, z: 6, modulators: [],
  },
  // 左の窓
  {
    kind: 'shape', id: 'window', form: 'bar', x: 150, y: 140, size: 18, barAspect: 1.11,
    rotation: 0, color: '#7f9c7a', filled: true, thickness: 1, z: 6, modulators: [],
  },
  // 駅名の看板
  {
    kind: 'shape', id: 'sign', form: 'bar', x: 280, y: 44, size: 52, barAspect: 0.25,
    rotation: 0, color: '#2f6b3c', filled: true, thickness: 1, z: 8, modulators: [],
  },
  {
    kind: 'text', id: 'sign-text', text: 'うんｊ駅', x: 280, y: 44, size: 13,
    color: '#eafbe8', anchor: 'center', vertical: false, motion: 'none', bold: true, z: 9,
  },

  // ══ ホームと足元 ═══════════════════════════════════════
  {
    kind: 'shape', id: 'platform', form: 'bar', x: 320, y: 259, size: 320, barAspect: 0.028,
    rotation: 0, color: '#6f7169', filled: true, thickness: 1, z: 10, modulators: [],
  },
  {
    kind: 'shape', id: 'stone', form: 'bar', x: 320, y: 290, size: 320, barAspect: 0.069,
    rotation: 0, color: '#252622', filled: true, thickness: 1, z: 10, modulators: [],
  },

  // ══ 右のポスト ═══════════════════════════════════════════
  {
    kind: 'shape', id: 'post-base', form: 'bar', x: 560, y: 256, size: 24, barAspect: 0.25,
    rotation: 0, color: '#5a4a3a', filled: true, thickness: 1, z: 11, modulators: [],
  },
  {
    kind: 'shape', id: 'postbox', form: 'bar', x: 560, y: 217, size: 16, barAspect: 2.03,
    rotation: 0, color: '#8f3b34', filled: true, thickness: 1, z: 12, modulators: [],
  },
  {
    kind: 'shape', id: 'post-slot', form: 'bar', x: 560, y: 196, size: 10, barAspect: 0.2,
    rotation: 0, color: '#2b1614', filled: true, thickness: 1, z: 13, modulators: [],
  },

  // ══ 立っている3人 ═══════════════════════════════════════
  ...CAST.map((c, i) => ({
    kind: 'image' as const,
    id: `cast${i}`,
    ref: cookieRef(c.key),
    url: cookieUrl(c.key),
    walk: cookieWalk(c.key, c.loopBeats),
    x: c.x,
    y: 252,
    scale: 0.28,
    anchor: 'bottom' as const,
    motion: 'none' as const,
    pixelated: true,
    z: 20 + i,
  })),

  // ══ 頭の上の度数 ═══════════════════════════════════════
  // 参考動画と同じで、キャラごとに別のトラックの音を数える。
  // 真ん中の1つだけ位置が低い（頭上ではなく荷車のあたりに浮いている）。
  ...([
    { id: 'deg-a', track: 0, x: 150, y: 168 },
    { id: 'deg-b', track: 1, x: 232, y: 198 },
    { id: 'deg-c', track: 3, x: 430, y: 168 },
  ].map(dg => ({
    kind: 'degree' as const,
    id: dg.id,
    track: dg.track,
    x: dg.x,
    y: dg.y,
    anchor: 'top' as const,
    size: 13,
    color: INK,
    bold: true,
    shadow: true,
    basis: 'chord' as const,
    key: 'C',
    // 画面にコード進行バーを出さないので、進行はここが持つ
    chords: CHORDS,
    hold: true,
    z: 30,
  }))),

  // ══ 下部の歌詞帯 ═══════════════════════════════════════
  {
    kind: 'shape', id: 'band', form: 'bar', x: 320, y: 336, size: 320, barAspect: 0.075,
    rotation: 0, color: '#000000', filled: true, thickness: 1, z: 50, modulators: [],
  },
  {
    kind: 'lyrics',
    id: 'lyrics',
    source: 'manual',
    lines: LYRICS,
    x: 320,
    y: 336,
    anchor: 'center',
    size: 13,
    color: '#ffffff',
    vertical: false,
    afterimage: 0,
    holdBars: 2,
    z: 55,
  },

  // ══ 終盤の色替え ═══════════════════════════════════════
  // 明るさの構造を残したまま色味だけ夕焼けへ。塗りつぶすと絵が潰れる。
  {
    kind: 'effect',
    id: 'sunset',
    style: 'tint',
    trigger: 'always',
    amount: 0.85,
    color: '#f7b82c',
    sections: ['sunset'],
  },
  // 空気を締める周辺減光は全編
  {
    kind: 'effect',
    id: 'vignette',
    style: 'vignette',
    trigger: 'always',
    amount: 0.3,
    color: '#0b0d16',
    sections: ALL,
  },
];

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'pixelStage',
  title: '無題の運び屋',
  mml: MML,
  audio: { mode: 'soundfontKoe' },
  stage: {
    // 空の色。夕焼けの場面では tint が上から色を差し替える
    bgColor: '#b5cae0',
    bgFit: 'cover',
    pulse: 'none',
    fadeIn: true,
    fadeOut: true,
    palette: ['#e5e7eb', '#93c5fd', '#fcd34d', '#f9a8d4', '#a7f3d0'],
  },
  sections: SECTIONS,
  layers: LAYERS,
};

export const COURIER_PRESET: MvPresetEntry = {
  kind: 'pixelStage',
  name: '運び屋（度数つき）',
  description: 'カメラを動かさない駅のホーム。3人の頭の上にコードの度数が出て、歌詞は語ごとに色が敷かれる。終盤で画面全体が夕焼け色に変わる。',
  swapHint: '場面を増やさないのがこの見本の作りです。頭の上の数字は「レイヤー」タブの度数レイヤーで、どのトラックを読むか変えられます。',
  build: () => cloneManifest(MANIFEST),
};
