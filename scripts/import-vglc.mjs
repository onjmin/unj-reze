#!/usr/bin/env node
/**
 * VGLC → プロジェクト形式 変換スクリプト
 * Source: TheVGLC/TheVGLC (github.com/TheVGLC/TheVGLC)
 * ライセンス: CC BY-NC-SA 4.0 (研究目的・非商用)
 *
 * 使い方: node scripts/import-vglc.mjs
 * 出力:   components/game-presets/vglc-stages.ts
 */

import { writeFileSync } from 'fs';

const VGLC = 'https://raw.githubusercontent.com/TheVGLC/TheVGLC/master';
const ROWS = 15;  // shared.ts ROWS

// ── SMB タイルマッピング (VGLC char → プロジェクト tile ID) ──────────────────
// mario.ts のタイル定義:
//  0=空, 1=ブロック, 2=ハテナ(コイン), 4=土管胴, 5=岩床, 6=音符ブロック
//  9=水, 10=溶岩, 11=壊せるブロック, 13=土管トップ, 14=使用済みブロック
//  16=コイン, 17=ハテナ(アイテム)
// VGLC 凡例: X=地面/固形, S=壊せるレンガ, ?=アイテム入りハテナ, Q=コイン入りハテナ,
//            o=コイン, E=敵出現位置, B/b=キラー砲台(上/下)
const SMB = {
  '-': 0,   // sky
  ' ': 0,
  'X': 1,   // solid / ground
  'S': 11,  // breakable brick → 壊せるブロック
  '?': 17,  // question block (power-up) → ハテナ(アイテム)
  'Q': 2,   // question block (coin) → ハテナ(コイン)
  'b': 1,   // cannon bottom → 固形
  '<': 13,  // pipe top-left → 土管トップ
  '>': 13,  // pipe top-right
  '[': 4,   // pipe body-left → 土管胴
  ']': 4,   // pipe body-right
  'o': 16,  // coin → コインタイル
  'E': 0,   // enemy spawn → 空気（座標を spawn リストとして別途出力）
  'B': 1,   // cannon top → 固形
};

// ── Mega Man タイルマッピング ─────────────────────────────────────────────────
// rockman.ts のタイル定義:
//  0=空, 1=鉄床, 2=トゲ, 3=ゴール扉, 4=壁, 5=はしご
//  6=チェックポイント, 7=消えるブロック, 8=壊せる壁
const MM = {
  '@': 0,  // null (out-of-bounds padding) → 空
  '-': 0,  // empty air
  '#': 1,  // solid block
  'B': 8,  // breakable wall → 壊せる壁
  'H': 2,  // hazard spike → トゲ
  '|': 5,  // ladder → はしご
  't': 0,  // fall-through (pass as air)
  'D': 3,  // door → ゴール扉
  // items/enemies → air (placed as objects)
  'L': 0, 'l': 0, 'W': 0, 'w': 0, '+': 0, 'M': 0, 'C': 0, 'P': 0, '*': 0,
};

// ── ドラクエ風オーバーワールド (VGLC に DQ データなし → 手書き) ──────────────
// DQ tile IDs: 0=平地, 1=山, 2=水, 3=竜王城, 4=森, 5=石床, 6=壁, 7=扉
const DQ_W = 30, DQ_H = 24;
function makeDqField() {
  return Array.from({ length: DQ_H }, (_, y) =>
    Array.from({ length: DQ_W }, (_, x) => {
      if (x === 0 || x === DQ_W - 1 || y === 0 || y === DQ_H - 1) return 1;
      if (y <= 2 && x >= 13 && x <= 17) return y === 2 && x === 15 ? 3 : 1;
      if (x >= 4 && x <= 8  && y >= 6  && y <= 9)  return 2;
      if (x >= 20 && x <= 25 && y >= 12 && y <= 16) return 2;
      if (x >= 10 && x <= 12 && y >= 4  && y <= 5)  return 4;
      if (x >= 22 && x <= 25 && y >= 4  && y <= 6)  return 4;
      if (x >= 6  && x <= 8  && y >= 16 && y <= 18) return 4;
      if (x >= 13 && x <= 15 && y >= 10 && y <= 12) return 1;
      if (x >= 2  && x <= 3  && y >= 12 && y <= 14) return 1;
      if (x >= 3  && x <= 8  && y >= 19 && y <= 22 &&
          !(x >= 4 && x <= 7 && y >= 20 && y <= 21)) return 6;
      if ((x === 5 || x === 6) && y === 22) return 7;
      if (x === 9 && (y === 13 || y === 14)) return 7;
      return 0;
    })
  );
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

/**
 * SMB レベルテキスト → { grid, enemies }
 * @param {string} text  VGLC テキスト (14行)
 * @param {number} startCol  開始列 (0-indexed)
 * @param {number} [width]   取り出す列数（省略時は全列＝ステージ全長）
 */
function convertSmb(text, startCol = 0, width) {
  const lines = text.split('\n').filter(l => l.length > 0);
  const w = width ?? Math.max(...lines.map(l => l.length)) - startCol;
  // VGLC SMB = 14 行。ROWS=15 に合わせて上に空行を追加
  const skyRow = () => Array(w).fill(0);
  const grid = [];
  const enemies = [];

  // 14行 → ROWS=15: 上に1行追加
  while (grid.length + lines.length < ROWS) grid.push(skyRow());
  const pad = grid.length;

  lines.forEach((line, li) => {
    const row = [];
    for (let x = 0; x < w; x++) {
      const ch = line[startCol + x] ?? '-';
      if (ch === 'E') enemies.push({ col: x, row: li + pad });
      row.push(SMB[ch] ?? 0);
    }
    grid.push(row);
  });

  return { grid: grid.slice(0, ROWS), enemies };
}

/**
 * Mega Man レベルテキスト → number[][]
 * @param {string} text      VGLC テキスト
 * @param {number} startCol  最初のアクティブ列 (@ スキップ後)
 * @param {number} width     取り出す列数
 * @param {number} startRow  開始行
 */
function convertMm(text, startCol = -1, width = 40, startRow = 0) {
  const lines = text.split('\n').filter(l => l.length > 0);

  // startCol=-1 なら最初の非@ 列を自動検出
  let sc = startCol;
  if (sc < 0) {
    for (let x = 0; x < (lines[0]?.length ?? 0); x++) {
      if (lines.some(l => l[x] && l[x] !== '@')) { sc = x; break; }
    }
    if (sc < 0) sc = 0;
  }

  const grid = [];
  for (let y = startRow; y < startRow + ROWS && y < lines.length; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const ch = lines[y]?.[sc + x] ?? '@';
      row.push(MM[ch] ?? 0);
    }
    grid.push(row);
  }
  // 足りない行を空で埋める
  while (grid.length < ROWS) grid.push(Array(width).fill(0));

  return grid;
}

