// 「シーケンサ」プリセット。
// 参考動画: 次日朝夢(再現).mp4
//   真っ黒な画面。ステップ格子（2段）が置かれ、拍ごとにマスが点灯する。
//   イントロは格子だけ。歌が入ると縦書き歌詞が右から左へ「列」として積み上がり、古い列は薄く残る。
//   小節の頭では画面の左右端に白い縦帯が一瞬立つ。それ以外の飾りは何も無い（黒がいちばんの飾り）。
//   参考動画は約1.85秒＝1小節ごとに列が増え、格子の幅・位置・段数が場面ごとに組み替わる。
//   ドット絵キャラや下部の飾り線は参考動画には存在しないので置かない。

import type { MvLayer, MvManifest, MvSection, MvVisualizerLayer } from '@/lib/mv-config';
import { cloneManifest, mvTrack, rep, rest, type MvPresetEntry } from './shared';

const BARS = 64;

// ── 上段（l8）。マスの点灯パターンそのもの ──
const KICK_A = 'c r c c r c r r';
const KICK_B = 'c r c r c c r r';
const KICK_C = 'c c r c r c c r';

// ── 下段（l8）──
const HAT_A = 'r r e r r r e r';
const HAT_B = 'r e r r e r r r';
const HAT_C = 'r e r e r e r e';

const UPPER = [
  ...rep(4, KICK_A, KICK_B),                    // 0-7   イントロ
  ...rep(4, KICK_A, KICK_B),                    // 8-15  A
  ...rep(4, KICK_A, KICK_C),                    // 16-23 A'
  ...rep(4, KICK_B, KICK_C),                    // 24-31 B
  ...rep(4, KICK_C, KICK_C),                    // 32-39 サビ
  ...rep(4, KICK_A, KICK_B),                    // 40-47 間奏
  ...rep(4, KICK_A, KICK_C),                    // 48-55 A''
  ...rep(4, KICK_C, KICK_C),                    // 56-63 サビ2
];

const LOWER = [
  ...rep(4, HAT_A, HAT_A),
  ...rep(4, HAT_A, HAT_B),
  ...rep(4, HAT_B, HAT_B),
  ...rep(4, HAT_B, HAT_C),
  ...rep(4, HAT_C, HAT_C),
  ...rep(4, HAT_A, HAT_B),
  ...rep(4, HAT_B, HAT_C),
  ...rep(4, HAT_C, HAT_C),
];

// ── 低音（l1）。小節頭に立つ画面端の白帯はこのトラックの打点で光る ──
const BASS = [
  'a', 'r', 'f', 'r', 'c', 'r', 'g', 'r',
  'a', 'a', 'f', 'f', 'c', 'c', 'g', 'g',
  'a', 'a', 'f', 'f', 'd', 'd', 'e', 'e',
  'f', 'f', 'c', 'c', 'g', 'g', 'e', 'e',
  'a', 'a', 'f', 'f', 'c', 'c', 'g', 'g',
  'a', 'r', 'f', 'r', 'd', 'r', 'e', 'r',
  'a', 'a', 'f', 'f', 'd', 'd', 'e', 'e',
  'a', 'a', 'f', 'f', 'c', 'c', 'e', 'a',
];

// ── 歌（l8）。1小節に6音＝6音節。休みの小節を挟んで息継ぎを作る ──
const V1 = 'a b >c< b a a r4';
const V2 = 'g a b a g g r4';
const V3 = '>c< b a b >c c< r4';
const V4 = 'e g a b a g r4';

/** 歌のある8小節。4小節ぶん歌って残りは休む。 */
const singPhrase = (a: string, b: string, c: string, d: string) => [a, b, 'r1', c, d, 'r1', 'r1', 'r1'];

