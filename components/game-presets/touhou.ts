import { type PresetData, newObject, COLS, ROWS, PLAY_W, PLAY_H } from './shared';

// ── MiniScript テンプレート ────────────────────────────────────────────────

/** 道中 wave 敵共通：上から降下しながら弾を撃ち、下へ退場する */
const waveMiniScript = (shots: number, fireInterval: number, speed: number, color: number, jitter: number) => `
wait(row * 25)
moveTo(startX, 96, 50)
wait(10)
for t in range(0, ${shots - 1}, 1)
  shotPlayer(${speed}, ${color}, ${jitter})
  wait(${fireInterval})
end for
moveTo(startX, 540, 70)
exit()
`.trim();

/** 道中 wave 敵（spread 弾バージョン） */
const waveSpreadScript = (shots: number, fireInterval: number, ways: number, spread: number, speed: number, color: number) => `
wait(row * 25)
moveTo(startX, 96, 50)
wait(10)
for t in range(0, ${shots - 1}, 1)
  shotN(${ways}, getPlayerAngle(), ${spread}, ${speed}, ${color})
  wait(${fireInterval})
end for
moveTo(startX, 540, 70)
exit()
`.trim();

// 道中BGM（YouTube）
const DOCHU_BGM_URL = 'https://www.youtube.com/watch?v=tTEj519jm9k';
// ボス戦BGM（YouTube）
const BOSS_BGM_URL  = 'https://www.youtube.com/watch?v=Yf6CIacmFJo';

/** YouTube URL → ref 文字列 */
const ytRef = (url: string) => url;

