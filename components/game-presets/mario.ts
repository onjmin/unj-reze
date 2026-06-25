import { type PresetData, type SceneDef, newObject, COLS, ROWS } from './shared';

// SMC-released-sprites (Level-Share-Square/SMC-released-sprites) via jsDelivr CDN
// ライセンス: 非商用無料、作者クレジット必須
// Credit: Cube, Fesh, Nitrox, NotAToon, Noveni, Red Bun, Smuglutena, TheCrushedJoycon, Tristaph
const SMC_CDN = 'https://cdn.jsdelivr.net/gh/Level-Share-Square/SMC-released-sprites@main';
const smc = (path: string) => `${SMC_CDN}/${path}`;

// タイル用静止画 URL（#sx,sy,sw,sh クロップ付き）
// SMC スプライトシートから 16px セル単位で単一タイルを切り出す
const smcTile = (path: string, sx: number, sy: number, sw = 16, sh = 16) =>
  `${smc(path)}#${sx},${sy},${sw},${sh}`;
const smcRef  = (url: string) => `url:${url.split('#')[0]}`;   // imageRef 用(クロップなし参照)

// walk:smc:u:<url>#sx,sy,cropW,cropH  (2フレーム水平ストリップ、左向き水平反転)
const smcWalk = (path: string, sx: number, sy: number, sw: number, sh: number) =>
  `walk:smc:u:${smc(path)}#${sx},${sy},${sw},${sh}`;

// ── タイル用 SMC URL ──────────────────────────────────────────────────────
//  Retro_SMB1_Blocks (384×144, 16px/cell): ? ブロック (0,0)
//  Bricks            (448×208, 16px/cell): 茶レンガブロック (0,0)
//  Castle            (384×352, 16px/cell): 石床 (0,0)
//  Large_Pipes       (448×192, スプライトシート): 土管
//  Flag_Pole         (448×112, スプライトシート): ゴール旗
const T = {
  brick:    smcTile('SMW/General%20tiles/Bricks.png',                        0, 0, 16, 16),
  qBlock:   smcTile('SMW/Objects/Retro%20Skins/Retro_SMB1_Blocks.png',      0, 0, 16, 16),
  stone:    smcTile('SMW/Tilesets/Castle.png',                               0, 0, 16, 16),
  pipe:     smc('SMW/General%20tiles/Large_Pipes.png'),
  goalFlag: smc('SMW/Objects/Goals%20%26%20Checkpoints/Flag_Pole.png'),
};

// ── 敵/NPC 用 SMC walk/static URL ────────────────────────────────────────
// SMCスプライトはすべて 16×16px セル (448px幅 = 28列)
// 走行アニメ: 先頭2フレーム水平ストリップ crop = (0, 0, 32, 16)
//   Goombas     448×176  16px/cell  →  2フレーム (0,0,32,16)
//   Beach_Koopa 448×128  16px/cell  →  (0,0,32,16)
//   Bob-omb     448×144  16px/cell  →  (0,0,32,16)
//   Dry_Bones   448× 96  16px/cell  →  (0,0,32,16)
//   Blazin_Boos 448×272  16px/cell  →  (0,0,32,16)
// 16px スプライトは TILE_SIZE=32 でレンダリングされるため 2倍拡大表示
const E = {
  goombaRef:   smcWalk('SMW/Enemies/Common%20Enemies/Goombas.png',          0, 0, 32, 16),
  goombaUrl:   smc('SMW/Enemies/Common%20Enemies/Goombas.png'),
  koopaRef:    smcWalk('SMAS/Enemies/Shell%20Enemies/Beach_Koopa.png',      0, 0, 32, 16),
  koopaUrl:    smc('SMAS/Enemies/Shell%20Enemies/Beach_Koopa.png'),
  bobOmbRef:   smcWalk('SMW/Enemies/Artillery/Bob-omb.png',                  0, 0, 32, 16),
  bobOmbUrl:   smc('SMW/Enemies/Artillery/Bob-omb.png'),
  dryBonesRef: smcWalk('SMAS/Enemies/Castle%20Enemies/Dry_Bones.png',       0, 0, 32, 16),
  dryBonesUrl: smc('SMAS/Enemies/Castle%20Enemies/Dry_Bones.png'),
  booRef:      smcWalk('SMW/Enemies/Ghost%20Enemies/Blazin_Boos.png',       0, 0, 32, 16),
  booUrl:      smc('SMW/Enemies/Ghost%20Enemies/Blazin_Boos.png'),
  toadUrl:     smc('SMW/Objects/NPCs/Toad_NPCs.png'),
  princessUrl: smc('SMW/Objects/NPCs/Princesses.png'),
};

// プレイヤー (マリオ): SMC に基本歩行スプライトなし → RPGen #90 を維持
const sa = (no: number) => `/api/rpgen/data/images/sAnims/${no}.png`;
const wr = (no: number) => `walk:auto:u:${sa(no)}`;
// 地下ネズミ: SMC に対応スプライトなし → RPGen #93 を維持
const sa93 = sa(93);
const wr93 = wr(93);

