import { type PresetData, type SceneDef, newObject, COLS, ROWS, TILE_SIZE } from './shared';
import { spriteUrl as sp, sAnimUrl as sa } from '@/lib/rpgen-assets';
// id は rpgen-search API の id フィールド（ハッシュ文字列）
const wr  = (id: string) => `walk:auto:u:${sa(id)}`;
const ir  = (id: string) => `url:${sp(id)}`;
// フィールド用マップチップ（旧 gomi.html / tmp/gomi/gomi2.json と同じ field.png チップシート。16pxマス・30列）。
// sx,sy は元データのタイルID(id%30*16, floor(id/30)*16)から算出したチップ切り出し座標。
const FIELD_TILESET = '/assets/rpg-reze/field.png';
const fu = (sx: number, sy: number) => `${FIELD_TILESET}#${sx},${sy},16,16`;
const fr = (sx: number, sy: number) => `url:${fu(sx, sy)}`;

// ── タイル定義 ─────────────────────────────────────────────────────────────
const GRASS = 0, WALL = 1, WATER = 2, FLOOR = 3, BWALL = 4, DOOR = 5, FOREST = 6, PATH = 7, ROAD = 8;
// gomi2.json のフィールドチップID（100+元ID）。tmp/gomi/gomi2.json の blockedTiles([150,363]) を通行不可に反映。
const F_TILE_BASE = 100;

const tiles: PresetData['tiles'] = {
  [GRASS]:  { name: '草地',     color: '#3a9a4a', passable: true,  imageRef: ir('seHP8GT'), imageUrl: sp('seHP8GT') },
  [WALL]:   { name: '岩山',     color: '#6b5a3a', passable: false, imageRef: ir('7COldwt'), imageUrl: sp('7COldwt') },
  [WATER]:  { name: '川',       color: '#2a5acb', passable: false, imageRef: ir('4vGDOZE'), imageUrl: sp('4vGDOZE') },
  [FLOOR]:  { name: '歩道',     color: '#8a8a92', passable: true,  imageRef: ir('sTJ89N'),  imageUrl: sp('sTJ89N')  },
  [BWALL]:  { name: 'ビル壁',   color: '#2a2a38', passable: false, imageRef: ir('vcyXmCw'), imageUrl: sp('vcyXmCw') },
  [DOOR]:   { name: '扉',       color: '#c0802a', passable: true,  imageRef: ir('p6oDkn7'), imageUrl: sp('p6oDkn7') },
  [FOREST]: { name: '森',       color: '#1f5a2a', passable: false, imageRef: ir('IoHgv20'), imageUrl: sp('IoHgv20') },
  [PATH]:   { name: '道',       color: '#9a8a6a', passable: true,  imageRef: ir('lP5YiFj'), imageUrl: sp('lP5YiFj') },
  [ROAD]:   { name: 'アスファルト', color: '#33363c', passable: true,  imageRef: ir('lP5YiFj'), imageUrl: sp('lP5YiFj') },
  // ── フィールドチップ（tmp/gomi/gomi2.json の実データから移植）──
  [F_TILE_BASE + 67]:  { name: 'Field67',  color: '#556b2f', passable: true,  imageRef: fr(112, 32),  imageUrl: fu(112, 32) },
  [F_TILE_BASE + 150]: { name: 'Field150', color: '#556b2f', passable: false, imageRef: fr(0, 80),    imageUrl: fu(0, 80) },
  [F_TILE_BASE + 270]: { name: 'Field270', color: '#556b2f', passable: true,  imageRef: fr(0, 144),   imageUrl: fu(0, 144) },
  [F_TILE_BASE + 304]: { name: 'Field304', color: '#556b2f', passable: true,  imageRef: fr(64, 160),  imageUrl: fu(64, 160) },
  [F_TILE_BASE + 352]: { name: 'Field352', color: '#556b2f', passable: true,  imageRef: fr(352, 176), imageUrl: fu(352, 176) },
  [F_TILE_BASE + 360]: { name: 'Field360', color: '#556b2f', passable: true,  imageRef: fr(0, 192),   imageUrl: fu(0, 192) },
  [F_TILE_BASE + 363]: { name: 'Field363', color: '#556b2f', passable: false, imageRef: fr(48, 192),  imageUrl: fu(48, 192) },
};