const VOCAL = [
  ...rest(8),                          // 0-7   イントロは歌わない
  ...singPhrase(V1, V2, V1, V3),       // 8-15  A
  ...singPhrase(V1, V2, V4, V3),       // 16-23 A'
  ...rest(8),                          // 24-31 B（間）
  ...singPhrase(V3, V4, V3, V1),       // 32-39 サビ
  ...rest(8),                          // 40-47 間奏
  ...singPhrase(V1, V2, V4, V3),       // 48-55 A''
  ...singPhrase(V3, V4, V3, V1),       // 56-63 サビ2
];

// 20小節 × 6音 = 120音。歌詞も 15行 × 8音節 = 120音節でぴったり合わせてある
// （音節と演奏ノートは1:1で対応するので、数が合わないと後半の歌詞が最後の音に潰れる）。
const LYRICS = [
  'とおいあさのゆめ',
  'まだきえないまま',
  'かさなるあしおと',
  'ひかりのなかへと',
  'しずかなよるだけ',
  'よるのへやのすみ',
  'きえてゆくこえを',
  'さがしていたゆめ',
  'あしたはどこまで',
  'とどくのだろうか',
  'まどのそとのそら',
  'しろくひかるまち',
  'なにもいえないで',
  'ただあるいていた',
  'そしてよるがあけ',
].join('\n');

const MML = [
  '#volume=50',
  mvTrack('@0 t140 q60 v85 o3 l8', UPPER, BARS),
  mvTrack('@1 t140 q50 v70 o3 l8', LOWER, BARS),
  mvTrack('@2 t140 q80 v90 o2 l1', BASS, BARS),
  mvTrack('@3 t140 q70 v85 o4 l8', VOCAL, BARS),
  `@@3 klatt v150 ${LYRICS}`,
].join('\n');

/** 場面ごとに置き換わるステップ格子。位置・幅・分割数だけが違う。 */
function grid(id: string, sections: string[], rect: MvVisualizerLayer['rect'], amount: number, tracks = [0, 1]): MvVisualizerLayer {
  return {
    kind: 'visualizer',
    id,
    style: 'stepGrid',
    rect,
    tracks,
    amount,
    thickness: 2,
    sections,
    z: 10,
  };
}

// 場面は8小節ごと。参考動画と同じで、格子の幅・位置・分割数が場面ごとに組み替わる。
const SECTIONS: MvSection[] = [
  { id: 'intro', label: 'イントロ', startBar: 0 },
  { id: 'a', label: 'A', startBar: 8, transition: { style: 'fade', beats: 0.5 } },
  { id: 'a2', label: 'A′', startBar: 16, transition: { style: 'fade', beats: 0.5 } },
  { id: 'b', label: 'B', startBar: 24, transition: { style: 'fade', beats: 0.5 } },
  { id: 'sabi', label: 'サビ', startBar: 32, transition: { style: 'flash', beats: 1 } },
  { id: 'inter', label: '間奏', startBar: 40, transition: { style: 'wipeLeft', beats: 1 } },
  { id: 'a3', label: 'A″', startBar: 48, transition: { style: 'fade', beats: 0.5 } },
  { id: 'sabi2', label: 'サビ2', startBar: 56, transition: { style: 'flash', beats: 1 } },
];

