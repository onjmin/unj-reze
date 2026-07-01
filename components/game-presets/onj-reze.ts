import { type PresetData, type SceneDef, newObject, COLS, ROWS, TILE_SIZE } from './shared';
import { spriteUrl as sp, sAnimUrl as sa } from '@/lib/rpgen-assets';
// id は rpgen-search API の id フィールド（ハッシュ文字列）
const wr  = (id: string) => `walk:auto:u:${sa(id)}`;
const ir  = (id: string) => `url:${sp(id)}`;

// ── タイル定義 ─────────────────────────────────────────────────────────────
const GRASS = 0, WALL = 1, WATER = 2, FLOOR = 3, BWALL = 4, DOOR = 5, FOREST = 6, PATH = 7;

const tiles: PresetData['tiles'] = {
  [GRASS]:  { name: '草地',   color: '#3a9a4a', passable: true,  imageRef: ir('seHP8GT'), imageUrl: sp('seHP8GT') },
  [WALL]:   { name: '岩山',   color: '#6b5a3a', passable: false, imageRef: ir('7COldwt'), imageUrl: sp('7COldwt') },
  [WATER]:  { name: '川',     color: '#2a5acb', passable: false, imageRef: ir('4vGDOZE'), imageUrl: sp('4vGDOZE') },
  [FLOOR]:  { name: '石床',   color: '#5a5a6a', passable: true,  imageRef: ir('sTJ89N'),  imageUrl: sp('sTJ89N')  },
  [BWALL]:  { name: '建物壁', color: '#3a3a4a', passable: false, imageRef: ir('vcyXmCw'), imageUrl: sp('vcyXmCw') },
  [DOOR]:   { name: '扉',     color: '#c0802a', passable: true,  imageRef: ir('p6oDkn7'), imageUrl: sp('p6oDkn7') },
  [FOREST]: { name: '森',     color: '#1f5a2a', passable: false, imageRef: ir('IoHgv20'), imageUrl: sp('IoHgv20') },
  [PATH]:   { name: '道',     color: '#9a8a6a', passable: true,  imageRef: ir('lP5YiFj'), imageUrl: sp('lP5YiFj') },
};

// ── シーン1：レゼの街 ──────────────────────────────────────────────────────
// 20×15 の街。外壁BWALL・内部FLOOR。左奥=宿屋、右奥=道具屋。南端中央が出口。
const townMap = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (x === 0 || x === COLS - 1 || y === 0) return BWALL;
    if (y === ROWS - 1) return (x === 9 || x === 10) ? DOOR : BWALL;
    // 宿屋（左上）: cols 1-5, rows 2-4
    if (x >= 1 && x <= 5 && y >= 2 && y <= 4) {
      if (x === 1 || x === 5 || y === 2) return BWALL;
      return FLOOR;
    }
    if (x === 3 && y === 5) return DOOR;
    // 道具屋（右上）: cols 14-18, rows 2-4
    if (x >= 14 && x <= 18 && y >= 2 && y <= 4) {
      if (x === 14 || x === 18 || y === 2) return BWALL;
      return FLOOR;
    }
    if (x === 16 && y === 5) return DOOR;
    return FLOOR;
  })
);

