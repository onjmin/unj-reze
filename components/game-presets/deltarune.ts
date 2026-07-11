import { type PresetData, type SceneDef, type EnemyDialogueLine, type EnemyBattleSprite, newObject, chest, TILE_SIZE } from './shared';
import { tldrMusicUrl, tldrSfxUrl, TLDR_PARTY_SPRITES, TLDR_PARTY_UI, TLDR_ENEMY_SPRITES } from '@/lib/deltarune-tldr-assets';

// ══════════════════════════════════════════════════════════════════════════
//  デルタルーン風プリセット（tlDR Engine を参考にしたダークワールド冒険）
//  ふつうの少年少女が くらやみの せかいに まよいこみ、カードのモチーフに
//  つつまれた しろを めざす。「たたかう」だけでなく「ちょうさ」で敵意を
//  やわらげて「みのがす」ことも できる——アンダーテールの きょうだい作品。
//  ※本エンジンは単一プレイヤーキャラのみ対応のため、スージー・ラルセイは
//    同行NPC/セリフのみで登場する（パーティ切替は非対応）。
// ══════════════════════════════════════════════════════════════════════════

// ── タイル定義 ─────────────────────────────────────────────────────────────
const tiles: PresetData['tiles'] = {
  0: { name: 'くらやみの地面', color: '#3a2a5c', passable: true },
  1: { name: 'くらやみの壁',   color: '#1b1230', passable: false },
  2: { name: 'カードのタイル', color: '#5c3a7a', passable: true },
  3: { name: 'しろのゆか',     color: '#4a2a6a', passable: true },
  4: { name: 'しろの壁',       color: '#241540', passable: false },
  5: { name: 'きんいろのじゅうたん', color: '#c9a53a', passable: true },
  6: { name: 'とげ（進入不可）', color: '#7a2a4a', passable: false },
  7: { name: 'すいしょうの床',  color: '#3a6a8a', passable: true },
  8: { name: 'はし',           color: '#5a4a7a', passable: true },
};

// ── マップ記法 ────────────────────────────────────────────────────────────
const LEGEND: Record<string, number> = { '.': 0, '#': 1, 'c': 2, 'f': 3, 'F': 4, 'g': 5, 'x': 6, 's': 7, 'b': 8 };
const M = (rows: string[]): number[][] => rows.map(r => [...r].map(ch => LEGEND[ch] ?? 0));

// ── オブジェクトのファクトリ ────────────────────────────────────────────
/** シンボルエンカウント敵（たたかう/みのがす どちらでも消える）。
 *  エンカウントはシンボル接触のみ（原作準拠：ランダムエンカウントは使わない）。 */
const foe = (o: {
  name: string; emoji: string; col: number; row: number;
  hp: number; atk: number; def: number; exp: number; gold: number;
  moves?: { name: string; power: number; heal?: boolean; miniScript?: string; dialogue?: (string | EnemyDialogueLine)[] }[];
  behavior?: 'still' | 'random' | 'patrolH' | 'patrolV' | 'chase'; speed?: number;
  isBoss?: boolean; outroDialogue?: PresetData['objects'][number]['outroDialogue'];
  miniScript?: string;
  dialogue?: (string | EnemyDialogueLine)[];
  battleSprite?: EnemyBattleSprite;
  spriteRef?: string; spriteUrl?: string;
}) => newObject({
  emoji: o.emoji, name: o.name, col: o.col, row: o.row,
  hp: o.hp, atk: o.atk, def: o.def, exp: o.exp, gold: o.gold, moves: o.moves,
  behavior: o.behavior ?? 'still', speed: o.speed ?? 1.2, hazard: true,
  isBoss: o.isBoss, outroDialogue: o.outroDialogue, miniScript: o.miniScript, dialogue: o.dialogue,
  battleSprite: o.battleSprite,
  spriteRef: o.spriteRef, spriteUrl: o.spriteUrl,
});

/** 敵のバトルスプライト（idle の1コマ目）をそのままフィールドの徘徊シンボルに使うための
 *  spriteRef/spriteUrl の組。walk:smc:u:<url>#sx,sy,sw,sh,frames 形式（全面1コマのクロップ）で、
 *  アスペクト比を保ってタイル高さに合わせ、左移動時は自動で水平反転される。 */
