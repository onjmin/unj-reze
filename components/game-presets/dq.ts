import { type PresetData, type SceneDef, type EventCommand, newObject, chest, TILE_SIZE } from './shared';
import { spriteUrl as sp, sAnimUrl as sa, soundUrl as su } from '@/lib/rpgen-assets';
// id は rpgen-search API の id フィールド（ハッシュ文字列）
const wr  = (id: string) => `walk:auto:u:${sa(id)}`;
const ir  = (id: string) => `url:${sp(id)}`;

// ══════════════════════════════════════════════════════════════════════════
//  ドラゴンクエスト風プリセット（DQ1 縮約版）
//  ラダトーム城で王さまに使命を受け、リムルダールの町で装備を整え、
//  沼地の洞窟で「まほうのカギ」を入手し ローラ姫 を救出、
//  カギで竜王の城の扉を開けて 竜王 を討つ——というひと続きの冒険。
// ══════════════════════════════════════════════════════════════════════════

// ── タイル定義 ─────────────────────────────────────────────────────────────
const tiles: PresetData['tiles'] = {
  0: { name: '草原',     color: '#3a9a4a', passable: true,  imageRef: ir('seHP8GT'), imageUrl: sp('seHP8GT') },
  1: { name: '山',       color: '#6b5a3a', passable: false, imageRef: ir('7COldwt'), imageUrl: sp('7COldwt') },
  2: { name: '水',       color: '#2a5acb', passable: false, imageRef: ir('4vGDOZE'), imageUrl: sp('4vGDOZE') },
  3: { name: '城壁',     color: '#b0b0c0', passable: false, imageRef: ir('h9WtBWs'), imageUrl: sp('h9WtBWs') },
  4: { name: '森',       color: '#1f5a2a', passable: false, imageRef: ir('IoHgv20'), imageUrl: sp('IoHgv20') },
  5: { name: '石床',     color: '#5a5a6a', passable: true,  imageRef: ir('sTJ89N'),  imageUrl: sp('sTJ89N')  },
  6: { name: '壁',       color: '#3a3a4a', passable: false, imageRef: ir('vcyXmCw'), imageUrl: sp('vcyXmCw') },
  7: { name: '扉',       color: '#c0802a', passable: true,  imageRef: ir('p6oDkn7'), imageUrl: sp('p6oDkn7') },
  8: { name: '橋',       color: '#a5793f', passable: true,  imageRef: ir('sTJ89N'),  imageUrl: sp('sTJ89N')  },
  9: { name: 'じゅうたん', color: '#7a1f2b', passable: true },
};

// ── マップ記法 ────────────────────────────────────────────────────────────
// . 草原  M 山  ~ 水  C 城壁  F 森  s 石床  W 壁  D 扉  B 橋  r じゅうたん
const LEGEND: Record<string, number> = { '.': 0, 'M': 1, '~': 2, 'C': 3, 'F': 4, 's': 5, 'W': 6, 'D': 7, 'B': 8, 'r': 9 };
const P = (rows: string[]): number[][] => rows.map(r => [...r].map(ch => LEGEND[ch] ?? 0));

// ── オブジェクトのファクトリ ────────────────────────────────────────────
/** シンボルエンカウント敵。 */
const foe = (o: {
  name: string; emoji: string; col: number; row: number;
  hp: number; atk: number; def: number; exp: number; gold: number;
  moves?: { name: string; power: number; heal?: boolean }[];
  behavior?: 'still' | 'random' | 'patrolH' | 'patrolV' | 'chase'; speed?: number; spriteId?: string;
}) => newObject({
  emoji: o.emoji, name: o.name, col: o.col, row: o.row,
  hp: o.hp, atk: o.atk, def: o.def, exp: o.exp, gold: o.gold, moves: o.moves,
  behavior: o.behavior ?? 'still', speed: o.speed ?? 1.2, hazard: true,
  ...(o.spriteId ? { spriteRef: wr(o.spriteId), spriteUrl: sa(o.spriteId) } : {}),
});

/** 会話 NPC（頭上セリフ）。 */
const npc = (emoji: string, col: number, row: number, message: string, spriteId?: string) => newObject({
  emoji, col, row, behavior: 'still', hazard: false, message,
  ...(spriteId ? { spriteRef: wr(spriteId), spriteUrl: sa(spriteId) } : {}),
});

/** シーン間ワープ（扉・穴）。 */
const warp = (emoji: string, col: number, row: number, sceneId: string, entryCol: number, entryRow: number) => newObject({
  emoji, col, row, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
  warpSceneId: sceneId, warpEntryCol: entryCol, warpEntryRow: entryRow,
});

