// ゲームエディタの「エフェクト → プリセットから追加」で使う内蔵エフェクトのスプライトシートを生成する。
// 既製ゲームの絵を借りない（第三者IPを持ち込まない）ため、全コマを手続き的に描き起こす。
//
//   node scripts/make-effect-sheets.mjs                 … public/assets/game-effects/*.png を書き出す
//   node scripts/make-effect-sheets.mjs --preview=DIR   … 確認用の拡大シート（背景3色×全コマ）も DIR へ書く
//                                       [--scale=N]     … 確認用シートの拡大率（既定4。2=フィールド、3=戦闘の見え方）
//
// 形式は EffectPreset（components/game/presets/shared.ts）どおり「横一列の等幅コマ」。
// 1コマは 24x24px。フィールドでは TILE_SIZE*1.5=48px（2倍）、戦闘では 72px（3倍）で描かれるので、
// どちらでも整数倍になり、16px マップチップを2倍で並べた画面とドットの粒が揃う。
// 最終コマは「消えかけ」にしておく（戦闘の EffectSpriteAnim は最終コマのまま onDone を待つため）。
//
// 依存ライブラリなし（zlib のみ）。乱数は固定シードなので、何度叩いても同じ PNG になる。

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public/assets/game-effects');
const F = 24; // 1コマの一辺（px）

// ───────────────── PNG エンコーダ（RGBA 8bit） ─────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h); // 各行の先頭に filter バイト(0)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    for (let i = 0; i < stride; i++) raw[y * (stride + 1) + 1 + i] = rgba[y * stride + i];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ───────────────── 数学・乱数・ノイズ ─────────────────

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 2;

/** 固定シードの一様乱数（mulberry32） */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 2D バリューノイズ（0..1、格子1マス＝入力1.0） */
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ───────────────── 1コマ分の描画面 ─────────────────

function hex(h, a = 255) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

class Frame {
  constructor(w = F, h = F) {
    this.w = w;
    this.h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  alpha(x, y) {
    return this.inside(x, y) ? this.px[(y * this.w + x) * 4 + 3] : 0;
  }
  /** 上書きで1ドット置く（座標は四捨五入） */
  put(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = c[3];
  }
  /** 半透明で重ねる（source-over） */
  over(x, y, c, alpha = c[3] / 255) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y) || alpha <= 0) return;
    const i = (y * this.w + x) * 4;
    const da = this.px[i + 3] / 255;
    const oa = alpha + da * (1 - alpha);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) {
      this.px[i + k] = (c[k] * alpha + this.px[i + k] * da * (1 - alpha)) / oa;
    }
    this.px[i + 3] = oa * 255;
  }
}

/**
 * 熱量のような 0..1 のスカラー場を、しきい値つきの色段（暗→明）で塗る。
 * ramp: [[しきい値, 色], ...]（しきい値の昇順）。最初のしきい値未満は描かない。
 */
function fillField(fr, fn, ramp) {
  for (let y = 0; y < fr.h; y++) {
    for (let x = 0; x < fr.w; x++) {
      const v = fn(x + 0.5, y + 0.5);
      if (!(v >= ramp[0][0])) continue;
      let c = ramp[0][1];
      for (const [t, col] of ramp) if (v >= t) c = col;
      fr.put(x, y, c);
    }
  }
}

/** 不透明ドットの外周（上下左右）に縁取りを付ける。半透明の煙・もやには付けない。 */
function outline(fr, c) {
  const src = new Uint8ClampedArray(fr.px);
  const opaque = (x, y) => x >= 0 && y >= 0 && x < fr.w && y < fr.h && src[(y * fr.w + x) * 4 + 3] === 255;
  for (let y = 0; y < fr.h; y++) {
    for (let x = 0; x < fr.w; x++) {
      if (src[(y * fr.w + x) * 4 + 3] !== 0) continue;
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) fr.put(x, y, c);
    }
  }
}

/** layer（不透明で描いた下書き）を alpha で fr に重ねる。重なった部分が濃くならないよう、煙はいったん別面に描く。 */
function composite(fr, layer, alpha) {
  for (let y = 0; y < fr.h; y++) {
    for (let x = 0; x < fr.w; x++) {
      const i = (y * fr.w + x) * 4;
      if (layer.px[i + 3] === 0) continue;
      fr.over(x, y, [layer.px[i], layer.px[i + 1], layer.px[i + 2], 255], alpha * (layer.px[i + 3] / 255));
    }
  }
}

