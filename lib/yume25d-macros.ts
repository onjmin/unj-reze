// yume25d（ゆめにっき3D）のマクロ：マップ一括編集の定型操作。
// すべて Layout25D → Layout25D の純関数で、Yume25DEditorPanel のマクロパネルから呼ぶ。
// 新しいマクロを増やすときは、ここへ純関数を追加してパネル側にUIを足す。
import { type Layout25D, type Tex25D, uid } from '@/components/game-presets/shared';
import {
  TERRAIN_CHIPS, TERRAIN_SCALE, SEA_LEVEL, type TerrainWater,
  createTerrainSampler, seededRandom,
} from '@/lib/terrain-gen';

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

// ── 地形自動生成（マイクラのパーリンノイズ地形の yume25d 版） ────────────────
// 床を 海→砂浜→草原 に塗り分け、標高の高いマスは草ブロック（special:'block'＝上に乗れて
// 1段までよじ登れる立方体）を積んで丘にする。森は🌲ビルボードをまばらに立てる。

/** マクロが管理するテクスチャの見つけ方（再生成でテクスチャ/ビルボードが増殖しないための同定条件）。 */
const findTerrainTex = (l: Layout25D, want: 'water' | 'sand' | 'grass' | 'block' | 'tree'): Tex25D | undefined =>
  Object.values(l.textures).find(t => {
    if (want === 'block') return t.kind === 'sprite' && t.special === 'block' && t.imageUrl === TERRAIN_CHIPS.grass.url;
    if (want === 'tree') return t.kind === 'sprite' && !t.special && !t.imageUrl && !t.modelUrl && t.emoji === '🌲';
    return t.kind === 'floor' && !t.special && t.imageUrl === TERRAIN_CHIPS[want].url;
  });

/** マクロ：パーリンノイズ地形を生成して床・ブロック・木を丸ごと描き替える。
 *  スタート周辺3×3は草原の平地に均す。マクロ管理外のビルボード（NPC等）はそのまま残る。 */
export const generateYumeTerrain = (l: Layout25D, seed: number, water: TerrainWater): Layout25D => {
  // 1) 地形テクスチャを確保（既存があれば再利用）
  const textures = { ...l.textures };
  let nextId = Math.max(0, ...Object.keys(textures).map(Number)) + 1;
  const ensure = (want: 'water' | 'sand' | 'grass' | 'block' | 'tree'): number => {
    const found = findTerrainTex({ ...l, textures }, want);
    if (found) return found.id;
    const id = nextId++;
    if (want === 'tree') textures[id] = { id, name: '木', kind: 'sprite', color: '#3e9b3e', emoji: '🌲' };
    else if (want === 'block') {
      const c = TERRAIN_CHIPS.grass;
      textures[id] = { id, name: '草ブロック', kind: 'sprite', color: c.color, emoji: '🧱', special: 'block', imageRef: `url:${c.url}`, imageUrl: c.url };
    } else {
      const c = TERRAIN_CHIPS[want];
      textures[id] = { id, name: c.label, kind: 'floor', color: c.color, imageRef: `url:${c.url}`, imageUrl: c.url };
    }
    return id;
  };
  const texWater = ensure('water'), texSand = ensure('sand'), texGrass = ensure('grass');
  const texBlock = ensure('block'), texTree = ensure('tree');

  // 2) 前回生成した地形ビルボード（草ブロック・木）を除去してから積み直す
  const billboards = l.billboards.filter(b => b.tex !== texBlock && b.tex !== texTree);

  // 3) ノイズマップ → 床の塗り分け＋ブロックの積み上げ＋木
  const { elev01, moist01 } = createTerrainSampler(seed);
  const sea = SEA_LEVEL[water];
  const floor = Array.from({ length: l.rows }, (_, r) => Array.from({ length: l.cols }, (_, c) => {
    if (Math.abs(c - l.start.col) <= 1 && Math.abs(r - l.start.row) <= 1) return texGrass;
    const e = elev01(c / TERRAIN_SCALE, r / TERRAIN_SCALE);
    if (e < sea) return texWater;
    if (e < sea + 0.05) return texSand;
    return texGrass;
  }));
  for (let r = 0; r < l.rows; r++) {
    for (let c = 0; c < l.cols; c++) {
      if (Math.abs(c - l.start.col) <= 1 && Math.abs(r - l.start.row) <= 1) continue;  // スタート周辺は平地
      const e = elev01(c / TERRAIN_SCALE, r / TERRAIN_SCALE);
      if (e < sea + 0.05) continue;  // 海と砂浜には積まない
      // 標高で 0〜3 段の丘（ブロックは level 0 から h-1 まで積む）
      const h = e > 0.86 ? 3 : e > 0.76 ? 2 : e > 0.66 ? 1 : 0;
      for (let lv = 0; lv < h; lv++) {
        billboards.push({ id: uid(), col: c, row: r, tex: texBlock, ...(lv > 0 ? { level: lv } : {}) });
      }
      // 湿度が高い草地は森：まばらに🌲を立てる（丘の上にも乗る）
      const isForest = moist01(c / TERRAIN_SCALE, r / TERRAIN_SCALE) > 0.62;
      const treeRand = seededRandom((seed ^ (c * 73856093) ^ (r * 19349663)) >>> 0)();
      if (isForest && treeRand < 0.35) {
        billboards.push({ id: uid(), col: c, row: r, tex: texTree, scale: 1.4, ...(h > 0 ? { level: h } : {}) });
      }
    }
  }
  return { ...l, textures, floor, billboards };
};
