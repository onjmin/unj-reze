import { type PresetData, type SceneDef, type ObjectDef, newObject, ROWS, TILE_SIZE } from './shared';
import { spriteUrl as sp, sAnimUrl as sa } from '@/lib/rpgen-assets';
import { mmScene1, mmScene2 } from './vglc-stages';
import { megamanMusicUrl, megamanSfxUrl } from '@/lib/megaman-assets';
// id は rpgen-search API の id フィールド（ハッシュ文字列）
const wr  = (id: string) => `walk:auto:u:${sa(id)}`;
const ir  = (id: string) => `url:${sp(id)}`;

const tiles: PresetData['tiles'] = {
  0: { name: '空',             color: '#0d1826', passable: true,  imageRef: ir('X1lgbYC'), imageUrl: sp('X1lgbYC') },
  1: { name: '鉄床',           color: '#b4b6b4', passable: false, imageRef: ir('wF7vf3V'), imageUrl: sp('wF7vf3V') },
  2: { name: 'トゲ',           color: '#c03030', passable: true,  special: 'trap',         imageRef: ir('wGAsfp2'), imageUrl: sp('wGAsfp2') },
  3: { name: 'ゴール扉',       color: '#28c090', passable: true,  special: 'goal',         imageRef: ir('7S58d26'), imageUrl: sp('7S58d26') },
  4: { name: '壁',             color: '#e1e1e1', passable: false, imageRef: ir('eqty6yo'), imageUrl: sp('eqty6yo') },
  5: { name: 'はしご',         color: '#c08030', passable: true,  special: 'ladder'        },   // 上下移動可能
  6: { name: 'チェックポイント', color: '#ff8800', passable: true, special: 'checkpoint'   },   // 死亡後の復帰地点
  7: { name: 'すり抜け床',     color: '#7fa8d0', passable: true,  special: 'oneway'        },   // 下から通過・上に乗れる
  8: { name: '壊せるブロック', color: '#a06040', passable: false, special: 'destructible'  },   // 下から叩くと壊れる
};

// 文字マップ → タイルID（手書きステージ用）
// '.'=空 '#'=鉄床 '^'=トゲ 'G'=ゴール扉 'W'=壁 'H'=はしご 'C'=チェックポイント '='=すり抜け床 'D'=壊せるブロック
const M: Record<string, number> = { '.': 0, '#': 1, '^': 2, G: 3, W: 4, H: 5, C: 6, '=': 7, D: 8 };
const parseMap = (rows: string[]): number[][] => rows.map(r => [...r].map(ch => M[ch] ?? 0));

// ── 敵スプライト（RPGen 歩行グラ） ──────────────────────────────────────────
const SPR = {
  metall:  'pyPkIs',  // 🪖 闇堕ち兵士 → 歩兵ロボ
  turret:  'tSHy6V',  // 🔫 砲台
  hopper:  'oE4l1x',  // 👾 拡散弾ロボ
  spider:  'R42ett',  // 🕷️ 天井グモ砲台
  bug:     'xwdoKc',  // 🐞 機械虫（高速クローラー）
  joe:     'GHlUP0',  // 🛡️ 仮面兵士 → スナイパージョー
  tank:    'HyRVeC',  // 🚙 Blue Tank → スナイパーアーマー／ワイリーマシン
  cutman:  'zA2cuG',  // ✂️ 超上級兵士 → カットマン
  metalman:'HrNVjO',  // ⚙️ 最上級兵士（赤）→ メタルマン
  robot:   'gmLHHM',  // 🤖 クソアホロボット → ガードロボ
  light:   'FKJGb3',  // 👨‍🔬 白衣の老博士 → ライト博士
  wily:    'Wat0NA',  // 🧑‍🔬 博士 → Dr.ワイリー
  rock:    'PFBNfk',  // 🤖 青の民 → ロック
};