/** 煙のかたまりを layer へ不透明で描く（左上から光が当たる3段の陰影）。 */
function smokePuff(layer, cx, cy, r) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const lx = (x + 0.5 - cx) / r, ly = (y + 0.5 - cy) / r;
      if (lx * lx + ly * ly > 1) continue;
      const lit = -(lx * 0.6 + ly * 0.8);
      layer.put(x, y, lit > 0.3 ? SMOKE_HI : lit > -0.35 ? SMOKE_MID : SMOKE_LO);
    }
  }
}

/** 4方向に光る星（キラッ）。size は 1/3/5/7。 */
function sparkle(fr, cx, cy, size, core, mid, tip) {
  const arm = (size - 1) / 2;
  fr.put(cx, cy, core);
  for (let k = 1; k <= arm; k++) {
    const c = k === arm && arm >= 2 ? tip : k === 1 && arm >= 2 ? core : mid;
    fr.put(cx + k, cy, c); fr.put(cx - k, cy, c);
    fr.put(cx, cy + k, c); fr.put(cx, cy - k, c);
  }
  if (arm >= 3) {
    fr.put(cx + 1, cy + 1, mid); fr.put(cx - 1, cy - 1, mid);
    fr.put(cx + 1, cy - 1, mid); fr.put(cx - 1, cy + 1, mid);
  }
}

// ───────────────── 配色（どれもこのシート用に決めた独自の色段） ─────────────────

const WHITE = hex('#ffffff');
const FIRE_OUT = hex('#4a0c08');
const FIRE = [
  [0.0, hex('#a3170f')],
  [0.28, hex('#e2461c')],
  [0.52, hex('#f98e22')],
  [0.74, hex('#ffd042')],
  [0.92, hex('#fff6cf')],
];
const SMOKE_LO = hex('#4a4450');
const SMOKE_MID = hex('#7a7380');
const SMOKE_HI = hex('#aca5ae');

const ICE_OUT = hex('#132657');
const ICE_DARK = hex('#2d5fb8');
const ICE_MID = hex('#4fa6ec');
const ICE_LIGHT = hex('#aee6ff');
const ICE_MIST = hex('#dff6ff');

const WIND_OUT = hex('#0f4a42');
const WIND_DARK = hex('#2c8c78');
const WIND_MID = hex('#6fd3ad');
const WIND_LIGHT = hex('#d4fff0');
const LEAF = hex('#72c94a');
const LEAF_DARK = hex('#2f6e24');

const HEAL_OUT = hex('#17602e');
const HEAL_DARK = hex('#34a852');
const HEAL_MID = hex('#8fe86f');
const HEAL_LIGHT = hex('#e4ffc6');
const HEAL_GOLD = hex('#ffe477');

// ───────────────── 共通部品：炎のかたまり ─────────────────

/**
 * 中心 (cx,cy)・半径 r の炎の塊の熱量。上側へ伸び（炎は昇る）、縁は角度ノイズで舌状に割れる。
 * heat は中心の熱さ（1.3 で白熱、0.6 で赤）。
 */
function blobHeat(x, y, cx, cy, r, heat, seed, t, rise = 1.3) {
  const dx = x - cx, dy = y - cy;
  const up = dy < 0 ? rise : 0.85; // 上は長く、下は短く
  const ang = Math.atan2(dy, dx);
  const edge = r * (0.72 + 0.5 * vnoise(ang * 1.6 + 10, t * 0.9, seed));
  const d = Math.hypot(dx, dy * (1 / up));
  const body = 1 - d / edge;
  const grain = (vnoise(x * 0.7, y * 0.7 + t * 1.8, seed + 1) - 0.5) * 0.35;
  return body * heat + grain * (body > -0.1 ? 1 : 0);
}

// ───────────────── 1. 火の玉 ─────────────────
// 左上から火の玉が飛んできて中心で弾け、火の粉と煙を残して消える。

