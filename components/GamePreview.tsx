'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { GameManifestDraft } from './GameMaker';

const GameMaker = dynamic(() => import('./GameMaker'), { ssr: false });

interface GamePreviewProps {
  gameId: string;
  postId?: string;
  userId: string;
  onClose: () => void;
}

export default function GamePreview({ gameId, postId, userId, onClose }: GamePreviewProps) {
  const [manifest, setManifest] = useState<GameManifestDraft | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/games/${gameId}`);
        if (!res.ok || cancelled) { setError(true); return; }
        const game = await res.json();
        if (!cancelled) {
          setManifest(game.manifest);
          setTitle(game.title);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [gameId]);

  if (error) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center text-white">
        <p className="text-sm text-gray-400 mb-3">ゲームを読み込めませんでした</p>
        <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors">閉じる</button>
      </div>
    );
  }

  if (loading || !manifest) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin mb-3" />
        <p className="text-xs text-gray-500">{title || '読み込み中...'}</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#07080b] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f0f11] border-b border-gray-800 shrink-0">
        <span className="text-xs font-bold text-white truncate">{title || 'ゲーム'}</span>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100/10 rounded transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <GameMaker
          onClose={onClose}
          userId={userId}
          initialManifest={manifest}
          playOnly
          postId={postId}
        />
      </div>
    </div>
  );
}
