import { type PresetData, type SceneDef, newObject, COLS, ROWS, TILE_SIZE } from './shared';

const sp  = (no: number) => `/api/rpgen/data/images/sprites/${no}.png`;
const sa  = (no: number) => `/api/rpgen/data/images/sAnims/${no}.png`;
const wr  = (no: number) => `walk:auto:u:${sa(no)}`;
const ir  = (no: number) => `url:${sp(no)}`;

const tiles: PresetData['tiles'] = {
  0: { name: '空',       color: '#0d1826', passable: true,  imageRef: ir(626), imageUrl: sp(626) },
  1: { name: '鉄床',     color: '#3a4a5c', passable: false, imageRef: ir(831), imageUrl: sp(831) },
  2: { name: 'トゲ',     color: '#c03030', passable: true, special: 'trap', imageRef: ir(349), imageUrl: sp(349) },
  3: { name: 'ゴール扉', color: '#28c090', passable: true, special: 'goal', imageRef: ir(17),  imageUrl: sp(17)  },
  4: { name: '壁',       color: '#202a38', passable: false, imageRef: ir(628), imageUrl: sp(628) },
};

// ── シーン1：横スクロール道中 ─────────────────────────────────────────────────
// ★修正: col 19 に壁を置かない → player.x + 22 >= 640 で right exit 発火
const scene1Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    // 地面（y=13,14）。ピット位置にトゲ。col 19 は壁なし（右エグジット用）
    if (y >= ROWS - 2) return (x === 6 || x === 7 || x === 14 || x === 15) ? 2 : 1;
    // 中段足場（y=10）
    if (y === ROWS - 5 && (x >= 3 && x <= 5 || x >= 10 && x <= 13)) return 1;
    // 上段足場（y=7）
    if (y === ROWS - 8 && (x >= 7 && x <= 9 || x >= 15 && x <= 17)) return 1;
    return 0;
  })
);

const scene1: SceneDef = {
  id: 'stage1', name: '道中 1',
  map: scene1Map,
  exits: { right: 'shaft' },
  objects: [
    newObject({ emoji: '🪖', col: 4,  row: ROWS - 3, behavior: 'walker', speed: 1.5, hazard: true, hp: 1, bullet: 'none', atk: 2,
      spriteRef: wr(987), spriteUrl: sa(987) }),
    newObject({ emoji: '🪖', col: 12, row: ROWS - 3, behavior: 'walker', speed: 1.6, hazard: true, hp: 1, bullet: 'none', atk: 2,
      spriteRef: wr(987), spriteUrl: sa(987) }),
    newObject({ emoji: '🔫', col: 8,  row: ROWS - 9, behavior: 'still', hazard: true, hp: 2, atk: 4,
      bullet: 'aimed', fireRate: 80, bulletSpeed: 3.5, bulletColor: '#ff6644',
      spriteRef: wr(995), spriteUrl: sa(995) }),
    newObject({ emoji: '👾', col: 16, row: ROWS - 6, behavior: 'walker', speed: 1.8, hazard: true, hp: 2, atk: 2,
      bullet: 'spread', fireRate: 110, bulletColor: '#ff9900', bulletSpeed: 3,
      spriteRef: wr(992), spriteUrl: sa(992) }),
  ],
};

// ── シーン2：横廊下 → 縦シャフト ─────────────────────────────────────────────
// ★修正:
//   - 左エントリ(x=32=col 1) が空中になるよう、cols 1-10 を rows 0-12 で open に
//   - 廊下床(rows 13-14) は cols 1-6 のみ solid
//   - シャフト(cols 7-10) は rows 13-14 も空 → player が落ちて y>=456 で down exit 発火
//   - 壁: col 0 (左壁), cols 11-19 (右壁), row 0 (天井)
//   - left exit は設けない（一方通行）
const scene2Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    const inShaft = x >= 7 && x <= 10;
    const inCorridor = x >= 1 && x <= 6;
    // 天井
    if (y === 0) return 4;
    // 左壁
    if (x === 0) return 4;
    // 右壁（cols 11-19 すべて）
    if (x >= 11) return 4;
    // 廊下床（cols 1-6 の rows 13-14）
    if ((inCorridor) && y >= ROWS - 2) return 1;
    // 廊下中段プラットフォーム（落下を2段階に）
    if (inCorridor && y === 8) return 1;
    // シャフト内の一時足場（中ほどで一息）
    if (inShaft && y === 6) return 1;
    // それ以外は空（inShaft rows 13-14 も空 → fall-through で down exit）
    return 0;
  })
);

