// アプリアイコン（PWA / apple-touch-icon）を生成する。
// 外部依存を足したくないので、16x16 のドット絵を最近傍で拡大して PNG を直接エンコードする。
// 生成物は public/ にコミットされるので、デザインを変えたときだけ手で叩けばよい。
//   node scripts/gen-icons.mjs
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

const BG = [0x0b, 0x0e, 0x14];   // サイト背景色と同じ
const BLUE = [0x3b, 0x82, 0xf6]; // アクセント色（タブのアクティブ下線と同じ）
const WHITE = [0xf8, 0xfa, 0xfc];

/**
 * 16x16 のドット絵を作る。
 * 十字キー（D-pad）＝「ゲームが作れる場所」を小さいサイズでも読めるモチーフとして使う。
 * @param {boolean} rounded 角を落とすか（マスカブルアイコンでは落とさない）
 * @param {number} inset 外周に空ける余白のドット数（マスカブルのセーフゾーン用）
 */
function buildGrid(rounded, inset) {
  const N = 16;
  const grid = Array.from({ length: N }, () => Array.from({ length: N }, () => BG));

  const lo = inset;
  const hi = N - 1 - inset;
  for (let y = lo; y <= hi; y++) {
    for (let x = lo; x <= hi; x++) {
      grid[y][x] = BLUE;
    }
  }

  if (rounded) {
    // 角の 1 ドットずつを背景に戻して、わずかに丸く見せる
    for (const [y, x] of [[lo, lo], [lo, hi], [hi, lo], [hi, hi]]) {
      grid[y][x] = BG;
    }
  }

  // 十字キー（D-pad）。ただの白い十字だと医療の十字に見えるので、
  // 中央に押しボタンのくぼみを入れて「方向キー」だと分かるようにする。
  const span = hi - lo + 1;
  const arm = Math.max(1, Math.round(span / 4));       // 十字の腕の太さ
  const reach = Math.max(arm, Math.round(span / 2.6)); // 中心からの長さ
  const cx = (lo + hi) / 2;
  const cy = (lo + hi) / 2;
  const half = arm / 2;
  const dot = Math.max(0.5, arm / 4);                  // 中央のくぼみの半径
  for (let y = lo; y <= hi; y++) {
    for (let x = lo; x <= hi; x++) {
      const dx = Math.abs(x + 0.5 - (cx + 0.5));
      const dy = Math.abs(y + 0.5 - (cy + 0.5));
      const vertical = dx < half && dy < reach;
      const horizontal = dy < half && dx < reach;
      if (!vertical && !horizontal) continue;
      grid[y][x] = (dx < dot && dy < dot) ? BLUE : WHITE;
    }
  }
  return grid;
}

/** 16x16 のグリッドを size x size の RGB バッファへ最近傍で拡大する */
function rasterize(grid, size) {
  const N = grid.length;
  const raw = Buffer.alloc(size * (size * 3 + 1)); // 各行の先頭に filter バイト(0)
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    const sy = Math.min(N - 1, Math.floor((y * N) / size));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(N - 1, Math.floor((x * N) / size));
      const [r, g, b] = grid[sy][sx];
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  return raw;
}

const crcTable = (() => {
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
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(raw, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: truecolor
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(process.cwd(), 'public');
const normal = buildGrid(true, 1);
const maskable = buildGrid(false, 0);
const targets = [
  ['icon-192.png', normal, 192],
  ['icon-512.png', normal, 512],
  // マスカブルはOS側で最大 ~20% 削られるので、余白を多めに取った別デザインにする
  ['icon-maskable-512.png', buildGrid(false, 3), 512],
  ['apple-icon.png', maskable, 180],
];

for (const [name, grid, size] of targets) {
  const png = encodePng(rasterize(grid, size), size);
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`wrote public/${name} (${size}x${size}, ${png.length} bytes)`);
}