// アイテム設置のショートハンド
const item = (emoji: string, col: number, row: number, itemId: string): ObjectDef =>
  newObject({ emoji, col, row, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none', itemId, message: '' });

// ═══════════════════════════════════════════════════════════════════════════
//  ワールド構成（exits で右・下に連結。BFS 合成で 1 枚のワールドになる）
//
//   [stage1 道中1 40x15] → [stage2 跳び石 40x15]
//                              ↓（4つの縦穴すべてが下の階へ通じる）
//                          [stage3 地下水路 40x15] → [bossCut ✂️ 20x15] → [stage4 要塞工場 40x15]
//                            → [bossMetal ⚙️ 20x15] → [wily1 要塞回廊 40x15] → [bossWily 🛸 20x15(GOAL)]
// ═══════════════════════════════════════════════════════════════════════════

// ── シーン1：道中 1 (VGLC Mega Man 1-1 前半より) ─────────────────────────────
// Source: TheVGLC/TheVGLC MegaMan/megaman_1_1.txt (CC BY-NC-SA 4.0)
const scene1Map = mmScene1.map(row => [...row]);

const scene1: SceneDef = {
  id: 'stage1', name: '道中1・市街地',
  map: scene1Map,
  exits: { right: 'stage2' },
  objects: [
    // ライト博士（操作ガイド NPC）
    newObject({ emoji: '👨‍🔬', col: 2, row: 11, behavior: 'still', hazard: false, hp: 1, speed: 0, bullet: 'none',
      objType: 'npc', name: 'ライト博士',
      message: 'ロック、Xでバスター、Zでジャンプじゃ。武器を拾ったらEで切り替えられるぞ。トゲに触れると一発でやられるから気をつけるんじゃ！',
      spriteRef: wr(SPR.light), spriteUrl: sa(SPR.light) }),
    // 歩兵ロボ（メットール型）
    newObject({ emoji: '🪖', col: 6,  row: 11, behavior: 'walker', speed: 1.5, hazard: true, hp: 1, bullet: 'none', atk: 2,
      spriteRef: wr(SPR.metall), spriteUrl: sa(SPR.metall) }),
    newObject({ emoji: '🪖', col: 13, row: 11, behavior: 'walker', speed: 1.7, hazard: true, hp: 1, bullet: 'none', atk: 2,
      spriteRef: wr(SPR.metall), spriteUrl: sa(SPR.metall) }),
    // スナイパージョー（盾持ち・狙い撃ち）
    newObject({ emoji: '🛡️', col: 17, row: 11, behavior: 'still', speed: 0, hazard: true, hp: 3, atk: 3,
      bullet: 'aimed', fireRate: 90, bulletSpeed: 3, bulletColor: '#ffaa00',
      name: 'スナイパージョー', spriteRef: wr(SPR.joe), spriteUrl: sa(SPR.joe) }),
    // 高架デッキ（row10 の長い足場）の上の敵
    newObject({ emoji: '🔫', col: 20, row: 9, behavior: 'still', hazard: true, hp: 2, atk: 2,
      bullet: 'aimed', fireRate: 85, bulletSpeed: 3.2, bulletColor: '#ff6644',
      spriteRef: wr(SPR.turret), spriteUrl: sa(SPR.turret) }),
    newObject({ emoji: '👾', col: 26, row: 9, behavior: 'walker', speed: 1.8, hazard: true, hp: 2, atk: 2,
      bullet: 'spread', fireRate: 110, bulletColor: '#ff9900', bulletSpeed: 3,
      spriteRef: wr(SPR.hopper), spriteUrl: sa(SPR.hopper) }),
    // 機械虫（終盤の地上）
    newObject({ emoji: '🐞', col: 33, row: 11, behavior: 'walker', speed: 2.2, hazard: true, hp: 1, bullet: 'none', atk: 2,
      name: '機械虫', spriteRef: wr(SPR.bug), spriteUrl: sa(SPR.bug) }),
    // アイテム：足場の上のエネルギーカプセル
    item('💊', 25, 5, 'energyCapsule'),
    item('💊', 10, 11, 'energyCapsule'),
  ],
};

// ── シーン2：跳び石地帯 (VGLC Mega Man 1-1 中盤より) ─────────────────────────
// Source: TheVGLC/TheVGLC MegaMan/megaman_1_1.txt (CC BY-NC-SA 4.0)
// 床の 4 つの縦穴はすべて下の stage3（地下水路）へ通じる正規ルート。
const scene2Map = mmScene2.map(row => [...row]);
scene2Map[11][2] = 6;                                     // 入口チェックポイント
for (let r = 0; r < ROWS; r++) scene2Map[r][39] = 4;      // 右端は行き止まり（進路は下）

const scene2: SceneDef = {
  id: 'stage2', name: '道中2・跳び石地帯',
  map: scene2Map,
  exits: { down: 'stage3' },
  objects: [
    // 柱の上の砲台
    newObject({ emoji: '🔫', col: 10, row: 7, behavior: 'still', hazard: true, hp: 2, atk: 2,
      bullet: 'aimed', fireRate: 95, bulletSpeed: 2.8, bulletColor: '#ff6644',
      spriteRef: wr(SPR.turret), spriteUrl: sa(SPR.turret) }),
    newObject({ emoji: '🔫', col: 26, row: 7, behavior: 'still', hazard: true, hp: 2, atk: 2,
      bullet: 'aimed', fireRate: 80, bulletSpeed: 3, bulletColor: '#ff6644',
      spriteRef: wr(SPR.turret), spriteUrl: sa(SPR.turret) }),
    // スナイパーアーマー（装甲戦車）
    newObject({ emoji: '🚙', col: 4, row: 11, behavior: 'walker', speed: 0.8, hazard: true, hp: 6, atk: 4,
      bullet: 'aimed', fireRate: 70, bulletSpeed: 3, bulletColor: '#ffcc00',
      name: 'スナイパーアーマー', spriteRef: wr(SPR.tank), spriteUrl: sa(SPR.tank) }),
    // 中段足場のクモ砲台
    newObject({ emoji: '🕷️', col: 9, row: 9, behavior: 'still', hazard: true, hp: 1, atk: 2,
      bullet: 'aimed', fireRate: 100, bulletSpeed: 2.5, bulletColor: '#ff9900',
      spriteRef: wr(SPR.spider), spriteUrl: sa(SPR.spider) }),
    newObject({ emoji: '🕷️', col: 24, row: 9, behavior: 'still', hazard: true, hp: 1, atk: 2,
      bullet: 'aimed', fireRate: 90, bulletSpeed: 2.5, bulletColor: '#ff9900',
      spriteRef: wr(SPR.spider), spriteUrl: sa(SPR.spider) }),
    // 柱の上の回復（跳び渡りのご褒美）
    item('🩹', 34, 7, 'smallEnergyTank'),
  ],
};

// ── シーン3：地下水路（stage2 の縦穴の受け皿。右のカットマン部屋へ）──────────
const scene3: SceneDef = {
  id: 'stage3', name: '道中3・地下水路',
  map: parseMap([
    '############..######..######..######..##',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W..........===.....===.....===.....===.W',
    'W......................................W',
    'W..###...........###...........###.....W',
    'W......................................W',
    'W......................................W',
    'W.......................................',
    'W.......................................',
    'W............C........................C.',
    'W#####^^#######^^#######^^##############',
    'W#######################################',
  ]),
  exits: { right: 'bossCut' },
  objects: [
    // 左の袋小路（トゲ越え）のご褒美
    item('🔋', 2, 12, 'energyTank'),
    // 足場のクモ砲台
    newObject({ emoji: '🕷️', col: 4, row: 6, behavior: 'still', hazard: true, hp: 1, atk: 2,
      bullet: 'aimed', fireRate: 110, bulletSpeed: 2.5, bulletColor: '#ff9900',
      spriteRef: wr(SPR.spider), spriteUrl: sa(SPR.spider) }),
    newObject({ emoji: '🕷️', col: 32, row: 6, behavior: 'still', hazard: true, hp: 1, atk: 2,
      bullet: 'aimed', fireRate: 95, bulletSpeed: 2.8, bulletColor: '#ff9900',
      spriteRef: wr(SPR.spider), spriteUrl: sa(SPR.spider) }),
    item('💊', 18, 6, 'energyCapsule'),
    // 床の機械虫
    newObject({ emoji: '🐞', col: 18, row: 12, behavior: 'walker', speed: 2.2, hazard: true, hp: 1, bullet: 'none', atk: 2,
      name: '機械虫', spriteRef: wr(SPR.bug), spriteUrl: sa(SPR.bug) }),
    newObject({ emoji: '🐞', col: 27, row: 12, behavior: 'walker', speed: 2.4, hazard: true, hp: 1, bullet: 'none', atk: 2,
      name: '機械虫', spriteRef: wr(SPR.bug), spriteUrl: sa(SPR.bug) }),
  ],
};

// ── シーン4：カットマン部屋（ボス1）─────────────────────────────────────────
// 入口・出口の段差（row12 の #）はボスの徘徊を部屋に閉じ込めるため。
const bossCut: SceneDef = {
  id: 'bossCut', name: 'ボス・カットマン',
  map: parseMap([
    'WWWWWWWWWWWWWWWWWWWW',
    'W..................W',
    'W..................W',
    'W..................W',
    'W..................W',
    'W..................W',
    'W..................W',
    'W..................W',
    'W....###....###....W',
    'W..................W',
    '....................',
    '....................',
    '#C.................#',
    '####################',
    '####################',
  ]),
  exits: { right: 'stage4' },
  bgm: { ref: 'https://www.youtube.com/watch?v=uB1kNcqPe2U', src: 'https://www.youtube.com/watch?v=uB1kNcqPe2U', type: 'youtube' },
  objects: [
    newObject({
      emoji: '✂️', col: 14, row: 12,
      behavior: 'walker', speed: 1.9, hazard: true,
      hp: 22, atk: 4, bullet: 'aimed', fireRate: 55, bulletSpeed: 3.5, bulletColor: '#ffdd66',
      isBoss: true, name: 'カットマン',
      spriteRef: wr(SPR.cutman), spriteUrl: sa(SPR.cutman),
      outroDialogue: [
        { speaker: 'カットマン', emoji: '✂️', text: 'ぐおおっ……そんな、バスターに敗れるとは……！' },
        { speaker: 'ロック',     emoji: '🤖', side: 'right', text: 'ローリングカッターはもらっていくよ！' },
      ],
    }),
    // ボスの奥の報酬
    item('✂️', 17, 12, 'airShooter'),
    item('💊', 18, 12, 'energyCapsule'),
  ],
};

// ── シーン5：要塞工場（はしごの上ルートと、トゲ床の下ルート）──────────────────
const scene5: SceneDef = {
  id: 'stage4', name: '道中4・要塞工場',
  map: parseMap([
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W.............####....####....####.....W',
    'W.........===..........................W',
    'W.......H..............................W',
    'W..#####H..............................W',
    'W.......H..............................W',
    'W.......H..............................W',
    '........H..........==.......==..........',
    '........H...............................',
    '.C......H.............C.................',
    '#########^^^######^^^^#####^^^^#########',
    '########################################',
  ]),
  exits: { right: 'bossMetal' },
  objects: [
    // 下ルート：床の敵
    newObject({ emoji: '🐞', col: 14, row: 12, behavior: 'walker', speed: 2.2, hazard: true, hp: 1, bullet: 'none', atk: 2,
      name: '機械虫', spriteRef: wr(SPR.bug), spriteUrl: sa(SPR.bug) }),
    newObject({ emoji: '🛡️', col: 24, row: 12, behavior: 'still', speed: 0, hazard: true, hp: 3, atk: 3,
      bullet: 'aimed', fireRate: 80, bulletSpeed: 3.2, bulletColor: '#ffaa00',
      name: 'スナイパージョー', spriteRef: wr(SPR.joe), spriteUrl: sa(SPR.joe) }),
    newObject({ emoji: '🐞', col: 33, row: 12, behavior: 'walker', speed: 2.4, hazard: true, hp: 1, bullet: 'none', atk: 2,
      name: '機械虫', spriteRef: wr(SPR.bug), spriteUrl: sa(SPR.bug) }),
    newObject({ emoji: '🚙', col: 36, row: 12, behavior: 'walker', speed: 0.9, hazard: true, hp: 6, atk: 4,
      bullet: 'aimed', fireRate: 75, bulletSpeed: 3, bulletColor: '#ffcc00',
      name: 'スナイパーアーマー', spriteRef: wr(SPR.tank), spriteUrl: sa(SPR.tank) }),
    item('💊', 17, 12, 'energyCapsule'),
    // 上ルート（はしご→すり抜け床→足場渡り）：クモ砲台と武器タンク
    newObject({ emoji: '🕷️', col: 23, row: 3, behavior: 'still', hazard: true, hp: 1, atk: 2,
      bullet: 'aimed', fireRate: 90, bulletSpeed: 2.8, bulletColor: '#ff9900',
      spriteRef: wr(SPR.spider), spriteUrl: sa(SPR.spider) }),
    item('🔵', 31, 3, 'weaponTank'),
  ],
};

// ── シーン6：メタルマン部屋（ボス2）────────────────────────────────────────
// 中央のトゲ溝でメタルマンは右半分に張り付き、高速の狙い撃ちブレードを飛ばす。
const bossMetal: SceneDef = {
  id: 'bossMetal', name: 'ボス・メタルマン',
  map: parseMap([
    'WWWWWWWWWWWWWWWWWWWW',
    'W..................W',
    'W..................W',
    'W..................W',
    'W..................W',
    'W..................W',
    'W..................W',
    'W...##........##...W',
    'W..................W',
    'W..................W',
    '....................',
    '....................',
    '#C.................#',
    '########^^##########',
    '####################',
  ]),
  exits: { right: 'wily1' },
  bgm: { ref: `direct:${megamanMusicUrl('metalman')}`, src: megamanMusicUrl('metalman'), type: 'direct' },
  objects: [
    newObject({
      emoji: '⚙️', col: 15, row: 12,
      behavior: 'walker', speed: 2.3, hazard: true,
      hp: 26, atk: 4, bullet: 'aimed', fireRate: 40, bulletSpeed: 4.5, bulletColor: '#dddddd',
      isBoss: true, name: 'メタルマン',
      spriteRef: wr(SPR.metalman), spriteUrl: sa(SPR.metalman),
      outroDialogue: [
        { speaker: 'メタルマン', emoji: '⚙️', text: 'バカな……このメタルブレードが……通じない……' },
        { speaker: 'ロック',     emoji: '🤖', side: 'right', text: '次はワイリーだ！待っていろ！' },
      ],
    }),
    // ボスの奥の報酬
    item('🗡️', 17, 12, 'metalBlade'),
    item('🔋', 18, 12, 'energyTank'),
  ],
};

// ── シーン7：要塞回廊（最難関。壁ジャンプの隠し部屋にクラッシュボム）──────────
const wily1: SceneDef = {
  id: 'wily1', name: '道中5・ワイリー要塞',
  map: parseMap([
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W......................................W',
    'W......................................W',
    'W.............................##.......W',
    'W............................#...#.....W',
    'W............................#...#.....W',
    'W............................#...#.....W',
    'W....###.....................#...#.....W',
    'W............................#...#.....W',
    'W............................#...#.....W',
    '........................................',
    '........................................',
    '.C..................................C...',
    '#####^^^######^^######^^^###############',
    '########################################',
  ]),
  exits: { right: 'bossWily' },
  objects: [
    newObject({ emoji: '🪖', col: 3, row: 11, behavior: 'walker', speed: 1.8, hazard: true, hp: 2, bullet: 'none', atk: 3,
      spriteRef: wr(SPR.metall), spriteUrl: sa(SPR.metall) }),
    // 足場のクモ砲台
    newObject({ emoji: '🕷️', col: 6, row: 6, behavior: 'still', hazard: true, hp: 1, atk: 3,
      bullet: 'aimed', fireRate: 85, bulletSpeed: 3, bulletColor: '#ff9900',
      spriteRef: wr(SPR.spider), spriteUrl: sa(SPR.spider) }),
    // トゲ溝の間を守る装甲戦車
    newObject({ emoji: '🚙', col: 18, row: 12, behavior: 'walker', speed: 0.9, hazard: true, hp: 6, atk: 4,
      bullet: 'aimed', fireRate: 70, bulletSpeed: 3.2, bulletColor: '#ffcc00',
      name: 'スナイパーアーマー', spriteRef: wr(SPR.tank), spriteUrl: sa(SPR.tank) }),
    // 終盤：追跡ガードロボ＋機械虫
    newObject({ emoji: '🤖', col: 34, row: 12, behavior: 'chase', speed: 2.0, hazard: true, hp: 5, bullet: 'none', atk: 4,
      name: 'ガードロボ', spriteRef: wr(SPR.robot), spriteUrl: sa(SPR.robot) }),
    newObject({ emoji: '🐞', col: 27, row: 12, behavior: 'walker', speed: 2.4, hazard: true, hp: 1, bullet: 'none', atk: 3,
      name: '機械虫', spriteRef: wr(SPR.bug), spriteUrl: sa(SPR.bug) }),
    item('💊', 26, 12, 'energyCapsule'),
    // 壁ジャンプの隠し部屋（縦穴 col30-32 を左右の壁で登る）
    item('💣', 30, 2, 'crashBomb'),
    item('🔹', 31, 2, 'smallWeaponTank'),
  ],
};

// ── シーン8：ワイリーマシン部屋（最終ボス＋ゴール扉）───────────────────────
const bossWily: SceneDef = {
  id: 'bossWily', name: '決戦・ワイリーマシン',
  map: parseMap([
    'WWWWWWWWWWWWWWWWWWWW',
    'W..................W',
    'W..................W',
    'W..................W',
    'W..................W',
    'W..................W',
    'W..................W',
    'W...###......###...W',
    'W..................W',
    'W..................W',
    '...................W',
    '...................W',
    '#C...............G.W',
    '####################',
    '####################',
  ]),
  bgm: { ref: 'https://www.youtube.com/watch?v=uB1kNcqPe2U', src: 'https://www.youtube.com/watch?v=uB1kNcqPe2U', type: 'youtube' },
  objects: [
    // Dr.ワイリー（右上の足場から観戦。撃破後は逃げ惑うだけ）
    newObject({ emoji: '🧑‍🔬', col: 14, row: 6, behavior: 'still', hazard: false, hp: 1, speed: 0, bullet: 'none',
      objType: 'npc', name: 'Dr.ワイリー',
      message: 'よ、よくぞここまで来おったな！ワイリーマシン1号の力を見せてやるわい！',
      spriteRef: wr(SPR.wily), spriteUrl: sa(SPR.wily) }),
    newObject({
      emoji: '🛸', col: 11, row: 12, w: 44, h: 40,
      behavior: 'walker', speed: 1.2, hazard: true,
      hp: 36, atk: 5, bullet: 'spiral', fireRate: 65, bulletSpeed: 2.2, bulletColor: '#ff66ff',
      isBoss: true, name: 'ワイリーマシン1号',
      spriteRef: wr(SPR.tank), spriteUrl: sa(SPR.tank),
      outroDialogue: [
        { speaker: 'Dr.ワイリー', emoji: '🧑‍🔬', text: 'ワイリーマシンが……！　ま、まいった！ゆるしてくれ〜！' },
        { speaker: 'ロック',      emoji: '🤖', side: 'right', text: 'もう悪さはさせない。扉の先へ進もう。' },
      ],
    }),
  ],
};

export const rockman: PresetData = {
  id: 'rockman', name: 'ロックマン', engine: 'action', gravity: 0.55, friction: 0.78,
  scroll: { worldCols: 40 },
  player: {
    emoji: '🤖', color: '#1e90ff', speed: 3.5, jumpPower: -11, w: 22, h: 24,
    start: { x: TILE_SIZE * 1, y: TILE_SIZE * (ROWS - 4) },
    hearts: 14,                       // 1ハート=2HP → ライフゲージ28目盛（原作準拠）
    weapons: ['buster'],              // 初期武器。ボス撃破の報酬アイテムでスロットが増える
    spriteRef: wr(SPR.rock), spriteUrl: sa(SPR.rock),
  },
  tiles,
  map: JSON.parse(JSON.stringify(scene1Map)),
  objects: [...scene1.objects],
  scenes: [scene1, scene2, scene3, bossCut, scene5, bossMetal, wily1, bossWily],
  items: [
    { id: 'buster',          name: 'ロックバスター',       emoji: '🔫', description: '初期装備。エネルギー無限の通常弾' },
    { id: 'energyCapsule',   name: 'エネルギーカプセル',   emoji: '💊', description: 'ライフを少し回復する小さなカプセル' },
    { id: 'smallEnergyTank', name: '小エネルギータンク',   emoji: '🩹', description: 'ライフを半分回復する中型タンク' },
    { id: 'energyTank',      name: 'エネルギータンク',     emoji: '🔋', description: 'ライフを全回復する大型タンク' },
    { id: 'weaponTank',      name: '武器エネルギータンク', emoji: '🔵', description: '全武器のエネルギーを全回復する' },
    { id: 'smallWeaponTank', name: '小武器エネルギータンク', emoji: '🔹', description: '選択中の武器エネルギーを半分回復する' },
    // 特殊武器（id はエンジン側の弾種と対応。E キーで切り替え）
    { id: 'airShooter',      name: 'ローリングカッター',   emoji: '✂️', description: 'カットマンの武器。3方向にカッターを放つ' },
    { id: 'metalBlade',      name: 'メタルブレード',       emoji: '🗡️', description: 'メタルマンの武器。8方向に回転ブレードを投げる' },
    { id: 'crashBomb',       name: 'クラッシュボム',       emoji: '💣', description: 'ワイリー製の大型爆弾を撃ち出す' },
  ],
  titleScreen: {
    enabled: true,
    heading: 'ロックマン',
    subtitle: 'Dr.ワイリーの野望を打ち砕け！',
    textColor: '#4488ff',
    menu: [
      { kind: 'newGame',  label: 'はじめから' },
    ],
  },
  ending: {
    enabled: true,
    heading: 'ALL STAGE CLEAR',
    message: 'ワイリーマシンを撃破し、世界に平和が戻った。\nロックの戦いは、まだ始まったばかり…',
    textColor: '#4488ff',
  },
  bgm:     { ref: 'https://www.youtube.com/watch?v=wgP_PK_umKM', src: 'https://www.youtube.com/watch?v=wgP_PK_umKM', type: 'youtube' },
  bossBgm: { ref: 'https://www.youtube.com/watch?v=uB1kNcqPe2U', src: 'https://www.youtube.com/watch?v=uB1kNcqPe2U', type: 'youtube' },
  sfx: {
    shot:   { ref: `direct:${megamanSfxUrl('shot')}`, src: megamanSfxUrl('shot'), type: 'direct' },
    jump:   { ref: `direct:${megamanSfxUrl('jump')}`, src: megamanSfxUrl('jump'), type: 'direct' },
    clear:  { ref: `direct:${megamanSfxUrl('energyFill')}`, src: megamanSfxUrl('energyFill'), type: 'direct' },
    damage: { ref: `direct:${megamanSfxUrl('damage')}`, src: megamanSfxUrl('damage'), type: 'direct' },
  },
};
