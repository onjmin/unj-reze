'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Pen, Eraser, PaintBucket, Pipette,
  Trash2, Undo, Redo, Save, Maximize2
} from 'lucide-react';
import * as oekaki from '@onjmin/oekaki';

interface DotDrawingEditorProps {
  onClose: () => void;
  onSave: (data: string) => void;
}

type Tool = 'pen' | 'eraser' | 'dropper' | 'fill';

const SIZE_PRESETS = [
  { label: '16×16', w: 16, h: 16 },
  { label: '24×32', w: 24, h: 32 },
  { label: '32×32', w: 32, h: 32 },
  { label: '48×48', w: 48, h: 48 },
  { label: '64×64', w: 64, h: 64 },
  { label: '96×96', w: 96, h: 96 },
  { label: '128×128', w: 128, h: 128 },
];

const PALETTE_PICO8 = [
  '#000000', '#1d2b53', '#7e2553', '#008751',
  '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436',
  '#29adff', '#83769c', '#ff77a8', '#ffccaa',
];

export default function DotDrawingEditor({ onClose, onSave }: DotDrawingEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef<Tool>('pen');
  const colorRef = useRef('#000000');
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [zoom, setZoom] = useState(1);
  const [gridW, setGridW] = useState(32);
  const [gridH, setGridH] = useState(32);
  const [showPresets, setShowPresets] = useState(false);
  const [, forceRender] = useState(0);

  toolRef.current = tool;
  colorRef.current = color;

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
    oekaki.setDotSize(1, gridH);
    oekaki.lowerLayer.value?.canvas.classList.add('gimp-checkered-background');
    oekaki.upperLayer.value?.canvas.classList.add('upper-canvas');
    oekaki.color.value = colorRef.current;

    let px: number | null = null;
    let py: number | null = null;

    oekaki.onDraw((x, y, buttons) => {
      const active = oekaki.upperLayer.value;
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
      const points = oekaki.lerp(x, y, px, py);
      if (toolRef.current === 'pen') {
        for (const [cx, cy] of points) active.drawByDot(cx, cy);
      } else if (toolRef.current === 'eraser') {
        for (const [cx, cy] of points) active.eraseByDot(cx, cy);
      }
      px = x; py = y;
    });

    oekaki.onDrawn((x, y) => {
      px = null; py = null;
      const active = oekaki.upperLayer.value;
      if (active?.modified()) active.trace();

      if (toolRef.current === 'fill') {
        const rgb = colorRef.current.slice(1).match(/.{2}/g)?.map(v => parseInt(v, 16));
        if (!rgb) return;
        const active = oekaki.upperLayer.value;
        if (!active) return;
        const result = oekaki.floodFill(active.data, w, h, x, y, [rgb[0], rgb[1], rgb[2], 255]);
        if (result) active.data = result;
        active.trace();
      }
      forceRender(n => n + 1);
    });

    return () => { if (mountRef.current) mountRef.current.innerHTML = ''; };
  }, [gridW, gridH]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (mount.querySelector('.upper-canvas')) {
      mount.className = '';
    }
  }, []);

  const changeSize = (w: number, h: number) => {
    const src = oekaki.render();
    setGridW(w);
    setGridH(h);
    setShowPresets(false);
    setTimeout(() => {
      const active = oekaki.upperLayer.value;
      if (active) {
        active.clear();
        active.paste(src);
        active.trace();
      }
      forceRender(n => n + 1);
    }, 0);
  };

  const clearCanvas = () => {
    const active = oekaki.upperLayer.value;
    if (!active) return;
    active.clear();
    active.trace();
    forceRender(n => n + 1);
  };

  const handleUndo = () => {
    oekaki.upperLayer.value?.undo();
    forceRender(n => n + 1);
  };

  const handleRedo = () => {
    oekaki.upperLayer.value?.redo();
    forceRender(n => n + 1);
  };

  const handleSave = () => {
    const canvas = oekaki.render();
    onSave(canvas.toDataURL('image/png'));
  };

  const zoomIn = () => setZoom(v => Math.min(4, Math.round((v + 0.25) * 100) / 100));
  const zoomOut = () => setZoom(v => Math.max(0.25, Math.round((v - 0.25) * 100) / 100));

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
        case '2': setTool('eraser'); toolRef.current = 'eraser'; break;
        case '3': setTool('dropper'); toolRef.current = 'dropper'; break;
        case '4': setTool('fill'); toolRef.current = 'fill'; break;
        case 'b': zoomIn(); break;
        case 'n': zoomOut(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => { setTool(t); toolRef.current = t; }}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${tool === t ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20'}`}
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
        <span className="text-gray-400 text-xs">ドット絵エディタ</span>
        <div className="ml-auto flex items-center space-x-2">
          <span className="text-[9px] text-gray-600">{gridW}×{gridH}</span>
          <button onClick={() => setShowPresets(v => !v)} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/20">
            <Maximize2 size={12} />
          </button>
        </div>
      </div>

      {showPresets && (
        <div className="absolute top-10 right-3 z-50 bg-[#1a1b26] border border-gray-700 rounded-lg shadow-xl p-2 grid grid-cols-4 gap-1">
          {SIZE_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => changeSize(p.w, p.h)}
              className={`px-2 py-1.5 rounded text-[10px] transition-colors ${gridW === p.w && gridH === p.h ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-100/10'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center bg-[#1a1b26] m-3 mb-1 rounded-xl border border-gray-800 shadow-inner overflow-hidden p-4">
        <div ref={mountRef} className="inline-block unj-canvas-grid" style={{ transform: `scale(${zoom})` }} />
      </div>

      <div className="px-3.5 pb-4 pt-2.5 space-y-2.5 shrink-0 bg-[#0f0f11] border-t border-gray-900">
        <div className="flex items-center space-x-1.5">
          {toolBtn('pen', <Pen size={13} />, 'ペン (1)')}
          {toolBtn('eraser', <Eraser size={13} />, '消しゴム (2)')}
          {toolBtn('dropper', <Pipette size={13} />, 'スポイト (3)')}
          {toolBtn('fill', <PaintBucket size={13} />, '塗りつぶし (4)')}
          <div className="w-px h-5 bg-gray-800 mx-1" />
          <button
            onClick={zoomOut}
            className="w-6 h-6 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 text-xs hover:bg-gray-100/20"
            title="ズームアウト (N)"
          >−</button>
          <span className="text-[10px] text-gray-400 w-8 text-center font-mono">{Math.round(zoom * 100)}%</span>
          <button
            onClick={zoomIn}
            className="w-6 h-6 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 text-xs hover:bg-gray-100/20"
            title="ズームイン (B)"
          >+</button>
        </div>

        <div className="flex items-center space-x-1.5">
          <div className="relative shrink-0 w-7 h-7 rounded border border-gray-600 overflow-hidden" style={{ backgroundColor: color }} />
          <input
            type="color"
            value={color}
            onChange={e => applyColor(e.target.value)}
            className="w-7 h-7 rounded border border-gray-700 cursor-pointer bg-transparent"
          />
          <div className="flex flex-wrap gap-0.5 flex-1">
            {PALETTE_PICO8.map(c => (
              <button
                key={c}
                className={`w-4 h-4 rounded-sm border ${color === c ? 'border-white scale-110' : 'border-gray-700/50'} transition-transform`}
                style={{ backgroundColor: c }}
                onClick={() => applyColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex space-x-1.5">
            <button onClick={clearCanvas} className="px-2 h-6 rounded bg-red-950/20 text-red-400 border border-red-900/30 flex items-center space-x-1 text-[9px]">
              <Trash2 size={10} />
              <span>クリア</span>
            </button>
            <button onClick={handleUndo} className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] disabled:opacity-40">
              <Undo size={10} />
              <span>戻る</span>
            </button>
            <button onClick={handleRedo} className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] disabled:opacity-40">
              <Redo size={10} />
              <span>進む</span>
            </button>
          </div>
          <button onClick={handleSave} className="h-6 rounded bg-[#1db854] hover:bg-[#1ed760] text-gray-900 font-bold flex items-center space-x-1 px-3 text-[9px] transition-colors">
            <Save size={10} />
            <span>投稿する</span>
          </button>
        </div>
      </div>
    </div>
  );
}
