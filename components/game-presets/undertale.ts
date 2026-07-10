import { type PresetData, type SceneDef, type EventCommand, type EnemyDialogueLine, newObject, chest, TILE_SIZE } from './shared';
import { spriteUrl as sp, sAnimUrl as sa } from '@/lib/rpgen-assets';
import { undertaleSfxUrl } from '@/lib/undertale-engine-sfx';
// id は rpgen-search API の id フィールド（ハッシュ文字列）
const wr = (id: string) => `walk:auto:u:${sa(id)}`;
const ir = (id: string) => `url:${sp(id)}`;

// ══════════════════════════════════════════════════════════════════════════
//  アンダーテール風プリセット（不殺ルート対応）
//  ちかのせかいに おちた ニンゲンの子が、いせき → ゆきのまち → みずのどうくつ を
//  ぬけて おうさまの もとへ たどりつく。敵は「たたかう」で倒しても、
//  「こうどう」で敵意をなくして「みのがす」してもよい——だれも ころさなくていい。
//  みのがし＝EXPなし・ゴールドのみ。ボスをみのがしてもクリアになる（エンジン側 spare 参照）。
// ══════════════════════════════════════════════════════════════════════════

// ── タイル定義 ─────────────────────────────────────────────────────────────
const tiles: PresetData['tiles'] = {
  0:  { name: 'いせきのゆか', color: '#574370', passable: true },
  1:  { name: 'いせきのかべ', color: '#2b2142', passable: false },
  2:  { name: 'あかいおちば', color: '#b0372c', passable: true },
  3:  { name: 'ゆき',         color: '#e9edf5', passable: true, imageRef: ir('bT7aZFy'), imageUrl: sp('bT7aZFy') },
  4:  { name: 'ゆきのき',     color: '#163a2c', passable: false },
  5:  { name: 'みず',         color: '#1c3f8e', passable: false, imageRef: ir('4vGDOZE'), imageUrl: sp('4vGDOZE') },
  6:  { name: 'どうくつのゆか', color: '#222b50', passable: true },
  7:  { name: 'どうくつのかべ', color: '#0b0f22', passable: false },
  8:  { name: 'はし',         color: '#7a5a34', passable: true },
  9:  { name: 'きんのゆか',   color: '#d9c05e', passable: true },
  10: { name: 'きんのかべ',   color: '#8a7331', passable: false },
  11: { name: 'きんのはな',   color: '#f2d94e', passable: true },
};

// ── マップ記法 ────────────────────────────────────────────────────────────
// p いせきのゆか  P いせきのかべ  l おちば  s ゆき  t き  w みず
// c どうくつゆか  C どうくつかべ  b はし  g きんのゆか  G きんのかべ  f きんのはな
const LEGEND: Record<string, number> = { 'p': 0, 'P': 1, 'l': 2, 's': 3, 't': 4, 'w': 5, 'c': 6, 'C': 7, 'b': 8, 'g': 9, 'G': 10, 'f': 11 };
const M = (rows: string[]): number[][] => rows.map(r => [...r].map(ch => LEGEND[ch] ?? 0));