function makeFireball() {
  const N = 10;
  const R = rng(101);
  const embers = Array.from({ length: 8 }, (_, i) => {
    const ang = (i / 8) * Math.PI * 2 + R() * 0.5;
    return { vx: Math.cos(ang) * (1.7 + R()), vy: Math.sin(ang) * (1.5 + R()) - 1.2 };
  });
  const frames = [];
  for (let f = 0; f < N; f++) {
    const fr = new Frame();
    if (f < 4) {
      // 飛来：進行方向は右下、尾は左上へ
      const t = (f + 1) / 4;
      const cx = lerp(4, 12, t), cy = lerp(4, 12, t);
      const r = lerp(2.4, 4.2, t);
      const tailLen = 5 + 5 * t;
      const ux = Math.SQRT1_2, uy = Math.SQRT1_2;
      fillField(fr, (x, y) => {
        const px = x - cx, py = y - cy;
        const ball = (1 - Math.hypot(px, py) / r) * 1.5;
        const back = -(px * ux + py * uy);
        const side = Math.abs(px * uy - py * ux);
        let tail = -1;
        if (back > 0 && back < tailLen) {
          const k = back / tailLen;
          const w = r * (1 - k) * 0.95 + 0.3;
          tail = (1 - side / w) * (1 - k) * 1.1 + (vnoise(x * 0.8 + f * 2.3, y * 0.8, 7) - 0.5) * 0.3 * (1 - k);
        }
        return Math.max(ball + (vnoise(x, y + f * 2, 3) - 0.5) * 0.3, tail);
      }, FIRE);
      outline(fr, FIRE_OUT);
    } else {
      // 着弾：閃光 → 炎が広がる → 煙と火の粉
      const k = f - 4; // 0..5
      const radius = [4.5, 6.5, 7, 6, 4, 0][k];
      const heat = [2.2, 1.45, 1.05, 0.72, 0.5, 0][k];
      const cy = 13 - k * 0.5;
      if (k >= 2) {
        // 煙は炎の後ろ。別面に描いてから半透明で重ねる
        const smoke = new Frame();
        const rise = (k - 2) * 1.7;
        const grow = (k - 2) * 0.55;
        smokePuff(smoke, 8, 11 - rise, 2.6 + grow);
        smokePuff(smoke, 15.5, 10 - rise, 2.9 + grow);
        smokePuff(smoke, 12, 7 - rise, 2.4 + grow);
        composite(fr, smoke, [0.8, 0.75, 0.55, 0.32][k - 2]);
      }
      if (heat > 0) fillField(fr, (x, y) => blobHeat(x, y, 12, cy, radius, heat, 17, f, 1.25), FIRE);
      if (k === 0) {
        // 閃光の十字（光の筋は縁取りしない）
        outline(fr, FIRE_OUT);
        for (let d = 5; d <= 10; d++) {
          const c = d < 8 ? FIRE[4][1] : FIRE[3][1];
          fr.put(12 + d, 13, c); fr.put(12 - d, 13, c);
          fr.put(12, 13 + d, c); fr.put(12, 13 - d, c);
        }
      } else {
        outline(fr, FIRE_OUT);
      }
      // 火の粉（縁取りなしの1ドット）
      if (k >= 1) {
        for (const e of embers) {
          const x = 12 + e.vx * k * 1.5;
          const y = 13 + e.vy * k * 1.5 + 0.4 * k * k;
          if (k >= 4 && hash2(Math.round(x), Math.round(y), 5) < 0.5) continue;
          fr.put(x, y, k <= 2 ? FIRE[3][1] : FIRE[2][1]);
        }
      }
    }
    frames.push(fr);
  }
  return frames;
}

// ───────────────── 2. 炎（火柱） ─────────────────
// 足元から3本の炎の舌が立ち上がって揺らめき、燃え尽きて火の粉が残る。