// ── タイル定義 ─────────────────────────────────────────────────────────────
const tiles: PresetData['tiles'] = {
  0:  { name: '空',              color: '#5c94fc', passable: true  },
  1:  { name: 'ブロック',         color: '#8B4513', passable: false, imageRef: smcRef(T.brick),    imageUrl: T.brick    },
  2:  { name: 'ハテナ',           color: '#FFD700', passable: false, special: 'item',        imageRef: smcRef(T.qBlock),   imageUrl: T.qBlock   },
  3:  { name: 'ゴール旗',         color: '#32CD32', passable: true,  special: 'goal',        imageRef: `url:${T.goalFlag}`, imageUrl: T.goalFlag },
  4:  { name: '土管',             color: '#2aa02a', passable: false, imageRef: `url:${T.pipe}`,    imageUrl: T.pipe     },
  5:  { name: '岩床',             color: '#555566', passable: false, imageRef: smcRef(T.stone),    imageUrl: T.stone    },
  6:  { name: '音符ブロック',     color: '#e8b000', passable: false, special: 'bounce'       },
  7:  { name: 'チェックポイント', color: '#ff8800', passable: true,  special: 'checkpoint'   },
  8:  { name: 'ツタ',             color: '#22aa22', passable: true,  special: 'vine',        imageRef: `url:${T.pipe}`, imageUrl: T.pipe     },
  9:  { name: '水',               color: '#3a78f0', passable: true,  special: 'water'        },
  10: { name: '溶岩',             color: '#ff4400', passable: true,  special: 'lava'         },
  11: { name: '壊せるブロック',   color: '#c08840', passable: false, special: 'destructible', imageRef: smcRef(T.brick), imageUrl: T.brick },
  12: { name: 'P スイッチ',       color: '#4444ff', passable: false, special: 'pswitch'      },
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
    // クリボー (SMC: Goombas.png walk:smc 2フレーム)
    newObject({ emoji: '🐛', col: 5,  row: ROWS - 3, behavior: 'patrolH', speed: 1,   hazard: true,  hp: 1, bullet: 'none',
      spriteRef: E.goombaRef, spriteUrl: E.goombaUrl }),
    newObject({ emoji: '🐛', col: 18, row: ROWS - 3, behavior: 'patrolH', speed: 1,   hazard: true,  hp: 1, bullet: 'none',
      spriteRef: E.goombaRef, spriteUrl: E.goombaUrl }),
    // ノコノコ (SMC: Beach_Koopa.png walk:smc 2フレーム)
    newObject({ emoji: '🐢', col: 24, row: ROWS - 3, behavior: 'walker',  speed: 1.2, hazard: true,  hp: 2, bullet: 'none',
      spriteRef: E.koopaRef, spriteUrl: E.koopaUrl }),
    // キラー（SMC: Bob-omb.png 流用・直進）
    newObject({ emoji: '💣', col: 2,  row: ROWS - 4, behavior: 'walker',  speed: 2.5, hazard: true,  hp: 1, bullet: 'none',
      name: 'キラー', spriteRef: E.bobOmbRef, spriteUrl: E.bobOmbUrl }),
    // ボム兵（爆発あり, SMC: Bob-omb.png walk:smc 2フレーム）
    newObject({ emoji: '💥', col: 28, row: ROWS - 3, behavior: 'patrolH', speed: 1,   hazard: true,  hp: 1, bullet: 'none',
      name: 'ボム兵', spriteRef: E.bobOmbRef, spriteUrl: E.bobOmbUrl }),
    // テレサ（近づくと動く, SMC: Blazin_Boos.png walk:smc 2フレーム）
    newObject({ emoji: '👻', col: 8,  row: ROWS - 8, behavior: 'chase',   speed: 0.8, hazard: true,  hp: 1, bullet: 'none',
      name: 'テレサ', spriteRef: E.booRef, spriteUrl: E.booUrl }),
    // プクプク（水中）
    newObject({ emoji: '🐟', col: 12, row: ROWS - 4, behavior: 'patrolV', speed: 1.5, hazard: true,  hp: 1, bullet: 'none',
      name: 'プクプク' }),
    // キノピオ NPC (SMC: Toad_NPCs.png 静止表示)
    newObject({ emoji: '🍄', col: 3, row: ROWS - 3, behavior: 'still', hazard: false, hp: 1, bullet: 'none',
      objType: 'npc', message: 'キノピオだよ！音符ブロックを下から叩くと高くジャンプできるよ！チェックポイントを踏むと途中から再開できるよ！',
      spriteUrl: E.toadUrl }),
    // ピーチ姫（ゴール付近 NPC, SMC: Princesses.png 静止表示）
    newObject({ emoji: '👸', col: WCOLS - 3, row: ROWS - 3, behavior: 'still', hazard: false, hp: 1, bullet: 'none',
      objType: 'npc', message: 'マリオ！助けに来てくれてありがとう！クッパをやっつけて！',
      spriteUrl: E.princessUrl }),
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
    // 地下ネズミ（SMCに対応スプライトなし → RPGen維持）
    newObject({ emoji: '🐀', col: 5,  row: ROWS - 3, behavior: 'patrolH', speed: 1.2, hazard: true, hp: 1, bullet: 'none',
      spriteRef: wr93, spriteUrl: sa93 }),
    newObject({ emoji: '🐀', col: 13, row: ROWS - 3, behavior: 'patrolH', speed: 1.4, hazard: true, hp: 1, bullet: 'none',
      spriteRef: wr93, spriteUrl: sa93 }),
    // ホネクッパ（SMC: Dry_Bones.png walk:smc 2フレーム 16px）
    newObject({ emoji: '💀', col: 10, row: ROWS - 6, behavior: 'patrolH', speed: 1, hazard: true, hp: 3, bullet: 'none',
      name: 'ホネクッパ', spriteRef: E.dryBonesRef, spriteUrl: E.dryBonesUrl }),
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
