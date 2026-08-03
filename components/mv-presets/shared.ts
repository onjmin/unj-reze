import type { MvManifest, MvPresetKind, MvSection, MvWalkSetting } from '@/lib/mv-config';

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

// ───────────────── 内蔵の歩行グラ ─────────────────
//
// public/assets/rpgen/char/ の 32×64 シート（RPGEN規格＝16×16セル・2コマ・4方向）。
// プリセットは著作物を同梱しないので、仮素材はここのキャラだけを使う。

const CHAR_DIR = '/assets/rpgen/char';

/** 内蔵歩行グラのファイル名（差し替え前の仮キャラ）。 */
export const BUILTIN_CHARS = [
  '00-hero', '04-child', '08-princess', '09-woman-a', '02-merchant',
  '20-king', '06-warrior-a', '17-woman-d', '03-elderly-a', '16-man-b',
] as const;

/** 内蔵歩行グラの asset-ref。`MvImageLayer.ref` にそのまま入る。 */
export function charRef(name: string): string {
  return `walk:rpgen:u:${CHAR_DIR}/${name}.png`;
}

/** 内蔵歩行グラの表示URL（`MvImageLayer.url`）。 */
export function charUrl(name: string): string {
  return `${CHAR_DIR}/${name}.png`;
}

/** 内蔵歩行グラを足踏みさせる設定。向きは既定で正面。 */
export function charWalk(dir: MvWalkSetting['dir'] = 's', fps = 3): MvWalkSetting {
  return { stdId: 'rpgen', dir, fps };
}

// ───────────────── MMLの組み立て ─────────────────

/**
 * 1トラックぶんのMMLを「1要素＝1小節」の断片から組み立てる。
 *
 * 参考動画級の長さ（64小節）を1本の文字列で書くと、どこかの小節が1拍足りなくても気づけない。
 * トラック間で小節数がずれると `totalBars` が中途半端になり、後半の画面が丸ごと空になる。
 * そこで小節を配列で持ち、本数を `expectBars` と突き合わせる。
 *
 * 断片を書くときの約束:
 *   - 断片は必ず「ちょうど1小節」にする（`l8` なら8音ぶん）
 *   - オクターブは断片の中で必ず元へ戻す（`>c<` の形にする）。持ち越すと繰り返しで音程がずれる
 */
export function mvTrack(header: string, bars: string[], expectBars: number): string {
  if (process.env.NODE_ENV !== 'production' && bars.length !== expectBars) {
    console.error(`[mv-presets] "${header}" は ${expectBars} 小節のはずが ${bars.length} 小節あります`);
  }
  return `${header} ${bars.join(' ')};`;
}

/** 同じ小節の並びを n 回くり返す。 */
export function rep(n: number, ...bars: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(...bars);
  return out;
}

/** n 小節ぶんの休み。 */
export function rest(n: number): string[] {
  return new Array(n).fill('r1');
}

// ───────────────── 場面 ─────────────────

/**
 * 8小節ごとに場面を切る定型。参考動画の場面転換はどれも 4/8/16小節の周期に乗っている
 * （C.mp4 は16秒＝8小節ごと、チョウチン少女は約6.8秒＝4小節ごとにモチーフが替わる）。
 */
export function sectionsEvery(
  startBar: number,
  everyBars: number,
  defs: { id: string; label: string; section?: Partial<MvSection> }[],
): MvSection[] {
  return defs.map((def, i) => ({
    id: def.id,
    label: def.label,
    startBar: startBar + everyBars * i,
    ...def.section,
  }));
}

export function cloneManifest(m: MvManifest): MvManifest {
  return JSON.parse(JSON.stringify(m)) as MvManifest;
}