function makeFlame() {
  const N = 12;
  const env = [0.3, 0.55, 0.8, 1, 1, 1, 1, 1, 0.9, 0.7, 0.45, 0.22];
  const tongues = [
    { x: 7, h: 13, w: 3.4, p: 0.0 },
    { x: 17, h: 14, w: 3.4, p: 2.1 },
    { x: 12, h: 20, w: 4.8, p: 4.2 },
  ];
  const baseY = 22.5;
  const frames = [];
  for (let f = 0; f < N; f++) {
    const fr = new Frame();
    const e = env[f];
    fillField(fr, (x, y) => {
      const b = baseY - y; // 足元からの高さ
      if (b < 0) return -1;
      let best = -1;
      for (const tg of tongues) {
        const H = tg.h * e * (0.92 + 0.08 * Math.sin(f * 1.9 + tg.p));
        const hr = b / H;
        if (hr > 1.2) continue;
        const sway = Math.sin(b * 0.42 - f * 1.4 + tg.p) * 1.4 * hr;
        const w = tg.w * Math.max(0, 1 - hr) ** 0.65 + 0.4;
        const across = Math.abs(x - tg.x - sway);
        let v = (1 - across / w) * (1.15 - hr * 0.55) * (0.55 + 0.45 * e);
        v += (vnoise(x * 0.55, y * 0.45 + f * 1.3, 29 + tg.p) - 0.5) * 0.7 * hr;
        best = Math.max(best, v);
      }
      // 足元の火床
      if (b < 2.5 && x > 3 && x < 21) {
        const bed = (1 - b / 2.5) * 0.7 * e + (vnoise(x * 0.9, f * 0.7, 41) - 0.5) * 0.3;
        best = Math.max(best, bed);
      }
      return best;
    }, FIRE);
    outline(fr, FIRE_OUT);
    // 舞い上がる火の粉（縁取りなしの1ドット）
    for (let i = 0; i < 6; i++) {
      const born = (i * 5) % 7;
      const age = f - born;
      if (age < 1 || f < 3) continue;
      const x = 5 + ((i * 7) % 15) + Math.sin(age * 0.9 + i) * 1.2;
      const y = 14 - age * 1.8 + (i % 3) * 2;
      if (y < 0) continue;
      fr.put(x, y, age < 4 ? FIRE[3][1] : FIRE[2][1]);
    }
    frames.push(fr);
  }
  return frames;
}

// ───────────────── 3. 爆発 ─────────────────
// 白い閃光 → 火球が膨らむ → 衝撃の輪と破片 → 黒煙がほどけて消える。

function makeExplosion() {
  const N = 10;
  const R = rng(303);
  const debris = Array.from({ length: 10 }, (_, i) => {
    const ang = (i / 10) * Math.PI * 2 + (R() - 0.5) * 0.4;
    return { vx: Math.cos(ang), vy: Math.sin(ang), sp: 2.4 + R() * 1.3 };
  });
  // 煙のかたまり（中心からの向き・距離・半径）。炎が縮むにつれ外へ押し出されて昇る
  const puffs = Array.from({ length: 6 }, (_, i) => {
    const ang = (i / 6) * Math.PI * 2 + (R() - 0.5) * 0.6 - Math.PI / 2;
    return { dx: Math.cos(ang), dy: Math.sin(ang) * 0.8, d: 4 + R() * 1.5, r: 3 + R() * 0.9 };
  });
  const CY = 12.5;
  const frames = [];
  for (let f = 0; f < N; f++) {
    const fr = new Frame();
    const radius = [3, 6, 7.8, 8.6, 8.6, 7.6, 6, 4, 0, 0][f];
    const heat = [2.6, 2.0, 1.55, 1.2, 0.92, 0.72, 0.55, 0.42, 0, 0][f];
    // 黒煙（炎の後ろ）。別面に描いてから半透明で重ねる
    if (f >= 3) {
      const k = f - 3; // 0..6
      const smoke = new Frame();
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        if (k >= 5 && i % 2 === 1) continue; // 終わり際は半分ほどける
        const d = p.d + k * 0.5;
        const rr = Math.min(4.6, p.r * (0.75 + k * 0.12));
        // 昇るが、コマの上端で切れないように止める
        const y = Math.max(rr - 0.5, CY + p.dy * d - k * 0.7);
        smokePuff(smoke, 12 + p.dx * d, y, rr);
      }
      composite(fr, smoke, [0.55, 0.75, 0.85, 0.85, 0.7, 0.5, 0.3][k]);
    }
    if (heat > 0) {
      fillField(fr, (x, y) => blobHeat(x, y, 12, CY - f * 0.25, radius, heat, 53, f, 1.1), FIRE);
    }
    outline(fr, FIRE_OUT);
    // 起爆の瞬間の光の筋
    if (f === 0) {
      for (let d = 3; d <= 7; d++) {
        const c = d <= 4 ? FIRE[4][1] : FIRE[3][1];
        fr.put(12 + d, CY, c); fr.put(12 - d, CY, c);
        fr.put(12, CY + d, c); fr.put(12, CY - d, c);
      }
    }
    // 衝撃の輪（縁取りしない細い輪）
    if (f === 1 || f === 2) {
      const rr = f === 1 ? 8.5 : 10.5;
      for (let i = 0; i < 80; i++) {
        const th = (i / 80) * Math.PI * 2;
        if (f === 2 && i % 4 === 3) continue;
        const x = 12 + Math.cos(th) * rr, y = CY + Math.sin(th) * rr * 0.9;
        if (fr.alpha(Math.round(x), Math.round(y)) === 0) fr.put(x, y, f === 1 ? FIRE[4][1] : FIRE[3][1]);
      }
    }
    // 破片（縁取りなし、尾つき）
    if (f >= 2 && f <= 7) {
      const t = f - 1;
      for (const d of debris) {
        const x = 12 + d.vx * d.sp * t * 1.15;
        const y = CY + d.vy * d.sp * t * 1.05 + 0.3 * t * t;
        if (x < 0 || y < 0 || x > F - 1 || y > F - 1) continue;
        fr.put(x - d.vx, y - d.vy, FIRE[1][1]);
        fr.put(x, y, t <= 3 ? FIRE[3][1] : FIRE[2][1]);
      }
    }
    frames.push(fr);
  }
  return frames;
}

