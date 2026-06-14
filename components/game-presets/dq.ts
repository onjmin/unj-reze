import { type PresetData, newObject, TILE_SIZE } from './shared';

// gomi/games/dq.html を反映：勇者🧝が町から旅立ち、上下左右スクロールする広いフィールドを抜けて
// 竜王の城へ。戦闘はフィールド上の魔物に接触するシンボルエンカウント。
const W = 30, H = 24;

export const dq: PresetData = {
  id: 'dq', name: 'ドラクエ', engine: 'rpg', gravity: 0, friction: 0,
  scroll: { worldCols: W, worldRows: H },
  player: { emoji: '🧝', color: '#4444ff', speed: 3, jumpPower: 0, w: 24, h: 24, start: { x: TILE_SIZE * 3, y: TILE_SIZE * 21 } },
  tiles: {
    0: { name: '平地', color: '#3a9a4a', passable: true },
    1: { name: '山/岩', color: '#6b5a3a', passable: false },
    2: { name: '水', color: '#2a5acb', passable: false },
    3: { name: '竜王の城', color: '#b0b0c0', passable: true, special: 'goal' },
    4: { name: '森', color: '#1f5a2a', passable: false },
  },
  map: Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      if (x === 0 || x === W - 1 || y === 0 || y === H - 1) return 1;     // 外周は山
      if (y <= 1 && x >= 14 && x <= 16) return (y === 1 && x === 15) ? 3 : 1; // 竜王の城（入口=ゴール）
      if (x >= 4 && x <= 8 && y >= 6 && y <= 9) return 2;                 // 湖（北西）
      if (x >= 19 && x <= 24 && y >= 12 && y <= 15) return 2;            // 湖（南東）
      if (x >= 10 && x <= 12 && y >= 4 && y <= 5) return 4;             // 森
      if (x >= 22 && x <= 25 && y >= 4 && y <= 6) return 4;             // 森
      if (x >= 6 && x <= 8 && y >= 16 && y <= 18) return 4;            // 森
      if (x >= 13 && x <= 15 && y >= 10 && y <= 12) return 1;          // 山岳（中央）
      if (x >= 2 && x <= 3 && y >= 12 && y <= 14) return 1;            // 山岳（西）
      return 0;
    })
  ),
  battle: {
    playerName: '勇者',
    maxHp: 35, maxMp: 12, atk: 12, def: 6,
    moves: [
      { name: 'メラ', cost: 3, power: 14 },
      { name: 'ホイミ', cost: 4, power: 22, heal: true },
    ],
    labels: { attack: 'たたかう', move: 'じゅもん', flee: 'にげる' },
  },
  objects: [
    // ── NPC ──
    newObject({ emoji: '👴', col: 5, row: 21, behavior: 'still', hazard: false, message: 'よくきたな勇者よ！竜王の城は北にある。魔物に気をつけて進むのだ！' }),
    newObject({ emoji: '👩', col: 4, row: 20, behavior: 'still', hazard: false, message: 'フィールドを歩くと魔物が おそってくるわ。レベルを上げて城を目指して！' }),
    // ── 雑魚モンスター（シンボルエンカウント）──
    newObject({ emoji: '🟦', name: 'スライム', col: 5, row: 19, hp: 8, atk: 7, def: 3, exp: 4 }),
    newObject({ emoji: '🟦', name: 'スライム', col: 8, row: 18, hp: 8, atk: 7, def: 3, exp: 4 }),
    newObject({ emoji: '🟦', name: 'スライム', col: 11, row: 20, hp: 8, atk: 7, def: 3, exp: 4 }),
    newObject({ emoji: '🟥', name: 'スライムベス', col: 10, row: 17, hp: 11, atk: 9, def: 4, exp: 6 }),
    newObject({ emoji: '🟥', name: 'スライムベス', col: 7, row: 16, hp: 11, atk: 9, def: 4, exp: 6 }),
    newObject({ emoji: '🦇', name: 'ドラキー', col: 11, row: 6, hp: 14, atk: 11, def: 6, exp: 9 }),
    newObject({ emoji: '🦇', name: 'ドラキー', col: 21, row: 7, hp: 14, atk: 11, def: 6, exp: 9 }),
    newObject({ emoji: '👁️', name: 'メーダ', col: 13, row: 13, hp: 24, atk: 18, def: 10, exp: 18, moves: [{ name: 'メラ', power: 14 }] }),
    newObject({ emoji: '👁️', name: 'メーダ', col: 18, row: 10, hp: 24, atk: 18, def: 10, exp: 18, moves: [{ name: 'メラ', power: 14 }] }),
    newObject({ emoji: '💀', name: 'がいこつ', col: 12, row: 11, hp: 30, atk: 22, def: 14, exp: 26 }),
    newObject({ emoji: '💀', name: 'がいこつ', col: 4, row: 13, hp: 30, atk: 22, def: 14, exp: 26 }),
    newObject({ emoji: '🧙', name: 'まどうし', col: 9, row: 8, hp: 28, atk: 18, def: 12, exp: 30, moves: [{ name: 'ギラ', power: 16 }, { name: 'ホイミ', power: 20, heal: true }] }),
    newObject({ emoji: '🧙', name: 'まどうし', col: 18, row: 5, hp: 28, atk: 18, def: 12, exp: 30, moves: [{ name: 'ギラ', power: 16 }, { name: 'ホイミ', power: 20, heal: true }] }),
    // ── ボス：城の手前で待ち構える。倒すまで城（ゴール）はクリアにならない ──
    newObject({
      emoji: '🐉', name: 'りゅうおう', col: 15, row: 3, behavior: 'still', hazard: true, isBoss: true,
      hp: 90, atk: 40, def: 24, exp: 200,
      moves: [{ name: 'はげしいほのお', power: 30 }, { name: 'ベホイミ', power: 28, heal: true }],
    }),
  ],
  sfx: {},
};
