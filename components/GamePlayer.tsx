'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause } from 'lucide-react';
import { EngineRunner } from '@/lib/EngineRunner';
import { MockAssetProvider } from '@/lib/AssetProvider';
import { GAME_PRESETS, findPreset } from '@/lib/game-presets';
import type { GameManifest } from '@/lib/game-config';

interface GamePlayerProps {
  onClose: () => void;
  onPostScore?: (score: number) => void;
}

export default function GamePlayer({ onClose, onPostScore }: GamePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<EngineRunner | null>(null);
  const assetsRef = useRef<MockAssetProvider | null>(null);
  const [manifest, setManifest] = useState<GameManifest>(GAME_PRESETS[0]);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const [presetIndex, setPresetIndex] = useState(0);

  const loadGame = useCallback(async (m: GameManifest) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!runnerRef.current) {
      runnerRef.current = new EngineRunner();
      runnerRef.current.setCanvas(canvas);
    }
    if (!assetsRef.current) {
      assetsRef.current = new MockAssetProvider();
    }

    await runnerRef.current.load(m, assetsRef.current);
    setBgmPlaying(!!m.assets.bgm);
    setManifest(m);
  }, []);

  useEffect(() => {
    loadGame(GAME_PRESETS[0]);
    return () => {
      if (runnerRef.current) runnerRef.current.unload();
      if (assetsRef.current) assetsRef.current.destroy();
    };
  }, [loadGame]);

  const toggleBGM = () => {
    setBgmPlaying(prev => { const next = !prev; return next; });
  };

  const switchPreset = (index: number) => {
    const m = GAME_PRESETS[index];
    if (m) { setPresetIndex(index); loadGame(m); }
  };

  const dpadDown = (key: string) => {
    const r = runnerRef.current;
    if (!r) return;
    const map: Record<string, { prop: 'left' | 'right' | 'up' | 'down'; on: boolean }> = {
      ArrowLeft: { prop: 'left', on: true },
      ArrowRight: { prop: 'right', on: true },
      ArrowUp: { prop: 'up', on: true },
      ArrowDown: { prop: 'down', on: true },
      a: { prop: 'left', on: true },
      d: { prop: 'right', on: true },
      w: { prop: 'up', on: true },
      s: { prop: 'down', on: true },
      ' ': { prop: 'action1', on: true },
    };
    const m = map[key];
    if (m) r.setInput({ [m.prop]: true });
  };
  const dpadUp = (key: string) => {
    const r = runnerRef.current;
    if (!r) return;
    const map: Record<string, 'left' | 'right' | 'up' | 'down' | 'action1'> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down', ' ': 'action1',
    };
    const prop = map[key];
    if (prop) r.setInput({ [prop]: false });
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      dpadDown(e.key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd'].includes(e.key)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      dpadUp(e.key);
    };
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
            <h2 className="font-bold text-xs text-white">{manifest.name}</h2>
            <p className="text-[10px] text-gray-500">{manifest.genre}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {GAME_PRESETS.map((p, i) => (
              <button key={p.id}
                onClick={() => switchPreset(i)}
                className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${presetIndex === i ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500'}`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            onClick={toggleBGM}
            className={`p-1.5 rounded-full transition-colors ${bgmPlaying ? 'text-green-400 hover:bg-green-400/10' : 'text-gray-500 hover:bg-gray-100/10'}`}
          >
            {bgmPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-[#07080b] p-2 min-h-0">
        <canvas
          ref={canvasRef}
          width={480}
          height={384}
          className="border border-gray-800 max-w-full max-h-full"
          style={{ imageRendering: 'pixelated', width: '100%', height: 'auto', maxWidth: '480px', aspectRatio: '480/384' }}
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
          <span className="text-[10px] text-gray-600 select-none">矢印/WASD/スペース</span>
        </div>
      </div>
    </div>
  );
}
