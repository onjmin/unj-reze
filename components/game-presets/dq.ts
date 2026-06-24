import { type PresetData, type SceneDef, newObject, COLS, ROWS, TILE_SIZE } from './shared';

// RPGen アセットURL
const sp  = (no: number) => `/api/rpgen/data/images/sprites/${no}.png`;
const sa  = (no: number) => `/api/rpgen/data/images/sAnims/${no}.png`;
const wr  = (no: number) => `walk:auto:u:${sa(no)}`;
const ir  = (no: number) => `url:${sp(no)}`;  // imageRef for tiles

// ── タイル定義 ─────────────────────────────────────────────────────────────
// sp.95  草地 (r=164,g=205,b=65)   sp.102 岩/山 (r=155,155,155)
// sp.14  水   (r=46,144,187)        sp.358 城壁白 (r=223,223,223)
// sp.377 濃森 (r=34,98,5)           sp.4   砂利床 (r=229,212,190)
// sp.371 暗壁 (r=50,45,50)          sp.151 茶ドア (r=144,72,0)
// sp.121 石床 (r=144,128,112)
const tiles: PresetData['tiles'] = {
  0: { name: '平地',    color: '#3a9a4a', passable: true,  imageRef: ir(95),  imageUrl: sp(95)  },
  1: { name: '山/岩',   color: '#6b5a3a', passable: false, imageRef: ir(102), imageUrl: sp(102) },
  2: { name: '水',      color: '#2a5acb', passable: false, imageRef: ir(14),  imageUrl: sp(14)  },
  3: { name: '竜王の城', color: '#b0b0c0', passable: true, special: 'goal', imageRef: ir(358), imageUrl: sp(358) },
  4: { name: '森',      color: '#1f5a2a', passable: false, imageRef: ir(377), imageUrl: sp(377) },
  5: { name: '石床',    color: '#5a5a6a', passable: true,  imageRef: ir(121), imageUrl: sp(121) },
  6: { name: '壁',      color: '#3a3a4a', passable: false, imageRef: ir(371), imageUrl: sp(371) },
  7: { name: '扉',      color: '#c0802a', passable: true,  imageRef: ir(151), imageUrl: sp(151) },
};

// ── シーン1：フィールド ──────────────────────────────────────────────────────
const W = 30, H = 24;
const fieldMap = Array.from({ length: H }, (_, y) =>
  Array.from({ length: W }, (_, x) => {
    if (x === 0 || x === W - 1 || y === 0 || y === H - 1) return 1;
    if (y <= 1 && x >= 14 && x <= 16) return (y === 1 && x === 15) ? 3 : 1;
    if (x >= 4 && x <= 8 && y >= 6 && y <= 9) return 2;
    if (x >= 19 && x <= 24 && y >= 12 && y <= 15) return 2;
    if (x >= 10 && x <= 12 && y >= 4 && y <= 5) return 4;
    if (x >= 22 && x <= 25 && y >= 4 && y <= 6) return 4;
    if (x >= 6 && x <= 8 && y >= 16 && y <= 18) return 4;
    if (x >= 13 && x <= 15 && y >= 10 && y <= 12) return 1;
    if (x >= 2 && x <= 3 && y >= 12 && y <= 14) return 1;
    // 村（南端）
    if (x >= 5 && x <= 6 && y === 22) return 7;
    if (x >= 3 && x <= 8 && y >= 19 && y <= 22 && !(x >= 4 && x <= 7 && y >= 20 && y <= 21)) return 6;
    // 洞窟入口
    if (x === 9 && (y === 13 || y === 14)) return 7;
    return 0;
  })
);

