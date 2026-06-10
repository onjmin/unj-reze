'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Music, Code, Smartphone } from 'lucide-react';
import { bgmManager } from '@/lib/BgmManager';

const TILE_SIZE = 32;
const COLS = 20;
const ROWS = 15;

type PresetId = 'action' | 'rpg' | 'touhou';
type EditorTab = 'map' | 'char' | 'bgm';

interface TileDef { name: string; color: string; passable: boolean; special?: string; }

interface PresetData {
  id: PresetId; name: string; gravity: number; friction: number;
  player: { emoji: string; color: string; speed: number; jumpPower: number; w: number; h: number; start: { x: number; y: number } };
  tiles: Record<number, TileDef>;
  map: number[][];
}

const PRESETS: Record<PresetId, PresetData> = {
  action: {
    id: 'action', name: 'アクション', gravity: 0.6, friction: 0.8,
    player: { emoji: '🍄', color: '#ff4444', speed: 4, jumpPower: -12, w: 24, h: 24, start: { x: 50, y: 50 } },
    tiles: {
      0: { name: '空', color: '#87CEEB', passable: true },
      1: { name: 'ブロック', color: '#8B4513', passable: false },
      2: { name: 'ハテナ', color: '#FFD700', passable: false, special: 'item' },
      3: { name: 'ゴール', color: '#32CD32', passable: true, special: 'goal' },
    },
    map: Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) =>
        y > ROWS - 3 ? 1 : y === ROWS - 5 && x > 5 && x < 10 ? 1 : x === 18 && y === ROWS - 4 ? 3 : 0
      )
    ),
  },
  rpg: {
    id: 'rpg', name: 'RPG', gravity: 0, friction: 0,
    player: { emoji: '🗡️', color: '#4444ff', speed: 3, jumpPower: 0, w: 24, h: 24, start: { x: TILE_SIZE * 2, y: TILE_SIZE * 2 } },
    tiles: {
      0: { name: '平地', color: '#90EE90', passable: true },
      1: { name: '壁/木', color: '#228B22', passable: false },
      2: { name: '水', color: '#4169E1', passable: false },
      3: { name: '城', color: '#A9A9A9', passable: true, special: 'goal' },
    },
    map: Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) =>
        x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1 ? 1 : x === 10 && y > 5 ? 2 : x === 15 && y === 5 ? 3 : 0
      )
    ),
  },
  touhou: {
    id: 'touhou', name: '弾幕STG', gravity: 0, friction: 0,
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

interface GameMakerProps { onClose: () => void; }

export default function GameMaker({ onClose }: GameMakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presetId, setPresetId] = useState<PresetId>('action');
  const [gameData, setGameData] = useState<PresetData>(() => JSON.parse(JSON.stringify(PRESETS.action)));
  const [isPlaying, setIsPlaying] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('map');
  const [selectedTileId, setSelectedTileId] = useState(1);
  const [bgmSettings, setBgmSettings] = useState({ type: 'none' as 'none' | 'youtube' | 'mml', url: '', mml: 'C E G C5' });
  const [touchInputs, setTouchInputs] = useState({ up: false, down: false, left: false, right: false, action: false });
  const [inputReady, setInputReady] = useState(false);

  const engineRef = useRef<GameEngine>({
    map: [], player: { x: 50, y: 50, vx: 0, vy: 0, isGrounded: false },
    keys: new Set(), bullets: [], enemyBullets: [], enemies: [], shotTimer: 0, animId: 0,
  });

  const resetGame = useCallback((id: PresetId) => {
    const data = PRESETS[id];
    setPresetId(id);
    setGameData(JSON.parse(JSON.stringify(data)));
    const eng = engineRef.current;
    eng.player = { ...data.player.start, vx: 0, vy: 0, isGrounded: false };
    eng.keys.clear();
    eng.bullets = []; eng.enemyBullets = []; eng.enemies = [];
    eng.map = JSON.parse(JSON.stringify(data.map));
    setTouchInputs({ up: false, down: false, left: false, right: false, action: false });
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    resetGame('action');
    const firstTouch = () => { setInputReady(true); window.removeEventListener('touchstart', firstTouch); };
    window.addEventListener('touchstart', firstTouch);
    return () => window.removeEventListener('touchstart', firstTouch);
  }, [resetGame]);

  // BGM
  useEffect(() => {
    if (isPlaying && gameData) {
      if (bgmSettings.type === 'youtube' && bgmSettings.url) {
        bgmManager.play({
          bgm: { type: 'youtube', src: bgmSettings.url },
          tileset: {},
        } as any);
      } else if (bgmSettings.type === 'mml') {
        bgmManager.play({
          bgm: { type: 'mml', src: bgmSettings.mml },
          tileset: {},
        } as any);
      } else {
        bgmManager.stop();
      }
    } else {
      bgmManager.stop();
    }
    return () => bgmManager.stop();
  }, [isPlaying, bgmSettings, gameData]);

  // Init map + enemies when play state changes
  useEffect(() => {
    const eng = engineRef.current;
    if (isPlaying) {
      eng.bullets = []; eng.enemyBullets = []; eng.enemies = [];
      const workingMap = JSON.parse(JSON.stringify(gameData.map));
      if (gameData.id === 'touhou') {
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
        if (gameData.id === 'action') {
          if (isLeft) p.vx -= 1;
          if (isRight) p.vx += 1;
          p.vx *= gameData.friction; p.vy += gameData.gravity;
          if (isAction && p.isGrounded) { p.vy = gameData.player.jumpPower; p.isGrounded = false; }

          p.x += p.vx;
          let hits = [getTile(p.x + 2, p.y + 2), getTile(p.x + pData.w - 2, p.y + 2),
            getTile(p.x + 2, p.y + pData.h - 2), getTile(p.x + pData.w - 2, p.y + pData.h - 2)]
            .filter(t => t && !t.info.passable);
          if (hits.length) {
            if (p.vx > 0) p.x = hits[0].rect.x - pData.w;
            else if (p.vx < 0) p.x = hits[0].rect.x + TILE_SIZE;
            p.vx = 0;
          }

          p.y += p.vy; p.isGrounded = false;
          hits = [getTile(p.x + 2, p.y + 2), getTile(p.x + pData.w - 2, p.y + 2),
            getTile(p.x + 2, p.y + pData.h), getTile(p.x + pData.w - 2, p.y + pData.h)]
            .filter(t => t && !t.info.passable);
          if (hits.length) {
            if (p.vy > 0) { p.y = hits[0].rect.y - pData.h; p.isGrounded = true; }
            else if (p.vy < 0) p.y = hits[0].rect.y + TILE_SIZE;
            p.vy = 0;
          }
          if (p.y > ROWS * TILE_SIZE) resetGame(presetId);

        } else if (gameData.id === 'rpg') {
          let nx = p.x, ny = p.y;
          if (isLeft) nx -= pData.speed; if (isRight) nx += pData.speed;
          if (isUp) ny -= pData.speed; if (isDown) ny += pData.speed;
          let t1 = getTile(nx, p.y), t2 = getTile(nx + pData.w - 1, p.y + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable) p.x = nx;
          t1 = getTile(p.x, ny); t2 = getTile(p.x + pData.w - 1, ny + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable) p.y = ny;

        } else if (gameData.id === 'touhou') {
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

        if (gameData.id !== 'touhou') {
          const center = getTile(p.x + pData.w / 2, p.y + pData.h / 2);
          if (center?.info?.special === 'goal') setTimeout(() => { alert('クリア！'); setIsPlaying(false); }, 10);
        }
      }

      // Draw
      ctx.fillStyle = gameData.tiles[0].color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const map = engineRef.current.map;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const tileId = map[y]?.[x] ?? 0;
          if (tileId !== 0 && gameData.tiles[tileId]) {
            ctx.fillStyle = gameData.tiles[tileId].color;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            if (!isPlaying) { ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
          }
        }
      }

      if (gameData.id === 'touhou' && isPlaying) {
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

      ctx.fillStyle = gameData.player.color;
      if (gameData.id !== 'touhou') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(p.x + pData.w / 2, p.y + pData.h, pData.w / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.font = `${pData.w}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(pData.emoji, p.x + pData.w / 2, p.y + pData.h + 4);

      if (gameData.id === 'touhou' && isPlaying) {
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
  }, [gameData, isPlaying, presetId, resetGame, touchInputs]);

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

  const togglePlay = () => {
    setIsPlaying(p => !p);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#07080b] text-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f0f11] border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100/10 rounded-full"><X size={16} /></button>
          <span className="text-xs font-bold text-white">Game Maker</span>
          <select value={presetId} onChange={e => resetGame(e.target.value as PresetId)}
            className="ml-1 bg-gray-700 text-xs text-white border-none rounded py-1 px-2 outline-none cursor-pointer font-bold appearance-none">
            <option value="action">アクション</option>
            <option value="rpg">RPG</option>
            <option value="touhou">弾幕STG</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => resetGame(presetId)} className="p-2 text-gray-400 hover:text-white rounded-full bg-gray-700/50" title="初期化"><RotateCcw size={16} /></button>
          <button onClick={togglePlay}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold ${isPlaying ? 'bg-yellow-500 text-yellow-900' : 'bg-green-500 text-green-900'}`}>
            {isPlaying ? <><Pause size={14} /><span className="hidden sm:inline">エディット</span></> : <><Play size={14} /><span className="hidden sm:inline">プレイ</span></>}
          </button>
        </div>
      </div>

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
        <div className={`bg-[#0a0a0d] flex flex-col border-t md:border-t-0 md:border-l border-gray-800 ${isPlaying ? 'w-full md:w-auto' : 'flex-1 md:w-72 md:flex-none'}`}>
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
                {(gameData.id === 'action' || gameData.id === 'touhou') && (
                  <button className="w-16 h-16 rounded-full border-b-4 border-gray-800 active:border-b-0 active:translate-y-1 shadow-lg text-white font-bold text-xs bg-blue-600 active:bg-blue-500 touch-none cursor-pointer select-none"
                    {...padProps('action')}>
                    {gameData.id === 'touhou' ? 'SHOT' : 'JUMP'}
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
                  ['bgm', '音'],
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
                    <p className="text-[10px] text-gray-500 flex items-center gap-1"><Smartphone size={12} /> 選択して画面をタップ</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(gameData.tiles).map(([id, tile]) => (
                        <button key={id} onClick={() => setSelectedTileId(Number(id))}
                          className={`flex items-center gap-2 p-2 rounded border-2 transition ${selectedTileId === Number(id) ? 'border-blue-500 bg-gray-800' : 'border-gray-700 bg-gray-900'}`}>
                          <div className="w-5 h-5 shrink-0 rounded border border-gray-600" style={{ backgroundColor: tile.color }} />
                          <span className="text-[10px] truncate">{tile.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {editorTab === 'char' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">見た目 (絵文字)</label>
                      <input type="text" value={gameData.player.emoji} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, emoji: e.target.value.slice(0, 2) } }))}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-center text-xl" />
                    </div>
                    <div>
                      <label className="flex justify-between text-[11px] text-gray-400 mb-1"><span>移動速度</span><span className="text-blue-400">{gameData.player.speed}</span></label>
                      <input type="range" min={1} max={10} step={0.5} value={gameData.player.speed}
                        onChange={e => setGameData(p => ({ ...p, player: { ...p.player, speed: Number(e.target.value) } }))}
                        className="w-full accent-blue-500" />
                    </div>
                    {presetId === 'action' && (
                      <div>
                        <label className="flex justify-between text-[11px] text-gray-400 mb-1"><span>ジャンプ力</span><span className="text-blue-400">{gameData.player.jumpPower}</span></label>
                        <input type="range" min={-20} max={-5} step={1} value={gameData.player.jumpPower}
                          onChange={e => setGameData(p => ({ ...p, player: { ...p.player, jumpPower: Number(e.target.value) } }))}
                          className="w-full accent-blue-500" />
                      </div>
                    )}
                  </div>
                )}

                {editorTab === 'bgm' && (
                  <div className="space-y-3">
                    <div className="flex bg-gray-900 rounded-lg p-1 gap-1">
                      {(['none', 'youtube', 'mml'] as const).map(type => (
                        <button key={type} onClick={() => setBgmSettings(s => ({ ...s, type }))}
                          className={`flex-1 py-1.5 text-[10px] rounded transition capitalize ${bgmSettings.type === type ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
                          {type === 'none' ? 'なし' : type === 'youtube' ? 'YouTube' : 'MML'}
                        </button>
                      ))}
                    </div>
                    {bgmSettings.type === 'youtube' && (
                      <div className="p-2 bg-gray-900 rounded border border-gray-700">
                        <label className="block text-[10px] text-gray-400 mb-1">YouTube URL</label>
                        <input type="text" placeholder="https://..." value={bgmSettings.url}
                          onChange={e => setBgmSettings(s => ({ ...s, url: e.target.value }))}
                          className="w-full bg-black border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300" />
                      </div>
                    )}
                    {bgmSettings.type === 'mml' && (
                      <div className="p-2 bg-gray-900 rounded border border-gray-700">
                        <label className="block text-[10px] text-gray-400 mb-1">簡易MML</label>
                        <textarea value={bgmSettings.mml} onChange={e => setBgmSettings(s => ({ ...s, mml: e.target.value }))}
                          className="w-full bg-black border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 h-16 font-mono resize-none"
                          placeholder="C D E F G A B" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
