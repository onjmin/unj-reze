import { type PresetData, type SceneDef, newObject, COLS, ROWS, TILE_SIZE } from './shared';
import { spriteUrl as sp, sAnimUrl as sa } from '@/lib/rpgen-assets';
import { mmScene1, mmScene2 } from './vglc-stages';
// id は rpgen-search API の id フィールド（ハッシュ文字列）
const wr  = (id: string) => `walk:auto:u:${sa(id)}`;
const ir  = (id: string) => `url:${sp(id)}`;

const tiles: PresetData['tiles'] = {
  0: { name: '空',             color: '#0d1826', passable: true,  imageRef: ir('X1lgbYC'), imageUrl: sp('X1lgbYC') },
  1: { name: '鉄床',           color: '#3a4a5c', passable: false, imageRef: ir('hpicBeb'), imageUrl: sp('hpicBeb') },
  2: { name: 'トゲ',           color: '#c03030', passable: true,  special: 'trap',         imageRef: ir('wGAsfp2'), imageUrl: sp('wGAsfp2') },
  3: { name: 'ゴール扉',       color: '#28c090', passable: true,  special: 'goal',         imageRef: ir('7S58d26'), imageUrl: sp('7S58d26') },
  4: { name: '壁',             color: '#202a38', passable: false, imageRef: ir('vcyXmCw'), imageUrl: sp('vcyXmCw') },
  5: { name: 'はしご',         color: '#c08030', passable: true,  special: 'ladder'        },   // 上下移動可能
  6: { name: 'チェックポイント', color: '#ff8800', passable: true, special: 'checkpoint'   },   // 死亡後の復帰地点
  7: { name: '消えるブロック', color: '#8080ff', passable: false, special: 'disappearing'  },   // 踏むと数秒後に消える
  8: { name: '壊せる壁',       color: '#a06040', passable: false, special: 'destructible'  },   // ショットで破壊可能
};

// ── シーン1：道中 1 (VGLC Mega Man 1-1 前半より) ─────────────────────────────
// Source: TheVGLC/TheVGLC MegaMan/megaman_1_1.txt (CC BY-NC-SA 4.0)
const scene1Map = mmScene1.map(row => [...row]);

const scene1: SceneDef = {
  id: 'stage1', name: '道中 1',
  map: scene1Map,
  exits: { right: 'shaft' },
  objects: [
    newObject({ emoji: '🪖', col: 4,  row: ROWS - 3, behavior: 'walker', speed: 1.5, hazard: true, hp: 1, bullet: 'none', atk: 2,
      spriteRef: wr('pyPkIs'), spriteUrl: sa('pyPkIs') }),
    newObject({ emoji: '🪖', col: 12, row: ROWS - 3, behavior: 'walker', speed: 1.6, hazard: true, hp: 1, bullet: 'none', atk: 2,
      spriteRef: wr('pyPkIs'), spriteUrl: sa('pyPkIs') }),
    // スナイパージョー（シールド持ち。射撃中のみ被弾）
    newObject({ emoji: '🛡️', col: 16, row: ROWS - 3, behavior: 'still', speed: 0, hazard: true, hp: 3, atk: 4,
      bullet: 'aimed', fireRate: 90, bulletSpeed: 3, bulletColor: '#ffaa00',
      name: 'スナイパージョー' }),
    newObject({ emoji: '🔫', col: 8,  row: ROWS - 9, behavior: 'still', hazard: true, hp: 2, atk: 4,
      bullet: 'aimed', fireRate: 80, bulletSpeed: 3.5, bulletColor: '#ff6644',
      spriteRef: wr('tSHy6V'), spriteUrl: sa('tSHy6V') }),
    newObject({ emoji: '👾', col: 16, row: ROWS - 6, behavior: 'walker', speed: 1.8, hazard: true, hp: 2, atk: 2,
      bullet: 'spread', fireRate: 110, bulletColor: '#ff9900', bulletSpeed: 3,
      spriteRef: wr('oE4l1x'), spriteUrl: sa('oE4l1x') }),
    // エネルギーカプセル（アイテム）
    newObject({ emoji: '💊', col: 3, row: ROWS - 6, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none',
      itemId: 'energyCapsule', message: '' }),
    newObject({ emoji: '🔋', col: 13, row: ROWS - 6, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none',
      itemId: 'energyTank', message: '' }),
  ],
};

