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
      spriteRef: wr('oLrlUq'), spriteUrl: sa('oLrlUq'),
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
      spriteRef: wr('4KtOzD'), spriteUrl: sa('4KtOzD'),
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
      message: 'この街の喫茶店で働いとったレゼ、実は爆弾の混血で、組織の鍵を持って街を出てもうてな。\n今はフィールドで暴れとるらしいで。気をつけてな。',
      spriteRef: wr('qhy37c'), spriteUrl: sa('qhy37c') }),
    newObject({ emoji: '👩', col: 13, row: 8, behavior: 'still', hazard: false,
      message: 'レゼ、爆弾を投げてくるから離れて戦うんやで……直撃はもちろん、爆風の範囲も危ないから距離感ミスったらあかんで！\nやくそうは多めに持って行きや！',
      spriteRef: wr('nabqyI'), spriteUrl: sa('nabqyI') }),
    newObject({ emoji: '🧑', col: 5, row: 11, behavior: 'still', hazard: false,
      message: 'ワイはなんJ民や。昔レゼが淹れてくれたコーヒー、めちゃ美味かったんやで……今はもう戦うしかないんが悲しいわ。\nフィールドに出たらレゼがおるはずや。',
      spriteRef: ir('lIjiPk'), spriteUrl: sp('lIjiPk') }),
    newObject({ emoji: '👴', col: 16, row: 11, behavior: 'still', hazard: false,
      message: 'フィールドの奥でレゼが彷徨っとるぞ。レベルを上げてから挑むんじゃ。\n剣を振り回すコツを掴んだら一気に楽になる。',
      spriteRef: wr('oLrlUq'), spriteUrl: sa('oLrlUq') }),
    newObject({ emoji: '👧', col: 10, row: 12, behavior: 'still', hazard: false,
      message: 'フィールドを北に向かうと草原が広がっとるよ。川を渡れへんさかい、道沿いに進むんや。\nやくそうは多めに持って行きや！',
      spriteRef: wr('4KtOzD'), spriteUrl: sa('4KtOzD') }),
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
  bgm: { ref: 'https://www.youtube.com/watch?v=0_jEpB40aYw', src: 'https://www.youtube.com/watch?v=0_jEpB40aYw', type: 'youtube' },
  objects: [
    // ── 街帰還ワープ（北端の道） ──
    newObject({ emoji: '🏠', col: 14, row: 1, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'town', warpEntryCol: 9, warpEntryRow: ROWS - 3 }),
    newObject({ emoji: '🏠', col: 15, row: 1, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'town', warpEntryCol: 10, warpEntryRow: ROWS - 3 }),
    // ── レゼ（爆弾を投げてくる敵）──
    newObject({ emoji: '🧨', name: 'レゼ', col: 20, row: 18, behavior: 'chase', speed: 0.9, hp: 50, atk: 30, def: 18, exp: 60, hazard: true,
      spriteRef: wr('US6LgA'), spriteUrl: sa('US6LgA') }),
    // ── フィールド NPC ──
    newObject({ emoji: '🧑', col: 17, row: 5, behavior: 'still', hazard: false,
      message: '道の先にレゼがおるって噂や。爆弾を投げてくるから気をつけてな。',
      spriteRef: wr('qhy37c'), spriteUrl: sa('qhy37c') }),
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
  id: 'onjReze', name: 'おんｊレゼ', engine: 'onjReze', gravity: 0, friction: 0,
  player: {
    emoji: '🧑', color: '#66aaff', speed: 3, jumpPower: 0, w: TILE_SIZE, h: TILE_SIZE,
    start: { x: TILE_SIZE * 10, y: TILE_SIZE * 10 },
    spriteRef: wr('4rSOzo'), spriteUrl: sa('4rSOzo'),
  },
  tiles,
  map: townMap,
  objects: [...scene1.objects],
  scenes: [scene1, scene2],
  scroll: { worldCols: FW, worldRows: FH },
  items: [
    { id: 'herb',      name: 'やくそう',       emoji: '🌿', description: 'HPを約30回復する薬草',            category: 'consumable' },
    { id: 'antidote',  name: 'どくけしそう',   emoji: '🍃', description: '毒を回復する草',                  category: 'consumable' },
    { id: 'holyWater', name: 'せいすい',       emoji: '💧', description: '周囲の魔物を一定時間遠ざける聖水', category: 'consumable' },
    { id: 'wingBoots', name: 'キメラのつばさ', emoji: '🪽', description: '使うと街に瞬間移動できる翼',      category: 'key' },
  ],
  titleScreen: {
    enabled: true,
    heading: 'おんｊレゼ',
    subtitle: 'なんJ民として、爆弾を投げてくるレゼたちに立ち向かおう！',
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
