'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, Trophy, Users } from 'lucide-react';
import GameMaker, { type GameManifestDraft } from './GameMaker';
import type { GhostPlayer, GameVoteCandidate } from '@/lib/types';

interface LiveInfo {
  gameId: number | null;
  gameTitle: string;
  gamePreset: string;
  hourSlot: string;
  postId: number | null;
  manifest: GameManifestDraft | null;
  nextCandidates: GameVoteCandidate[];
  myVote: number | null;
}

interface Props {
  userId: string;
  sessionId: string;
}

const PRESET_EMOJI: Record<string, string> = { dq: '🐉', mario: '🍄', touhou: '🎀', rockman: '🤖', onjReze: '💣' };

export default function LiveGameView({ userId, sessionId }: Props) {
  const [info, setInfo] = useState<LiveInfo | null>(null);
  const [ghostPlayers, setGhostPlayers] = useState<GhostPlayer[]>([]);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const posRef = useRef({ x: 0, y: 0, emoji: '🎮' });
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [danmakuComments, setDanmakuComments] = useState<string[]>([]);
  const commentLastIdRef = useRef(0);

  // 残り時間カウントダウン
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const m = 59 - now.getMinutes();
      const s = 59 - now.getSeconds();
      setTimeLeft(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ライブゲーム情報を取得
  const fetchInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/live?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) return;
      const data: LiveInfo = await res.json();
      setInfo(data);
      setMyVote(data.myVote);
    } catch {}
  }, [userId]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  // プレイヤー位置同期 + コメントポーリング（2秒ごと）
  useEffect(() => {
    if (!info?.gameId) return;
    const gameId = info.gameId;
    const postId = info.postId;

    const sync = async () => {
      // 自分の位置を送信
      if (posRef.current.x > 0 || posRef.current.y > 0) {
        fetch('/api/games/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId, sessionId, ...posRef.current }),
        }).catch(() => {});
      }
      // 他プレイヤーを取得
      try {
        const res = await fetch(`/api/games/players?gameId=${gameId}&sessionId=${encodeURIComponent(sessionId)}`);
        if (res.ok) {
          const players: GhostPlayer[] = await res.json();
          setGhostPlayers(players);
          setOnlineCount(players.length + 1);
        }
      } catch {}
      // コメント（返信）をポーリング
      if (postId) {
        try {
          const res = await fetch(`/api/posts/${postId}/replies`);
          if (res.ok) {
            const replies: { id: number; displayName: string; content: string }[] = await res.json();
            const newOnes = replies.filter(r => r.id > commentLastIdRef.current);
            if (newOnes.length > 0) {
              commentLastIdRef.current = Math.max(...newOnes.map(r => r.id));
              setDanmakuComments(prev => [...prev, ...newOnes.map(r => `${r.displayName}: ${r.content}`)]);
            }
          }
        } catch {}
      }
    };

    sync();
    syncRef.current = setInterval(sync, 2000);
    return () => {
      if (syncRef.current) clearInterval(syncRef.current);
    };
  }, [info?.gameId, info?.postId, sessionId]);

  const handlePositionChange = useCallback((x: number, y: number, emoji: string) => {
    posRef.current = { x, y, emoji };
  }, []);

  const handleVote = async (gameId: number) => {
    setMyVote(gameId);
    // 楽観的更新: 自分の票を即時反映
    setInfo(prev => prev ? {
      ...prev,
      nextCandidates: prev.nextCandidates.map(c => ({
        ...c,
        votes: c.game.id === gameId
          ? c.votes + (prev.myVote === gameId ? 0 : 1)
          : c.votes - (prev.myVote === c.game.id ? 1 : 0),
      })),
      myVote: gameId,
    } : prev);
    await fetch('/api/games/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    }).catch(() => {});
    fetchInfo();
  };

  return (
    <div className="flex flex-col flex-1 bg-[#07080b] text-gray-100 overflow-hidden">
      {/* 情報バー */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-[#0f0f11] border-b border-gray-800">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-white">🎮 ライブゲーム</span>
          {info && (
            <span className="text-gray-400">
              {PRESET_EMOJI[info.gamePreset] ?? '🎮'} {info.gameTitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Users size={11} />{onlineCount}人
          </span>
          <span className="flex items-center gap-1 font-mono">
            <Clock size={11} />{timeLeft}
          </span>
        </div>
      </div>

      {/* ゲームエリア */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {info?.manifest ? (
          <GameMaker
            onClose={() => {}}
            userId={userId}
            initialManifest={info.manifest}
            playOnly
            embedded
            ghostPlayers={ghostPlayers}
            onPositionChange={handlePositionChange}
            postId={info.postId ?? undefined}
            danmakuComments={danmakuComments}
            onComment={async (text, displayName) => {
              if (!info.postId) return;
              setDanmakuComments(prev => [...prev, `${displayName}: ${text}`]);
              await fetch(`/api/posts/${info.postId}/replies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName, content: text, parentPostId: info.postId }),
              }).catch(() => {});
            }}
          />
        ) : info && !info.manifest ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm gap-2">
            <span className="text-3xl">🎮</span>
            <p>まだゲームが投稿されていません</p>
            <p className="text-xs text-gray-600">投稿フォームからゲームを添付して投稿しよう！</p>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">読み込み中…</div>
        )}
      </div>

      {/* 投票パネル */}
      <div className="shrink-0 border-t border-gray-800 bg-[#0a0a0d]">
        <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
          <Trophy size={12} className="text-yellow-400" />
          <span className="text-[11px] font-bold text-gray-300">次の1時間のゲームを投票</span>
          <span className="ml-auto text-[10px] text-gray-600 font-mono">{timeLeft} 後に切替</span>
        </div>
        <div className="overflow-y-auto max-h-40 px-2 pb-2 space-y-1.5">
          {info?.nextCandidates && info.nextCandidates.length > 0 ? (
            info.nextCandidates.map(c => {
              const voted = myVote === c.game.id;
              return (
                <button
                  key={c.game.id}
                  onClick={() => handleVote(c.game.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors text-[11px] ${
                    voted
                      ? 'border-yellow-500/60 bg-yellow-500/10 text-yellow-200'
                      : 'border-gray-700/60 bg-gray-800/40 text-gray-300 hover:border-gray-600 active:bg-gray-700/40'
                  }`}
                >
                  <span className="shrink-0">{PRESET_EMOJI[c.game.preset] ?? '🎮'}</span>
                  <span className="flex-1 font-medium truncate">{c.game.title}</span>
                  <span className={`shrink-0 font-mono tabular-nums ${voted ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {voted ? '✓ ' : ''}{c.votes}票
                  </span>
                </button>
              );
            })
          ) : (
            <p className="text-[11px] text-gray-600 text-center py-3">
              {info ? 'ゲームを投稿すると投票に登場します' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