// ── シーン2：道中 2 (VGLC Mega Man 1-1 中盤より) ─────────────────────────────
// Source: TheVGLC/TheVGLC MegaMan/megaman_1_1.txt (CC BY-NC-SA 4.0)
const scene2Map = mmScene2.map(row => [...row]);

const scene2: SceneDef = {
  id: 'shaft', name: '縦シャフト',
  map: scene2Map,
  exits: { down: 'stage2' },
  objects: [
    newObject({ emoji: '🔫', col: 3, row: 7, behavior: 'still', hazard: true, hp: 2, atk: 3,
      bullet: 'aimed', fireRate: 95, bulletSpeed: 2.5, bulletColor: '#ff6644',
      spriteRef: wr('tSHy6V'), spriteUrl: sa('tSHy6V') }),
    // スナイパーアーマー（装甲型スナイパージョー）
    newObject({ emoji: '🤖', col: 4, row: ROWS - 3, behavior: 'walker', speed: 0.8, hazard: true, hp: 6, atk: 5,
      bullet: 'aimed', fireRate: 70, bulletSpeed: 3, bulletColor: '#ffcc00',
      name: 'スナイパーアーマー' }),
    newObject({ emoji: '🕷️', col: 8, row: 9, behavior: 'still', hazard: true, hp: 1, atk: 3,
      bullet: 'aimed', fireRate: 100, bulletSpeed: 2.5, bulletColor: '#ff9900',
      spriteRef: wr('R42ett'), spriteUrl: sa('R42ett') }),
    newObject({ emoji: '🕷️', col: 9, row: 12, behavior: 'still', hazard: true, hp: 1, atk: 3,
      bullet: 'aimed', fireRate: 90, bulletSpeed: 2.5, bulletColor: '#ff9900',
      spriteRef: wr('R42ett'), spriteUrl: sa('R42ett') }),
    // 武器タンク
    newObject({ emoji: '🔵', col: 2, row: 4, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none',
      itemId: 'weaponTank', message: '' }),
  ],
};

// ── シーン3：ボス部屋 ──────────────────────────────────────────────────────────
const scene3Map = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    if (x === COLS - 1) return 4;
    if (x === COLS - 2 && y === ROWS - 3) return 3;
    if (y >= ROWS - 2) return (x >= 7 && x <= 8 || x >= 14 && x <= 15) ? 2 : 1;
    if (y === ROWS - 5 && (x >= 3 && x <= 5 || x >= 10 && x <= 12)) return 1;
    if (y === ROWS - 8 && x >= 15 && x <= 18) return 1;
    // はしご（上段足場へ）
    if (x === 14 && y >= ROWS - 8 && y <= ROWS - 3) return 5;
    // 消えるブロック（ボス戦の足場）
    if (y === ROWS - 10 && x >= 5 && x <= 9) return 7;
    return 0;
  })
);

const scene3: SceneDef = {
  id: 'stage2', name: 'ボス部屋',
  map: scene3Map,
  objects: [
    newObject({ emoji: '🪖', col: 4,  row: ROWS - 3, behavior: 'walker', speed: 1.7, hazard: true, hp: 1, bullet: 'none', atk: 2,
      spriteRef: wr('pyPkIs'), spriteUrl: sa('pyPkIs') }),
    newObject({ emoji: '👾', col: 11, row: ROWS - 3, behavior: 'walker', speed: 1.9, hazard: true, hp: 2, atk: 2,
      bullet: 'spread', fireRate: 100, bulletColor: '#ff9900', bulletSpeed: 3,
      spriteRef: wr('oE4l1x'), spriteUrl: sa('oE4l1x') }),
    newObject({ emoji: '🔫', col: 16, row: ROWS - 9, behavior: 'still', hazard: true, hp: 2, atk: 4,
      bullet: 'aimed', fireRate: 75, bulletSpeed: 3.2, bulletColor: '#ff6644',
      spriteRef: wr('tSHy6V'), spriteUrl: sa('tSHy6V') }),
    // 残機UP（ボス部屋前）
    newObject({ emoji: '💙', col: 1, row: ROWS - 3, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none',
      itemId: 'extraLife', message: '' }),
    // カットマンボス
    newObject({
      emoji: '✂️', col: COLS - 4, row: ROWS - 3,
      behavior: 'walker', speed: 1.5, hazard: true,
      hp: 28, atk: 8, bullet: 'spread', fireRate: 55, bulletSpeed: 3.5, bulletColor: '#ff2222',
      isBoss: true, name: 'カットマン',
      spriteRef: wr('zA2cuG'), spriteUrl: sa('zA2cuG'),
      outroDialogue: [
        { speaker: 'カットマン', emoji: '✂️', text: 'ぐおっ……やられた……！' },
        { speaker: 'ロック',     emoji: '🤖', text: 'ワイリー博士のもとへはいかせない！' },
        { speaker: 'カットマン', emoji: '✂️', text: 'おぼえていろ……エアーシューターを残していく……' },
      ],
    }),
    // ボス撃破後のアイテム（エアーシューター獲得）
    newObject({ emoji: '💨', col: COLS - 4, row: ROWS - 3, objType: 'item', hazard: false, hp: 1, speed: 0, behavior: 'still', bullet: 'none',
      itemId: 'airShooter', message: 'エアーシューターを手に入れた！' }),
  ],
};

