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
  map: Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => (x === 0 || x === COLS - 1 ? 1 : 0))
  ),

  // ─────────────────────────────────────────────────────────────────────────
  // フェーズ定義：道中 → 中ボス → 後半道中 → ボス戦
  // ─────────────────────────────────────────────────────────────────────────
  phases: [
    { id: 'wave1', kind: 'wave', label: '道中', scoreBonus: 500 },
    {
      id: 'midboss', kind: 'boss', label: '中ボス',
      scoreBonus: 3000,
      dialogue: [
        { speaker: '霊夢', emoji: '🎀', text: 'なんか変な気配がするわ…',
          imageSrc: 'https://i.imgur.com/4M92pLV.png', imageX: -100, imageY: -150, imageScale: 1 },
        { speaker: 'ルーミア', emoji: '🌙', text: 'そーなのかー？（隙あり！）',
          imageSrc: 'https://i.imgur.com/lf3x8xR.png', imageX: 200, imageY: 75, imageScale: 0.5 },
        { speaker: '霊夢', emoji: '🎀', text: '来た！やっつけてやる！',
          imageSrc: 'https://i.imgur.com/4M92pLV.png', imageX: -100, imageY: -150, imageScale: 1 },
      ],
      outroDialogue: [
        { speaker: 'ルーミア', emoji: '🌙', text: 'そーなのかー…（がくっ）',
          imageSrc: 'https://i.imgur.com/lf3x8xR.png', imageX: 200, imageY: 75, imageScale: 0.5 },
        { speaker: '霊夢', emoji: '🎀', text: 'まだ先があるわ、気を引き締めましょ！',
          imageSrc: 'https://i.imgur.com/4M92pLV.png', imageX: -100, imageY: -150, imageScale: 1 },
      ],
    },
    { id: 'wave2', kind: 'wave', label: '後半道中', scoreBonus: 1000 },
    {
      id: 'boss', kind: 'boss', label: 'ボス戦',
      scoreBonus: 10000,
      dialogue: [
        { speaker: '霊夢', emoji: '🎀', text: 'いよいよボスか…！気を引き締めなきゃ。',
          imageSrc: 'https://i.imgur.com/4M92pLV.png', imageX: -100, imageY: -150, imageScale: 1 },
        { speaker: 'チルノ', emoji: '🌸', text: '⑨の力、見せてあげるわ！',
          imageSrc: 'https://i.imgur.com/lf3x8xR.png', imageX: 200, imageY: 75, imageScale: 0.5 },
        { speaker: '霊夢', emoji: '🎀', text: '氷符「ブルーフロストオーロラ」！受けて立つわ！',
          imageSrc: 'https://i.imgur.com/4M92pLV.png', imageX: -100, imageY: -150, imageScale: 1 },
        { speaker: 'チルノ', emoji: '🌸', text: '泣いても知らないんだから！',
          imageSrc: 'https://i.imgur.com/lf3x8xR.png', imageX: 200, imageY: 75, imageScale: 0.5 },
      ],
      outroDialogue: [
        { speaker: 'チルノ', emoji: '🌸', text: 'う…⑨らしくない負け方だったわ…',
          imageSrc: 'https://i.imgur.com/lf3x8xR.png', imageX: 200, imageY: 75, imageScale: 0.5 },
        { speaker: '霊夢', emoji: '🎀', text: '次からは調子に乗らないことね！',
          imageSrc: 'https://i.imgur.com/4M92pLV.png', imageX: -100, imageY: -150, imageScale: 1 },
        { speaker: 'チルノ', emoji: '🌸', text: 'ぜ、絶対リベンジしてやる〜！',
          imageSrc: 'https://i.imgur.com/lf3x8xR.png', imageX: 200, imageY: 75, imageScale: 0.5 },
      ],
    },
  ],

  objects: [
    // ── フェーズ 0：道中 ─────────────────────────────────────────────────
    // col=X位置(0-19)、row=出現タイミング(0=先頭、1=少し遅れ、2=さらに遅れ)
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

    // ── フェーズ 1：中ボス（ルーミア） ───────────────────────────────────
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

    // ── フェーズ 2：後半道中 ──────────────────────────────────────────────
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
    newObject({ emoji: '🧝', col: 13, row: 2, phase: 2, speed: 0.9, hp: 4, bullet: 'none',
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

    // ── フェーズ 3：ボス（チルノ） ─────────────────────────────────────────
    newObject({
      emoji: '🌸', col: 10, row: 1, phase: 3, hp: 200,
      bullet: 'none', bulletSpeed: 0, bulletColor: '#fff', fireRate: 999,
      isBoss: true, name: '氷符「ブルーフロストオーロラ」',
      miniScript: `
moveTo(320, 80, 90)
// スペルカード1：12way渦巻き＋狙い弾
for t in range(0, 599, 5)
  base = t * 5
  for i in range(0, 11, 1)
    shot(base + i * 30, 2.6, 4)
  end for
  shotPlayer(2.1, 3, 8)
  wait(5)
end for
// スペルカード2：16way全方位＋高速狙い
moveTo(320, 70, 40)
for t in range(0, 319, 4)
  for i in range(0, 15, 1)
    shot(t * 10 + i * 24, 2.8, 1)
  end for
  shotPlayer(2.4, 6, 5)
  wait(4)
end for
// スペルカード3：超高速
moveTo(rand(100, 540), 60, 30)
for t in range(0, 399, 3)
  for i in range(0, 5, 1)
    shot(t * 8 + i * 60, 3.2, 2)
  end for
  shotPlayer(3.0, 8, 3)
  wait(3)
end for
`.trim(),
    }),
  ],
  sfx: {},
};
