'use client';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, FileQuestion, Eye, EyeOff } from 'lucide-react';
import { presets, toXY, way, type WalkPreset } from '@/lib/walk-cycle';

interface WalkCyclePanelProps {
  preset: WalkPreset;
  activeIndex: number;
  dataUrlByIndex: ReadonlyMap<number, string>;
  onSelectCell: (index: number) => void;
  onChangePreset: (preset: WalkPreset) => void;
  onionSkin: boolean;
  onionSkinOpacity: number;
  onToggleOnionSkin: () => void;
  onOnionSkinOpacityChange: (opacity: number) => void;
  onNudge: (dx: number, dy: number) => void;
}

function WayIcon({ wayKey }: { wayKey: string }) {
  const cls = 'w-5 h-5';
  switch (wayKey) {
    case 'w': return <ArrowUp className={cls} />;
    case 's': return <ArrowDown className={cls} />;
    case 'a': return <ArrowLeft className={cls} />;
    case 'd': return <ArrowRight className={cls} />;
    case 'q': return <ArrowUp className={cls + ' -rotate-45'} />;
    case 'e': return <ArrowUp className={cls + ' rotate-45'} />;
    case 'z': return <ArrowDown className={cls + ' rotate-45'} />;
    case 'c': return <ArrowDown className={cls + ' -rotate-45'} />;
    default: return <FileQuestion className={cls} />;
  }
}

export default function WalkCyclePanel({ preset, activeIndex, dataUrlByIndex, onSelectCell, onChangePreset, onionSkin, onionSkinOpacity, onToggleOnionSkin, onOnionSkinOpacityChange, onNudge }: WalkCyclePanelProps) {
  return (
    <div className="px-3.5 py-2.5 space-y-2 shrink-0 bg-[#0f0f11] border-t border-gray-900">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 shrink-0">歩行グラ</span>
        <select
          value={preset.label}
          onChange={e => {
            const p = presets.find(v => v.label === e.target.value);
            if (p) onChangePreset(p);
          }}
          className="bg-gray-800 text-gray-200 text-[10px] px-2 py-1 rounded border border-gray-700 outline-none"
        >
          {presets.map(p => (
            <option key={p.label} value={p.label}>{p.label}</option>
          ))}
        </select>
        <span className="text-[10px] text-gray-600 ml-auto">
          {preset.w}×{preset.h} / {preset.frames}fr / {preset.ways.length}方向
        </span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
        {preset.ways.map((w, y) => (
          <div key={w.key} className="flex flex-col items-center gap-1">
            <WayIcon wayKey={w.key} />
            {Array.from({ length: preset.frames }, (_, x) => {
              const i = x + y * preset.frames;
              const src = dataUrlByIndex.get(i);
              return (
                <button
                  key={i}
                  onClick={() => onSelectCell(i)}
                  className={'w-12 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 ' + (activeIndex === i ? 'border-[#a3e635] ring-2 ring-[#a3e635]/30 scale-105' : 'border-gray-700 hover:border-gray-500')}
                >
                  {src ? (
                    <img src={src} alt="" className="w-full h-full object-contain gimp-checkered-background" />
                  ) : (
                    <div className="w-full h-full bg-[#1a1b26] flex items-center justify-center text-[10px] text-gray-600">
                      {i + 1}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-gray-800/60">
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleOnionSkin}
            className={'w-6 h-6 rounded flex items-center justify-center text-[10px] transition-colors ' + (onionSkin ? 'bg-blue-600 text-white' : 'bg-gray-100/10 text-gray-400 hover:bg-gray-100/20')}
            title={onionSkin ? 'オニオンスキンOFF' : 'オニオンスキン'}
          >
            {onionSkin ? <Eye size={11} /> : <EyeOff size={11} />}
          </button>
          {onionSkin && (
            <>
              <input
                type="range"
                min={1}
                max={50}
                value={onionSkinOpacity}
                onChange={e => onOnionSkinOpacityChange(Number(e.target.value))}
                className="w-16 h-1 accent-blue-500 cursor-pointer"
              />
              <span className="text-[9px] w-5 text-right font-mono text-gray-400">{onionSkinOpacity}%</span>
            </>
          )}
        </div>
        <div className="w-px h-4 bg-gray-800 mx-0.5" />
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-gray-500 mr-0.5">移動</span>
          <button onClick={() => onNudge(0, -1)} className="w-5 h-5 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 hover:bg-gray-100/20 text-[10px]" title="上に1px移動">▲</button>
          <button onClick={() => onNudge(-1, 0)} className="w-5 h-5 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 hover:bg-gray-100/20 text-[10px]" title="左に1px移動">◀</button>
          <button onClick={() => onNudge(1, 0)} className="w-5 h-5 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 hover:bg-gray-100/20 text-[10px]" title="右に1px移動">▶</button>
          <button onClick={() => onNudge(0, 1)} className="w-5 h-5 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 hover:bg-gray-100/20 text-[10px]" title="下に1px移動">▼</button>
        </div>
      </div>
    </div>
  );
}
