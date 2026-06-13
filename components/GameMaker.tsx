'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Smartphone, Image as ImageIcon, Music, Trash2, Save } from 'lucide-react';
import { bgmManager } from '@/lib/BgmManager';
import { bgmRefToAsset, refLabel } from '@/lib/asset-ref';
import ContentPicker, { type PickResult } from './ContentPicker';

const TILE_SIZE = 32;
const COLS = 20;
const ROWS = 15;

export type PresetId = 'dq' | 'pokemon' | 'mario' | 'rockman' | 'touhou';
type EngineKind = 'action' | 'rpg' | 'touhou';
type EditorTab = 'map' | 'char' | 'asset';

interface TileDef { name: string; color: string; passable: boolean; special?: string; imageRef?: string; imageUrl?: string; }
interface PlayerDef {
  emoji: string; color: string; speed: number; jumpPower: number; w: number; h: number;
  start: { x: number; y: number }; spriteRef?: string; spriteUrl?: string;
}
interface BgmState { ref: string; src?: string; type?: 'youtube' | 'mml'; }

interface PresetData {
  id: PresetId; name: string; engine: EngineKind; gravity: number; friction: number;
  player: PlayerDef; tiles: Record<number, TileDef>; map: number[][]; bgm?: BgmState;
}

/** ゲームのマニフェスト（保存用・テキスト/参照のみ）。docs/game-feature-design.md §4 */
export interface GameManifestDraft {
  preset: PresetId; engine: EngineKind; name: string;
  gravity: number; friction: number;
  player: { emoji: string; color: string; speed: number; jumpPower: number; w: number; h: number; start: { x: number; y: number }; spriteRef?: string };
  tiles: Record<number, { name: string; color: string; passable: boolean; special?: string; imageRef?: string }>;
  map: number[][];
  bgm: string;
}

const YT_BGM = 'https://www.youtube.com/watch?v=0_jEpB40aYw';

