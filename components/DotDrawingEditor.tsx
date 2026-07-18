'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Pen, Eraser, PaintBucket, Pipette,
  Trash2, Undo, Redo, Save, Maximize2, Layers, Film, Upload, History, FlipHorizontal,
  Sun, Moon
} from 'lucide-react';
import * as oekaki from '@onjmin/oekaki';
import LayerPanel from './LayerPanel';
import type { LayerEntry } from './LayerPanel';
import AnimationBar from './AnimationBar';
import type { FrameData } from './AnimationBar';
import WalkCyclePanel from './WalkCyclePanel';
import ImportDialog from './ImportDialog';
import { presets as walkPresets, detectPreset, type WalkPreset } from '@/lib/walk-cycle';
import HistoryModal from './HistoryModal';
import { getStorageKey, getAutosave, saveAutosave, clearAutosave, saveHistory, serializeLayers, deserializeLayers, serializeFrames, deserializeFrames, serializeWalkLayers, deserializeWalkLayers, DrawingEditorState } from '@/lib/history';

interface DotDrawingEditorProps {
  onClose: () => void;
  onSave: (data: string, checkeredDark: boolean) => void;
  collabImageUrl?: string;
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

export default function DotDrawingEditor({ onClose, onSave, collabImageUrl }: DotDrawingEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef<Tool>('pen');
  const colorRef = useRef('#000000');
  const collabRef = useRef(collabImageUrl);
  const [walkMode, setWalkMode] = useState(false);
  const [walkPreset, setWalkPreset] = useState<WalkPreset>(walkPresets[1]);
  const [walkActiveIndex, setWalkActiveIndex] = useState(0);
  const [initKey, setInitKey] = useState(0);
  const walkDataRef = useRef<Map<number, string>>(new Map());
  const walkLayersRef = useRef<Map<number, { layers: { name: string; visible: boolean; locked: boolean; opacity: number; data: Uint8ClampedArray }[] }>>(new Map());
  const walkModeRef = useRef(walkMode);
  const walkPresetRef = useRef(walkPreset);
  const walkActiveIndexRef = useRef(0);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [zoom, setZoom] = useState(1);
  const [flipped, setFlipped] = useState(false);
  const [checkeredDark, setCheckeredDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('unj-dotdrawing-checkered-dark') !== 'false';
  });
  const canvasSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const pinchPointsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
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
  const [isDragover, setIsDragover] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // History & Autosave States
  const [showHistory, setShowHistory] = useState(false);
  const [hasAutosave, setHasAutosave] = useState(false);
  const [autosaveData, setAutosaveData] = useState<DrawingEditorState | null>(null);
  const [restoredState, setRestoredState] = useState<DrawingEditorState | null>(null);
  const storageKey = getStorageKey('dotdrawing');

  toolRef.current = tool;
  colorRef.current = color;
  walkModeRef.current = walkMode;
  walkPresetRef.current = walkPreset;

  const applyColor = (c: string) => {
    setColor(c);
    oekaki.color.value = c;
    setRecentColors(prev => {
      const filtered = prev.filter(x => x !== c);
      return [c, ...filtered].slice(0, 8);
    });
  };

  const CANVAS_SIZE = 384;

  const notDrawing = (e: Event) => {
    const target = e.target as HTMLElement;
    return (
      !window.getSelection()?.isCollapsed ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    );
  };

