'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Pen, Eraser, PaintBucket, Pipette,
  Trash2, Undo, Redo, Save, Maximize2, Layers, Film
} from 'lucide-react';
import * as oekaki from '@onjmin/oekaki';
import LayerPanel from './LayerPanel';
import type { LayerEntry } from './LayerPanel';
import AnimationBar from './AnimationBar';
import type { FrameData } from './AnimationBar';

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
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [layerEntries, setLayerEntries] = useState<LayerEntry[]>([]);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const layerCounterRef = useRef(1);
  const layerEntriesRef = useRef<LayerEntry[]>([]);
  const activeLayerIndexRef = useRef(0);
  const [animMode, setAnimMode] = useState(false);
  const framesRef = useRef<FrameData[]>([]);
  const currentFrameRef = useRef(0);
  const fpsRef = useRef(8);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const playTimerRef = useRef<number | null>(null);
  const [, forceRender] = useState(0);
  const onionSkinRef = useRef(false);
  const onionSkinOpacityRef = useRef(20);
  const onionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [onionSkin, setOnionSkin] = useState(false);
  const [onionSkinOpacity, setOnionSkinOpacity] = useState(20);

  toolRef.current = tool;
  colorRef.current = color;

  const applyColor = (c: string) => {
    setColor(c);
    oekaki.color.value = c;
    setTool('pen');
    toolRef.current = 'pen';
    setRecentColors(prev => {
      const filtered = prev.filter(x => x !== c);
      return [c, ...filtered].slice(0, 8);
    });
  };

  const CANVAS_SIZE = 384;

  const toggleOnionSkin = () => {
    const next = !onionSkinRef.current;
    onionSkinRef.current = next;
    setOnionSkin(next);
    if (onionCanvasRef.current) {
      onionCanvasRef.current.style.display = next ? 'block' : 'none';
    }
    if (next) updateOnionSkin();
  };

  const handleOnionSkinOpacityChange = (opacity: number) => {
    onionSkinOpacityRef.current = opacity;
    setOnionSkinOpacity(opacity);
    updateOnionSkin();
  };

  const updateOnionSkin = () => {
    const canvas = onionCanvasRef.current;
    if (!canvas || !onionSkinRef.current) return;
    const idx = currentFrameRef.current - 1;
    if (idx < 0 || !framesRef.current[idx]) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const prev = framesRef.current[idx];
    const w = canvas.width, h = canvas.height;
    const temp = document.createElement('canvas');
    temp.width = w; temp.height = h;
    const tempCtx = temp.getContext('2d')!;
    for (const l of prev.layers) {
      if (!l.visible) continue;
      tempCtx.putImageData(new ImageData(new Uint8ClampedArray(l.data), w, h), 0, 0);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = onionSkinOpacityRef.current / 100;
    ctx.drawImage(temp, 0, 0);
    ctx.globalAlpha = 1;
  };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    el.innerHTML = '';
    oekaki.init(el, CANVAS_SIZE, CANVAS_SIZE);
    oekaki.setDotSize(1, gridH);

    oekaki.lowerLayer.value?.canvas.classList.add('gimp-checkered-background');
    oekaki.upperLayer.value?.canvas.classList.add('upper-canvas');
    document.documentElement.style.setProperty('--grid-cell-size', `${oekaki.getDotSize()}px`);
    oekaki.color.value = colorRef.current;

    // g_layers is empty after init — create initial user layers
    const bgLayer = new oekaki.LayeredCanvas('白背景');
    bgLayer.fill('#FFF');
    bgLayer.trace();
    new oekaki.LayeredCanvas('レイヤー #1');
    layerCounterRef.current = 2;

    const initEntries: LayerEntry[] = oekaki.getLayers().map(inst => ({
      instance: inst,
      name: inst.name,
    })).reverse();
    setLayerEntries(initEntries);
    layerEntriesRef.current = initEntries;
    setActiveLayerIndex(0);
    activeLayerIndexRef.current = 0;

    // onion skin canvas
    const onionCanvas = document.createElement('canvas');
    onionCanvas.width = CANVAS_SIZE;
    onionCanvas.height = CANVAS_SIZE;
    onionCanvas.style.position = 'absolute';
    onionCanvas.style.zIndex = '2';
    onionCanvas.style.left = '0';
    onionCanvas.style.top = '0';
    onionCanvas.style.pointerEvents = 'none';
    onionCanvas.style.display = 'none';
    const container = el.firstChild as HTMLElement;
    if (container && container.children.length >= 2) {
      container.insertBefore(onionCanvas, container.children[1]);
    }
    onionCanvasRef.current = onionCanvas;

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
      const points = oekaki.lerp(x, y, px, py!);
      if (toolRef.current === 'pen') {
        for (const [cx, cy] of points) active.drawByDot(cx, cy);
      } else if (toolRef.current === 'eraser') {
        for (const [cx, cy] of points) active.eraseByDot(cx, cy);
      }
      px = x; py = y;
    });

    oekaki.onDrawn((x, y) => {
      px = null; py = null;
      const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
      if (active?.modified()) active.trace();

      if (toolRef.current === 'fill') {
        const rgb = colorRef.current.slice(1).match(/.{2}/g)?.map(v => parseInt(v, 16));
        if (!rgb) return;
        const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
        if (!active) return;
        const result = oekaki.floodFill(active.data, CANVAS_SIZE, CANVAS_SIZE, x, y, [rgb[0], rgb[1], rgb[2], 255]);
        if (result) active.data = result;
        active.trace();
      }
      updateOnionSkin();
      forceRender(n => n + 1);
    });

    return () => {
      onionCanvasRef.current = null;
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, [gridW, gridH]);

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

  // ── Animation ──

  const syncLayerEntries = () => {
    const entries = oekaki.getLayers().map(inst => ({
      instance: inst,
      name: inst.name,
    })).reverse();
    setLayerEntries(entries);
    layerEntriesRef.current = entries;
  };

  const captureFrame = (): FrameData => ({
    layers: oekaki.getLayers().map(l => ({
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      data: new Uint8ClampedArray(l.data),
    })),
  });

  const applyFrame = (frame: FrameData) => {
    for (const l of oekaki.getLayers()) l.delete();
    oekaki.refresh();
    for (const { name, visible, locked, data } of frame.layers) {
      const l = new oekaki.LayeredCanvas(name);
      l.visible = visible;
      l.locked = locked;
      l.data = new Uint8ClampedArray(data);
    }
    syncLayerEntries();
  };

  const selectFrame = (i: number) => {
    framesRef.current[currentFrameRef.current] = captureFrame();
    currentFrameRef.current = i;
    applyFrame(framesRef.current[i]);
    updateOnionSkin();
    forceRender(n => n + 1);
  };

  const addFrame = () => {
    framesRef.current[currentFrameRef.current] = captureFrame();
    const blank: FrameData = {
      layers: oekaki.getLayers().map(l => ({
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        data: new Uint8ClampedArray(l.canvas.width * l.canvas.height * 4),
      })),
    };
    const idx = currentFrameRef.current + 1;
    framesRef.current.splice(idx, 0, blank);
    currentFrameRef.current = idx;
    applyFrame(blank);
    updateOnionSkin();
    forceRender(n => n + 1);
  };

  const deleteFrame = () => {
    if (framesRef.current.length <= 1) return;
    framesRef.current.splice(currentFrameRef.current, 1);
    if (currentFrameRef.current >= framesRef.current.length)
      currentFrameRef.current = framesRef.current.length - 1;
    applyFrame(framesRef.current[currentFrameRef.current]);
    updateOnionSkin();
    forceRender(n => n + 1);
  };

  const duplicateFrame = () => {
    framesRef.current[currentFrameRef.current] = captureFrame();
    const src = framesRef.current[currentFrameRef.current];
    const dup: FrameData = { layers: src.layers.map(l => ({ ...l, data: new Uint8ClampedArray(l.data) })) };
    const idx = currentFrameRef.current + 1;
    framesRef.current.splice(idx, 0, dup);
    currentFrameRef.current = idx;
    applyFrame(dup);
    updateOnionSkin();
    forceRender(n => n + 1);
  };

  const togglePlay = () => {
    if (isPlayingRef.current) {
      if (playTimerRef.current !== null) clearInterval(playTimerRef.current);
      playTimerRef.current = null;
      isPlayingRef.current = false;
      setIsPlaying(false);
    } else {
      isPlayingRef.current = true;
      setIsPlaying(true);
      playTimerRef.current = window.setInterval(() => {
        const next = (currentFrameRef.current + 1) % framesRef.current.length;
        framesRef.current[currentFrameRef.current] = captureFrame();
        currentFrameRef.current = next;
        applyFrame(framesRef.current[next]);
        updateOnionSkin();
        forceRender(n => n + 1);
      }, 1000 / fpsRef.current);
    }
  };

  const handleFpsChange = (fps: number) => {
    fpsRef.current = fps;
    if (isPlayingRef.current) {
      if (playTimerRef.current !== null) clearInterval(playTimerRef.current);
      playTimerRef.current = window.setInterval(() => {
        const next = (currentFrameRef.current + 1) % framesRef.current.length;
        framesRef.current[currentFrameRef.current] = captureFrame();
        currentFrameRef.current = next;
        applyFrame(framesRef.current[next]);
        updateOnionSkin();
        forceRender(n => n + 1);
      }, 1000 / fpsRef.current);
    }
  };

  const enterAnimMode = () => {
    stopPlayback();
    framesRef.current = [captureFrame()];
    currentFrameRef.current = 0;
    setAnimMode(true);
  };

  const exitAnimMode = () => {
    stopPlayback();
    if (framesRef.current.length > 1) {
      framesRef.current[currentFrameRef.current] = captureFrame();
      currentFrameRef.current = 0;
      applyFrame(framesRef.current[0]);
    }
    onionSkinRef.current = false;
    setOnionSkin(false);
    if (onionCanvasRef.current) onionCanvasRef.current.style.display = 'none';
    setAnimMode(false);
  };

  const stopPlayback = () => {
    if (playTimerRef.current !== null) clearInterval(playTimerRef.current);
    playTimerRef.current = null;
    isPlayingRef.current = false;
    setIsPlaying(false);
  };

  useEffect(() => {
    return () => { if (playTimerRef.current !== null) clearInterval(playTimerRef.current); };
  }, []);

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

      {animMode && (
        <AnimationBar
          frameCount={framesRef.current.length}
          currentFrame={currentFrameRef.current}
          fps={fpsRef.current}
          isPlaying={isPlaying}
          onSelectFrame={selectFrame}
          onAddFrame={addFrame}
          onDeleteFrame={deleteFrame}
          onDuplicateFrame={duplicateFrame}
          onTogglePlay={togglePlay}
          onFpsChange={handleFpsChange}
          onionSkin={onionSkin}
          onionSkinOpacity={onionSkinOpacity}
          onToggleOnionSkin={toggleOnionSkin}
          onOnionSkinOpacityChange={handleOnionSkinOpacityChange}
          onExit={exitAnimMode}
        />
      )}

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
          <button
            onClick={() => setShowLayerPanel(v => !v)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${showLayerPanel ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20'}`}
            title="レイヤー"
          >
            <Layers size={13} />
          </button>
          <button
            onClick={() => animMode ? exitAnimMode() : enterAnimMode()}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${animMode ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20'}`}
            title="アニメーション"
          >
            <Film size={13} />
          </button>
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
        {recentColors.length > 0 && (
          <div className="flex items-center space-x-1.5">
            <span className="text-[9px] text-gray-600 shrink-0">履歴</span>
            <div className="flex flex-wrap gap-0.5">
              {recentColors.map(c => (
                <button
                  key={c}
                  className="w-4 h-4 rounded-sm border border-gray-700/50 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  onClick={() => applyColor(c)}
                />
              ))}
            </div>
          </div>
        )}

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