const scene1: SceneDef = {
  id: 'town', name: 'レゼの街',
  map: townMap,
  bgm: { ref: 'https://www.youtube.com/watch?v=0_jEpB40aYw', src: 'https://www.youtube.com/watch?v=0_jEpB40aYw', type: 'youtube' },
  objects: [
    // ── 宿屋 ──
    newObject({
      emoji: '🏥', col: 2, row: 3, behavior: 'still', hazard: false,
      spriteRef: wr('M05nRh'), spriteUrl: sa('M05nRh'),
      pages: [{
        conditions: {},
        commands: [
          { type: 'message', text: 'いらっしゃい！宿泊料は 10G やで。疲れたら休んでいき〜' },
          { type: 'choice', text: 'お休みになりますか？', choices: [
            { label: 'はい（10 G）', commands: [
              { type: 'ifGold', amount: 10,
                then: [
                  { type: 'changeGold', amount: -10 },
                  { type: 'restoreHp' },
                  { type: 'restoreMp' },
                  { type: 'message', text: 'ゆっくり休めたで……\nHP と MP が全回復したで！' },
                ],
                else: [{ type: 'message', text: 'G が足りへんやんけ……' }],
              },
            ]},
            { label: 'いいえ', commands: [] },
          ]},
        ],
      }],
    }),
    // ── 道具屋 ──
    newObject({
      emoji: '🛒', col: 16, row: 3, behavior: 'still', hazard: false,
      spriteRef: wr('P2dNvQ'), spriteUrl: sa('P2dNvQ'),
      shopItems: [
        { itemId: 'herb',      price: 8  },
        { itemId: 'antidote',  price: 10 },
        { itemId: 'holyWater', price: 20 },
        { itemId: 'wingBoots', price: 80 },
      ],
      pages: [{
        conditions: {},
        commands: [
          { type: 'message', text: 'いらっしゃい！フィールドは危ないさかい、しっかり準備してから行きや！' },
        ],
      }],
    }),
    // ── NPC ──
    newObject({ emoji: '👨', col: 8, row: 6, behavior: 'still', hazard: false,
      message: 'ここはレゼが守る街や。南の門の外はフィールドで、デビルの手下がうろついとるで。気をつけてな。',
      spriteRef: wr('xP8oPz'), spriteUrl: sa('xP8oPz') }),
    newObject({ emoji: '👩', col: 13, row: 8, behavior: 'still', hazard: false,
      message: 'レゼちゃんって爆弾少女やんな……ボムのチカラで魔物を倒してくるんや！\nやくそうは多めに持って行きや！',
      spriteRef: wr('okIlh5'), spriteUrl: sa('okIlh5') }),
    newObject({ emoji: '🧑', col: 5, row: 11, behavior: 'still', hazard: false,
      message: 'ワイはおんJのスレ民や。このスレの住民みんなでデビルと戦っとるで！\nまずは草原のザコから慣れてみ。北の森には強い魔物おるで。',
      spriteRef: wr('mLHxrK'), spriteUrl: sa('mLHxrK') }),
    newObject({ emoji: '👴', col: 16, row: 11, behavior: 'still', hazard: false,
      message: 'フィールドの奥には強いデビルがおるぞ。レベルを上げてから挑むんじゃ。\nボムのわざを覚えたら一気に楽になる。',
      spriteRef: wr('M05nRh'), spriteUrl: sa('M05nRh') }),
    newObject({ emoji: '👧', col: 10, row: 12, behavior: 'still', hazard: false,
      message: 'フィールドを北に向かうと草原が広がっとるよ。川を渡れへんさかい、道沿いに進むんや。\nせいすいを持ってくと魔物を一時的に遠ざけられるで！',
      spriteRef: wr('TO81en'), spriteUrl: sa('TO81en') }),
    // ── 街の出口ワープ ──
    newObject({ emoji: '🚪', col: 9,  row: ROWS - 2, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'field', warpEntryCol: 14, warpEntryRow: 3 }),
    newObject({ emoji: '🚪', col: 10, row: ROWS - 2, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'field', warpEntryCol: 15, warpEntryRow: 3 }),
  ],
};

// ── シーン2：フィールド ────────────────────────────────────────────────────
// 30×24 のスクロールマップ。北端中央に街入口、川・森・岩山あり。
const FW = 30, FH = 24;
const fieldMap = Array.from({ length: FH }, (_, y) =>
  Array.from({ length: FW }, (_, x) => {
    if (x === 0 || x === FW - 1 || y === 0 || y === FH - 1) return WALL;
    // 街への帰還路（北端）
    if (y <= 2 && (x === 14 || x === 15)) return PATH;
    // 岩山（左端・右端・南端）
    if (x <= 2) return WALL;
    if (x >= FW - 3) return WALL;
    if (y >= FH - 3 && x >= 3 && x <= FW - 4) return WALL;
    // 森（左上・右中・左下）
    if (x >= 5 && x <= 10 && y >= 5 && y <= 11) return FOREST;
    if (x >= 18 && x <= 24 && y >= 8 && y <= 14) return FOREST;
    if (x >= 4 && x <= 9  && y >= 16 && y <= 20) return FOREST;
    // 川（中央縦＋横）
    if (x >= 12 && x <= 13 && y >= 6 && y <= 17) return WATER;
    if (y >= 12 && y <= 13 && x >= 8 && x <= 15) return WATER;
    // 縦の道（北から南へ）
    if ((x === 14 || x === 15) && y >= 1 && y <= 12) return PATH;
    // 横の道（中央右へ）
    if ((y === 10 || y === 11) && x >= 14 && x <= 22) return PATH;
    return GRASS;
  })
);

