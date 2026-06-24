import { type PresetData, type SceneDef, newObject, COLS, ROWS } from './shared';

const sp  = (no: number) => `/api/rpgen/data/images/sprites/${no}.png`;
const sa  = (no: number) => `/api/rpgen/data/images/sAnims/${no}.png`;
const wr  = (no: number) => `walk:auto:u:${sa(no)}`;
const ir  = (no: number) => `url:${sp(no)}`;

// ── タイル定義 ─────────────────────────────────────────────────────────────
// sp.342 茶金ブロック   sp.158 ?ブロック金橙   sp.377 濃緑パイプ
// sp.17  目標/旗        sp.362 暖石床           sp.121 地下石床
// sp.14  水             sp.6   茶レンガ
const tiles: PresetData['tiles'] = {
  0:  { name: '空',            color: '#5c94fc', passable: true  },
  1:  { name: 'ブロック',       color: '#8B4513', passable: false, imageRef: ir(342), imageUrl: sp(342) },
  2:  { name: 'ハテナ',         color: '#FFD700', passable: false, special: 'item',        imageRef: ir(158), imageUrl: sp(158) },
  3:  { name: 'ゴール旗',       color: '#32CD32', passable: true,  special: 'goal',        imageRef: ir(17),  imageUrl: sp(17)  },
  4:  { name: '土管',           color: '#2aa02a', passable: false, imageRef: ir(377), imageUrl: sp(377) },
  5:  { name: '岩床',           color: '#555566', passable: false, imageRef: ir(362), imageUrl: sp(362) },
  6:  { name: '音符ブロック',   color: '#e8b000', passable: false, special: 'bounce'       },   // ジャンプ力強化バウンド
  7:  { name: 'チェックポイント', color: '#ff8800', passable: true, special: 'checkpoint'  },   // 中間フラグ
  8:  { name: 'ツタ',           color: '#22aa22', passable: true,  special: 'vine',        imageRef: ir(377), imageUrl: sp(377) },
  9:  { name: '水',             color: '#3a78f0', passable: true,  special: 'water',       imageRef: ir(14),  imageUrl: sp(14)  },
  10: { name: '溶岩',           color: '#ff4400', passable: true,  special: 'lava'         },   // 即ミス
  11: { name: '壊せるブロック', color: '#c08840', passable: false, special: 'destructible' },   // ショット/グラウンドパウンドで破壊
  12: { name: 'P スイッチ',     color: '#4444ff', passable: false, special: 'pswitch'      },   // コインとブロックを入れ替え
};

// ── シーン1：地上ステージ ────────────────────────────────────────────────────
const WCOLS = 36;
const scene1Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: WCOLS }, (_, x) => {
    if (x === WCOLS - 1 && y === ROWS - 3) return 3;
    if (x >= WCOLS - 4 && x <= WCOLS - 2) {
      const h = x - (WCOLS - 5);
      if (y <= ROWS - 3 && y >= ROWS - 2 - h) return 1;
    }
    if ((x === 9 && y >= ROWS - 4) || (x === 20 && y >= ROWS - 5)) return 4;
    if ((y === ROWS - 6 && (x === 5 || x === 6)) || (y === ROWS - 7 && x === 15)) return 2;
    if (y === ROWS - 8 && x === 10) return 6;               // 音符ブロック
    if (y === ROWS - 9 && (x >= 5 && x <= 7 || x >= 15 && x <= 17)) return 1;
    if (x === 22 && y === ROWS - 3) return 7;               // チェックポイントフラグ
    const gap = (x === 13 || x === 14) || (x === 26 || x === 27) || x === 32;
    if (y >= ROWS - 2) return gap ? 0 : 1;
    return 0;
  })
);

