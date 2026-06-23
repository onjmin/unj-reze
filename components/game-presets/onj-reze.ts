import { type PresetData, newObject, TILE_SIZE } from './shared';

const sp  = (no: number) => `/api/rpgen/data/images/sprites/${no}.png`;
const sa  = (no: number) => `/api/rpgen/data/images/sAnims/${no}.png`;
const wr  = (no: number) => `walk:auto:u:${sa(no)}`;
const ir  = (no: number) => `url:${sp(no)}`;

// ── タイル定義 ─────────────────────────────────────────────────────────────
// sp.95  草地 (r=164,g=205,b=65)   sp.102 石壁 (r=155,155,155)
// sp.371 暗壁 (r=50,45,50)         sp.349 罠赤 (r=152,32,40)
// sp.126 道   (r=128,160,64)
const W = 48, H = 42;
const GROUND = 0, WALL = 1, BARRICADE = 2, TRAP = 3, PATH = 4;

function buildMap(): number[][] {
  const m: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => GROUND));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x === 0 || x === W - 1 || y === 0 || y === H - 1) m[y][x] = WALL;
  }
  for (let x = 1; x < W - 1; x++) if (!(x >= 22 && x <= 25)) m[6][x] = WALL;
  for (let x = 22; x <= 25; x++) m[6][x] = PATH;
  const barricades: [number, number][] = [
    [6, 12], [14, 10], [30, 9], [40, 14], [10, 22], [19, 20], [36, 24],
    [8, 32], [18, 34], [30, 34], [42, 30], [14, 26], [34, 28],
  ];
  for (const [bx, by] of barricades) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const x = bx + dx, y = by + dy;
    if (x > 0 && x < W - 1 && y > 6 && y < H - 1) m[y][x] = BARRICADE;
  }
  const traps: [number, number][] = [
    [10, 16], [34, 18], [16, 30], [40, 36], [6, 26], [30, 12],
  ];
  for (const [tx, ty] of traps) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) {
    const x = tx + dx, y = ty + dy;
    if (x > 0 && x < W - 1 && y > 6 && y < H - 1) m[y][x] = TRAP;
  }
  for (let y = 8; y < H - 1; y++) if (y % 3 === 0) for (let x = 23; x <= 24; x++) if (m[y][x] === GROUND) m[y][x] = PATH;
  return m;
}

