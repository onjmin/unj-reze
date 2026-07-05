// assets/ の生スプライトシートを GameMaker から参照できる形へ加工して public/assets/ に出力する。
//
//   node scripts/slice-rpg-assets.mjs
//
// - assets/rpgen/map.png, assets/rpg-reze/{Base,field}.png … 16pxグリッドのタイルセット。
//   そのままコピーし、実行時は `url:<url>#sx,sy,16,16` クロップ参照で1タイルずつ使う。
// - assets/rpgen/char.png … RPGEN(rpgen.org)のDQ風キャラシート。方向行の間に隙間がある
//   独自レイアウトのため、@rpgja/rpgen-map の getDQAnimationSpritePosition と同じ式で
//   キャラごとに切り出し、RPGEN歩行グラ規格(16px・2フレーム×4方向[後,右,前,左]=32x64)の
//   シートに詰め直す。出力は walk:rpgen:u:<url> でそのまま animate できる。
//
// 依存ライブラリなし（zlibのみ）。対応PNG: bitDepth=8 / colorType 0,2,3,4,6 / 非インターレース。

import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ───────────────── 最小PNGコーデック ─────────────────

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (depth=${bitDepth}, interlace=${interlace})`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colorType ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const px = Buffer.alloc(h * stride);
  // 行フィルタ解除 (0:None 1:Sub 2:Up 3:Average 4:Paeth)
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = row[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = v & 0xff;
    }
  }

  // RGBA へ正規化
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * channels, d = i * 4;
    if (colorType === 3) {
      const idx = px[s];
      rgba[d] = palette[idx * 3]; rgba[d + 1] = palette[idx * 3 + 1]; rgba[d + 2] = palette[idx * 3 + 2];
      rgba[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
    } else if (colorType === 6) {
      px.copy(rgba, d, s, s + 4);
    } else if (colorType === 2) {
      px.copy(rgba, d, s, s + 3); rgba[d + 3] = 255;
    } else if (colorType === 4) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = px[s + 1];
    } else {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = 255;
    }
  }
  return { width: w, height: h, rgba };
}

function encodePng(width, height, rgba) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'latin1');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA8
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function blit(src, sw, dst, dw, sx, sy, w, h, dx, dy) {
  for (let y = 0; y < h; y++) {
    src.rgba.copy(dst, ((dy + y) * dw + dx) * 4, ((sy + y) * sw + sx) * 4, ((sy + y) * sw + sx + w) * 4);
  }
}

// ───────────────── char.png のDQキャラ切り出し ─────────────────

const CHIP = 16;
// @rpgja/rpgen-map getDQAnimationSpritePosition と同一の式
const dqPos = (surface, direction, frame) => {
  const half = surface / 2;
  const ySpacing = 15 + 15 * Math.round(half) + 17 * Math.floor(half);
  return { x: 4 + (16 + 32) * frame, y: direction * 32 + ySpacing + 16 * 7 * surface };
};

// surface番号 → 名前（@rpgja/rpgen-map DQAnimationSpriteSurface より）
export const DQ_SURFACES = [
  [0, 'hero', '勇者'],
  [1, 'soldier-b', '兵士B'],
  [2, 'merchant', '商人'],
  [3, 'elderly-a', '老人A'],
  [4, 'child', '子供'],
  [5, 'elderly-b', '老人B'],
  [6, 'warrior-a', '戦士A'],
  [7, 'weapon-merchant', '武器商人'],
  [8, 'princess', '姫'],
  [9, 'woman-a', '女A'],
  [10, 'elderly-c', '老人C'],
  [11, 'woman-b', '女B'],
  [12, 'warrior-b', '戦士B'],
  [13, 'armor-merchant', '防具商人'],
  [14, 'man-a', '男A'],
  [15, 'woman-c', '女C'],
  [16, 'man-b', '男B'],
  [17, 'woman-d', '女D'],
  [18, 'soldier-a', '兵士A'],
  [19, 'extra-19', 'その他'],
  [20, 'king', '王様'],
  [21, 'bhikkhuni', '尼'],
];

function sliceChars() {
  const src = decodePng(readFileSync(join(ROOT, 'assets/rpgen/char.png')));
  const outDir = join(ROOT, 'public/assets/rpgen/char');
  mkdirSync(outDir, { recursive: true });
  for (const [surface, slug] of DQ_SURFACES) {
    // RPGEN歩行規格: 2フレーム×4方向。行順 [後,右,前,左] = 元シートの North,East,South,West。
    const dst = Buffer.alloc(CHIP * 2 * CHIP * 4 * 4);
    let opaque = 0;
    for (let dir = 0; dir < 4; dir++) {
      for (let frame = 0; frame < 2; frame++) {
        const { x, y } = dqPos(surface, dir, frame);
        if (y + CHIP > src.height) throw new Error(`surface ${surface} out of bounds (y=${y})`);
        blit(src, src.width, dst, CHIP * 2, x, y, CHIP, CHIP, frame * CHIP, dir * CHIP);
      }
    }
    for (let i = 3; i < dst.length; i += 4) if (dst[i] > 0) opaque++;
    if (opaque === 0) { console.warn(`surface ${surface} (${slug}): empty, skipped`); continue; }
    const file = join(outDir, `${String(surface).padStart(2, '0')}-${slug}.png`);
    writeFileSync(file, encodePng(CHIP * 2, CHIP * 4, dst));
    console.log(`wrote ${file}`);
  }
}

// ───────────────── タイルセットのコピー ─────────────────

const COPIES = [
  ['assets/rpgen/map.png', 'public/assets/rpgen/map.png'],
  ['assets/rpgen/404Chip.png', 'public/assets/rpgen/404Chip.png'],
  ['assets/rpg-reze/field.png', 'public/assets/rpg-reze/field.png'],
  ['assets/rpg-reze/Base.png', 'public/assets/rpg-reze/Base.png'],
];

function copyTilesets() {
  for (const [from, to] of COPIES) {
    mkdirSync(join(ROOT, dirname(to)), { recursive: true });
    copyFileSync(join(ROOT, from), join(ROOT, to));
    console.log(`copied ${from} -> ${to}`);
  }
}

copyTilesets();
sliceChars();