const scene1: SceneDef = {
  id: 'overworld', name: '地上ステージ',
  map: scene1Map,
  objects: [
    // クリボー
    newObject({ emoji: '🐛', col: 5,  row: ROWS - 3, behavior: 'patrolH', speed: 1,   hazard: true,  hp: 1, bullet: 'none',
      spriteRef: wr(91), spriteUrl: sa(91) }),
    newObject({ emoji: '🐛', col: 18, row: ROWS - 3, behavior: 'patrolH', speed: 1,   hazard: true,  hp: 1, bullet: 'none',
      spriteRef: wr(91), spriteUrl: sa(91) }),
    // ノコノコ
    newObject({ emoji: '🐢', col: 24, row: ROWS - 3, behavior: 'walker',  speed: 1.2, hazard: true,  hp: 2, bullet: 'none',
      spriteRef: wr(92), spriteUrl: sa(92) }),
    // キラー（左から右へ直進）
    newObject({ emoji: '💣', col: 2,  row: ROWS - 4, behavior: 'walker',  speed: 2.5, hazard: true,  hp: 1, bullet: 'none',
      name: 'キラー' }),
    // ボム兵（爆発あり）
    newObject({ emoji: '💥', col: 28, row: ROWS - 3, behavior: 'patrolH', speed: 1,   hazard: true,  hp: 1, bullet: 'none',
      name: 'ボム兵' }),
    // テレサ（近づくと動く）
    newObject({ emoji: '👻', col: 8,  row: ROWS - 8, behavior: 'chase',   speed: 0.8, hazard: true,  hp: 1, bullet: 'none',
      name: 'テレサ' }),
    // プクプク（水中）
    newObject({ emoji: '🐟', col: 12, row: ROWS - 4, behavior: 'patrolV', speed: 1.5, hazard: true,  hp: 1, bullet: 'none',
      name: 'プクプク' }),
    // キノピオ NPC
    newObject({ emoji: '🍄', col: 3, row: ROWS - 3, behavior: 'still', hazard: false, hp: 1, bullet: 'none',
      objType: 'npc', message: 'キノピオだよ！音符ブロックを下から叩くと高くジャンプできるよ！チェックポイントを踏むと途中から再開できるよ！',
      spriteRef: wr(30), spriteUrl: sa(30) }),
    // ピーチ姫（ゴール付近 NPC）
    newObject({ emoji: '👸', col: WCOLS - 3, row: ROWS - 3, behavior: 'still', hazard: false, hp: 1, bullet: 'none',
      objType: 'npc', message: 'マリオ！助けに来てくれてありがとう！クッパをやっつけて！',
      spriteRef: wr(25), spriteUrl: sa(25) }),
    // 土管ワープ→地下
    newObject({ emoji: '🪣', col: 9,  row: ROWS - 5, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'underground', warpEntryCol: 2, warpEntryRow: ROWS - 4 }),
    newObject({ emoji: '🪣', col: 20, row: ROWS - 6, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'underground2', warpEntryCol: 2, warpEntryRow: ROWS - 4 }),
    // レッドコイン（アイテム）
    newObject({ emoji: '🔴', col: 7,  row: ROWS - 10, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none',
      itemId: 'redCoin', message: '' }),
    newObject({ emoji: '🔴', col: 16, row: ROWS - 10, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none',
      itemId: 'redCoin', message: '' }),
    // スター（パワーアップ）
    newObject({ emoji: '⭐', col: 6,  row: ROWS - 10, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none',
      itemId: 'star', message: '' }),
    // 1UP キノコ
    newObject({ emoji: '💚', col: 15, row: ROWS - 10, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none',
      itemId: 'oneUp', message: '' }),
  ],
};

// ── シーン2：地下ステージ1 ────────────────────────────────────────────────────
const scene2Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (y <= 1) return 5;
    if (y >= ROWS - 2) return 5;
    if (x >= COLS - 3 && x <= COLS - 2 && y >= ROWS - 4) return 4;
    if (y === ROWS - 5 && x >= 3 && x <= 7) return 5;
    if (y === ROWS - 7 && x >= 10 && x <= 14) return 5;
    if (y === ROWS - 9 && x >= 7 && x <= 11) return 1;
    if (y === ROWS - 6 && (x === 5 || x === 12)) return 2;
    if (y === ROWS - 8 && x === 9) return 12;               // P スイッチ
    // 水溜まり
    if (y >= ROWS - 4 && y <= ROWS - 3 && x >= 14 && x <= 16) return 9;
    return 0;
  })
);

const scene2: SceneDef = {
  id: 'underground', name: '地下ステージ1',
  map: scene2Map,
  objects: [
    newObject({ emoji: '🐀', col: 5,  row: ROWS - 3, behavior: 'patrolH', speed: 1.2, hazard: true, hp: 1, bullet: 'none',
      spriteRef: wr(93), spriteUrl: sa(93) }),
    newObject({ emoji: '🐀', col: 13, row: ROWS - 3, behavior: 'patrolH', speed: 1.4, hazard: true, hp: 1, bullet: 'none',
      spriteRef: wr(93), spriteUrl: sa(93) }),
    // ホネクッパ（再生する敵）
    newObject({ emoji: '💀', col: 10, row: ROWS - 6, behavior: 'patrolH', speed: 1, hazard: true, hp: 3, bullet: 'none',
      name: 'ホネクッパ' }),
    // シャインかけら
    newObject({ emoji: '✨', col: 9,  row: ROWS - 10, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none',
      itemId: 'shineShard', message: '' }),
    newObject({ emoji: '🪣', col: COLS - 3, row: ROWS - 5, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'overworld', warpEntryCol: 10, warpEntryRow: ROWS - 3 }),
  ],
};