export const onjReze: PresetData = {
  id: 'onjReze', name: 'おんｊレゼ', engine: 'onjReze', gravity: 0, friction: 0,
  scroll: { worldCols: W, worldRows: H },
  onjReze: { territory: true, paint: true },
  player: {
    emoji: '🧨', color: '#ff5c7a', speed: 3, jumpPower: 0, w: 24, h: 24,
    hearts: 5,
    start: { x: TILE_SIZE * 24, y: TILE_SIZE * 39 },
    // 女の子セット先頭 sa.130
    spriteRef: wr(130), spriteUrl: sa(130),
  },
  tiles: {
    [GROUND]:    { name: '陣地',         color: '#1f3a26', passable: true,  imageRef: ir(95),  imageUrl: sp(95)  },
    [WALL]:      { name: '壁',           color: '#5a6b8a', passable: false, imageRef: ir(102), imageUrl: sp(102) },
    [BARRICADE]: { name: 'バリケード',   color: '#46465e', passable: false, imageRef: ir(371), imageUrl: sp(371) },
    [TRAP]:      { name: '首爆弾の罠',   color: '#b5391a', passable: true, special: 'trap', imageRef: ir(349), imageUrl: sp(349) },
    [PATH]:      { name: 'ONJ占領地',   color: '#2f5a3a', passable: true,  imageRef: ir(126), imageUrl: sp(126) },
  },
  map: buildMap(),
  objects: [
    // スライム (sa.556 とうすこスライム)
    newObject({ emoji: '🟢', name: 'スライム', col: 5, row: 38, behavior: 'patrolH', speed: 1, hp: 1, atk: 8, hazard: true, bullet: 'none',
      spriteRef: wr(556), spriteUrl: sa(556) }),
    newObject({ emoji: '🟢', name: 'スライム', col: 44, row: 37, behavior: 'random', speed: 1.1, hp: 1, atk: 8, hazard: true, bullet: 'none',
      spriteRef: wr(556), spriteUrl: sa(556) }),
    // ゴースト (sa.478 悪いもの達シート)
    newObject({ emoji: '👻', name: 'ゴースト', col: 12, row: 36, behavior: 'chase', speed: 1.4, hp: 2, atk: 8, hazard: true, bullet: 'none',
      spriteRef: wr(478), spriteUrl: sa(478) }),
    newObject({ emoji: '👻', name: 'ゴースト', col: 38, row: 33, behavior: 'chase', speed: 1.3, hp: 2, atk: 8, hazard: true, bullet: 'none',
      spriteRef: wr(478), spriteUrl: sa(478) }),
    // 首爆弾 (sa.979 悪いもの達最高番号=強敵)
    newObject({ emoji: '💀', name: '首爆弾', col: 26, row: 32, behavior: 'still', speed: 0, hp: 1, atk: 24, hazard: true, bullet: 'aimed', fireRate: 130, bulletSpeed: 2.4, bulletColor: '#ff7a2a',
      spriteRef: wr(979), spriteUrl: sa(979) }),
    // 中央エリア
    newObject({ emoji: '🟢', name: 'スライム', col: 20, row: 24, behavior: 'patrolH', speed: 1.1, hp: 1, atk: 8, hazard: true, bullet: 'none',
      spriteRef: wr(556), spriteUrl: sa(556) }),
    newObject({ emoji: '👻', name: 'ゴースト', col: 40, row: 22, behavior: 'chase', speed: 1.4, hp: 2, atk: 8, hazard: true, bullet: 'none',
      spriteRef: wr(478), spriteUrl: sa(478) }),
    newObject({ emoji: '💣', name: '爆弾魔', col: 8, row: 18, behavior: 'still', speed: 0, hp: 2, atk: 8, hazard: true, bullet: 'aimed', fireRate: 120, bulletSpeed: 2.6, bulletColor: '#ffd84d',
      spriteRef: wr(812), spriteUrl: sa(812) }),
    newObject({ emoji: '💀', name: '首爆弾', col: 44, row: 16, behavior: 'still', speed: 0, hp: 1, atk: 24, hazard: true, bullet: 'aimed', fireRate: 135, bulletSpeed: 2.4, bulletColor: '#ff7a2a',
      spriteRef: wr(979), spriteUrl: sa(979) }),
    newObject({ emoji: '👻', name: 'ゴースト', col: 24, row: 18, behavior: 'random', speed: 1.2, hp: 2, atk: 8, hazard: true, bullet: 'none',
      spriteRef: wr(478), spriteUrl: sa(478) }),
    // 北エリア
    newObject({ emoji: '👻', name: 'ゴースト', col: 16, row: 12, behavior: 'patrolH', speed: 1.3, hp: 2, atk: 8, hazard: true, bullet: 'none',
      spriteRef: wr(478), spriteUrl: sa(478) }),
    newObject({ emoji: '🟢', name: 'スライム', col: 33, row: 10, behavior: 'random', speed: 1.1, hp: 1, atk: 8, hazard: true, bullet: 'none',
      spriteRef: wr(556), spriteUrl: sa(556) }),
    newObject({ emoji: '💣', name: '爆弾魔', col: 6, row: 9, behavior: 'still', speed: 0, hp: 2, atk: 8, hazard: true, bullet: 'aimed', fireRate: 115, bulletSpeed: 2.7, bulletColor: '#ffd84d',
      spriteRef: wr(812), spriteUrl: sa(812) }),
    newObject({ emoji: '💀', name: '首爆弾', col: 41, row: 9, behavior: 'still', speed: 0, hp: 1, atk: 24, hazard: true, bullet: 'aimed', fireRate: 125, bulletSpeed: 2.5, bulletColor: '#ff7a2a',
      spriteRef: wr(979), spriteUrl: sa(979) }),
    // 大将部屋
    newObject({ emoji: '💀', name: '首爆弾', col: 19, row: 3, behavior: 'still', speed: 0, hp: 1, atk: 24, hazard: true, bullet: 'aimed', fireRate: 110, bulletSpeed: 2.6, bulletColor: '#ff7a2a',
      spriteRef: wr(979), spriteUrl: sa(979) }),
    newObject({ emoji: '💀', name: '首爆弾', col: 29, row: 3, behavior: 'still', speed: 0, hp: 1, atk: 24, hazard: true, bullet: 'aimed', fireRate: 110, bulletSpeed: 2.6, bulletColor: '#ff7a2a',
      spriteRef: wr(979), spriteUrl: sa(979) }),
    newObject({
      emoji: '☠️', name: '爆魔王', col: 24, row: 3,
      behavior: 'patrolH', speed: 1.2, hp: 8, atk: 24, hazard: true,
      bullet: 'spread', fireRate: 90, bulletSpeed: 2.6, bulletColor: '#ff5030',
      isBoss: true,
      spriteRef: wr(768), spriteUrl: sa(768),
      outroDialogue: [
        { speaker: '爆魔王', emoji: '☠️', text: 'ぐおおっ……ONJ ごときに……占領されるとは……！' },
        { speaker: '束音レゼ', emoji: '🧨', text: 'この陣地はぜんぶ ONJ のもの。占領率100%、いただきっ♪' },
      ],
    }),
  ],
  bgm: { ref: 'bgm', src: 'https://www.youtube.com/watch?v=0_jEpB40aYw', type: 'youtube' },
  sfx: {
    shot: { ref: 'shot' },
    clear: { ref: 'clear' },
    damage: { ref: 'damage' },
  },
};
