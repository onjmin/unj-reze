// 「シーケンサ」プリセット。
// 参考動画: 次日朝夢(再現).mp4 / x0o0x_.mp4
//   真っ黒な画面。上部に装飾枠つきの大きなステップ格子（2段）が置かれ、拍ごとにマスが点灯する。
//   イントロは格子だけ。歌が入ると縦書き歌詞が右から左へ「列」として積み上がり、古い列は薄く残る。
//   小節の頭では画面の左右端に白い縦帯が一瞬立つ。それ以外の飾りは何も無い（黒がいちばんの飾り）。
//   ドット絵キャラや下部の飾り線は参考動画には存在しないので置かない。

import type { MvManifest } from '@/lib/mv-config';
import { cloneManifest, type MvPresetEntry } from './shared';

const MML = `#volume=50
@0 t140 q60 v85 o3 l8 c r c c r c r r c c r c r c r r c r c c r c c r c r r c r c r r c r c c r c r r c c r c r c r r c r c c r c c r c c r c r c c r c r c c r c r r c c r c r c r r c r c c r c c r c r r c r c r r c r c c r c r r c c r c r c r r c r c c r c c r c c r c r c c r;
@1 t140 q50 v70 o3 l8 r r e r r r e r r e r r e r r r r r e r r e r r e r r r e r r e r r e r r r e r r e r r e r r r r r e r r e r r e r e r r e r r r r e r r r e r r e r r e r r r r r e r r e r r e r r r e r r e r r e r r r e r r e r r e r r r r r e r r e r r e r e r r e r r;
@2 t140 q80 v90 o2 l1 a r f r c r g r a r f r d r e r;
@3 t140 q70 v85 o4 l4 r1 r1 r1 r1 a b >c< b a g e r1 r4 g a b a g e r1 r2 a a b >c< b a g e r1 g e d e g a a r1 r4;
@@3 klatt v150 とおいあさのゆめ
まだきえない
かさなるあしおと
ひかりのなかへ`;

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
  sections: [
    { id: 'intro', label: 'イントロ', startBar: 0 },
    { id: 'main', label: '本編', startBar: 4 },
  ],
  layers: [
    // ── 上部の大きなステップ格子（2段）。@0/@1 が2つの段を受け持つ ──
    {
      kind: 'visualizer',
      id: 'grid',
      style: 'stepGrid',
      rect: { x: 40, y: 40, w: 560, h: 112 },
      tracks: [0, 1],
      amount: 8,
      thickness: 2,
      z: 10,
    },

    // ── 縦書き歌詞。@@3（ボーカル）だけを出し、古い列を右へ薄く残す ──
    {
      kind: 'lyrics',
      id: 'lyrics',
      source: 'mml',
      trackId: 3,
      x: 440,
      y: 176,
      anchor: 'topLeft',
      size: 14,
      color: '#f3f4f6',
      vertical: true,
      afterimage: 6,
      holdBars: 10,
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
  ],
};

export const SEQUENCER_PRESET: MvPresetEntry = {
  kind: 'pixelStage',
  name: 'シーケンサ',
  description: '黒地に装飾枠つきの大きなステップ格子。歌が入ると縦書き歌詞が右から列で積み上がり、小節頭に画面端の白帯が瞬く。',
  swapHint: '歌詞はMMLの歌詞トラック（@@n）から自動で同期します。格子の段数は「対象トラック」で増やせます。',
  build: () => cloneManifest(MANIFEST),
};