// ───────────────── 4. 風（つむじ風） ─────────────────
// 足元から渦が立ち上がり、回りながら木の葉を巻き上げ、上へ抜けて消える。

function makeWind() {
  const N = 16;
  const BANDS = 5;
  const baseY = 21;
  const topY = 5;
  const frames = [];
  for (let f = 0; f < N; f++) {
    const fr = new Frame();
    const grow = clamp01((f + 1) / 5); // 下から伸びる
    const fade = clamp01((N - f) / 5); // 最後は弧が短くなって消える
    const strokes = [];
    for (let k = 0; k < BANDS; k++) {
      const yb = baseY - (k * (baseY - topY)) / (BANDS - 1);
      const b = (baseY - yb) / (baseY - topY);
      if (b > grow + 0.01) continue;
      if (fade < 1 && b < 1 - fade * 1.2) continue; // 消えるときは下から抜ける
      const rx = 2.2 + b * 7.6;
      const ry = Math.max(1.1, rx * 0.3);
      const ax = 12 + Math.sin(b * 2.8 + f * 0.55) * 1.3;
      const phase = f * 1.05 + k * 1.7;
      const arc = Math.PI * (1.15 + 0.2 * Math.sin(k + f * 0.3));
      strokes.push({ yb, rx, ry, ax, phase, arc });
    }
    // 奥側（上半分の弧）→ 手前側の順に描く
    for (const pass of [0, 1]) {
      for (const s of strokes) {
        const steps = Math.ceil(s.rx * 6);
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const th = s.phase + u * s.arc;
          const front = Math.sin(th) > 0;
          if ((pass === 1) !== front) continue;
          const x = s.ax + Math.cos(th) * s.rx;
          const y = s.yb + Math.sin(th) * s.ry;
          let c;
          if (!front) c = WIND_DARK;
          else c = u > 0.72 ? WIND_LIGHT : u > 0.3 ? WIND_MID : WIND_DARK;
          fr.put(x, y, c);
          // 手前の弧の先端は太く
          if (front && u > 0.55) fr.put(x, y + 1, u > 0.8 ? WIND_LIGHT : WIND_MID);
        }
      }
    }
    outline(fr, WIND_OUT);
    // 巻き上げられる木の葉（縁取りなし、濃い緑の1ドットで形を出す）
    for (let i = 0; i < 3; i++) {
      const lf = f - i * 2;
      if (lf < 1) continue;
      const h = clamp01(0.1 + lf * 0.075 + i * 0.12);
      const y = baseY - h * (baseY - topY) - (f > 12 ? (f - 12) * 2 : 0);
      const rx = 2.2 + h * 7.6 + 1;
      const th = lf * 1.1 + i * 2.1;
      const x = 12 + Math.cos(th) * rx;
      const yy = y + Math.sin(th) * rx * 0.3;
      fr.put(x, yy, LEAF);
      fr.put(x + 1, yy, LEAF);
      fr.put(x + (Math.cos(th) > 0 ? 1 : 0), yy - 1, LEAF_DARK);
    }
    frames.push(fr);
  }
  return frames;
}

