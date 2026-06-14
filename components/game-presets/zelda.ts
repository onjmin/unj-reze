import { type PresetData, newObject, ROWS } from './shared';

// ゼルダの伝説風ダンジョン横スクロール。
// プレイヤーのHP＝ハート数（1ハート=2HP）。
// 敵（モリブリン🗡️・キース🦇）またはその弾に触れるとダメージ。
// クリア条件は未定（ゴールタイルなし）。
const WCOLS = 40;
const MAX_HEARTS = 3; // 初期ハート数（HP = MAX_HEARTS * 2）
void MAX_HEARTS;

export const zelda: PresetData = {
  id: 'zelda', name: 'ゼルダ', engine: 'action', gravity: 1.2, friction: 0.82,
  scroll: { worldCols: WCOLS },
  player: {
    emoji: '🧝', color: '#3ecf3e', speed: 4, jumpPower: -12, w: 22, h: 24,
    start: { x: 48, y: 50 },
  },
  tiles: {
    0: { name: '空', color: '#1a1a2e', passable: true },
    1: { name: '石床', color: '#5c4a2a', passable: false },
    2: { name: '岩', color: '#3a3a3a', passable: false },
    3: { name: '水', color: '#1a6b9e', passable: true, special: 'trap' },
    4: { name: '宝箱', color: '#c8a020', passable: true, special: 'item' },
    5: { name: '扉（未使用）', color: '#7a5030', passable: false },
  },
  map: Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: WCOLS }, (_, x) => {
      // 天井・左右壁
      if (y === 0 || x === 0 || x === WCOLS - 1) return 2;

      // 地面・床
      if (y >= ROWS - 2) return 1;

      // 水エリア（落ちるとダメージ）
      if (y === ROWS - 1 && (x >= 12 && x <= 14)) return 3;
      if (y === ROWS - 2 && (x >= 12 && x <= 14)) return 3;

      // 足場（中段）
      if (y === ROWS - 5 && ((x >= 5 && x <= 7) || (x >= 18 && x <= 20) || (x >= 28 && x <= 31))) return 1;

      // 足場（上段）
      if (y === ROWS - 8 && ((x >= 10 && x <= 12) || (x >= 23 && x <= 25) || (x >= 34 && x <= 36))) return 1;

      // 壁ブロック（障害物）
      if (x === 16 && y >= ROWS - 6 && y <= ROWS - 3) return 2;
      if (x === 27 && y >= ROWS - 6 && y <= ROWS - 3) return 2;

      // 宝箱
      if (x === 37 && y === ROWS - 3) return 4;

      return 0;
    })
  ),
  objects: [
    // ── モリブリン（地上・パトロール） ──
    newObject({ emoji: '🗡️', col: 4, row: ROWS - 3, behavior: 'patrolH', speed: 1.2, hazard: true, hp: 2, bullet: 'none', name: 'モリブリン' }),
    newObject({ emoji: '🗡️', col: 20, row: ROWS - 3, behavior: 'patrolH', speed: 1.4, hazard: true, hp: 2, bullet: 'none', name: 'モリブリン' }),
    newObject({ emoji: '🗡️', col: 32, row: ROWS - 3, behavior: 'patrolH', speed: 1.6, hazard: true, hp: 3, bullet: 'none', name: 'モリブリン' }),

    // ── キース（飛行・プレイヤー追跡） ──
    newObject({ emoji: '🦇', col: 8, row: ROWS - 7, behavior: 'chase', speed: 1.5, hazard: true, hp: 1, bullet: 'none', name: 'キース' }),
    newObject({ emoji: '🦇', col: 25, row: ROWS - 7, behavior: 'chase', speed: 1.8, hazard: true, hp: 1, bullet: 'none', name: 'キース' }),

    // ── 魔法使い（固定・弾発射） ──
    newObject({ emoji: '🧙', col: 10, row: ROWS - 9, behavior: 'still', speed: 0, hazard: true, hp: 3, bullet: 'aimed', fireRate: 90, bulletSpeed: 3, bulletColor: '#9b59b6', name: '魔法使い' }),
    newObject({ emoji: '🧙', col: 30, row: ROWS - 9, behavior: 'still', speed: 0, hazard: true, hp: 3, bullet: 'aimed', fireRate: 80, bulletSpeed: 3.2, bulletColor: '#9b59b6', name: '魔法使い' }),

    // ── ガノン（ボス・spread弾） ──
    newObject({
      emoji: '👹', col: WCOLS - 5, row: ROWS - 3,
      behavior: 'patrolH', speed: 1.5, hazard: true,
      hp: 20, bullet: 'spread', fireRate: 60, bulletSpeed: 3, bulletColor: '#ff0000',
      isBoss: true, name: 'ガノン',
      outroDialogue: [
        { speaker: 'ガノン', emoji: '👹', text: 'ぐおっ……トライフォースを……返せ……！' },
        { speaker: 'リンク', emoji: '🧝', text: 'ハイラルの平和は守られた！' },
      ],
    }),
  ],
  sfx: {
    jump: { ref: 'jump' },
    shot: { ref: 'shot' },
    clear: { ref: 'clear' },
    damage: { ref: 'damage' },
  },
};
