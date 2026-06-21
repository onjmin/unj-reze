'use client';

import { useEffect, useRef, useState } from 'react';
import {
  type WayKey, type WalkStandard,
  standardById, detectStandard, animatedCell, loadImage,
} from '@/lib/walk-sprite';

interface WalkSpritePreviewProps {
  /** 歩行グラのシート画像URL */
  url: string;
  /** 規格id（'auto' で実寸から自動推定）。既定 'auto' */
  stdId?: string;
  /** 表示サイズ(px, 正方枠)。既定 64 */
  size?: number;
  /** 固定の向き。未指定なら一定間隔で4方向を巡回（ショーケース） */
  dir?: WayKey;
  /** 足踏みするか（停止時は待機ポーズ）。既定 true */
  walking?: boolean;
  /** 足踏みfps。既定 6 */
  fps?: number;
  className?: string;
}

const SHOWCASE_DIRS: WayKey[] = ['s', 'a', 'd', 'w'];

// 1枚のシート歩行グラを canvas でアニメーション表示する。
// AssetBrowser やエディタのプレビューで使う（モバイル・ドット絵想定で pixelated 描画）。
export default function WalkSpritePreview({
  url, stdId = 'auto', size = 64, dir, walking = true, fps = 6, className,
}: WalkSpritePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let raf = 0;
    let img: HTMLImageElement | null = null;
    let std: WalkStandard | null = null;
    let cancelled = false;
    setError(false);

    loadImage(url).then((loaded) => {
      if (cancelled) return;
      img = loaded;
      std = stdId === 'auto' ? detectStandard(loaded.naturalWidth, loaded.naturalHeight) : standardById(stdId);
      raf = requestAnimationFrame(render);
    }).catch(() => { if (!cancelled) setError(true); });

    const render = (t: DOMHighResTimeStamp) => {
      raf = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      if (!canvas || !img || !std) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const timeSec = t / 1000;
      const curDir = dir ?? SHOWCASE_DIRS[Math.floor(timeSec / 0.9) % SHOWCASE_DIRS.length];
      const cell = animatedCell(std, img.naturalWidth, img.naturalHeight, {
        dir: curDir, moving: walking, timeSec, fps,
      });

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;

      // セルのアスペクト比を保ったまま枠にフィット
      const scale = Math.min(size / cell.sw, size / cell.sh);
      const dw = cell.sw * scale;
      const dh = cell.sh * scale;
      const dx = (size - dw) / 2;
      const dy = (size - dh) / 2;
      ctx.drawImage(img, cell.sx, cell.sy, cell.sw, cell.sh, dx, dy, dw, dh);
    };

    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [url, stdId, size, dir, walking, fps]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-900 text-gray-600 text-[9px] ${className ?? ''}`}
        style={{ width: size, height: size }}
      >
        ✕
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className={className}
    />
  );
}