// ───────────────── 5. 氷 ─────────────────
// 地面から氷の結晶が突き出し、きらめいた後に砕け散る。

const SHARDS = [
  { bx: 5.5, a: -0.95, L: 9, W: 2.0 },
  { bx: 18.5, a: 0.85, L: 10, W: 2.0 },
  { bx: 8.5, a: -0.42, L: 14, W: 2.6 },
  { bx: 15.5, a: 0.38, L: 15, W: 2.6 },
  { bx: 12, a: 0.04, L: 19, W: 3.2 },
];
const ICE_BASE_Y = 21.5;

function shardAt(s, L, x, y) {
  // 結晶のローカル座標：u=軸方向（上向き）、v=幅方向（右が正）
  const ux = Math.sin(s.a), uy = -Math.cos(s.a);
  const px = x - s.bx, py = y - ICE_BASE_Y;
  const u = px * ux + py * uy;
  const v = px * -uy + py * ux;
  if (u < -0.5 || u > L) return null;
  const k = u / L;
  const w = s.W * (k < 0.15 ? 0.7 + k * 2 : k < 0.62 ? 1 : (1 - k) / 0.38);
  if (Math.abs(v) > w) return null;
  return v / Math.max(0.01, w);
}

function makeIce() {
  const N = 14;
  const R = rng(505);
  const frags = [];
  for (const s of SHARDS) {
    const n = s.L > 12 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const u = s.L * (0.3 + (i / n) * 0.6);
      const x = s.bx + Math.sin(s.a) * u, y = ICE_BASE_Y - Math.cos(s.a) * u;
      const dx = x - 12, dy = y - 16;
      const d = Math.hypot(dx, dy) || 1;
      frags.push({ x, y, vx: (dx / d) * (1.2 + R()), vy: (dy / d) * 1.0 - 1.4 - R(), big: R() < 0.5 });
    }
  }
  const frames = [];
  for (let f = 0; f < N; f++) {
    const fr = new Frame();
    // 足元の冷気（半透明）
    if (f <= 11) {
      const a = f < 8 ? 0.35 + f * 0.04 : 0.6 - (f - 8) * 0.14;
      const rx = Math.min(10, 4 + f * 1.2);
      for (let x = Math.floor(12 - rx); x <= Math.ceil(12 + rx); x++) {
        for (let y = 19; y <= 23; y++) {
          const d = Math.hypot((x + 0.5 - 12) / rx, (y + 0.5 - 21.5) / 2.2);
          if (d <= 1) fr.over(x, y, ICE_MIST, a * (d < 0.6 ? 1 : 0.6));
        }
      }
    }
    if (f <= 8) {
      // 伸びる → 静止 → 砕ける直前に白く光る
      const grow = f <= 4 ? easeOut((f + 1) / 5) : 1;
      const flash = f === 8;
      for (let si = 0; si < SHARDS.length; si++) {
        const s = SHARDS[si];
        const delay = si < 2 ? 1 : 0; // 外側の小さい結晶は1コマ遅れて出る
        const g = f <= 4 ? easeOut((f + 1 - delay) / (5 - delay)) : grow;
        if (g <= 0) continue;
        const L = s.L * g;
        for (let y = 0; y < F; y++) {
          for (let x = 0; x < F; x++) {
            const v = shardAt(s, L, x + 0.5, y + 0.5);
            if (v === null) continue;
            let c = v < -0.35 ? ICE_LIGHT : v < 0.3 ? ICE_MID : ICE_DARK;
            if (flash) c = v < 0.3 ? WHITE : ICE_LIGHT;
            fr.put(x, y, c);
          }
        }
        // 軸に沿った白いハイライト
        if (!flash && L > 5) {
          for (let u = L * 0.25; u < L * 0.7; u += 0.5) {
            const x = s.bx + Math.sin(s.a) * u - Math.cos(s.a) * s.W * 0.45;
            const y = ICE_BASE_Y - Math.cos(s.a) * u - Math.sin(s.a) * s.W * 0.45;
            fr.put(x, y, WHITE);
          }
        }
      }
      outline(fr, ICE_OUT);
      // 結晶の先できらめく
      if (f >= 5 && f <= 7) {
        const s = SHARDS[4 - (f - 5) * 2 < 0 ? 0 : 4 - (f - 5) * 2];
        const x = Math.round(s.bx + Math.sin(s.a) * s.L * 0.92);
        const y = Math.round(ICE_BASE_Y - Math.cos(s.a) * s.L * 0.92);
        sparkle(fr, x, y, f === 6 ? 7 : 5, WHITE, ICE_LIGHT, ICE_MID);
      }
    } else {
      // 砕け散る破片
      const t = f - 8;
      for (let i = 0; i < frags.length; i++) {
        const p = frags[i];
        const x = p.x + p.vx * t * 1.3;
        const y = p.y + p.vy * t * 1.3 + 0.45 * t * t;
        if (t >= 4 && i % 2) continue;
        if (p.big && t <= 3) {
          fr.put(x, y, ICE_LIGHT); fr.put(x + 1, y, ICE_MID);
          fr.put(x, y + 1, ICE_MID); fr.put(x + 1, y + 1, ICE_DARK);
        } else {
          fr.put(x, y, t <= 3 ? ICE_LIGHT : ICE_MID);
          if (t <= 2) fr.put(x + 1, y + 1, ICE_MID);
        }
      }
      outline(fr, ICE_OUT);
      // 残るきらめき
      if (t <= 4) {
        const pts = [[6, 9], [18, 7], [12, 4], [9, 15], [16, 14]];
        const [x, y] = pts[t % pts.length];
        sparkle(fr, x, y, t <= 2 ? 5 : 3, WHITE, ICE_LIGHT, ICE_MID);
      }
    }
    frames.push(fr);
  }
  return frames;
}

