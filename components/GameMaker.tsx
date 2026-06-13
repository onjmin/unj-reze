'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Smartphone, Image as ImageIcon, Music, Trash2, Save, Plus, Volume2 } from 'lucide-react';
import { bgmManager } from '@/lib/BgmManager';
import { bgmRefToAsset, refLabel } from '@/lib/asset-ref';
import { mmlToNotes, playMml } from '@/lib/mml';
import ContentPicker, { type PickResult } from './ContentPicker';

const TILE_SIZE = 32;
const COLS = 20;
const ROWS = 15;
const PLAY_W = COLS * TILE_SIZE;
const PLAY_H = ROWS * TILE_SIZE;

export type PresetId = 'dq' | 'pokemon' | 'mario' | 'rockman' | 'touhou';
type EngineKind = 'action' | 'rpg' | 'touhou';
type EditorTab = 'map' | 'object' | 'char' | 'asset';

type NpcBehavior = 'still' | 'random' | 'chase' | 'flee' | 'patrolH' | 'patrolV';
type BulletType = 'none' | 'aimed' | 'spread' | 'spiral';
type SfxTrigger = 'jump' | 'shot' | 'clear' | 'damage';
type ObjectKind = 'npc' | 'tile' | 'bullet';

interface TileDef { name: string; color: string; passable: boolean; special?: string; imageRef?: string; imageUrl?: string; }
interface PlayerDef {
  emoji: string; color: string; speed: number; jumpPower: number; w: number; h: number;
  start: { x: number; y: number }; spriteRef?: string; spriteUrl?: string;
}
interface BgmState { ref: string; src?: string; type?: 'youtube' | 'mml'; }
interface SfxRef { ref: string; src?: string; type?: 'youtube' | 'mml'; }
interface ObjectDef {
  id: string; kind: ObjectKind;
  emoji: string; spriteRef?: string; spriteUrl?: string;
  col: number; row: number; hp: number; speed: number;
  behavior: NpcBehavior; bullet: BulletType; bulletSpeed: number; bulletColor: string; fireRate: number;
  hazard: boolean; message: string;
}

interface PresetData {
  id: PresetId; name: string; engine: EngineKind; gravity: number; friction: number;
  player: PlayerDef; tiles: Record<number, TileDef>; map: number[][];
  objects: ObjectDef[]; bgm?: BgmState; sfx: Partial<Record<SfxTrigger, SfxRef>>;
}

/** 保存用マニフェスト（テキスト/参照のみ）。docs/game-feature-design.md §4 */
export interface GameManifestDraft {
  preset: PresetId; engine: EngineKind; name: string; gravity: number; friction: number;
  player: { emoji: string; color: string; speed: number; jumpPower: number; w: number; h: number; start: { x: number; y: number }; spriteRef?: string };
  tiles: Record<number, { name: string; color: string; passable: boolean; special?: string; imageRef?: string }>;
  map: number[][];
  objects: Array<Omit<ObjectDef, 'spriteUrl'>>;
  bgm: string;
  sfx: Partial<Record<SfxTrigger, string>>;
}

const uid = () => `o${Math.random().toString(36).slice(2, 9)}`;
const YT_BGM = 'https://www.youtube.com/watch?v=0_jEpB40aYw';

const newObject = (over: Partial<ObjectDef> = {}): ObjectDef => ({
  id: uid(), kind: 'npc', emoji: '👾', col: 5, row: 5, hp: 8, speed: 1.5,
  behavior: 'random', bullet: 'none', bulletSpeed: 3, bulletColor: '#00ffff', fireRate: 60,
  hazard: true, message: '', ...over,
});

