'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, MessageCircle, Pencil, Play, Trophy } from 'lucide-react';
import type { GameManifestDraft } from './GameMaker';
import ShareButton from './ShareButton';
import { gameShareUrl } from '@/lib/share';
import { buildGameShareText } from '@/lib/share-text';
import { startRemix } from '@/lib/remix';
import { ensureSessionId } from '@/lib/session';
import { api } from '@/lib/api';
import { isCollabAllowed, type OriginType } from '@/lib/types';
import { useRemoteJson } from '@/lib/use-remote-payload';

const GameMaker = dynamic(() => import('./GameMaker'), { ssr: false });

interface Props {
  gameId: string;
  title: string;
  /**
   * manifest 本体の保存先URL（R2）。DBはURLしか持たないので、
   * 実体は「あそぶ」を押した時点でブラウザが直接取りにいく。
   */
  manifestUrl: string;
  preset: string;
  creatorSlug?: string;
  plays: number;
  clears: number;
  bestScore: number;
  bestScoreBy?: string;
  postId?: string;
  /** 紐づくポストの権利表記。改変NG・無断使用禁止なら改造の導線を出さない */
  originType?: OriginType;
}

/**
 * ゲーム単独ページ。リンクを踏んだ人がまず「遊べる」ことを最優先にした画面で、
 * 遊んだあとに共有・改造・コメントへ進めるようにしている。
 */
export default function GameLandingView({
  gameId, title, manifestUrl, preset, creatorSlug, plays, clears, bestScore, bestScoreBy, postId, originType,
}: Props) {
  const remixAllowed = isCollabAllowed(originType);
  const [started, setStarted] = useState(false);
  const [userId, setUserId] = useState('名無しvFZ');
  // 「あそぶ」を押すまで manifest は取りに行かない。押さない人には1バイトも運ばない
  const { data: manifest, loading: manifestLoading, error: manifestError } =
    useRemoteJson<GameManifestDraft>(started ? manifestUrl : undefined);

  useEffect(() => {
    api.auth.anonymous(ensureSessionId())
      .then(user => setUserId(user.displayName))
      .catch(() => { /* 匿名IDが取れなくても既定名で遊べる */ });
  }, []);

  const handleRemix = useCallback((remixed: GameManifestDraft, meta: { title: string; preset: string }) => {
    startRemix({ manifest: remixed, title: meta.title, preset: meta.preset, sourceGameId: gameId, sourceTitle: title });
  }, [gameId, title]);

  const shareUrl = gameShareUrl(gameId);
  const clearRate = plays > 0 ? Math.round((clears / plays) * 100) : null;

  return (
    <div className="w-full max-w-2xl mx-auto border-x border-gray-800 flex-1 flex flex-col min-h-dvh">
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-800 sticky top-0 bg-[#0b0e14]/90 backdrop-blur-md z-20">
        <Link href="/" className="p-1.5 -ml-1.5 rounded hover:bg-gray-100/10 transition-colors text-gray-400" aria-label="ホームへ">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-gray-100 truncate">{title || 'ゲーム'}</h1>
          {creatorSlug && <p className="text-[10px] text-gray-500 truncate">by {creatorSlug}</p>}
        </div>
        <div className="text-gray-400 shrink-0">
          <ShareButton url={shareUrl} text={buildGameShareText(title)} size={16} className="p-1.5 rounded hover:bg-gray-100/10" />
        </div>
      </header>

      <div className="flex items-center gap-3 px-3 py-2 text-[11px] text-gray-400 border-b border-gray-800/60 bg-gray-100/[0.02]">
        <span>▶ {plays.toLocaleString()} プレイ</span>
        <span>🏁 {clears.toLocaleString()} クリア{clearRate !== null && `（${clearRate}%）`}</span>
        {bestScore > 0 && (
          <span className="flex items-center gap-1 text-yellow-300/90">
            <Trophy size={11} />
            {bestScore.toLocaleString()}
            {bestScoreBy && <span className="text-gray-500">/ {bestScoreBy}</span>}
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col">
        {started ? (
          <div className="flex-1 min-h-[60vh]">
            {manifest ? (
              <GameMaker
                onClose={() => setStarted(false)}
                userId={userId}
                initialManifest={manifest}
                playOnly
                embedded
                fixedControls
                postId={postId}
                gameId={gameId}
                onRemix={remixAllowed ? handleRemix : undefined}
              />
            ) : (
              <div className="flex-1 min-h-[50vh] flex items-center justify-center text-xs text-gray-500">
                {manifestError ?? (manifestLoading ? '読み込み中…' : 'データがありません')}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setStarted(true)}
            className="flex-1 min-h-[50vh] flex flex-col items-center justify-center gap-3 group"
          >
            <span className="bg-red-600 p-5 rounded-full shadow-[0_0_20px_rgba(220,38,38,0.5)] group-hover:scale-110 transition-transform">
              <Play size={32} className="text-white ml-1" fill="currentColor" />
            </span>
            <span className="text-xs tracking-widest text-gray-400 font-bold">タップしてあそぶ</span>
            <span className="text-[10px] text-gray-600">登録もインストールも要りません</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-800 sticky bottom-0 bg-[#0b0e14]/90 backdrop-blur-md">
        {postId && (
          <Link
            href={`/post/${postId}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold transition-colors"
          >
            <MessageCircle size={13} /> コメントを見る
          </Link>
        )}
        {remixAllowed && manifest && (
          <button
            onClick={() => startRemix({ manifest, title: `${title}（改造）`, preset, sourceGameId: gameId, sourceTitle: title })}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
          >
            <Pencil size={13} /> 改造して投稿
          </button>
        )}
      </div>
    </div>
  );
}
