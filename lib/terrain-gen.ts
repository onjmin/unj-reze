// 地形自動生成マクロの共通基盤。マイクラの地形生成と同じ「パーリンノイズ＋fBm（オクターブ合成）」で
// 標高・湿度マップを作り、内蔵RPGENマップチップ（/assets/rpgen/map.png）の地形タイルへ塗り分ける。
// 2Dエンジン用の generateTopDownTerrain / generateSideViewTerrain はここ、
// yume25d 用の generateYumeTerrain は lib/yume25d-macros.ts（マクロ置き場）にある。
import { type TileDef, localSysTileUrl } from '@/components/game-presets/shared';

/** 水の量（海面の高さ）。生成UIの「少なめ/ふつう/多め」に対応する。 */
export type TerrainWater = 'low' | 'mid' | 'high';
export const SEA_LEVEL: Record<TerrainWater, number> = { low: 0.38, mid: 0.47, high: 0.56 };

/** シード付き乱数（mulberry32）。同じシードなら同じ地形になる。 */
export const seededRandom = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 格子点ハッシュから8方向の勾配ベクトルとの内積を返す（古典パーリンノイズの grad） */
const grad = (h: number, x: number, y: number) => {
  switch (h & 7) {
    case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
    case 4: return x; case 5: return -x; case 6: return y; default: return -y;
  }
};

/** 古典パーリンノイズ（2D勾配ノイズ）。戻り値はおよそ [-1, 1]。 */
const createPerlin2D = (seed: number) => {
  const rand = seededRandom(seed);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  return (x: number, y: number): number => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    return lerp(
      lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
      lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u),
      v,
    );
  };
};

/** fBm：周波数を倍々・振幅を半々にしたノイズを重ねる（マイクラのオクターブ合成）。0〜1 に正規化して返す。 */
const createFbm01 = (seed: number, octaves = 4) => {
  const noise = createPerlin2D(seed);
  return (x: number, y: number): number => {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * freq, y * freq);
      norm += amp; amp *= 0.5; freq *= 2;
    }
    // パーリンノイズの実効レンジ（±0.7程度）で割って 0〜1 へ
    const v = sum / norm / 0.7;
    return Math.min(1, Math.max(0, (v + 1) / 2));
  };
};

/** 標高＋湿度の2枚のノイズマップ。elev01 が海/陸/山、moist01 が森の分布を決める。 */
export const createTerrainSampler = (seed: number) => ({
  elev01: createFbm01(seed),
  moist01: createFbm01((seed ^ 0x9e3779b9) >>> 0),
});

/** ノイズの1単位＝何マスか（地形の起伏の大きさ）。 */
export const TERRAIN_SCALE = 8;

// ── 内蔵RPGENマップチップの地形タイル ──────────────────────────────────
export interface TerrainChip { label: string; color: string; url: string; passable: boolean; }
const chip = (label: string, color: string, col: number, row: number, passable: boolean): TerrainChip =>
  ({ label, color, url: localSysTileUrl(col, row), passable });

/** バイオーム別のデフォルト素材。すべて /assets/rpgen/map.png の16pxグリッドから切り出す。 */
export const TERRAIN_CHIPS = {
  deep: chip('深い海', '#1b4e78', 0, 7, false),
  water: chip('海', '#3f9fdc', 4, 3, false),
  sand: chip('砂浜', '#e9d8a6', 9, 1, true),
  grass: chip('草原', '#8fd14f', 7, 0, true),
  forest: chip('森', '#3e9b3e', 15, 2, true),
  mountain: chip('山', '#8d8d8d', 6, 8, false),
  // 横視点（action）用の地中ブロック。ぜんぶ足場（通行不可＝壁）として使う
  grassBlock: chip('草ブロック', '#8fd14f', 7, 0, false),
  dirt: chip('土', '#b5652d', 5, 12, false),
  stone: chip('岩盤', '#7f8a94', 12, 11, false),
} as const;
export type TerrainKind = keyof typeof TERRAIN_CHIPS;

