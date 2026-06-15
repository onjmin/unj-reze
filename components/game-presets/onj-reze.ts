import { type PresetData, newObject, TILE_SIZE } from './shared';

// 『おんｊレゼ』(jintori.open2ch.net/rpg-reze) のシングルプレイ再現プリセット。
// ──────────────────────────────────────────────────────────────────────
// 原作はサーバー権威のリアルタイム多人数対戦「陣取り(.io)RPG」。
//   ・チーム戦／個人戦でマップを塗り合い、占領率を競う（paper.io 風トレイル）。
//   ・主人公は爆弾使いの少女「束音レゼ」([ONJ] ギルド)。
//   ・⚔近接攻撃／💣ボム／🎯投げボム／💀首爆弾 でモンスター(スライム・ゴースト等)を爆破して EXP を稼ぐ。
//   ・BGM は米津玄師「IRIS OUT」(YouTube: LmZD-TU96q4)。
// 多人数・サーバー同期・塗り合いはこのシングルプレイ・エンジンでは再現できないため、
// トップビュー・アクション(onjReze エンジン)で「束音レゼが ONJ 陣地を制圧する」体験として再構成する。
// ボムの挙動・グラフィック（導火線の火花／揺れ／放物線投擲／爆風）は原作 onj-reze.html から移植：
//   ・束音レゼ＝プレイヤー。操作は原作のボタン群を踏襲：
//       ⚔️ 近接攻撃 (Z / Space)  ／  💣 足元に設置ボム (C)
//       🎯 向きへ投げボム (X)     ／  💀 首爆弾＝強力な投げボム (V)
//   ・ボムは導火線が尽きると爆発し、爆風範囲内の敵をまとめて爆破する（原作の💣→💥）。
//   ・敵：スライム(EXP+5)／ゴースト(EXP+10)／💀首爆弾(接触30ダメージ相当・爆弾を撃つ)。
//   ・💀首爆弾の罠タイルに乗ると即ミス（自爆）。
//   ・最奥の敵ギルド大将「爆魔王」を倒すと ONJ 陣地の占領完了＝クリア。
// マップは原作の広大なフィールド（結果画面 1730マス/86.5% ≒ 総数2000マス）に合わせ、
// 画面(20×15)を大きく超える 48×42(≒2016マス) のスクロール・フィールドにしている。
const W = 48, H = 42;
const GROUND = 0, WALL = 1, BARRICADE = 2, TRAP = 3, PATH = 4;

/** 広いフィールドを手続き的に組む（決定論的・モジュール読込時に一度だけ評価）。 */
function buildMap(): number[][] {
  const m: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => GROUND));
  // 外周は壁
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x === 0 || x === W - 1 || y === 0 || y === H - 1) m[y][x] = WALL;
  }
  // 北端＝敵ギルド大将の部屋。y=6 を仕切り壁にして中央(x=22..25)だけゲートで開ける。
  for (let x = 1; x < W - 1; x++) if (!(x >= 22 && x <= 25)) m[6][x] = WALL;
  for (let x = 22; x <= 25; x++) m[6][x] = PATH;
  // バリケード（2×2）を点在させて見通しのよい障害物にする。中央の進路(x=22..25)は避ける。
  const barricades: [number, number][] = [
    [6, 12], [14, 10], [30, 9], [40, 14], [10, 22], [19, 20], [36, 24],
    [8, 32], [18, 34], [30, 34], [42, 30], [14, 26], [34, 28],
  ];
  for (const [bx, by] of barricades) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const x = bx + dx, y = by + dy;
    if (x > 0 && x < W - 1 && y > 6 && y < H - 1) m[y][x] = BARRICADE;
  }
  // 💀首爆弾の罠パッチ（3×2）。踏むと即ミス。中央の進路は避ける。
  const traps: [number, number][] = [
    [10, 16], [34, 18], [16, 30], [40, 36], [6, 26], [30, 12],
  ];
  for (const [tx, ty] of traps) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) {
    const x = tx + dx, y = ty + dy;
    if (x > 0 && x < W - 1 && y > 6 && y < H - 1) m[y][x] = TRAP;
  }
  // ONJ占領地の道しるべ（中央縦ライン）。スポーン→大将ゲートの目印。
  for (let y = 8; y < H - 1; y++) if (y % 3 === 0) for (let x = 23; x <= 24; x++) if (m[y][x] === GROUND) m[y][x] = PATH;
  return m;
}