const PRESETS: Record<PresetId, PresetData> = {
  dq: {
    id: 'dq', name: 'ドラクエ', engine: 'rpg', gravity: 0, friction: 0,
    player: { emoji: '🦸', color: '#4444ff', speed: 3, jumpPower: 0, w: 24, h: 24, start: { x: TILE_SIZE * 2, y: TILE_SIZE * 2 } },
    tiles: {
      0: { name: '平地', color: '#3a9a4a', passable: true },
      1: { name: '壁/岩', color: '#6b5a3a', passable: false },
      2: { name: '水', color: '#2a5acb', passable: false },
      3: { name: '城(ゴール)', color: '#b0b0c0', passable: true, special: 'goal' },
      4: { name: '宝箱', color: '#d4af37', passable: false, special: 'item' },
    },
    map: Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) =>
        x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1 ? 1
          : x === 10 && y > 4 && y < 11 ? 2
          : x === 16 && y === 3 ? 3
          : x === 5 && y === 10 ? 4 : 0
      )
    ),
  },
  pokemon: {
    id: 'pokemon', name: 'ポケモン', engine: 'rpg', gravity: 0, friction: 0,
    player: { emoji: '🧢', color: '#e03030', speed: 3, jumpPower: 0, w: 24, h: 24, start: { x: TILE_SIZE * 2, y: TILE_SIZE * 2 } },
    tiles: {
      0: { name: '道', color: '#c8b88a', passable: true },
      1: { name: '木', color: '#1f6b2f', passable: false },
      2: { name: '草むら', color: '#5fbf5f', passable: true, special: 'grass' },
      3: { name: 'ジム(ゴール)', color: '#9a5ad0', passable: true, special: 'goal' },
      4: { name: '池', color: '#2a8acb', passable: false },
    },
    map: Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) =>
        x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1 ? 1
          : (x > 6 && x < 13 && y > 7 && y < 12) ? 2
          : x === 16 && y === 3 ? 3
          : (x > 2 && x < 6 && y > 2 && y < 5) ? 4 : 0
      )
    ),
  },
  mario: {
    id: 'mario', name: 'マリオ', engine: 'action', gravity: 0.6, friction: 0.8,
    player: { emoji: '🍄', color: '#ff4444', speed: 4, jumpPower: -12, w: 24, h: 24, start: { x: 50, y: 50 } },
    tiles: {
      0: { name: '空', color: '#87CEEB', passable: true },
      1: { name: 'ブロック', color: '#8B4513', passable: false },
      2: { name: 'ハテナ', color: '#FFD700', passable: false, special: 'item' },
      3: { name: 'ゴール', color: '#32CD32', passable: true, special: 'goal' },
    },
    map: Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) =>
        y > ROWS - 3 ? 1 : y === ROWS - 5 && x > 5 && x < 10 ? 1 : x === 8 && y === ROWS - 6 ? 2 : x === 18 && y === ROWS - 4 ? 3 : 0
      )
    ),
  },
  rockman: {
    id: 'rockman', name: 'ロックマン', engine: 'action', gravity: 0.6, friction: 0.8,
    player: { emoji: '🤖', color: '#1e90ff', speed: 4, jumpPower: -12, w: 24, h: 24, start: { x: 50, y: 50 } },
    tiles: {
      0: { name: '空', color: '#0b1633', passable: true },
      1: { name: '鉄床', color: '#5a6a7a', passable: false },
      2: { name: 'トゲ', color: '#cf3030', passable: true, special: 'trap' },
      3: { name: 'ゴール', color: '#30cfa0', passable: true, special: 'goal' },
    },
    map: Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) =>
        y > ROWS - 3 ? 1
          : y === ROWS - 3 && (x === 7 || x === 12) ? 2
          : y === ROWS - 6 && x > 9 && x < 13 ? 1
          : x === 18 && y === ROWS - 4 ? 3 : 0
      )
    ),
  },
  touhou: {
    id: 'touhou', name: '東方(弾幕)', engine: 'touhou', gravity: 0, friction: 0,
    player: { emoji: '🎀', color: '#ff0000', speed: 4.5, jumpPower: 0, w: 24, h: 24, start: { x: COLS * TILE_SIZE / 2 - 12, y: ROWS * TILE_SIZE - 60 } },
    tiles: {
      0: { name: '夜空', color: '#0B0B2A', passable: true },
      1: { name: '壁', color: '#444466', passable: false },
      2: { name: '妖精(狙い弾)', color: '#00ff00', passable: true, special: 'enemy_aim' },
      3: { name: 'ボス(弾幕)', color: '#ff00ff', passable: true, special: 'enemy_boss' },
    },
    map: Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) => {
        if (x === 0 || x === COLS - 1) return 1;
        if (y === 2 && (x === 4 || x === 15)) return 2;
        if (y === 3 && x === 10) return 3;
        return 0;
      })
    ),
  },
};

const PRESET_ORDER: PresetId[] = ['dq', 'mario', 'touhou', 'pokemon', 'rockman'];
const PRESET_EMOJI: Record<PresetId, string> = { dq: '🐉', mario: '🍄', touhou: '🎀', pokemon: '⚡', rockman: '🤖' };

const clone = (d: PresetData): PresetData => JSON.parse(JSON.stringify(d));

interface Enemy { x: number; y: number; type: string; hp: number; timer: number; w: number; h: number; emoji: string; }
interface Bullet { x: number; y: number; w: number; h: number; vy: number; }
interface EnemyBullet { x: number; y: number; vx: number; vy: number; r: number; color: string; }

interface GameEngine {
  map: number[][];
  player: { x: number; y: number; vx: number; vy: number; isGrounded: boolean };
  keys: Set<string>;
  bullets: Bullet[];
  enemyBullets: EnemyBullet[];
  enemies: Enemy[];
  shotTimer: number;
  animId: number;
}

interface GameMakerProps {
  onClose: () => void;
  userId: string;
  onSave?: (manifest: GameManifestDraft, meta: { title: string; preset: PresetId }) => void;
}