/** 地形タイルを tiles に確保する。同じ切り出しURL＋通行設定のタイルが既にあれば再利用し、
 *  無ければ新規追加する（再生成してもタイルが増殖しない）。 */
const ensureTerrainTiles = (tiles: Record<number, TileDef>, kinds: TerrainKind[]) => {
  const out = { ...tiles };
  let nextId = Math.max(0, ...Object.keys(out).map(Number)) + 1;
  const ids = {} as Record<TerrainKind, number>;
  for (const k of kinds) {
    const c = TERRAIN_CHIPS[k];
    const found = Object.entries(out).find(([, t]) =>
      !t.special && t.imageRef === `url:${c.url}` && t.passable === c.passable);
    if (found) ids[k] = Number(found[0]);
    else {
      out[nextId] = { name: c.label, color: c.color, passable: c.passable, imageRef: `url:${c.url}`, imageUrl: c.url };
      ids[k] = nextId++;
    }
  }
  return { tiles: out, ids };
};

/** 見下ろし型（rpg / onjReze）の地形生成。標高で 深い海→海→砂浜→草原→山、湿度で森を塗り分ける。
 *  下層(地面)レイヤーだけを丸ごと描き替え、スタート周辺3×3は草原に均す。 */
export const generateTopDownTerrain = (
  map: number[][], tiles: Record<number, TileDef>,
  startCol: number, startRow: number, seed: number, water: TerrainWater,
): { map: number[][]; tiles: Record<number, TileDef> } => {
  const rows = map.length, cols = map[0]?.length ?? 0;
  const { tiles: newTiles, ids } = ensureTerrainTiles(tiles, ['deep', 'water', 'sand', 'grass', 'forest', 'mountain']);
  const { elev01, moist01 } = createTerrainSampler(seed);
  const sea = SEA_LEVEL[water];
  const newMap = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    if (Math.abs(c - startCol) <= 1 && Math.abs(r - startRow) <= 1) return ids.grass;
    const e = elev01(c / TERRAIN_SCALE, r / TERRAIN_SCALE);
    if (e < sea - 0.1) return ids.deep;
    if (e < sea) return ids.water;
    if (e < sea + 0.05) return ids.sand;
    if (e > 0.8) return ids.mountain;
    return moist01(c / TERRAIN_SCALE, r / TERRAIN_SCALE) > 0.62 ? ids.forest : ids.grass;
  }));
  return { map: newMap, tiles: newTiles };
};

/** 横視点（action）の地形生成。列ごとの地表の高さを1Dノイズで決め、
 *  地表＝草ブロック・その下2段＝土・さらに下＝岩盤で埋める（テラリア/マイクラ断面風）。
 *  スタート地点の足元は地表が来るよう均し、上空はそのまま空（タイル0）になる。 */
export const generateSideViewTerrain = (
  map: number[][], tiles: Record<number, TileDef>,
  startCol: number, startRow: number, seed: number,
): { map: number[][]; tiles: Record<number, TileDef> } => {
  const rows = map.length, cols = map[0]?.length ?? 0;
  const { tiles: newTiles, ids } = ensureTerrainTiles(tiles, ['grassBlock', 'dirt', 'stone']);
  const { elev01 } = createTerrainSampler(seed);
  // 地表の行番号（0.35〜0.85 の帯で起伏）。スタート列±1 は足元＝startRow+1 に固定する
  const tops = Array.from({ length: cols }, (_, c) => {
    const top = Math.round(rows * (0.35 + 0.5 * elev01(c / 10, 7.7)));
    return Math.min(rows - 1, Math.max(2, top));
  });
  for (let c = Math.max(0, startCol - 1); c <= Math.min(cols - 1, startCol + 1); c++) {
    tops[c] = Math.min(rows - 1, Math.max(2, startRow + 1));
  }
  const newMap = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    if (r < tops[c]) return 0;
    if (r === tops[c]) return ids.grassBlock;
    return r <= tops[c] + 2 ? ids.dirt : ids.stone;
  }));
  return { map: newMap, tiles: newTiles };
};