const scene1: SceneDef = {
  id: 'field', name: 'フィールド',
  map: fieldMap,
  objects: [
    // NPC (ドラクエ風キャラ sa.30/25 from ドラクエシート)
    newObject({ emoji: '👴', col: 6, row: 21, behavior: 'still', hazard: false, message: 'よくきたな勇者よ！竜王の城は北にある。魔物に気をつけて進むのだ！',
      spriteRef: wr(30), spriteUrl: sa(30) }),
    newObject({ emoji: '👩', col: 5, row: 20, behavior: 'still', hazard: false, message: 'フィールドを歩くと魔物が おそってくるわ。レベルを上げて城を目指して！',
      spriteRef: wr(25), spriteUrl: sa(25) }),
    // スライム (sa.556 とうすこスライムシート)
    newObject({ emoji: '🟦', name: 'スライム', col: 5, row: 16, hp: 8, atk: 7, def: 3, exp: 4,
      spriteRef: wr(556), spriteUrl: sa(556) }),
    newObject({ emoji: '🟦', name: 'スライム', col: 11, row: 17, hp: 8, atk: 7, def: 3, exp: 4,
      spriteRef: wr(556), spriteUrl: sa(556) }),
    // スライムベス (sa.662 とうすこ)
    newObject({ emoji: '🟥', name: 'スライムベス', col: 10, row: 14, hp: 11, atk: 9, def: 4, exp: 6,
      spriteRef: wr(662), spriteUrl: sa(662) }),
    // ドラキー (sa.233 ドラクエシート)
    newObject({ emoji: '🦇', name: 'ドラキー', col: 11, row: 6, hp: 14, atk: 11, def: 6, exp: 9,
      spriteRef: wr(233), spriteUrl: sa(233) }),
    newObject({ emoji: '🦇', name: 'ドラキー', col: 21, row: 7, hp: 14, atk: 11, def: 6, exp: 9,
      spriteRef: wr(233), spriteUrl: sa(233) }),
    // メーダ (sa.50 ドラクエシート)
    newObject({ emoji: '👁️', name: 'メーダ', col: 13, row: 11, hp: 24, atk: 18, def: 10, exp: 18, moves: [{ name: 'メラ', power: 14 }],
      spriteRef: wr(50), spriteUrl: sa(50) }),
    // がいこつ (sa.234 ドラクエシート)
    newObject({ emoji: '💀', name: 'がいこつ', col: 4, row: 13, hp: 30, atk: 22, def: 14, exp: 26,
      spriteRef: wr(234), spriteUrl: sa(234) }),
    // まどうし (sa.102 ドラクエシート)
    newObject({ emoji: '🧙', name: 'まどうし', col: 9, row: 8, hp: 28, atk: 18, def: 12, exp: 30, moves: [{ name: 'ギラ', power: 16 }, { name: 'ホイミ', power: 20, heal: true }],
      spriteRef: wr(102), spriteUrl: sa(102) }),
    // りゅうおう (sa.309 ドラクエシート最高番号=ボス)
    newObject({ emoji: '🐉', name: 'りゅうおう', col: 15, row: 3, behavior: 'still', hazard: true, isBoss: true,
      hp: 90, atk: 40, def: 24, exp: 200, moves: [{ name: 'はげしいほのお', power: 30 }, { name: 'ベホイミ', power: 28, heal: true }],
      spriteRef: wr(309), spriteUrl: sa(309) }),
    // 扉ワープ
    newObject({ emoji: '🚪', col: 5, row: 22, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'village', warpEntryCol: 5, warpEntryRow: ROWS - 3 }),
    newObject({ emoji: '🕳️', col: 9, row: 13, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'cave', warpEntryCol: 2, warpEntryRow: 2 }),
  ],
};

// ── シーン2：村の中 ──────────────────────────────────────────────────────────
const villageMap = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (x === 0 || x === COLS - 1 || y === 0) return 6;
    if (y === ROWS - 1) return (x >= COLS / 2 - 1 && x <= COLS / 2 + 1) ? 7 : 6;
    return 5;
  })
);

