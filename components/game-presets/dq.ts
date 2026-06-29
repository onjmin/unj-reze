import { type PresetData, type SceneDef, newObject, COLS, ROWS, TILE_SIZE } from './shared';

// RPGen アセットURL
const sp  = (no: number) => `/api/rpgen/data/images/sprites/${no}.png`;
const sa  = (no: number) => `/api/rpgen/data/images/sAnims/${no}.png`;
const wr  = (no: number) => `walk:auto:u:${sa(no)}`;
const ir  = (no: number) => `url:${sp(no)}`;

// ── タイル定義 ─────────────────────────────────────────────────────────────
const tiles: PresetData['tiles'] = {
  0: { name: '平地',     color: '#3a9a4a', passable: true,  imageRef: ir(95),  imageUrl: sp(95)  },
  1: { name: '山/岩',   color: '#6b5a3a', passable: false, imageRef: ir(102), imageUrl: sp(102) },
  2: { name: '水',       color: '#2a5acb', passable: false, imageRef: ir(14),  imageUrl: sp(14)  },
  3: { name: '竜王の城', color: '#b0b0c0', passable: true,  special: 'goal',   imageRef: ir(358), imageUrl: sp(358) },
  4: { name: '森',       color: '#1f5a2a', passable: false, imageRef: ir(377), imageUrl: sp(377) },
  5: { name: '石床',     color: '#5a5a6a', passable: true,  imageRef: ir(121), imageUrl: sp(121) },
  6: { name: '壁',       color: '#3a3a4a', passable: false, imageRef: ir(371), imageUrl: sp(371) },
  7: { name: '扉',       color: '#c0802a', passable: true,  imageRef: ir(151), imageUrl: sp(151) },
};

// ── シーン1：フィールド ──────────────────────────────────────────────────────
const W = 30, H = 24;
const fieldMap = Array.from({ length: H }, (_, y) =>
  Array.from({ length: W }, (_, x) => {
    if (x === 0 || x === W - 1 || y === 0 || y === H - 1) return 1;
    if (y <= 1 && x >= 14 && x <= 16) return (y === 1 && x === 15) ? 3 : 1;
    if (x >= 4 && x <= 8 && y >= 6 && y <= 9) return 2;
    if (x >= 19 && x <= 24 && y >= 12 && y <= 15) return 2;
    if (x >= 10 && x <= 12 && y >= 4 && y <= 5) return 4;
    if (x >= 22 && x <= 25 && y >= 4 && y <= 6) return 4;
    if (x >= 6 && x <= 8 && y >= 16 && y <= 18) return 4;
    if (x >= 13 && x <= 15 && y >= 10 && y <= 12) return 1;
    if (x >= 2 && x <= 3 && y >= 12 && y <= 14) return 1;
    // 村（南端）
    if (x >= 5 && x <= 6 && y === 22) return 7;
    if (x >= 3 && x <= 8 && y >= 19 && y <= 22 && !(x >= 4 && x <= 7 && y >= 20 && y <= 21)) return 6;
    // 洞窟入口
    if (x === 9 && (y === 13 || y === 14)) return 7;
    return 0;
  })
);

