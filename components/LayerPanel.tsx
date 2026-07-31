'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
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
  onOpacityChange: (i: number, opacity: number) => void;
  onAdd: () => void;
  onDelete: (i: number) => void;
  onClose: () => void;
}

export type { LayerEntry };

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

export default function LayerPanel({
  layers, activeIndex, onSelect, onReorder,
  onToggleVisibility, onToggleLock, onOpacityChange, onAdd, onDelete, onClose,
}: LayerPanelProps) {
  const dragRef = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const isDesktop = useIsDesktop();

  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handleHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      setPosition({
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging]);

  if (isDesktop) {
    return (
      <div
        ref={panelRef}
        className="z-[60] flex flex-col bg-[#1a1b26] rounded-xl border border-gray-700 shadow-2xl w-64 select-none"
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          maxHeight: '70vh',
        }}
      >
        <div
          onPointerDown={handleHeaderPointerDown}
          className="flex items-center justify-between px-3 h-9 border-b border-gray-700 shrink-0 cursor-move rounded-t-xl"
        >
          <div className="flex items-center gap-1.5">
            <GripVertical size={12} className="text-gray-500" />
            <span className="text-[11px] font-bold text-gray-300">レイヤー</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 p-0.5"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
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
              onOpacityChange={(v) => onOpacityChange(i, v)}
              onDelete={() => onDelete(i)}
              canDelete={layers.length > 1}
            />
          ))}
        </div>
        <div className="p-1.5 border-t border-gray-700 shrink-0">
          <button onClick={onAdd} className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-gray-100/10 hover:bg-gray-100/20 text-gray-300 text-[11px] transition-colors">
            <Plus size={14} />
            <span>レイヤーを追加</span>
          </button>
        </div>
      </div>
    );
  }

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
            onOpacityChange={(v) => onOpacityChange(i, v)}
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
  layer, isActive, isDropTarget, onSelect,
  onDragStart, onDragEnter, onDragEnd, onDrop,
  onToggleVisibility, onToggleLock, onOpacityChange, onDelete, canDelete,
}: {
  layer: LayerEntry; index?: number; isActive: boolean; isDropTarget: boolean;
  onSelect: () => void; onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void; onDrop: () => void;
  onToggleVisibility: () => void; onToggleLock: () => void; onOpacityChange: (v: number) => void; onDelete: () => void; canDelete: boolean;
}) {
  const thumbRef = useRef<HTMLCanvasElement>(null);
  const opacity = layer.instance.opacity;

  return (
    <div
      className={`rounded-lg cursor-pointer transition-colors select-none
        ${isActive ? 'bg-blue-600/25 ring-1 ring-blue-500/50' : 'hover:bg-gray-100/10'}
        ${isDropTarget ? 'border-t-2 border-blue-400' : ''}`}
    >
      <div
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDragEnter={e => { e.preventDefault(); onDragEnter(); }}
        onDragEnd={onDragEnd}
        onDragLeave={() => {}}
        onDrop={e => { e.preventDefault(); onDrop(); }}
        onClick={onSelect}
        className="flex items-center space-x-2 px-2 py-2"
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
      {isActive && (
        <div className="flex items-center gap-2 px-2 pb-2 pt-0.5">
          <span className="text-[9px] text-gray-500 w-7 text-right shrink-0">{opacity}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={e => onOpacityChange(Number(e.target.value))}
            className="flex-1 h-1 accent-blue-500"
          />
        </div>
      )}
    </div>
  );
}
