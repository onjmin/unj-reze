// yume25d（ゆめにっき3D）のマクロ：マップ一括編集の定型操作。
// すべて Layout25D → Layout25D の純関数で、Yume25DEditorPanel のマクロパネルから呼ぶ。
// 新しいマクロを増やすときは、ここへ純関数を追加してパネル側にUIを足す。
import type { Layout25D } from '@/components/game-presets/shared';

/** マクロの対象グループ（同じテクスチャ＝同じ見た目のスプライト/3Dモデルのまとまり）。 */
export interface BillboardGroup {
  tex: number;
  name: string;
  emoji?: string;
  count: number;
}

/** 配置済みビルボードをテクスチャ別に集計する（マクロの「対象グループ」一覧）。 */
export const billboardGroups = (l: Layout25D): BillboardGroup[] => {
  const counts = new Map<number, number>();
  for (const b of l.billboards) counts.set(b.tex, (counts.get(b.tex) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tex, count]) => ({ tex, name: l.textures[tex]?.name ?? `#${tex}`, emoji: l.textures[tex]?.emoji, count }))
    .sort((a, b) => a.tex - b.tex);
};

/** グループ全員が (dc, dr) マス・dlv 段の平行移動でマップ内（高さ0以上）に収まるか。 */
export const canShiftGroup = (l: Layout25D, tex: number, dc: number, dr: number, dlv = 0): boolean => {
  const members = l.billboards.filter(b => b.tex === tex);
  if (!members.length) return false;
  return members.every(b => {
    const c = b.col + dc, r = b.row + dr, lv = (b.level ?? 0) + dlv;
    return c >= 0 && c < l.cols && r >= 0 && r < l.rows && lv >= 0;
  });
};

/** マクロ：同じテクスチャのビルボード全員を (dc, dr) マス・dlv 段だけ平行移動する。
 *  1体でもマップ外（高さは0未満）へ出る移動は、グループの形を崩さないため何もしない。 */
export const shiftBillboardGroup = (l: Layout25D, tex: number, dc: number, dr: number, dlv = 0): Layout25D => {
  if (!canShiftGroup(l, tex, dc, dr, dlv)) return l;
  return {
    ...l,
    billboards: l.billboards.map(b => {
      if (b.tex !== tex) return b;
      const lv = (b.level ?? 0) + dlv;
      return { ...b, col: b.col + dc, row: b.row + dr, level: lv > 0 ? lv : undefined };
    }),
  };
};