// ── オブジェクトのファクトリ ────────────────────────────────────────────
/** シンボルエンカウント敵（たたかう/みのがす どちらでも消える）。 */
const foe = (o: {
  name: string; emoji: string; col: number; row: number;
  hp: number; atk: number; def: number; exp: number; gold: number;
  moves?: { name: string; power: number; heal?: boolean; miniScript?: string; dialogue?: (string | EnemyDialogueLine)[] }[];
  behavior?: 'still' | 'random' | 'patrolH' | 'patrolV' | 'chase'; speed?: number; spriteId?: string;
  isBoss?: boolean; outroDialogue?: PresetData['objects'][number]['outroDialogue'];
  /** soul 戦闘の通常攻撃弾幕（MiniScript）。技側の miniScript が優先。 */
  miniScript?: string;
  /** 通常攻撃の予告セリフ候補（HP割合／直前の「こうどう」技名で出し分け）。技側の dialogue が優先。 */
  dialogue?: (string | EnemyDialogueLine)[];
}) => newObject({
  emoji: o.emoji, name: o.name, col: o.col, row: o.row,
  hp: o.hp, atk: o.atk, def: o.def, exp: o.exp, gold: o.gold, moves: o.moves,
  behavior: o.behavior ?? 'still', speed: o.speed ?? 1.2, hazard: true,
  isBoss: o.isBoss, outroDialogue: o.outroDialogue, miniScript: o.miniScript, dialogue: o.dialogue,
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
// シーン1：いせき（開始地点・むらさきの遺跡）
// ══════════════════════════════════════════════════════════════════════════
const ruinsMap = M([
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPppppppPPPPPPPPPPPP',
  'PPPPPPPPPPPPpllllpPPPPPPPPPPPP',
  'PPPPPPPPPPPPpllllpPPPPPPPPPPPP',
  'PPPPPPPPPPPPppppppPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPppPPPPPPPPPPPPPP',
  'PPppppppppppppppppppppppppppPP',
  'PPppppppppppppppppppppppppppPP',
  'PPppPPPPPPppPPppPPppPPPPPPppPP',
  'PPppPPPPPPppPPppPPppPPPPPPppPP',
  'PPppppppppppppppppppppppppppPP',
  'PPppppppppppppppppppppppppppPP',
  'PPPPPPppPPPPPPPPPPPPPPppPPPPPP',
  'PPppppppppPPPPppPPPPppppppppPP',
  'PPppppppppPPPPppPPPPppppppppPP',
  'PPppppppppppppppppppppppppppPP',
  'PPppppppppPPPPppPPPPppppppppPP',
  'PPppppppppPPPPppPPPPppppppppPP',
  'PPPPPPPPPPPPPPppPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPppPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPppPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPppPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPpPPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
]);

const sceneRuins: SceneDef = {
  id: 'ruins', name: 'いせき',
  map: ruinsMap,
  randomEncounters: [
    { name: 'カエルさん',     emoji: '🐸', hp: 18, atk: 8, def: 2, exp: 3, gold: 5 },
    { name: 'ひらひらむし',   emoji: '🦋', hp: 14,  atk: 7, def: 1, exp: 2, gold: 4 },
    { name: 'ないてるおばけ', emoji: '👻', hp: 22, atk: 6, def: 3, exp: 4, gold: 6, moves: [{ name: 'なみだの あめ', power: 7, miniScript: `
while true
  shotRain(randF(1.2, 2.0), 3, 4)
  wait(9)
end while
`.trim() }] },
  ],
  encounterRate: 16,
  bgm: { ref: 'https://www.youtube.com/watch?v=oHZDWwW6iXs', src: 'https://www.youtube.com/watch?v=oHZDWwW6iXs', type: 'youtube' },
  objects: [
    // はなのケモノ（オープニング）
    newObject({
      emoji: '🌼', col: 15, row: 4, behavior: 'still', hazard: false,
      pages: [
        { conditions: { selfSwitchId: 'A', selfSwitchValue: true }, commands: [{ type: 'message', text: 'はな「…なんだよ。もう タネは ないってば。ヒヒヒ」' }] },
        { conditions: {}, commands: [
          { type: 'message', text: 'はな「こんにちは！ ボク、はなのケモノ！\nちかのせかいへ ようこそ！」' },
          { type: 'choice', text: 'はな「ボクの【ゆうじょうのタネ】を うけとってくれる？」', choices: [
            { label: 'はい', commands: [
              { type: 'message', text: 'はな「ヒヒヒ…… ウソだよ！\nこのせかいは【コロスか コロサレるか】なんだ！」' },
            ]},
            { label: 'いいえ', commands: [
              { type: 'message', text: 'はな「…つれないなぁ。まあ いいや。\nどうせ すぐに わかるよ。ヒヒヒ……」' },
            ]},
          ]},
          { type: 'message', text: 'そのとき どこからか あたたかい ほのおが とんできて、\nはなのケモノは あわてて つちに もぐっていった。' },
          { type: 'setSelfSwitch', id: 'A', value: true },
        ]},
      ],
    }),
    // ヤギのママ（いえ・回復とパイ）
    newObject({
      emoji: '🐐', col: 4, row: 14, behavior: 'still', hazard: false,
      pages: [
        {
          name: 'パイをくれる',
          conditions: { selfSwitchId: 'A', selfSwitchValue: false },
          commands: [
            { type: 'message', text: 'ママ「まあ…… ちいさな ニンゲンの子。\nけがは ない？ ここは あぶない ばしょよ」' },
            { type: 'message', text: 'ママ「おなかが すいたら これを おたべなさい。\n🥧 てづくりのパイ を もらった！」' },
            { type: 'giveItem', itemId: 'pie', count: 1 },
            { type: 'restoreHp' }, { type: 'restoreMp' },
            { type: 'message', text: 'ママ「そとに 出たいだなんて いわないでね。\n……おねがいよ」' },
            { type: 'setSelfSwitch', id: 'A', value: true },
          ],
        },
        {
          name: '回復',
          conditions: {},
          commands: [
            { type: 'message', text: 'ママ「さあ、ゆっくり やすんで いきなさい」' },
            { type: 'restoreHp' }, { type: 'restoreMp' },
            { type: 'message', text: 'HPとMPが 全回復した！' },
          ],
        },
      ],
    }),
    // 宝物庫（右の部屋）
    chest(25, 14, [
      { type: 'giveItem', itemId: 'monsterCandy', count: 2 },
    ]),
    chest(26, 16, [
      { type: 'changeGold', amount: 30 },
    ]),
    // 遺跡のモンスター
    foe({ name: 'カエルさん', emoji: '🐸', col: 8, row: 7, hp: 18, atk: 8, def: 2, exp: 3, gold: 5, behavior: 'random', speed: 1.0, spriteId: 'EVAhBn' }),
    foe({ name: 'カエルさん', emoji: '🐸', col: 21, row: 10, hp: 18, atk: 8, def: 2, exp: 3, gold: 5, behavior: 'random', speed: 1.0, spriteId: 'EVAhBn' }),
    foe({ name: 'ないてるおばけ', emoji: '👻', col: 15, row: 10, hp: 22, atk: 6, def: 3, exp: 4, gold: 6, moves: [{ name: 'なみだの あめ', power: 7, miniScript: `
while true
  shotRain(randF(1.2, 2.0), 3, 4)
  wait(9)
end while
`.trim() }], behavior: 'random' }),
    // 出口前のママ（たおしても みのがしても 先へ進める）
    newObject({
      emoji: '🚪', col: 15, row: 21, behavior: 'still', hazard: false, hp: 1, speed: 0, bullet: 'none',
      pages: [
        { conditions: { selfSwitchId: 'A', selfSwitchValue: true }, commands: [] },
        { conditions: {}, commands: [
          { type: 'message', text: 'ママ「……この扉のむこうは もっと あぶない せかいよ。\nどうしても 行くというなら——」' },
          { type: 'message', text: 'ママ「ママを こえて いきなさい！\n（こうどう で 敵意をなくせば みのがしてもらえる…）」' },
          { type: 'setSelfSwitch', id: 'A', value: true },
        ]},
      ],
    }),
    foe({ name: 'ヤギのママ', emoji: '🐐', col: 14, row: 21, hp: 120, atk: 14, def: 12, exp: 45, gold: 40,
      // 通常攻撃：ゆっくり降るオレンジの火の粉（やさしい）
      miniScript: `
while true
  shotRain(1.4, 5, 7)
  wait(16)
end while
`.trim(),
      // 通常攻撃の予告セリフ：HPが減るほど厳しく、「はなす」を使った直後は専用のセリフになる
      dialogue: [
        { text: 'ママ「もう、しかたないわね」', actUsed: 'はなす' },
        { text: 'ママ「そこまで するなら……」', hpBelowPct: 30 },
        { text: 'ママ「まだまだ、あぶないわよ」', hpBelowPct: 60 },
        'ママ「ごめんなさいね」',
      ],
      moves: [{
        name: 'ふんわりファイア', power: 10,
        // 技専用：赤とオレンジ2色の火がやや密に降る
        miniScript: `
setDuration(300)
while true
  shotRain(randF(1.0, 1.6), 5, 7)
  shotRain(randF(1.0, 1.6), 4, 1)
  wait(14)
end while
`.trim(),
        dialogue: [
          { text: 'ママ「これで おわりに しましょう……」', hpBelowPct: 30 },
          'ママ「ふんわり あたたかい ほのおよ」',
        ],
      }] }),
    // 出口 → ゆきのまち
    warp('🚪', 14, 22, 'snowdin', 2, 11),
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン2：ゆきのまち
// ══════════════════════════════════════════════════════════════════════════
const snowdinMap = M([
  'tttttttttttttttttttttttttttttt',
  'tsssssssssssssssssswwsssssssst',
  'tssttttsssssssssssswwsssssssst',
  'tssttttsssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tssssssssstttsssssswwsssssssst',
  'tssssssssstttsssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tssssssssssssssssssbbsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tssstttsssssssssssswwsssssssst',
  'tssstttsssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tsssssssssssssssssswwsssssssst',
  'tttttttttttttttttttttttttttttt',
]);

const sceneSnowdin: SceneDef = {
  id: 'snowdin', name: 'ゆきのまち',
  map: snowdinMap,
  randomEncounters: [
    { name: 'ゆきのとり',   emoji: '🐦', hp: 28, atk: 12, def: 5, exp: 8, gold: 12, moves: [{ name: 'さむいダジャレ', power: 8 }] },
    { name: 'アイスぼうや', emoji: '🧊', hp: 24, atk: 11, def: 6, exp: 7, gold: 10 },
    { name: 'わんわん',     emoji: '🐕', hp: 30, atk: 13, def: 6, exp: 9, gold: 14 },
  ],
  encounterRate: 14,
  bgm: { ref: 'https://www.youtube.com/watch?v=vYyLL9QstbI', src: 'https://www.youtube.com/watch?v=vYyLL9QstbI', type: 'youtube' },
  objects: [
    // ホネの兄弟
    npc('💀', 5, 13, 'よう にんげん。ほねのある やつは きらいじゃないぜ。……おっと、おれの ことか。', 'BKRjJx'),
    foe({ name: 'ハデなガイコツ', emoji: '💀', col: 21, row: 11, hp: 140, atk: 16, def: 14, exp: 55, gold: 60,
      // 通常攻撃：左右から交互に飛んでくるホネ
      miniScript: `
while true
  shotSide(true, randF(20, 156), 2.0, 4, 0)
  wait(12)
  shotSide(false, randF(20, 156), 2.0, 4, 0)
  wait(12)
end while
`.trim(),
      moves: [
        {
          name: 'ホネのやり', power: 12,
          // 3本1組のホネ柱が左から連続で来る
          miniScript: `
setDuration(280)
while true
  y = randF(15, 145)
  for i in range(0, 2, 1)
    shotSide(true, y + i * 14, 2.6, 4, 0)
  end for
  wait(26)
end while
`.trim(),
        },
        {
          name: 'あおいホネこうげき', power: 8,
          // 青いホネが上からハートを狙って落ちる
          miniScript: `
while true
  shotPlayer(getPlayerX(), -6, 1.6, 5, 3)
  shotPlayer(88, -6, 1.8, 5, 3)
  wait(20)
end while
`.trim(),
        },
      ], spriteId: 'YFwEEx' }),
    // 橋の前の看板がわりのイベント
    newObject({
      emoji: '🪧', col: 17, row: 11, behavior: 'still', hazard: false,
      pages: [{ conditions: {}, commands: [
        { type: 'message', text: '看板「この橋のさきは まちの中心。\nただし ハデなガイコツが【にんげん とりしまり中】」' },
      ]}],
    }),
    // 番犬・スノーマン
    foe({ name: 'わんわんナイト', emoji: '🐕', col: 10, row: 5, hp: 30, atk: 13, def: 6, exp: 9, gold: 14, behavior: 'patrolH', spriteId: 'h9iBuH' }),
    newObject({
      emoji: '⛄', col: 8, row: 17, behavior: 'still', hazard: false,
      pages: [
        { conditions: { selfSwitchId: 'A', selfSwitchValue: true }, commands: [{ type: 'message', text: 'スノーマン「とおくへ つれていってくれて ありがとう…」' }] },
        { conditions: {}, commands: [
          { type: 'message', text: 'スノーマン「ぼくは ここから うごけないんだ。\nぼくの かけらを とおくへ つれていって くれない？」' },
          { type: 'message', text: '⛄スノーマンのかけら を もらった！（たべると HP回復）' },
          { type: 'giveItem', itemId: 'snowPiece', count: 1 },
          { type: 'setSelfSwitch', id: 'A', value: true },
        ]},
      ],
    }),
    // まち（川のひがし）：宿屋と店
    newObject({
      emoji: '🏨', col: 24, row: 7, behavior: 'still', hazard: false,
      pages: [{
        conditions: {},
        commands: [
          { type: 'choice', text: '宿屋うさぎ「いらっしゃい！ ひとばん 20ゴールドだよ」', choices: [
            { label: 'とまる（20G）', commands: [
              { type: 'ifGold', amount: 20,
                then: [
                  { type: 'changeGold', amount: -20 },
                  { type: 'restoreHp' }, { type: 'restoreMp' },
                  { type: 'message', text: 'ふかふかの ベッドで ぐっすり ねむった。\nHPとMPが 全回復した！' },
                ],
                else: [{ type: 'message', text: '宿屋うさぎ「ごめんね、お金が たりないみたい」' }],
              },
            ]},
            { label: 'やめておく', commands: [] },
          ]},
        ],
      }],
    }),
    newObject({
      emoji: '🧺', col: 26, row: 14, behavior: 'still', hazard: false,
      shopItems: [
        { itemId: 'spiderDonut', price: 16 },
        { itemId: 'noodles',     price: 45 },
        { itemId: 'toyKnife',    price: 50 },
        { itemId: 'ribbon',      price: 40 },
      ],
      pages: [{ conditions: {}, commands: [
        { type: 'message', text: '店番うさぎ「いらっしゃい。ドーナツは クモの巣まで\nとどけてくれる ふしぎな おかしだよ」' },
      ]}],
    }),
    npc('🐰', 23, 17, 'このまちの ガイコツ兄弟は ゆうめい人でね。おとうとは ジョークずき、おにいさんは パズルずきさ。'),
    // ワープ
    warp('🚪', 1, 11, 'ruins', 14, 20),        // いせきへ戻る
    warp('🕳️', 28, 11, 'waterfall', 2, 3),      // みずのどうくつへ
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン3：みずのどうくつ
// ══════════════════════════════════════════════════════════════════════════
const waterfallMap = M([
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
  'CccccccccccccccccccccccccccccC',
  'CccccccccccccccccccccccccccccC',
  'CccccccccccccccccccccccccccccC',
  'CccccccccccccccccccccccccccccC',
  'CccccccccccccccccccccccccccccC',
  'CcccwwwwwwwwwwccwwwwwwwwwwcccC',
  'CcccwwwwwwwwwwccwwwwwwwwwwcccC',
  'CcccwwwwwwwwwwccwwwwwwwwwwcccC',
  'CcccwwwwwwwwwwccwwwwwwwwwwcccC',
  'CcccwwwwwwwwwwccwwwwwwwwwwcccC',
  'CccccccccccccccccccccccccccccC',
  'CccccccccccccccccccccccccccccC',
  'CccccccccccccccccccccccccccccC',
  'CccccccccccccccccccccccccccccC',
  'CccccccccccccccccccccccccccccC',
  'CccccccccccccccccccccccccccccC',
  'CCCCCcCCCCCCCCCCCCCCCCCCCCCCCC',
  'CCCCCcccccccccccccccccccccccCC',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
]);

const sceneWaterfall: SceneDef = {
  id: 'waterfall', name: 'みずのどうくつ',
  map: waterfallMap,
  randomEncounters: [
    { name: 'キラキラくらげ', emoji: '🪼', hp: 36, atk: 16, def: 8, exp: 13, gold: 18 },
    { name: 'うたうさかな',   emoji: '🐟', hp: 42, atk: 18, def: 9, exp: 15, gold: 22, moves: [{ name: 'ソウルフルなうた', power: 12 }] },
    { name: 'テミー',         emoji: '🐱', hp: 10,  atk: 4,  def: 2, exp: 1,  gold: 50 },
  ],
  encounterRate: 12,
  bgm: { ref: 'https://www.youtube.com/watch?v=DVUh7caufKU', src: 'https://www.youtube.com/watch?v=DVUh7caufKU', type: 'youtube' },
  objects: [
    // ゆううつなゴースト
    npc('👻', 6, 3, 'や… ぼく ここで ねそべってるんだ… ゴミになった きぶんで…… …じゃまだったら ごめん…', 'h1ABuE'),
    // エコーフラワー
    npc('🌷', 10, 13, '（はなが だれかの こえを こだまする…\n『いつか そとの せかいを みてみたいな』）'),
    npc('🌷', 18, 15, '（はなが だれかの こえを こだまする…\n『ほしぞらって どんな ばしょなんだろう』）'),
    // テミーのみせ
    newObject({
      emoji: '🐱', col: 24, row: 13, behavior: 'still', hazard: false,
      shopItems: [
        { itemId: 'toughGlove',  price: 140 },
        { itemId: 'bandanna',    price: 160 },
        { itemId: 'temmieArmor', price: 300 },
        { itemId: 'noodles',     price: 40 },
      ],
      pages: [{ conditions: {}, commands: [
        { type: 'message', text: 'テミー「やっほー！！ テミーのみせ！！！\nかって！！！（テミーのよろい は ガチだよ）」' },
      ]}],
    }),
    // 宝箱
    chest(26, 3, [
      { type: 'giveItem', itemId: 'burntPan', count: 1 },
    ]),
    chest(2, 14, [
      { type: 'giveItem', itemId: 'tutu', count: 1 },
    ]),
    // どうくつのモンスター
    foe({ name: 'うたうさかな', emoji: '🐟', col: 12, row: 12, hp: 42, atk: 18, def: 9, exp: 15, gold: 22, moves: [{ name: 'ソウルフルなうた', power: 12 }], behavior: 'random' }),
    // 出口の通路をまもる さかなのヒーロー
    npc('🪧', 6, 16, '看板「この先 せまい通路。\n【えいゆう】が にんげんを まちかまえている とのこと」'),
    foe({ name: 'よろいのさかなヒーロー', emoji: '🐠', col: 24, row: 18, hp: 180, atk: 20, def: 16, exp: 80, gold: 80,
      // 通常攻撃：画面端からハートを狙う水色のやり
      miniScript: `
while true
  shotAimed(2.2, 5, 4)
  wait(18)
end while
`.trim(),
      moves: [
        {
          name: 'やりのあめ', power: 14,
          // 上から降りそそぐ高速のやり
          miniScript: `
setDuration(280)
while true
  shotRain(2.4, 4, 4)
  shotRain(2.0, 4, 4)
  wait(8)
end while
`.trim(),
        },
        {
          name: 'みどりのやり', power: 11,
          // 全方向から3本同時に狙ってくる
          miniScript: `
while true
  for i in range(0, 2, 1)
    shotAimed(2.0, 5, 5)
  end for
  wait(30)
end while
`.trim(),
        },
      ], behavior: 'patrolH', speed: 1.2 }),
    // 出口 → おうのしろ
    warp('🕳️', 27, 18, 'newhome', 14, 2),
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン4：おうのしろ（きんいろの ろうか と はなの ぎょくざ）
// ══════════════════════════════════════════════════════════════════════════
const newHomeMap = M([
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGggggGGGGGGGGGGGGG',
  'GGGGGGGGggggggggggggggGGGGGGGG',
  'GGGGGGGGggggggggggggggGGGGGGGG',
  'GGGGGGGGggffffffffffggGGGGGGGG',
  'GGGGGGGGggffffffffffggGGGGGGGG',
  'GGGGGGGGggffffffffffggGGGGGGGG',
  'GGGGGGGGggffffffffffggGGGGGGGG',
  'GGGGGGGGggffffffffffggGGGGGGGG',
  'GGGGGGGGggggggggggggggGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
]);

const sceneNewHome: SceneDef = {
  id: 'newhome', name: 'おうのしろ',
  map: newHomeMap,
  bgm: { ref: 'https://www.youtube.com/watch?v=1HIKNbnV8nw', src: 'https://www.youtube.com/watch?v=1HIKNbnV8nw', type: 'youtube' },
  objects: [
    // はなのケモノ、再登場
    npc('🌼', 14, 15, 'はな「……ここまで きちゃったんだ。\nこのさきに いるのは この せかいの おうさま。\nきみは… どうするんだろうね。ヒヒヒ……」'),
    // おうさまの問いかけ
    newObject({
      emoji: '🫖', col: 14, row: 17, behavior: 'still', hazard: false,
      pages: [
        { conditions: { selfSwitchId: 'A', selfSwitchValue: true }, commands: [] },
        { conditions: {}, commands: [
          { type: 'message', text: 'はなばたけの おくから おだやかな こえがする……\n王「ようこそ。ちいさな ひとよ。\nお茶でも いれたいところ なのだけど……」' },
          { type: 'choice', text: '王「たたかいたくは ない。それでも きみは すすむかい？」', choices: [
            { label: 'すすむ', commands: [
              { type: 'message', text: '王「……そうか。では ワシも おうとしての\nつとめを はたそう。ゆるしておくれ」' },
            ]},
            { label: 'まよう', commands: [
              { type: 'message', text: '王「まよって いいんだよ。それが やさしさだ。\n…でも この はなばたけは とおして あげられない」' },
            ]},
          ]},
          { type: 'setSelfSwitch', id: 'A', value: true },
        ]},
      ],
    }),
    // 最後のボス。たおしても みのがしても クリア（spare でも bossDefeated になる）
    foe({
      name: 'やさしいおうさま', emoji: '🐐', col: 14, row: 19, hp: 260, atk: 20, def: 18, exp: 300, gold: 0,
      // 通常攻撃：上からランダムな向きの炎の扇
      miniScript: `
while true
  a = rand(45, 135)
  for i in range(-2, 2, 1)
    shotAngle(88, -4, a + i * 12, 2.0, 4, 7)
  end for
  wait(22)
end while
`.trim(),
      // 通常攻撃の予告セリフ：HP・直前の「ほめる」使用で出し分け
      dialogue: [
        { text: '王「……そんなに ほめられると てれるね」', actUsed: 'ほめる' },
        { text: '王「もう すぐ おわりに しよう……」', hpBelowPct: 20 },
        { text: '王「わるいね。ワシも ひくには ひけないんだ」', hpBelowPct: 50 },
        '王「うけて おくれ」',
      ],
      moves: [
        {
          name: 'ほのおのあめ', power: 14,
          // 赤とオレンジの炎が長時間 密に降りそそぐ
          miniScript: `
setDuration(320)
while true
  shotRain(randF(1.6, 2.4), 4, 7)
  shotRain(randF(1.6, 2.4), 4, 1)
  wait(7)
end while
`.trim(),
          dialogue: [
            { text: '王「これで さいごに しよう……」', hpBelowPct: 20 },
            '王「ほのおの あめだ。すまないね」',
          ],
        },
        {
          name: 'みつまたのやり', power: 18,
          // 上と左右の3方向から黄色のやりが同時にハートを狙う
          miniScript: `
while true
  shotPlayer(getPlayerX(), -6, 2.6, 5, 6)
  shotPlayer(-6, getPlayerY(), 2.6, 5, 6)
  shotPlayer(182, getPlayerY(), 2.6, 5, 6)
  wait(34)
end while
`.trim(),
        },
      ],
      behavior: 'still', speed: 0, isBoss: true,
      outroDialogue: [
        { speaker: 'おうさま', emoji: '🐐', text: '……つよいのだね。 いや……\nやさしいのか。' },
        { speaker: 'おうさま', emoji: '🐐', text: 'ちじょうへ つづく とびらは この おくに ある。\n……すきに しなさい。' },
        { speaker: 'ニンゲン', emoji: '🧒', side: 'right', text: '…… みんなも いっしょに いこうよ。' },
        { speaker: 'はなのケモノ', emoji: '🌼', text: '…チェッ。 つまんないの。' },
      ],
    }),
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// プリセット本体
// ══════════════════════════════════════════════════════════════════════════
export const undertale: PresetData = {
  id: 'undertale', name: 'アンダーテール', engine: 'rpg', gravity: 0, friction: 0,
  player: {
    emoji: '🧒', color: '#ff4b4b', speed: 3, jumpPower: 0, w: TILE_SIZE, h: TILE_SIZE,
    start: { x: TILE_SIZE * 14, y: TILE_SIZE * 2 },  // いせきの おちばの上
    spriteRef: wr('0OBT7X'), spriteUrl: sa('0OBT7X'),
  },
  tiles,
  map: JSON.parse(JSON.stringify(ruinsMap)),
  objects: [...sceneRuins.objects],
  scenes: [sceneRuins, sceneSnowdin, sceneWaterfall, sceneNewHome],
  scroll: { worldCols: 30, worldRows: 24 },
  battle: {
    playerName: 'ニンゲン',
    style: 'soul',  // アンダーテール風戦闘（FIGHT/ACT/ITEM/MERCY・タイミング攻撃・弾幕よけ）
    maxHp: 24, maxMp: 12, atk: 8, def: 6,
    gold: 0,
    moves: [
      // mercy 持ちの技は「こうどう」：ダメージゼロで敵意ゲージを溜め、満タンで「みのがす」が成立する
      { name: 'はなす',   cost: 0, power: 0,  mercy: 40 },
      { name: 'ほめる',   cost: 0, power: 0,  mercy: 60 },
      { name: 'けつい',   cost: 4, power: 30, heal: true },
    ],
    labels: { attack: 'たたかう', move: 'こうどう', flee: 'にげる', item: 'アイテム', mercy: 'みのがす' },
    levelTable: [
      { level: 2, exp: 8,   maxHp: 32, maxMp: 14, atk: 11, def: 8  },
      { level: 3, exp: 18,  maxHp: 40, maxMp: 16, atk: 14, def: 10 },
      { level: 4, exp: 32,  maxHp: 48, maxMp: 20, atk: 17, def: 12 },
      { level: 5, exp: 50,  maxHp: 56, maxMp: 24, atk: 20, def: 15 },
      { level: 6, exp: 75,  maxHp: 64, maxMp: 28, atk: 24, def: 18 },
      { level: 7, exp: 110, maxHp: 72, maxMp: 32, atk: 28, def: 21 },
      { level: 8, exp: 160, maxHp: 80, maxMp: 38, atk: 32, def: 25 },
    ],
  },
  items: [
    { id: 'monsterCandy', name: 'モンスターキャンディ', emoji: '🍬', description: 'HPを 14 回復する。ちょっと しょっぱい',    category: 'consumable', healHp: 14 },
    { id: 'spiderDonut',  name: 'スパイダードーナツ',   emoji: '🍩', description: 'HPを 24 回復する。クモが つくった',        category: 'consumable', healHp: 24 },
    { id: 'snowPiece',    name: 'スノーマンのかけら',   emoji: '⛄', description: 'HPを 30 回復する。たべると すこし つめたい', category: 'consumable', healHp: 30 },
    { id: 'noodles',      name: 'インスタントめん',     emoji: '🍜', description: 'HPを 45 回復する。なま でも いける',        category: 'consumable', healHp: 45 },
    { id: 'pie',          name: 'てづくりのパイ',       emoji: '🥧', description: 'HPを 99 回復する。ママの あじ',            category: 'consumable', healHp: 99 },
    { id: 'toyKnife',     name: 'おもちゃのナイフ',     emoji: '🔪', description: 'プラスチック製。こうげき力＋6',            category: 'weapon', atkBonus: 6 },
    { id: 'toughGlove',   name: 'ゴツいてぶくろ',       emoji: '🥊', description: 'ピンクの ごつい てぶくろ。こうげき力＋14', category: 'weapon', atkBonus: 14 },
    { id: 'burntPan',     name: 'こげたフライパン',     emoji: '🍳', description: 'なぜか つよい。こうげき力＋24',            category: 'weapon', atkBonus: 24 },
    { id: 'ribbon',       name: 'ふるびたリボン',       emoji: '🎀', description: 'かわいいと 攻撃されにくい。しゅび力＋6',   category: 'armor', defBonus: 6 },
    { id: 'bandanna',     name: 'おとこらしいバンダナ', emoji: '🥋', description: 'きんにくの絵が かいてある。しゅび力＋13',  category: 'armor', defBonus: 13 },
    { id: 'tutu',         name: 'ふるびたチュチュ',     emoji: '🩰', description: 'ひらり と かわせそう。しゅび力＋18',       category: 'armor', defBonus: 18 },
    { id: 'temmieArmor',  name: 'テミーのよろい',       emoji: '🛡️', description: 'テミーかがくの けっしょう。しゅび力＋28',  category: 'armor', defBonus: 28 },
  ],
  titleScreen: {
    enabled: true,
    heading: 'アンダーテール',
    subtitle: 'だれも ころさなくていい RPG',
    textColor: '#ffffff',
    menu: [
      { kind: 'newGame', label: 'けつい を むねに はじめる' },
    ],
  },
  ending: {
    enabled: true,
    heading: 'THE END',
    message: 'とびらは ひらいた。\nニンゲンと ちかのせかいの みんなは\nそとの ひかりの したへ あるきだした。\n\n——そらって、こんなに ひろかったんだね。\n\nきみは けつい に みちあふれた。',
    textColor: '#ffee88',
  },
  bgm:       { ref: 'https://www.youtube.com/watch?v=oHZDWwW6iXs', src: 'https://www.youtube.com/watch?v=oHZDWwW6iXs', type: 'youtube' },
  battleBgm: { ref: 'https://www.youtube.com/watch?v=g6aia0GQMRw', src: 'https://www.youtube.com/watch?v=g6aia0GQMRw', type: 'youtube' },
  bossBgm:   { ref: 'https://www.youtube.com/watch?v=42kI2lT0x6U', src: 'https://www.youtube.com/watch?v=42kI2lT0x6U', type: 'youtube' },
  sfx: {
    levelup:  { ref: `direct:${undertaleSfxUrl('snd_level_up')}`, src: undertaleSfxUrl('snd_level_up'), type: 'direct' as const },
    purchase: { ref: `direct:${undertaleSfxUrl('snd_menu_confirm')}`, src: undertaleSfxUrl('snd_menu_confirm'), type: 'direct' as const },
    inn:      { ref: `direct:${undertaleSfxUrl('snd_item_heal')}`, src: undertaleSfxUrl('snd_item_heal'), type: 'direct' as const },
    save:     { ref: `direct:${undertaleSfxUrl('snd_save')}`, src: undertaleSfxUrl('snd_save'), type: 'direct' as const },
    damage:   { ref: `direct:${undertaleSfxUrl('snd_hurt')}`, src: undertaleSfxUrl('snd_hurt'), type: 'direct' as const },
    clear:    { ref: 'clear' },
  },
};
