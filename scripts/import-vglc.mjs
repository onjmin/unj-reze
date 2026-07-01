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
//  0=空, 1=ブロック, 2=ハテナ, 4=土管胴, 5=岩床, 6=音符ブロック
//  9=水, 10=溶岩, 11=壊せるブロック, 13=土管トップ, 14=使用済みブロック
const SMB = {
  '-': 0,   // sky
  ' ': 0,
  'X': 1,   // solid / ground
  'S': 1,   // solid stone
  '?': 2,   // question block
  'Q': 14,  // used question block
  'b': 11,  // breakable brick
  '<': 13,  // pipe top-left → 土管トップ
  '>': 13,  // pipe top-right
  '[': 4,   // pipe body-left → 土管胴
  ']': 4,   // pipe body-right
  'o': 0,   // coin → 空気（オブジェクトとして別途配置）
  'E': 0,   // enemy spawn → 空気
  'B': 6,   // bonus/note block → 音符ブロック
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
 * SMB レベルテキスト → number[][]
 * @param {string} text  VGLC テキスト (14行)
 * @param {number} startCol  開始列 (0-indexed)
 * @param {number} width     取り出す列数
 */
function convertSmb(text, startCol = 0, width = 60) {
  const lines = text.split('\n').filter(l => l.length > 0);
  // VGLC SMB = 14 行。ROWS=15 に合わせて上に空行を追加
  const skyRow = (w) => Array(w).fill(0);
  const grid = [];
  const w = width;

  // 14行 → ROWS=15: 上に1行追加
  while (grid.length + lines.length < ROWS) grid.push(skyRow(w));

  for (const line of lines) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const ch = line[startCol + x] ?? '-';
      row.push(SMB[ch] ?? 0);
    }
    grid.push(row);
  }

  return grid.slice(0, ROWS);
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

async function main() {
  console.log('Fetching VGLC data from GitHub...');

  const [smb11, smb12, mm1, mm2] = await Promise.all([
    fetchText(`${VGLC}/Super%20Mario%20Bros/Processed/mario-1-1.txt`),
    fetchText(`${VGLC}/Super%20Mario%20Bros/Processed/mario-1-2.txt`),
    fetchText(`${VGLC}/MegaMan/megaman_1_1.txt`),
    fetchText(`${VGLC}/MegaMan/megaman_1_2.txt`),
  ]);
  console.log('Fetched all levels. Converting...');

  // SMB 1-1: 地上ステージ (最初の 60 列)
  const smbOverworld = convertSmb(smb11, 0, 60);
  // SMB 1-2: 地下ステージ (最初の 60 列)
  const smbUnderground = convertSmb(smb12, 0, 60);

  // MM 1-1: CutMan ステージ前半 (最初の 40 列)
  const mm1Scene1 = convertMm(mm1, -1, 40, 0);
  // MM 1-1: 中盤 (40〜80 列)
  let mm1StartCol = -1;
  const mm1Lines = mm1.split('\n').filter(l => l.length > 0);
  for (let x = 0; x < (mm1Lines[0]?.length ?? 0); x++) {
    if (mm1Lines.some(l => l[x] && l[x] !== '@')) { mm1StartCol = x; break; }
  }
  const mm1Scene2 = convertMm(mm1, mm1StartCol + 40, 40, 0);

  // DQ フィールド
  const dqField = makeDqField();

  const output = [
    '// Auto-generated by scripts/import-vglc.mjs',
    '// Source: TheVGLC/TheVGLC (github.com/TheVGLC/TheVGLC)',
    '// License: CC BY-NC-SA 4.0 — 研究目的・非商用利用',
    '// Do not edit manually — run: node scripts/import-vglc.mjs',
    '',
    '// ── Super Mario Bros ────────────────────────────────────────────────────────',
    '// 1-1 (地上): 最初の 60 列',
    toTs('smbOverworld', smbOverworld),
    '// 1-2 (地下): 最初の 60 列',
    toTs('smbUnderground', smbUnderground),
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