const scene2: SceneDef = {
  id: 'village', name: '村の中',
  map: villageMap,
  objects: [
    newObject({ emoji: '🏥', col: 3, row: 3, behavior: 'still', hazard: false, message: '体を休めていきなさい。HP が全回復したぞ！',
      spriteRef: wr(193), spriteUrl: sa(193) }),
    newObject({ emoji: '🧙‍♂️', col: 8, row: 5, behavior: 'still', hazard: false, message: '竜王は強い！まずレベルを上げろ！',
      spriteRef: wr(64), spriteUrl: sa(64) }),
    newObject({ emoji: '⚔️', col: 14, row: 5, behavior: 'still', hazard: false, message: 'ここには道具屋があります。',
      spriteRef: wr(207), spriteUrl: sa(207) }),
    newObject({ emoji: '👧', col: 6, row: 8, behavior: 'still', hazard: false, message: '洞窟の中には強い魔物がいるよ。でもすごいお宝もあるって！',
      spriteRef: wr(130), spriteUrl: sa(130) }),
    newObject({ emoji: '🚪', col: COLS / 2, row: ROWS - 2, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'field', warpEntryCol: 6, warpEntryRow: 22 }),
  ],
};

// ── シーン3：洞窟 ────────────────────────────────────────────────────────────
const caveMap = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1) return 1;
    if (y >= 3 && y <= 5 && x >= 1 && x <= COLS - 2) return 5;
    if (x >= 8 && x <= 10 && y >= 5 && y <= ROWS - 2) return 5;
    if (y >= ROWS - 5 && y <= ROWS - 3 && x >= 8 && x <= COLS - 2) return 5;
    return 6;
  })
);

const scene3: SceneDef = {
  id: 'cave', name: '洞窟',
  map: caveMap,
  objects: [
    newObject({ emoji: '💀', name: 'がいこつ', col: 5, row: 4, behavior: 'patrolH', hp: 30, atk: 22, def: 14, exp: 26, hazard: true,
      spriteRef: wr(234), spriteUrl: sa(234) }),
    newObject({ emoji: '🧙', name: 'まどうし', col: 15, row: 4, behavior: 'chase', hp: 28, atk: 18, def: 12, exp: 30, hazard: true, moves: [{ name: 'ギラ', power: 16 }, { name: 'ホイミ', power: 20, heal: true }],
      spriteRef: wr(102), spriteUrl: sa(102) }),
    newObject({ emoji: '👁️', name: 'メーダ', col: 9, row: 8, behavior: 'patrolV', hp: 24, atk: 18, def: 10, exp: 18, hazard: true, moves: [{ name: 'メラ', power: 14 }],
      spriteRef: wr(50), spriteUrl: sa(50) }),
    newObject({ emoji: '👑', col: COLS - 3, row: ROWS - 4, behavior: 'still', hazard: false, message: '宝箱を開けた！「ちからのたね」を手に入れた！',
      spriteRef: wr(208), spriteUrl: sa(208) }),
    newObject({ emoji: '🕳️', col: 1, row: 4, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'field', warpEntryCol: 9, warpEntryRow: 13 }),
  ],
};

// ── プリセット本体 ────────────────────────────────────────────────────────
export const dq: PresetData = {
  id: 'dq', name: 'ドラクエ', engine: 'rpg', gravity: 0, friction: 0,
  player: {
    emoji: '🧝', color: '#4444ff', speed: 3, jumpPower: 0, w: 24, h: 24,
    start: { x: TILE_SIZE * 6, y: TILE_SIZE * 21 },
    spriteRef: wr(2), spriteUrl: sa(2),
  },
  tiles,
  map: JSON.parse(JSON.stringify(fieldMap)),
  objects: [...scene1.objects],
  scenes: [scene1, scene2, scene3],
  battle: {
    playerName: '勇者',
    maxHp: 35, maxMp: 12, atk: 12, def: 6,
    moves: [
      { name: 'メラ', cost: 3, power: 14 },
      { name: 'ホイミ', cost: 4, power: 22, heal: true },
    ],
    labels: { attack: 'たたかう', move: 'じゅもん', flee: 'にげる' },
  },
  sfx: {},
};
