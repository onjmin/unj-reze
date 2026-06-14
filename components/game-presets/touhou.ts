import { type PresetData, newObject, COLS, ROWS, PLAY_W, PLAY_H } from './shared';

// gomi/games/touhou.html を反映：自機🎀で弾幕を避けつつ、雑魚妖精🧚を抜けてボス👸を撃破。
// 狙い弾・拡散・回転（スペルカード）の弾幕パターンを敵ごとに配置。
export const touhou: PresetData = {
  id: 'touhou', name: '東方(弾幕)', engine: 'touhou', gravity: 0, friction: 0,
  player: { emoji: '🎀', color: '#ff0000', speed: 4.5, jumpPower: 0, w: 24, h: 24, start: { x: PLAY_W / 2 - 12, y: PLAY_H - 60 } },
  tiles: {
    0: { name: '夜空', color: '#0B0B2A', passable: true },
    1: { name: '壁', color: '#444466', passable: false },
  },
  map: Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => (x === 0 || x === COLS - 1 ? 1 : 0))
  ),
  objects: [
    newObject({ emoji: '🧚', col: 3, row: 2, behavior: 'patrolH', speed: 0.8, hp: 5, bullet: 'aimed', fireRate: 60, bulletColor: '#00ffff', bulletSpeed: 2.5 }),
    newObject({ emoji: '🧚', col: 16, row: 2, behavior: 'patrolH', speed: 0.8, hp: 5, bullet: 'aimed', fireRate: 60, bulletColor: '#00ffff', bulletSpeed: 2.5 }),
    newObject({ emoji: '🧚', col: 7, row: 4, behavior: 'patrolV', speed: 0.6, hp: 5, bullet: 'spread', fireRate: 80, bulletColor: '#ff88ff', bulletSpeed: 2 }),
    newObject({ emoji: '🧚', col: 12, row: 4, behavior: 'patrolV', speed: 0.6, hp: 5, bullet: 'spread', fireRate: 80, bulletColor: '#ff88ff', bulletSpeed: 2 }),
    newObject({ emoji: '👸', col: 10, row: 1, behavior: 'patrolH', speed: 0.9, hp: 120, bullet: 'spiral', fireRate: 6, bulletColor: '#ff4444', bulletSpeed: 2.8 }),
  ],
  sfx: {},
};
