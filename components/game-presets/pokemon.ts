import { type PresetData, newObject, TILE_SIZE } from './shared';

// gomi/games/pokemon.html を反映：上下左右スクロールする草むらルートを抜けてジムへ。
// 戦闘は草むら🌿の野生ポケモンとのシンボルエンカウント、ジムでジムリーダーのイワークとボス戦。
const W = 28, H = 22;

export const pokemon: PresetData = {
  id: 'pokemon', name: 'ポケモン', engine: 'rpg', gravity: 0, friction: 0,
  scroll: { worldCols: W, worldRows: H },
  player: { emoji: '🧢', color: '#e03030', speed: 3, jumpPower: 0, w: 24, h: 24, start: { x: TILE_SIZE * 3, y: TILE_SIZE * 19 } },
  tiles: {
    0: { name: '道', color: '#c8b88a', passable: true },
    1: { name: '木', color: '#1f6b2f', passable: false },
    2: { name: '草むら', color: '#5fbf5f', passable: true, special: 'grass' },
    3: { name: 'ジム', color: '#9a5ad0', passable: true, special: 'goal' },
  },
  map: Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      if (x === 0 || x === W - 1 || y === 0 || y === H - 1) return 1;     // 外周は木
      if (y <= 2 && x >= 12 && x <= 15) return (y === 1 && x === 13) ? 3 : 1; // ジム（入口=ゴール）
      if (x >= 3 && x <= 10 && y >= 5 && y <= 9) return 2;               // 草むら（西ルート）
      if (x >= 14 && x <= 23 && y >= 4 && y <= 8) return 2;              // 草むら（東ルート）
      if (x >= 8 && x <= 18 && y >= 12 && y <= 16) return 2;             // 草むら（南ルート）
      if (x >= 11 && x <= 12 && y >= 9 && y <= 11) return 1;             // 木立
      if (x >= 20 && x <= 22 && y >= 12 && y <= 14) return 1;           // 木立
      if (x >= 4 && x <= 5 && y >= 13 && y <= 15) return 1;            // 木立
      return 0;
    })
  ),
  battle: {
    playerName: 'ピカ',
    maxHp: 40, maxMp: 15, atk: 12, def: 7,
    moves: [
      { name: 'でんきショック', cost: 3, power: 16 },
      { name: 'はねやすめ', cost: 4, power: 20, heal: true },
    ],
    labels: { attack: 'こうげき', move: 'わざ', flee: 'にげる' },
    boss: { name: 'イワーク', emoji: '🪨', hp: 60, atk: 22, def: 20, exp: 0 },
  },
  objects: [
    newObject({ emoji: '👴', col: 5, row: 19, behavior: 'still', hazard: false, message: 'ジムは北だ。草むら🌿の野生ポケモンを倒しながら進め！' }),
    newObject({ emoji: '👨', col: 13, row: 2, behavior: 'still', hazard: false, message: 'ジムリーダーのタケシだ！岩タイプのイワークが相手だ！' }),
    // ── 草むらの野生ポケモン（シンボルエンカウント）──
    newObject({ emoji: '🐭', name: 'コラッタ', col: 5, row: 7, hp: 12, atk: 8, def: 4, exp: 6 }),
    newObject({ emoji: '🐭', name: 'コラッタ', col: 16, row: 14, hp: 12, atk: 8, def: 4, exp: 6 }),
    newObject({ emoji: '⚡', name: 'ピチュー', col: 8, row: 8, hp: 16, atk: 12, def: 6, exp: 10 }),
    newObject({ emoji: '⚡', name: 'ピチュー', col: 20, row: 6, hp: 16, atk: 12, def: 6, exp: 10 }),
    newObject({ emoji: '🔥', name: 'ヒトカゲ', col: 15, row: 6, hp: 14, atk: 11, def: 5, exp: 9 }),
    newObject({ emoji: '🔥', name: 'ヒトカゲ', col: 10, row: 13, hp: 14, atk: 11, def: 5, exp: 9 }),
    newObject({ emoji: '💧', name: 'ゼニガメ', col: 18, row: 7, hp: 18, atk: 9, def: 9, exp: 11 }),
    newObject({ emoji: '💧', name: 'ゼニガメ', col: 14, row: 13, hp: 18, atk: 9, def: 9, exp: 11 }),
    newObject({ emoji: '🌿', name: 'フシギダネ', col: 7, row: 6, hp: 20, atk: 10, def: 8, exp: 13 }),
    newObject({ emoji: '🌿', name: 'フシギダネ', col: 12, row: 14, hp: 20, atk: 10, def: 8, exp: 13 }),
  ],
  sfx: {},
};