const PRESETS: Record<PresetId, PresetData> = {
  dq: {
    id: 'dq', name: 'ドラクエ', engine: 'rpg', gravity: 0, friction: 0,
    player: { emoji: '🦸', color: '#4444ff', speed: 3, jumpPower: 0, w: 24, h: 24, start: { x: TILE_SIZE * 2, y: TILE_SIZE * 2 } },
    tiles: {
      0: { name: '平地', color: '#3a9a4a', passable: true },
      1: { name: '壁/岩', color: '#6b5a3a', passable: false },
      2: { name: '水', color: '#2a5acb', passable: false },
      3: { name: '城(ゴール)', color: '#b0b0c0', passable: true, special: 'goal' },
    },
    map: Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) =>
        x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1 ? 1
          : x === 10 && y > 4 && y < 11 ? 2
          : x === 16 && y === 3 ? 3 : 0
      )
    ),
    objects: [newObject({ emoji: '👴', col: 5, row: 5, behavior: 'still', hazard: false, message: 'よくきたな勇者よ！' })],
    sfx: {},
  },
  pokemon: {
    id: 'pokemon', name: 'ポケモン', engine: 'rpg', gravity: 0, friction: 0,
    player: { emoji: '🧢', color: '#e03030', speed: 3, jumpPower: 0, w: 24, h: 24, start: { x: TILE_SIZE * 2, y: TILE_SIZE * 2 } },
    tiles: {
      0: { name: '道', color: '#c8b88a', passable: true },
      1: { name: '木', color: '#1f6b2f', passable: false },
      2: { name: '草むら', color: '#5fbf5f', passable: true, special: 'grass' },
      3: { name: 'ジム(ゴール)', color: '#9a5ad0', passable: true, special: 'goal' },
    },
    map: Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) =>
        x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1 ? 1
          : (x > 6 && x < 13 && y > 7 && y < 12) ? 2
          : x === 16 && y === 3 ? 3 : 0
      )
    ),
    objects: [newObject({ emoji: '🐭', col: 9, row: 9, behavior: 'random', hazard: true })],
    sfx: {},
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
    objects: [newObject({ emoji: '🐢', col: 13, row: ROWS - 3, behavior: 'patrolH', speed: 1, hazard: true, hp: 1, bullet: 'none' })],
    sfx: {},
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
    objects: [newObject({ emoji: '🛸', col: 14, row: 4, behavior: 'patrolH', speed: 1.2, bullet: 'aimed', fireRate: 90, hazard: true, hp: 3 })],
    sfx: {},
  },
  touhou: {
    id: 'touhou', name: '東方(弾幕)', engine: 'touhou', gravity: 0, friction: 0,
    player: { emoji: '🎀', color: '#ff0000', speed: 4.5, jumpPower: 0, w: 24, h: 24, start: { x: PLAY_W / 2 - 12, y: PLAY_H - 60 } },
    tiles: {
      0: { name: '夜空', color: '#0B0B2A', passable: true },
      1: { name: '壁', color: '#444466', passable: false },
    },
    map: Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) => (x === 0 || x === COLS - 1 ? 1 : 0))
    ),
    objects: [
      newObject({ emoji: '🧚', col: 4, row: 2, behavior: 'patrolH', speed: 0.8, hp: 8, bullet: 'aimed', fireRate: 80, bulletColor: '#00ffff' }),
      newObject({ emoji: '🧚', col: 15, row: 2, behavior: 'patrolH', speed: 0.8, hp: 8, bullet: 'aimed', fireRate: 80, bulletColor: '#00ffff' }),
      newObject({ emoji: '🦇', col: 10, row: 3, behavior: 'random', speed: 0.6, hp: 80, bullet: 'spiral', fireRate: 8, bulletColor: '#ff4444' }),
    ],
    sfx: {},
  },
};

const PRESET_ORDER: PresetId[] = ['dq', 'mario', 'touhou', 'pokemon', 'rockman'];
const PRESET_EMOJI: Record<PresetId, string> = { dq: '🐉', mario: '🍄', touhou: '🎀', pokemon: '⚡', rockman: '🤖' };
const BEHAVIOR_LABELS: Record<NpcBehavior, string> = { still: '静止', random: 'ランダム', chase: '追尾', flee: '逃走', patrolH: '左右往復', patrolV: '上下往復' };
const BULLET_LABELS: Record<BulletType, string> = { none: 'なし', aimed: '狙い弾', spread: '拡散', spiral: '回転' };
const OBJECT_KIND_LABELS: Record<ObjectKind, string> = { npc: 'NPC / 敵', tile: 'タイル', bullet: '弾 / 攻撃' };
const SFX_LABELS: Record<SfxTrigger, string> = { jump: 'ジャンプ', shot: 'ショット', clear: 'クリア', damage: 'ミス/被弾' };

const clone = (d: PresetData): PresetData => JSON.parse(JSON.stringify(d));

function playSfx(s?: SfxRef) {
  if (!s || !s.src || s.type !== 'mml') return; // youtube SFXは即時再生に不向きなので参照保持のみ
  const { tracks, tempo } = mmlToNotes(s.src);
  if (tracks.some(t => t.notes.length > 0)) playMml(tracks, tempo);
}

interface Entity { def: ObjectDef; x: number; y: number; hp: number; timer: number; vx: number; vy: number; talked: boolean; }
interface Bullet { x: number; y: number; w: number; h: number; vy: number; }
interface EnemyBullet { x: number; y: number; vx: number; vy: number; r: number; color: string; }

interface GameEngine {
  map: number[][];
  player: { x: number; y: number; vx: number; vy: number; isGrounded: boolean };
  keys: Set<string>;
  bullets: Bullet[];
  enemyBullets: EnemyBullet[];
  entities: Entity[];
  shotTimer: number;
  animId: number;
}

interface GameMakerProps {
  onClose: () => void;
  userId: string;
  onSave?: (manifest: GameManifestDraft, meta: { title: string; preset: PresetId }) => void;
}

type PickTarget =
  | { t: 'player' } | { t: 'bgm' } | { t: 'tile'; id: number }
  | { t: 'sfx'; trigger: SfxTrigger } | { t: 'objsprite' };

