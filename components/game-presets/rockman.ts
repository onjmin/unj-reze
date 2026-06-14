import { type PresetData, newObject, ROWS } from './shared';

// gomi/games/ROCKMAN.html を反映：横スクロールするステージを右へ進み、トゲのピット⚡を飛び越え、
// 足場を渡ってボス（カットマン✂️）の先のゴール扉へ。雑魚はメット🪖/砲台🔫/ピコピコ👾。
const WCOLS = 40;

export const rockman: PresetData = {
  id: 'rockman', name: 'ロックマン', engine: 'action', gravity: 0.6, friction: 0.8,
  scroll: { worldCols: WCOLS },
  player: { emoji: '🤖', color: '#1e90ff', speed: 4, jumpPower: -12, w: 24, h: 24, start: { x: 50, y: 50 } },
  tiles: {
    0: { name: '空', color: '#0b1633', passable: true },
    1: { name: '鉄床', color: '#5a6a7a', passable: false },
    2: { name: 'トゲ', color: '#cf3030', passable: true, special: 'trap' },
    3: { name: 'ゴール扉', color: '#30cfa0', passable: true, special: 'goal' },
  },
  map: Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: WCOLS }, (_, x) => {
      if (x >= WCOLS - 3 && x <= WCOLS - 2 && y === ROWS - 3) return 3;        // ゴール扉
      const pit = (x === 10 || x === 11) || (x === 22 || x === 23);            // トゲのピット
      if (y === ROWS - 1) return pit ? 2 : 1;                                  // 最下段（ピットはトゲ）
      if (y === ROWS - 2) return pit ? 0 : 1;                                  // 地面
      if (y === ROWS - 5 && ((x >= 7 && x <= 9) || (x >= 19 && x <= 21) || (x >= 30 && x <= 33))) return 1; // 中段の足場
      if (y === ROWS - 8 && ((x >= 14 && x <= 16) || (x >= 26 && x <= 28))) return 1;                       // 上段の足場
      return 0;
    })
  ),
  objects: [
    newObject({ emoji: '🪖', col: 8, row: ROWS - 6, behavior: 'patrolH', speed: 1.5, hazard: true, hp: 1, bullet: 'none' }),
    newObject({ emoji: '🔫', col: 15, row: ROWS - 9, behavior: 'still', speed: 0, hazard: true, hp: 2, bullet: 'aimed', fireRate: 80, bulletSpeed: 4, bulletColor: '#ff6644' }),
    newObject({ emoji: '🔫', col: 20, row: ROWS - 6, behavior: 'still', speed: 0, hazard: true, hp: 2, bullet: 'aimed', fireRate: 90, bulletSpeed: 3.5, bulletColor: '#ff6644' }),
    newObject({ emoji: '👾', col: 31, row: ROWS - 6, behavior: 'patrolH', speed: 1.8, hazard: true, hp: 2, bullet: 'spread', fireRate: 100, bulletColor: '#ff9900' }),
    newObject({ emoji: '✂️', col: 36, row: ROWS - 3, behavior: 'patrolH', speed: 1.2, hazard: true, hp: 20, bullet: 'spread', fireRate: 60, bulletSpeed: 3.5, bulletColor: '#ff2222' }),
  ],
  sfx: {},
};
