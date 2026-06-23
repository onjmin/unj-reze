import { type PresetData, type SceneDef, newObject, COLS, ROWS } from './shared';

const sp  = (no: number) => `/api/rpgen/data/images/sprites/${no}.png`;
const sa  = (no: number) => `/api/rpgen/data/images/sAnims/${no}.png`;
const wr  = (no: number) => `walk:auto:u:${sa(no)}`;
const ir  = (no: number) => `url:${sp(no)}`;

// ── タイル定義 ─────────────────────────────────────────────────────────────
// sp.342 茶金ブロック (r=197,g=148,b=58)   sp.158 ?ブロック金橙 (r=251,170,80)
// sp.377 濃緑パイプ  (r=34,g=98,b=5)       sp.17  目標/旗 (r=255,232,143)
// sp.362 暖石床     (r=140,134,120)         sp.121 地下石床 (r=144,128,112)
const tiles: PresetData['tiles'] = {
  0: { name: '空',      color: '#5c94fc', passable: true  },                                          // 空：スプライト不要
  1: { name: 'ブロック', color: '#8B4513', passable: false, imageRef: ir(342), imageUrl: sp(342) },
  2: { name: 'ハテナ',  color: '#FFD700', passable: false, special: 'item', imageRef: ir(158), imageUrl: sp(158) },
  3: { name: 'ゴール旗', color: '#32CD32', passable: true, special: 'goal', imageRef: ir(17),  imageUrl: sp(17)  },
  4: { name: '土管',    color: '#2aa02a', passable: false, imageRef: ir(377), imageUrl: sp(377) },
  5: { name: '岩床',    color: '#555566', passable: false, imageRef: ir(362), imageUrl: sp(362) },  // 地下天井/岩
};

// ── シーン1：地上ステージ ────────────────────────────────────────────────────
const WCOLS = 36;
const scene1Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: WCOLS }, (_, x) => {
    if (x === WCOLS - 1 && y === ROWS - 3) return 3;
    if (x >= WCOLS - 4 && x <= WCOLS - 2) {
      const h = x - (WCOLS - 5);
      if (y <= ROWS - 3 && y >= ROWS - 2 - h) return 1;
    }
    if ((x === 9 && y >= ROWS - 4) || (x === 20 && y >= ROWS - 5)) return 4;
    if ((y === ROWS - 6 && (x === 5 || x === 6)) || (y === ROWS - 7 && x === 15)) return 2;
    if (y === ROWS - 9 && (x >= 5 && x <= 7 || x >= 15 && x <= 17)) return 1;
    const gap = (x === 13 || x === 14) || (x === 26 || x === 27) || x === 32;
    if (y >= ROWS - 2) return gap ? 0 : 1;
    return 0;
  })
);

const scene1: SceneDef = {
  id: 'overworld', name: '地上ステージ',
  map: scene1Map,
  objects: [
    // クリボー (sa.91 任天堂シート2番目)
    newObject({ emoji: '🐛', col: 5, row: ROWS - 3, behavior: 'patrolH', speed: 1, hazard: true, hp: 1, bullet: 'none',
      spriteRef: wr(91), spriteUrl: sa(91) }),
    newObject({ emoji: '🐛', col: 18, row: ROWS - 3, behavior: 'patrolH', speed: 1, hazard: true, hp: 1, bullet: 'none',
      spriteRef: wr(91), spriteUrl: sa(91) }),
    // ノコノコ (sa.92 任天堂シート3番目)
    newObject({ emoji: '🐢', col: 24, row: ROWS - 3, behavior: 'walker', speed: 1.2, hazard: true, hp: 2, bullet: 'none',
      spriteRef: wr(92), spriteUrl: sa(92) }),
    // 土管ワープ→地下
    newObject({ emoji: '🪣', col: 9, row: ROWS - 5, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'underground', warpEntryCol: 2, warpEntryRow: ROWS - 4 }),
    newObject({ emoji: '🪣', col: 20, row: ROWS - 6, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'underground2', warpEntryCol: 2, warpEntryRow: ROWS - 4 }),
  ],
};

// ── シーン2：地下ステージ1 ────────────────────────────────────────────────────
const scene2Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (y <= 1) return 5;
    if (y >= ROWS - 2) return 5;
    if (x >= COLS - 3 && x <= COLS - 2 && y >= ROWS - 4) return 4;
    if (y === ROWS - 5 && x >= 3 && x <= 7) return 5;
    if (y === ROWS - 7 && x >= 10 && x <= 14) return 5;
    if (y === ROWS - 9 && x >= 7 && x <= 11) return 1;
    if (y === ROWS - 6 && (x === 5 || x === 12)) return 2;
    return 0;
  })
);

const scene2: SceneDef = {
  id: 'underground', name: '地下ステージ1',
  map: scene2Map,
  objects: [
    // 地下の敵 (sa.93 任天堂シート4番目)
    newObject({ emoji: '🐀', col: 5, row: ROWS - 3, behavior: 'patrolH', speed: 1.2, hazard: true, hp: 1, bullet: 'none',
      spriteRef: wr(93), spriteUrl: sa(93) }),
    newObject({ emoji: '🐀', col: 13, row: ROWS - 3, behavior: 'patrolH', speed: 1.4, hazard: true, hp: 1, bullet: 'none',
      spriteRef: wr(93), spriteUrl: sa(93) }),
    newObject({ emoji: '🪣', col: COLS - 3, row: ROWS - 5, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'overworld', warpEntryCol: 10, warpEntryRow: ROWS - 3 }),
  ],
};

// ── シーン3：秘密の地下ステージ ─────────────────────────────────────────────
const scene3Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (y <= 1) return 5;
    if (y >= ROWS - 2) return 5;
    if (x >= COLS - 3 && x <= COLS - 2 && y >= ROWS - 4) return 4;
    if (y === ROWS - 5 && x % 3 === 0 && x > 1 && x < COLS - 4) return 2;
    if (y === ROWS - 8 && x % 4 === 1 && x > 1 && x < COLS - 4) return 2;
    if (y === ROWS - 6 && x >= 4 && x <= 8) return 5;
    if (y === ROWS - 6 && x >= 12 && x <= 16) return 5;
    return 0;
  })
);

const scene3: SceneDef = {
  id: 'underground2', name: '秘密の地下ステージ',
  map: scene3Map,
  objects: [
    newObject({ emoji: '🪣', col: COLS - 3, row: ROWS - 5, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'overworld', warpEntryCol: 21, warpEntryRow: ROWS - 3 }),
  ],
};

export const mario: PresetData = {
  id: 'mario', name: 'マリオ', engine: 'action', gravity: 2.5, friction: 0.85,
  player: {
    emoji: '🍄', color: '#ff4444', speed: 5, jumpPower: -18, w: 24, h: 24,
    start: { x: 50, y: 50 },
    // 任天堂キャラシート先頭 (sa.90)
    spriteRef: wr(90), spriteUrl: sa(90),
  },
  tiles,
  map: JSON.parse(JSON.stringify(scene1Map)),
  objects: [...scene1.objects],
  scenes: [scene1, scene2, scene3],
  sfx: {},
};
