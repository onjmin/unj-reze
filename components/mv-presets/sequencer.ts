// 「シーケンサ」プリセット。
// 参考動画: 次日朝夢(再現).mp4 / x0o0x_.mp4
//   真っ黒な画面の上部に大きなステップ格子が置かれ、拍ごとにマスが点灯する。
//   歌詞は縦書きで右から左へ積み上がっていき、古い行も薄く残る。
//   下部には細い線の飾りが並び、音に合わせて端から順に伸び縮みする。

import type { MvManifest } from '@/lib/mv-config';
import { BUILTIN_WALK, BUILTIN_WALK_URL, cloneManifest, type MvPresetEntry } from './shared';

const MML = `#volume=50
@0 t140 q80 v100 o4 l4 a >c< b a g a e d a >c< b >d< a g e d a >c< b a g a e g a b >c< d e2;
@1 t140 q70 v70 o5 l8 r1 r1 a g e d e g a4 r4 r1 r1 e d <b >d e g a4 r4;
@2 t140 q60 v80 o2 l2 a a f f c c g g a a f f d d e e;
@3 t140 q50 v50 o3 l2 [o3ao4co4e]2 [o3ao4co4e]2 [o3fo3ao4c]2 [o3fo3ao4c]2 [o3co3eo3g]2 [o3co3eo3g]2 [o3go3bo4d]2 [o3go3bo4d]2;
@@0 klatt v150 とおいあさのゆめ
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
    palette: ['#f9fafb', '#d1d5db', '#9ca3af', '#6b7280'],
  },
  sections: [
    { id: 'intro', label: 'イントロ', startBar: 0 },
    { id: 'main', label: '本編', startBar: 8 },
  ],
  layers: [
    // ── 上部の大きなステップ格子（2段） ─────────────────────
    {
      kind: 'visualizer',
      id: 'grid',
      style: 'stepGrid',
      rect: { x: 40, y: 40, w: 560, h: 96 },
      amount: 8,
      thickness: 2,
      z: 10,
    },

    // ── 縦書き歌詞。残像を多めにして右へ積み上げる ──────────────
    {
      kind: 'lyrics',
      id: 'lyrics',
      source: 'mml',
      // 歌詞トラックは1本だけ出す（複数あっても画面が埋まらない）
      trackId: 0,
      x: 300,
      y: 168,
      anchor: 'topLeft',
      size: 14,
      color: '#f3f4f6',
      vertical: true,
      afterimage: 4,
      holdBars: 6,
      z: 40,
    },

    // ── 下部の線の飾り。stagger で端から順に反応が伝わる ──────────
    {
      kind: 'shape',
      id: 'lines',
      form: 'bar',
      x: 60,
      y: 330,
      size: 26,
      rotation: 0,
      color: '#e5e7eb',
      filled: true,
      thickness: 1,
      count: 14,
      offsetX: 0,
      offsetY: -5,
      spread: -1.2,
      stagger: 12,
      opacity: 0.75,
      z: 20,
      modulators: [
        { source: 'trackEnergy', track: 2, target: 'size', op: 'add', amount: 46 },
        { source: 'beat', target: 'opacity', op: 'mul', amount: 1.2 },
      ],
    },

    // ── 本編でだけ出るドット絵の群れ（repeat で1レイヤーのまま増やす） ──
    {
      kind: 'image',
      id: 'crowd',
      ref: `url:${BUILTIN_WALK_URL}`,
      url: BUILTIN_WALK_URL,
      walk: { ...BUILTIN_WALK, fps: 3 },
      x: 60,
      y: 300,
      scale: 2.5,
      anchor: 'bottom',
      motion: 'none',
      pixelated: true,
      sections: ['main'],
      z: 30,
      repeat: { count: 6, dx: 34, dy: 0, scaleStep: 0, alphaStep: -0.09, phase: 0.31 },
    },

    // ── 小節頭でわずかに画面が揺れる ────────────────────────
    {
      kind: 'effect',
      id: 'kick',
      style: 'shake',
      trigger: 'note',
      tracks: [2],
      amount: 0.22,
      decayBeats: 0.3,
    },

    {
      kind: 'text',
      id: 'title',
      text: '無題のシーケンス',
      x: 40,
      y: 16,
      size: 11,
      color: '#6b7280',
      anchor: 'topLeft',
      vertical: false,
      motion: 'none',
      z: 50,
    },
  ],
};

export const SEQUENCER_PRESET: MvPresetEntry = {
  kind: 'pixelStage',
  name: 'シーケンサ',
  description: '黒地に大きなステップ格子。縦書き歌詞が右から積み上がり、下の線が音に合わせて伸び縮みする。',
  swapHint: '歌詞タブでどのトラックを出すか選べます。ドット絵は「同じ画像を並べる」で人数を増やせます。',
  build: () => cloneManifest(MANIFEST),
};
