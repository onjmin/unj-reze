'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Pen, Brush, Eraser, PaintBucket, Pipette,
  Grid3x3, Trash2, Undo, Redo, Save, Layers
} from 'lucide-react';
import * as oekaki from '@onjmin/oekaki';
import LayerPanel from './LayerPanel';
import type { LayerEntry } from './LayerPanel';

interface DrawingEditorProps {
  onClose: () => void;
  onSave: (data: string) => void;
}

type Tool = 'pen' | 'brush' | 'eraser' | 'dropper' | 'fill';

const PRESET_COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#6b7280', '#ec4899', '#f43f5e', '#14b8a6', '#facc15', '#fed7aa', '#60a5fa', '#a855f7',
  '#1e293b', '#475569', '#94a3b8', '#cbd5e1', '#f8fafc', '#dc2626', '#ea580c', '#ca8a04',
];

export default function DrawingEditor({ onClose, onSave }: DrawingEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef<Tool>('pen');
  const colorRef = useRef('#ffffff');
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [penSize, setPenSize] = useState(4);
  const [brushSize, setBrushSize] = useState(12);
  const [eraserSize, setEraserSize] = useState(20);
  const [showGrid, setShowGrid] = useState(false);
  const [layerEntries, setLayerEntries] = useState<LayerEntry[]>([]);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const layerCounterRef = useRef(1);
  const layerEntriesRef = useRef<LayerEntry[]>([]);
  const activeLayerIndexRef = useRef(0);
  const [, forceRender] = useState(0);

  toolRef.current = tool;
  colorRef.current = color;

  const currentSize = tool === 'brush' ? brushSize : tool === 'eraser' ? eraserSize : penSize;

  const applyColor = (c: string) => {
    setColor(c);
    oekaki.color.value = c;
    setTool('pen');
    toolRef.current = 'pen';
  };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const parent = el.parentElement;
    const availW = parent ? parent.clientWidth : 640;
    const availH = parent ? parent.clientHeight : 480;
    const cap = 1024;
    const w = Math.min(availW, cap) | 0;
    const h = Math.min(availH, cap) | 0;
    el.innerHTML = '';
    oekaki.init(el, w, h);

    oekaki.lowerLayer.value?.canvas.classList.add('gimp-checkered-background');
    oekaki.upperLayer.value?.canvas.classList.add('upper-canvas');
    oekaki.color.value = colorRef.current;
    oekaki.penSize.value = penSize;
    oekaki.brushSize.value = brushSize;
    oekaki.eraserSize.value = eraserSize;

    // g_layers is empty after init — create initial user layers
    const bgLayer = new oekaki.LayeredCanvas('白背景');
    bgLayer.fill('#FFF');
    bgLayer.trace();
    new oekaki.LayeredCanvas('レイヤー #1');
    layerCounterRef.current = 2;

    // populate layer entries (topmost first)
    const initEntries: LayerEntry[] = oekaki.getLayers().map(inst => ({
      instance: inst,
      name: inst.name,
    })).reverse();
    setLayerEntries(initEntries);
    layerEntriesRef.current = initEntries;
    setActiveLayerIndex(0);
    activeLayerIndexRef.current = 0;

    let px: number | null = null;
    let py: number | null = null;

    oekaki.onDraw((x, y, buttons) => {
      const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
      if (!active?.editable) return;

      if (toolRef.current === 'dropper' || (buttons & 2) !== 0) {
        const result = oekaki.dropper(x, y);
        if (result) {
          const [r, g, b, a] = result;
          if (a) {
            const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
            applyColor(hex);
          }
        }
        px = null; py = null;
        return;
      }

      if (px === null) { px = x; py = y; }

      if (toolRef.current === 'brush') {
        active.drawLine(x, y, px, py);
      } else {
        const points = oekaki.lerp(x, y, px, py);
        if (toolRef.current === 'pen') {
          for (const [cx, cy] of points) active.draw(cx, cy);
        } else if (toolRef.current === 'eraser') {
          for (const [cx, cy] of points) active.erase(cx, cy);
        }
      }
      px = x; py = y;
    });

    oekaki.onDrawn((x, y) => {
      px = null; py = null;
      const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
      if (active?.modified()) active.trace();

      if (toolRef.current === 'fill') {
        const rgb = colorRef.current.slice(1).match(/.{2}/g)?.map(v => parseInt(v, 16));
        if (!rgb || !active) return;
        const w = active.canvas.width;
        const h = active.canvas.height;
        const result = oekaki.floodFill(active.data, w, h, x, y, [rgb[0], rgb[1], rgb[2], 255]);
        if (result) active.data = result;
        active.trace();
      }
      forceRender(n => n + 1);
    });

    return () => { if (mountRef.current) mountRef.current.innerHTML = ''; };
  }, []);

  useEffect(() => {
    if (mountRef.current) {
      mountRef.current.className = showGrid ? 'unj-canvas-grid' : '';
    }
  }, [showGrid]);

  useEffect(() => {
    oekaki.penSize.value = penSize;
    oekaki.brushSize.value = brushSize;
    oekaki.eraserSize.value = eraserSize;
  }, [penSize, brushSize, eraserSize]);

  const clearCanvas = () => {
    const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
    if (!active) return;
    active.clear();
    active.trace();
    forceRender(n => n + 1);
  };

  const handleUndo = () => {
    layerEntriesRef.current[activeLayerIndexRef.current]?.instance.undo();
    forceRender(n => n + 1);
  };
  const handleRedo = () => {
    layerEntriesRef.current[activeLayerIndexRef.current]?.instance.redo();
    forceRender(n => n + 1);
  };

  const selectLayer = (i: number) => {
    setActiveLayerIndex(i);
    activeLayerIndexRef.current = i;
  };

  const addLayer = () => {
    const name = `Layer ${layerCounterRef.current++}`;
    const newLayer = new oekaki.LayeredCanvas(name);
    const newEntry: LayerEntry = { instance: newLayer, name };
    const entries = [newEntry, ...layerEntriesRef.current];
    setLayerEntries(entries);
    layerEntriesRef.current = entries;
    setActiveLayerIndex(0);
    activeLayerIndexRef.current = 0;
  };

  const deleteLayer = (i: number) => {
    const entry = layerEntriesRef.current[i];
    if (!entry) return;
    entry.instance.delete();
    const entries = layerEntriesRef.current.filter((_, idx) => idx !== i);
    setLayerEntries(entries);
    layerEntriesRef.current = entries;
    let newIdx = activeLayerIndexRef.current;
    if (newIdx >= entries.length) newIdx = entries.length - 1;
    if (i < activeLayerIndexRef.current) newIdx--;
    if (newIdx < 0) newIdx = 0;
    setActiveLayerIndex(newIdx);
    activeLayerIndexRef.current = newIdx;
  };

  const reorderLayers = (from: number, to: number) => {
    const entries = [...layerEntriesRef.current];
    const [moved] = entries.splice(from, 1);
    entries.splice(to, 0, moved);
    setLayerEntries(entries);
    layerEntriesRef.current = entries;
    const gLayers = [...entries].reverse().map(e => e.instance);
    oekaki.setLayers(gLayers);
    let newIdx = activeLayerIndexRef.current;
    if (from === newIdx) {
      newIdx = to;
    } else if (from < newIdx && to >= newIdx) {
      newIdx--;
    } else if (from > newIdx && to <= newIdx) {
      newIdx++;
    }
    setActiveLayerIndex(newIdx);
    activeLayerIndexRef.current = newIdx;
  };

  const toggleVisibility = (i: number) => {
    const entry = layerEntriesRef.current[i];
    if (!entry) return;
    entry.instance.visible = !entry.instance.visible;
    forceRender(n => n + 1);
  };

  const toggleLock = (i: number) => {
    const entry = layerEntriesRef.current[i];
    if (!entry) return;
    entry.instance.locked = !entry.instance.locked;
    forceRender(n => n + 1);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        switch (e.key) {
          case 'z': e.preventDefault(); handleUndo(); break;
          case 'Z': e.preventDefault(); handleRedo(); break;
          case 's': e.preventDefault(); handleSave(); break;
        }
        return;
      }
      switch (e.key) {
        case '1': setTool('pen'); toolRef.current = 'pen'; break;
        case '2': setTool('brush'); toolRef.current = 'brush'; break;
        case '3': setTool('eraser'); toolRef.current = 'eraser'; break;
        case '4': setTool('dropper'); toolRef.current = 'dropper'; break;
        case '5': setTool('fill'); toolRef.current = 'fill'; break;
        case 'g': setShowGrid(v => !v); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const handleSave = () => {
    onSave(oekaki.render().toDataURL());
  };

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => { setTool(t); toolRef.current = t; }}
      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${tool === t ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20'}`}
      title={label}
    >
      {icon}
    </button>
  );

  return (
    <div className="absolute inset-0 bg-[#0f0f11] z-50 flex flex-col select-none">
      <div className="flex items-center px-3.5 py-2.5 border-b border-gray-800 shrink-0 bg-[#0f0f11]">
        <button onClick={onClose} className="mr-2 text-gray-400 hover:bg-gray-100/10 p-1.5 rounded transition-colors">
          <X size={20} />
        </button>
        <span className="font-bold text-xs text-gray-300">キャンセル</span>
        <span className="text-gray-600 mx-1.5 text-[10px]">›</span>
        <span className="text-gray-400 text-xs">お絵かきツール</span>
      </div>

      <div className="flex-1 bg-[#1a1b26] m-3 mb-1 rounded-xl border border-gray-800 shadow-inner overflow-hidden relative flex items-center justify-center">
        <div ref={mountRef} className="w-full h-full" />
      </div>

      <div className="px-3.5 pb-4 pt-2.5 space-y-2.5 shrink-0 bg-[#0f0f11] border-t border-gray-900">
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
          {toolBtn('pen', <Pen size={15} />, 'ペン (1)')}
          {toolBtn('brush', <Brush size={15} />, 'ブラシ (2)')}
          {toolBtn('eraser', <Eraser size={15} />, '消しゴム (3)')}
          {toolBtn('dropper', <Pipette size={15} />, 'スポイト (4)')}
          {toolBtn('fill', <PaintBucket size={15} />, '塗りつぶし (5)')}
          <div className="w-px h-6 bg-gray-800 mx-1" />
          <button
            onClick={() => setShowGrid(v => !v)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${showGrid ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20'}`}
            title="グリッド (G)"
          >
            <Grid3x3 size={15} />
          </button>
          <button
            onClick={() => setShowLayerPanel(v => !v)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${showLayerPanel ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20'}`}
            title="レイヤー"
          >
            <Layers size={15} />
          </button>
        </div>

        <div className="flex items-center space-x-3">
          {(tool === 'pen' || tool === 'brush') && (
            <div className="flex-1 flex items-center space-x-2">
              <span className="text-[10px] text-gray-500 w-12 shrink-0">{tool === 'brush' ? 'ブラシ' : 'ペン'}サイズ</span>
              <input
                type="range"
                min={1}
                max={tool === 'brush' ? 60 : 20}
                value={currentSize}
                onChange={e => tool === 'brush' ? setBrushSize(Number(e.target.value)) : setPenSize(Number(e.target.value))}
                className="flex-1 h-1 accent-blue-500"
              />
              <span className="text-[10px] text-gray-400 w-6 text-right">{currentSize}px</span>
            </div>
          )}
          {tool === 'eraser' && (
            <div className="flex-1 flex items-center space-x-2">
              <span className="text-[10px] text-gray-500 w-16 shrink-0">消しゴムサイズ</span>
              <input
                type="range"
                min={4}
                max={80}
                value={eraserSize}
                onChange={e => setEraserSize(Number(e.target.value))}
                className="flex-1 h-1 accent-blue-500"
              />
              <span className="text-[10px] text-gray-400 w-6 text-right">{eraserSize}px</span>
            </div>
          )}
          {(tool === 'dropper' || tool === 'fill') && (
            <span className="text-[10px] text-gray-500">キャンバスをクリック</span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative shrink-0 w-8 h-8 rounded border border-gray-600 overflow-hidden" style={{ backgroundColor: color }} />
          <input
            type="color"
            value={color}
            onChange={e => applyColor(e.target.value)}
            className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent"
          />
          <div className="flex-1 flex flex-wrap gap-0.5">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                className={`w-5 h-5 rounded-sm border ${color === c ? 'border-white scale-110' : 'border-gray-700/50'} transition-transform`}
                style={{ backgroundColor: c }}
                onClick={() => applyColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex space-x-1.5">
            <button onClick={clearCanvas} className="px-2 h-7 rounded bg-red-950/20 text-red-400 border border-red-900/30 flex items-center space-x-1 text-[10px]">
              <Trash2 size={11} />
              <span>クリア</span>
            </button>
            <button onClick={handleUndo} className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] disabled:opacity-40">
              <Undo size={11} />
              <span>戻る</span>
            </button>
            <button onClick={handleRedo} className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] disabled:opacity-40">
              <Redo size={11} />
              <span>進む</span>
            </button>
          </div>
          <button onClick={handleSave} className="h-7 rounded bg-[#1db854] hover:bg-[#1ed760] text-gray-900 font-bold flex items-center space-x-1.5 px-3 text-[10px] transition-colors">
            <Save size={11} />
            <span>投稿する</span>
          </button>
        </div>
      </div>
      {showLayerPanel && (
        <LayerPanel
          layers={layerEntries}
          activeIndex={activeLayerIndex}
          onSelect={selectLayer}
          onReorder={reorderLayers}
          onToggleVisibility={toggleVisibility}
          onToggleLock={toggleLock}
          onAdd={addLayer}
          onDelete={deleteLayer}
          onClose={() => setShowLayerPanel(false)}
        />
      )}
    </div>
  );
}