export const rockman: PresetData = {
  id: 'rockman', name: 'ロックマン', engine: 'action', gravity: 0.55, friction: 0.78,
  player: {
    emoji: '🤖', color: '#1e90ff', speed: 3.5, jumpPower: -11, w: 22, h: 24,
    start: { x: TILE_SIZE * 1, y: TILE_SIZE * (ROWS - 4) },
    hearts: 28,
    spriteRef: wr('PFBNfk'), spriteUrl: sa('PFBNfk'),
  },
  tiles,
  map: JSON.parse(JSON.stringify(scene1Map)),
  objects: [...scene1.objects],
  scenes: [scene1, scene2, scene3],
  items: [
    { id: 'energyCapsule',  name: 'エネルギーカプセル', emoji: '💊', description: 'HPを少し回復する小さなカプセル' },
    { id: 'energyTank',     name: 'エネルギータンク',   emoji: '🔋', description: 'HPを全回復する大型タンク。持ち歩いていつでも使える' },
    { id: 'smallEnergyTank', name: '小エネルギータンク', emoji: '🩹', description: 'HPを半分回復する中型タンク' },
    { id: 'weaponTank',     name: '武器エネルギータンク', emoji: '🔵', description: '全武器のエネルギーを全回復する' },
    { id: 'smallWeaponTank', name: '小武器エネルギータンク', emoji: '🔹', description: '選択中の武器エネルギーを半分回復する' },
    { id: 'extraLife',      name: '残機UP (1UP)',       emoji: '💙', description: '残機が1増える' },
    { id: 'airShooter',     name: 'エアーシューター',   emoji: '💨', description: 'カットマンの武器。竜巻弾を3方向に撃てる' },
    { id: 'metalBlade',     name: 'メタルブレード',     emoji: '🗡️', description: 'メタルマンの武器。8方向に回転ブレードを投げる' },
    { id: 'crashBomb',      name: 'クラッシュボム',     emoji: '💣', description: 'クラッシュマンの武器。壁に貼りつき時間差爆発する' },
  ],
  switches: [
    { id: 1, name: 'チェックポイント通過' },
    { id: 2, name: 'カットマン撃破' },
  ],
  titleScreen: {
    enabled: true,
    heading: 'ロックマン',
    subtitle: 'Dr.ワイリーの野望を打ち砕け！',
    textColor: '#4488ff',
    menu: [
      { kind: 'newGame',  label: 'はじめから' },
      { kind: 'continue', label: 'つづきから' },
    ],
  },
  ending: {
    enabled: true,
    heading: 'STAGE CLEAR',
    message: 'カットマンを撃破した！\nワイリー博士の野望はまだ続く…',
    textColor: '#4488ff',
  },
  bgm:     { ref: 'https://www.youtube.com/watch?v=wgP_PK_umKM', src: 'https://www.youtube.com/watch?v=wgP_PK_umKM', type: 'youtube' },
  bossBgm: { ref: 'https://www.youtube.com/watch?v=uB1kNcqPe2U', src: 'https://www.youtube.com/watch?v=uB1kNcqPe2U', type: 'youtube' },
  sfx: {
    shot:   { ref: 'shot' },
    jump:   { ref: 'jump' },
    clear:  { ref: 'clear' },
    damage: { ref: 'damage' },
  },
};