// ───────────────── 6. 回復 ─────────────────
// 足元に光の輪が広がり、きらめきが立ちのぼって消える。

function makeHeal() {
  const N = 12;
  const R = rng(707);
  const motes = Array.from({ length: 11 }, (_, i) => ({
    x: 4 + ((i * 7 + 3) % 17) + (R() - 0.5),
    y: 19 + R() * 3,
    born: Math.floor(i * 0.6),
    sp: 1.4 + R() * 0.9,
    gold: i % 4 === 2,
  }));
  const SIZES = [1, 3, 5, 3, 5, 7, 3, 1];
  const frames = [];
  for (let f = 0; f < N; f++) {
    const fr = new Frame();
    // 立ちのぼる淡い光（半透明の柱）
    const glow = f < 3 ? (f + 1) / 3 : f > 8 ? (N - f) / 4 : 1;
    for (let y = 2; y < 22; y++) {
      for (let x = 5; x < 19; x++) {
        const d = Math.abs(x + 0.5 - 12) / 7;
        const h = (22 - y) / 20;
        const a = (1 - d) * (1 - h) * 0.42 * glow;
        if (a > 0.06) fr.over(x, y, HEAL_MID, a);
      }
    }
    // きらめき
    for (const m of motes) {
      const age = f - m.born;
      if (age < 0 || age >= SIZES.length) continue;
      const x = Math.round(m.x + Math.sin(age * 0.8 + m.x) * 0.8);
      const y = Math.round(m.y - age * m.sp * 1.5);
      if (y < 1) continue;
      const size = SIZES[age];
      if (m.gold) sparkle(fr, x, y, size, WHITE, HEAL_GOLD, HEAL_GOLD);
      else sparkle(fr, x, y, size, WHITE, HEAL_LIGHT, HEAL_MID);
    }
    outline(fr, HEAL_OUT);
    // 足元に広がる光の輪（縁取りの代わりに下へ濃い色を1ドット敷く。きらめきの下に潜らせる）
    if (f <= 8) {
      const rx = 3 + easeOut((f + 1) / 6) * 8;
      const ry = rx * 0.3;
      const light = f < 6 ? HEAL_LIGHT : HEAL_MID;
      const shade = f < 6 ? HEAL_DARK : HEAL_OUT;
      const ring = new Set();
      for (let i = 0; i < 96; i++) {
        const th = (i / 96) * Math.PI * 2;
        if (f >= 6 && i % 3 === 0) continue; // 消えぎわは点線に
        ring.add(`${Math.round(12 + Math.cos(th) * rx)},${Math.round(20.5 + Math.sin(th) * ry)}`);
      }
      const free = (x, y) => fr.alpha(x, y) < 255;
      const cells = [...ring].map((k) => k.split(',').map(Number)).filter(([x, y]) => free(x, y));
      for (const [x, y] of cells) {
        if (!ring.has(`${x},${y + 1}`) && free(x, y + 1)) fr.put(x, y + 1, shade);
      }
      for (const [x, y] of cells) fr.put(x, y, light);
    }
    frames.push(fr);
  }
  return frames;
}

