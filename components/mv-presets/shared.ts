import type { MvManifest, MvPresetKind } from '@/lib/mv-config';

/** プリセット1件。build() は毎回コピーを返す（プリセット定義を編集で壊さないため）。 */
export interface MvPresetEntry {
  kind: MvPresetKind;
  name: string;
  /** どんな絵になるかの一行説明（プリセット選択UIに出す） */
  description: string;
  /** 差し替えを促したい素材の案内。空なら素材ゼロで完成している。 */
  swapHint?: string;
  build: () => MvManifest;
}

/** 内蔵のRPGEN歩行グラ（16px・2フレーム×4方向）。プリセットの仮キャラに使う。 */
export const BUILTIN_WALK_URL = '/assets/rpgen/char/00-hero.png';
export const BUILTIN_WALK = { stdId: 'rpgen', dir: 's' as const, fps: 4 };

/** 横一列に並べる用の内蔵キャラ。lib/local-assets.ts の DQ_CHARACTERS と同じ実体。 */
export const DQ_CAST = [
  '/assets/rpgen/char/00-hero.png',
  '/assets/rpgen/char/09-woman-a.png',
  '/assets/rpgen/char/04-child.png',
  '/assets/rpgen/char/02-merchant.png',
  '/assets/rpgen/char/11-woman-b.png',
];

export function cloneManifest(m: MvManifest): MvManifest {
  return JSON.parse(JSON.stringify(m)) as MvManifest;
}