const scene2: SceneDef = {
  id: 'shaft', name: '縦シャフト',
  map: scene2Map,
  // down のみ。left は廊下が一方通行のため設けない。up は無限ループ防止のため設けない。
  exits: { down: 'stage2' },
  objects: [
    // 砲台（廊下上部）
    newObject({ emoji: '🔫', col: 3, row: 7, behavior: 'still', hazard: true, hp: 2, atk: 3,
      bullet: 'aimed', fireRate: 95, bulletSpeed: 2.5, bulletColor: '#ff6644',
      spriteRef: wr(995), spriteUrl: sa(995) }),
    // シャフト内スパイダー（一時足場の下で待ち構える）
    newObject({ emoji: '🕷️', col: 8, row: 9, behavior: 'still', hazard: true, hp: 1, atk: 3,
      bullet: 'aimed', fireRate: 100, bulletSpeed: 2.5, bulletColor: '#ff9900',
      spriteRef: wr(1020), spriteUrl: sa(1020) }),
    newObject({ emoji: '🕷️', col: 9, row: 12, behavior: 'still', hazard: true, hp: 1, atk: 3,
      bullet: 'aimed', fireRate: 90, bulletSpeed: 2.5, bulletColor: '#ff9900',
      spriteRef: wr(1020), spriteUrl: sa(1020) }),
  ],
};

// ── シーン3：ボス部屋 ──────────────────────────────────────────────────────────
// ★修正:
//   - 天井なし（row 0 open）→ player が y=32 から落下して着地できる
//   - up exit 削除（戻ると scene2 シャフトに再落下して無限ループするため）
//   - ゴール扉を右端手前に配置
const scene3Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    // 右壁
    if (x === COLS - 1) return 4;
    // ゴール扉
    if (x === COLS - 2 && y === ROWS - 3) return 3;
    // 地面（トゲあり）
    if (y >= ROWS - 2) return (x >= 7 && x <= 8 || x >= 14 && x <= 15) ? 2 : 1;
    // 中段足場
    if (y === ROWS - 5 && (x >= 3 && x <= 5 || x >= 10 && x <= 12)) return 1;
    // 上段足場
    if (y === ROWS - 8 && x >= 15 && x <= 18) return 1;
    return 0;
  })
);

const scene3: SceneDef = {
  id: 'stage2', name: 'ボス部屋',
  map: scene3Map,
  // up exit なし（無限ループ防止）。ボスを倒してゴールへ。
  objects: [
    newObject({ emoji: '🪖', col: 4,  row: ROWS - 3, behavior: 'walker', speed: 1.7, hazard: true, hp: 1, bullet: 'none', atk: 2,
      spriteRef: wr(987), spriteUrl: sa(987) }),
    newObject({ emoji: '👾', col: 11, row: ROWS - 3, behavior: 'walker', speed: 1.9, hazard: true, hp: 2, atk: 2,
      bullet: 'spread', fireRate: 100, bulletColor: '#ff9900', bulletSpeed: 3,
      spriteRef: wr(992), spriteUrl: sa(992) }),
    newObject({ emoji: '🔫', col: 16, row: ROWS - 9, behavior: 'still', hazard: true, hp: 2, atk: 4,
      bullet: 'aimed', fireRate: 75, bulletSpeed: 3.2, bulletColor: '#ff6644',
      spriteRef: wr(995), spriteUrl: sa(995) }),
    // カットマンボス：hp=28 でゲージ28ブロック表示、atk=8
    newObject({
      emoji: '✂️', col: COLS - 4, row: ROWS - 3,
      behavior: 'walker', speed: 1.5, hazard: true,
      hp: 28, atk: 8, bullet: 'spread', fireRate: 55, bulletSpeed: 3.5, bulletColor: '#ff2222',
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
    hearts: 28,
    spriteRef: wr(997), spriteUrl: sa(997),
  },
  tiles,
  map: JSON.parse(JSON.stringify(scene1Map)),
  objects: [...scene1.objects],
  scenes: [scene1, scene2, scene3],
  // BGM: FC ロックマン 1 ステージ曲 / ボス戦はWily Stage 1 アレンジ
  bgm:     { ref: 'https://www.youtube.com/watch?v=eDWc3fvCVAE', src: 'https://www.youtube.com/watch?v=eDWc3fvCVAE', type: 'youtube' },
  bossBgm: { ref: 'https://www.youtube.com/watch?v=uB1kNcqPe2U', src: 'https://www.youtube.com/watch?v=uB1kNcqPe2U', type: 'youtube' },
  sfx: {
    shot: { ref: 'shot' }, jump: { ref: 'jump' },
    clear: { ref: 'clear' }, damage: { ref: 'damage' },
  },
};