const LAYERS: MvLayer[] = [
  // ── 場面ごとに組み替わるステップ格子 ─────────────────────────
  // 画面の上半分は歌詞の列に譲り、格子はどの場面でも y=176 より下に置く
  // （参考動画も歌詞が上・格子が下で、重ならない）。
  // イントロ: 中央に小さく
  grid('grid-intro', ['intro'], { x: 208, y: 212, w: 224, h: 60 }, 8),
  // A / A′: 少し広く
  grid('grid-a', ['a', 'a2'], { x: 120, y: 200, w: 400, h: 80 }, 8),
  // B: 横に伸びて10分割
  grid('grid-b', ['b'], { x: 60, y: 196, w: 520, h: 88 }, 10),
  // サビ: 画面いっぱい・16分割
  grid('grid-sabi', ['sabi', 'sabi2'], { x: 16, y: 190, w: 608, h: 112 }, 16),
  // 間奏: 歌が止まる代わりに格子が主役になる
  grid('grid-inter', ['inter'], { x: 40, y: 176, w: 560, h: 144 }, 16),
  // A″: A の形へ戻る
  grid('grid-a3', ['a3'], { x: 120, y: 200, w: 400, h: 80 }, 8),

  // ── 縦書き歌詞。@@3（ボーカル）だけを出し、古い列を右へ薄く残す ──
  // 参考動画は曲の終わりまで列が積み上がったままなので、残像段数も保持も長く取る。
  {
    kind: 'lyrics',
    id: 'lyrics',
    source: 'mml',
    trackId: 3,
    x: 292,
    y: 32,
    anchor: 'topLeft',
    size: 13,
    color: '#f3f4f6',
    vertical: true,
    afterimage: 9,
    holdBars: 22,
    z: 40,
  },

  // ── 小節頭に画面の左右端で一瞬立つ白い縦帯 ──────────────────
  {
    kind: 'shape',
    id: 'edge-l',
    form: 'bar',
    x: 8,
    y: 180,
    size: 180,
    barAspect: 0.02,
    rotation: 90,
    color: '#ffffff',
    filled: true,
    thickness: 1,
    z: 30,
    modulators: [
      { source: 'trackOnset', track: 2, target: 'opacity', op: 'mul', amount: 1.2 },
    ],
  },
  {
    kind: 'shape',
    id: 'edge-r',
    form: 'bar',
    x: 632,
    y: 180,
    size: 180,
    barAspect: 0.02,
    rotation: 90,
    color: '#ffffff',
    filled: true,
    thickness: 1,
    z: 30,
    modulators: [
      { source: 'trackOnset', track: 2, target: 'opacity', op: 'mul', amount: 1.2 },
    ],
  },

  // ── サビだけ、上下にも白帯が立って画面が締まる ────────────────
  {
    kind: 'shape',
    id: 'edge-top',
    form: 'bar',
    x: 320,
    y: 6,
    size: 320,
    barAspect: 0.012,
    rotation: 0,
    color: '#ffffff',
    filled: true,
    thickness: 1,
    z: 30,
    sections: ['sabi', 'sabi2'],
    modulators: [
      { source: 'trackOnset', track: 2, target: 'opacity', op: 'mul', amount: 1.2 },
    ],
  },
  {
    kind: 'shape',
    id: 'edge-bottom',
    form: 'bar',
    x: 320,
    y: 354,
    size: 320,
    barAspect: 0.012,
    rotation: 0,
    color: '#ffffff',
    filled: true,
    thickness: 1,
    z: 30,
    sections: ['sabi', 'sabi2'],
    modulators: [
      { source: 'trackOnset', track: 2, target: 'opacity', op: 'mul', amount: 1.2 },
    ],
  },

  // ── サビ頭だけ画面が短く揺れる（低音の打点ではなく、狙った小節だけ）──
  {
    kind: 'effect',
    id: 'sabi-shake',
    style: 'shake',
    trigger: 'bars',
    bars: [32, 56],
    amount: 0.5,
    decayBeats: 2,
  },
];

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'pixelStage',
  title: '無題のシーケンス',
  mml: MML,
  audio: { mode: 'soundfontKoe' },
  stage: {
    bgColor: '#000000',
    bgFit: 'cover',
    pulse: 'none',
    fadeIn: true,
    fadeOut: true,
    palette: ['#f9fafb', '#d1d5db', '#9ca3af', '#6b7280'],
  },
  sections: SECTIONS,
  layers: LAYERS,
};

export const SEQUENCER_PRESET: MvPresetEntry = {
  kind: 'pixelStage',
  name: 'シーケンサ',
  description: '黒地の大きなステップ格子。歌が入ると縦書き歌詞が右から列で積み上がり、8小節ごとに格子の幅と分割が組み替わる64小節構成。',
  swapHint: '素材は要りません。歌詞はMMLの歌詞トラック（@@n）から自動で同期します。格子の段数は「対象トラック」で増やせます。',
  build: () => cloneManifest(MANIFEST),
};