const scene2: SceneDef = {
  id: 'field', name: 'フィールド',
  map: fieldMap,
  randomEncounters: [
    { name: 'ゾンビ',       emoji: '🧟', hp: 10, atk: 8,  def: 3,  exp: 5  },
    { name: 'カルト信者',   emoji: '🧎', hp: 14, atk: 11, def: 4,  exp: 8  },
    { name: 'デビル兵',     emoji: '😈', hp: 20, atk: 14, def: 7,  exp: 14, moves: [{ name: 'つかみかかる', power: 12 }] },
    { name: '魔人の手下',   emoji: '💀', hp: 30, atk: 20, def: 12, exp: 25 },
    { name: 'コウモリデビル', emoji: '🦇', hp: 18, atk: 13, def: 6, exp: 18, moves: [{ name: '毒爪', power: 10 }] },
    { name: '上位デビル',   emoji: '👿', hp: 40, atk: 26, def: 16, exp: 40, moves: [{ name: '魔力砲', power: 20 }, { name: '自己修復', power: 16, heal: true }] },
  ],
  encounterRate: 14,
  bgm: { ref: 'https://www.youtube.com/watch?v=9rWBQNDlNW4', src: 'https://www.youtube.com/watch?v=9rWBQNDlNW4', type: 'youtube' },
  objects: [
    // ── 街帰還ワープ（北端の道） ──
    newObject({ emoji: '🏠', col: 14, row: 1, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'town', warpEntryCol: 9, warpEntryRow: ROWS - 3 }),
    newObject({ emoji: '🏠', col: 15, row: 1, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'town', warpEntryCol: 10, warpEntryRow: ROWS - 3 }),
    // ── シンボルエンカウント敵 ──
    newObject({ emoji: '🧟', name: 'ゾンビ',     col: 8,  row: 7,  behavior: 'patrolH', speed: 0.8, hp: 10, atk: 8,  def: 3,  exp: 5,  hazard: true,
      spriteRef: wr('pyPkIs'), spriteUrl: sa('pyPkIs') }),
    newObject({ emoji: '🧎', name: 'カルト信者', col: 16, row: 6,  behavior: 'random',  speed: 1.0, hp: 14, atk: 11, def: 4,  exp: 8,  hazard: true,
      spriteRef: wr('tSHy6V'), spriteUrl: sa('tSHy6V') }),
    newObject({ emoji: '😈', name: 'デビル兵',   col: 20, row: 10, behavior: 'chase',   speed: 1.2, hp: 20, atk: 14, def: 7,  exp: 14, hazard: true,
      moves: [{ name: 'つかみかかる', power: 12 }],
      spriteRef: wr('zA2cuG'), spriteUrl: sa('zA2cuG') }),
    newObject({ emoji: '🦇', name: 'コウモリデビル', col: 24, row: 9,  behavior: 'random',  speed: 1.3, hp: 18, atk: 13, def: 6,  exp: 18, hazard: true,
      moves: [{ name: '毒爪', power: 10 }],
      spriteRef: wr('R42ett'), spriteUrl: sa('R42ett') }),
    newObject({ emoji: '💀', name: '魔人の手下', col: 11, row: 16, behavior: 'patrolV', speed: 1.1, hp: 30, atk: 20, def: 12, exp: 25, hazard: true,
      spriteRef: wr('pyPkIs'), spriteUrl: sa('pyPkIs') }),
    newObject({ emoji: '👿', name: '上位デビル',  col: 22, row: 13, behavior: 'chase',   speed: 1.4, hp: 40, atk: 26, def: 16, exp: 40, hazard: true,
      moves: [{ name: '魔力砲', power: 20 }, { name: '自己修復', power: 16, heal: true }],
      spriteRef: wr('Ilpvcu'), spriteUrl: sa('Ilpvcu') }),
    // ── フィールド NPC ──
    newObject({ emoji: '🧑', col: 17, row: 5, behavior: 'still', hazard: false,
      message: '道の先に強い魔人がいるって噂や。Lv5 以上になってから挑んだ方がええで。',
      spriteRef: wr('mLHxrK'), spriteUrl: sa('mLHxrK') }),
    // ── 宝箱 ──
    newObject({ emoji: '👑', col: 26, row: 11, behavior: 'still', hazard: false,
      objType: 'item', itemId: 'herb', message: '宝箱を開けた！「やくそう」を手に入れた！',
      spriteRef: ir('lzUOisL'), spriteUrl: sp('lzUOisL') }),
    newObject({ emoji: '🎁', col: 7, row: 19, behavior: 'still', hazard: false,
      objType: 'item', itemId: 'holyWater', message: '草むらの中に「せいすい」が落ちていた！',
      spriteRef: ir('lzUOisL'), spriteUrl: sp('lzUOisL') }),
  ],
};