const scene1: SceneDef = {
  id: 'field', name: 'フィールド',
  map: fieldMap,
  // ランダムエンカウント（平地・森を歩くと発生）
  randomEncounters: [
    { name: 'スライム',     emoji: '🟦', hp: 8,  atk: 7,  def: 3,  exp: 4  },
    { name: 'スライムベス', emoji: '🟥', hp: 11, atk: 9,  def: 4,  exp: 6  },
    { name: 'ドラキー',     emoji: '🦇', hp: 14, atk: 11, def: 6,  exp: 9  },
    { name: 'メーダ',       emoji: '👁️', hp: 24, atk: 18, def: 10, exp: 18, moves: [{ name: 'メラ', power: 14 }] },
    { name: 'がいこつ',     emoji: '💀', hp: 30, atk: 22, def: 14, exp: 26 },
    { name: 'まどうし',     emoji: '🧙', hp: 28, atk: 18, def: 12, exp: 30, moves: [{ name: 'ギラ', power: 16 }, { name: 'ホイミ', power: 20, heal: true }] },
  ],
  encounterRate: 14,
  bgm: { ref: 'https://www.youtube.com/watch?v=9rWBQNDlNW4', src: 'https://www.youtube.com/watch?v=9rWBQNDlNW4', type: 'youtube' },
  objects: [
    // NPC
    newObject({ emoji: '👴', col: 6, row: 21, behavior: 'still', hazard: false, message: 'よくきたな勇者よ！竜王の城は北にある。魔物に気をつけて進むのだ！',
      spriteRef: wr(30), spriteUrl: sa(30) }),
    newObject({ emoji: '👩', col: 5, row: 20, behavior: 'still', hazard: false, message: 'フィールドを歩くと魔物がおそってくるわ。やくそうを買って備えておくのよ！',
      spriteRef: wr(25), spriteUrl: sa(25) }),
    // シンボルエンカウント敵（フィールドに出現）
    newObject({ emoji: '🟦', name: 'スライム', col: 5, row: 16, hp: 8, atk: 7, def: 3, exp: 4,
      spriteRef: wr(556), spriteUrl: sa(556) }),
    newObject({ emoji: '🟦', name: 'スライム', col: 11, row: 17, hp: 8, atk: 7, def: 3, exp: 4,
      spriteRef: wr(556), spriteUrl: sa(556) }),
    newObject({ emoji: '🟥', name: 'スライムベス', col: 10, row: 14, hp: 11, atk: 9, def: 4, exp: 6,
      spriteRef: wr(662), spriteUrl: sa(662) }),
    newObject({ emoji: '🦇', name: 'ドラキー', col: 11, row: 6, hp: 14, atk: 11, def: 6, exp: 9,
      spriteRef: wr(233), spriteUrl: sa(233) }),
    newObject({ emoji: '🦇', name: 'ドラキー', col: 21, row: 7, hp: 14, atk: 11, def: 6, exp: 9,
      spriteRef: wr(233), spriteUrl: sa(233) }),
    newObject({ emoji: '👁️', name: 'メーダ', col: 13, row: 11, hp: 24, atk: 18, def: 10, exp: 18, moves: [{ name: 'メラ', power: 14 }],
      spriteRef: wr(50), spriteUrl: sa(50) }),
    newObject({ emoji: '💀', name: 'がいこつ', col: 4, row: 13, hp: 30, atk: 22, def: 14, exp: 26,
      spriteRef: wr(234), spriteUrl: sa(234) }),
    newObject({ emoji: '🧙', name: 'まどうし', col: 9, row: 8, hp: 28, atk: 18, def: 12, exp: 30, moves: [{ name: 'ギラ', power: 16 }, { name: 'ホイミ', power: 20, heal: true }],
      spriteRef: wr(102), spriteUrl: sa(102) }),
    // りゅうおう（ゴールボスは battle.boss で定義のため、ここは飾り）
    newObject({ emoji: '🐉', name: 'りゅうおう', col: 15, row: 3, behavior: 'still', hazard: true, isBoss: true,
      hp: 90, atk: 40, def: 24, exp: 200, moves: [{ name: 'はげしいほのお', power: 30 }, { name: 'ベホイミ', power: 28, heal: true }],
      spriteRef: wr(309), spriteUrl: sa(309) }),
    // 扉ワープ
    newObject({ emoji: '🚪', col: 5, row: 22, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'village', warpEntryCol: 5, warpEntryRow: ROWS - 3 }),
    newObject({ emoji: '🕳️', col: 9, row: 13, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'cave', warpEntryCol: 2, warpEntryRow: 2 }),
    // アイテムドロップ（フィールド上宝箱）
    newObject({ emoji: '👑', col: 18, row: 10, behavior: 'still', hazard: false,
      objType: 'item', itemId: 'wingBoots', message: '宝箱を開けた！「キメラのつばさ」を手に入れた！',
      spriteRef: wr(208), spriteUrl: sa(208) }),
  ],
};