  const pasteImage = async (blob: Blob, pasteOpacity = 1) => {
    const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
    if (!active?.editable) return;
    const dotSize = oekaki.getDotSize();
    const isWalk = walkModeRef.current;
    const cw = active.canvas.width;
    const ch = active.canvas.height;
    const gw = isWalk ? walkPresetRef.current.w : Math.round(cw / dotSize);
    const gh = isWalk ? walkPresetRef.current.h : Math.round(ch / dotSize);
    const bitmap = await createImageBitmap(blob);
    const temp = document.createElement('canvas');
    temp.width = gw;
    temp.height = gh;
    const ctx = temp.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    const ratio = Math.min(gw / srcW, gh / srcH);
    const dstW = srcW * ratio;
    const dstH = srcH * ratio;
    const ox = (gw - dstW) / 2;
    const oy = (gh - dstH) / 2;
    ctx.drawImage(bitmap, ox, oy, dstW, dstH);
    const { data } = ctx.getImageData(0, 0, gw, gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = (y * gw + x) * 4;
        const [r, g, b, a] = data.subarray(i, i + 4);
        if (!a) continue;
        oekaki.color.value = `rgba(${r},${g},${b},${a / 255 * pasteOpacity})`;
        active.drawByDot(x * dotSize, y * dotSize);
        active.used = true;
      }
    }
    active.trace();
    forceRender(n => n + 1);
  };

  const handleImport = async (image: HTMLImageElement, opts: { opacity: number; simple: boolean }) => {
    if (walkMode && !opts.simple) {
      const preset = detectPreset(image.naturalWidth, image.naturalHeight);
      if (preset) {
        const dotSize = Math.floor(CANVAS_SIZE / preset.h);
        const canvasW = preset.w * dotSize;
        const canvasH = preset.h * dotSize;
        const temp = document.createElement('canvas');
        temp.width = preset.w;
        temp.height = preset.h;
        const ctx = temp.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        const total = preset.frames * preset.ways.length;
        const newMap = new Map<number, { layers: { name: string; visible: boolean; locked: boolean; opacity: number; data: Uint8ClampedArray }[] }>();
        for (let i = 0; i < total; i++) {
          const cellX = i % preset.frames;
          const cellY = Math.floor(i / preset.frames);
          ctx.clearRect(0, 0, preset.w, preset.h);
          ctx.drawImage(image, cellX * preset.w, cellY * preset.h, preset.w, preset.h, 0, 0, preset.w, preset.h);
          const { data: pixelData } = ctx.getImageData(0, 0, preset.w, preset.h);
          const buf = new Uint8ClampedArray(canvasW * canvasH * 4);
          for (let y = 0; y < preset.h; y++) {
            for (let x = 0; x < preset.w; x++) {
              const srcIdx = (y * preset.w + x) * 4;
              const a = pixelData[srcIdx + 3];
              if (!a) continue;
              const r = pixelData[srcIdx];
              const g = pixelData[srcIdx + 1];
              const b = pixelData[srcIdx + 2];
              const aa = Math.round(a * opts.opacity);
              for (let dy = 0; dy < dotSize; dy++) {
                for (let dx = 0; dx < dotSize; dx++) {
                  const dstIdx = ((y * dotSize + dy) * canvasW + (x * dotSize + dx)) * 4;
                  buf[dstIdx] = r;
                  buf[dstIdx + 1] = g;
                  buf[dstIdx + 2] = b;
                  buf[dstIdx + 3] = aa;
                }
              }
            }
          }
          newMap.set(i, { layers: [{ name: 'レイヤー #1', visible: true, locked: false, opacity: 100, data: buf }] });
        }
        walkDataRef.current.clear();
        for (let i = 0; i < total; i++) {
          const w = canvasW;
          const h = canvasH;
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const cx = c.getContext('2d');
          if (cx) {
            const id = cx.createImageData(w, h);
            id.data.set(newMap.get(i)!.layers[0].data);
            cx.putImageData(id, 0, 0);
            walkDataRef.current.set(i, c.toDataURL('image/png'));
          }
        }
        walkLayersRef.current = newMap;
        setWalkPreset(preset);
        setWalkActiveIndex(0);
        walkActiveIndexRef.current = 0;
        setWalkMode(true);
        setInitKey(k => k + 1);
        return;
      }
    }
    const blob = await fetch(image.src, { cache: 'no-store' }).then(r => r.blob()).catch(() => null);
    if (blob) pasteImage(blob, opts.opacity);
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (notDrawing(e)) return;
    const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
    if (!active?.editable) return;
    let imageItem: DataTransferItem | null = null;
    for (const v of e.clipboardData?.items ?? []) {
      if (v.kind === 'file' && v.type.startsWith('image/')) {
        imageItem = v;
        break;
      }
    }
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) pasteImage(file);
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
    const w = canvas.width, h = canvas.height;
    if (walkModeRef.current) {
      const idx = walkActiveIndexRef.current - 1;
      if (idx < 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, w, h);
        return;
      }
      const cellData = walkLayersRef.current.get(idx);
      if (!cellData || cellData.layers.length === 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, w, h);
        return;
      }
      const temp = document.createElement('canvas');
      temp.width = w; temp.height = h;
      const tempCtx = temp.getContext('2d')!;
      for (const l of cellData.layers) {
        if (!l.visible) continue;
        tempCtx.putImageData(new ImageData(new Uint8ClampedArray(l.data), w, h), 0, 0);
      }
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = onionSkinOpacityRef.current / 100;
      ctx.drawImage(temp, 0, 0);
      ctx.globalAlpha = 1;
      return;
    }
    const idx = currentFrameRef.current - 1;
    if (idx < 0 || !framesRef.current[idx]) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const prev = framesRef.current[idx];
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

  const nudge = (dx: number, dy: number) => {
    const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
    if (!active) return;
    const dotSize = oekaki.getDotSize();
    const w = active.canvas.width;
    const h = active.canvas.height;
    const src = new Uint8ClampedArray(active.data);
    const dst = new Uint8ClampedArray(src.length);
    const px = dx * dotSize;
    const py = dy * dotSize;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = x - px;
        const sy = y - py;
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
        const si = (sy * w + sx) * 4;
        const di = (y * w + x) * 4;
        dst[di] = src[si];
        dst[di + 1] = src[si + 1];
        dst[di + 2] = src[si + 2];
        dst[di + 3] = src[si + 3];
      }
    }
    active.data = dst;
    active.trace();
    if (walkModeRef.current) {
      walkDataRef.current.set(walkActiveIndexRef.current, oekaki.render().toDataURL('image/png'));
    }
    updateOnionSkin();
    forceRender(n => n + 1);
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
        saveHistory(storageKey, state, 'dotdrawing', 50);
      }
    }, 1800000);

    return () => {
      clearInterval(autosaveInterval);
      clearInterval(historyInterval);
    };
  }, [storageKey, animMode, walkMode, zoom, walkActiveIndex, gridH]);

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

    if (walkModeRef.current) {
      const prev = walkActiveIndexRef.current;
      const prevLayers = oekaki.getLayers();
      walkLayersRef.current.set(prev, {
        layers: prevLayers.map(l => ({
          name: l.name,
          visible: l.visible,
          locked: l.locked,
          opacity: l.opacity,
          data: new Uint8ClampedArray(l.data),
        }))
      });
      return {
        mode: 'walk',
        width: w,
        height: h,
        gridW,
        gridH,
        zoom,
        walkPreset,
        walkActiveIndex: walkActiveIndexRef.current,
        walkLayers: serializeWalkLayers(walkLayersRef.current, w, h)
      };
    } else if (animMode) {
      framesRef.current[currentFrameRef.current] = captureFrame();
      return {
        mode: 'anim',
        width: w,
        height: h,
        gridW,
        gridH,
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
        gridW,
        gridH,
        zoom,
        layers: serializeLayers(oekaki.getLayers(), w, h)
      };
    }
  };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    el.innerHTML = '';

    const isWalk = restoredState ? (restoredState.mode === 'walk') : walkModeRef.current;
    const preset = restoredState ? restoredState.walkPreset : walkPresetRef.current;
    const canvasW = isWalk ? Math.floor(CANVAS_SIZE * (preset.w / preset.h)) : CANVAS_SIZE;
    const canvasH = CANVAS_SIZE;

    const w = restoredState ? restoredState.width : canvasW;
    const h = restoredState ? restoredState.height : canvasH;

    oekaki.init(el, w, h);
    oekaki.flipped.value = false;
    setFlipped(false);
    canvasSizeRef.current = { w, h };
    if (isWalk) {
      oekaki.setDotSize(1, preset.h);
    } else {
      oekaki.setDotSize(1, restoredState ? restoredState.gridH : gridH);
    }

    oekaki.lowerLayer.value?.canvas.classList.add('gimp-checkered-background');
    oekaki.upperLayer.value?.canvas.classList.add('upper-canvas');
    oekaki.color.value = colorRef.current;

    const loadCanvasContent = async () => {
      if (restoredState) {
        setGridW(restoredState.gridW);
        setGridH(restoredState.gridH);
        setZoom(restoredState.zoom);

        if (restoredState.mode === 'walk' && restoredState.walkLayers) {
          const deserializedWalkLayers = await deserializeWalkLayers(restoredState.walkLayers, w, h);
          walkLayersRef.current = deserializedWalkLayers;

          walkDataRef.current.clear();
          for (const [key, val] of deserializedWalkLayers.entries()) {
            const temp = document.createElement('canvas');
            temp.width = w;
            temp.height = h;
            const tempCtx = temp.getContext('2d');
            if (tempCtx) {
              const id = tempCtx.createImageData(w, h);
              id.data.set(val.layers[0].data);
              tempCtx.putImageData(id, 0, 0);
              walkDataRef.current.set(key, temp.toDataURL('image/png'));
            }
          }

          setWalkPreset(restoredState.walkPreset);
          setWalkActiveIndex(restoredState.walkActiveIndex || 0);
          walkActiveIndexRef.current = restoredState.walkActiveIndex || 0;
          setWalkMode(true);

          for (const l of oekaki.getLayers()) l.delete();
          oekaki.refresh();
          const cellData = deserializedWalkLayers.get(restoredState.walkActiveIndex || 0);
          if (cellData && cellData.layers.length > 0) {
            for (const { name, visible, locked, opacity, data } of cellData.layers) {
              const l = new oekaki.LayeredCanvas(name);
              l.visible = visible;
              l.locked = locked;
              l.opacity = opacity;
              l.data = new Uint8ClampedArray(data);
            }
          } else {
            new oekaki.LayeredCanvas('レイヤー #1');
          }
        } else if (restoredState.mode === 'anim' && restoredState.frames) {
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
        }
        setRestoredState(null);
      } else {
        if (isWalk) {
          const cellData = walkLayersRef.current.get(walkActiveIndexRef.current);
          if (cellData && cellData.layers.length > 0) {
            for (const { name, visible, locked, opacity, data } of cellData.layers) {
              const l = new oekaki.LayeredCanvas(name);
              l.visible = visible;
              l.locked = locked;
              l.opacity = opacity;
              l.data = new Uint8ClampedArray(data);
            }
          } else {
            new oekaki.LayeredCanvas('レイヤー #1');
          }
          layerCounterRef.current = 2;
        } else {
          new oekaki.LayeredCanvas('レイヤー #1');
          layerCounterRef.current = 2;

          if (collabRef.current) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = collabRef.current;
            img.onload = () => {
              const layers = oekaki.getLayers();
              const target = layers[0];
              if (target) {
                target.name = 'コラボ';
                target.paste(img);
                target.trace();
                new oekaki.LayeredCanvas('レイヤー #2');
                layerCounterRef.current = 3;
              }
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
      }

      // populate layer entries (topmost first)
      syncLayerEntries();
      updateOnionSkin();
      forceRender(n => n + 1);
    };

    loadCanvasContent();

    const onionCanvas = document.createElement('canvas');
    onionCanvas.width = w;
    onionCanvas.height = h;
    onionCanvas.style.position = 'absolute';
    onionCanvas.style.zIndex = '2';
    onionCanvas.style.left = '0';
    onionCanvas.style.top = '0';
    onionCanvas.style.pointerEvents = 'none';
    onionCanvas.style.display = onionSkinRef.current ? 'block' : 'none';
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
      const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
      if (active?.modified()) active.trace();

      if (toolRef.current === 'fill') {
        const rgb = colorRef.current.slice(1).match(/.{2}/g)?.map(v => parseInt(v, 16));
        if (!rgb) return;
        const active = layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
        if (!active) return;
        const fw = active.canvas.width;
        const fh = active.canvas.height;
        const result = oekaki.floodFill(active.data, fw, fh, x, y, [rgb[0], rgb[1], rgb[2], 255]);
        if (result) active.data = result;
        active.trace();
      }
      updateOnionSkin();
      if (walkModeRef.current) {
        walkDataRef.current.set(walkActiveIndexRef.current, oekaki.render().toDataURL('image/png'));
      }
      forceRender(n => n + 1);
    });

    return () => {
      onionCanvasRef.current = null;
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, [initKey]);

  useEffect(() => {
    if (walkModeRef.current) return;
    oekaki.setDotSize(1, gridH);
    document.documentElement.style.setProperty('--grid-cell-size', `${oekaki.getDotSize()}px`);
  }, [gridW, gridH]);

  useEffect(() => {
    const cv = oekaki.lowerLayer.value?.canvas;
    if (!cv) return;
    cv.classList.remove('gimp-checkered-background', 'gimp-checkered-background-white');
    cv.classList.add(checkeredDark ? 'gimp-checkered-background' : 'gimp-checkered-background-white');
    localStorage.setItem('unj-dotdrawing-checkered-dark', String(checkeredDark));
  }, [checkeredDark]);

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



  const changeSize = (w: number, h: number) => {
    setGridW(w);
    setGridH(h);
    setShowPresets(false);
  };

  useEffect(() => {
    if (!walkMode) return;
    if (walkActiveIndex === walkActiveIndexRef.current) return;
    const prev = walkActiveIndexRef.current;
    const prevLayers = oekaki.getLayers();
    walkLayersRef.current.set(prev, {
      layers: prevLayers.map(l => ({
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        data: new Uint8ClampedArray(l.data),
      }))
    });
    walkActiveIndexRef.current = walkActiveIndex;
    for (const l of oekaki.getLayers()) l.delete();
    oekaki.refresh();
    const cellData = walkLayersRef.current.get(walkActiveIndex);
    if (cellData && cellData.layers.length > 0) {
      for (const { name, visible, locked, opacity, data } of cellData.layers) {
        const l = new oekaki.LayeredCanvas(name);
        l.visible = visible;
        l.locked = locked;
        l.opacity = opacity;
        l.data = new Uint8ClampedArray(data);
      }
    } else {
      new oekaki.LayeredCanvas('レイヤー #1');
    }
    syncLayerEntries();
    updateOnionSkin();
  }, [walkActiveIndex, walkMode]);

  const enterWalkMode = () => {
    if (animMode) exitAnimMode();
    setWalkPreset(walkPresets[1]);
    setWalkActiveIndex(0);
    walkActiveIndexRef.current = 0;
    setWalkMode(true);
    setInitKey(k => k + 1);
  };

  const exitWalkMode = () => {
    walkLayersRef.current.set(walkActiveIndex, {
      layers: oekaki.getLayers().map(l => ({
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        data: new Uint8ClampedArray(l.data),
      }))
    });
    walkDataRef.current.clear();
    setWalkMode(false);
    setInitKey(k => k + 1);
  };

  const selectWalkCell = (index: number) => {
    setWalkActiveIndex(index);
  };

  const handleChangeWalkPreset = (preset: WalkPreset) => {
    walkLayersRef.current.clear();
    walkDataRef.current.clear();
    setWalkPreset(preset);
    setWalkActiveIndex(0);
    walkActiveIndexRef.current = 0;
    setInitKey(k => k + 1);
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
    if (walkMode) exitWalkMode();
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
    const el = mountRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => {
      if (!(e.dataTransfer?.types ?? []).some(t => t === 'Files')) return;
      e.preventDefault();
      setIsDragover(true);
    };
    const onDragLeave = () => setIsDragover(false);
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragover(false);
      const file = e.dataTransfer?.files[0];
      if (file && (file.type.startsWith('image/') || file.name.endsWith('.cur'))) {
        pasteImage(file);
      }
    };
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
    };
  });

  const handleSave = () => {
    clearAutosave(storageKey);
    const canvas = oekaki.render();
    onSave(canvas.toDataURL('image/png'), checkeredDark);
  };

  const zoomIn = () => setZoom(v => Math.min(4, Math.round((v + 0.25) * 100) / 100));
  const zoomOut = () => setZoom(v => Math.max(0.25, Math.round((v - 0.25) * 100) / 100));

  // 二本指ピンチでキャンバスをズーム。1本指の描画はcanvas側のpointer captureが処理するため干渉しない。
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
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('paste', handlePaste);
    };
  });

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => { setTool(t); toolRef.current = t; }}
      className={'w-8 h-8 rounded-lg flex items-center justify-center transition-colors ' + (tool === t ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20')}
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
            onClick={() => { if (animMode) exitAnimMode(); if (walkMode) exitWalkMode(); }}
            className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors ' + (!animMode && !walkMode ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200')}
          >一枚絵</button>
          <button
            onClick={() => { if (walkMode) exitWalkMode(); enterAnimMode(); }}
            className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ' + (animMode ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200')}
          ><Film size={12} />アニメ</button>
          <button
            onClick={() => { if (animMode) exitAnimMode(); enterWalkMode(); }}
            className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ' + (walkMode ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200')}
          ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M13 4a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" /><path d="M4 20h3l2-6 3-2 2 6 3 3" /><path d="M8 5 6 9l2 3" /><path d="M16 5l2 3-1 4" /></svg>歩行グラ</button>
        </div>
        <div className="ml-auto flex items-center space-x-2">
          {walkMode ? (
            <span className="text-[9px] text-gray-600">{walkPreset.w}×{walkPreset.h} / {walkPreset.frames}fr / {walkPreset.ways.length}方向</span>
          ) : (
            <>
              <span className="text-[9px] text-gray-600">{gridW}×{gridH}</span>
              <button onClick={() => setShowPresets(v => !v)} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/20">
                <Maximize2 size={12} />
              </button>
            </>
          )}
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

      {!walkMode && showPresets && (
        <div className="absolute top-10 right-3 z-50 bg-[#1a1b26] border border-gray-700 rounded-lg shadow-xl p-2 grid grid-cols-4 gap-1">
          {SIZE_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => changeSize(p.w, p.h)}
              className={'px-2 py-1.5 rounded text-[10px] transition-colors ' + (gridW === p.w && gridH === p.h ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-100/10')}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div
        ref={canvasAreaRef}
        className={'flex-1 flex items-center justify-center bg-[#1a1b26] m-3 mb-1 rounded-xl border border-gray-800 shadow-inner overflow-hidden p-4' + (isDragover ? ' ring-4 ring-blue-400/60' : '')}
        onPointerDown={handlePinchPointerDown}
        onPointerMove={handlePinchPointerMove}
        onPointerUp={handlePinchPointerUp}
        onPointerCancel={handlePinchPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div ref={mountRef} className="inline-block unj-canvas-grid" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }} />
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

      {walkMode && (
        <WalkCyclePanel
          preset={walkPreset}
          activeIndex={walkActiveIndex}
          dataUrlByIndex={walkDataRef.current}
          onSelectCell={selectWalkCell}
          onChangePreset={handleChangeWalkPreset}
          onionSkin={onionSkin}
          onionSkinOpacity={onionSkinOpacity}
          onToggleOnionSkin={toggleOnionSkin}
          onOnionSkinOpacityChange={handleOnionSkinOpacityChange}
          onNudge={nudge}
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
            className={'w-8 h-8 rounded-lg flex items-center justify-center transition-colors ' + (showLayerPanel ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20')}
            title="レイヤー"
          >
            <Layers size={13} />
          </button>
          <button
            onClick={() => { oekaki.flipped.value = !oekaki.flipped.value; setFlipped(oekaki.flipped.value); }}
            className={'w-8 h-8 rounded-lg flex items-center justify-center transition-colors ' + (flipped ? 'bg-blue-600 text-white shadow' : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/20')}
            title="左右反転"
          >
            <FlipHorizontal size={13} />
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
                className={'w-4 h-4 rounded-sm border ' + (color === c ? 'border-white scale-110' : 'border-gray-700/50') + ' transition-transform'}
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
            <button onClick={() => setShowImport(true)} className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] hover:bg-gray-100/20">
              <Upload size={10} />
              <span>読込</span>
            </button>
            <button onClick={() => setShowHistory(true)} className="px-2 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center space-x-1 text-[9px] transition-colors">
              <History size={10} />
              <span>履歴</span>
            </button>
            <button onClick={handleUndo} className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] disabled:opacity-40">
              <Undo size={10} />
              <span>戻る</span>
            </button>
            <button onClick={handleRedo} className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] disabled:opacity-40">
              <Redo size={10} />
              <span>進む</span>
            </button>
            <button onClick={() => setCheckeredDark(v => !v)} className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] hover:bg-gray-100/20" title={checkeredDark ? 'ライト背景' : 'ダーク背景'}>
              {checkeredDark ? <Sun size={10} /> : <Moon size={10} />}
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
        walkMode={walkMode}
        walkPresets={walkPresets}
      />
      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        storageKey={storageKey}
        type="dotdrawing"
        onRestore={handleRestoreHistory}
        getCurrentData={getCurrentState}
      />
    </div>
  );
}