export const touhou: PresetData = {
  id: 'touhou', name: '東方(弾幕)', engine: 'touhou', gravity: 0, friction: 0,
  player: {
    emoji: '🎀', color: '#ff0000', speed: 4.5, jumpPower: 0, w: 24, h: 24,
    start: { x: PLAY_W / 2 - 12, y: PLAY_H - 60 },
  },
  tiles: {
    0: { name: '夜空', color: '#0B0B2A', passable: true },
    1: { name: '壁',  color: '#1a1a3a', passable: false },
  },
  map: Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, (_, x) => (x === 0 || x === COLS - 1 ? 1 : 0))
  ),

  // ── BGM ──────────────────────────────────────────────────────────────────
  bgm:     { ref: ytRef(DOCHU_BGM_URL), src: DOCHU_BGM_URL, type: 'youtube' },
  bossBgm: { ref: ytRef(BOSS_BGM_URL),  src: BOSS_BGM_URL,  type: 'youtube' },

  // ─────────────────────────────────────────────────────────────────────────
  // フェーズ定義
  //   0: 道中前半  (wave)  - 雑魚敵、会話なし、BGM変わらず
  //   1: 道中ボス  (boss)  - 中ボス敵、会話なし、BGM変わらず（noBossBgm: true）
  //   2: 道中後半  (wave)  - 雑魚敵、会話なし、BGM変わらず
  //   3: ボス戦    (boss)  - 会話あり、BGMをボス戦BGMに切り替え、スペルカードあり
  // ─────────────────────────────────────────────────────────────────────────
  phases: [
    {
      id: 'wave1', kind: 'wave', label: '道中前半', scoreBonus: 500,
    },
    {
      id: 'midboss', kind: 'boss', label: '中ボス', scoreBonus: 3000,
      noBossBgm: true,  // 道中BGMのまま
    },
    {
      id: 'wave2', kind: 'wave', label: '道中後半', scoreBonus: 1000,
    },
    {
      id: 'boss', kind: 'boss', label: 'ボス戦', scoreBonus: 10000,
      // ボス戦開始時の会話
      dialogue: [
        { speaker: '霊夢', emoji: '🎀', text: 'いよいよボスか…！気を引き締めなきゃ。',
          imageSrc: 'https://i.imgur.com/4M92pLV.png', imageX: 0, imageY: -50, imageScale: 1 },
        { speaker: 'チルノ', emoji: '🌸', text: '⑨の力、見せてあげるわ！',
          imageSrc: 'https://i.imgur.com/lf3x8xR.png', imageX: 350, imageY: 100, imageScale: 0.5 },
        { speaker: '霊夢', emoji: '🎀', text: '受けて立つわ！',
          imageSrc: 'https://i.imgur.com/4M92pLV.png', imageX: 0, imageY: -50, imageScale: 1 },
      ],
      // ボス撃破後の会話
      outroDialogue: [
        { speaker: 'チルノ', emoji: '🌸', text: 'う…⑨らしくない負け方だったわ…',
          imageSrc: 'https://i.imgur.com/lf3x8xR.png', imageX: 350, imageY: 100, imageScale: 0.5 },
        { speaker: '霊夢', emoji: '🎀', text: '次からは調子に乗らないことね！',
          imageSrc: 'https://i.imgur.com/4M92pLV.png', imageX: 0, imageY: -50, imageScale: 1 },
        { speaker: 'チルノ', emoji: '🌸', text: 'ぜ、絶対リベンジしてやる〜！',
          imageSrc: 'https://i.imgur.com/lf3x8xR.png', imageX: 350, imageY: 100, imageScale: 0.5 },
      ],
    },
  ],

  objects: [
    // ── フェーズ 0：道中前半 ──────────────────────────────────────────────
    newObject({ emoji: '🧚', col: 4,  row: 0, phase: 0, speed: 1.0, hp: 2, bullet: 'none',
      miniScript: waveMiniScript(3, 75, 2.5, 5, 10) }),
    newObject({ emoji: '🧚', col: 15, row: 0, phase: 0, speed: 1.0, hp: 2, bullet: 'none',
      miniScript: waveMiniScript(3, 75, 2.5, 5, 10) }),
    newObject({ emoji: '🧚', col: 7,  row: 1, phase: 0, speed: 0.9, hp: 2, bullet: 'none',
      miniScript: waveSpreadScript(3, 80, 3, 30, 2.0, 8) }),
    newObject({ emoji: '🧚', col: 12, row: 1, phase: 0, speed: 0.9, hp: 2, bullet: 'none',
      miniScript: waveSpreadScript(3, 80, 3, 30, 2.0, 8) }),
    newObject({ emoji: '🧚', col: 10, row: 2, phase: 0, speed: 0.8, hp: 2, bullet: 'none',
      miniScript: waveMiniScript(4, 70, 2.2, 6, 15) }),

    // ── フェーズ 1：道中ボス（ルーミア）────────────────────────────────────
    // isBoss: true でHPバーを表示。スペルカードは定義しない（ジャブ的存在）。
    newObject({
      emoji: '🌙', col: 10, row: 1, phase: 1, hp: 60,
      bullet: 'none', bulletSpeed: 0, bulletColor: '#fff', fireRate: 999,
      isBoss: true, name: 'ルーミア',
      miniScript: `
moveTo(320, 90, 70)
while true
  for i in range(0, 7, 1)
    shot(i * 45, 2.2, 0)
  end for
  wait(8)
  shotPlayer(2.0, 1, 12)
  wait(40)
end while
`.trim(),
    }),

    // ── フェーズ 2：道中後半 ──────────────────────────────────────────────
    newObject({ emoji: '🧚', col: 3,  row: 0, phase: 2, speed: 1.2, hp: 3, bullet: 'none',
      miniScript: waveMiniScript(4, 55, 2.8, 5, 8) }),
    newObject({ emoji: '🧚', col: 16, row: 0, phase: 2, speed: 1.2, hp: 3, bullet: 'none',
      miniScript: waveMiniScript(4, 55, 2.8, 5, 8) }),
    newObject({ emoji: '🧚', col: 9,  row: 1, phase: 2, speed: 1.0, hp: 3, bullet: 'none',
      miniScript: waveSpreadScript(4, 65, 5, 40, 2.2, 8) }),
    newObject({ emoji: '🧝', col: 6,  row: 2, phase: 2, speed: 0.9, hp: 4, bullet: 'none',
      miniScript: `
wait(row * 25)
moveTo(startX, 110, 45)
wait(10)
for t in range(0, 3, 1)
  base = t * 30
  for i in range(0, 5, 1)
    shot(base + i * 60, 2.0, 2)
  end for
  wait(50)
end for
moveTo(startX + rand(-80, 80), 540, 65)
exit()
`.trim() }),
    newObject({ emoji: '🧝', col: 13, row: 2, speed: 0.9, hp: 4, bullet: 'none', phase: 2,
      miniScript: `
wait(row * 25)
moveTo(startX, 110, 45)
wait(10)
for t in range(0, 3, 1)
  base = t * 30
  for i in range(0, 5, 1)
    shot(base + i * 60, 2.0, 3)
  end for
  wait(50)
end for
moveTo(startX + rand(-80, 80), 540, 65)
exit()
`.trim() }),

    // ── フェーズ 3：ボス戦（チルノ）────────────────────────────────────────
    // 通常弾幕 + スペルカード2枚。HPが閾値を下回るとスペルカード発動。
    newObject({
      emoji: '🌸', col: 10, row: 1, phase: 3, hp: 200,
      bullet: 'none', bulletSpeed: 0, bulletColor: '#fff', fireRate: 999,
      isBoss: true, name: 'チルノ',
      miniScript: `
moveTo(320, 80, 90)
while true
  for i in range(0, 5, 1)
    shot(i * 72, 2.4, 4)
  end for
  shotPlayer(2.0, 4, 10)
  wait(8)
end while
`.trim(),
      spellCards: [
        {
          name: '氷符「パーフェクトフリーズ」',
          triggerHp: 130,
          miniScript: `
moveTo(rand(200, 440), 80, 40)
while true
  for i in range(0, 11, 1)
    shot(i * 30, 2.6, 4)
  end for
  shotPlayer(2.1, 3, 8)
  wait(5)
end while
`.trim(),
        },
        {
          name: '氷符「ブルーフロストオーロラ」',
          triggerHp: 60,
          miniScript: `
moveTo(320, 70, 30)
while true
  for i in range(0, 15, 1)
    shot(frame * 10 + i * 24, 2.8, 1)
  end for
  shotPlayer(2.4, 6, 5)
  wait(4)
end while
`.trim(),
        },
      ],
    }),
  ],
  sfx: {
    graze:     { ref: 'direct:https://rpgen.org/dq/sound/res/1848.mp3', src: 'https://rpgen.org/dq/sound/res/1848.mp3', type: 'direct' as const },
    damage:    { ref: 'direct:https://rpgen.org/dq/sound/res/1845.mp3', src: 'https://rpgen.org/dq/sound/res/1845.mp3', type: 'direct' as const },
    spellcard: { ref: 'direct:https://rpgen.org/dq/sound/res/222.mp3',  src: 'https://rpgen.org/dq/sound/res/222.mp3',  type: 'direct' as const },
  },
};