export default function GameMaker({ onClose, userId, onSave }: GameMakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presetId, setPresetId] = useState<PresetId>('dq');
  const [gameData, setGameData] = useState<PresetData>(() => clone(PRESETS.dq));
  const [title, setTitle] = useState(PRESETS.dq.name);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('map');
  const [selectedTileId, setSelectedTileId] = useState(1);
  const [touchInputs, setTouchInputs] = useState({ up: false, down: false, left: false, right: false, action: false });
  const [, setInputReady] = useState(false);
  // ContentPicker: target が適用先
  const [picker, setPicker] = useState<{ mode: 'image' | 'bgm'; target: 'player' | 'bgm' | number } | null>(null);

  const engineRef = useRef<GameEngine>({
    map: [], player: { x: 50, y: 50, vx: 0, vy: 0, isGrounded: false },
    keys: new Set(), bullets: [], enemyBullets: [], enemies: [], shotTimer: 0, animId: 0,
  });
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const ensureImage = useCallback((url?: string) => {
    if (!url || imgCache.current.has(url)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    imgCache.current.set(url, img);
  }, []);

  // 画像参照が変わったらキャッシュへ読み込み
  useEffect(() => {
    ensureImage(gameData.player.spriteUrl);
    Object.values(gameData.tiles).forEach(t => ensureImage(t.imageUrl));
  }, [gameData, ensureImage]);

  const resetGame = useCallback((id: PresetId) => {
    const data = clone(PRESETS[id]);
    setPresetId(id);
    setGameData(data);
    setTitle(PRESETS[id].name);
    const eng = engineRef.current;
    eng.player = { ...data.player.start, vx: 0, vy: 0, isGrounded: false };
    eng.keys.clear();
    eng.bullets = []; eng.enemyBullets = []; eng.enemies = [];
    eng.map = JSON.parse(JSON.stringify(data.map));
    setTouchInputs({ up: false, down: false, left: false, right: false, action: false });
    setIsPlaying(false);
  }, []);

  const restart = useCallback(() => {
    const eng = engineRef.current;
    eng.player = { ...gameData.player.start, vx: 0, vy: 0, isGrounded: false };
    eng.keys.clear();
    eng.bullets = []; eng.enemyBullets = []; eng.enemies = [];
    setTouchInputs({ up: false, down: false, left: false, right: false, action: false });
    setIsPlaying(false);
  }, [gameData]);

  useEffect(() => {
    resetGame('dq');
    const firstTouch = () => { setInputReady(true); window.removeEventListener('touchstart', firstTouch); };
    window.addEventListener('touchstart', firstTouch);
    return () => window.removeEventListener('touchstart', firstTouch);
  }, [resetGame]);

  // BGM
  useEffect(() => {
    if (isPlaying && gameData.bgm?.src) {
      const asset = bgmRefToAsset(gameData.bgm.ref, gameData.bgm.type === 'mml' ? gameData.bgm.src : undefined);
      const type = gameData.bgm.type;
      const src = gameData.bgm.src;
      if (type && src) {
        bgmManager.play({ bgm: { type, src }, tileset: {} } as never);
      } else if (asset) {
        bgmManager.play({ bgm: asset, tileset: {} } as never);
      } else {
        bgmManager.stop();
      }
    } else {
      bgmManager.stop();
    }
    return () => bgmManager.stop();
  }, [isPlaying, gameData.bgm]);

  // Init map + enemies when play state changes
  useEffect(() => {
    const eng = engineRef.current;
    if (isPlaying) {
      eng.bullets = []; eng.enemyBullets = []; eng.enemies = [];
      const workingMap = JSON.parse(JSON.stringify(gameData.map));
      if (gameData.engine === 'touhou') {
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            const info = gameData.tiles[workingMap[y][x]];
            if (info?.special?.startsWith('enemy')) {
              eng.enemies.push({
                x: x * TILE_SIZE, y: y * TILE_SIZE, type: info.special,
                hp: info.special === 'enemy_boss' ? 80 : 8,
                timer: Math.random() * 60, w: TILE_SIZE, h: TILE_SIZE,
                emoji: info.special === 'enemy_boss' ? '🦇' : '🧚',
              });
              workingMap[y][x] = 0;
            }
          }
        }
      }
      eng.map = workingMap;
      eng.player = { ...gameData.player.start, vx: 0, vy: 0, isGrounded: false };
    } else {
      eng.map = gameData.map;
    }
  }, [isPlaying, gameData]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const handleKeyDown = (e: KeyboardEvent) => { engineRef.current.keys.add(e.key); if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); };
    const handleKeyUp = (e: KeyboardEvent) => { engineRef.current.keys.delete(e.key); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const getTile = (x: number, y: number) => {
      const col = Math.floor(x / TILE_SIZE); const row = Math.floor(y / TILE_SIZE);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
      const id = engineRef.current.map[row]?.[col] ?? 0;
      return { id, rect: { x: col * TILE_SIZE, y: row * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE }, info: gameData.tiles[id] };
    };

    const drawSprite = (def: { emoji: string; spriteUrl?: string }, x: number, y: number, w: number, h: number) => {
      const img = def.spriteUrl ? imgCache.current.get(def.spriteUrl) : undefined;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x, y, w, h);
      } else {
        ctx.font = `${w}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(def.emoji, x + w / 2, y + h + 4);
      }
    };

    const loop = () => {
      const eng = engineRef.current;
      const p = eng.player;
      const pData = gameData.player;
      const keys = eng.keys;
      const touch = touchInputs;

      const isLeft = keys.has('ArrowLeft') || keys.has('a') || touch.left;
      const isRight = keys.has('ArrowRight') || keys.has('d') || touch.right;
      const isUp = keys.has('ArrowUp') || keys.has('w') || touch.up;
      const isDown = keys.has('ArrowDown') || keys.has('s') || touch.down;
      const isAction = keys.has(' ') || keys.has('ArrowUp') || touch.action;

      if (isPlaying) {
        if (gameData.engine === 'action') {
          if (isLeft) p.vx -= 1;
          if (isRight) p.vx += 1;
          p.vx *= gameData.friction; p.vy += gameData.gravity;
          if (isAction && p.isGrounded) { p.vy = gameData.player.jumpPower; p.isGrounded = false; }

          p.x += p.vx;
          let hits = [getTile(p.x + 2, p.y + 2), getTile(p.x + pData.w - 2, p.y + 2),
            getTile(p.x + 2, p.y + pData.h - 2), getTile(p.x + pData.w - 2, p.y + pData.h - 2)]
            .filter(t => t && !t.info.passable);
          const tile = hits[0];
          if (tile) {
            if (p.vx > 0) p.x = tile.rect.x - pData.w;
            else if (p.vx < 0) p.x = tile.rect.x + TILE_SIZE;
            p.vx = 0;
          }

          p.y += p.vy; p.isGrounded = false;
          hits = [getTile(p.x + 2, p.y + 2), getTile(p.x + pData.w - 2, p.y + 2),
            getTile(p.x + 2, p.y + pData.h), getTile(p.x + pData.w - 2, p.y + pData.h)]
            .filter(t => t && !t.info.passable);
          const tile2 = hits[0];
          if (tile2) {
            if (p.vy > 0) { p.y = tile2.rect.y - pData.h; p.isGrounded = true; }
            else if (p.vy < 0) p.y = tile2.rect.y + TILE_SIZE;
            p.vy = 0;
          }
          if (p.y > ROWS * TILE_SIZE) restart();

        } else if (gameData.engine === 'rpg') {
          let nx = p.x, ny = p.y;
          if (isLeft) nx -= pData.speed; if (isRight) nx += pData.speed;
          if (isUp) ny -= pData.speed; if (isDown) ny += pData.speed;
          let t1 = getTile(nx, p.y), t2 = getTile(nx + pData.w - 1, p.y + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable) p.x = nx;
          t1 = getTile(p.x, ny); t2 = getTile(p.x + pData.w - 1, ny + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable) p.y = ny;

        } else if (gameData.engine === 'touhou') {
          let nx = p.x, ny = p.y;
          if (isLeft) nx -= pData.speed; if (isRight) nx += pData.speed;
          if (isUp) ny -= pData.speed; if (isDown) ny += pData.speed;
          let t1 = getTile(nx, p.y), t2 = getTile(nx + pData.w - 1, p.y + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable && nx >= 0 && nx <= COLS * TILE_SIZE - pData.w) p.x = nx;
          t1 = getTile(p.x, ny); t2 = getTile(p.x + pData.w - 1, ny + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable && ny >= 0 && ny <= ROWS * TILE_SIZE - pData.h) p.y = ny;

          eng.shotTimer++;
          if (isAction && eng.shotTimer > 6) {
            eng.bullets.push({ x: p.x + pData.w / 2 - 4, y: p.y, w: 8, h: 16, vy: -12 });
            eng.shotTimer = 0;
          }
          for (let i = eng.bullets.length - 1; i >= 0; i--) {
            eng.bullets[i].y += eng.bullets[i].vy;
            if (eng.bullets[i].y < 0) eng.bullets.splice(i, 1);
          }

          for (let ei = eng.enemies.length - 1; ei >= 0; ei--) {
            const e = eng.enemies[ei]; e.timer++;
            if (e.type === 'enemy_aim' && e.timer > 80) {
              const dx = (p.x + pData.w / 2) - (e.x + e.w / 2);
              const dy = (p.y + pData.h / 2) - (e.y + e.h / 2);
              const dist = Math.sqrt(dx * dx + dy * dy);
              const spd = 3;
              if (dist > 0) eng.enemyBullets.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: (dx / dist) * spd, vy: (dy / dist) * spd, r: 5, color: '#00ffff' });
              e.timer = 0;
            } else if (e.type === 'enemy_boss' && e.timer > 8) {
              for (let w = 0; w < 5; w++) {
                const angle = e.timer * 0.15 + (w * (Math.PI * 2 / 5));
                const spd = 3.5;
                eng.enemyBullets.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, r: 6, color: '#ff4444' });
              }
              if (e.timer > 150) e.timer = -50;
            }

            for (let j = eng.bullets.length - 1; j >= 0; j--) {
              const b = eng.bullets[j];
              if (b.x < e.x + e.w && b.x + b.w > e.x && b.y < e.y + e.h && b.y + b.h > e.y) {
                e.hp--; eng.bullets.splice(j, 1);
                if (e.hp <= 0) {
                  eng.enemies.splice(ei, 1);
                  if (e.type === 'enemy_boss') setTimeout(() => { alert('BOSS DEFEATED! クリア！'); setIsPlaying(false); }, 10);
                  break;
                }
              }
            }
          }

          const pCore = { x: p.x + pData.w / 2 - 2, y: p.y + pData.h / 2 - 2, w: 4, h: 4 };
          for (let i = eng.enemyBullets.length - 1; i >= 0; i--) {
            const eb = eng.enemyBullets[i]; eb.x += eb.vx; eb.y += eb.vy;
            if (eb.x < 0 || eb.x > COLS * TILE_SIZE || eb.y < 0 || eb.y > ROWS * TILE_SIZE) { eng.enemyBullets.splice(i, 1); continue; }
            if (eb.x + eb.r > pCore.x && eb.x - eb.r < pCore.x + pCore.w && eb.y + eb.r > pCore.y && eb.y - eb.r < pCore.y + pCore.h) {
              setTimeout(() => { alert('ピチューン (ミス)'); setIsPlaying(false); }, 10);
              break;
            }
          }
          for (const e of eng.enemies) {
            if (pCore.x < e.x + e.w && pCore.x + pCore.w > e.x && pCore.y < e.y + e.h && pCore.y + pCore.h > e.y) {
              setTimeout(() => { alert('体当たりミス！'); setIsPlaying(false); }, 10);
              break;
            }
          }
        }

        if (gameData.engine !== 'touhou') {
          const center = getTile(p.x + pData.w / 2, p.y + pData.h / 2);
          if (center?.info?.special === 'goal') setTimeout(() => { alert('クリア！'); setIsPlaying(false); }, 10);
          else if (center?.info?.special === 'trap') restart();
        }
      }

      // Draw
      ctx.fillStyle = gameData.tiles[0].color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const map = engineRef.current.map;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const tileId = map[y]?.[x] ?? 0;
          const info = gameData.tiles[tileId];
          if (tileId !== 0 && info) {
            const img = info.imageUrl ? imgCache.current.get(info.imageUrl) : undefined;
            if (img && img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            } else {
              ctx.fillStyle = info.color;
              ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
            if (!isPlaying) { ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
          }
        }
      }

      if (gameData.engine === 'touhou' && isPlaying) {
        for (const e of eng.enemies) {
          ctx.font = `${e.w}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(e.emoji, e.x + e.w / 2, e.y + e.h);
          ctx.fillStyle = 'red'; ctx.fillRect(e.x, e.y - 5, e.w * (e.hp / (e.type === 'enemy_boss' ? 80 : 8)), 3);
        }
        ctx.fillStyle = 'yellow';
        for (const b of eng.bullets) ctx.fillRect(b.x, b.y, b.w, b.h);
        for (const eb of eng.enemyBullets) {
          ctx.fillStyle = eb.color; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r * 0.5, 0, Math.PI * 2); ctx.fill();
        }
      }

      if (gameData.engine !== 'touhou') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(p.x + pData.w / 2, p.y + pData.h, pData.w / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = gameData.player.color;
      drawSprite({ emoji: pData.emoji, spriteUrl: pData.spriteUrl }, p.x, p.y, pData.w, pData.h);

      if (gameData.engine === 'touhou' && isPlaying) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(p.x + pData.w / 2, p.y + pData.h / 2, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'red'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      if (!isPlaying) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('タップ・ドラッグでマップ編集', canvas.width / 2, canvas.height / 2 - 10);
        ctx.font = '14px sans-serif';
        ctx.fillText('完了したら右上の [プレイ] を押す', canvas.width / 2, canvas.height / 2 + 20);
      }

      eng.animId = requestAnimationFrame(loop);
    };

    const id = requestAnimationFrame(loop);
    engineRef.current.animId = id;
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [gameData, isPlaying, restart, touchInputs]);

  // Map editing
  const handleCanvasAction = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPlaying) return;
    let clientX: number, clientY: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
      if (e.cancelable) e.preventDefault();
    } else {
      const me = e as React.MouseEvent;
      clientX = me.clientX; clientY = me.clientY;
    }
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const col = Math.floor(x / TILE_SIZE); const row = Math.floor(y / TILE_SIZE);
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
      const newMap = gameData.map.map(r => [...r]);
      newMap[row][col] = selectedTileId;
      setGameData(prev => ({ ...prev, map: newMap }));
      engineRef.current.map = newMap;
    }
  };

  const padProps = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); setTouchInputs(p => ({ ...p, [key]: true })); },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); setTouchInputs(p => ({ ...p, [key]: false })); },
    onPointerLeave: (e: React.PointerEvent) => { e.preventDefault(); setTouchInputs(p => ({ ...p, [key]: false })); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // ContentPicker 結果の適用
  const applyPick = (res: PickResult) => {
    const target = picker?.target;
    setPicker(null);
    if (target === undefined) return;
    if (target === 'player') {
      setGameData(prev => ({ ...prev, player: { ...prev.player, spriteRef: res.ref, spriteUrl: res.url } }));
    } else if (target === 'bgm') {
      const type = res.ref.startsWith('mml:') ? 'mml' : 'youtube';
      const src = type === 'mml' ? (res.rawMml || res.ref.replace(/^mml:/, '')) : res.url;
      setGameData(prev => ({ ...prev, bgm: { ref: res.ref, src, type } }));
    } else if (typeof target === 'number') {
      setGameData(prev => ({
        ...prev,
        tiles: { ...prev.tiles, [target]: { ...prev.tiles[target], imageRef: res.ref, imageUrl: res.url } },
      }));
    }
  };

  const buildManifest = (): GameManifestDraft => ({
    preset: gameData.id,
    engine: gameData.engine,
    name: title.trim() || gameData.name,
    gravity: gameData.gravity,
    friction: gameData.friction,
    player: {
      emoji: gameData.player.emoji, color: gameData.player.color, speed: gameData.player.speed,
      jumpPower: gameData.player.jumpPower, w: gameData.player.w, h: gameData.player.h,
      start: gameData.player.start, spriteRef: gameData.player.spriteRef,
    },
    tiles: Object.fromEntries(Object.entries(gameData.tiles).map(([k, t]) => [k, {
      name: t.name, color: t.color, passable: t.passable, special: t.special, imageRef: t.imageRef,
    }])),
    map: gameData.map,
    bgm: gameData.bgm?.ref || 'none',
  });

  const handleSave = () => {
    onSave?.(buildManifest(), { title: title.trim() || gameData.name, preset: gameData.id });
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#07080b] text-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f0f11] border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100/10 rounded-full shrink-0"><X size={16} /></button>
          <span className="text-xs font-bold text-white shrink-0">ゲーム作成</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={restart} className="p-2 text-gray-400 hover:text-white rounded-full bg-gray-700/50" title="リスタート"><RotateCcw size={14} /></button>
          <button onClick={() => setIsPlaying(p => !p)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold ${isPlaying ? 'bg-yellow-500 text-yellow-900' : 'bg-green-500 text-green-900'}`}>
            {isPlaying ? <><Pause size={14} /><span className="hidden sm:inline">編集</span></> : <><Play size={14} /><span className="hidden sm:inline">プレイ</span></>}
          </button>
          {onSave && (
            <button onClick={handleSave} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-600 text-white hover:bg-blue-500">
              <Save size={14} /><span className="hidden sm:inline">投稿に添付</span>
            </button>
          )}
        </div>
      </div>

      {/* Preset selector */}
      {!isPlaying && (
        <div className="flex gap-1.5 px-3 py-2 bg-[#0a0a0d] border-b border-gray-800 overflow-x-auto scrollbar-none shrink-0">
          {PRESET_ORDER.map(id => (
            <button key={id} onClick={() => resetGame(id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition ${presetId === id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              <span>{PRESET_EMOJI[id]}</span>{PRESETS[id].name}
            </button>
          ))}
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Canvas */}
        <div className={`flex items-center justify-center bg-black p-2 overflow-hidden ${isPlaying ? 'flex-1 max-h-[55vh] md:max-h-full' : 'flex-1'}`}>
          <div className="relative w-full mx-auto rounded-lg overflow-hidden ring-2 ring-gray-700 touch-none"
            style={{ aspectRatio: `${COLS * TILE_SIZE}/${ROWS * TILE_SIZE}`, maxWidth: COLS * TILE_SIZE + 'px' }}>
            <canvas ref={canvasRef} width={COLS * TILE_SIZE} height={ROWS * TILE_SIZE}
              className={`block w-full h-full ${!isPlaying ? 'cursor-crosshair' : ''}`}
              style={{ imageRendering: 'pixelated' }}
              onMouseDown={handleCanvasAction}
              onMouseMove={e => (e.buttons & 1) === 1 && handleCanvasAction(e)}
              onTouchStart={handleCanvasAction}
              onTouchMove={handleCanvasAction} />
          </div>
        </div>

        {/* Sidebar */}
        <div className={`bg-[#0a0a0d] flex flex-col border-t md:border-t-0 md:border-l border-gray-800 ${isPlaying ? 'w-full md:w-auto' : 'flex-1 md:w-80 md:flex-none'}`}>
          {isPlaying ? (
            /* Touch controls */
            <div className="flex-1 flex flex-col justify-center p-4 select-none">
              <div className="flex justify-between items-center max-w-xs mx-auto w-full gap-8">
                <div className="relative w-28 h-28">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-12 bg-gray-600 rounded-t-lg active:bg-gray-400 touch-none cursor-pointer" {...padProps('up')}></div>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-12 bg-gray-600 rounded-b-lg active:bg-gray-400 touch-none cursor-pointer" {...padProps('down')}></div>
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-10 bg-gray-600 rounded-l-lg active:bg-gray-400 touch-none cursor-pointer" {...padProps('left')}></div>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-10 bg-gray-600 rounded-r-lg active:bg-gray-400 touch-none cursor-pointer" {...padProps('right')}></div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-gray-700 pointer-events-none rounded"></div>
                </div>
                {(gameData.engine === 'action' || gameData.engine === 'touhou') && (
                  <button className="w-16 h-16 rounded-full border-b-4 border-gray-800 active:border-b-0 active:translate-y-1 shadow-lg text-white font-bold text-xs bg-blue-600 active:bg-blue-500 touch-none cursor-pointer select-none"
                    {...padProps('action')}>
                    {gameData.engine === 'touhou' ? 'SHOT' : 'JUMP'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Editor tabs */}
              <div className="flex border-b border-gray-800 shrink-0">
                {([
                  ['map', 'マップ'],
                  ['char', 'キャラ'],
                  ['asset', 'アセット'],
                ] as [EditorTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setEditorTab(id)}
                    className={`flex-1 py-2.5 text-[11px] font-bold transition ${editorTab === id ? 'text-blue-400 border-b-2 border-blue-500 bg-[#0f0f11]' : 'text-gray-500'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Editor content */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {editorTab === 'map' && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-gray-500 flex items-center gap-1"><Smartphone size={12} /> 選択して画面をタップ／ドラッグ</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(gameData.tiles).map(([id, tile]) => (
                        <button key={id} onClick={() => setSelectedTileId(Number(id))}
                          className={`flex items-center gap-2 p-2 rounded border-2 transition ${selectedTileId === Number(id) ? 'border-blue-500 bg-gray-800' : 'border-gray-700 bg-gray-900'}`}>
                          <div className="w-5 h-5 shrink-0 rounded border border-gray-600 overflow-hidden" style={{ backgroundColor: tile.color }}>
                            {tile.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={tile.imageUrl} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <span className="text-[10px] truncate">{tile.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {editorTab === 'char' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">見た目</label>
                      <div className="flex items-center gap-2">
                        <input type="text" value={gameData.player.emoji} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, emoji: e.target.value.slice(0, 2), spriteRef: undefined, spriteUrl: undefined } }))}
                          className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-center text-xl" />
                        <button onClick={() => setPicker({ mode: 'image', target: 'player' })}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300">
                          <ImageIcon size={13} />画像/歩行グラを参照
                        </button>
                      </div>
                      {gameData.player.spriteRef && (
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400 bg-gray-900 rounded px-2 py-1.5 border border-gray-800">
                          {gameData.player.spriteUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={gameData.player.spriteUrl} alt="" className="w-6 h-6 object-contain" style={{ imageRendering: 'pixelated' }} />}
                          <span className="truncate flex-1">{refLabel(gameData.player.spriteRef)}</span>
                          <button onClick={() => setGameData(p => ({ ...p, player: { ...p.player, spriteRef: undefined, spriteUrl: undefined } }))} className="text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="flex justify-between text-[11px] text-gray-400 mb-1"><span>移動速度</span><span className="text-blue-400">{gameData.player.speed}</span></label>
                      <input type="range" min={1} max={10} step={0.5} value={gameData.player.speed}
                        onChange={e => setGameData(p => ({ ...p, player: { ...p.player, speed: Number(e.target.value) } }))}
                        className="w-full accent-blue-500" />
                    </div>
                    {gameData.engine === 'action' && (
                      <div>
                        <label className="flex justify-between text-[11px] text-gray-400 mb-1"><span>ジャンプ力</span><span className="text-blue-400">{gameData.player.jumpPower}</span></label>
                        <input type="range" min={-20} max={-5} step={1} value={gameData.player.jumpPower}
                          onChange={e => setGameData(p => ({ ...p, player: { ...p.player, jumpPower: Number(e.target.value) } }))}
                          className="w-full accent-blue-500" />
                      </div>
                    )}
                  </div>
                )}

                {editorTab === 'asset' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">タイトル</label>
                      <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200" />
                    </div>

                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1 flex items-center gap-1"><Music size={12} />BGM</label>
                      <button onClick={() => setPicker({ mode: 'bgm', target: 'bgm' })}
                        className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300">
                        <span className="truncate">{gameData.bgm ? refLabel(gameData.bgm.ref) : 'BGMを選択（YouTube / MML投稿 / 直接）'}</span>
                        <Music size={13} className="shrink-0 ml-1" />
                      </button>
                      {gameData.bgm && (
                        <button onClick={() => setGameData(p => ({ ...p, bgm: undefined }))} className="mt-1 text-[10px] text-gray-500 hover:text-red-400 flex items-center gap-1"><Trash2 size={11} />BGMを外す</button>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1.5 flex items-center gap-1"><ImageIcon size={12} />タイル画像（任意・参照のみ）</label>
                      <div className="space-y-1.5">
                        {Object.entries(gameData.tiles).filter(([id]) => Number(id) !== 0).map(([id, tile]) => (
                          <div key={id} className="flex items-center gap-2 bg-gray-900 rounded-lg px-2 py-1.5 border border-gray-800">
                            <div className="w-6 h-6 shrink-0 rounded border border-gray-600 overflow-hidden" style={{ backgroundColor: tile.color }}>
                              {tile.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={tile.imageUrl} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <span className="text-[10px] text-gray-400 flex-1 truncate">{tile.name}</span>
                            {tile.imageRef && (
                              <button onClick={() => setGameData(p => ({ ...p, tiles: { ...p.tiles, [id]: { ...p.tiles[Number(id)], imageRef: undefined, imageUrl: undefined } } }))} className="text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>
                            )}
                            <button onClick={() => setPicker({ mode: 'image', target: Number(id) })} className="text-[10px] text-blue-400 hover:text-blue-300 shrink-0">参照</button>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1.5">画像は既存の投稿・歩行グラ・URLを参照（実体は保存しません）。</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {picker && (
        <ContentPicker
          mode={picker.mode}
          userId={userId}
          onPick={applyPick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
