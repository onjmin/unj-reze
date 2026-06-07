'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Pen, Eraser, Minus, Triangle, PaintBucket,
  Layers, Trash2, Undo, Redo
} from 'lucide-react';

interface DrawingEditorProps {
  onClose: () => void;
  onSave: (data: string) => void;
}

export default function DrawingEditor({ onClose, onSave }: DrawingEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.parentElement!.clientWidth;
    canvas.height = canvas.parentElement!.clientHeight || 320;

    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveHistory(canvas);
  }, []);

  const saveHistory = (canvas: HTMLCanvasElement) => {
    const dataUrl = canvas.toDataURL();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(dataUrl);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoordinates(e);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.lineWidth = tool === 'eraser' ? 24 : 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#1a1b26' : currentColor;
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveHistory(canvasRef.current!);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      restoreFromHistory(history[idx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      restoreFromHistory(history[idx]);
    }
  };

  const restoreFromHistory = (dataUrl: string) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveHistory(canvas);
  };

  const colorsRow1 = ['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
  const colorsRow2 = ['#6b7280', '#ec4899', '#f43f5e', '#14b8a6', '#facc15', '#fed7aa', '#60a5fa', '#a855f7'];

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

      <div className="flex-1 bg-[#1a1b26] m-3 mb-1 rounded-xl border border-gray-800 shadow-inner overflow-hidden relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full block cursor-crosshair"
        />
        <div className="absolute bottom-2 left-2.5 bg-black/60 px-2 py-0.5 rounded text-[10px] text-gray-500 pointer-events-none">
          キャンバスに触れて描画
        </div>
      </div>

      <div className="px-3.5 pb-4 pt-2.5 space-y-2.5 shrink-0 bg-[#0f0f11] border-t border-gray-900">
        <div className="flex space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setTool('pen')}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${tool === 'pen' ? 'bg-blue-600 text-white' : 'bg-gray-100/10 text-gray-300'}`}
          >
            <Pen size={15} />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${tool === 'eraser' ? 'bg-blue-600 text-white' : 'bg-gray-100/10 text-gray-300'}`}
          >
            <Eraser size={15} />
          </button>
          <div className="w-px h-6 bg-gray-800 self-center"></div>
          <button className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100/10 text-gray-300"><Minus size={15} className="rotate-45" /></button>
          <button className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100/10 text-gray-300"><Triangle size={15} /></button>
          <button className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100/10 text-gray-300"><PaintBucket size={15} /></button>
          <button className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100/10 text-gray-300"><Layers size={15} /></button>
        </div>

        <div className="flex justify-between items-center text-xs">
          <span className="bg-gray-100/5 px-2.5 py-1 rounded border border-gray-800 font-bold text-[9px] text-gray-400">
            {tool === 'pen' ? '🖋️ ペンモード' : '🧼 消しゴムモード'}
          </span>
          <div className="flex space-x-1.5">
            <button onClick={clearCanvas} className="w-7 h-7 rounded bg-red-950/20 text-red-400 border border-red-900/30 flex items-center justify-center">
              <Trash2 size={13} />
            </button>
            <button onClick={handleUndo} disabled={historyIndex <= 0} className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center disabled:opacity-40">
              <Undo size={11} className="mr-1" /> 進む
            </button>
            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center disabled:opacity-40">
              <Redo size={11} className="mr-1" /> 戻る
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-3 pt-0.5">
          <div className="relative w-9 h-9 shrink-0 rounded border border-gray-700 overflow-hidden" style={{ backgroundColor: currentColor }} />
          <div className="flex-1 flex flex-col space-y-1">
            <div className="flex justify-between space-x-1">
              {colorsRow1.map(c => <button key={c} className={`h-5 flex-1 rounded-sm border ${currentColor === c ? 'border-white' : 'border-gray-700/50'}`} style={{ backgroundColor: c }} onClick={() => { setCurrentColor(c); setTool('pen'); }} />)}
            </div>
            <div className="flex justify-between space-x-1">
              {colorsRow2.map(c => <button key={c} className={`h-5 flex-1 rounded-sm border ${currentColor === c ? 'border-white' : 'border-gray-700/50'}`} style={{ backgroundColor: c }} onClick={() => { setCurrentColor(c); setTool('pen'); }} />)}
            </div>
          </div>
        </div>

        <button onClick={() => onSave(canvasRef.current!.toDataURL())} className="w-full bg-[#1db854] hover:bg-[#1ed760] text-gray-900 font-bold py-2.5 rounded-lg shadow-lg mt-1 transition-colors text-xs">
          この絵を投稿に添付する 🌱
        </button>
      </div>
    </div>
  );
}