// ── シーン2：村の中 ──────────────────────────────────────────────────────────
const villageMap = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (x === 0 || x === COLS - 1 || y === 0) return 6;
    if (y === ROWS - 1) return (x >= COLS / 2 - 1 && x <= COLS / 2 + 1) ? 7 : 6;
    return 5;
  })
);

const scene2: SceneDef = {
  id: 'village', name: '村の中',
  map: villageMap,
  bgm: { ref: 'https://www.youtube.com/watch?v=2GNKRGzApyM', src: 'https://www.youtube.com/watch?v=2GNKRGzApyM', type: 'youtube' },
  objects: [
    // 宿屋（HP/MP全回復）
    newObject({
      emoji: '🏥', col: 3, row: 3, behavior: 'still', hazard: false,
      spriteRef: wr(193), spriteUrl: sa(193),
      pages: [{
        conditions: {},
        commands: [
          { type: 'message', text: 'いらっしゃい。お休みになりますか？（ひとり 10 G）' },
          { type: 'choice', text: 'お休みになりますか？', choices: [
            { label: 'はい（10 G）', commands: [
              { type: 'ifGold', amount: 10,
                then: [
                  { type: 'changeGold', amount: -10 },
                  { type: 'restoreHp' },
                  { type: 'restoreMp' },
                  { type: 'message', text: 'おやすみなさい……\nHP と MP が全回復しました！' },
                ],
                else: [
                  { type: 'message', text: 'お金が足りないようですね……' },
                ],
              },
            ]},
            { label: 'いいえ', commands: [] },
          ]},
        ],
      }],
    }),
    // 道具屋（やくそう・どくけしそう・たいまつ販売）
    newObject({
      emoji: '⚔️', col: 14, row: 5, behavior: 'still', hazard: false,
      spriteRef: wr(207), spriteUrl: sa(207),
      shopItems: [
        { itemId: 'herb',      price: 8  },
        { itemId: 'antidote',  price: 10 },
        { itemId: 'torch',     price: 8  },
        { itemId: 'holyWater', price: 20 },
        { itemId: 'wingBoots', price: 80 },
      ],
      pages: [{
        conditions: {},
        commands: [
          { type: 'message', text: 'いらっしゃい！道具屋です。何を買いますか？' },
        ],
      }],
    }),
    // 武器防具屋
    newObject({
      emoji: '🗡️', col: 8, row: 3, behavior: 'still', hazard: false,
      spriteRef: wr(64), spriteUrl: sa(64),
      shopItems: [
        { itemId: 'copperSword',  price: 180 },
        { itemId: 'ironSword',    price: 500 },
        { itemId: 'leatherShield', price: 90 },
        { itemId: 'ironShield',   price: 350 },
        { itemId: 'leatherArmor', price: 70  },
        { itemId: 'chainMail',    price: 300 },
      ],
      pages: [{
        conditions: {},
        commands: [
          { type: 'message', text: 'いらっしゃい！武器防具屋です。旅を助ける装備をどうぞ。' },
        ],
      }],
    }),
    // 一般 NPC
    newObject({ emoji: '🧙‍♂️', col: 8, row: 5, behavior: 'still', hazard: false,
      message: '竜王は強い！まずレベルを上げろ！やくそうをたくさん持って行くのじゃ。',
      spriteRef: wr(64), spriteUrl: sa(64) }),
    newObject({ emoji: '👧', col: 6, row: 8, behavior: 'still', hazard: false,
      message: '洞窟の中には強い魔物がいるよ。でもすごいお宝もあるって！たいまつを持って行ってね。',
      spriteRef: wr(130), spriteUrl: sa(130) }),
    // 村出口
    newObject({ emoji: '🚪', col: COLS / 2, row: ROWS - 2, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'field', warpEntryCol: 6, warpEntryRow: 22 }),
  ],
};

