import { type PresetData, newObject, ROWS } from './shared';

// gomi/games/ROCKMAN.html を参考にした実装。
// 横スクロールステージを右へ進み、トゲのピット⚡を飛び越え、
// 中段・上段の足場を渡ってボス（カットマン✂️）を倒しゴール扉へ。
// X キー / タッチ SHOT でバスターを撃てる（action エンジンの射撃機能）。
const WCOLS = 50;

export const rockman: PresetData = {
  id: 'rockman', name: 'ロックマン', engine: 'action', gravity: 0.5, friction: 0.78,
  scroll: { worldCols: WCOLS },
  player: { emoji: '🤖', color: '#1e90ff', speed: 3.5, jumpPower: -11, w: 22, h: 24, start: { x: 48, y: 50 } },
  tiles: {
    0: { name: '空', color: '#0b1633', passable: true },
    1: { name: '鉄床', color: '#4a5a6a', passable: false },
    2: { name: 'トゲ', color: '#cf3030', passable: true, special: 'trap' },
    3: { name: 'ゴール扉', color: '#30cfa0', passable: true, special: 'goal' },
    4: { name: '壁', color: '#2a3a4a', passable: false },
  },
  map: Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: WCOLS }, (_, x) => {
      // ゴール扉（ボスエリア右端）
      if (x === WCOLS - 2 && y === ROWS - 3) return 3;
      // ボスエリア壁
      if (x === WCOLS - 1) return 4;

      // ピット位置（HTMLの x=6-7, x=13-14, x=21-22, x=30-31）
      const pits = [
        x === 6 || x === 7,
        x === 13 || x === 14,
        x === 21 || x === 22,
        x === 30 || x === 31,
      ].some(Boolean);

      // 最下段（地面 or ピットはトゲ）
      if (y === ROWS - 1) return pits ? 2 : 1;
      // 地面（ピット部分は空洞）
      if (y === ROWS - 2) return pits ? 0 : 1;

      // 中段の足場（y = ROWS-5）: HTML の py=12 相当
      if (y === ROWS - 5 && (
        (x >= 4 && x <= 6) ||
        (x >= 9 && x <= 11) ||
        (x >= 17 && x <= 19) ||
        (x >= 24 && x <= 27) ||
        (x >= 34 && x <= 37)
      )) return 1;

      // 上段の足場（y = ROWS-8）: HTML の py=8-10 相当
      if (y === ROWS - 8 && (
        (x >= 7 && x <= 9) ||
        (x >= 15 && x <= 17) ||
        (x >= 28 && x <= 30) ||
        (x >= 40 && x <= 43)
      )) return 1;

      return 0;
    })
  ),
  objects: [
    // ── 雑魚敵（met: パトロール） ──
    newObject({ emoji: '🪖', col: 5, row: ROWS - 6, behavior: 'patrolH', speed: 1.5, hazard: true, hp: 1, bullet: 'none' }),
    newObject({ emoji: '🪖', col: 18, row: ROWS - 6, behavior: 'patrolH', speed: 1.5, hazard: true, hp: 1, bullet: 'none' }),
    newObject({ emoji: '🪖', col: 35, row: ROWS - 6, behavior: 'patrolH', speed: 1.8, hazard: true, hp: 1, bullet: 'none' }),

    // ── 砲台（aimed shot・固定） ──
    newObject({ emoji: '🔫', col: 10, row: ROWS - 9, behavior: 'still', speed: 0, hazard: true, hp: 2, bullet: 'aimed', fireRate: 80, bulletSpeed: 3.5, bulletColor: '#ff6644' }),
    newObject({ emoji: '🔫', col: 16, row: ROWS - 9, behavior: 'still', speed: 0, hazard: true, hp: 2, bullet: 'aimed', fireRate: 90, bulletSpeed: 3, bulletColor: '#ff6644' }),
    newObject({ emoji: '🔫', col: 29, row: ROWS - 9, behavior: 'still', speed: 0, hazard: true, hp: 2, bullet: 'aimed', fireRate: 75, bulletSpeed: 3.5, bulletColor: '#ff6644' }),

    // ── ピコピコ（パトロール・spread） ──
    newObject({ emoji: '👾', col: 25, row: ROWS - 6, behavior: 'patrolH', speed: 1.8, hazard: true, hp: 2, bullet: 'spread', fireRate: 110, bulletColor: '#ff9900', bulletSpeed: 3 }),
    newObject({ emoji: '👾', col: 41, row: ROWS - 6, behavior: 'patrolH', speed: 2, hazard: true, hp: 2, bullet: 'spread', fireRate: 100, bulletColor: '#ff9900', bulletSpeed: 3 }),

    // ── ボス：カットマン（isBoss=true → 倒すまでゴール不可） ──
    newObject({
      emoji: '✂️', col: WCOLS - 4, row: ROWS - 3,
      behavior: 'patrolH', speed: 1.5, hazard: true,
      hp: 28, bullet: 'spread', fireRate: 55, bulletSpeed: 3.5, bulletColor: '#ff2222',
      isBoss: true, name: 'カットマン',
      outroDialogue: [
        { speaker: 'カットマン', emoji: '✂️', text: 'ぐおっ……やられた……！' },
        { speaker: 'ロック', emoji: '🤖', text: 'ワイリー博士のもとへはいかせない！' },
      ],
    }),
  ],
  sfx: {
    shot: { ref: 'shot' },
    jump: { ref: 'jump' },
    clear: { ref: 'clear' },
    damage: { ref: 'damage' },
  },
};
