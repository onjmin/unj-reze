// 「ピアノロール」プリセット。
// 参考動画: [Touhou Style Arrangement] Out of Place Magical Girl
//   構成は「イントロ（ロールだけ）→ 白フラッシュ →キャラ絵/タイトルが出て以降ずっと表示」の一発もの。
//   毎小節光るアクセントではない（そう見えたので過去に間違えて実装していた）。
//   `section` トリガーは「その場面に入った瞬間だけ」発火するので、場面の境目に置くとちょうどこの動きになる。
// 曲のノートがそのまま絵になるので、素材を1枚も足さなくても成立する（背景・キャラは差し替え推奨）。

import type { MvManifest } from '@/lib/mv-config';
import { BUILTIN_WALK, BUILTIN_WALK_URL, cloneManifest, type MvPresetEntry } from './shared';

// 各トラックとも「1小節=4拍」で正確に16小節そろえてある。
// 長さが揃っていないと後半の画面からノートが消えて、本編がスカスカに見えてしまう。
const MML = [
  '#volume=50',
  '@0 t150 q80 v100 o5 l8 ' +
    'a b >c< b a g a4 e f g a g e d4 a b >c< b a g a4 e g b >c< a4 r4 ' +
    'g a b a g e g4 f g a g f d f4 e f g f e c e4 d e f e d4 r4 ' +
    'a b >c< b a g a4 e f g a g e d4 a b >c< b a g a4 e g b >c< a4 r4 ' +
    'a b >c d c< b a4 g a b >c< b g g4 a g e g a b a4 e4 g4 a2;',
  '@1 t150 q70 v70 o4 l8 ' +
    'r1 r4 e f e4 c4 r4 c d c4 d4 r4 e f g4 e4 ' +
    'r4 d e f4 d4 r4 c d e4 c4 r4 e d c4 d4 r2 e4 d4 ' +
    'r4 e f e4 c4 r4 c d c4 d4 r4 e f g4 e4 r4 d e f4 d4 ' +
    'r4 e f a4 f4 r4 d e g4 e4 r4 c d e4 g4 e2 c2;',
  '@2 t150 q60 v82 o2 l2 ' +
    'a a e e f f c c a a e e g g e e ' +
    'f f c c g g d d a a f f g g a e;',
  '@3 t150 q50 v58 o3 l2 ' +
    '[o3ao4co4e]2 [o3ao4co4e]2 [o3fo3ao4c]2 [o3fo3ao4c]2 [o3ao4co4e]2 [o3ao4co4e]2 [o3eo3go3b]2 [o3eo3go3b]2 ' +
    '[o3fo3ao4c]2 [o3fo3ao4c]2 [o3co3eo3g]2 [o3co3eo3g]2 [o3ao4co4e]2 [o3ao4co4e]2 [o3eo3go3b]2 [o3eo3go3b]2 ' +
    '[o3ao4co4e]2 [o3ao4co4e]2 [o3fo3ao4c]2 [o3fo3ao4c]2 [o3ao4co4e]2 [o3ao4co4e]2 [o3eo3go3b]2 [o3eo3go3b]2 ' +
    '[o3fo3ao4c]2 [o3fo3ao4c]2 [o3go3bo4d]2 [o3go3bo4d]2 [o3ao4co4e]2 [o3ao4co4e]2 [o3eo3go3b]2 [o3ao4co4e]2;',
].join('');

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
    palette: ['#a3e635', '#38bdf8', '#fbbf24', '#f472b6', '#c4b5fd'],
  },
  // イントロはロールだけの4小節。そこから「本編」に入った瞬間だけフラッシュが光り、
  // タイトル・クレジット・キャラ絵が現れて以降ずっと出続ける（参考動画の構成そのもの）。
  sections: [
    { id: 'intro', label: 'イントロ', startBar: 0 },
    { id: 'main', label: '本編', startBar: 4 },
  ],
  layers: [
    {
      kind: 'visualizer',
      id: 'roll',
      style: 'pianoRoll',
      // 参考動画はロールが画面全体を覆う。帯状に狭めると空白だらけの画面になる。
      rect: { x: 0, y: 20, w: 640, h: 320 },
      amount: 4,
      glow: true,
      z: 10,
      opacity: 0.95,
      // 3Dピアノロール（MIDITrail風）が既定。見る角度は「レイヤー」タブで調整できる。
      projection: 'perspective',
      // sections未指定＝全場面で表示。イントロから本編までロールはずっと流れ続ける。
    },
    // 「本編」に入った瞬間に一度だけ光る。sections で本編だけに絞らないと、
    // イントロの開始（0小節目）でも startBar=0 として誤発火するので注意。
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
    {
      kind: 'image',
      id: 'chara',
      ref: `url:${BUILTIN_WALK_URL}`,
      url: BUILTIN_WALK_URL,
      walk: BUILTIN_WALK,
      x: 540,
      y: 352,
      scale: 9,
      anchor: 'bottom',
      motion: 'bob',
      motionAmount: 3,
      pixelated: true,
      z: 20,
      sections: ['main'],
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
      sections: ['main'],
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
      sections: ['main'],
    },
  ],
};

export const PIANO_ROLL_PRESET: MvPresetEntry = {
  kind: 'pianoRoll',
  name: 'ピアノロール',
  description: 'イントロはロールだけ、4小節目でフラッシュしてタイトルとキャラ絵が現れる。アレンジ動画の定番構成。',
  swapHint: '背景に1枚絵を、右のキャラをあなたのドット絵に差し替えると一気に完成します。「場面」タブでフラッシュの起こる小節数を調整できます。',
  build: () => cloneManifest(MANIFEST),
};