const symbolSprite = (a: { frames: readonly string[]; w: number; h: number }) => ({
  spriteRef: `walk:smc:u:${a.frames[0]}#0,0,${a.w},${a.h},1`,
  spriteUrl: a.frames[0],
});

/** 会話 NPC（頭上セリフ）。 */
const npc = (emoji: string, col: number, row: number, message: string) => newObject({
  emoji, col, row, behavior: 'still', hazard: false, message,
});

/** シーン間ワープ（扉・穴）。 */
const warp = (emoji: string, col: number, row: number, sceneId: string, entryCol: number, entryRow: number) => newObject({
  emoji, col, row, objType: 'warp', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', message: '',
  warpSceneId: sceneId, warpEntryCol: entryCol, warpEntryRow: entryRow,
});

// ══════════════════════════════════════════════════════════════════════════
// シーン1：くらやみの野原（フィールドタウン手前）
// ══════════════════════════════════════════════════════════════════════════
const fieldMap = M([
  '##############################',
  '#............................#',
  '#..cccccccccccccccccccccccc..#',
  '#..c......................c..#',
  '#..c..####..........####..c..#',
  '#..c..####..........####..c..#',
  '#..c......................c..#',
  '#..cccccccc........cccccccc..#',
  '#..........................c..#',
  '#..........................c..#',
  '#..cccccccccccccccccccccccc..#',
  '#..c......................c..#',
  '#..c..bbbbbbbbbbbbbbbbbb..c..#',
  '#..c......................c..#',
  '#..cccccccc........cccccccc..#',
  '#..........................c..#',
  '#..........................c..#',
  '#..cccccccccccccccccccccccc..#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '##############################',
]);

