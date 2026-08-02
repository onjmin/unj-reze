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

/** 内蔵のプリセット用画像。静止画をデフォルトとする。 */
export const DEFAULT_IMAGE_URL = '/icon-192.png';

/** 横一列に並べる用の内蔵キャラ。 */
export const DQ_CAST = [
  '/icon-192.png',
  '/icon-192.png',
  '/icon-192.png',
  '/icon-192.png',
  '/icon-192.png',
];

export function cloneManifest(m: MvManifest): MvManifest {
  return JSON.parse(JSON.stringify(m)) as MvManifest;
}
