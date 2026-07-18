'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PlaySquare } from 'lucide-react';
import GamePreview from './GamePreview';
import { PLAY_W, PLAY_H } from './game-presets/shared';

const THUMBNAIL_HEIGHT = 120;
const ANIMATION_MS = 400;

interface GameBoxProps {
  gameId: string;
  postId: string;
  gameTitle: string;
  gameThumbnail?: string;
  userId?: string;
  className?: string;
}

export default function GameBox({ gameId, postId, gameTitle, gameThumbnail, userId, className }: GameBoxProps) {
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open' | 'closing'>('closed');
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setMeasuredWidth(e.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const fullHeight = measuredWidth > 0 ? measuredWidth * (PLAY_H / PLAY_W) + 40 : THUMBNAIL_HEIGHT;
  const isOpen = phase === 'opening' || phase === 'open';
  const currentHeight = isOpen ? fullHeight : THUMBNAIL_HEIGHT;

  const handleOpen = useCallback(() => {
    setPhase(prev => (prev === 'closed' || prev === 'closing') ? 'opening' : prev);
  }, []);

  const handleClose = useCallback(() => {
    setPhase(prev => (prev === 'open' || prev === 'opening') ? 'closing' : prev);
  }, []);

  const handleTransitionEnd = useCallback((e: React.TransitionEvent) => {
    if (e.propertyName !== 'height') return;
    setPhase(prev => {
      if (prev === 'opening') return 'open';
      if (prev === 'closing') return 'closed';
      return prev;
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-xl overflow-hidden border border-gray-800 ${className ?? ''}`}
      style={{
        height: currentHeight,
        transition: `height ${ANIMATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* Thumbnail */}
      <div
        onClick={phase === 'closed' ? handleOpen : undefined}
        className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 cursor-pointer group"
        style={{
          opacity: (phase === 'closed' || phase === 'closing') ? 1 : 0,
          transition: 'opacity 200ms',
          pointerEvents: (phase === 'closed') ? 'auto' : 'none',
        }}
      >
        {gameThumbnail && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30 group-hover:opacity-40 transition-opacity"
            style={{ backgroundImage: `url('${gameThumbnail}')` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        <div className="z-10 flex flex-col items-center space-y-1">
          <div className="bg-red-600 p-3 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)] group-hover:scale-110 transition-transform">
            <PlaySquare size={28} className="text-white ml-0.5" />
          </div>
          <span className="text-[9px] tracking-widest text-gray-400 font-bold bg-black/60 px-2 py-0.5 rounded backdrop-blur mt-1.5">TAP TO PLAY GAME</span>
        </div>
        <div className="absolute bottom-2 left-2.5 z-10">
          <span className="font-bold text-xs bg-red-600/90 text-white px-2 py-0.5 rounded">{gameTitle || 'ゲーム'}</span>
        </div>
      </div>

      {/* Game preview */}
      {phase !== 'closed' && userId && (
        <div
          className="absolute inset-0 z-10"
          style={{
            opacity: phase === 'closing' ? 0 : 1,
            transition: 'opacity 200ms',
          }}
        >
          <GamePreview
            gameId={gameId}
            postId={postId}
            userId={userId}
            onClose={handleClose}
            inline
          />
        </div>
      )}
    </div>
  );
}