const sceneField: SceneDef = {
  id: 'field', name: 'くらやみの野原',
  map: fieldMap,
  // エンカウントはフィールドを徘徊するシンボルとの接触のみ（原作準拠。ランダムエンカウント無し）
  bgm: { ref: `direct:${tldrMusicUrl('exForest')}`, src: tldrMusicUrl('exForest'), type: 'direct' },
  objects: [
    // ラルセイ（同行NPC・回復とヒント）
    newObject({
      emoji: '🐐', col: 15, row: 3, behavior: 'still', hazard: false,
      pages: [
        {
          name: 'ヒントとやすらぎ',
          conditions: {},
          commands: [
            { type: 'message', text: 'ラルセイ「やあ、きみ。ここは くらやみの せかい。\nつかれたら いつでも やすんで いいからね」' },
            { type: 'restoreHp' }, { type: 'restoreMp' },
            { type: 'message', text: 'ラルセイ「HPと TP が回復したよ。\nてきは たおさなくても【ちょうさ】で みのがせる」' },
          ],
        },
      ],
    }),
    // スージー（同行NPC・強気なコメント）
    npc('😈', 20, 3, 'スージー「はっ、こんな くらい ところ ビビらせようったって そうはいかないっての」'),
    // 宝物庫
    chest(6, 13, [{ type: 'giveItem', itemId: 'darkCandy', count: 2 }]),
    chest(24, 13, [{ type: 'changeGold', amount: 25 }]),
    // 野原のモンスター
    foe({ name: 'バイクにのった鬼', emoji: '🏍️', col: 8, row: 8, hp: 30, atk: 8, def: 2, exp: 3, gold: 12, behavior: 'patrolH', speed: 1.4,
      miniScript: `
while true
  shotSide(true, randF(20, 156), 2.2, 4, 0)
  wait(14)
end while
`.trim() }),
    // ウイルスくん（tlDR Engine の看板敵）：バトルスプライトの1コマ目がそのまま徘徊シンボルになる。
    // たたかわず「ちょうさ」→「みのがす」でも消える
    foe({ name: 'ウイルスくん', emoji: '🦠', col: 12, row: 16, hp: 35, atk: 8, def: 2, exp: 4, gold: 14, behavior: 'random',
      battleSprite: TLDR_ENEMY_SPRITES.virovirokun,
      ...symbolSprite(TLDR_ENEMY_SPRITES.virovirokun.idle),
      // フキダシに出る攻撃前セリフ。条件は複数指定でき（AND）、最も具体的な行が選ばれる
      dialogue: [
        { text: 'なかまに…… なってくれるの？', actUsed: 'ちょうさ', mercyAbovePct: 60 },
        { text: '……ぼくのこと、みてくれるの？', actUsed: 'ちょうさ' },
        { text: 'えへへ…… てれるなあ', actUsed: 'はげます' },
        { text: 'もう…… きえちゃいそう……', hpBelowPct: 30 },
        'ハリを ばらまいちゃうぞ！',
      ],
      miniScript: `
while true
  shotRain(randF(1.4, 2.0), 4, 1)
  wait(13)
end while
`.trim() }),
    // ぼうしおばけ：ランダムエンカウント廃止に伴い徘徊シンボルとして再配置
    foe({ name: 'ぼうしおばけ', emoji: '🎩', col: 20, row: 8, hp: 26, atk: 6, def: 3, exp: 2, gold: 10, behavior: 'random',
      moves: [{ name: 'ハイタッチをもとめる', power: 6 }] }),
    foe({ name: 'ぱずるにんぎょう', emoji: '🧩', col: 22, row: 16, hp: 32, atk: 9, def: 3, exp: 4, gold: 14, behavior: 'random',
      moves: [{ name: 'かおのパーツこうげき', power: 8, miniScript: `
while true
  shotRain(1.6, 4, 4)
  wait(18)
end while
`.trim() }] }),
    // 出口 → フィールドタウン
    warp('🚪', 15, 22, 'town', 15, 2),
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン2：フィールドタウン（カードのもんしょうの まち）
// ══════════════════════════════════════════════════════════════════════════
const townMap = M([
  'ffffffffffffffffffffffffffffff',
  'fggggggggggggggggggggggggggggf',
  'fg............................f',
  'fg..FFFF..............FFFF..fg',
  'fg..FFFF..............FFFF..fg',
  'fg............................f',
  'fg............................f',
  'fg....FF............FF.......f',
  'fg....FF............FF.......f',
  'fg............................f',
  'fg............................f',
  'fg..............bb............f',
  'fg............................f',
  'fg............................f',
  'fg....FFFFFF......FFFFFF.....f',
  'fg....FFFFFF......FFFFFF.....f',
  'fg............................f',
  'fg............................f',
  'fg............................f',
  'fg............................f',
  'fg............................f',
  'fg............................f',
  'fg............................f',
  'ffffffffffffffffffffffffffffff',
]);

const sceneTown: SceneDef = {
  id: 'town', name: 'フィールドタウン',
  map: townMap,
  // まちも シンボルエンカウントのみ（でんせんおおかみ・きれたマネキンは objects 側に徘徊配置済み）
  bgm: { ref: `direct:${tldrMusicUrl('exCity')}`, src: tldrMusicUrl('exCity'), type: 'direct' },
  objects: [
    // 宿・回復ポイント
    newObject({
      emoji: '🏨', col: 5, row: 4, behavior: 'still', hazard: false,
      pages: [{ conditions: {}, commands: [
        { type: 'message', text: '宿の主人「やあ、旅の人。ゆっくり やすんで いきなよ」' },
        { type: 'restoreHp' }, { type: 'restoreMp' },
        { type: 'message', text: 'HPとTPが 全回復した！' },
      ]}],
    }),
    // 武器・防具ショップ
    newObject({
      emoji: '🛍️', col: 24, row: 4, behavior: 'still', hazard: false,
      shopItems: [
        { itemId: 'rustyDagger', price: 30 },
        { itemId: 'manlyBandanna', price: 35 },
        { itemId: 'cheese', price: 12 },
        { itemId: 'croissant', price: 8 },
      ],
      pages: [{ conditions: {}, commands: [
        { type: 'message', text: '店員「いらっしゃい！ くらやみ製の 武具も おいてるよ」' },
      ]}],
    }),
    // ノエル（雪の女の子・寄り道NPC）
    npc('❄️', 6, 8, 'ノエル「あ、あの……だいじょうぶ、ですか？ わたしで よければ おてつだい します……」'),
    // 看板イベント
    newObject({
      emoji: '🪧', col: 16, row: 11, behavior: 'still', hazard: false,
      pages: [{ conditions: {}, commands: [
        { type: 'message', text: '看板「このさき カード城。\nおうさまが にんげんを まちかまえている らしい」' },
      ]}],
    }),
    // まちのモンスター
    foe({ name: 'でんせんおおかみ', emoji: '🐺', col: 10, row: 16, hp: 44, atk: 12, def: 5, exp: 8, gold: 16, behavior: 'random' }),
    foe({ name: 'きれたマネキン', emoji: '🪞', col: 22, row: 16, hp: 50, atk: 13, def: 6, exp: 9, gold: 18, behavior: 'still',
      moves: [{ name: 'ヒビわれた 笑顔', power: 10, miniScript: `
while true
  shotPlayer(getPlayerX(), -6, 1.8, 5, 3)
  wait(20)
end while
`.trim() }] }),
    // 出口 → カード城
    warp('🚪', 15, 1, 'field', 15, 20),
    warp('🕳️', 15, 22, 'castle', 14, 2),
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// シーン3：カード城（おうさまの ぎょくざ）
// ══════════════════════════════════════════════════════════════════════════
const castleMap = M([
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  'Fssssssssssssssssssssssssssssf',
  'Fs............................s',
  'Fs..gggggggggggggggggggggg..s',
  'Fs..g......................g..s',
  'Fs..g..xx............xx..g..s',
  'Fs..g..xx............xx..g..s',
  'Fs..g......................g..s',
  'Fs..gggggg..........gggggg..s',
  'Fs..........................s',
  'Fs..........................s',
  'Fs..gggggggggggggggggggggg..s',
  'Fs..g......................g..s',
  'Fs..g......................g..s',
  'Fs..gggggg..........gggggg..s',
  'Fs..........................s',
  'Fs..........................s',
  'Fs..........................s',
  'Fs..........................s',
  'Fs..........................s',
  'Fs..........................s',
  'Fs..........................s',
  'Fssssssssssssssssssssssssssssf',
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
]);

const sceneCastle: SceneDef = {
  id: 'castle', name: 'カード城',
  map: castleMap,
  bgm: { ref: `direct:${tldrMusicUrl('story')}`, src: tldrMusicUrl('story'), type: 'direct' },
  objects: [
    // ラルセイの応援
    npc('🐐', 15, 4, 'ラルセイ「おうさまは きっと わかりあえる。\nでも……ゆだんは できないよ」'),
    // 玉座の前・王とのやりとり
    newObject({
      emoji: '👑', col: 15, row: 12, behavior: 'still', hazard: false,
      pages: [
        { conditions: { selfSwitchId: 'A', selfSwitchValue: true }, commands: [] },
        { conditions: {}, commands: [
          { type: 'message', text: 'おうさま「ようこそ、まよい人よ。\nこの せかいの ためにも……ここは とおせぬ」' },
          { type: 'choice', text: 'おうさま「たたかいたくは ないが、どうする？」', choices: [
            { label: 'たたかう', commands: [
              { type: 'message', text: 'おうさま「ならば……うけて みせよう！」' },
            ]},
            { label: 'はなしあう', commands: [
              { type: 'message', text: 'おうさま「……その気持ちは うれしいが、\nおうとしての つとめは はたさねば」' },
            ]},
          ]},
          { type: 'setSelfSwitch', id: 'A', value: true },
        ]},
      ],
    }),
    // 最終ボス：カードのおうさま（たおしても みのがしても クリア）
    foe({
      name: 'カードのおうさま', emoji: '👑', col: 15, row: 14, hp: 220, atk: 18, def: 16, exp: 260, gold: 0,
      miniScript: `
while true
  a = rand(45, 135)
  for i in range(-2, 2, 1)
    shotAngle(88, -4, a + i * 12, 2.0, 4, 7)
  end for
  wait(22)
end while
`.trim(),
      // フキダシに出る攻撃前セリフ。actUsed＋hpBelowPct のように複数条件（AND）を組み合わせられる
      dialogue: [
        { text: 'その しらべは もう きかん……！', actUsed: 'ちょうさ', hpBelowPct: 25 },
        { text: '……そこまで 本気だとはね', actUsed: 'ちょうさ' },
        { text: 'もう すこしで おわる……', hpBelowPct: 25 },
        { text: 'これでも まだ ひくわけには いかん', hpBelowPct: 55 },
        { text: 'なぜ 剣を おさめられるのだ……', mercyAbovePct: 70 },
        'うけて もらおう',
      ],
      moves: [
        {
          name: 'カードのつるぎ', power: 15,
          miniScript: `
setDuration(300)
while true
  shotRain(randF(1.6, 2.2), 5, 6)
  shotRain(randF(1.6, 2.2), 4, 1)
  wait(9)
end while
`.trim(),
        },
        {
          name: 'こくおうの さいはい', power: 19,
          miniScript: `
while true
  shotPlayer(getPlayerX(), -6, 2.4, 5, 6)
  shotPlayer(-6, getPlayerY(), 2.4, 5, 6)
  shotPlayer(182, getPlayerY(), 2.4, 5, 6)
  wait(32)
end while
`.trim(),
        },
      ],
      behavior: 'still', speed: 0, isBoss: true,
      outroDialogue: [
        { speaker: 'おうさま', emoji: '👑', text: '……ここまでか。\nくらやみの せかいにも、やさしさが あったのだな。' },
        { speaker: 'ラルセイ', emoji: '🐐', side: 'right', text: 'これで……くらやみの せかいに ひかりが もどるはず。' },
        { speaker: 'スージー', emoji: '😈', side: 'right', text: 'はっ、あんがい やるじゃんか。' },
      ],
    }),
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// プリセット本体
// ══════════════════════════════════════════════════════════════════════════
export const deltarune: PresetData = {
  id: 'deltarune', name: 'デルタルーン', engine: 'rpg', gravity: 0, friction: 0,
  player: {
    emoji: '🙂', color: '#7a4ab5', speed: 3, jumpPower: 0, w: TILE_SIZE, h: TILE_SIZE,
    start: { x: TILE_SIZE * 15, y: TILE_SIZE * 2 },
  },
  tiles,
  map: JSON.parse(JSON.stringify(fieldMap)),
  objects: [...sceneField.objects],
  scenes: [sceneField, sceneTown, sceneCastle],
  scroll: { worldCols: 30, worldRows: 24 },
  battle: {
    playerName: 'クリス',
    // デルタルーン風パーティ戦闘：'soul'の弾幕よけ・タイミング攻撃を流用しつつ、party（クリス/スージー/ラルセイ）
    // が1人ずつ行動選択する。TPはMPとは別の共有リソース（毎戦闘0開始・グレイズ/まもるで加算・呪文で消費）。
    style: 'deltarune',
    maxHp: 26, maxMp: 0, atk: 9, def: 6,
    gold: 0,
    moves: [
      // mercy 持ちの技は「ちょうさ」：ダメージゼロで敵意ゲージを溜め、満タンで「みのがす」が成立する
      { name: 'ちょうさ',   cost: 0, power: 0,  mercy: 45 },
      { name: 'はげます',   cost: 0, power: 0,  mercy: 55 },
    ],
    labels: { attack: 'たたかう', move: 'ACT', flee: 'にげる', item: 'アイテム', mercy: 'みのがす' },
    // party[0]＝フィールド上の操作キャラ本人（クリス）。スージー・ラルセイは戦闘専用の同行キャラ
    // （フィールドには実体を持たず、HPは戦闘ごとに maxHp から再開する）。
    // バトルスプライトは tlDR Engine の横向きグラフィック（idle/attack/act/spell/item/hurt/defend/defeat）。
    // color/icon はステータスボックスの配色・顔グラ（GameMaker 版の c_aqua / c_fuchsia / c_lime に対応）。
    party: [
      { id: 'kris',   name: 'クリス',   emoji: '🙂', maxHp: 26, color: TLDR_PARTY_UI.kris.color,
        battleSprites: { ...TLDR_PARTY_SPRITES.kris, icon: TLDR_PARTY_UI.kris.icon, iconHurt: TLDR_PARTY_UI.kris.iconHurt } },
      // スージーのコマンドはラルセイ同様「まほう」（こうどうは使えない）。ルードバスターは
      // tlDR Engine の item_s_rudebuster 準拠：TP50消費・タイミングバー無しの確定大ダメージ
      // （原作の攻撃×11＋魔力×5をこのゲームのダメージスケールに換算）。SEも同エンジンの専用音源。
      { id: 'susie',  name: 'スージー', emoji: '😈', maxHp: 34, color: TLDR_PARTY_UI.susie.color,
        battleSprites: { ...TLDR_PARTY_SPRITES.susie, icon: TLDR_PARTY_UI.susie.icon, iconHurt: TLDR_PARTY_UI.susie.iconHurt }, spells: [
        { name: 'ルードバスター', tpCost: 50, power: 42,
          castSfxUrl: tldrSfxUrl('rudeBusterSwing'), hitSfxUrl: tldrSfxUrl('rudeBusterHit') },
      ] },
      { id: 'ralsei', name: 'ラルセイ', emoji: '🐐', maxHp: 22, color: TLDR_PARTY_UI.ralsei.color,
        battleSprites: { ...TLDR_PARTY_SPRITES.ralsei, icon: TLDR_PARTY_UI.ralsei.icon, iconHurt: TLDR_PARTY_UI.ralsei.iconHurt }, spells: [
        { name: 'ねがいのかぜ', tpCost: 20, power: 34, heal: true },
        { name: 'ちからのかぜ', tpCost: 24, power: 22 },
      ] },
    ],
    levelTable: [
      { level: 2, exp: 10,  maxHp: 34, maxMp: 0, atk: 12, def: 8  },
      { level: 3, exp: 22,  maxHp: 42, maxMp: 0, atk: 15, def: 10 },
      { level: 4, exp: 38,  maxHp: 50, maxMp: 0, atk: 18, def: 13 },
      { level: 5, exp: 58,  maxHp: 58, maxMp: 0, atk: 21, def: 16 },
      { level: 6, exp: 85,  maxHp: 66, maxMp: 0, atk: 25, def: 19 },
      { level: 7, exp: 120, maxHp: 74, maxMp: 0, atk: 29, def: 22 },
    ],
  },
  items: [
    { id: 'darkCandy', name: 'ダークキャンディ', emoji: '🍬', description: 'HPを 16 回復する。くらやみの あじ',      category: 'consumable', healHp: 16 },
    { id: 'croissant', name: 'クロワッサン',     emoji: '🥐', description: 'HPを 20 回復する。さくさく してる',      category: 'consumable', healHp: 20 },
    { id: 'cheese',    name: 'チーズ',           emoji: '🧀', description: 'HPを 30 回復する。ねずみが すき',        category: 'consumable', healHp: 30 },
    { id: 'bacon',     name: 'ベーコンスープ',   emoji: '🍲', description: 'HPを 45 回復する。あたたまる',          category: 'consumable', healHp: 45 },
    { id: 'rustyDagger',    name: 'さびたダガー',       emoji: '🗡️', description: 'すこし さびている。こうげき力＋8',   category: 'weapon', atkBonus: 8 },
    { id: 'manlyBandanna',  name: 'マッチョバンダナ',   emoji: '🥋', description: 'きんにくの絵。しゅび力＋10',        category: 'armor', defBonus: 10 },
    { id: 'shadowCrown',    name: 'くらやみの かんむり', emoji: '👑', description: 'ふしぎな ちからを かんじる。しゅび力＋20', category: 'armor', defBonus: 20 },
  ],
  titleScreen: {
    enabled: true,
    heading: 'デルタルーン',
    subtitle: 'くらやみの せかいを めぐる ふしぎな ぼうけん',
    textColor: '#ffffff',
    menu: [
      { kind: 'newGame', label: 'ぼうけんを はじめる' },
    ],
  },
  ending: {
    enabled: true,
    heading: 'つづく……',
    message: 'くらやみの せかいに ひかりが もどった。\nまた いつか、この せかいで あおう。\n\n——きみの ぼうけんは、まだ はじまったばかり。',
    textColor: '#c9a53a',
  },
  bgm:       { ref: `direct:${tldrMusicUrl('exSpawn')}`, src: tldrMusicUrl('exSpawn'), type: 'direct' },
  battleBgm: { ref: `direct:${tldrMusicUrl('battle')}`, src: tldrMusicUrl('battle'), type: 'direct' },
  bossBgm:   { ref: `direct:${tldrMusicUrl('darkness')}`, src: tldrMusicUrl('darkness'), type: 'direct' },
  sfx: {
    levelup:  { ref: `direct:${tldrSfxUrl('levelup')}`, src: tldrSfxUrl('levelup'), type: 'direct' },
    purchase: { ref: `direct:${tldrSfxUrl('uiSelect')}`, src: tldrSfxUrl('uiSelect'), type: 'direct' },
    inn:      { ref: `direct:${tldrSfxUrl('heal')}`, src: tldrSfxUrl('heal'), type: 'direct' },
    save:     { ref: `direct:${tldrSfxUrl('save')}`, src: tldrSfxUrl('save'), type: 'direct' },
    damage:   { ref: `direct:${tldrSfxUrl('hurt')}`, src: tldrSfxUrl('hurt'), type: 'direct' },
    clear:    { ref: 'clear' },
  },
};