function toTs(varName, grid) {
  const rows = grid.map(row => `  [${row.join(',')}]`).join(',\n');
  return `export const ${varName}: number[][] = [\n${rows}\n];\n\n`;
}

function spawnsToTs(varName, spawns) {
  const items = spawns.map(s => `{ col: ${s.col}, row: ${s.row} }`).join(', ');
  return `export const ${varName}: { col: number; row: number }[] = [\n  ${items},\n];\n\n`;
}

async function main() {
  console.log('Fetching VGLC data from GitHub...');

  const [smb11, smb12, mm1, mm2] = await Promise.all([
    fetchText(`${VGLC}/Super%20Mario%20Bros/Processed/mario-1-1.txt`),
    fetchText(`${VGLC}/Super%20Mario%20Bros/Processed/mario-1-2.txt`),
    fetchText(`${VGLC}/MegaMan/megaman_1_1.txt`),
    fetchText(`${VGLC}/MegaMan/megaman_1_2.txt`),
  ]);
  console.log('Fetched all levels. Converting...');

  // SMB 1-1: 地上ステージ（全長 202 列）
  const ow = convertSmb(smb11);
  // ゴール旗: VGLC は旗竿を「孤立した固形ブロック1個」(col 198, file row 12 = grid row 13) で表す。
  // これをゴール旗タイル(3)に置き換える（旗タイルは passable + imageOverflowTop で上に伸びる）。
  if (ow.grid[13]?.[198] === 1) ow.grid[13][198] = 3;
  else console.warn('WARN: SMB 1-1 flagpole block not found at (198,13) — VGLC data changed?');
  // SMB 1-2: 地下ステージ（全長 158 列）
  const ug = convertSmb(smb12);
  const smbOverworld = ow.grid;
  const smbUnderground = ug.grid;

  // MM 1-1: VGLCフォーマットは75行構成 — 行0-59が@パディング、行60-74が実データ
  // CutMan ステージ前半 (列0〜39)
  const mm1Scene1 = convertMm(mm1, 0, 40, 60);
  // MM 1-1: 中盤 (列40〜79)
  const mm1Scene2 = convertMm(mm1, 40, 40, 60);

  // DQ フィールド
  const dqField = makeDqField();

  const output = [
    '// Auto-generated by scripts/import-vglc.mjs',
    '// Source: TheVGLC/TheVGLC (github.com/TheVGLC/TheVGLC)',
    '// License: CC BY-NC-SA 4.0 — 研究目的・非商用利用',
    '// Do not edit manually — run: node scripts/import-vglc.mjs',
    '',
    '// ── Super Mario Bros ────────────────────────────────────────────────────────',
    '// 1-1 (地上): 全長。ゴール旗はタイル3 (col 198)',
    toTs('smbOverworld', smbOverworld),
    '// 1-1 敵出現位置 (VGLC "E")',
    spawnsToTs('smbOverworldEnemies', ow.enemies),
    '// 1-2 (地下): 全長',
    toTs('smbUnderground', smbUnderground),
    '// 1-2 敵出現位置 (VGLC "E")',
    spawnsToTs('smbUndergroundEnemies', ug.enemies),
    '// ── Mega Man (Cut Man ステージ) ──────────────────────────────────────────────',
    '// 1-1 前半: 最初の 40 列',
    toTs('mmScene1', mm1Scene1),
    '// 1-1 中盤: 40〜80 列',
    toTs('mmScene2', mm1Scene2),
    '// ── ドラクエ風フィールド (30×24) ────────────────────────────────────────────',
    toTs('dqField', dqField),
  ].join('\n');

  writeFileSync('components/game-presets/vglc-stages.ts', output, 'utf8');
  console.log('✓ Generated: components/game-presets/vglc-stages.ts');

  // サマリー
  console.log('\nMap sizes:');
  console.log(`  smbOverworld:  ${smbOverworld[0].length} cols × ${smbOverworld.length} rows`);
  console.log(`  smbUnderground: ${smbUnderground[0].length} cols × ${smbUnderground.length} rows`);
  console.log(`  mmScene1:      ${mm1Scene1[0].length} cols × ${mm1Scene1.length} rows`);
  console.log(`  mmScene2:      ${mm1Scene2[0].length} cols × ${mm1Scene2.length} rows`);
  console.log(`  dqField:       ${dqField[0].length} cols × ${dqField.length} rows`);
}

main().catch(err => { console.error(err); process.exit(1); });
