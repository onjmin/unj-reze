// ゆめにっき3D（Buildエンジン風 2.5D）プリセット。
// マップの実体は layout25d（床グリッド＋薄板壁＋ビルボード）で、既存の map/tiles は使わない。
import {
  type PresetData, type Layout25D, type Wall25D, type Billboard25D, type Dir4,
  normalizeWall25D, TILE_SIZE, COLS, ROWS,
} from './shared';

const YCOLS = 16, YROWS = 16;

const W = (col: number, row: number, dir: Dir4, tex: number): Wall25D => normalizeWall25D(col, row, dir, tex);

const walls: Wall25D[] = [];
// 外周（ゆめレンガ）
for (let c = 0; c < YCOLS; c++) { walls.push(W(c, 0, 0, 10), W(c, YROWS - 1, 2, 10)); }
for (let r = 0; r < YROWS; r++) { walls.push(W(0, r, 3, 10), W(YCOLS - 1, r, 1, 10)); }
// くろいしの部屋（左上）。南側の1マスだけ入口を開ける
for (let c = 2; c <= 5; c++) { walls.push(W(c, 2, 0, 11)); if (c !== 3) walls.push(W(c, 5, 2, 11)); }
for (let r = 2; r <= 5; r++) { walls.push(W(2, r, 3, 11), W(5, r, 1, 11)); }
// ちのかべの回廊（右下）
for (let r = 8; r <= 12; r++) { walls.push(W(11, r, 3, 12), W(13, r, 1, 12)); }
walls.push(W(11, 8, 0, 12), W(12, 8, 0, 12), W(13, 8, 0, 12));

// 床：むらさき一面 ＋ 参道（あかい小道）＋ 部屋・回廊はくらい床
const floor: number[][] = Array.from({ length: YROWS }, (_, r) =>
  Array.from({ length: YCOLS }, (_, c) => {
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) return 2;
    if (c >= 11 && c <= 13 && r >= 8 && r <= 12) return 2;
    if ((c === 7 || c === 8) && r >= 2 && r <= 13) return 3;
    return 1;
  })
);

// RPGen の歩行グラ素材（walk: 参照でシート分割され、足踏みアニメする）。
const SANIM = 'https://rpgen-search.pages.dev/data/images/sAnims';
const SHIROIKO_URL = `${SANIM}/jkAwdz.png`;   // 白い少女
const ONRYO_URL = `${SANIM}/qoc3wW.png`;      // 怨霊
const AKAIKO_URL = `${SANIM}/jkswZA.png`;     // 赤い少女（プレイヤー）

const billboards: Billboard25D[] = [
  // あかい小道の参道：とりいのトンネル
  { id: 'bb-torii1', col: 7, row: 3, tex: 20, scale: 1.4 },
  { id: 'bb-torii2', col: 8, row: 3, tex: 20, scale: 1.4 },
  { id: 'bb-torii3', col: 7, row: 6, tex: 20, scale: 1.4 },
  { id: 'bb-torii4', col: 8, row: 6, tex: 20, scale: 1.4 },
  { id: 'bb-torii5', col: 7, row: 9, tex: 20, scale: 1.4 },
  { id: 'bb-torii6', col: 8, row: 9, tex: 20, scale: 1.4 },
  { id: 'bb-moai', col: 7, row: 7, tex: 24, scale: 1.2, interactive: true, message: 'せきぞうは だまって こちらをみている。' },
  { id: 'bb-door', col: 8, row: 1, tex: 25, scale: 1, interactive: true, message: 'どこかへつづく ドア。\nあけてみる？', choices: ['あける', 'やめておく'] },
  { id: 'bb-lan1', col: 6, row: 5, tex: 21, scale: 0.8 },
  { id: 'bb-lan2', col: 9, row: 5, tex: 21, scale: 0.8 },
  { id: 'bb-lan3', col: 6, row: 10, tex: 21, scale: 0.8 },
  { id: 'bb-lan4', col: 9, row: 10, tex: 21, scale: 0.8 },
  { id: 'bb-eye1', col: 3, row: 3, tex: 22, scale: 0.9, interactive: true, message: 'めが あなたを みつめている。\nまばたきを しない。' },
  { id: 'bb-eye2', col: 12, row: 10, tex: 22, scale: 0.9, interactive: true, message: 'めが あなたを みつめている。\nまばたきを しない。' },
  { id: 'bb-tree1', col: 1, row: 1, tex: 23, scale: 1.3 },
  { id: 'bb-tree2', col: 14, row: 1, tex: 23, scale: 1.3 },
  { id: 'bb-tree3', col: 1, row: 14, tex: 23, scale: 1.3 },
  { id: 'bb-tree4', col: 14, row: 14, tex: 23, scale: 1.3 },
  { id: 'bb-tree5', col: 3, row: 11, tex: 23, scale: 1.3 },
  { id: 'bb-tree6', col: 12, row: 4, tex: 23, scale: 1.3 },
  // 住人（歩行グラNPC。ビルボードなので常にこちらを向き、その場で足踏みする）
  { id: 'bb-shiroiko', col: 4, row: 4, tex: 26, scale: 0.9, interactive: true, message: 'ゆめのなかで あったこと、\nおきたら わすれてしまうのかな。', choices: ['わすれないよ', '……'] },
  { id: 'bb-onryo', col: 12, row: 12, tex: 27, scale: 0.95, interactive: true, message: 'カエレ……　カエレ……\nココハ　オマエノ　バショデハナイ……' },
];

