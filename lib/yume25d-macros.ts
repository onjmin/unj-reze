// yume25d（ゆめにっき3D）のマクロ：マップ一括編集の定型操作。
// すべて Layout25D → Layout25D の純関数で、Yume25DEditorPanel のマクロパネルから呼ぶ。
// 新しいマクロを増やすときは、ここへ純関数を追加してパネル側にUIを足す。
import { type Layout25D, type Tex25D, type Billboard25D, uid } from '@/components/game-presets/shared';
import {
  TERRAIN_CHIPS, TERRAIN_SCALE, type TerrainStyle,
  createStyledElevation, createCaveSampler, createFbm01, seededRandom,
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
// 「基準の床＝いちばん低い地面（海底）」として、標高マップぶんブロック（special:'block'＝
// 上に乗れて1段までよじ登れる立方体）を積み上げ、waterLevel（グローバル水面）を海面に使う。
// これで海底の起伏（泳いで潜れる海）と山の両方が1枚の高さマップで表現できる。
// 洞窟は3Dパーリンノイズ2本の交差（マイクラのスパゲッティ洞窟）で柱の途中をくり抜く。
// ブロックの当たり判定は高さ範囲で判定される（blockSolidAt）ため、くり抜いたトンネルは通行できる。

/** マクロが管理するテクスチャ種。再生成でテクスチャ/ビルボードが増殖しないよう同定条件を固定する。 */
type YumeTerrainTexKind =
  | 'floorGrass' | 'floorSand' | 'floorStone'                                  // 基準床（平原/海底/洞窟床）
  | 'blockGrass' | 'blockDirt' | 'blockStone' | 'blockSand' | 'blockSnow'      // 積み上げブロック
  | 'tree';                                                                    // 🌲ビルボード

const YUME_TERRAIN_TEX_DEFS: Record<Exclude<YumeTerrainTexKind, 'tree'>, { chip: keyof typeof TERRAIN_CHIPS; name: string; block: boolean }> = {
  floorGrass: { chip: 'grass', name: '草原', block: false },
  floorSand: { chip: 'sand', name: '砂地', block: false },
  floorStone: { chip: 'stone', name: '岩場', block: false },
  blockGrass: { chip: 'grass', name: '草ブロック', block: true },
  blockDirt: { chip: 'dirt', name: '土ブロック', block: true },
  blockStone: { chip: 'stone', name: '石ブロック', block: true },
  blockSand: { chip: 'sand', name: '砂ブロック', block: true },
  blockSnow: { chip: 'snow', name: '雪ブロック', block: true },
};

const findYumeTerrainTex = (textures: Record<number, Tex25D>, want: YumeTerrainTexKind): Tex25D | undefined =>
  Object.values(textures).find(t => {
    if (want === 'tree') return t.kind === 'sprite' && !t.special && !t.imageUrl && !t.modelUrl && t.emoji === '🌲';
    const d = YUME_TERRAIN_TEX_DEFS[want];
    return d.block
      ? t.kind === 'sprite' && t.special === 'block' && t.imageUrl === TERRAIN_CHIPS[d.chip].url
      : t.kind === 'floor' && !t.special && t.imageUrl === TERRAIN_CHIPS[d.chip].url;
  });

/** 地形生成のオプション。cols/rows/maxHeight が XYZ の数値指定（マップは自動で拡張/縮小される）。 */
export interface YumeTerrainOptions {
  seed: number;
  /** X：マップの列数（4〜48）。現在のマップサイズと違えば自動でリサイズする。 */
  cols: number;
  /** Y：マップの行数（4〜48）。 */
  rows: number;
  /** Z：地形の最大の高さ（ブロック段数 1〜8）。 */
  maxHeight: number;
  /** 海面の高さ（段数）。none=0（水なし）/ low=1 / mid=2 / high=3。海面より低い地形は海底になる。 */
  water: 'none' | 'low' | 'mid' | 'high';
  /** 生成手法（地形タイプ）。 */
  style: TerrainStyle;
  /** 洞窟をくり抜くか。 */
  caves: boolean;
}

const YUME_SEA_BLOCKS: Record<YumeTerrainOptions['water'], number> = { none: 0, low: 1, mid: 2, high: 3 };

/** マクロ：パーリンノイズ地形（海底〜山、洞窟つき）を生成して床・ブロック・木を丸ごと描き替える。
 *  スタート周辺3×3は海面の高さ（水なしなら地面）の平地に均す。マクロ管理外のビルボード（NPC等）や
 *  壁はそのまま残る（マップ縮小時にはみ出したものだけ削除）。 */
export const generateYumeTerrain = (l: Layout25D, opts: YumeTerrainOptions): Layout25D => {
  const cols = Math.max(4, Math.min(48, Math.round(opts.cols)));
  const rows = Math.max(4, Math.min(48, Math.round(opts.rows)));
  const S = Math.min(YUME_SEA_BLOCKS[opts.water], 3);
  const Z = Math.max(S + 1, Math.min(8, Math.round(opts.maxHeight)));  // 海面より高い陸地を必ず作れる高さに
  const seed = opts.seed >>> 0;

  // 1) マップの自動拡張/縮小（設定パネルのリサイズと同じ整合処理）
  const start = { ...l.start, col: Math.min(l.start.col, cols - 1), row: Math.min(l.start.row, rows - 1) };
  const walls = l.walls.filter(w =>
    w.col >= 0 && w.col <= cols - (w.dir === 3 ? 0 : 1) &&
    w.row >= 0 && w.row <= rows - (w.dir === 0 ? 0 : 1));

  // 2) 地形テクスチャを確保（既存があれば再利用）
  const textures = { ...l.textures };
  let nextId = Math.max(0, ...Object.keys(textures).map(Number)) + 1;
  const ensure = (want: YumeTerrainTexKind): number => {
    const found = findYumeTerrainTex(textures, want);
    if (found) return found.id;
    const id = nextId++;
    if (want === 'tree') {
      textures[id] = { id, name: '木', kind: 'sprite', color: '#3e9b3e', emoji: '🌲' };
    } else {
      const d = YUME_TERRAIN_TEX_DEFS[want];
      const c = TERRAIN_CHIPS[d.chip];
      textures[id] = d.block
        ? { id, name: d.name, kind: 'sprite', color: c.color, emoji: '🧱', special: 'block', imageRef: `url:${c.url}`, imageUrl: c.url }
        : { id, name: d.name, kind: 'floor', color: c.color, imageRef: `url:${c.url}`, imageUrl: c.url };
    }
    return id;
  };
  const tex = {
    floorGrass: ensure('floorGrass'), floorSand: ensure('floorSand'), floorStone: ensure('floorStone'),
    blockGrass: ensure('blockGrass'), blockDirt: ensure('blockDirt'), blockStone: ensure('blockStone'),
    blockSand: ensure('blockSand'), blockSnow: ensure('blockSnow'), tree: ensure('tree'),
  };
  const managedBlockTex = new Set([tex.blockGrass, tex.blockDirt, tex.blockStone, tex.blockSand, tex.blockSnow, tex.tree]);

  // 3) 前回生成した地形ビルボードを除去し、マップ外にはみ出したものも落とす
  const billboards: Billboard25D[] = l.billboards.filter(b =>
    !managedBlockTex.has(b.tex) && b.col < cols && b.row < rows);

  // 4) 標高マップ（0〜Z 段）。ノイズは0.5付近に集中する釣鐘分布なので、そのまま高さに割ると
  //    海（低地）がほとんど出ない。海面閾値 seaFrac で海底（0〜S-1）と陸（S〜Z）に分けて
  //    それぞれのレンジへ引き伸ばすことで、水の量どおりの海と深さのある海底を作る。
  //    スタート周辺3×3は海面の高さの平地に均す（水があれば砂浜になる）
  const elev = createStyledElevation(seed, opts.style);
  const moist01 = createFbm01((seed ^ 0x517cc1b7) >>> 0);
  const inStartArea = (c: number, r: number) => Math.abs(c - start.col) <= 1 && Math.abs(r - start.row) <= 1;
  const seaFrac = { none: 0, low: 0.3, mid: 0.45, high: 0.6 }[opts.water];
  const hFromE = (e: number): number => {
    if (S === 0) return Math.round(e * Z);
    if (e < seaFrac) return Math.floor((e / seaFrac) * S);
    return S + Math.round(((e - seaFrac) / (1 - seaFrac)) * (Z - S));
  };
  const heights: number[][] = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    if (inStartArea(c, r)) return S;
    const e = elev(c / TERRAIN_SCALE, r / TERRAIN_SCALE, (c + 0.5) / cols, (r + 0.5) / rows);
    return Math.max(0, Math.min(Z, hFromE(e)));
  }));

  // 5) 柱ごとの実体マップ（solid）。洞窟は海面より上の段だけくり抜く（水没洞窟の混乱を避ける）
  const cave = opts.caves ? createCaveSampler(seed) : null;
  const solid: boolean[][][] = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    const h = heights[r][c];
    return Array.from({ length: h }, (_, lv) => {
      if (!cave || inStartArea(c, r) || lv < S) return true;
      return !cave(c / 5.5, lv / 3.5, r / 5.5);
    });
  }));
  const isSolid = (c: number, r: number, lv: number): boolean => {
    if (lv < 0) return true;                                     // 床下：下面は見えない
    if (c < 0 || c >= cols || r < 0 || r >= rows) return true;   // マップ外周：外から見えない
    return solid[r][c][lv] ?? false;
  };

  // 6) 床の塗り分け：柱がある所は岩場（洞窟の底）、海底は砂、平原は草
  const floor = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    if (heights[r][c] > 0) return tex.floorStone;
    return S > 0 ? tex.floorSand : tex.floorGrass;
  }));

  // 7) ブロックの配置。6方向すべて塞がれた埋没ブロックは描画も判定も不要なので置かない
  //    （プレイヤーは到達できない。これでブロック数＝ほぼ表面積になり大マップでも軽い）
  const snowLine = Math.max(S + 4, Z);  // これ以上の高さの頂上は雪化粧
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const col = solid[r][c];
      let topSolid = -1;
      for (let lv = col.length - 1; lv >= 0; lv--) if (col[lv]) { topSolid = lv; break; }
      for (let lv = 0; lv < col.length; lv++) {
        if (!col[lv]) continue;
        const buried =
          isSolid(c, r, lv + 1) && isSolid(c, r, lv - 1) &&
          isSolid(c - 1, r, lv) && isSolid(c + 1, r, lv) &&
          isSolid(c, r - 1, lv) && isSolid(c, r + 1, lv);
        if (buried && lv !== topSolid) continue;
        // テクスチャ：頂上は 草（水中なら砂・高山なら雪）、浅い地中は土、深部は石
        const isTop = lv === topSolid;
        const depth = topSolid - lv;
        const t =
          isTop && lv + 1 <= S ? tex.blockSand
          : isTop && lv + 1 >= snowLine && Z >= 4 ? tex.blockSnow
          : isTop ? tex.blockGrass
          : depth <= 2 ? tex.blockDirt
          : tex.blockStone;
        billboards.push({ id: uid(), col: c, row: r, tex: t, ...(lv > 0 ? { level: lv } : {}) });
      }
      // 8) 森：湿度の高い陸地にまばらに🌲（頂上の1段上に立つ）。海中・雪山・スタート周辺には生えない
      const topY = topSolid + 1;
      const isLand = topY > S && topY < snowLine;
      const isForest = moist01(c / TERRAIN_SCALE, r / TERRAIN_SCALE) > 0.62;
      const treeRand = seededRandom((seed ^ (c * 73856093) ^ (r * 19349663)) >>> 0)();
      if (isLand && isForest && !inStartArea(c, r) && treeRand < 0.3) {
        billboards.push({ id: uid(), col: c, row: r, tex: tex.tree, scale: 1.4, ...(topY > 0 ? { level: topY } : {}) });
      }
    }
  }

  return {
    ...l, cols, rows, start, walls, textures, floor, billboards,
    // ブロックは wallHeight に関係なく1マス角で積まれるため、木の足元やビルボードの段が
    // ブロックの上面とそろうよう壁の高さを1.0に合わせる
    wallHeight: 1,
    // 海面：ブロック頂面よりわずかに下げて、海面ちょうどの高さの陸（砂浜）が濡れないようにする
    waterLevel: S > 0 ? S - 0.15 : undefined,
    waterColor: l.waterColor ?? '#2f7fa8',
  };
};