// ───────────────── 書き出し ─────────────────

/** file は public/assets/game-effects/ 配下の名前。fps / name は BUILT_IN_EFFECT_PRESETS 側と揃える。 */
const EFFECTS = [
  { file: 'fireball.png', name: '火の玉', fps: 15, make: makeFireball },
  { file: 'flame.png', name: '炎', fps: 15, make: makeFlame },
  { file: 'explosion.png', name: '爆発', fps: 15, make: makeExplosion },
  { file: 'wind.png', name: '風', fps: 20, make: makeWind },
  { file: 'ice.png', name: '氷', fps: 20, make: makeIce },
  { file: 'heal.png', name: '回復', fps: 15, make: makeHeal },
];

function packSheet(frames) {
  const w = F * frames.length;
  const out = new Uint8ClampedArray(w * F * 4);
  frames.forEach((fr, i) => {
    for (let y = 0; y < F; y++) {
      for (let x = 0; x < F; x++) {
        const s = (y * F + x) * 4, d = (y * w + i * F + x) * 4;
        if (fr.px[s + 3] === 0) continue; // 透明ドットは RGB も 0 のまま（圧縮が効く）
        for (let k = 0; k < 4; k++) out[d + k] = fr.px[s + k];
      }
    }
  });
  return { w, h: F, px: out };
}

/** 確認用：背景3色（戦闘の暗色・草地・雪）× 全コマを scale 倍で並べる */
function previewSheet(frames, scale) {
  const BGS = [hex('#161a26'), hex('#5a9a3c'), hex('#e9eef2')];
  const gap = 2;
  const cell = F * scale;
  const w = frames.length * (cell + gap) + gap;
  const h = BGS.length * (cell + gap) + gap;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = 60; out[i * 4 + 1] = 60; out[i * 4 + 2] = 60; out[i * 4 + 3] = 255; }
  BGS.forEach((bg, row) => {
    frames.forEach((fr, col) => {
      const ox = gap + col * (cell + gap), oy = gap + row * (cell + gap);
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const s = (Math.floor(y / scale) * F + Math.floor(x / scale)) * 4;
          const a = fr.px[s + 3] / 255;
          const d = ((oy + y) * w + ox + x) * 4;
          for (let k = 0; k < 3; k++) out[d + k] = fr.px[s + k] * a + bg[k] * (1 - a);
          out[d + 3] = 255;
        }
      }
    });
  });
  return { w, h, px: out };
}

const previewArg = process.argv.find((a) => a.startsWith('--preview='));
const previewDir = previewArg ? resolve(previewArg.slice('--preview='.length)) : null;
// 確認用シートの拡大率。2＝フィールド（48px）、3＝戦闘（72px）と同じ見え方
const scaleArg = process.argv.find((a) => a.startsWith('--scale='));
const previewScale = scaleArg ? Math.max(1, parseInt(scaleArg.slice('--scale='.length), 10) || 4) : 4;

mkdirSync(OUT_DIR, { recursive: true });
if (previewDir) mkdirSync(previewDir, { recursive: true });
for (const ef of EFFECTS) {
  const frames = ef.make();
  const sheet = packSheet(frames);
  const png = encodePng(sheet.w, sheet.h, sheet.px);
  writeFileSync(join(OUT_DIR, ef.file), png);
  console.log(`wrote public/assets/game-effects/${ef.file} (${ef.name}, ${frames.length} frames @ ${ef.fps}fps, ${png.length} bytes)`);
  if (previewDir) {
    const pv = previewSheet(frames, previewScale);
    writeFileSync(join(previewDir, ef.file.replace('.png', '.preview.png')), encodePng(pv.w, pv.h, pv.px));
  }
}