export const onjReze: PresetData = {
  id: 'onjReze', name: 'おんｊレゼ', engine: 'onjReze', gravity: 0, friction: 0,
  scroll: { worldCols: W, worldRows: H },
  // 陣取り(paper.io 型)とスプラ(塗り)を両方 ON。ゲーム内設定でそれぞれ自由に ON/OFF できる。
  onjReze: { territory: true, paint: true },
  player: {
    emoji: '🧨', color: '#ff5c7a', speed: 3, jumpPower: 0, w: 24, h: 24,
    hearts: 5, // 初期ハート数（HP = hearts * 2）。原作の HP100 を反映してやや多め。
    start: { x: TILE_SIZE * 24, y: TILE_SIZE * 39 }, // 南端中央からスタート → 北の大将部屋を目指す
  },
  tiles: {
    [GROUND]: { name: '陣地', color: '#1f3a26', passable: true },          // 草原（自陣の地面）
    [WALL]: { name: '壁', color: '#5a6b8a', passable: false },
    [BARRICADE]: { name: 'バリケード', color: '#46465e', passable: false },
    [TRAP]: { name: '首爆弾の罠', color: '#b5391a', passable: true, special: 'trap' }, // 乗ると自爆=即ミス
    [PATH]: { name: 'ONJ占領地', color: '#2f5a3a', passable: true },        // 塗り済みの陣地（道しるべ）
  },
  map: buildMap(),
  objects: [
    // ── 南の自陣エリア（y28〜40：雑魚で EXP 稼ぎ）──
    newObject({ emoji: '🟢', name: 'スライム', col: 5, row: 38, behavior: 'patrolH', speed: 1, hp: 1, atk: 8, hazard: true, bullet: 'none' }),
    newObject({ emoji: '🟢', name: 'スライム', col: 44, row: 37, behavior: 'random', speed: 1.1, hp: 1, atk: 8, hazard: true, bullet: 'none' }),
    newObject({ emoji: '👻', name: 'ゴースト', col: 12, row: 36, behavior: 'chase', speed: 1.4, hp: 2, atk: 8, hazard: true, bullet: 'none' }),
    newObject({ emoji: '👻', name: 'ゴースト', col: 38, row: 33, behavior: 'chase', speed: 1.3, hp: 2, atk: 8, hazard: true, bullet: 'none' }),
    newObject({ emoji: '💀', name: '首爆弾', col: 26, row: 32, behavior: 'still', speed: 0, hp: 1, atk: 24, hazard: true, bullet: 'aimed', fireRate: 130, bulletSpeed: 2.4, bulletColor: '#ff7a2a' }),

    // ── 中央の係争エリア（y14〜26）──
    newObject({ emoji: '🟢', name: 'スライム', col: 20, row: 24, behavior: 'patrolH', speed: 1.1, hp: 1, atk: 8, hazard: true, bullet: 'none' }),
    newObject({ emoji: '👻', name: 'ゴースト', col: 40, row: 22, behavior: 'chase', speed: 1.4, hp: 2, atk: 8, hazard: true, bullet: 'none' }),
    newObject({ emoji: '💣', name: '爆弾魔', col: 8, row: 18, behavior: 'still', speed: 0, hp: 2, atk: 8, hazard: true, bullet: 'aimed', fireRate: 120, bulletSpeed: 2.6, bulletColor: '#ffd84d' }),
    newObject({ emoji: '💀', name: '首爆弾', col: 44, row: 16, behavior: 'still', speed: 0, hp: 1, atk: 24, hazard: true, bullet: 'aimed', fireRate: 135, bulletSpeed: 2.4, bulletColor: '#ff7a2a' }),
    newObject({ emoji: '👻', name: 'ゴースト', col: 24, row: 18, behavior: 'random', speed: 1.2, hp: 2, atk: 8, hazard: true, bullet: 'none' }),

    // ── 北の敵陣エリア（y8〜12：大将部屋の手前）──
    newObject({ emoji: '👻', name: 'ゴースト', col: 16, row: 12, behavior: 'patrolH', speed: 1.3, hp: 2, atk: 8, hazard: true, bullet: 'none' }),
    newObject({ emoji: '🟢', name: 'スライム', col: 33, row: 10, behavior: 'random', speed: 1.1, hp: 1, atk: 8, hazard: true, bullet: 'none' }),
    newObject({ emoji: '💣', name: '爆弾魔', col: 6, row: 9, behavior: 'still', speed: 0, hp: 2, atk: 8, hazard: true, bullet: 'aimed', fireRate: 115, bulletSpeed: 2.7, bulletColor: '#ffd84d' }),
    newObject({ emoji: '💀', name: '首爆弾', col: 41, row: 9, behavior: 'still', speed: 0, hp: 1, atk: 24, hazard: true, bullet: 'aimed', fireRate: 125, bulletSpeed: 2.5, bulletColor: '#ff7a2a' }),

    // ── 大将部屋（y1〜5）──
    newObject({ emoji: '💀', name: '首爆弾', col: 19, row: 3, behavior: 'still', speed: 0, hp: 1, atk: 24, hazard: true, bullet: 'aimed', fireRate: 110, bulletSpeed: 2.6, bulletColor: '#ff7a2a' }),
    newObject({ emoji: '💀', name: '首爆弾', col: 29, row: 3, behavior: 'still', speed: 0, hp: 1, atk: 24, hazard: true, bullet: 'aimed', fireRate: 110, bulletSpeed: 2.6, bulletColor: '#ff7a2a' }),
    newObject({
      emoji: '☠️', name: '爆魔王', col: 24, row: 3,
      behavior: 'patrolH', speed: 1.2, hp: 8, atk: 24, hazard: true,
      bullet: 'spread', fireRate: 90, bulletSpeed: 2.6, bulletColor: '#ff5030',
      isBoss: true,
      outroDialogue: [
        { speaker: '爆魔王', emoji: '☠️', text: 'ぐおおっ……ONJ ごときに……占領されるとは……！' },
        { speaker: '束音レゼ', emoji: '🧨', text: 'この陣地はぜんぶ ONJ のもの。占領率100%、いただきっ♪' },
      ],
    }),
  ],
  bgm: { ref: 'bgm', src: 'https://www.youtube.com/watch?v=0_jEpB40aYw', type: 'youtube' },
  sfx: {
    shot: { ref: 'shot' },     // ボムを投げる／振る音
    clear: { ref: 'clear' },
    damage: { ref: 'damage' },
  },
};
