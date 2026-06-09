'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Play, Pause } from 'lucide-react';

const MIDI_URL = 'https://res.cloudinary.com/dbld5kqtz/video/upload/q_auto/f_auto/v1780957949/91562_iris-out-fix_iq3fjx.midi';

const TILE = 16;
const SCALE = 2;
const TS = TILE * SCALE;
const COLS = 32;
const ROWS = 24;
const CANVAS_W = 480;
const CANVAS_H = 384;
const MOVE_SPEED = 2.5;

const T_GRASS = 0;
const T_WALL = 1;
const T_WATER = 2;
const T_PATH = 3;
const T_TREE = 4;
const T_SAND = 5;
const T_BRIDGE = 6;

function generateMap() {
  const map: number[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const row: number[] = [];
    for (let x = 0; x < COLS; x++) {
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) {
        row.push(T_WALL);
      } else if (x >= 12 && x <= 17 && y >= 6 && y <= 12) {
        row.push(T_WATER);
      } else if (x >= 13 && x <= 16 && y >= 8 && y <= 10) {
        row.push(T_BRIDGE);
      } else if ((x === 5 || x === 25) && y >= 4 && y <= 8) {
        row.push(T_TREE);
      } else if (x % 6 === 0 && y % 5 === 0) {
        row.push(T_TREE);
      } else if (x >= 20 && x <= 28 && y >= 16 && y <= 20) {
        row.push(T_SAND);
      } else if ((x + y) % 8 === 0) {
        row.push(T_PATH);
      } else {
        row.push(T_GRASS);
      }
    }
    map.push(row);
  }
  return map;
}

const TILE_COLORS: Record<number, string> = {
  [T_GRASS]: '#2d5a27',
  [T_WALL]: '#4a4a4a',
  [T_WATER]: '#1a3a6a',
  [T_PATH]: '#6b5a3a',
  [T_TREE]: '#1a3a1a',
  [T_SAND]: '#8a7a4a',
  [T_BRIDGE]: '#5a4a2a',
};

interface GamePlayerProps {
  onClose: () => void;
  onPostScore?: (score: number) => void;
}