// ── シーン3：洞窟 ────────────────────────────────────────────────────────────
const caveMap = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1) return 1;
    if (y >= 3 && y <= 5 && x >= 1 && x <= COLS - 2) return 5;
    if (x >= 8 && x <= 10 && y >= 5 && y <= ROWS - 2) return 5;
    if (y >= ROWS - 5 && y <= ROWS - 3 && x >= 8 && x <= COLS - 2) return 5;
    return 6;
  })
);

const scene3: SceneDef = {
  id: 'cave', name: '洞窟',
  map: caveMap,
  // 洞窟ランダムエンカウント（強めの敵）
  randomEncounters: [
    { name: 'がいこつ',   emoji: '💀', hp: 30, atk: 22, def: 14, exp: 26 },
    { name: 'まどうし',   emoji: '🧙', hp: 28, atk: 18, def: 12, exp: 30, moves: [{ name: 'ギラ', power: 16 }, { name: 'ホイミ', power: 20, heal: true }] },
    { name: 'メーダ',     emoji: '👁️', hp: 24, atk: 18, def: 10, exp: 18, moves: [{ name: 'メラ', power: 14 }] },
    { name: 'ゴーレム',   emoji: '🪨', hp: 45, atk: 28, def: 20, exp: 42 },
    { name: 'アントベア', emoji: '🐜', hp: 36, atk: 25, def: 16, exp: 35 },
  ],
  encounterRate: 10,
  bgm: { ref: 'https://www.youtube.com/watch?v=kpXqFuFe5pM', src: 'https://www.youtube.com/watch?v=kpXqFuFe5pM', type: 'youtube' },
  objects: [
    newObject({ emoji: '💀', name: 'がいこつ', col: 5, row: 4, behavior: 'patrolH', hp: 30, atk: 22, def: 14, exp: 26, hazard: true,
      spriteRef: wr(234), spriteUrl: sa(234) }),
    newObject({ emoji: '🧙', name: 'まどうし', col: 15, row: 4, behavior: 'chase', hp: 28, atk: 18, def: 12, exp: 30, hazard: true,
      moves: [{ name: 'ギラ', power: 16 }, { name: 'ホイミ', power: 20, heal: true }],
      spriteRef: wr(102), spriteUrl: sa(102) }),
    newObject({ emoji: '👁️', name: 'メーダ', col: 9, row: 8, behavior: 'patrolV', hp: 24, atk: 18, def: 10, exp: 18, hazard: true,
      moves: [{ name: 'メラ', power: 14 }],
      spriteRef: wr(50), spriteUrl: sa(50) }),
    // 宝箱（条件なし）
    newObject({ emoji: '👑', col: COLS - 3, row: ROWS - 4, behavior: 'still', hazard: false,
      objType: 'item', itemId: 'ironSword', message: '宝箱を開けた！「てつのつるぎ」を手に入れた！',
      spriteRef: wr(208), spriteUrl: sa(208) }),
    // スイッチで開く扉の奥の宝箱（イベントページ利用）
    newObject({
      emoji: '🔒', col: COLS - 5, row: ROWS - 4, behavior: 'still', hazard: false,
      spriteRef: wr(208), spriteUrl: sa(208),
      pages: [
        {
          conditions: { switchId: 1, switchValue: true },
          commands: [
            { type: 'giveItem', itemId: 'dragonScale', count: 1 },
            { type: 'message', text: '隠し宝箱から「りゅうのうろこ」を手に入れた！' },
            { type: 'setSelfSwitch', id: 'A', value: true },
          ],
        },
        {
          conditions: {},
          commands: [
            { type: 'message', text: 'かたく封印されている……何かのスイッチで開くようだ。' },
          ],
        },
      ],
    }),
    // 洞窟内のスイッチ
    newObject({
      emoji: '🔘', col: 12, row: 8, behavior: 'still', hazard: false,
      pages: [{
        conditions: {},
        commands: [
          { type: 'message', text: '古い石盤に刻まれたレリーフ……触れると何かが動いた！' },
          { type: 'setSwitch', switchId: 1, value: true },
        ],
      }],
    }),
    // 洞窟出口
    newObject({ emoji: '🕳️', col: 1, row: 4, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'field', warpEntryCol: 9, warpEntryRow: 13 }),
  ],
};