// ── プリセット本体 ─────────────────────────────────────────────────────────
export const onjReze: PresetData = {
  id: 'onjReze', name: 'おんｊレゼ', engine: 'rpg', gravity: 0, friction: 0,
  player: {
    emoji: '🧨', color: '#ff5c7a', speed: 3, jumpPower: 0, w: 24, h: 24,
    start: { x: TILE_SIZE * 10, y: TILE_SIZE * 10 },
    spriteRef: wr('TO81en'), spriteUrl: sa('TO81en'),
  },
  tiles,
  map: townMap,
  objects: [...scene1.objects],
  scenes: [scene1, scene2],
  scroll: { worldCols: FW, worldRows: FH },
  battle: {
    playerName: 'レゼ',
    maxHp: 35, maxMp: 14, atk: 12, def: 6,
    gold: 50,
    moves: [
      { name: 'ボム',     cost: 3, power: 16 },
      { name: 'ホイミ',   cost: 4, power: 22, heal: true },
      { name: 'バクハツ', cost: 7, power: 28 },
    ],
    labels: { attack: 'たたかう', move: 'わざ', flee: 'にげる' },
    levelTable: [
      { level: 2,  exp:   10, maxHp: 42,  maxMp: 18, atk: 14, def: 8  },
      { level: 3,  exp:   28, maxHp: 50,  maxMp: 22, atk: 16, def: 10 },
      { level: 4,  exp:   58, maxHp: 58,  maxMp: 26, atk: 18, def: 12 },
      { level: 5,  exp:  108, maxHp: 66,  maxMp: 30, atk: 21, def: 14 },
      { level: 6,  exp:  188, maxHp: 74,  maxMp: 34, atk: 24, def: 16 },
      { level: 7,  exp:  308, maxHp: 82,  maxMp: 38, atk: 27, def: 19 },
      { level: 8,  exp:  488, maxHp: 90,  maxMp: 42, atk: 30, def: 22 },
      { level: 9,  exp:  748, maxHp: 98,  maxMp: 46, atk: 33, def: 25 },
      { level: 10, exp: 1108, maxHp: 106, maxMp: 50, atk: 37, def: 28 },
    ],
  },
  items: [
    { id: 'herb',      name: 'やくそう',       emoji: '🌿', description: 'HPを約30回復する薬草',            category: 'consumable' },
    { id: 'antidote',  name: 'どくけしそう',   emoji: '🍃', description: '毒を回復する草',                  category: 'consumable' },
    { id: 'holyWater', name: 'せいすい',       emoji: '💧', description: '周囲の魔物を一定時間遠ざける聖水', category: 'consumable' },
    { id: 'wingBoots', name: 'キメラのつばさ', emoji: '🪽', description: '使うと街に瞬間移動できる翼',      category: 'key' },
  ],
  titleScreen: {
    enabled: true,
    heading: 'おんｊレゼ',
    subtitle: 'レゼの街を拠点に、フィールドを探検しよう！',
    textColor: '#ffaacc',
    menu: [
      { kind: 'newGame',   label: 'ぼうけんをはじめる' },
      { kind: 'continue',  label: 'ぼうけんのしょを読む' },
      { kind: 'nameInput', label: 'なまえをいれる' },
    ],
  },
  bgm: { ref: 'https://www.youtube.com/watch?v=0_jEpB40aYw', src: 'https://www.youtube.com/watch?v=0_jEpB40aYw', type: 'youtube' },
  sfx: {
    clear:  { ref: 'clear' },
    damage: { ref: 'damage' },
  },
};
