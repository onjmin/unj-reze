'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { GameManifestDraft } from './GameMaker';
import ShareButton from './ShareButton';
import { gameShareUrl } from '@/lib/share';
import { buildGameShareText } from '@/lib/share-text';
import { startRemix } from '@/lib/remix';

const GameMaker = dynamic(() => import('./GameMaker'), { ssr: false });

interface GamePreviewProps {
  gameId: string;
  postId?: string;
  userId: string;
  onClose: () => void;
  /** フィード上でその場再生する（フルスクリーンの固定オーバーレイにしない） */
  inline?: boolean;
}

export default function GamePreview({ gameId, postId, userId, onClose, inline }: GamePreviewProps) {
  const [manifest, setManifest] = useState<GameManifestDraft | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (attempt: number): Promise<void> => {
      try {
        const res = await fetch(`/api/games/${gameId}`);
        if (cancelled) return;
        if (!res.ok) {
          if (res.status >= 500 && attempt < 2) { await new Promise(r => setTimeout(r, 400)); return load(attempt + 1); }
          setError(true);
          return;
        }
        const game = await res.json();
        if (!cancelled) {
          setManifest(game.manifest);
          setTitle(game.title);
          setLoading(false);
        }
      } catch {
        if (cancelled) return;
        // DBのウェブソケット接続が瞬断することがあるため、一度だけ再試行する
        if (attempt < 2) { await new Promise(r => setTimeout(r, 400)); return load(attempt + 1); }
        setError(true);
      }
    };
    load(0);
    return () => { cancelled = true; };
  }, [gameId]);

  const handleRemix = useCallback((remixed: GameManifestDraft, meta: { title: string; preset: string }) => {
    startRemix({ manifest: remixed, title: meta.title, preset: meta.preset, sourceGameId: gameId, sourceTitle: title });
  }, [gameId, title]);

  const wrapClass = inline
    ? "relative w-full h-full rounded-xl overflow-hidden border border-gray-800"
    : "fixed inset-0 z-[60]";

  if (error) {
    return (
      <div className={`${wrapClass} bg-black/95 flex flex-col items-center justify-center text-white`}>
        <p className="text-sm text-gray-400 mb-3">ゲームを読み込めませんでした</p>
        <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors">閉じる</button>
      </div>
    );
  }

  if (loading || !manifest) {
    return (
      <div className={`${wrapClass} bg-black/95 flex flex-col items-center justify-center`}>
        <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin mb-3" />
        <p className="text-xs text-gray-500">{title || '読み込み中...'}</p>
      </div>
    );
  }

  return (
    <div className={`${wrapClass} bg-[#07080b] flex flex-col`}>
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f0f11] border-b border-gray-800 shrink-0">
        <span className="text-xs font-bold text-white truncate">{title || 'ゲーム'}</span>
        <div className="flex items-center gap-1 shrink-0 text-gray-400">
          <ShareButton url={gameShareUrl(gameId)} text={buildGameShareText(title)} size={14} className="p-1.5 rounded hover:bg-gray-100/10" />
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100/10 rounded transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <GameMaker
          onClose={onClose}
          userId={userId}
          initialManifest={manifest}
          playOnly
          embedded={inline}
          fixedControls={inline}
          postId={postId}
          gameId={gameId}
          onRemix={handleRemix}
        />
      </div>
    </div>
  );
}
