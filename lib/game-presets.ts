import type { GameManifest, Tileset } from './game-config';

const YT_BGM = 'https://www.youtube.com/watch?v=0_jEpB40aYw';

const TILESET_DEFAULT: Tileset = {
  0: { color: '#2d5a27', label: 'grass' },
  1: { color: '#4a4a4a', label: 'wall' },
  2: { color: '#1a3a6a', label: 'water' },
  3: { color: '#6b5a3a', label: 'path' },
  4: { color: '#1a3a1a', label: 'tree' },
  5: { color: '#8a7a4a', label: 'sand' },
  6: { color: '#5a4a2a', label: 'bridge' },
  7: { color: '#6a2a2a', label: 'shrine' },
  8: { color: '#5a5a4a', label: 'gravel' },
};

const COLS = 20;
const ROWS = 15;
const TS = 32;

function border(tiles: number[][], v: number) {
  for (let x = 0; x < COLS; x++) { tiles[0][x] = v; tiles[ROWS - 1][x] = v; }
  for (let y = 0; y < ROWS; y++) { tiles[y][0] = v; tiles[y][COLS - 1] = v; }
}
function rect(tiles: number[][], x1: number, y1: number, x2: number, y2: number, v: number) {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) tiles[y][x] = v;
  }
}

function buildMap(fill: number, build: (m: number[][]) => void): number[][] {
  const m = Array.from({ length: ROWS }, () => Array(COLS).fill(fill));
  border(m, 1);
  build(m);
  return m;
}

const RPG_MAP = buildMap(0, (m) => {
  rect(m, 2, 2, 8, 7, 1);
  rect(m, 3, 3, 7, 6, 3);
  rect(m, 10, 3, 12, 5, 2);
  rect(m, 15, 10, 18, 13, 4);
  rect(m, 5, 14, 10, 14, 3);
});

const PLATFORMER_MAP = buildMap(5, (m) => {
  for (let x = 0; x < COLS; x++) { m[ROWS - 2][x] = 8; m[ROWS - 3][x] = 8; }
  rect(m, 3, 10, 5, ROWS - 4, 6);
  rect(m, 10, 12, 12, ROWS - 4, 6);
  rect(m, 7, 6, 7, 6, 1);
  rect(m, 14, 5, 14, 5, 1);
});

const BULLET_MAP = buildMap(8, (m) => {
  rect(m, 8, 6, 12, 10, 3);
  rect(m, 9, 7, 11, 9, 7);
  rect(m, 4, 3, 6, 5, 4);
  rect(m, 14, 3, 16, 5, 4);
});

export const GAME_PRESETS: GameManifest[] = [
  {
    id: 'rpg-default',
    name: 'RPG Quest',
    genre: 'rpg',
    scene: {
      cols: COLS,
      rows: ROWS,
      tileSize: 16,
      tiles: RPG_MAP,
      playerStart: { col: 3, row: 3 },
    },
    assets: {
      bgm: { type: 'youtube', src: YT_BGM },
      tileset: TILESET_DEFAULT,
    },
  },
  {
    id: 'platformer-default',
    name: 'Mario Jump',
    genre: 'platformer',
    scene: {
      cols: COLS,
      rows: ROWS,
      tileSize: 16,
      tiles: PLATFORMER_MAP,
      playerStart: { col: 3, row: 3 },
    },
    assets: {
      tileset: TILESET_DEFAULT,
    },
  },
  {
    id: 'bullet-hell-default',
    name: 'Touhou Lite',
    genre: 'bullet-hell',
    scene: {
      cols: COLS,
      rows: ROWS,
      tileSize: 16,
      tiles: BULLET_MAP,
      playerStart: { col: 3, row: 3 },
    },
    assets: {
      tileset: TILESET_DEFAULT,
    },
  },
];

export function findPreset(id: string): GameManifest | undefined {
  return GAME_PRESETS.find(p => p.id === id);
}
