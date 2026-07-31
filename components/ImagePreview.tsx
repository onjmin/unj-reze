'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ImagePreviewProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function ImagePreview({ src, alt, onClose }: ImagePreviewProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [closing, setClosing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef({ startX: 0, startY: 0, startOffX: 0, startOffY: 0 });
  const pinchRef = useRef({ pinching: false, startDist: 0, startZoom: 1 });

  const clampOffset = useCallback((ox: number, oy: number, z: number) => {
    if (z <= 1) return { x: 0, y: 0 };
    const el = containerRef.current;
    if (!el) return { x: ox, y: oy };
    const maxX = (el.clientWidth * (z - 1)) / 2;
    const maxY = (el.clientHeight * (z - 1)) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, ox)), y: Math.max(-maxY, Math.min(maxY, oy)) };
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setZoom(z => {
      const next = Math.max(0.5, Math.min(5, z - e.deltaY * 0.002));
      setOffset(o => clampOffset(o.x, o.y, next));
      return next;
    });
  }, [clampOffset]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // passive: false を明示して登録
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && e.isPrimary === false) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffX: offset.x, startOffY: offset.y };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [offset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging && zoom > 1) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setOffset(clampOffset(dragRef.current.startOffX + dx, dragRef.current.startOffY + dy, zoom));
    }
  }, [dragging, zoom, clampOffset]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { pinching: true, startDist: Math.hypot(dx, dy), startZoom: zoom };
    }
  }, [zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current.pinching) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchRef.current.startDist;
      const next = Math.max(0.5, Math.min(5, pinchRef.current.startZoom * scale));
      setZoom(next);
      setOffset(o => clampOffset(o.x, o.y, next));
    }
  }, [clampOffset]);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current.pinching = false;
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleTransitionEnd = useCallback((e: React.TransitionEvent) => {
    if (e.propertyName === 'opacity' && closing) {
      onClose();
    }
  }, [closing, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const resetZoom = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center transition-opacity duration-250 ease-out"
      style={{
        /* 中心が濃い白(不透明度0.8)、外側に向かって薄い白(不透明度0.2)になるグラデーション */
        background: 'radial-gradient(ellipse, rgba(255,255,255,1) 0%, rgba(255,255,255,0.8) 100%)',
        opacity: closing ? 0 : 1,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
        {zoom !== 1 && (
          <button onClick={resetZoom}
            className="p-2 bg-gray-800/80 hover:bg-gray-700 rounded-full text-white transition-colors">
            <RotateCcw size={18} />
          </button>
        )}
        <button onClick={() => { const n = Math.min(5, zoom + 0.5); setZoom(n); setOffset(o => clampOffset(o.x, o.y, n)); }}
          className="p-2 bg-gray-800/80 hover:bg-gray-700 rounded-full text-white transition-colors">
          <ZoomIn size={18} />
        </button>
        <button onClick={() => { const n = Math.max(0.5, zoom - 0.5); setZoom(n); setOffset(o => clampOffset(o.x, o.y, n)); }}
          className="p-2 bg-gray-800/80 hover:bg-gray-700 rounded-full text-white transition-colors">
          <ZoomOut size={18} />
        </button>
        <button onClick={handleClose}
          className="p-2 bg-gray-800/80 hover:bg-gray-700 rounded-full text-white transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Zoom indicator */}
      {zoom !== 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-gray-800/80 rounded-full text-xs text-gray-300 font-mono">
          {Math.round(zoom * 100)}%
        </div>
      )}

      {/* Image */}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center touch-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt || ''}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${closing ? 0.92 : zoom})`,
            opacity: closing ? 0 : 1,
            transition: dragging ? 'opacity 250ms ease-out' : 'transform 0.15s ease-out, opacity 250ms ease-out',
          }}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
