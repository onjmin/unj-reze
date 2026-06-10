'use client';

import { useRef, useState } from 'react';
import { Eye, EyeOff, Lock, Unlock, Plus, Trash2, GripVertical, X } from 'lucide-react';
import type { LayeredCanvas } from '@onjmin/oekaki';

interface LayerEntry {
  instance: LayeredCanvas;
  name: string;
}

interface LayerPanelProps {
  layers: LayerEntry[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onReorder: (from: number, to: number) => void;
  onToggleVisibility: (i: number) => void;
  onToggleLock: (i: number) => void;
  onAdd: () => void;
  onDelete: (i: number) => void;
  onClose: () => void;
}

export type { LayerEntry };

export default function LayerPanel({
  layers, activeIndex, onSelect, onReorder,
  onToggleVisibility, onToggleLock, onAdd, onDelete, onClose,
}: LayerPanelProps) {
  const dragRef = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-[#0f0f11]">
      <div className="flex items-center justify-between px-3.5 h-10 border-b border-gray-800 shrink-0">
        <span className="text-xs font-bold text-gray-300">レイヤー</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-200 p-1"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {layers.map((layer, i) => (
          <LayerRow
            key={layer.instance.uuid}
            layer={layer}
            index={i}
            isActive={i === activeIndex}
            isDropTarget={dropTarget === i}
            onSelect={() => onSelect(i)}
            onDragStart={() => { dragRef.current = i; }}
            onDragEnter={() => setDropTarget(i)}
            onDrop={() => {
              if (dragRef.current !== null && dragRef.current !== i) onReorder(dragRef.current, i);
              setDropTarget(null);
            }}
            onDragEnd={() => {
              dragRef.current = null;
              setDropTarget(null);
            }}
            onToggleVisibility={() => onToggleVisibility(i)}
            onToggleLock={() => onToggleLock(i)}
            onDelete={() => onDelete(i)}
            canDelete={layers.length > 1}
          />
        ))}
      </div>
      <div className="p-2 border-t border-gray-800 shrink-0">
        <button onClick={onAdd} className="w-full flex items-center justify-center space-x-1.5 py-2.5 rounded-lg bg-gray-100/10 hover:bg-gray-100/20 text-gray-300 text-xs transition-colors">
          <Plus size={15} />
          <span>レイヤーを追加</span>
        </button>
      </div>
    </div>
  );
}

function LayerRow({
  layer, index, isActive, isDropTarget, onSelect,
  onDragStart, onDragEnter, onDragEnd, onDrop,
  onToggleVisibility, onToggleLock, onDelete, canDelete,
}: {
  layer: LayerEntry; index: number; isActive: boolean; isDropTarget: boolean;
  onSelect: () => void; onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void; onDrop: () => void;
  onToggleVisibility: () => void; onToggleLock: () => void; onDelete: () => void; canDelete: boolean;
}) {
  const thumbRef = useRef<HTMLCanvasElement>(null);

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDragEnter={e => { e.preventDefault(); onDragEnter(); }}
      onDragEnd={onDragEnd}
      onDragLeave={() => {}}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      onClick={onSelect}
      className={`flex items-center space-x-2 px-2 py-2 rounded-lg cursor-pointer transition-colors select-none
        ${isActive ? 'bg-blue-600/25 ring-1 ring-blue-500/50' : 'hover:bg-gray-100/10'}
        ${isDropTarget ? 'border-t-2 border-blue-400' : ''}`}
    >
      <div className="text-gray-500 cursor-grab active:cursor-grabbing touch-none">
        <GripVertical size={16} />
      </div>
      <canvas
        ref={c => {
          thumbRef.current = c;
          if (!c) return;
          const src = layer.instance.canvas;
          if (!src) return;
          const s = 32;
          c.width = s; c.height = s;
          const ctx = c.getContext('2d');
          if (!ctx) return;
          ctx.fillStyle = '#1a1b26';
          ctx.fillRect(0, 0, s, s);
          ctx.drawImage(src, 0, 0, s, s);
        }}
        className="w-8 h-8 rounded border border-gray-700 shrink-0"
      />
      <span className="flex-1 text-xs text-gray-300 truncate">{layer.name}</span>
      <button onPointerDown={e => { e.stopPropagation(); onToggleVisibility(); }} className="p-1 text-gray-500 hover:text-gray-300 touch-none">
        {layer.instance.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button onPointerDown={e => { e.stopPropagation(); onToggleLock(); }} className="p-1 text-gray-500 hover:text-gray-300 touch-none">
        {layer.instance.locked ? <Lock size={14} /> : <Unlock size={14} />}
      </button>
      {canDelete && (
        <button onPointerDown={e => { e.stopPropagation(); onDelete(); }} className="p-1 text-red-400/50 hover:text-red-400 touch-none">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