// ── シーン1：都会の街（レゼの街） ────────────────────────────────────────
// 20×15 の都会フィールド。中央十字の車道＋歩道でブロック分割された街並み。
// 北西=宿屋、北東=道具屋、南西=喫茶店（レゼが働いていた思い出の店）、南東=花屋（原作でデンジがレゼに贈った花を扱う店）。南端中央が出口。
const townMap = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (x === 0 || x === COLS - 1 || y === 0) return BWALL;
    if (y === ROWS - 1) return (x === 9 || x === 10) ? DOOR : BWALL;
    // 中央十字の車道（都会らしいメインストリート）
    if (x === 9 || x === 10) return ROAD;
    if (y === 7 || y === 8) return ROAD;
    // 宿屋（北西）: cols 2-6, rows 2-4
    if (x >= 2 && x <= 6 && y >= 2 && y <= 4) {
      if (x === 2 || x === 6 || y === 2) return BWALL;
      return FLOOR;
    }
    if (x === 4 && y === 5) return DOOR;
    // 道具屋（北東）: cols 13-17, rows 2-4
    if (x >= 13 && x <= 17 && y >= 2 && y <= 4) {
      if (x === 13 || x === 17 || y === 2) return BWALL;
      return FLOOR;
    }
    if (x === 15 && y === 5) return DOOR;
    // 喫茶店（南西・レゼの思い出の店）: cols 2-6, rows 10-12
    if (x >= 2 && x <= 6 && y >= 10 && y <= 12) {
      if (x === 2 || x === 6 || y === 10) return BWALL;
      return FLOOR;
    }
    if (x === 4 && y === 13) return DOOR;
    // 花屋（南東・原作でデンジがレゼに贈った花を扱う店）: cols 13-17, rows 10-12
    if (x >= 13 && x <= 17 && y >= 10 && y <= 12) {
      if (x === 13 || x === 17 || y === 10) return BWALL;
      return FLOOR;
    }
    if (x === 15 && y === 13) return DOOR;
    // 歩道（それ以外の区画）
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
      emoji: '🏥', col: 4, row: 3, behavior: 'still', hazard: false,
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
    // ── 宿屋の内装 ──
    newObject({ kind: 'tile', col: 3, row: 4, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('xPARoP7'), spriteUrl: sp('xPARoP7') }), // ベッド
    newObject({ kind: 'tile', col: 5, row: 3, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('X1eDb1H'), spriteUrl: sp('X1eDb1H') }), // 本棚
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
    // ── 道具屋の内装 ──
    newObject({ kind: 'tile', col: 15, row: 3, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('EVAhBn'), spriteUrl: sp('EVAhBn') }), // レジカウンター
    newObject({ kind: 'tile', col: 14, row: 4, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('7aMId2X'), spriteUrl: sp('7aMId2X') }), // ミニ冷蔵庫
    // ── NPC ──
    newObject({ emoji: '👨', col: 8, row: 6, behavior: 'still', hazard: false,
      message: 'この街の喫茶店で働いとったレゼ、実は爆弾の混血で、組織の鍵を持って街を出てもうてな。\n今はフィールドで暴れとるらしいで。気をつけてな。',
      spriteRef: wr('qhy37c'), spriteUrl: sa('qhy37c') }),
    newObject({ emoji: '👩', col: 12, row: 9, behavior: 'still', hazard: false,
      message: 'レゼ、爆弾を投げてくるから離れて戦うんやで……直撃はもちろん、爆風の範囲も危ないから距離感ミスったらあかんで！\nやくそうは多めに持って行きや！',
      spriteRef: wr('nabqyI'), spriteUrl: sa('nabqyI') }),
    // ── 喫茶店の思い出（レゼ回想イベント）──
    // 話しかけるたびにセルフスイッチが進み、出会い→甘い罠→兵器としての正体、と
    // レゼの人物像が変化していく様を辿れる。セリフは各章で最も印象的な一節のみを厳選。
    // レゼ本人以外にこれらの台詞を言わせない（他NPCは間接的な噂話に留める）。
    newObject({
      emoji: '🖼️', name: 'レゼの思い出', col: 5, row: 11, behavior: 'still', hazard: false,
      spriteRef: ir('lIjiPk'), spriteUrl: sp('lIjiPk'),
      pages: [
        {
          name: '第1章 出会いと誘惑編',
          conditions: {},
          commands: [
            { type: 'message', text: '（この喫茶店で、かつてレゼが働いていた……）' },
            { type: 'message', text: 'レゼ「デンジ君みたいな面白い人　はじめて」' },
            { type: 'message', text: 'レゼ「教えてあげる！　デンジ君の知らない事　できない事　私が全部教えてあげる」' },
            { type: 'setSelfSwitch', id: 'A', value: true },
          ],
        },
        {
          name: '第2章 甘い罠と価値観編',
          conditions: { selfSwitchId: 'A', selfSwitchValue: true },
          commands: [
            { type: 'message', text: '（レゼが花火大会の夜に語っていた言葉が蘇る……）' },
            { type: 'message', text: 'レゼ「デンジ君はさ　田舎のネズミと都会のネズミ　どっちがいい？」' },
            { type: 'message', text: 'レゼ「だって私…デンジ君が好きだから」' },
            { type: 'setSelfSwitch', id: 'B', value: true },
          ],
        },
        {
          name: '第3章 冷酷な兵器・ボム編',
          conditions: { selfSwitchId: 'B', selfSwitchValue: true },
          commands: [
            { type: 'message', text: '（甘い記憶の奥から、ソ連の爆弾兵器としての本性が覗く……）' },
            { type: 'message', text: 'レゼ「デンジ君の心臓貰うね？」' },
            { type: 'message', text: 'レゼ「おいでデンジ君　私達の戦い方ってのを教えてあげる」' },
          ],
        },
      ],
    }),
    // ── 喫茶店の内装 ──
    newObject({ kind: 'tile', col: 4, row: 11, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('VTRYXYy'), spriteUrl: sp('VTRYXYy') }), // テーブル
    newObject({ kind: 'tile', col: 3, row: 11, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('x21uoP1'), spriteUrl: sp('x21uoP1') }), // 椅子
    newObject({ kind: 'tile', col: 4, row: 12, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('b7EYZPh'), spriteUrl: sp('b7EYZPh') }), // 桜の花（テーブルの花瓶）
    // ── 花屋（レゼへ贈る花を扱う店）──
    newObject({
      emoji: '💐', col: 15, row: 11, behavior: 'still', hazard: false,
      spriteRef: wr('oLrlUq'), spriteUrl: sa('oLrlUq'),
      shopItems: [{ itemId: 'flower', price: 15 }],
      pages: [{
        conditions: {},
        commands: [
          { type: 'message', text: 'いらっしゃい！好きな子に花を贈るんか？　選んだるで。' },
        ],
      }],
    }),
    newObject({ emoji: '👴', col: 16, row: 11, behavior: 'still', hazard: false,
      message: 'フィールドの奥でレゼが彷徨っとるぞ。レベルを上げてから挑むんじゃ。\n剣を振り回すコツを掴んだら一気に楽になる。',
      spriteRef: wr('oLrlUq'), spriteUrl: sa('oLrlUq') }),
    // ── 花屋の内装 ──
    newObject({ kind: 'tile', col: 14, row: 11, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('SN8YIOT'), spriteUrl: sp('SN8YIOT') }), // 花壇
    newObject({ kind: 'tile', col: 14, row: 12, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('j90awu4'), spriteUrl: sp('j90awu4') }), // 観葉植物
    newObject({ kind: 'tile', col: 16, row: 12, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('EVAhBn'), spriteUrl: sp('EVAhBn') }), // レジカウンター
    newObject({ emoji: '👧', col: 10, row: 12, behavior: 'still', hazard: false,
      message: 'フィールドを北に向かうと草原が広がっとるよ。川を渡れへんさかい、道沿いに進むんや。\nやくそうは多めに持って行きや！',
      spriteRef: wr('4KtOzD'), spriteUrl: sa('4KtOzD') }),
    // ── 街の外装（都会らしい街灯・自販機・ゴミ箱）──
    newObject({ kind: 'tile', col: 8, row: 5, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('2gTYec'), spriteUrl: sp('2gTYec') }), // 街灯
    newObject({ kind: 'tile', col: 11, row: 5, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('2gTYec'), spriteUrl: sp('2gTYec') }), // 街灯
    newObject({ kind: 'tile', col: 8, row: 9, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('9p7BFr4'), spriteUrl: sp('9p7BFr4') }), // 自動販売機
    newObject({ kind: 'tile', col: 11, row: 9, behavior: 'still', hazard: false, message: '',
      spriteRef: ir('b0WOZQ3'), spriteUrl: sp('b0WOZQ3') }), // ゴミ箱
    // ── 街の出口ワープ ──
    newObject({ emoji: '🚪', col: 9,  row: ROWS - 2, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'field', warpEntryCol: 26, warpEntryRow: 21 }),
    newObject({ emoji: '🚪', col: 10, row: ROWS - 2, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'field', warpEntryCol: 27, warpEntryRow: 21 }),
  ],
};

