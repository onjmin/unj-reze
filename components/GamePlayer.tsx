'use client';

import { useState, useEffect, useRef } from 'react';
import { X, PlaySquare, Repeat } from 'lucide-react';
import { Obstacle } from '@/lib/types';

interface GamePlayerProps {
  onClose: () => void;
  onPostScore: (score: number) => void;
}

export default function GamePlayer({ onClose, onPostScore }: GamePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const stateRef = useRef({
    playerY: 120,
    targetY: 120,
    obstacles: [] as Obstacle[],
    frame: 0,
    speed: 3,
    audioContext: null as AudioContext | null
  });

  const playBip = (freq: number, duration: number) => {
    try {
      if (!stateRef.current.audioContext) {
        stateRef.current.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = stateRef.current.audioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) { }
  };

  const handleControl = (dir: 'up' | 'down') => {
    const step = 45;
    if (dir === 'up') {
      stateRef.current.targetY = Math.max(30, stateRef.current.targetY - step);
      playBip(587, 0.08);
    } else {
      stateRef.current.targetY = Math.min(220, stateRef.current.targetY + step);
      playBip(494, 0.08);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frameId: number;

    const gameLoop = () => {
      ctx.fillStyle = '#0f111a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#a3e63515';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }

      if (isPlaying && !gameOver) {
        const state = stateRef.current;
        state.frame++;

        state.playerY += (state.targetY - state.playerY) * 0.25;

        if (state.frame % 70 === 0) {
          state.obstacles.push({
            x: canvas.width,
            y: Math.random() * (canvas.height - 50) + 20,
            size: 15
          });
        }

        state.obstacles.forEach((obs) => {
          obs.x -= state.speed;

          const dist = Math.hypot(obs.x - 60, obs.y - state.playerY);
          if (dist < obs.size + 12) {
            setGameOver(true);
            setIsPlaying(false);
            playBip(180, 0.4);
          }

          if (obs.x < 60 && !obs.passed) {
            obs.passed = true;
            setScore(s => s + 100);
            playBip(880, 0.05);
          }
        });

        state.obstacles = state.obstacles.filter(o => o.x > -30);
      }

      const state = stateRef.current;
      state.obstacles.forEach(o => {
        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(o.x - 3, o.y - 3, 6, 6);
      });

      ctx.fillStyle = '#a3e635';
      ctx.beginPath();
      ctx.arc(60, state.playerY, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#15803d';
      ctx.ellipse(56, state.playerY - 10, 5, 9, -Math.PI / 4, 0, Math.PI * 2);
      ctx.ellipse(64, state.playerY - 10, 5, 9, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      frameId = requestAnimationFrame(gameLoop);
    };

    gameLoop();
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, gameOver]);

  return (
    <div className="absolute inset-0 bg-[#07080b] z-50 flex flex-col justify-between">
      <div className="flex items-center justify-between px-3.5 py-3 bg-[#0f0f11] border-b border-gray-800 shrink-0">
        <div className="flex items-center">
          <button onClick={onClose} className="mr-3 p-1.5 text-gray-400 hover:bg-gray-100/10 rounded-full">
            <X size={20} />
          </button>
          <div>
            <h2 className="font-bold text-xs leading-tight text-white">さとるのちんぽ escape</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">kusaサンドボックス実行コンテキスト</p>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <canvas ref={canvasRef} width={340} height={260} className="max-w-full bg-[#111319] border-y border-gray-800" />

        <div className="absolute top-2 left-4 text-xs font-bold font-mono text-gray-400">
          SCORE: {score}
        </div>

        {!isPlaying && !gameOver && (
          <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center text-center">
            <button
              onClick={() => { setIsPlaying(true); setGameOver(false); setScore(0); stateRef.current.obstacles = []; }}
              className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
            >
              <PlaySquare size={24} className="text-white ml-0.5" />
            </button>
            <span className="text-xs font-bold tracking-wider text-gray-300 mt-2">TAP TO PLAY</span>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-center p-4 z-10">
            <span className="text-red-500 font-bold text-base tracking-widest mb-1 animate-bounce">GAME OVER</span>
            <p className="text-gray-300 text-xs mb-4">スコア: {score}</p>
            <div className="flex flex-col space-y-2 w-44">
              <button onClick={() => { setIsPlaying(true); setGameOver(false); setScore(0); stateRef.current.obstacles = []; }} className="bg-blue-600 py-1.5 rounded-lg text-xs font-bold text-white">リトライ</button>
              <button onClick={() => onPostScore(score)} className="bg-[#a3e635] py-1.5 rounded-lg text-xs font-bold text-black flex items-center justify-center space-x-1"><Repeat size={12} /> <span>スコアをBBSに投稿</span></button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-[#0f0f11] border-t border-gray-900 p-3 shrink-0 flex items-center justify-between">
        <div className="flex space-x-2">
          <button onTouchStart={() => handleControl('up')} onMouseDown={() => handleControl('up')} className="w-10 h-10 bg-gray-100/10 rounded-full border border-gray-800 flex items-center justify-center text-white text-xs font-bold">▲</button>
          <button onTouchStart={() => handleControl('down')} onMouseDown={() => handleControl('down')} className="w-10 h-10 bg-gray-100/10 rounded-full border border-gray-800 flex items-center justify-center text-white text-xs font-bold">▼</button>
        </div>
        <span className="text-[10px] text-gray-500 select-none">操作: 左の上下ボタン</span>
      </div>
    </div>
  );
}
