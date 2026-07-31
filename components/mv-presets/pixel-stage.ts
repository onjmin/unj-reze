// 「ドット絵ステージ」プリセット。
// 参考動画: _.mp4
//   イントロ = 黒地に枠付きのスプライト窓＋下部のステップ格子＋右に縦書き歌詞（残像つき）。
//   サビ     = 全画面のイラストへ切り替わり、パララックスで手前の絵が流れる。
// セクション（intro / chorus）でレイヤーを出し分けるだけで、この場面転換を再現している。
//
// 歌詞はMMLの歌詞トラック（@@0）から自動同期する。改行がそのまま行の区切りになる。

import type { MvManifest } from '@/lib/mv-config';
import { BUILTIN_WALK, BUILTIN_WALK_URL, cloneManifest, type MvPresetEntry } from './shared';

const MML = `#volume=50
@0 t128 q80 v100 o4 l4 e g a b a g e d e g a b >c< b a g e g a b a g e d c d e g a4;
@1 t128 q70 v72 o5 l8 r1 r1 e d c d e g e d c <b >c d e4 r4 r1 e d c d e g a4 g4 e2;
@2 t128 q60 v78 o2 l2 a a f f c c g g a a f f c c e e;
@3 t128 q50 v52 o3 l2 [o3ao4co4e]2 [o3ao4co4e]2 [o3fo3ao4c]2 [o3fo3ao4c]2 [o3co3eo3g]2 [o3co3eo3g]2 [o3go3bo4d]2 [o3go3bo4d]2 [o3ao4co4e]2 [o3ao4co4e]2 [o3fo3ao4c]2 [o3fo3ao4c]2 [o3co3eo3g]2 [o3co3eo3g]2 [o3eo3go3b]2 [o3eo3go3b]2;
@@0 klatt v150 とけたまちなみ
しずんだつき
そらをとんでいる
シャチのむれ`;

const MANIFEST: MvManifest = {
  version: 1,
  preset: 'pixelStage',
  title: '無題のドット絵MV',
  mml: MML,
  stage: {
    bgColor: '#000000',
    bgFit: 'cover',
    pulse: 'none',
    palette: ['#e5e7eb', '#93c5fd', '#a5b4fc', '#fbbf24', '#f9a8d4'],
  },
  sections: [
    { id: 'intro', label: 'イントロ', startBar: 0 },
    { id: 'chorus', label: 'サビ', startBar: 8 },
  ],
  layers: [
    // ── イントロ: 枠付きのスプライト窓 ─────────────────────────
    {
      kind: 'image',
      id: 'window',
      ref: `url:${BUILTIN_WALK_URL}`,
      url: BUILTIN_WALK_URL,
      walk: BUILTIN_WALK,
      x: 232,
      y: 68,
      scale: 5,
      anchor: 'topLeft',
      motion: 'none',
      pixelated: true,
      frame: { color: '#ffffff', width: 1, padding: 18 },
      sections: ['intro'],
      z: 20,
    },
    {
      kind: 'visualizer',
      id: 'grid',
      style: 'stepGrid',
      rect: { x: 214, y: 196, w: 192, h: 40 },
      amount: 8,
      thickness: 1,
      sections: ['intro'],
      z: 10,
    },
    {
      kind: 'text',
      id: 'title',
      text: '無題のドット絵MV',
      x: 24,
      y: 24,
      size: 13,
      color: '#9ca3af',
      anchor: 'topLeft',
      vertical: false,
      motion: 'none',
      sections: ['intro'],
      z: 30,
    },

    // ── サビ: 手前の絵が流れる ───────────────────────────────
    {
      kind: 'image',
      id: 'drifter',
      ref: `url:${BUILTIN_WALK_URL}`,
      url: BUILTIN_WALK_URL,
      walk: { ...BUILTIN_WALK, dir: 'd' },
      x: 0,
      y: 150,
      scale: 8,
      anchor: 'center',
      motion: 'drift',
      motionAmount: 44,
      pixelated: true,
      sections: ['chorus'],
      z: 20,
    },
    {
      kind: 'image',
      id: 'stage-chara',
      ref: `url:${BUILTIN_WALK_URL}`,
      url: BUILTIN_WALK_URL,
      walk: BUILTIN_WALK,
      x: 200,
      y: 352,
      scale: 6,
      anchor: 'bottom',
      motion: 'parallax',
      motionAmount: 8,
      pixelated: true,
      sections: ['chorus'],
      z: 22,
    },
    {
      kind: 'visualizer',
      id: 'chorus-bars',
      style: 'bars',
      rect: { x: 0, y: 300, w: 640, h: 60 },
      amount: 24,
      thickness: 3,
      opacity: 0.5,
      sections: ['chorus'],
      z: 5,
    },

    // ── 全編: 右に縦書き歌詞（残像つき） ──────────────────────
    {
      kind: 'lyrics',
      id: 'lyrics',
      source: 'mml',
      x: 592,
      y: 44,
      anchor: 'topLeft',
      size: 16,
      color: '#f3f4f6',
      vertical: true,
      afterimage: 2,
      holdBars: 2,
      z: 40,
    },
  ],
};

export const PIXEL_STAGE_PRESET: MvPresetEntry = {
  kind: 'pixelStage',
  name: 'ドット絵ステージ',
  description: '黒地にスプライト窓とステップ格子。歌詞が右から縦書きで流れ、サビで場面が切り替わる。',
  swapHint: 'サビの背景に1枚絵を足し、スプライト窓をあなたのドット絵にすると参考動画そのものになります。',
  build: () => cloneManifest(MANIFEST),
};
