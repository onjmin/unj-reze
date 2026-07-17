'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Pen, Brush, Eraser, PaintBucket, Pipette,
  Grid3x3, Trash2, Undo, Redo, Save, Layers, Film, Upload, History, FlipHorizontal
} from 'lucide-react';
import * as oekaki from '@onjmin/oekaki';
import LayerPanel from './LayerPanel';
import type { LayerEntry } from './LayerPanel';
import AnimationBar from './AnimationBar';
import type { FrameData } from './AnimationBar';
import ImportDialog from './ImportDialog';
import HistoryModal from './HistoryModal';
import { getStorageKey, getAutosave, saveAutosave, clearAutosave, saveHistory, serializeLayers, deserializeLayers, serializeFrames, deserializeFrames, DrawingEditorState } from '@/lib/history';

interface DrawingEditorProps {
  onClose: () => void;
  onSave: (data: string) => void;
  collabImageUrl?: string;
}

type Tool = 'pen' | 'brush' | 'eraser' | 'dropper' | 'fill';

const PRESET_COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#6b7280', '#ec4899', '#f43f5e', '#14b8a6', '#facc15', '#fed7aa', '#60a5fa', '#a855f7',
  '#1e293b', '#475569', '#94a3b8', '#cbd5e1', '#f8fafc', '#dc2626', '#ea580c', '#ca8a04',
];