const layout25d: Layout25D = {
  cols: YCOLS, rows: YROWS,
  floor,
  ceiling: false,
  ceilingTex: 13,
  walls,
  billboards,
  textures: {
    1: { id: 1, name: 'むらさきの床', kind: 'floor', color: '#4a3566' },
    2: { id: 2, name: 'くらい床', kind: 'floor', color: '#221b33' },
    3: { id: 3, name: 'あかい小道', kind: 'floor', color: '#5d2a3a' },
    10: { id: 10, name: 'ゆめレンガ', kind: 'wall', color: '#6b4a7a' },
    11: { id: 11, name: 'くろいし', kind: 'wall', color: '#33314f' },
    12: { id: 12, name: 'ちのかべ', kind: 'wall', color: '#5a2233' },
    13: { id: 13, name: 'よぞら天井', kind: 'wall', color: '#191430' },
    20: { id: 20, name: 'とりい', kind: 'sprite', color: '#c04040', emoji: '⛩️' },
    21: { id: 21, name: 'とうろう', kind: 'sprite', color: '#d08030', emoji: '🏮' },
    22: { id: 22, name: 'め', kind: 'sprite', color: '#e0e0f0', emoji: '👁️' },
    23: { id: 23, name: 'き', kind: 'sprite', color: '#2c6b3f', emoji: '🌲' },
    24: { id: 24, name: 'せきぞう', kind: 'sprite', color: '#8a8a99', emoji: '🗿' },
    25: { id: 25, name: 'ドア', kind: 'sprite', color: '#7a5230', emoji: '🚪' },
    26: { id: 26, name: 'しろいこ', kind: 'sprite', color: '#e8e8f4', emoji: '👧', imageRef: `walk:auto:u:${SHIROIKO_URL}`, imageUrl: SHIROIKO_URL },
    27: { id: 27, name: 'おんりょう', kind: 'sprite', color: '#4f6fd8', emoji: '👻', imageRef: `walk:auto:u:${ONRYO_URL}`, imageUrl: ONRYO_URL },
  },
  wallHeight: 1,
  skyColor: '#0b0714',
  fogColor: '#150d20',
  fogNear: 2,
  fogFar: 12,
  start: { col: 8, row: 13, dir: 0 },
  pov: 'third',
  povDistance: 1.6,
};

export const yume: PresetData = {
  id: 'yume',
  name: 'ゆめのせかい',
  engine: 'yume25d',
  gravity: 0,
  friction: 0,
  player: {
    emoji: '🌙', color: '#b9a6e8', speed: 2, jumpPower: 0, w: 24, h: 24,
    start: { x: TILE_SIZE * 8, y: TILE_SIZE * 13 },
    // RPGen「赤い少女」歩行グラ。三人称視点で向き・足踏みがアニメする（絵文字はロード失敗時の予備）。
    spriteRef: `walk:auto:u:${AKAIKO_URL}`, spriteUrl: AKAIKO_URL,
  },
  tiles: { 0: { name: 'なし', color: '#000000', passable: true } },
  map: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
  objects: [],
  sfx: {},
  layout25d,
};
