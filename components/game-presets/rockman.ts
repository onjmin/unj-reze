import { type PresetData, type SceneDef, newObject, COLS, ROWS, TILE_SIZE } from './shared';

const sp  = (no: number) => `/api/rpgen/data/images/sprites/${no}.png`;
const sa  = (no: number) => `/api/rpgen/data/images/sAnims/${no}.png`;
const wr  = (no: number) => `walk:auto:u:${sa(no)}`;
const ir  = (no: number) => `url:${sp(no)}`;

// ── タイル定義 ─────────────────────────────────────────────────────────────
// sp.626 暗灰bg   (r=51,51,51)   sp.831 金属床灰  (r=116,116,116)
// sp.349 赤トゲ   (r=152,32,40)  sp.17  ゴール金黄 (r=255,232,143)
// sp.628 暗壁     (r=51,51,51)   sp.722 金属灰2   (r=136,136,144)
const tiles: PresetData['tiles'] = {
  0: { name: '空',       color: '#0d1826', passable: true,  imageRef: ir(626), imageUrl: sp(626) },
  1: { name: '鉄床',     color: '#3a4a5c', passable: false, imageRef: ir(831), imageUrl: sp(831) },
  2: { name: 'トゲ',     color: '#c03030', passable: true, special: 'trap', imageRef: ir(349), imageUrl: sp(349) },
  3: { name: 'ゴール扉', color: '#28c090', passable: true, special: 'goal', imageRef: ir(17),  imageUrl: sp(17)  },
  4: { name: '壁',       color: '#202a38', passable: false, imageRef: ir(628), imageUrl: sp(628) },
};

// ── シーン1：道中 ────────────────────────────────────────────────────────────
const scene1Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (x === COLS - 1 && y === ROWS - 3) return 0;
    if (x === COLS - 1) return 4;
    if (y >= ROWS - 2) return (x >= 6 && x <= 7 ? 2 : 1);
    if (y === ROWS - 5 && (x >= 3 && x <= 5 || x >= 10 && x <= 13)) return 1;
    if (y === ROWS - 8 && (x >= 7 && x <= 9 || x >= 14 && x <= 17)) return 1;
    return 0;
  })
);

const scene1: SceneDef = {
  id: 'stage1', name: '道中 1',
  map: scene1Map,
  exits: { right: 'shaft' },
  objects: [
    // メット敵 (sa.987 特撮系シート)
    newObject({ emoji: '🪖', col: 4, row: ROWS - 3, behavior: 'walker', speed: 1.5, hazard: true, hp: 1, bullet: 'none',
      spriteRef: wr(987), spriteUrl: sa(987) }),
    newObject({ emoji: '🪖', col: 12, row: ROWS - 3, behavior: 'walker', speed: 1.6, hazard: true, hp: 1, bullet: 'none',
      spriteRef: wr(987), spriteUrl: sa(987) }),
    // 砲台 (sa.995 特撮系シート)
    newObject({ emoji: '🔫', col: 8, row: ROWS - 9, behavior: 'still', hazard: true, hp: 2,
      bullet: 'aimed', fireRate: 80, bulletSpeed: 3.5, bulletColor: '#ff6644',
      spriteRef: wr(995), spriteUrl: sa(995) }),
    // 徘徊敵 (sa.992 特撮系シート)
    newObject({ emoji: '👾', col: 16, row: ROWS - 6, behavior: 'walker', speed: 1.8, hazard: true, hp: 2,
      bullet: 'spread', fireRate: 110, bulletColor: '#ff9900', bulletSpeed: 3,
      spriteRef: wr(992), spriteUrl: sa(992) }),
  ],
};

// ── シーン2：縦シャフト ───────────────────────────────────────────────────────
const SHAFT_L = 5, SHAFT_R = 14;
const scene2Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    const inShaft = x > SHAFT_L && x < SHAFT_R;
    if ((x === SHAFT_L || x === SHAFT_R) && y < ROWS - 1) return 4;
    if (!inShaft && y >= ROWS - 2) return 1;
    if (!inShaft && y < ROWS - 2) return 4;
    if (inShaft && y === Math.floor(ROWS / 2)) return 1;
    return 0;
  })
);