export default function GameMaker({ onClose, userId, onSave }: GameMakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presetId, setPresetId] = useState<PresetId>('dq');
  const [gameData, setGameData] = useState<PresetData>(() => clone(PRESETS.dq));
  const [title, setTitle] = useState(PRESETS.dq.name);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('map');
  const [selectedTileId, setSelectedTileId] = useState(1);
  const [objTemplate, setObjTemplate] = useState<ObjectDef>(() => newObject());
  const [picker, setPicker] = useState<{ mode: 'image' | 'bgm'; target: PickTarget } | null>(null);
  const previewStopRef = useRef<(() => void) | null>(null);

  const engineRef = useRef<GameEngine>({
    map: [], player: { x: 50, y: 50, vx: 0, vy: 0, isGrounded: false },
    keys: new Set(), bullets: [], enemyBullets: [], entities: [], shotTimer: 0, animId: 0,
  });
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const sfxRef = useRef<PresetData['sfx']>({});
  sfxRef.current = gameData.sfx;

  const previewMmlAsset = useCallback((_key: string, asset?: { src?: string; type?: 'youtube' | 'mml' }) => {
    previewStopRef.current?.();
    previewStopRef.current = null;
    if (!asset?.src || asset.type !== 'mml') return;
    const { tracks, tempo } = mmlToNotes(asset.src);
    if (!tracks.some(t => t.notes.length > 0)) return;
    previewStopRef.current = playMml(tracks, tempo, undefined, () => {
      previewStopRef.current = null;
    });
  }, []);

  useEffect(() => () => { previewStopRef.current?.(); previewStopRef.current = null; }, []);

  const ensureImage = useCallback((url?: string) => {
    if (!url || imgCache.current.has(url)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    imgCache.current.set(url, img);
  }, []);

  useEffect(() => {
    ensureImage(gameData.player.spriteUrl);
    Object.values(gameData.tiles).forEach(t => ensureImage(t.imageUrl));
    gameData.objects.forEach(o => ensureImage(o.spriteUrl));
    ensureImage(objTemplate.spriteUrl);
  }, [gameData, objTemplate, ensureImage]);

  const resetGame = useCallback((id: PresetId) => {
    const data = clone(PRESETS[id]);
    setPresetId(id);
    setGameData(data);
    setTitle(PRESETS[id].name);
    const eng = engineRef.current;
    eng.player = { ...data.player.start, vx: 0, vy: 0, isGrounded: false };
    eng.keys.clear();
    eng.bullets = []; eng.enemyBullets = []; eng.entities = [];
    eng.map = JSON.parse(JSON.stringify(data.map));
    setIsPlaying(false);
  }, []);

  const restart = useCallback(() => {
    const eng = engineRef.current;
    eng.player = { ...gameData.player.start, vx: 0, vy: 0, isGrounded: false };
    eng.keys.clear();
    eng.bullets = []; eng.enemyBullets = []; eng.entities = [];
    setIsPlaying(false);
  }, [gameData]);

  useEffect(() => {
    resetGame('dq');
  }, [resetGame]);

  // BGM
  useEffect(() => {
    if (isPlaying && gameData.bgm?.src) {
      const type = gameData.bgm.type;
      const src = gameData.bgm.src;
      if (type && src) bgmManager.play({ bgm: { type, src }, tileset: {} } as never);
      else {
        const asset = bgmRefToAsset(gameData.bgm.ref);
        if (asset) bgmManager.play({ bgm: asset, tileset: {} } as never); else bgmManager.stop();
      }
    } else {
      bgmManager.stop();
    }
    return () => bgmManager.stop();
  }, [isPlaying, gameData.bgm]);

  // Spawn entities on play
  useEffect(() => {
    const eng = engineRef.current;
    if (isPlaying) {
      eng.bullets = []; eng.enemyBullets = [];
      eng.entities = gameData.objects.map(o => ({
        def: o, x: o.col * TILE_SIZE, y: o.row * TILE_SIZE,
        hp: o.hp, timer: Math.random() * 60, vx: 0, vy: 0, talked: false,
      }));
      eng.map = JSON.parse(JSON.stringify(gameData.map));
      eng.player = { ...gameData.player.start, vx: 0, vy: 0, isGrounded: false };
    } else {
      eng.map = gameData.map;
      eng.entities = [];
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

    const win = () => { playSfx(sfxRef.current.clear); setTimeout(() => { alert('クリア！'); setIsPlaying(false); }, 10); };
    const lose = (msg: string) => { playSfx(sfxRef.current.damage); setTimeout(() => { alert(msg); setIsPlaying(false); }, 10); };

    const loop = () => {
      const eng = engineRef.current;
      const p = eng.player;
      const pData = gameData.player;
      const keys = eng.keys;
      const t = touchRef.current;

      const isLeft = keys.has('ArrowLeft') || keys.has('a') || t.left;
      const isRight = keys.has('ArrowRight') || keys.has('d') || t.right;
      const isUp = keys.has('ArrowUp') || keys.has('w') || t.up;
      const isDown = keys.has('ArrowDown') || keys.has('s') || t.down;
      const isAction = keys.has(' ') || keys.has('ArrowUp') || t.action;

      let dead = false;

      if (isPlaying) {
        // ── player movement ──
        if (gameData.engine === 'action') {
          if (isLeft) p.vx -= 1;
          if (isRight) p.vx += 1;
          p.vx *= gameData.friction; p.vy += gameData.gravity;
          if (isAction && p.isGrounded) { p.vy = gameData.player.jumpPower; p.isGrounded = false; playSfx(sfxRef.current.jump); }

          p.x += p.vx;
          let hits = [getTile(p.x + 2, p.y + 2), getTile(p.x + pData.w - 2, p.y + 2),
            getTile(p.x + 2, p.y + pData.h - 2), getTile(p.x + pData.w - 2, p.y + pData.h - 2)]
            .filter(t2 => t2 && !t2.info.passable);
          const tile = hits[0];
          if (tile) { if (p.vx > 0) p.x = tile.rect.x - pData.w; else if (p.vx < 0) p.x = tile.rect.x + TILE_SIZE; p.vx = 0; }

          p.y += p.vy; p.isGrounded = false;
          hits = [getTile(p.x + 2, p.y + 2), getTile(p.x + pData.w - 2, p.y + 2),
            getTile(p.x + 2, p.y + pData.h), getTile(p.x + pData.w - 2, p.y + pData.h)]
            .filter(t2 => t2 && !t2.info.passable);
          const tile2 = hits[0];
          if (tile2) { if (p.vy > 0) { p.y = tile2.rect.y - pData.h; p.isGrounded = true; } else if (p.vy < 0) p.y = tile2.rect.y + TILE_SIZE; p.vy = 0; }
          if (p.y > PLAY_H) { lose('ミス！'); dead = true; }
        } else {
          // rpg / touhou: 8-dir free move
          let nx = p.x, ny = p.y;
          if (isLeft) nx -= pData.speed; if (isRight) nx += pData.speed;
          if (isUp) ny -= pData.speed; if (isDown) ny += pData.speed;
          let t1 = getTile(nx, p.y), t2 = getTile(nx + pData.w - 1, p.y + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable && nx >= 0 && nx <= PLAY_W - pData.w) p.x = nx;
          t1 = getTile(p.x, ny); t2 = getTile(p.x + pData.w - 1, ny + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable && ny >= 0 && ny <= PLAY_H - pData.h) p.y = ny;

          if (gameData.engine === 'touhou') {
            eng.shotTimer++;
            if (isAction && eng.shotTimer > 6) {
              eng.bullets.push({ x: p.x + pData.w / 2 - 4, y: p.y, w: 8, h: 16, vy: -12 });
              eng.shotTimer = 0; playSfx(sfxRef.current.shot);
            }
            for (let i = eng.bullets.length - 1; i >= 0; i--) {
              eng.bullets[i].y += eng.bullets[i].vy;
              if (eng.bullets[i].y < 0) eng.bullets.splice(i, 1);
            }
          }
        }

        // ── entities (NPC / 敵 / 弾源) ──
        const pcx = p.x + pData.w / 2, pcy = p.y + pData.h / 2;
        for (let ei = eng.entities.length - 1; ei >= 0; ei--) {
          const e = eng.entities[ei]; const d = e.def; e.timer++;
          const ecx = e.x + TILE_SIZE / 2, ecy = e.y + TILE_SIZE / 2;

          // movement
          const sp = d.speed;
          if (d.behavior === 'random') {
            if (e.timer % 40 === 0) { e.vx = (Math.random() * 2 - 1) * sp; e.vy = (Math.random() * 2 - 1) * sp; }
            e.x += e.vx; e.y += e.vy;
          } else if (d.behavior === 'chase' || d.behavior === 'flee') {
            const dx = pcx - ecx, dy = pcy - ecy; const dist = Math.hypot(dx, dy) || 1;
            const s = (d.behavior === 'chase' ? 1 : -1) * sp;
            e.x += (dx / dist) * s; e.y += (dy / dist) * s;
          } else if (d.behavior === 'patrolH') {
            if (e.vx === 0) e.vx = sp; e.x += e.vx;
            if (e.x < TILE_SIZE || e.x > PLAY_W - TILE_SIZE * 2) e.vx *= -1;
          } else if (d.behavior === 'patrolV') {
            if (e.vy === 0) e.vy = sp; e.y += e.vy;
            if (e.y < TILE_SIZE || e.y > PLAY_H - TILE_SIZE * 2) e.vy *= -1;
          }
          e.x = Math.max(0, Math.min(PLAY_W - TILE_SIZE, e.x));
          e.y = Math.max(0, Math.min(PLAY_H - TILE_SIZE, e.y));

          // firing
          if (d.bullet !== 'none' && e.timer % Math.max(1, Math.round(d.fireRate)) === 0) {
            const spd = d.bulletSpeed;
            if (d.bullet === 'aimed') {
              const dx = pcx - ecx, dy = pcy - ecy; const dist = Math.hypot(dx, dy) || 1;
              eng.enemyBullets.push({ x: ecx, y: ecy, vx: dx / dist * spd, vy: dy / dist * spd, r: 5, color: d.bulletColor });
            } else if (d.bullet === 'spread') {
              for (let k = -2; k <= 2; k++) {
                const a = Math.PI / 2 + k * 0.3;
                eng.enemyBullets.push({ x: ecx, y: ecy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 5, color: d.bulletColor });
              }
            } else if (d.bullet === 'spiral') {
              for (let w = 0; w < 5; w++) {
                const a = e.timer * 0.15 + w * (Math.PI * 2 / 5);
                eng.enemyBullets.push({ x: ecx, y: ecy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, color: d.bulletColor });
              }
            }
          }

          // player shot vs entity (touhou)
          for (let j = eng.bullets.length - 1; j >= 0; j--) {
            const b = eng.bullets[j];
            if (b.x < e.x + TILE_SIZE && b.x + b.w > e.x && b.y < e.y + TILE_SIZE && b.y + b.h > e.y) {
              e.hp--; eng.bullets.splice(j, 1);
              if (e.hp <= 0) { eng.entities.splice(ei, 1); break; }
            }
          }
          if (e.hp <= 0) continue;

          // body contact vs player
          const overlap = pcx > e.x && pcx < e.x + TILE_SIZE && pcy > e.y && pcy < e.y + TILE_SIZE;
          if (overlap) {
            if (d.hazard) { lose('ミス！'); dead = true; break; }
            else if (d.message && !e.talked) { e.talked = true; setTimeout(() => alert(d.message), 10); }
          } else if (!d.hazard) {
            e.talked = false;
          }
        }

        // enemy bullets
        if (!dead) {
          const core = gameData.engine === 'touhou' ? 3 : 8;
          for (let i = eng.enemyBullets.length - 1; i >= 0; i--) {
            const eb = eng.enemyBullets[i]; eb.x += eb.vx; eb.y += eb.vy;
            if (eb.x < -10 || eb.x > PLAY_W + 10 || eb.y < -10 || eb.y > PLAY_H + 10) { eng.enemyBullets.splice(i, 1); continue; }
            if (Math.hypot(eb.x - pcx, eb.y - pcy) < eb.r + core) { lose(gameData.engine === 'touhou' ? 'ピチューン (被弾)' : 'ミス！'); dead = true; break; }
          }
        }

        // win conditions
        if (!dead) {
          if (gameData.engine !== 'touhou') {
            const center = getTile(pcx, pcy);
            if (center?.info?.special === 'goal') win();
            else if (center?.info?.special === 'trap') { lose('ミス！'); dead = true; }
          } else if (eng.entities.length === 0 && gameData.objects.length > 0) {
            win();
          }
        }
      }

      // ── draw ──
      ctx.fillStyle = gameData.tiles[0]?.color || '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const map = engineRef.current.map;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const tileId = map[y]?.[x] ?? 0;
          const info = gameData.tiles[tileId];
          if (tileId !== 0 && info) {
            const img = info.imageUrl ? imgCache.current.get(info.imageUrl) : undefined;
            if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            else { ctx.fillStyle = info.color; ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
            if (!isPlaying) { ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
          }
        }
      }

      // objects (edit: from data, play: from entities)
      if (isPlaying) {
        for (const e of eng.entities) {
          drawSprite({ emoji: e.def.emoji, spriteUrl: e.def.spriteUrl }, e.x, e.y, TILE_SIZE, TILE_SIZE);
          if (e.def.hp > 1) { ctx.fillStyle = 'red'; ctx.fillRect(e.x, e.y - 5, TILE_SIZE * (e.hp / e.def.hp), 3); }
        }
        ctx.fillStyle = 'yellow';
        for (const b of eng.bullets) ctx.fillRect(b.x, b.y, b.w, b.h);
        for (const eb of eng.enemyBullets) {
          ctx.fillStyle = eb.color; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r * 0.5, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        for (const o of gameData.objects) {
          drawSprite({ emoji: o.emoji, spriteUrl: o.spriteUrl }, o.col * TILE_SIZE, o.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = o.hazard ? 'rgba(255,80,80,0.6)' : 'rgba(80,200,255,0.6)';
          ctx.lineWidth = 1.5; ctx.strokeRect(o.col * TILE_SIZE + 1, o.row * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
      }

      // player
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
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(editorTab === 'object' ? 'タップでオブジェクト配置/削除' : 'タップ・ドラッグでマップ編集', canvas.width / 2, canvas.height / 2 - 8);
        ctx.font = '13px sans-serif';
        ctx.fillText('右上の [プレイ] でテスト', canvas.width / 2, canvas.height / 2 + 18);
      }

      eng.animId = requestAnimationFrame(loop);
    };

    const id = requestAnimationFrame(loop);
    engineRef.current.animId = id;
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [gameData, isPlaying, restart, editorTab]);

  // touch state via ref to avoid re-running the loop effect
  const touchRef = useRef({ up: false, down: false, left: false, right: false, action: false });
  const [, force] = useState(0);
  const setTouch = (key: keyof typeof touchRef.current, v: boolean) => { touchRef.current[key] = v; force(n => n + 1); };

  // Canvas tap: paint tile (map tab) or place/remove object (object tab)
  const handleCanvasAction = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPlaying) return;
    let clientX: number, clientY: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
      if (e.cancelable) e.preventDefault();
    } else { const me = e as React.MouseEvent; clientX = me.clientX; clientY = me.clientY; }
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const col = Math.floor(x / TILE_SIZE); const row = Math.floor(y / TILE_SIZE);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    if (editorTab === 'object') {
      setGameData(prev => {
        const existing = prev.objects.find(o => o.col === col && o.row === row);
        const objects = existing
          ? prev.objects.filter(o => o !== existing)
          : [...prev.objects, { ...objTemplate, id: uid(), col, row }];
        return { ...prev, objects };
      });
    } else {
      setGameData(prev => {
        const newMap = prev.map.map(r => [...r]);
        newMap[row][col] = selectedTileId;
        engineRef.current.map = newMap;
        return { ...prev, map: newMap };
      });
    }
  };

  const padProps = (key: keyof typeof touchRef.current) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); setTouch(key, true); },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); setTouch(key, false); },
    onPointerLeave: (e: React.PointerEvent) => { e.preventDefault(); setTouch(key, false); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const applyPick = (res: PickResult) => {
    const target = picker?.target;
    setPicker(null);
    if (!target) return;
    const bgmLike = () => {
      const type = res.ref.startsWith('mml:') ? 'mml' as const : 'youtube' as const;
      const src = type === 'mml' ? (res.rawMml || res.ref.replace(/^mml:/, '')) : res.url;
      return { ref: res.ref, src, type };
    };
    if (target.t === 'player') setGameData(p => ({ ...p, player: { ...p.player, spriteRef: res.ref, spriteUrl: res.url } }));
    else if (target.t === 'objsprite') setObjTemplate(o => ({ ...o, spriteRef: res.ref, spriteUrl: res.url }));
    else if (target.t === 'bgm') setGameData(p => ({ ...p, bgm: bgmLike() }));
    else if (target.t === 'sfx') setGameData(p => ({ ...p, sfx: { ...p.sfx, [target.trigger]: bgmLike() } }));
    else if (target.t === 'tile') setGameData(p => ({ ...p, tiles: { ...p.tiles, [target.id]: { ...p.tiles[target.id], imageRef: res.ref, imageUrl: res.url } } }));
  };

  const addTile = () => {
    setGameData(p => {
      const ids = Object.keys(p.tiles).map(Number);
      const id = Math.max(...ids) + 1;
      return { ...p, tiles: { ...p.tiles, [id]: { name: `タイル${id}`, color: '#888888', passable: false } } };
    });
  };
  const updateTile = (id: number, patch: Partial<TileDef>) =>
    setGameData(p => ({ ...p, tiles: { ...p.tiles, [id]: { ...p.tiles[id], ...patch } } }));
  const deleteTile = (id: number) => {
    if (id === 0) return;
    setGameData(p => {
      const tiles = { ...p.tiles }; delete tiles[id];
      const map = p.map.map(r => r.map(c => (c === id ? 0 : c)));
      return { ...p, tiles, map };
    });
    if (selectedTileId === id) setSelectedTileId(0);
  };

  const buildManifest = (): GameManifestDraft => ({
    preset: gameData.id, engine: gameData.engine, name: title.trim() || gameData.name,
    gravity: gameData.gravity, friction: gameData.friction,
    player: {
      emoji: gameData.player.emoji, color: gameData.player.color, speed: gameData.player.speed,
      jumpPower: gameData.player.jumpPower, w: gameData.player.w, h: gameData.player.h,
      start: gameData.player.start, spriteRef: gameData.player.spriteRef,
    },
    tiles: Object.fromEntries(Object.entries(gameData.tiles).map(([k, t]) => [k, {
      name: t.name, color: t.color, passable: t.passable, special: t.special, imageRef: t.imageRef,
    }])),
    map: gameData.map,
    objects: gameData.objects.map(({ spriteUrl, ...o }) => o),
    bgm: gameData.bgm?.ref || 'none',
    sfx: Object.fromEntries(Object.entries(gameData.sfx).map(([k, v]) => [k, v?.ref])) as Partial<Record<SfxTrigger, string>>,
  });

  const handleSave = () => onSave?.(buildManifest(), { title: title.trim() || gameData.name, preset: gameData.id });

  const tpl = objTemplate;
  const setTpl = (patch: Partial<ObjectDef>) => setObjTemplate(o => ({ ...o, ...patch }));

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
            style={{ aspectRatio: `${PLAY_W}/${PLAY_H}`, maxWidth: PLAY_W + 'px' }}>
            <canvas ref={canvasRef} width={PLAY_W} height={PLAY_H}
              className={`block w-full h-full ${!isPlaying ? 'cursor-crosshair' : ''}`}
              style={{ imageRendering: 'pixelated' }}
              onMouseDown={handleCanvasAction}
              onMouseMove={e => editorTab !== 'object' && (e.buttons & 1) === 1 && handleCanvasAction(e)}
              onTouchStart={handleCanvasAction}
              onTouchMove={e => editorTab !== 'object' && handleCanvasAction(e)} />
          </div>
        </div>

        {/* Sidebar */}
        <div className={`bg-[#0a0a0d] flex flex-col border-t md:border-t-0 md:border-l border-gray-800 ${isPlaying ? 'w-full md:w-auto' : 'flex-1 md:w-80 md:flex-none'}`}>
          {isPlaying ? (
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
              <div className="flex border-b border-gray-800 shrink-0">
                {([['map', 'マップ'], ['object', 'オブジェクト'], ['char', 'キャラ'], ['asset', 'アセット']] as [EditorTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setEditorTab(id)}
                    className={`flex-1 py-2.5 text-[10px] font-bold transition ${editorTab === id ? 'text-blue-400 border-b-2 border-blue-500 bg-[#0f0f11]' : 'text-gray-500'}`}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* ── MAP ── */}
                {editorTab === 'map' && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-gray-500 flex items-center gap-1"><Smartphone size={12} /> 選択して画面をタップ／ドラッグ</p>
                    <div className="space-y-1.5">
                      {Object.entries(gameData.tiles).map(([idStr, tile]) => {
                        const id = Number(idStr);
                        return (
                          <div key={id} className={`rounded-lg border ${selectedTileId === id ? 'border-blue-500 bg-gray-800' : 'border-gray-700 bg-gray-900'}`}>
                            <div className="flex items-center gap-2 p-2">
                              <button onClick={() => setSelectedTileId(id)} className="w-6 h-6 shrink-0 rounded border border-gray-600 overflow-hidden" style={{ backgroundColor: tile.color }}>
                                {tile.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={tile.imageUrl} alt="" className="w-full h-full object-cover" />}
                              </button>
                              <input value={tile.name} onChange={e => updateTile(id, { name: e.target.value })}
                                className="flex-1 min-w-0 bg-transparent text-[11px] text-gray-200 outline-none border-b border-transparent focus:border-gray-600" />
                              <input type="color" value={tile.color} onChange={e => updateTile(id, { color: e.target.value })}
                                className="w-6 h-6 rounded bg-transparent border border-gray-700 cursor-pointer shrink-0" title="色" />
                              {id !== 0 && <button onClick={() => deleteTile(id)} className="text-gray-500 hover:text-red-400 shrink-0"><Trash2 size={13} /></button>}
                            </div>
                            {selectedTileId === id && (
                              <div className="flex items-center gap-3 px-2 pb-2 text-[10px] text-gray-400">
                                <label className="flex items-center gap-1"><input type="checkbox" checked={tile.passable} onChange={e => updateTile(id, { passable: e.target.checked })} className="accent-blue-500" />通行可</label>
                                <select value={tile.special || ''} onChange={e => updateTile(id, { special: e.target.value || undefined })} className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 outline-none">
                                  <option value="">特殊なし</option>
                                  <option value="goal">ゴール</option>
                                  <option value="trap">トラップ</option>
                                  <option value="item">アイテム</option>
                                  <option value="grass">草むら</option>
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={addTile} className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-gray-600 text-[11px] text-gray-400 hover:bg-gray-100/5"><Plus size={13} />タイルを追加</button>
                  </div>
                )}

                {/* ── OBJECT ── */}
                {editorTab === 'object' && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-gray-500 flex items-center gap-1"><Smartphone size={12} /> 下の設定で画面をタップ配置（既存をタップで削除）</p>
                    <div className="rounded-lg border border-gray-700 bg-gray-900 p-2.5 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <input value={tpl.emoji} onChange={e => setTpl({ emoji: e.target.value.slice(0, 2), spriteRef: undefined, spriteUrl: undefined })}
                          className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-1.5 text-center text-lg" />
                        <button onClick={() => setPicker({ mode: 'image', target: { t: 'objsprite' } })} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300"><ImageIcon size={12} />画像参照</button>
                        {tpl.spriteUrl && <button onClick={() => setTpl({ spriteRef: undefined, spriteUrl: undefined })} className="text-gray-500 hover:text-red-400"><Trash2 size={13} /></button>}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px] text-gray-400">種類
                          <select value={tpl.kind} onChange={e => setTpl({ kind: e.target.value as ObjectKind })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                            {Object.entries(OBJECT_KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </label>
                        <label className="text-[10px] text-gray-400">挙動
                          <select value={tpl.behavior} onChange={e => setTpl({ behavior: e.target.value as NpcBehavior })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                            {Object.entries(BEHAVIOR_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </label>
                        <label className="text-[10px] text-gray-400">弾
                          <select value={tpl.bullet} onChange={e => setTpl({ bullet: e.target.value as BulletType })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                            {Object.entries(BULLET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px] text-gray-400 flex justify-between items-center">HP<span className="text-blue-400">{tpl.hp}</span>
                          <input type="range" min={1} max={100} value={tpl.hp} onChange={e => setTpl({ hp: Number(e.target.value) })} className="w-full accent-blue-500" />
                        </label>
                        <label className="text-[10px] text-gray-400 flex justify-between items-center">速さ<span className="text-blue-400">{tpl.speed}</span>
                          <input type="range" min={0} max={5} step={0.5} value={tpl.speed} onChange={e => setTpl({ speed: Number(e.target.value) })} className="w-full accent-blue-500" />
                        </label>
                      </div>
                      {tpl.bullet !== 'none' && (
                        <div className="grid grid-cols-2 gap-2 items-center">
                          <label className="text-[10px] text-gray-400 flex justify-between items-center">発射間隔<span className="text-blue-400">{tpl.fireRate}</span>
                            <input type="range" min={4} max={120} value={tpl.fireRate} onChange={e => setTpl({ fireRate: Number(e.target.value) })} className="w-full accent-blue-500" />
                          </label>
                          <label className="text-[10px] text-gray-400 flex items-center gap-1">弾色<input type="color" value={tpl.bulletColor} onChange={e => setTpl({ bulletColor: e.target.value })} className="w-6 h-6 rounded border border-gray-700 bg-transparent" /></label>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 text-[10px] text-gray-400"><input type="checkbox" checked={tpl.hazard} onChange={e => setTpl({ hazard: e.target.checked })} className="accent-red-500" />接触でミス(敵)</label>
                      </div>
                      {!tpl.hazard && (
                        <input value={tpl.message} onChange={e => setTpl({ message: e.target.value })} placeholder="会話メッセージ(NPC)"
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none" />
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500">配置済み: {gameData.objects.length} 個 {gameData.objects.length > 0 && <button onClick={() => setGameData(p => ({ ...p, objects: [] }))} className="ml-2 text-red-400 hover:underline">全消去</button>}</div>
                  </div>
                )}

                {/* ── CHAR ── */}
                {editorTab === 'char' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">見た目</label>
                      <div className="flex items-center gap-2">
                        <input type="text" value={gameData.player.emoji} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, emoji: e.target.value.slice(0, 2), spriteRef: undefined, spriteUrl: undefined } }))}
                          className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-center text-xl" />
                        <button onClick={() => setPicker({ mode: 'image', target: { t: 'player' } })}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300"><ImageIcon size={13} />画像/歩行グラを参照</button>
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
                      <input type="range" min={1} max={10} step={0.5} value={gameData.player.speed} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, speed: Number(e.target.value) } }))} className="w-full accent-blue-500" />
                    </div>
                    {gameData.engine === 'action' && (
                      <div>
                        <label className="flex justify-between text-[11px] text-gray-400 mb-1"><span>ジャンプ力</span><span className="text-blue-400">{gameData.player.jumpPower}</span></label>
                        <input type="range" min={-20} max={-5} step={1} value={gameData.player.jumpPower} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, jumpPower: Number(e.target.value) } }))} className="w-full accent-blue-500" />
                      </div>
                    )}
                  </div>
                )}

                {/* ── ASSET ── */}
                {editorTab === 'asset' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">タイトル</label>
                      <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200" />
                    </div>

                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1 items-center gap-1"><Music size={12} />BGM</label>
                      <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'bgm' } })}
                        className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300">
                        <span className="truncate">{gameData.bgm ? refLabel(gameData.bgm.ref) : 'BGMを選択（YouTube / MML投稿 / 直接）'}</span>
                        <Music size={13} className="shrink-0 ml-1" />
                      </button>
                      {gameData.bgm && <div className="mt-1 flex items-center gap-2"> <button onClick={() => previewMmlAsset('bgm', gameData.bgm)} className="text-[10px] text-emerald-300 hover:text-emerald-200">試聴</button> <button onClick={() => setGameData(p => ({ ...p, bgm: undefined }))} className="text-[10px] text-gray-500 hover:text-red-400 flex items-center gap-1"><Trash2 size={11} />外す</button></div>}
                    </div>

                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1"><Volume2 size={12} />効果音(SE)</label>
                      <div className="space-y-1.5">
                        {(Object.keys(SFX_LABELS) as SfxTrigger[]).map(trig => (
                          <div key={trig} className="flex items-center gap-2 bg-gray-900 rounded-lg px-2 py-1.5 border border-gray-800">
                            <span className="text-[10px] text-gray-400 w-16 shrink-0">{SFX_LABELS[trig]}</span>
                            <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'sfx', trigger: trig } })} className="flex-1 min-w-0 text-left text-[10px] text-gray-300 truncate">{gameData.sfx[trig] ? refLabel(gameData.sfx[trig]!.ref) : '未設定'}</button>
                            {gameData.sfx[trig] && <button onClick={() => previewMmlAsset(`sfx-${trig}`, gameData.sfx[trig])} className="text-[10px] text-emerald-300 hover:text-emerald-200 shrink-0">試聴</button>}
                            {gameData.sfx[trig] && <button onClick={() => setGameData(p => { const s = { ...p.sfx }; delete s[trig]; return { ...p, sfx: s }; })} className="text-gray-500 hover:text-red-400 shrink-0"><Trash2 size={12} /></button>}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1.5">SEはMML推奨（即時再生）。YouTube参照はBGM向け。</p>
                    </div>

                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1"><ImageIcon size={12} />タイル画像（任意・参照のみ）</label>
                      <div className="space-y-1.5">
                        {Object.entries(gameData.tiles).filter(([id]) => Number(id) !== 0).map(([id, tile]) => (
                          <div key={id} className="flex items-center gap-2 bg-gray-900 rounded-lg px-2 py-1.5 border border-gray-800">
                            <div className="w-6 h-6 shrink-0 rounded border border-gray-600 overflow-hidden" style={{ backgroundColor: tile.color }}>
                              {tile.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={tile.imageUrl} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <span className="text-[10px] text-gray-400 flex-1 truncate">{tile.name}</span>
                            {tile.imageRef && <button onClick={() => setGameData(p => ({ ...p, tiles: { ...p.tiles, [id]: { ...p.tiles[Number(id)], imageRef: undefined, imageUrl: undefined } } }))} className="text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>}
                            <button onClick={() => setPicker({ mode: 'image', target: { t: 'tile', id: Number(id) } })} className="text-[10px] text-blue-400 hover:text-blue-300 shrink-0">参照</button>
                          </div>
                        ))}
                      </div>
                      <button onClick={addTile} className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-gray-600 text-[11px] text-gray-400 hover:bg-gray-100/5"> <Plus size={13} />タイル定義を増やす</button>
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
        <ContentPicker mode={picker.mode} userId={userId} onPick={applyPick} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}