export default function GamePlayer({ onClose, onPostScore }: GamePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef(generateMap());
  const playerRef = useRef({ x: 3 * TS + TS / 2, y: 3 * TS + TS / 2, dir: 'down', frame: 0 });
  const cameraRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef(new Set<string>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const [posText, setPosText] = useState('X:104 Y:104');
  const bgmStartedRef = useRef(false);
  const lastPosRef = useRef('');
  const animIdRef = useRef(0);
  const loopRunningRef = useRef(false);

  useEffect(() => {
    const audio = new Audio(MIDI_URL);
    audio.loop = true;
    audio.volume = 0.25;
    audioRef.current = audio;
    const startBGM = () => {
      if (!bgmStartedRef.current) {
        bgmStartedRef.current = true;
        audio.play().then(() => setBgmPlaying(true)).catch(() => {});
      }
    };
    document.addEventListener('click', startBGM, { once: true });
    document.addEventListener('touchstart', startBGM, { once: true });
    return () => {
      audio.pause();
      audio.src = '';
      document.removeEventListener('click', startBGM);
      document.removeEventListener('touchstart', startBGM);
    };
  }, []);

  const toggleBGM = () => {
    const a = audioRef.current;
    if (!a) return;
    if (bgmPlaying) {
      a.pause();
      setBgmPlaying(false);
    } else {
      a.play().then(() => setBgmPlaying(true)).catch(() => {});
    }
  };

  const dpadDown = (key: string) => keysRef.current.add(key);
  const dpadUp = (key: string) => keysRef.current.delete(key);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    loopRunningRef.current = true;

    const loop = () => {
      if (!loopRunningRef.current) return;

      const keys = keysRef.current;
      let dx = 0, dy = 0;
      if (keys.has('ArrowLeft') || keys.has('a')) dx = -1;
      if (keys.has('ArrowRight') || keys.has('d')) dx = 1;
      if (keys.has('ArrowUp') || keys.has('w')) dy = -1;
      if (keys.has('ArrowDown') || keys.has('s')) dy = 1;

      const p = playerRef.current;
      if (dx || dy) {
        if (dx && dy) { dx *= 0.707; dy *= 0.707; }
        const nx = p.x + dx * MOVE_SPEED;
        const ny = p.y + dy * MOVE_SPEED;
        const col = Math.floor(nx / TS);
        const row = Math.floor(ny / TS);
        const map = mapRef.current;
        if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
          const t = map[row][col];
          if (t !== T_WALL && t !== T_TREE && t !== T_WATER) {
            p.x = nx;
            p.y = ny;
          } else if (t === T_WATER) {
            const tc = Math.floor(p.x / TS);
            const tr = Math.floor(p.y / TS);
            if (tc >= 0 && tc < COLS && tr >= 0 && tr < ROWS && map[tr][tc] === T_BRIDGE) {
              p.x = nx;
              p.y = ny;
            }
          }
        }
        if (dx > 0) p.dir = 'right';
        else if (dx < 0) p.dir = 'left';
        if (dy > 0) p.dir = 'down';
        else if (dy < 0) p.dir = 'up';
        p.frame = (p.frame + 0.12) % 3;
      } else {
        p.frame = 0;
      }

      const cam = cameraRef.current;
      cam.x = p.x * SCALE - CANVAS_W / 2;
      cam.y = p.y * SCALE - CANVAS_H / 2;

      const pos = `X:${Math.floor(p.x)} Y:${Math.floor(p.y)}`;
      if (pos !== lastPosRef.current) {
        lastPosRef.current = pos;
        setPosText(pos);
      }

      ctx.fillStyle = '#0a0d12';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const startTX = Math.floor(cam.x / TS);
      const startTY = Math.floor(cam.y / TS);
      const endTX = startTX + Math.ceil(CANVAS_W / TS) + 2;
      const endTY = startTY + Math.ceil(CANVAS_H / TS) + 2;

      for (let row = startTY; row <= endTY; row++) {
        for (let col = startTX; col <= endTX; col++) {
          if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
          const t = mapRef.current[row][col];
          const sx = col * TS - cam.x;
          const sy = row * TS - cam.y;

          ctx.fillStyle = TILE_COLORS[t] || '#2d5a27';
          ctx.fillRect(sx, sy, TS, TS);

          if (t === T_TREE) {
            ctx.fillStyle = '#0f2f0f';
            ctx.beginPath();
            ctx.arc(sx + TS / 2, sy + TS / 2, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1a4a1a';
            ctx.beginPath();
            ctx.arc(sx + TS / 2, sy + TS / 2 - 2, 8, 0, Math.PI * 2);
            ctx.fill();
          } else if (t === T_WATER) {
            ctx.fillStyle = 'rgba(100,180,255,0.08)';
            const wave = Math.sin((col * 2 + row * 3 + Date.now() / 800) % (Math.PI * 2)) * 0.5 + 0.5;
            ctx.fillRect(sx, sy + wave * 2, TS, 2);
          } else if (t === T_BRIDGE) {
            ctx.fillStyle = '#5a4a2a';
            ctx.fillRect(sx, sy + TS / 2 - 2, TS, 4);
            ctx.fillStyle = '#6b5a3a';
            ctx.fillRect(sx + 2, sy + 2, 4, TS - 4);
            ctx.fillRect(sx + TS - 6, sy + 2, 4, TS - 4);
          }

          if ((col + row) % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.fillRect(sx, sy, TS, TS);
          }
        }
      }

      const px = p.x * SCALE - cam.x;
      const py = p.y * SCALE - cam.y;

      ctx.save();
      ctx.shadowColor = 'rgba(163,230,53,0.2)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#84cc16';
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#65a30d';
      ctx.beginPath();
      ctx.arc(px - 4, py - 3, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 4, py - 3, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#4a7a0a';
      const dirAngles: Record<string, number> = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 };
      const da = dirAngles[p.dir] || 0;
      ctx.beginPath();
      ctx.arc(px + Math.cos(da) * 7, py + Math.sin(da) * 7, 3, 0, Math.PI * 2);
      ctx.fill();

      animIdRef.current = requestAnimationFrame(loop);
    };

    loop();
    return () => {
      loopRunningRef.current = false;
      cancelAnimationFrame(animIdRef.current);
    };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keysRef.current.add(e.key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    return () => { document.removeEventListener('keydown', down); document.removeEventListener('keyup', up); };
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#07080b]">
      <div className="flex items-center justify-between px-3 py-2.5 bg-[#0f0f11] border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100/10 rounded-full">
            <X size={18} />
          </button>
          <div>
            <h2 className="font-bold text-xs text-white">onj-reze</h2>
            <p className="text-[10px] text-gray-500">gomi-like</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-500">{posText}</span>
          <button
            onClick={toggleBGM}
            className={`p-1.5 rounded-full transition-colors ${bgmPlaying ? 'text-green-400 hover:bg-green-400/10' : 'text-gray-500 hover:bg-gray-100/10'}`}
            title={bgmPlaying ? 'BGM停止' : 'BGM再生'}
          >
            {bgmPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center bg-[#07080b] p-2">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="border border-gray-800 max-w-full"
          style={{ imageRendering: 'pixelated', width: '100%', height: 'auto', maxWidth: CANVAS_W + 'px', aspectRatio: '480/384' }}
        />
      </div>

      <div className="bg-[#0f0f11] border-t border-gray-900 p-3 shrink-0">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div className="grid grid-cols-3 gap-1.5">
            <div />
            <button
              onTouchStart={(e) => { e.preventDefault(); dpadDown('ArrowUp'); }}
              onTouchEnd={(e) => { e.preventDefault(); dpadUp('ArrowUp'); }}
              onTouchCancel={() => dpadUp('ArrowUp')}
              onMouseDown={() => dpadDown('ArrowUp')}
              onMouseUp={() => dpadUp('ArrowUp')}
              onMouseLeave={() => dpadUp('ArrowUp')}
              className="w-10 h-10 bg-gray-100/10 rounded-lg border border-gray-800 flex items-center justify-center text-white text-xs active:bg-gray-100/20 select-none"
            >
              ▲
            </button>
            <div />
            <button
              onTouchStart={(e) => { e.preventDefault(); dpadDown('ArrowLeft'); }}
              onTouchEnd={(e) => { e.preventDefault(); dpadUp('ArrowLeft'); }}
              onTouchCancel={() => dpadUp('ArrowLeft')}
              onMouseDown={() => dpadDown('ArrowLeft')}
              onMouseUp={() => dpadUp('ArrowLeft')}
              onMouseLeave={() => dpadUp('ArrowLeft')}
              className="w-10 h-10 bg-gray-100/10 rounded-lg border border-gray-800 flex items-center justify-center text-white text-xs active:bg-gray-100/20 select-none"
            >
              ◀
            </button>
            <button
              onTouchStart={(e) => { e.preventDefault(); dpadDown('ArrowDown'); }}
              onTouchEnd={(e) => { e.preventDefault(); dpadUp('ArrowDown'); }}
              onTouchCancel={() => dpadUp('ArrowDown')}
              onMouseDown={() => dpadDown('ArrowDown')}
              onMouseUp={() => dpadUp('ArrowDown')}
              onMouseLeave={() => dpadUp('ArrowDown')}
              className="w-10 h-10 bg-gray-100/10 rounded-lg border border-gray-800 flex items-center justify-center text-white text-xs active:bg-gray-100/20 select-none"
            >
              ▼
            </button>
            <button
              onTouchStart={(e) => { e.preventDefault(); dpadDown('ArrowRight'); }}
              onTouchEnd={(e) => { e.preventDefault(); dpadUp('ArrowRight'); }}
              onTouchCancel={() => dpadUp('ArrowRight')}
              onMouseDown={() => dpadDown('ArrowRight')}
              onMouseUp={() => dpadUp('ArrowRight')}
              onMouseLeave={() => dpadUp('ArrowRight')}
              className="w-10 h-10 bg-gray-100/10 rounded-lg border border-gray-800 flex items-center justify-center text-white text-xs active:bg-gray-100/20 select-none"
            >
              ▶
            </button>
          </div>
          <span className="text-[10px] text-gray-600 select-none">矢印キー / WASD でも操作可</span>
        </div>
      </div>
    </div>
  );
}