export default function DrawingEditor({ onClose, onSave, collabImageUrl }: DrawingEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef<Tool>('pen');
  const colorRef = useRef('#ffffff');
  const collabRef = useRef(collabImageUrl);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [penSize, setPenSize] = useState(4);
  const [brushSize, setBrushSize] = useState(12);
  const [eraserSize, setEraserSize] = useState(20);
  const [showGrid, setShowGrid] = useState(false);
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
  const [showImport, setShowImport] = useState(false);
  const onionSkinRef = useRef(false);
  const onionSkinOpacityRef = useRef(20);
  const onionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [onionSkin, setOnionSkin] = useState(false);
  const [onionSkinOpacity, setOnionSkinOpacity] = useState(20);
  const [zoom, setZoom] = useState(1);
  const [flipped, setFlipped] = useState(false);
  const canvasSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // History & Autosave States
  const [showHistory, setShowHistory] = useState(false);
  const [hasAutosave, setHasAutosave] = useState(false);
  const [autosaveData, setAutosaveData] = useState<DrawingEditorState | null>(null);
  const [restoredState, setRestoredState] = useState<DrawingEditorState | null>(null);
  const [initKey, setInitKey] = useState(0);
  const storageKey = getStorageKey('drawing');
  const pinchPointsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);

  toolRef.current = tool;
  colorRef.current = color;

  const currentSize = tool === 'brush' ? brushSize : tool === 'eraser' ? eraserSize : penSize;

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

  // Check autosave on mount
  useEffect(() => {
    const autosave = getAutosave(storageKey);
    if (autosave && autosave.data) {
      setAutosaveData(autosave.data);
      setHasAutosave(true);
    }
  }, [storageKey]);

  // Periodic autosave (every 10s) and history snapshot (every 30m)
  useEffect(() => {
    const autosaveInterval = setInterval(() => {
      const state = getCurrentState();
      if (state) {
        saveAutosave(storageKey, state);
      }
    }, 10000);

    const historyInterval = setInterval(() => {
      const state = getCurrentState();
      if (state) {
        saveHistory(storageKey, state, 'drawing', 50);
      }
    }, 1800000);

    return () => {
      clearInterval(autosaveInterval);
      clearInterval(historyInterval);
    };
  }, [storageKey, animMode, zoom, fpsRef.current]);

  const handleRestoreAutosave = () => {
    if (!autosaveData) return;
    setRestoredState(autosaveData);
    setInitKey(k => k + 1);
    setHasAutosave(false);
    clearAutosave(storageKey);
  };

  const handleIgnoreAutosave = () => {
    setHasAutosave(false);
    clearAutosave(storageKey);
  };

  const handleRestoreHistory = (state: DrawingEditorState) => {
    setRestoredState(state);
    setInitKey(k => k + 1);
  };

  const getCurrentState = (): DrawingEditorState | null => {
    const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
    if (!active) return null;
    const canvas = active.canvas;
    const w = canvas.width;
    const h = canvas.height;
    if (animMode) {
      framesRef.current[currentFrameRef.current] = captureFrame();
      return {
        mode: 'anim',
        width: w,
        height: h,
        gridW: 32,
        gridH: 32,
        zoom,
        frames: serializeFrames(framesRef.current, w, h),
        currentFrame: currentFrameRef.current,
        fps: fpsRef.current
      };
    } else {
      return {
        mode: 'standard',
        width: w,
        height: h,
        gridW: 32,
        gridH: 32,
        zoom,
        layers: serializeLayers(oekaki.getLayers(), w, h)
      };
    }
  };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const parent = el.parentElement;
    const availW = parent ? parent.clientWidth : 640;
    const availH = parent ? parent.clientHeight : 480;
    const cap = 1024;

    const w = restoredState ? restoredState.width : (Math.min(availW, cap) | 0);
    const h = restoredState ? restoredState.height : (Math.min(availH, cap) | 0);
    el.innerHTML = '';
    oekaki.init(el, w, h);
    oekaki.flipped.value = false;
    setFlipped(false);
    canvasSizeRef.current = { w, h };

    oekaki.lowerLayer.value?.canvas.classList.add('gimp-checkered-background');
    oekaki.upperLayer.value?.canvas.classList.add('upper-canvas');
    oekaki.color.value = colorRef.current;
    oekaki.penSize.value = penSize;
    oekaki.brushSize.value = brushSize;
    oekaki.eraserSize.value = eraserSize;

    const loadCanvasContent = async () => {
      if (restoredState) {
        if (restoredState.mode === 'anim' && restoredState.frames) {
          const deserializedFrames = await deserializeFrames(restoredState.frames, w, h);
          framesRef.current = deserializedFrames;
          currentFrameRef.current = restoredState.currentFrame || 0;
          fpsRef.current = restoredState.fps || 8;
          setAnimMode(true);
          applyFrame(deserializedFrames[currentFrameRef.current]);
        } else if (restoredState.layers) {
          for (const l of oekaki.getLayers()) l.delete();
          oekaki.refresh();
          const deserializedLayers = await deserializeLayers(restoredState.layers, w, h);
          for (const { name, visible, locked, opacity, data } of deserializedLayers) {
            const l = new oekaki.LayeredCanvas(name);
            l.visible = visible;
            l.locked = locked;
            l.opacity = opacity;
            l.data = new Uint8ClampedArray(data);
          }
          syncLayerEntries();
        }
        setRestoredState(null);
      } else {
        // g_layers is empty after init — create initial user layers
        const bgLayer = new oekaki.LayeredCanvas('白背景');
        bgLayer.fill('#FFF');
        bgLayer.trace();
        new oekaki.LayeredCanvas('レイヤー #1');
        layerCounterRef.current = 2;

        // collaboration: load existing image as base layer
        if (collabRef.current) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = collabRef.current;
          img.onload = () => {
            // remove white background layer, paste image on first layer
            bgLayer.delete();
            const layers = oekaki.getLayers();
            const target = layers[0];
            if (target) {
              target.name = 'コラボ';
              target.paste(img);
              target.trace();
              new oekaki.LayeredCanvas('レイヤー #2');
              layerCounterRef.current = 3;
            }
            // re-populate layer entries
            const updated: LayerEntry[] = oekaki.getLayers().map(inst => ({
              instance: inst,
              name: inst.name,
            })).reverse();
            setLayerEntries(updated);
            layerEntriesRef.current = updated;
            setActiveLayerIndex(0);
            activeLayerIndexRef.current = 0;
          };
        }
      }

      // populate layer entries (topmost first)
      const initEntries: LayerEntry[] = oekaki.getLayers().map(inst => ({
        instance: inst,
        name: inst.name,
      })).reverse();
      setLayerEntries(initEntries);
      layerEntriesRef.current = initEntries;
      setActiveLayerIndex(0);
      activeLayerIndexRef.current = 0;
    };

    loadCanvasContent();

    // onion skin canvas
    const onionCanvas = document.createElement('canvas');
    onionCanvas.width = w;
    onionCanvas.height = h;
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
      if (py === null) { py = y; }

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
      updateOnionSkin();
      forceRender(n => n + 1);
    });

    return () => {
      onionCanvasRef.current = null;
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, [initKey]);

  useEffect(() => {
    if (mountRef.current) {
      mountRef.current.className = 'inline-block' + (showGrid ? ' unj-canvas-grid' : '');
    }
  }, [showGrid]);

  useEffect(() => {
    oekaki.penSize.value = penSize;
    oekaki.brushSize.value = brushSize;
    oekaki.eraserSize.value = eraserSize;
  }, [penSize, brushSize, eraserSize]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const correctCoords = (e: PointerEvent) => {
      const canvas = oekaki.upperLayer.value?.canvas;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      if (sx === 1 && sy === 1) return;
      Object.defineProperty(e, 'clientX', { value: rect.left + (e.clientX - rect.left) * sx, configurable: true });
      Object.defineProperty(e, 'clientY', { value: rect.top + (e.clientY - rect.top) * sy, configurable: true });
    };
    const patchCoalesced = (e: PointerEvent) => {
      for (const ce of e.getCoalescedEvents()) correctCoords(ce);
    };
    const onPointer = (e: PointerEvent) => { correctCoords(e); patchCoalesced(e); };
    const onClick = (e: MouseEvent) => {
      const canvas = oekaki.upperLayer.value?.canvas;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      if (sx === 1 && sy === 1) return;
      Object.defineProperty(e, 'clientX', { value: rect.left + (e.clientX - rect.left) * sx, configurable: true });
      Object.defineProperty(e, 'clientY', { value: rect.top + (e.clientY - rect.top) * sy, configurable: true });
    };
    el.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
    el.addEventListener('pointermove', onPointer, { capture: true, passive: true });
    el.addEventListener('pointerup', onPointer, { capture: true, passive: true });
    el.addEventListener('click', onClick, { capture: true, passive: true });
    el.addEventListener('auxclick', onClick, { capture: true, passive: true });
    return () => {
      el.removeEventListener('pointerdown', onPointer, { capture: true });
      el.removeEventListener('pointermove', onPointer, { capture: true });
      el.removeEventListener('pointerup', onPointer, { capture: true });
      el.removeEventListener('click', onClick, { capture: true });
      el.removeEventListener('auxclick', onClick, { capture: true });
    };
  }, [zoom]);

  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(v => {
        const next = e.deltaY < 0 ? v + 0.25 : v - 0.25;
        return Math.min(4, Math.max(0.25, Math.round(next * 100) / 100));
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

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

  const setLayerOpacity = (i: number, opacity: number) => {
    const entry = layerEntriesRef.current[i];
    if (!entry) return;
    entry.instance.opacity = opacity;
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
      opacity: l.opacity,
      data: new Uint8ClampedArray(l.data),
    })),
  });

  const applyFrame = (frame: FrameData) => {
    for (const l of oekaki.getLayers()) l.delete();
    oekaki.refresh();
    for (const { name, visible, locked, opacity, data } of frame.layers) {
      const l = new oekaki.LayeredCanvas(name);
      l.visible = visible;
      l.locked = locked;
      l.opacity = opacity;
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
        opacity: l.opacity,
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

  const handleImport = async (image: HTMLImageElement, _opts: { opacity: number; simple: boolean }) => {
    const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
    if (!active?.editable) return;
    const bitmap = await createImageBitmap(image);
    active.paste(bitmap);
    active.trace();
    forceRender(n => n + 1);
  };

  const handleSave = () => {
    clearAutosave(storageKey);
    onSave(oekaki.render().toDataURL());
  };

  // 二本指ピンチでキャンバスをズーム。1本指の描画はoekaki側のpointer captureが処理するため干渉しない。
  const handlePinchPointerDown = (e: React.PointerEvent) => {
    pinchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPointsRef.current.size === 2) {
      const [p1, p2] = Array.from(pinchPointsRef.current.values());
      pinchStartDistRef.current = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      pinchStartZoomRef.current = zoom;
    }
  };

  const handlePinchPointerMove = (e: React.PointerEvent) => {
    if (!pinchPointsRef.current.has(e.pointerId)) return;
    pinchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPointsRef.current.size === 2 && pinchStartDistRef.current) {
      const [p1, p2] = Array.from(pinchPointsRef.current.values());
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const ratio = dist / pinchStartDistRef.current;
      const next = Math.min(4, Math.max(0.25, Math.round(pinchStartZoomRef.current * ratio * 100) / 100));
      setZoom(next);
    }
  };

  const handlePinchPointerUp = (e: React.PointerEvent) => {
    pinchPointsRef.current.delete(e.pointerId);
    pinchStartDistRef.current = null;
    if (pinchPointsRef.current.size === 2) {
      const [p1, p2] = Array.from(pinchPointsRef.current.values());
      pinchStartDistRef.current = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      pinchStartZoomRef.current = zoom;
    }
  };

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => { setTool(t); toolRef.current = t; }}
      className={'w-9 h-9 rounded-lg flex items-center justify-center transition-colors ' + (tool === t ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20')}
      title={label}
    >
      {icon}
    </button>
  );

  return (
    <div className="absolute inset-0 bg-[#0f0f11] z-50 flex flex-col select-none">
      <div className="flex items-center px-3.5 py-2 border-b border-gray-800 shrink-0 bg-[#0f0f11] gap-2">
        <button onClick={onClose} className="text-gray-400 hover:bg-gray-100/10 p-1.5 rounded transition-colors">
          <X size={20} />
        </button>
        <span className="font-bold text-xs text-gray-300">キャンセル</span>
        <span className="text-gray-600 text-[10px]">›</span>
        <div className="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => { if (animMode) exitAnimMode(); }}
            className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors ' + (!animMode ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200')}
          >一枚絵</button>
          <button
            onClick={() => enterAnimMode()}
            className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ' + (animMode ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200')}
          ><Film size={12} />アニメ</button>
        </div>
      </div>

      {hasAutosave && (
        <div className="bg-yellow-600/20 border-b border-yellow-800/30 px-4 py-2 flex items-center justify-between text-xs text-yellow-200 shrink-0">
          <span className="flex items-center gap-1.5">
            ⚠️ 未保存のデータ（自動保存）があります。復元しますか？
          </span>
          <div className="flex gap-2">
            <button onClick={handleRestoreAutosave} className="bg-yellow-600 hover:bg-yellow-500 text-gray-900 font-bold px-3 py-1 rounded text-[10px] active:scale-95 transition-transform">
              復元する
            </button>
            <button onClick={handleIgnoreAutosave} className="text-gray-400 hover:text-gray-200 px-2 py-1 rounded text-[10px]">
              無視
            </button>
          </div>
        </div>
      )}

      <div
        ref={canvasAreaRef}
        className="flex-1 bg-[#1a1b26] m-3 mb-1 rounded-xl border border-gray-800 shadow-inner overflow-hidden relative flex items-center justify-center"
        onPointerDown={handlePinchPointerDown}
        onPointerMove={handlePinchPointerMove}
        onPointerUp={handlePinchPointerUp}
        onPointerCancel={handlePinchPointerUp}
      >
        <div ref={mountRef} className="inline-block" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }} />
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
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
          {toolBtn('pen', <Pen size={15} />, 'ペン (1)')}
          {toolBtn('brush', <Brush size={15} />, 'ブラシ (2)')}
          {toolBtn('eraser', <Eraser size={15} />, '消しゴム (3)')}
          {toolBtn('dropper', <Pipette size={15} />, 'スポイト (4)')}
          {toolBtn('fill', <PaintBucket size={15} />, '塗りつぶし (5)')}
          <div className="w-px h-6 bg-gray-800 mx-1" />
          <button
            onClick={() => setShowGrid(v => !v)}
            className={'w-9 h-9 rounded-lg flex items-center justify-center transition-colors ' + (showGrid ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20')}
            title="グリッド (G)"
          >
            <Grid3x3 size={15} />
          </button>
          <button
            onClick={() => setShowLayerPanel(v => !v)}
            className={'w-9 h-9 rounded-lg flex items-center justify-center transition-colors ' + (showLayerPanel ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20')}
            title="レイヤー"
          >
            <Layers size={15} />
          </button>
          <button
            onClick={() => { oekaki.flipped.value = !oekaki.flipped.value; setFlipped(oekaki.flipped.value); }}
            className={'w-9 h-9 rounded-lg flex items-center justify-center transition-colors ' + (flipped ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20')}
            title="左右反転"
          >
            <FlipHorizontal size={15} />
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
                className={'w-5 h-5 rounded-sm border ' + (color === c ? 'border-white scale-110' : 'border-gray-700/50') + ' transition-transform'}
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
                  className="w-5 h-5 rounded-sm border border-gray-700/50 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  onClick={() => applyColor(c)}
                />
              ))}
            </div>
          </div>
        )}

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
          <button onClick={() => setShowImport(true)} className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] hover:bg-gray-100/20">
            <Upload size={11} />
            <span>読込</span>
          </button>
          <button onClick={() => setShowHistory(true)} className="px-2 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center space-x-1 text-[10px] transition-colors">
            <History size={11} />
            <span>履歴</span>
          </button>
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
          onOpacityChange={setLayerOpacity}
          onAdd={addLayer}
          onDelete={deleteLayer}
          onClose={() => setShowLayerPanel(false)}
        />
      )}
      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        walkMode={false}
        walkPresets={[]}
      />
      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        storageKey={storageKey}
        type="drawing"
        onRestore={handleRestoreHistory}
        getCurrentData={getCurrentState}
      />
    </div>
  );
}