// ── シーン2：フィールド ────────────────────────────────────────────────────
// 50×40 の広大なスクロールマップ。tmp/gomi/gomi2.json（旧サーバーが実際に配信していたフィールドの
// タイル配置データ・Map000）をそのまま移植したもの。元データは3レイヤー構成だったが、本エンジンは
// 1マス1タイルなので「上位レイヤーが非0ならそちらを採用」して1枚に合成済み（元の見た目と一致）。
const FW = 50, FH = 40;
const fieldMap: number[][] = [
  [463,463,463,463,463,463,250,250,250,250,250,404,404,404,404,370,370,370,370,370,370,370,370,370,370,404,460,463,463,463,463,463,460,404,404,404,404,404,404,167,167,167,167,167,167,370,370,404,404,404],
  [463,463,463,463,463,463,463,250,250,250,250,250,404,404,404,370,370,370,370,370,370,370,370,370,370,404,460,463,463,463,463,460,460,404,404,404,404,404,404,167,167,167,167,167,167,167,370,370,404,370],
  [463,463,463,463,463,463,463,463,463,250,250,250,404,404,404,370,370,370,370,370,370,370,370,370,370,404,404,460,460,460,460,167,167,167,404,404,404,404,404,167,167,167,167,167,167,167,167,167,370,370],
  [463,463,463,463,463,463,463,463,250,250,250,404,404,404,404,370,370,370,370,370,370,370,370,370,404,370,370,370,370,167,167,167,167,167,167,167,404,404,167,167,167,167,167,167,167,167,167,167,167,167],
  [463,463,463,463,460,460,460,250,250,250,404,404,404,404,404,167,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,167,167,167,167,167,167,167,167,460,460,460,460,460,460,460,460],
  [463,463,460,460,460,404,404,250,250,250,250,250,404,404,404,167,167,167,167,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,167,167,167,167,167,460,460,460,460,460,460,463,463,463],
  [463,460,460,460,404,404,404,404,167,250,250,250,460,460,460,460,460,167,167,167,167,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,167,167,167,460,460,460,460,460,460,463,463,463,463],
  [463,460,460,460,167,167,167,370,250,250,250,460,460,463,463,463,460,460,167,167,167,167,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,167,167,167,460,460,460,460,460,463,463,463,463,463],
  [460,460,460,460,167,167,370,370,250,250,250,250,250,463,463,463,460,460,167,167,167,167,167,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,167,167,167,460,460,460,460,460,463,463,463,463],
  [460,460,460,167,167,370,370,370,370,167,250,250,250,463,463,463,463,460,460,167,167,167,167,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,167,167,167,167,167,167,167,460,460,463,463],
  [460,460,460,167,167,370,370,370,250,250,250,250,250,463,463,463,463,463,460,460,460,460,167,167,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,167,167,167,167,460],
  [460,460,460,167,370,370,370,250,250,250,250,250,460,463,463,463,463,463,463,460,460,460,460,167,370,370,370,370,404,404,404,404,404,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,167,167],
  [460,460,167,167,370,370,370,370,250,250,250,250,250,463,463,463,463,463,463,463,463,463,463,460,167,370,370,404,404,404,404,404,404,404,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370],
  [460,460,167,167,370,370,370,370,250,250,250,167,460,463,463,463,463,463,463,463,463,463,463,460,167,370,370,370,404,404,404,404,404,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370],
  [460,460,167,167,370,370,370,370,250,250,250,167,460,463,463,463,463,463,463,463,463,463,463,460,167,370,370,370,404,404,404,404,404,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370],
  [460,460,167,167,370,370,370,452,452,452,452,167,460,463,463,463,463,463,463,463,463,463,463,460,167,370,370,370,404,404,404,404,404,370,370,370,250,370,370,370,370,370,370,370,370,404,404,404,404,370],
  [463,460,460,167,370,370,370,370,250,250,250,167,460,463,463,463,463,463,460,460,460,460,460,167,370,370,370,370,370,404,404,404,370,370,250,250,250,250,250,370,370,404,404,404,404,404,404,404,404,404],
  [463,463,460,167,370,370,370,370,250,250,250,167,460,460,463,463,460,460,167,167,167,167,370,370,370,370,370,370,370,404,404,404,370,250,250,250,250,250,250,250,404,404,404,404,404,404,404,404,404,370],
  [463,463,460,167,370,370,370,370,250,250,250,370,167,460,460,460,167,167,370,370,370,370,370,370,370,370,370,370,370,404,404,404,370,250,250,250,250,250,250,250,404,404,404,404,404,404,404,404,404,167],
  [463,463,460,167,370,370,370,250,250,250,250,250,167,167,460,167,167,370,370,370,370,370,370,370,370,370,370,370,370,404,404,404,250,250,250,250,250,250,250,250,250,404,404,404,404,404,404,460,460,460],
  [463,463,463,167,370,370,370,370,250,250,250,250,250,167,167,167,370,370,370,370,370,370,370,370,370,370,370,370,370,404,404,404,404,250,250,250,250,250,250,250,370,404,404,404,404,404,460,460,463,463],
  [463,463,463,167,404,370,370,250,250,250,250,250,167,167,167,167,370,370,370,370,370,370,370,370,370,370,370,370,404,404,404,404,404,250,250,250,250,250,250,250,370,167,167,167,167,404,460,463,463,463],
  [463,463,463,167,404,404,404,250,250,250,250,250,167,167,167,167,370,370,370,370,370,370,370,370,370,370,370,404,404,404,404,404,404,404,250,250,250,250,250,370,370,167,167,167,167,167,460,460,463,463],
  [463,463,460,167,404,404,250,250,250,250,250,370,370,167,167,370,370,370,370,370,370,370,370,370,370,370,404,404,404,404,404,404,404,404,404,404,250,404,404,370,370,167,167,167,167,167,404,460,460,460],
  [460,460,460,167,404,404,250,250,250,404,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,370,404,404,404,404,404,404,404,404,404,404,404,404,404,370,167,167,167,167,167,167,167,404,404,404],
  [167,167,167,167,167,404,452,452,452,452,167,370,370,370,370,370,370,370,370,370,370,370,370,370,370,404,404,404,404,404,404,404,404,404,404,404,404,404,404,370,167,167,167,167,167,167,167,404,404,404],
  [370,167,167,167,250,250,250,250,250,404,167,370,370,370,370,370,370,370,370,370,370,370,370,404,404,404,404,404,404,404,404,404,404,404,404,404,404,404,404,167,167,167,460,167,167,167,370,370,370,370],
  [370,370,370,167,250,250,250,463,463,460,404,370,370,370,370,370,370,370,370,370,370,370,404,404,404,404,404,404,370,370,370,370,404,404,404,404,404,404,404,404,167,460,460,460,167,370,370,370,370,370],
  [370,370,370,250,250,250,250,250,463,460,167,370,370,370,370,404,404,404,404,404,404,404,404,404,404,404,404,370,370,370,370,370,370,404,404,404,404,404,404,404,167,460,460,460,167,370,370,370,370,370],
  [370,370,370,250,250,250,250,250,463,460,167,370,370,370,370,404,404,404,404,404,404,404,404,404,404,404,404,370,370,370,370,370,370,404,404,404,404,404,404,404,404,460,460,460,167,370,370,370,370,370],
  [370,370,167,250,250,250,250,250,460,460,167,370,370,370,370,404,404,404,404,404,404,404,404,404,404,404,404,370,370,370,370,370,370,404,404,404,404,404,404,404,404,460,460,460,167,370,370,370,370,370],
  [167,167,167,250,250,250,460,460,460,167,167,370,370,370,370,404,404,404,404,404,404,404,404,404,404,404,404,370,370,370,370,370,370,404,404,404,404,404,404,404,404,460,460,460,167,370,370,370,370,370],
  [460,250,250,250,250,250,167,167,167,167,167,167,370,370,404,404,404,404,404,460,460,460,460,404,404,404,404,370,370,370,370,370,370,404,404,404,404,404,404,404,460,460,460,460,167,370,370,370,370,370],
  [463,460,460,250,250,250,370,370,370,370,370,167,167,167,167,404,404,404,460,460,463,463,460,460,404,404,404,404,370,370,370,370,404,404,404,404,404,404,404,404,460,460,463,460,167,370,370,370,370,370],
  [463,463,460,460,250,250,250,370,370,370,370,167,167,167,167,167,460,460,460,463,463,463,463,460,404,404,404,404,404,404,370,404,404,404,404,404,404,404,404,167,460,460,463,460,167,370,370,404,404,404],
  [463,463,460,460,250,250,250,370,370,370,370,167,167,167,167,167,460,460,460,463,463,463,463,460,404,404,404,404,404,404,404,404,404,404,404,404,404,404,404,167,460,460,463,460,167,370,404,404,404,404],
  [463,463,460,250,250,250,370,370,370,370,370,167,167,167,167,167,460,460,460,463,463,463,463,460,404,404,404,404,404,404,404,404,404,404,404,404,404,404,404,167,460,460,463,460,167,370,404,404,404,404],
  [463,460,460,250,250,250,370,370,370,370,370,167,167,167,167,167,167,460,460,460,460,463,460,460,404,404,404,404,404,404,404,404,404,404,404,404,404,404,404,167,460,460,460,460,167,370,404,404,404,404],
  [460,460,460,167,250,250,250,370,370,370,167,167,167,167,167,167,167,167,167,460,460,460,460,404,404,404,404,404,404,404,404,404,404,404,404,404,404,404,404,167,167,460,460,460,167,167,370,404,370,370],
  [167,167,167,167,452,452,452,167,167,167,167,167,167,167,167,167,167,167,167,167,167,167,404,404,404,404,404,404,370,370,370,370,370,404,404,404,404,404,167,167,167,460,460,460,167,167,370,370,370,370],
];

