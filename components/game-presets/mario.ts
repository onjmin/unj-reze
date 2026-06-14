import { type PresetData, newObject, ROWS } from './shared';

// gomi/games/mario.html の 1-1 を反映：横スクロールするワールドを右へ進み、谷をジャンプで越え、
// ハテナ❓・土管🟩・階段ブロックを抜けてゴール旗🚩へ。クリボー🐛・ノコノコ🐢が徘徊。
const WCOLS = 44;

export const mario: PresetData = {
  id: 'mario', name: 'マリオ', engine: 'action', gravity: 2.5, friction: 0.85,
  scroll: { worldCols: WCOLS },
  player: { emoji: '🍄', color: '#ff4444', speed: 5, jumpPower: -18, w: 24, h: 24, start: { x: 50, y: 50 } },
  tiles: {
    0: { name: '空', color: '#5c94fc', passable: true },
    1: { name: 'ブロック', color: '#8B4513', passable: false },
    2: { name: 'ハテナ', color: '#FFD700', passable: false, special: 'item' },
    3: { name: 'ゴール旗', color: '#32CD32', passable: true, special: 'goal' },
    4: { name: '土管', color: '#2aa02a', passable: false },
  },
  map: Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: WCOLS }, (_, x) => {
      if (x === WCOLS - 1 && y === ROWS - 3) return 3;                         // ゴール旗
      if (x >= WCOLS - 4 && x <= WCOLS - 2) {                                  // 旗前の階段
        const h = x - (WCOLS - 5);
        if (y <= ROWS - 3 && y >= ROWS - 2 - h) return 1;
      }
      if ((x === 9 && y >= ROWS - 4) || (x === 20 && y >= ROWS - 5) || (x === 32 && y >= ROWS - 4)) return 4; // 土管
      if ((y === ROWS - 6 && (x === 5 || x === 6 || x === 31)) || (y === ROWS - 7 && x === 18)) return 2;     // ハテナ
      if (y === ROWS - 9 && ((x >= 5 && x <= 7) || (x >= 18 && x <= 20))) return 1;                            // 空中ブロック
      if (y === ROWS - 6 && x >= 30 && x <= 33) return 1;                       // 低い足場
      const gap = (x === 13 || x === 14) || (x === 26 || x === 27) || x === 38; // 落下する谷
      if (y >= ROWS - 2) return gap ? 0 : 1;                                    // 地面
      return 0;
    })
  ),
  objects: [
    newObject({ emoji: '🐛', col: 5, row: ROWS - 3, behavior: 'patrolH', speed: 1, hazard: true, hp: 1, bullet: 'none' }),
    newObject({ emoji: '🐛', col: 18, row: ROWS - 3, behavior: 'patrolH', speed: 1, hazard: true, hp: 1, bullet: 'none' }),
    newObject({ emoji: '🐢', col: 24, row: ROWS - 3, behavior: 'patrolH', speed: 1.2, hazard: true, hp: 2, bullet: 'none' }),
    newObject({ emoji: '🐛', col: 35, row: ROWS - 3, behavior: 'patrolH', speed: 1, hazard: true, hp: 1, bullet: 'none' }),
  ],
  sfx: {},
};
