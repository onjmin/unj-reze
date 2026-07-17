'use client';

import { Play, Pause, Plus, Trash2, Copy, Film, Eye, EyeOff } from 'lucide-react';

export interface FrameData {
  layers: {
    name: string;
    visible: boolean;
    locked: boolean;
    opacity: number;
    data: Uint8ClampedArray;
  }[];
}

interface AnimationBarProps {
  frameCount: number;
  currentFrame: number;
  fps: number;
  isPlaying: boolean;
  onionSkin: boolean;
  onionSkinOpacity: number;
  onSelectFrame: (i: number) => void;
  onAddFrame: () => void;
  onDeleteFrame: () => void;
  onDuplicateFrame: () => void;
  onTogglePlay: () => void;
  onFpsChange: (fps: number) => void;
  onToggleOnionSkin: () => void;
  onOnionSkinOpacityChange: (opacity: number) => void;
  onExit: () => void;
}

export default function AnimationBar({
  frameCount, currentFrame, fps, isPlaying,
  onionSkin, onionSkinOpacity,
  onSelectFrame, onAddFrame, onDeleteFrame, onDuplicateFrame,
  onTogglePlay, onFpsChange, onToggleOnionSkin, onOnionSkinOpacityChange,
  onExit,
}: AnimationBarProps) {
  return (
    <div className="flex items-center space-x-2 px-3 py-2 bg-[#0f0f11] border-t border-gray-800 shrink-0">
      <Film size={13} className="text-gray-500 shrink-0" />
      <button
        onClick={onTogglePlay}
        className="w-7 h-7 rounded flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 shrink-0"
        title={isPlaying ? '停止' : '再生'}
      >
        {isPlaying ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <div className="flex items-center space-x-0.5 overflow-x-auto scrollbar-none flex-1">
        {Array.from({ length: frameCount }, (_, i) => (
          <button
            key={i}
            onClick={() => onSelectFrame(i)}
            className={`shrink-0 w-8 h-8 rounded text-[9px] font-mono transition-colors ${
              i === currentFrame
                ? 'bg-blue-600 text-white shadow'
                : 'bg-gray-100/10 text-gray-400 hover:bg-gray-100/20'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <button
        onClick={onAddFrame}
        className="w-7 h-7 rounded flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 shrink-0"
        title="フレーム追加"
      >
        <Plus size={12} />
      </button>
      <button
        onClick={onDuplicateFrame}
        className="w-7 h-7 rounded flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 shrink-0"
        title="フレーム複製"
      >
        <Copy size={12} />
      </button>
      {frameCount > 1 && (
        <button
          onClick={onDeleteFrame}
          className="w-7 h-7 rounded flex items-center justify-center bg-red-950/20 text-red-400 hover:bg-red-950/40 shrink-0"
          title="フレーム削除"
        >
          <Trash2 size={12} />
        </button>
      )}
      <div className="flex items-center space-x-1.5 text-[9px] text-gray-500 shrink-0 ml-1">
        <span>FPS</span>
        <input
          type="range"
          min={1}
          max={30}
          value={fps}
          onChange={e => onFpsChange(Number(e.target.value))}
          className="w-14 h-1 accent-blue-500"
        />
        <span className="w-4 text-right font-mono text-gray-400">{fps}</span>
      </div>
      <div className="h-5 w-px bg-gray-800 shrink-0" />
      <button
        onClick={onToggleOnionSkin}
        className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
          onionSkin
            ? 'bg-blue-600/30 text-blue-400'
            : 'bg-gray-100/10 text-gray-500 hover:bg-gray-100/20'
        }`}
        title={onionSkin ? 'オニオンスキンOFF' : 'オニオンスキン'}
      >
        {onionSkin ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
      {onionSkin && (
        <div className="flex items-center space-x-1.5 text-[9px] text-gray-500 shrink-0">
          <span>薄</span>
          <input
            type="range"
            min={5}
            max={50}
            value={onionSkinOpacity}
            onChange={e => onOnionSkinOpacityChange(Number(e.target.value))}
            className="w-12 h-1 accent-blue-500"
          />
          <span className="w-5 text-right font-mono text-gray-400">{onionSkinOpacity}%</span>
        </div>
      )}
      <button
        onClick={onExit}
        className="ml-1 text-[9px] px-2 h-6 rounded bg-gray-100/10 text-gray-500 hover:bg-gray-100/20 shrink-0"
      >
        通常編集
      </button>
    </div>
  );
}