const scene2: SceneDef = {
  id: 'field', name: 'フィールド',
  map: fieldMap,
  bgm: { ref: 'https://www.youtube.com/watch?v=0_jEpB40aYw', src: 'https://www.youtube.com/watch?v=0_jEpB40aYw', type: 'youtube' },
  objects: [
    // ── 街帰還ワープ（元データのプレイヤー座標=col26,row21 付近を街入口とする） ──
    newObject({ emoji: '🏠', col: 26, row: 21, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'town', warpEntryCol: 9, warpEntryRow: ROWS - 3 }),
    newObject({ emoji: '🏠', col: 27, row: 21, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
      warpSceneId: 'town', warpEntryCol: 10, warpEntryRow: ROWS - 3 }),
    // ── レゼ（爆弾を投げてくる敵）──
    newObject({ emoji: '🧨', name: 'レゼ', col: 25, row: 30, behavior: 'chase', speed: 0.9, hp: 50, atk: 30, def: 18, exp: 60, hazard: true,
      spriteRef: wr('US6LgA'), spriteUrl: sa('US6LgA') }),
    // ── フィールド NPC ──
    newObject({ emoji: '🧑', col: 24, row: 19, behavior: 'still', hazard: false,
      message: '道の先にレゼがおるって噂や。爆弾を投げてくるから気をつけてな。',
      spriteRef: wr('qhy37c'), spriteUrl: sa('qhy37c') }),
    // ── 宝箱 ──
    newObject({ emoji: '👑', col: 45, row: 20, behavior: 'still', hazard: false,
      objType: 'item', itemId: 'herb', message: '宝箱を開けた！「やくそう」を手に入れた！',
      spriteRef: ir('lzUOisL'), spriteUrl: sp('lzUOisL') }),
    newObject({ emoji: '🎁', col: 5, row: 20, behavior: 'still', hazard: false,
      objType: 'item', itemId: 'holyWater', message: '草むらの中に「せいすい」が落ちていた！',
      spriteRef: ir('lzUOisL'), spriteUrl: sp('lzUOisL') }),
    // ── モンスター配置（tmp/gomi/gomi2.json の monsters を移植・敵性のもののみ）──
    newObject({ emoji: '🟢', name: 'スライム', col: 36, row: 5, behavior: 'random', speed: 0.6, hp: 20, atk: 8, def: 4, exp: 10, hazard: true,
      spriteRef: wr('US6LgA'), spriteUrl: sa('US6LgA') }),
    newObject({ emoji: '🐺', name: 'オオカミ', col: 44, row: 1, behavior: 'chase', speed: 0.8, hp: 35, atk: 14, def: 6, exp: 18, hazard: true,
      spriteRef: wr('US6LgA'), spriteUrl: sa('US6LgA') }),
    newObject({ emoji: '👻', name: 'ゴースト', col: 34, row: 6, behavior: 'chase', speed: 0.7, hp: 30, atk: 12, def: 5, exp: 16, hazard: true,
      spriteRef: wr('US6LgA'), spriteUrl: sa('US6LgA') }),
    newObject({ emoji: '🐺', name: 'オオカミ', col: 26, row: 31, behavior: 'chase', speed: 0.8, hp: 35, atk: 14, def: 6, exp: 18, hazard: true,
      spriteRef: wr('US6LgA'), spriteUrl: sa('US6LgA') }),
    newObject({ emoji: '🐗', name: 'ワーウルフ', col: 35, row: 33, behavior: 'chase', speed: 0.85, hp: 60, atk: 22, def: 10, exp: 30, hazard: true,
      spriteRef: wr('US6LgA'), spriteUrl: sa('US6LgA') }),
    newObject({ emoji: '🐗', name: 'ワーウルフ', col: 11, row: 13, behavior: 'chase', speed: 0.85, hp: 60, atk: 22, def: 10, exp: 30, hazard: true,
      spriteRef: wr('US6LgA'), spriteUrl: sa('US6LgA') }),
    newObject({ emoji: '👹', name: 'ゴブリンリーダー', col: 26, row: 31, behavior: 'chase', speed: 0.75, hp: 55, atk: 20, def: 12, exp: 28, hazard: true,
      spriteRef: wr('US6LgA'), spriteUrl: sa('US6LgA') }),
    newObject({ emoji: '🪨', name: 'ストーンゴーレム', col: 11, row: 7, behavior: 'still', speed: 0, hp: 34, atk: 16, def: 20, exp: 22, hazard: true,
      spriteRef: wr('US6LgA'), spriteUrl: sa('US6LgA') }),
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
    { id: 'flower',    name: '花束',           emoji: '💐', description: '花屋で買った花束。誰かに贈りたい', category: 'key' },
  ],
  titleScreen: {
    enabled: true,
    heading: 'おんｊレゼ',
    subtitle: 'なんJ民として、爆弾を投げてくるレゼたちに立ち向かおう！',
    textColor: '#ffaacc',
    menu: [
      { kind: 'newGame',   label: 'ぼうけんをはじめる' },
    ],
  },
  bgm: { ref: 'https://www.youtube.com/watch?v=0_jEpB40aYw', src: 'https://www.youtube.com/watch?v=0_jEpB40aYw', type: 'youtube' },
  sfx: {
    clear:  { ref: 'clear' },
    damage: { ref: 'damage' },
  },
};
