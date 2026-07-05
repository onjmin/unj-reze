// 内蔵アセット（リポジトリ assets/ 由来のスプライトシート）。
// scripts/slice-rpg-assets.mjs が public/assets/ へ出力したものを参照する。
//
// - タイルセット: 16pxグリッドのシートを `url:<url>#sx,sy,16,16` クロップ参照で1マスずつ使う
//   （mario プリセットの SMC タイルと同じ仕組み。GameMaker がフラグメントを解釈して切り出す）。
// - キャラ: assets/rpgen/char.png（rpgen.org の DQ 風シート）をキャラごとに RPGEN 歩行規格
//   （16px・2フレーム×4方向 = 32x64）へ詰め直したもの。walk:rpgen:u:<url> でアニメーションする。

export interface LocalTileSheet {
  id: string;
  name: string;
  url: string;
  /** 1マスの px */
  tile: number;
  cols: number;
  rows: number;
}

export const LOCAL_TILE_SHEETS: LocalTileSheet[] = [
  { id: 'rpgen-map', name: 'RPGEN マップチップ', url: '/assets/rpgen/map.png', tile: 16, cols: 30, rows: 16 },
  { id: 'reze-field', name: 'レゼ フィールド', url: '/assets/rpg-reze/field.png', tile: 16, cols: 30, rows: 16 },
  { id: 'reze-base', name: 'レゼ ベースチップ', url: '/assets/rpg-reze/Base.png', tile: 16, cols: 8, rows: 652 },
];

/** タイル1マスのクロップ付き URL（imageUrl / `url:` 参照の中身）。 */
export function localTileUrl(sheet: LocalTileSheet, col: number, row: number): string {
  return `${sheet.url}#${col * sheet.tile},${row * sheet.tile},${sheet.tile},${sheet.tile}`;
}

export interface LocalWalkChar {
  surface: number;
  name: string;
  url: string;
}

const dqChar = (surface: number, slug: string, name: string): LocalWalkChar => ({
  surface,
  name,
  url: `/assets/rpgen/char/${String(surface).padStart(2, '0')}-${slug}.png`,
});

// surface 番号と名前は @rpgja/rpgen-map の DQAnimationSpriteSurface に準拠
export const DQ_CHARACTERS: LocalWalkChar[] = [
  dqChar(0, 'hero', '勇者'),
  dqChar(8, 'princess', '姫'),
  dqChar(20, 'king', '王様'),
  dqChar(18, 'soldier-a', '兵士A'),
  dqChar(1, 'soldier-b', '兵士B'),
  dqChar(6, 'warrior-a', '戦士A'),
  dqChar(12, 'warrior-b', '戦士B'),
  dqChar(2, 'merchant', '商人'),
  dqChar(7, 'weapon-merchant', '武器商人'),
  dqChar(13, 'armor-merchant', '防具商人'),
  dqChar(14, 'man-a', '男A'),
  dqChar(16, 'man-b', '男B'),
  dqChar(9, 'woman-a', '女A'),
  dqChar(11, 'woman-b', '女B'),
  dqChar(15, 'woman-c', '女C'),
  dqChar(17, 'woman-d', '女D'),
  dqChar(3, 'elderly-a', '老人A'),
  dqChar(5, 'elderly-b', '老人B'),
  dqChar(10, 'elderly-c', '老人C'),
  dqChar(4, 'child', '子供'),
  dqChar(21, 'bhikkhuni', '尼'),
  dqChar(19, 'extra-19', 'その他'),
];
