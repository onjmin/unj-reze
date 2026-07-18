// 内蔵アセット（リポジトリ assets/ 由来のスプライトシート）。
// scripts/slice-rpg-assets.mjs が public/assets/ へ出力したものを参照する。
//
// - タイルセット: 16pxグリッドのシートを `url:<url>#sx,sy,16,16` クロップ参照で1マスずつ使う
//   （mario プリセットの SMC タイルと同じ仕組み。GameMaker がフラグメントを解釈して切り出す）。
// - キャラ: assets/rpgen/char.png（rpgen.org の DQ 風シート）をキャラごとに RPGEN 歩行規格
//   （16px・2フレーム×4方向 = 32x64）へ詰め直したもの。walk:rpgen:u:<url> でアニメーションする。

export interface LocalTileSection {
  /** このセクションの見出し行（0始まり、sheet.tile px単位）。この行自体は見出しバナーで実タイルではない。 */
  row: number;
  label: string;
}

export interface LocalTileSheet {
  id: string;
  name: string;
  url: string;
  /** 1マスの px */
  tile: number;
  cols: number;
  rows: number;
  /**
   * シート画像に焼き込まれた「▼見出し」バナー行の一覧（作者による区分け）。
   * Base.png のみ、8列全幅・高さ14/16pxの半透明バー+オレンジ文字という一貫した意匠で
   * 区切られており、機械的に検出→目視で確認して書き起こしたもの（誤検知の道具アイコン行・
   * 模様タイル行は除外済み）。row はバナー自体の行なので、picker のタイル一覧からは除外し、
   * ジャンプリンクの飛び先はその直後の実タイル行にする。
   */
  sections?: LocalTileSection[];
  /**
   * 走査順を「行優先（左上→右へ、次の行…）」ではなく「列ブロック優先」にする幅（マス数）。
   * 例: 30列のシートに幅6を指定すると、列0-5を全行分down方向に並べてから列6-11…と進む。
   * rpgen-map / reze-field は関連する素材が縦の列ブロックにまとまって配置されているため、
   * 行優先で読むと無関係な素材が交互に混ざって見える。列ブロック優先にすると同じまとまりが
   * 連続して並ぶ。
   */
  scanBlockWidth?: number;
  /**
   * true の場合、列ブロック内の1行（scanBlockWidth 個のマス）が全てピクセル完全一致のとき、
   * その行ごと非表示にする（プレースホルダー化）。reze-field の右側にある巨大な白い予約領域など、
   * 同一チップが横並びで埋め尽くされているだけの行を picker から除く。
   */
  hideIdenticalBlockRows?: boolean;
  /** true の場合「もっと見る」によるページネーションをせず、最初から全マスを表示する。 */
  showAllAtOnce?: boolean;
}

// レゼ ベースチップ（ウディタ規格）の見出しバナー行。assets/rpg-reze/Base.png に実在。
const REZE_BASE_SECTIONS: LocalTileSection[] = [
  { row: 0, label: '仮設置用' },
  { row: 3, label: '地面' },
  { row: 5, label: '木・地面装飾' },
  { row: 14, label: '崖' },
  { row: 25, label: '畑' },
  { row: 29, label: '柵' },
  { row: 36, label: '橋・看板' },
  { row: 45, label: '床・階段' },
  { row: 54, label: '家・壁・屋根' },
  { row: 85, label: '壁装飾' },
  { row: 94, label: '店看板' },
  { row: 97, label: 'カウンター・カーテン' },
  { row: 103, label: '家具' },
  { row: 122, label: '置物' },
  { row: 135, label: '小物' },
  { row: 148, label: '小物　位置微調整用' },
  { row: 161, label: 'ダン　床・壁・階段' },
  { row: 186, label: 'ダン　装飾' },
  { row: 195, label: '雪　木・地面装飾' },
  { row: 202, label: '雪　崖' },
  { row: 210, label: '雪　柵' },
  { row: 217, label: '雪　橋・看板' },
  { row: 229, label: '雪　屋根・テント' },
  { row: 236, label: '雪　店看板・置物' },
  { row: 248, label: '破壊　地面・床用' },
  { row: 252, label: '破壊　壁用' },
  { row: 259, label: '破壊　畑・看板' },
  { row: 264, label: '破壊　窓・壁装飾' },
  { row: 269, label: '破壊　家具' },
  { row: 278, label: '破壊　置物' },
  { row: 287, label: '破壊　小物' },
];

export const LOCAL_TILE_SHEETS: LocalTileSheet[] = [
  { id: 'rpgen-map', name: 'RPGEN マップチップ', url: '/assets/rpgen/map.png', tile: 16, cols: 30, rows: 16, scanBlockWidth: 6, showAllAtOnce: true },
  { id: 'reze-field', name: 'レゼ フィールド', url: '/assets/rpg-reze/field.png', tile: 16, cols: 30, rows: 16, scanBlockWidth: 6, hideIdenticalBlockRows: true, showAllAtOnce: true },
  { id: 'reze-base', name: 'レゼ ベースチップ', url: '/assets/rpg-reze/Base.png', tile: 16, cols: 8, rows: 652, sections: REZE_BASE_SECTIONS },
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