// ══════════════════════════════════════════════════════════════════════════
// シーン1：ラダトーム城（開始地点）
// ══════════════════════════════════════════════════════════════════════════
const castleMap = P([
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWWWWWWWrrWWWWWWWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWssssssssssssrrssssssssssssWW',
  'WWssssssssssssrrssssssssssssWW',
  'WWssssssssssssrrssssssssssssWW',
  'WWssssssssssssrrssssssssssssWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWssssssrrssssssWWWWWWWW',
  'WWWWWWWWWWWWWWDDWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWDDWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
]);

const sceneCastle: SceneDef = {
  id: 'castle', name: 'ラダトーム城',
  map: castleMap,
  bgm: { ref: 'https://www.youtube.com/watch?v=HYjTiY6RITE', src: 'https://www.youtube.com/watch?v=HYjTiY6RITE', type: 'youtube' },
  objects: [
    // ラルス王：使命 → 姫救出の報告 → 回復係
    newObject({
      emoji: '🤴', col: 14, row: 2, behavior: 'still', hazard: false,
      pages: [
        {
          name: '姫救出の報告',
          conditions: { switchId: 2, switchValue: true, selfSwitchId: 'B', selfSwitchValue: false },
          commands: [
            { type: 'message', text: '王「おお……！ローラがぶじだと知らせがあった！\nそなたは まことの勇者じゃ！」' },
            { type: 'message', text: '王「これはローラが そなたにと……」\n💕おうじょのあい を さずかった！\n300ゴールドを さずかった！' },
            { type: 'giveItem', itemId: 'princessLove', count: 1 },
            { type: 'changeGold', amount: 300 },
            { type: 'setSelfSwitch', id: 'B', value: true },
            { type: 'message', text: '王「のこるは竜王のみ。まほうのカギで城の扉をあけ、\nやつを討つのじゃ！」' },
          ],
        },
        {
          name: 'オープニング',
          conditions: { selfSwitchId: 'A', selfSwitchValue: false },
          commands: [
            { type: 'message', text: '王「おお 勇者よ、まっておったぞ！\n竜王が世界を闇につつみ、わがむすめ ローラ を\n沼地の洞窟へ さらっていったのじゃ……」' },
            { type: 'message', text: '王「竜王の城の扉は【まほうのカギ】がなければ開かぬ。\nカギは洞窟のドラゴンが守っているという。」' },
            { type: 'message', text: '王「これは軍資金じゃ。150ゴールドを さずけよう。\nまずは東の町リムルダールで装備をととのえよ！」' },
            { type: 'changeGold', amount: 150 },
            { type: 'giveItem', itemId: 'herb', count: 2 },
            { type: 'message', text: '🌿やくそう×2 も うけとった！\n（画面右上の 🎒 から いつでも使えます）' },
            { type: 'setSelfSwitch', id: 'A', value: true },
          ],
        },
        {
          name: '回復',
          conditions: {},
          commands: [
            { type: 'message', text: '王「そなたに神のごかごが あらんことを……」' },
            { type: 'restoreHp' },
            { type: 'restoreMp' },
            { type: 'message', text: 'HPとMPが 全回復した！' },
          ],
        },
      ],
    }),
    // 衛兵・家臣たち
    npc('💂', 12, 9, '王さまの前では れいぎ正しくな。こまったら王さまに会うといい。傷をいやしてくださるぞ。'),
    npc('💂', 17, 9, '城を出て東へ行けば 町リムルダールだ。フィールドではまものが襲ってくる。そなえは万全にな。'),
    npc('🧙‍♂️', 10, 11, '竜王の城は北の山おくにある。だが【まほうのカギ】がなければ扉は開かん。カギは北西の洞窟じゃ。', 'xP8oPz'),
    npc('👩', 19, 12, 'ローラ姫さまが さらわれてしまわれた……洞窟の奥にとらわれているそうです。どうか お助けを！', 'okIlh5'),
    npc('👴', 4, 11, '戦いのコツを教えよう。MPを使う呪文は強力だが、まずは【たたかう】で様子を見ることじゃ。にげるが勝ちのときもある。', 'M05nRh'),
    // 宝物庫
    chest(25, 10, [
      { type: 'changeGold', amount: 40 },
    ]),
    chest(26, 12, [
      { type: 'giveItem', itemId: 'herb', count: 2 },
    ]),
    // 城の出口 → フィールド
    warp('🚪', 14, 22, 'field', 6, 19),
    warp('🚪', 15, 22, 'field', 7, 19),
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン2：フィールド（アレフガルド）
// ══════════════════════════════════════════════════════════════════════════
const fieldMap = P([
  'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
  'MMMMMM.......FF.....MMMMMMMMMM',
  'MM...M....FFFF......MCCCCCM..M',
  'MM.MMM....FFFF......MCCDCCM..M',
  'M..........FF.........s......M',
  'M....MM......................M',
  'M.........FFF................M',
  'M....F....FFF.......M........M',
  'M............................M',
  'M~~~~~~~~~~~~~BB~~~~~~~~~~~~~M',
  'M~~~~~~~~~~~~~BB~~~~~~~~~~~~~M',
  'M............................M',
  'M...FF.......................M',
  'M..FFFF...............FF.....M',
  'M...FF.......................M',
  'M............................M',
  'M...CCCCCC..........CCCCCCC..M',
  'M...CCCCCC..........CCCCCCC..M',
  'M...CCDDCC..........CCCDCCC..M',
  'M............................M',
  'M............................M',
  'M.....FF.............FF......M',
  'M............................M',
  'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
]);

const sceneField: SceneDef = {
  id: 'field', name: 'フィールド',
  map: fieldMap,
  // 南は弱く北は強い——は1テーブルでは表せないので、テーブルは弱〜中でまとめ、
  // 北側は強めのシンボルエンカウントで難度を出す。
  randomEncounters: [
    { name: 'スライム',     emoji: '🟦', hp: 22,  atk: 9,  def: 2, exp: 3,  gold: 4  },
    { name: 'スライム',     emoji: '🟦', hp: 22,  atk: 9,  def: 2, exp: 3,  gold: 4  },
    { name: 'スライムベス', emoji: '🟥', hp: 30, atk: 11, def: 3, exp: 5,  gold: 7  },
    { name: 'ドラキー',     emoji: '🦇', hp: 36, atk: 13, def: 4, exp: 7,  gold: 10 },
    { name: 'ゴースト',     emoji: '👻', hp: 45, atk: 16, def: 6, exp: 10, gold: 14 },
    { name: 'まどうし',     emoji: '🧙', hp: 55, atk: 18, def: 8, exp: 15, gold: 22, moves: [{ name: 'ギラ', power: 12 }] },
  ],
  encounterRate: 15,
  bgm: { ref: 'https://www.youtube.com/watch?v=9rWBQNDlNW4', src: 'https://www.youtube.com/watch?v=9rWBQNDlNW4', type: 'youtube' },
  objects: [
    // ── 南部（弱い敵）──
    foe({ name: 'スライム', emoji: '🟦', col: 12, row: 14, hp: 22, atk: 9, def: 2, exp: 3, gold: 4, behavior: 'random', speed: 1.0, spriteId: 'k3vKh6' }),
    foe({ name: 'スライム', emoji: '🟦', col: 17, row: 20, hp: 22, atk: 9, def: 2, exp: 3, gold: 4, behavior: 'random', speed: 1.0, spriteId: 'k3vKh6' }),
    foe({ name: 'スライムベス', emoji: '🟥', col: 25, row: 13, hp: 30, atk: 11, def: 3, exp: 5, gold: 7, behavior: 'random', speed: 1.0, spriteId: 'hswBaA' }),
    // ── 北部（強い敵）──
    foe({ name: 'ドラキー', emoji: '🦇', col: 8, row: 7, hp: 36, atk: 13, def: 4, exp: 7, gold: 10, behavior: 'random', spriteId: 'R42ett' }),
    foe({ name: 'がいこつ', emoji: '💀', col: 16, row: 6, hp: 70, atk: 26, def: 12, exp: 24, gold: 30, behavior: 'patrolH', spriteId: 'pyPkIs' }),
    foe({ name: 'おおさそり', emoji: '🦂', col: 22, row: 7, hp: 75, atk: 30, def: 14, exp: 33, gold: 40, behavior: 'random' }),
    foe({ name: 'よろいのきし', emoji: '🤺', col: 23, row: 6, hp: 120, atk: 48, def: 26, exp: 95, gold: 110, behavior: 'patrolV' }),
    // ── NPC ──
    npc('🧑‍🌾', 16, 11, '橋の北はまものが強い。レベル5……いや、くさりかたびらを買ってからのほうがいいぞ。'),
    npc('👴', 10, 19, '西の城がラダトーム城、東の町がリムルダールじゃ。北西の山には洞窟の入り口があるらしい。', 'M05nRh'),
    // ── 宝箱（北東の隠しポケット）──
    chest(28, 2, [
      { type: 'changeGold', amount: 64 },
    ]),
    // ── ワープ ──
    warp('🚪', 6, 18, 'castle', 14, 20),  // ラダトーム城 城門
    warp('🚪', 7, 18, 'castle', 15, 20),
    warp('🚪', 23, 18, 'village', 15, 19), // リムルダール 町の門
    warp('🕳️', 3, 2, 'cave', 2, 20),       // 沼地の洞窟 入り口
    warp('🚪', 23, 3, 'dragonCastle', 15, 20), // 竜王の城 城門
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン3：リムルダールの町
// ══════════════════════════════════════════════════════════════════════════
const villageMap = P([
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'W............................W',
  'W..WWWW...WWWW....WWWW.......W',
  'W..WWWW...WWWW....WWWW...~~..W',
  'W..WWWW...WWWW....WWWW...~~..W',
  'W............................W',
  'W............................W',
  'W............................W',
  'W..WWWW......WWWW............W',
  'W..WWWW......WWWW.....FF.....W',
  'W..WWWW......WWWW.....FF.....W',
  'W............................W',
  'W............................W',
  'W.....FF.....................W',
  'W............................W',
  'W............................W',
  'W............................W',
  'W............................W',
  'W............................W',
  'W............................W',
  'W............................W',
  'WWWWWWWWWWWWWWWDWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWDWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
]);

const sceneVillage: SceneDef = {
  id: 'village', name: 'リムルダールの町',
  map: villageMap,
  bgm: { ref: 'https://www.youtube.com/watch?v=2GNKRGzApyM', src: 'https://www.youtube.com/watch?v=2GNKRGzApyM', type: 'youtube' },
  objects: [
    // 宿屋（8G で全回復）
    newObject({
      emoji: '🏨', col: 4, row: 5, behavior: 'still', hazard: false,
      spriteRef: wr('M05nRh'), spriteUrl: sa('M05nRh'),
      pages: [{
        conditions: {},
        commands: [
          { type: 'choice', text: '宿屋「いらっしゃいませ。ひと晩 8ゴールドですが、お泊まりになりますか？」', choices: [
            { label: 'はい（8G）', commands: [
              { type: 'ifGold', amount: 8,
                then: [
                  { type: 'changeGold', amount: -8 },
                  { type: 'restoreHp' },
                  { type: 'restoreMp' },
                  { type: 'message', text: 'おはようございます。ゆうべは おたのしみでしたね。\nHPとMPが 全回復した！' },
                ],
                else: [
                  { type: 'message', text: '宿屋「おきのどくですが お金がたりないようで……」' },
                ],
              },
            ]},
            { label: 'いいえ', commands: [] },
          ]},
        ],
      }],
    }),
    // 道具屋
    newObject({
      emoji: '🧺', col: 11, row: 5, behavior: 'still', hazard: false,
      spriteRef: wr('P2dNvQ'), spriteUrl: sa('P2dNvQ'),
      shopItems: [
        { itemId: 'herb',       price: 8  },
        { itemId: 'magicWater', price: 24 },
      ],
      pages: [{ conditions: {}, commands: [
        { type: 'message', text: '道具屋「いらっしゃい！やくそうは冒険の必需品だよ。\n🎒 から いつでも使えるからね」' },
      ]}],
    }),
    // 武器防具屋
    newObject({
      emoji: '⚒️', col: 19, row: 5, behavior: 'still', hazard: false,
      spriteRef: wr('YjGEny'), spriteUrl: sa('YjGEny'),
      shopItems: [
        { itemId: 'copperSword',  price: 90  },
        { itemId: 'ironSword',    price: 450 },
        { itemId: 'leatherArmor', price: 60  },
        { itemId: 'chainMail',    price: 420 },
      ],
      pages: [{ conditions: {}, commands: [
        { type: 'message', text: '武器屋「いらっしゃい！買った装備はすぐ身につくぜ。\n強いのを買ったら 前のは外れるから気をつけな」' },
      ]}],
    }),
    // 町の人々
    npc('👴', 8, 12, '竜王の城の扉は【まほうのカギ】がなければ開かんそうじゃ。カギは沼地の洞窟のドラゴンが守っておるという……', 'M05nRh'),
    npc('👩', 17, 11, 'ローラ姫さまが まものにさらわれたの……王さまは ずっとお嘆きよ。', 'okIlh5'),
    npc('👨', 12, 15, '戦いで傷ついたら宿屋で休むといい。ここの宿はひと晩8ゴールドだ。安いだろ？'),
    npc('👧', 6, 17, '洞窟のおくで ひかる石板を見たんだ！さわったら どこかで ゴゴゴ…って音がしたよ！', 'mLHxrK'),
    npc('🧔', 20, 14, '金がたまったら【くさりかたびら】を買いな。命には かえられないぜ。'),
    // 町の出口 → フィールド
    warp('🚪', 15, 22, 'field', 23, 19),
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン4：沼地の洞窟
// ══════════════════════════════════════════════════════════════════════════
const caveMap = P([
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWssssssssssssssssssssssssssWW',
  'WWssssssssssssssssssssssssssWW',
  'WWssWWWWssWWWWWWWWWWWWWWWWssWW',
  'WWssWWWWssWWWWWWWWWWWWWWWWssWW',
  'WWssWWssssssssssWWWWWWWWWWssWW',
  'WWssWWssssssssssWWWWWWWWWWssWW',
  'WWssWWssssssssssWWWWWWWWWWssWW',
  'WWssWWssssssssssWWWWWWWWWWssWW',
  'WWssWWssssssssssWWWWWWWWWWssWW',
  'WWssWWWWssWWWWWWWWWWWWWWWWssWW',
  'WWssWWWWssWWWWWWWWssssssssssWW',
  'WWssWWssssssssWWWWssssssssssWW',
  'WWssWWssssssssWWWWssssssssssWW',
  'WWssWWssssssssWWWWssssssssssWW',
  'WWssWWssssssssWWWWssssssssssWW',
  'WWssWWWWWWWWWWWWWWssssssssssWW',
  'WWssWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWssWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWssWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
]);

const sceneCave: SceneDef = {
  id: 'cave', name: '沼地の洞窟',
  map: caveMap,
  randomEncounters: [
    { name: 'メーダ',     emoji: '👁️', hp: 55, atk: 21, def: 9,  exp: 16, gold: 20, moves: [{ name: 'メラ', power: 11 }] },
    { name: 'がいこつ',   emoji: '💀', hp: 70, atk: 26, def: 12, exp: 24, gold: 30 },
    { name: 'まどうし',   emoji: '🧙', hp: 60, atk: 24, def: 10, exp: 28, gold: 36, moves: [{ name: 'ギラ', power: 14 }, { name: 'ホイミ', power: 18, heal: true }] },
    { name: 'おおさそり', emoji: '🦂', hp: 75, atk: 30, def: 14, exp: 33, gold: 40 },
    { name: 'リカント',   emoji: '🐺', hp: 85, atk: 34, def: 15, exp: 40, gold: 48 },
  ],
  encounterRate: 11,
  bgm: { ref: 'https://www.youtube.com/watch?v=kpXqFuFe5pM', src: 'https://www.youtube.com/watch?v=kpXqFuFe5pM', type: 'youtube' },
  objects: [
    // 入り口の老人
    npc('👴', 3, 19, 'この洞窟のおくには ドラゴンが住みついておる。ローラ姫とまほうのカギは その先じゃ……むりはするなよ。', 'M05nRh'),
    // ── 西の部屋（石板と金貨）──
    chest(7, 9, [
      { type: 'changeGold', amount: 120 },
    ]),
    foe({ name: 'がいこつ', emoji: '💀', col: 10, row: 11, hp: 70, atk: 26, def: 12, exp: 24, gold: 30, behavior: 'patrolH', spriteId: 'pyPkIs' }),
    // 石板スイッチ（隠し部屋の封印を解く）
    newObject({
      emoji: '🪨', col: 14, row: 12, behavior: 'still', hazard: false,
      pages: [
        { conditions: { switchId: 1, switchValue: true }, commands: [{ type: 'message', text: '石板は もう動かない。' }] },
        { conditions: {}, commands: [
          { type: 'message', text: 'ひかる石板に手をふれると——\nどこかで ゴゴゴ……と重い音がひびいた！' },
          { type: 'setSwitch', switchId: 1, value: true },
        ]},
      ],
    }),
    // ── 隠し部屋（まほうのよろい）──
    foe({ name: 'がいこつ', emoji: '💀', col: 11, row: 17, hp: 70, atk: 26, def: 12, exp: 24, gold: 30, behavior: 'patrolH', spriteId: 'pyPkIs' }),
    newObject({
      emoji: '🔒', col: 7, row: 17, behavior: 'still', hazard: false,
      spriteRef: ir('lzUOisL'), spriteUrl: sp('lzUOisL'),
      pages: [
        { conditions: { selfSwitchId: 'A', selfSwitchValue: true }, commands: [{ type: 'message', text: 'からっぽだ。' }] },
        { conditions: { switchId: 1, switchValue: true }, commands: [
          { type: 'message', text: '封印がとけている！宝箱をあけた！\n🛡️まほうのよろい を手に入れた！（まもりが大きく上がった）' },
          { type: 'giveItem', itemId: 'magicArmor', count: 1 },
          { type: 'setSelfSwitch', id: 'A', value: true },
        ]},
        { conditions: {}, commands: [{ type: 'message', text: 'かたく封印されている……\nどこかに 仕掛けがあるはずだ。' }] },
      ],
    }),
    // ── 右の通路と最深部 ──
    foe({ name: 'メーダ', emoji: '👁️', col: 26, row: 9, hp: 55, atk: 21, def: 9, exp: 16, gold: 20, moves: [{ name: 'メラ', power: 11 }], behavior: 'patrolV', spriteId: 'oE4l1x' }),
    // 番人ドラゴン
    foe({ name: 'ドラゴン', emoji: '🐲', col: 21, row: 16, hp: 155, atk: 44, def: 24, exp: 120, gold: 150, moves: [{ name: 'かえんのいき', power: 26 }], behavior: 'patrolV', speed: 1.4 }),
    // まほうのカギの宝箱
    chest(26, 15, [
      { type: 'giveItem', itemId: 'magicKey', count: 1 },
    ]),
    // ローラ姫
    newObject({
      emoji: '👸', col: 25, row: 18, behavior: 'still', hazard: false,
      pages: [
        { conditions: { switchId: 2, switchValue: true }, commands: [
          { type: 'message', text: 'ローラ「わたしのことは しんぱいいりません。\nはやく父上……ラルス王に ぶじを伝えてください！」' },
        ]},
        { conditions: {}, commands: [
          { type: 'message', text: 'ローラ「……あなたが、たすけに来てくださったのね！\nわたしはローラ。ラルス王のむすめです」' },
          { type: 'message', text: 'ローラ「キメラのつばさで いったん城へ知らせを送ります。\n父上に会って ぶじを伝えてください！」' },
          { type: 'setSwitch', switchId: 2, value: true },
          { type: 'message', text: '⭐ ローラ姫を救出した！\nラダトーム城の王さまに 知らせよう！' },
        ]},
      ],
    }),
    // 出口 → フィールド
    warp('🕳️', 2, 22, 'field', 2, 3),
    warp('🕳️', 3, 22, 'field', 2, 3),
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン5：竜王の城
// ══════════════════════════════════════════════════════════════════════════
const dragonCastleMap = P([
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWssssrrssssWWWWWWWWWW',
  'WWWWWWWWWWssssrrssssWWWWWWWWWW',
  'WWWWWWWWWWssssrrssssWWWWWWWWWW',
  'WWWWWWWWWWssssrrssssWWWWWWWWWW',
  'WWWWWWWWWWWWWWWrWWWWWWWWWWWWWW',
  'WWssssssssssssrrssssssssssssWW',
  'WWssssssssssssrrssssssssssssWW',
  'WWssWWWsssssssrrsssssssWWWssWW',
  'WWssWWWsssssssrrsssssssWWWssWW',
  'WWssssssssssssrrssssssssssssWW',
  'WWssssssssssssrrssssssssssssWW',
  'WWWWWWWWWWWWWWWrWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWrWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWrWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWrWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWrWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWrWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWrWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWrWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWrWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWrWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
]);

const sceneDragonCastle: SceneDef = {
  id: 'dragonCastle', name: '竜王の城',
  map: dragonCastleMap,
  randomEncounters: [
    { name: 'キメラ',       emoji: '🦅', hp: 90, atk: 40, def: 16, exp: 60, gold: 70,  moves: [{ name: 'かえんのいき', power: 20 }] },
    { name: 'しりょうのきし', emoji: '🧟', hp: 105, atk: 44, def: 22, exp: 75, gold: 85,  moves: [{ name: 'ベホイミ', power: 25, heal: true }] },
    { name: 'だいまどう',   emoji: '🔮', hp: 95, atk: 42, def: 18, exp: 85, gold: 105, moves: [{ name: 'ベギラマ', power: 30 }] },
    { name: 'よろいのきし', emoji: '🤺', hp: 120, atk: 48, def: 26, exp: 95, gold: 110 },
  ],
  encounterRate: 10,
  bgm: { ref: 'https://www.youtube.com/watch?v=kpXqFuFe5pM', src: 'https://www.youtube.com/watch?v=kpXqFuFe5pM', type: 'youtube' },
  objects: [
    // まほうのカギの扉（入り口の関所）
    newObject({
      emoji: '🚪', col: 15, row: 19, behavior: 'still', hazard: false,
      pages: [
        { conditions: { selfSwitchId: 'A', selfSwitchValue: true }, commands: [] },
        { conditions: { itemId: 'magicKey', hasItem: true }, commands: [
          { type: 'message', text: '🗝️まほうのカギをつかった！\nずしり……と音を立てて 扉がひらいた！' },
          { type: 'setSelfSwitch', id: 'A', value: true },
        ]},
        { conditions: {}, commands: [
          { type: 'message', text: '扉には魔法のカギが かかっている！\n（沼地の洞窟に カギがあるといううわさだ）' },
          { type: 'warp', col: 15, row: 21 },
        ]},
      ],
    }),
    // ── 大広間 ──
    foe({ name: 'しりょうのきし', emoji: '🧟', col: 10, row: 7, hp: 105, atk: 44, def: 22, exp: 75, gold: 85, moves: [{ name: 'ベホイミ', power: 25, heal: true }], behavior: 'patrolH' }),
    foe({ name: 'キメラ', emoji: '🦅', col: 19, row: 8, hp: 90, atk: 40, def: 16, exp: 60, gold: 70, moves: [{ name: 'かえんのいき', power: 20 }], behavior: 'random' }),
    // 西翼：ロトのつるぎ（ストーンマンが守る）
    foe({ name: 'ストーンマン', emoji: '🗿', col: 3, row: 11, hp: 160, atk: 50, def: 30, exp: 110, gold: 130, behavior: 'patrolV', speed: 0.8 }),
    chest(3, 9, [
      { type: 'giveItem', itemId: 'lotoSword', count: 1 },
    ]),
    // 東翼：軍資金
    foe({ name: 'よろいのきし', emoji: '🤺', col: 23, row: 12, hp: 120, atk: 48, def: 26, exp: 95, gold: 110, behavior: 'patrolH' }),
    chest(26, 10, [
      { type: 'changeGold', amount: 300 },
    ]),
    // 玉座の間の前：竜王の問いかけ
    newObject({
      emoji: '🔥', col: 15, row: 6, behavior: 'still', hazard: false,
      pages: [
        { conditions: { selfSwitchId: 'A', selfSwitchValue: true }, commands: [] },
        { conditions: {}, commands: [
          { type: 'message', text: '玉座から 低い声がひびく……\n竜王「よくきた勇者よ。わしはおまえを まっていた」' },
          { type: 'choice', text: '竜王「もし わしのみかたになれば、せかいの半分を\nおまえにやろう。……どうじゃ？」', choices: [
            { label: 'はい', commands: [
              { type: 'message', text: '竜王「ほう……よかろう、と いうとおもったか！\nたわけめ！わしのねがいは 世界のすべてじゃ！」' },
            ]},
            { label: 'いいえ', commands: [
              { type: 'message', text: '竜王「ならば あいてになってやろう。\nわしのちからを 見せてくれるわ！」' },
            ]},
          ]},
          { type: 'setSelfSwitch', id: 'A', value: true },
        ]},
      ],
    }),
    // 竜王（シンボルボス。倒すとクリア）
    newObject({
      emoji: '🐉', name: 'りゅうおう', col: 15, row: 3, behavior: 'still', speed: 0, hazard: true, isBoss: true,
      hp: 220, atk: 60, def: 38, exp: 500, gold: 0,
      moves: [{ name: 'はげしいほのお', power: 34 }, { name: 'かえんのいき', power: 26 }],
      spriteRef: wr('Ilpvcu'), spriteUrl: sa('Ilpvcu'),
      outroDialogue: [
        { speaker: 'りゅうおう', emoji: '🐉', text: 'ぐ……ぐわああ……！\nこの わしが……勇者ごときに……' },
        { speaker: 'りゅうおう', emoji: '🐉', text: 'おぼえておれ……闇はいつの日か……\nかならず よみがえる……！' },
        { speaker: '勇者', emoji: '🧝', side: 'right', text: 'そのときは、また倒すまでだ。' },
        { speaker: 'ローラ', emoji: '👸', side: 'right', text: 'ああ……夜が明けていく……！\nアレフガルドに 光がもどったのね！' },
      ],
    }),
    // 出口 → フィールド
    warp('🚪', 15, 22, 'field', 23, 4),
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// プリセット本体
// ══════════════════════════════════════════════════════════════════════════
export const dq: PresetData = {
  id: 'dq', name: 'ドラクエ', engine: 'rpg', gravity: 0, friction: 0,
  player: {
    emoji: '🧝', color: '#4444ff', speed: 3, jumpPower: 0, w: TILE_SIZE, h: TILE_SIZE,
    start: { x: TILE_SIZE * 15, y: TILE_SIZE * 18 },  // ラダトーム城 玉座の間の前
    spriteRef: wr('0yyTSP'), spriteUrl: sa('0yyTSP'),
  },
  tiles,
  map: JSON.parse(JSON.stringify(castleMap)),
  objects: [...sceneCastle.objects],
  scenes: [sceneCastle, sceneField, sceneVillage, sceneCave, sceneDragonCastle],
  scroll: { worldCols: 30, worldRows: 24 },
  battle: {
    playerName: '勇者',
    maxHp: 30, maxMp: 6, atk: 10, def: 8,
    gold: 40,
    moves: [
      { name: 'メラ',     cost: 2,  power: 13 },
      { name: 'ホイミ',   cost: 3,  power: 32, heal: true },
      { name: 'ギラ',     cost: 5,  power: 26 },
      { name: 'ベホイミ', cost: 8,  power: 55, heal: true },
      { name: 'ベギラマ', cost: 11, power: 45 },
    ],
    labels: { attack: 'たたかう', move: 'じゅもん', flee: 'にげる', item: 'どうぐ' },
    // レベルアップテーブル（exp は「次のレベルに必要な追加経験値」）
    levelTable: [
      { level: 2,  exp: 6,   maxHp: 38,  maxMp: 10,  atk: 12, def: 9  },
      { level: 3,  exp: 14,  maxHp: 46,  maxMp: 14,  atk: 14, def: 11 },
      { level: 4,  exp: 25,  maxHp: 54,  maxMp: 18,  atk: 16, def: 13 },
      { level: 5,  exp: 40,  maxHp: 62,  maxMp: 24,  atk: 19, def: 15 },
      { level: 6,  exp: 60,  maxHp: 70,  maxMp: 30,  atk: 22, def: 17 },
      { level: 7,  exp: 85,  maxHp: 78,  maxMp: 36,  atk: 25, def: 19 },
      { level: 8,  exp: 115, maxHp: 88,  maxMp: 42,  atk: 28, def: 22 },
      { level: 9,  exp: 150, maxHp: 98,  maxMp: 48,  atk: 31, def: 25 },
      { level: 10, exp: 190, maxHp: 108, maxMp: 54,  atk: 34, def: 28 },
      { level: 11, exp: 240, maxHp: 118, maxMp: 62,  atk: 38, def: 31 },
      { level: 12, exp: 300, maxHp: 128, maxMp: 70,  atk: 42, def: 34 },
      { level: 13, exp: 370, maxHp: 138, maxMp: 78,  atk: 46, def: 37 },
      { level: 14, exp: 450, maxHp: 150, maxMp: 88,  atk: 50, def: 40 },
      { level: 15, exp: 550, maxHp: 165, maxMp: 100, atk: 55, def: 44 },
    ],
  },
  switches: [
    { id: 1, name: '洞窟の石板スイッチON' },
    { id: 2, name: 'ローラ姫を救出' },
  ],
  items: [
    { id: 'herb',         name: 'やくそう',       emoji: '🌿', description: 'HPを 35 回復する',                        category: 'consumable', healHp: 35 },
    { id: 'magicWater',   name: 'まほうのせいすい', emoji: '💧', description: 'MPを 28 回復する',                        category: 'consumable', healMp: 28 },
    { id: 'magicKey',     name: 'まほうのカギ',   emoji: '🗝️', description: '魔法で封印された扉を開くカギ',            category: 'key' },
    { id: 'princessLove', name: 'おうじょのあい', emoji: '💕', description: 'ローラ姫の想いがこもったお守り',          category: 'key' },
    { id: 'copperSword',  name: 'どうのつるぎ',   emoji: '🗡️', description: '銅製の剣。こうげき力＋10',                category: 'weapon', atkBonus: 10 },
    { id: 'ironSword',    name: 'てつのつるぎ',   emoji: '⚔️', description: '鉄製の剣。こうげき力＋22',                category: 'weapon', atkBonus: 22 },
    { id: 'lotoSword',    name: 'ロトのつるぎ',   emoji: '🔱', description: 'でんせつの勇者の剣。こうげき力＋40',      category: 'weapon', atkBonus: 40 },
    { id: 'leatherArmor', name: 'かわのよろい',   emoji: '🧥', description: '革製のよろい。しゅび力＋10',              category: 'armor',  defBonus: 10 },
    { id: 'chainMail',    name: 'くさりかたびら', emoji: '⛓️', description: '鎖を編んだよろい。しゅび力＋20',          category: 'armor',  defBonus: 20 },
    { id: 'magicArmor',   name: 'まほうのよろい', emoji: '🛡️', description: '魔法の力で守られたよろい。しゅび力＋32',  category: 'armor',  defBonus: 32 },
  ],
  titleScreen: {
    enabled: true,
    heading: 'ドラゴンクエスト',
    subtitle: '竜王をたおし、ローラ姫をすくいだせ！',
    textColor: '#ffee88',
    menu: [
      { kind: 'newGame',   label: 'ぼうけんをはじめる' },
    ],
  },
  ending: {
    enabled: true,
    heading: 'そして伝説へ…',
    message: '竜王はほろび、アレフガルドに夜明けがおとずれた。\nローラ姫は城にもどり、ラルス王のなげきは喜びにかわった。\n\nそなたの勇気は「ロトの勇者」として\n永遠に語りつがれるだろう。\n\nおめでとう！',
    textColor: '#ffee88',
  },
  bgm: { ref: 'https://www.youtube.com/watch?v=HYjTiY6RITE', src: 'https://www.youtube.com/watch?v=HYjTiY6RITE', type: 'youtube' },
  battleBgm: { ref: 'https://www.youtube.com/watch?v=CjgbtaH99do', src: 'https://www.youtube.com/watch?v=CjgbtaH99do', type: 'youtube' },
  bossBgm:   { ref: 'https://www.youtube.com/watch?v=2JslD8UrL9E', src: 'https://www.youtube.com/watch?v=2JslD8UrL9E', type: 'youtube' },
  sfx: {
    levelup:  { ref: `direct:${su('JrcaUb')}`, src: su('JrcaUb'), type: 'direct' as const },
    purchase: { ref: `direct:${su('PEeN5M')}`, src: su('PEeN5M'), type: 'direct' as const },
    inn:      { ref: `direct:${su('L5Npni')}`, src: su('L5Npni'), type: 'direct' as const },
    damage:   { ref: `direct:${su('HlYVmj')}`, src: su('HlYVmj'), type: 'direct' as const },
    clear:    { ref: 'clear' },
  },
};