const scene2: SceneDef = {
  id: 'shaft', name: '縦シャフト',
  map: scene2Map,
  exits: { left: 'stage1', down: 'stage2' },
  objects: [
    // 固定砲台 (sa.995)
    newObject({ emoji: '🕷️', col: 9, row: 3, behavior: 'still', hazard: true, hp: 1,
      bullet: 'aimed', fireRate: 100, bulletSpeed: 2.5, bulletColor: '#ff9900',
      spriteRef: wr(1020), spriteUrl: sa(1020) }),
    newObject({ emoji: '🕷️', col: 7, row: Math.floor(ROWS / 2) + 2, behavior: 'still', hazard: true, hp: 1,
      bullet: 'aimed', fireRate: 90, bulletSpeed: 2.5, bulletColor: '#ff9900',
      spriteRef: wr(1020), spriteUrl: sa(1020) }),
  ],
};

// ── シーン3：ボス部屋 ────────────────────────────────────────────────────────
const scene3Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (x === COLS - 1) return 4;
    if (x === COLS - 2 && y === ROWS - 3) return 3;
    if (y >= ROWS - 2) return (x >= 7 && x <= 8 || x >= 14 && x <= 15 ? 2 : 1);
    if (y === ROWS - 5 && (x >= 3 && x <= 5 || x >= 10 && x <= 12)) return 1;
    if (y === ROWS - 8 && x >= 15 && x <= 18) return 1;
    return 0;
  })
);

const scene3: SceneDef = {
  id: 'stage2', name: 'ボス部屋',
  map: scene3Map,
  exits: { up: 'shaft' },
  objects: [
    newObject({ emoji: '🪖', col: 4, row: ROWS - 3, behavior: 'walker', speed: 1.7, hazard: true, hp: 1, bullet: 'none',
      spriteRef: wr(987), spriteUrl: sa(987) }),
    newObject({ emoji: '👾', col: 11, row: ROWS - 3, behavior: 'walker', speed: 1.9, hazard: true, hp: 2,
      bullet: 'spread', fireRate: 100, bulletColor: '#ff9900', bulletSpeed: 3,
      spriteRef: wr(992), spriteUrl: sa(992) }),
    newObject({ emoji: '🔫', col: 16, row: ROWS - 9, behavior: 'still', hazard: true, hp: 2,
      bullet: 'aimed', fireRate: 75, bulletSpeed: 3.2, bulletColor: '#ff6644',
      spriteRef: wr(995), spriteUrl: sa(995) }),
    // カットマンボス (sa.2114 特撮系最新=高精細メカ)
    newObject({
      emoji: '✂️', col: COLS - 4, row: ROWS - 3,
      behavior: 'walker', speed: 1.5, hazard: true,
      hp: 28, bullet: 'spread', fireRate: 55, bulletSpeed: 3.5, bulletColor: '#ff2222',
      isBoss: true, name: 'カットマン',
      spriteRef: wr(2114), spriteUrl: sa(2114),
      outroDialogue: [
        { speaker: 'カットマン', emoji: '✂️', text: 'ぐおっ……やられた……！' },
        { speaker: 'ロック',     emoji: '🤖', text: 'ワイリー博士のもとへはいかせない！' },
      ],
    }),
  ],
};

export const rockman: PresetData = {
  id: 'rockman', name: 'ロックマン', engine: 'action', gravity: 0.55, friction: 0.78,
  player: {
    emoji: '🤖', color: '#1e90ff', speed: 3.5, jumpPower: -11, w: 22, h: 24,
    start: { x: TILE_SIZE * 1, y: TILE_SIZE * (ROWS - 4) },
    // 特撮系シート sa.997
    spriteRef: wr(997), spriteUrl: sa(997),
  },
  tiles,
  map: JSON.parse(JSON.stringify(scene1Map)),
  objects: [...scene1.objects],
  scenes: [scene1, scene2, scene3],
  sfx: {
    shot: { ref: 'shot' }, jump: { ref: 'jump' },
    clear: { ref: 'clear' }, damage: { ref: 'damage' },
  },
};