// ── シーン3：秘密の地下ステージ ─────────────────────────────────────────────
const scene3Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (y <= 1) return 5;
    if (y >= ROWS - 2) return 5;
    if (x >= COLS - 3 && x <= COLS - 2 && y >= ROWS - 4) return 4;
    if (y === ROWS - 5 && x % 3 === 0 && x > 1 && x < COLS - 4) return 2;
    if (y === ROWS - 8 && x % 4 === 1 && x > 1 && x < COLS - 4) return 6;  // 音符ブロック
    if (y === ROWS - 6 && x >= 4 && x <= 8) return 5;
    if (y === ROWS - 6 && x >= 12 && x <= 16) return 5;
    // ツタゾーン
    if (x >= 17 && x <= 18 && y >= ROWS - 9 && y <= ROWS - 3) return 8;
    return 0;
  })
);

const scene3: SceneDef = {
  id: 'underground2', name: '秘密の地下ステージ',
  map: scene3Map,
  objects: [
    newObject({ emoji: '🪣', col: COLS - 3, row: ROWS - 5, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'overworld', warpEntryCol: 21, warpEntryRow: ROWS - 3 }),
    // 壊せるブロックの先にシャインかけら
    newObject({ emoji: '✨', col: COLS - 5, row: ROWS - 6, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none',
      itemId: 'shineShard', message: '' }),
  ],
};

export const mario: PresetData = {
  id: 'mario', name: 'マリオ', engine: 'action', gravity: 2.5, friction: 0.85,
  player: {
    emoji: '🍄', color: '#ff4444', speed: 5, jumpPower: -18, w: 24, h: 24,
    start: { x: 50, y: 50 },
    hearts: 8,
    spriteRef: wr(90), spriteUrl: sa(90),
  },
  tiles,
  map: JSON.parse(JSON.stringify(scene1Map)),
  objects: [...scene1.objects],
  scenes: [scene1, scene2, scene3],
  scroll: { worldCols: WCOLS },
  items: [
    { id: 'redCoin',    name: 'レッドコイン',    emoji: '🔴', description: '8枚集めるとご褒美アイテムが出現する特別なコイン' },
    { id: 'shineShard', name: 'シャインかけら',  emoji: '✨', description: '5枚集めるとシャインスプライトが完成する' },
    { id: 'oneUp',      name: '1UPキノコ',       emoji: '💚', description: '残機が1増える緑色のキノコ' },
    { id: 'star',       name: 'スーパースター',  emoji: '⭐', description: '一定時間無敵になり敵を踏んで倒せる' },
    { id: 'metalCap',   name: 'メタルキャップ',  emoji: '⚙️',  description: '一定時間金属マリオに変身。水中でも沈んで歩ける' },
    { id: 'wingCap',    name: 'ウィングキャップ', emoji: '🪽', description: '一定時間飛行できる赤い帽子' },
    { id: 'vanishCap',  name: 'バニッシュキャップ', emoji: '🌫️', description: '一定時間透明になり特定の壁をすり抜けられる' },
  ],
  titleScreen: {
    enabled: true,
    heading: 'スーパーマリオ',
    subtitle: '冒険の始まりだ！',
    textColor: '#ffe000',
    menu: [
      { kind: 'newGame',   label: 'はじめから' },
      { kind: 'continue',  label: 'つづきから' },
      { kind: 'nameInput', label: 'なまえをいれる' },
    ],
  },
  ending: {
    enabled: true,
    heading: 'GAME CLEAR!',
    message: 'おめでとう！ピーチ姫を救出した！\nマリオ、あなたは本当のヒーローよ！',
    textColor: '#ffe000',
  },
  bgm: { ref: 'https://www.youtube.com/watch?v=a9ZMbWHubKk', src: 'https://www.youtube.com/watch?v=a9ZMbWHubKk', type: 'youtube' },
  sfx: {
    jump:   { ref: 'jump' },
    clear:  { ref: 'clear' },
    damage: { ref: 'damage' },
  },
};