// ── プリセット本体 ────────────────────────────────────────────────────────
export const dq: PresetData = {
  id: 'dq', name: 'ドラクエ', engine: 'rpg', gravity: 0, friction: 0,
  player: {
    emoji: '🧝', color: '#4444ff', speed: 3, jumpPower: 0, w: 24, h: 24,
    start: { x: TILE_SIZE * 6, y: TILE_SIZE * 21 },
    spriteRef: wr(2), spriteUrl: sa(2),
  },
  tiles,
  map: JSON.parse(JSON.stringify(fieldMap)),
  objects: [...scene1.objects],
  scenes: [scene1, scene2, scene3],
  scroll: { worldCols: W, worldRows: H },
  battle: {
    playerName: '勇者',
    maxHp: 35, maxMp: 12, atk: 12, def: 6,
    gold: 120,
    moves: [
      { name: 'メラ',   cost: 3,  power: 14 },
      { name: 'ホイミ', cost: 4,  power: 22, heal: true },
      { name: 'ギラ',   cost: 5,  power: 18 },
      { name: 'ラリホー', cost: 3, power: 0  },
    ],
    labels: { attack: 'たたかう', move: 'じゅもん', flee: 'にげる' },
    // レベルアップテーブル
    levelTable: [
      { level: 2,  exp:    7,  maxHp: 41,  maxMp: 16, atk: 14, def: 7  },
      { level: 3,  exp:   23,  maxHp: 48,  maxMp: 20, atk: 16, def: 9  },
      { level: 4,  exp:   47,  maxHp: 54,  maxMp: 24, atk: 18, def: 11 },
      { level: 5,  exp:   92,  maxHp: 62,  maxMp: 28, atk: 20, def: 13 },
      { level: 6,  exp:  162,  maxHp: 70,  maxMp: 32, atk: 22, def: 15 },
      { level: 7,  exp:  272,  maxHp: 78,  maxMp: 36, atk: 24, def: 17 },
      { level: 8,  exp:  442,  maxHp: 86,  maxMp: 40, atk: 27, def: 19 },
      { level: 9,  exp:  692,  maxHp: 94,  maxMp: 44, atk: 30, def: 22 },
      { level: 10, exp: 1042,  maxHp: 102, maxMp: 48, atk: 34, def: 25 },
      { level: 11, exp: 1542,  maxHp: 110, maxMp: 52, atk: 38, def: 28 },
      { level: 12, exp: 2242,  maxHp: 118, maxMp: 56, atk: 42, def: 32 },
    ],
    // ゴールボス（竜王）
    boss: {
      name: 'りゅうおう', emoji: '🐉',
      hp: 90, atk: 40, def: 24, exp: 200,
      moves: [{ name: 'はげしいほのお', power: 30 }, { name: 'ベホイミ', power: 28, heal: true }],
    },
    outroDialogue: [
      { speaker: 'りゅうおう', emoji: '🐉', text: 'ぐわっ……まさか……こんなところで……' },
      { speaker: '勇者', emoji: '🧝', text: 'ローラ姫を解放しろ！' },
      { speaker: 'りゅうおう', emoji: '🐉', text: '……おのれ勇者よ……この竜王……いつか必ず復活してやる……' },
    ],
  },
  switches: [
    { id: 1, name: '洞窟の石盤スイッチON' },
    { id: 2, name: 'ローラ姫を救出' },
    { id: 3, name: '竜王を倒した' },
  ],
  items: [
    { id: 'herb',         name: 'やくそう',         emoji: '🌿', description: 'HPを約 30 回復するやくそう',                category: 'consumable' },
    { id: 'antidote',     name: 'どくけしそう',     emoji: '🍃', description: '毒の状態を回復する草',                      category: 'consumable' },
    { id: 'torch',        name: 'たいまつ',         emoji: '🔦', description: '暗い洞窟を明るく照らす。数歩ごとに消耗',    category: 'key' },
    { id: 'holyWater',    name: 'せいすい',         emoji: '💧', description: '周囲の魔物を一定時間遠ざける聖なる水',      category: 'consumable' },
    { id: 'wingBoots',    name: 'キメラのつばさ',   emoji: '🪽', description: '使うと村に瞬間移動できる不思議な翼',        category: 'key' },
    { id: 'magicKey',     name: 'まほうのカギ',     emoji: '🗝️', description: '魔法で封印された扉を開く鍵',               category: 'key' },
    { id: 'dragonScale',  name: 'りゅうのうろこ',   emoji: '🐉', description: '竜のうろこで作られた鎧。守備力＋7',         category: 'armor',  defBonus: 7 },
    { id: 'copperSword',  name: 'どうのつるぎ',     emoji: '🗡️', description: '銅製の剣。攻撃力＋10',                     category: 'weapon', atkBonus: 10 },
    { id: 'ironSword',    name: 'てつのつるぎ',     emoji: '⚔️',  description: '鉄製の剣。攻撃力＋20',                     category: 'weapon', atkBonus: 20 },
    { id: 'leatherShield', name: 'かわのたて',      emoji: '🛡️', description: '革製の盾。守備力＋4',                      category: 'armor',  defBonus: 4 },
    { id: 'ironShield',   name: 'てつのたて',       emoji: '🛡️', description: '鉄製の盾。守備力＋10',                     category: 'armor',  defBonus: 10 },
    { id: 'leatherArmor', name: 'かわよろい',       emoji: '👘', description: '革製の鎧。守備力＋6',                      category: 'armor',  defBonus: 6 },
    { id: 'chainMail',    name: 'くさりかたびら',   emoji: '🧥', description: '鎖を編んだ鎧。守備力＋13',                  category: 'armor',  defBonus: 13 },
  ],
  titleScreen: {
    enabled: true,
    heading: 'ドラゴンクエスト',
    subtitle: '竜王を倒し、ローラ姫を救い出せ！',
    textColor: '#ffee88',
    menu: [
      { kind: 'newGame',   label: 'ぼうけんをはじめる' },
      { kind: 'continue',  label: 'ぼうけんのしょを読む' },
      { kind: 'nameInput', label: 'なまえをいれる' },
    ],
  },
  ending: {
    enabled: true,
    heading: 'おめでとう！',
    message: '竜王を倒し、ローラ姫を救い出した！\n平和がラルス王国に戻ってきた。\n\nそなたの勇気と知恵は永遠に語り継がれるだろう。',
    textColor: '#ffee88',
  },
  bgm: { ref: 'https://www.youtube.com/watch?v=HYjTiY6RITE', src: 'https://www.youtube.com/watch?v=HYjTiY6RITE', type: 'youtube' },
  battleBgm: { ref: 'https://www.youtube.com/watch?v=Str7rMSDhcI', src: 'https://www.youtube.com/watch?v=Str7rMSDhcI', type: 'youtube' },
  bossBgm:   { ref: 'https://www.youtube.com/watch?v=9QzO_4pMZPY', src: 'https://www.youtube.com/watch?v=9QzO_4pMZPY', type: 'youtube' },
  sfx: {
    levelup:  { ref: 'direct:https://rpgen.org/dq/sound/res/222.mp3', src: 'https://rpgen.org/dq/sound/res/222.mp3', type: 'direct' as const },
    purchase: { ref: 'direct:https://rpgen.org/dq/sound/res/1848.mp3', src: 'https://rpgen.org/dq/sound/res/1848.mp3', type: 'direct' as const },
    inn:      { ref: 'direct:https://rpgen.org/dq/sound/res/3.mp3', src: 'https://rpgen.org/dq/sound/res/3.mp3', type: 'direct' as const },
    damage:   { ref: 'direct:https://rpgen.org/dq/sound/res/1845.mp3', src: 'https://rpgen.org/dq/sound/res/1845.mp3', type: 'direct' as const },
    clear:    { ref: 'clear' },
  },
};
