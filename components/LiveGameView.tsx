'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, Trophy, Users } from 'lucide-react';
import GameMaker, { type GameManifestDraft } from './GameMaker';
import type { GhostPlayer, GameVoteCandidate } from '@/lib/types';
import { decodeId } from '@/lib/sqids';
import { getAvatarInfo } from '@/lib/avatar';
import { useRealtimeSubscription, realtimeConfigured } from '@/lib/hooks/useRealtime';
import { getRealtimeClient } from '@/lib/realtime/client';
import { chGame, chThread } from '@/lib/realtime/channels';
import { useRemoteJson } from '@/lib/use-remote-payload';

interface LiveInfo {
  gameId: string | null;
  gameTitle: string;
  gamePreset: string;
  hourSlot: string;
  postId: string | null;
  /** manifest 本体の保存先URL（R2）。実体はブラウザが直接引く */
  manifestUrl: string | null;
  nextCandidates: GameVoteCandidate[];
  myVote: number | null;
}

interface Props {
  userId: string;
  sessionId: string;
}

const PRESET_EMOJI: Record<string, string> = { dq: '🐉', mario: '🍄', touhou: '🎀', rockman: '🤖', onjReze: '💣', undertale: '❤️' };

export default function LiveGameView({ userId, sessionId }: Props) {
  const [info, setInfo] = useState<LiveInfo | null>(null);
  // manifest 本体はDBに無いので、URLが決まった時点でR2から引く。
  // 実況の枠自体は manifest を待たずに描ける
  const { data: liveManifest } = useRemoteJson<GameManifestDraft>(info?.manifestUrl ?? undefined);
  const [ghostPlayers, setGhostPlayers] = useState<GhostPlayer[]>([]);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const posRef = useRef({ x: 0, y: 0, emoji: '🎮' });
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [danmakuComments, setDanmakuComments] = useState<string[]>([]);
  const commentLastIdRef = useRef(0);
  const commentBaselineSetRef = useRef(false);

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
  const fetchInfo = useCallback((signal?: AbortSignal) => {
    return fetch(`/api/games/live?userId=${encodeURIComponent(userId)}`, { signal })
      .then(res => res.ok ? res.json() as Promise<LiveInfo> : null)
      .then((data: LiveInfo | null) => {
        if (!data || signal?.aborted) return;
        setInfo(data);
        setMyVote(data.myVote);
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchInfo(controller.signal);
    return () => controller.abort();
  }, [fetchInfo]);

  // ── リアルタイムハブ経路 ─────────────────────────────────────
  // ゴーストの位置は Postgres に一切書かない。ハブのメモリ上だけで完結する。
  // （従来は 2秒ごとに upsert + 全表 DELETE + SELECT を叩いており、
  //   1人が開いているだけで Neon の転送量を延々と消費していた。）

  // 自分の位置を送る
  useEffect(() => {
    if (!realtimeConfigured || !info?.gameId) return;
    const gameId = info.gameId;
    const client = getRealtimeClient();
    if (!client) return;
    const send = () => {
      if (posRef.current.x > 0 || posRef.current.y > 0) {
        client.sendPosition(gameId, sessionId, posRef.current.x, posRef.current.y, posRef.current.emoji);
      }
    };
    send();
    const id = setInterval(send, 2000);
    return () => {
      clearInterval(id);
      client.leaveGame(gameId);
    };
  }, [info?.gameId, sessionId]);

  // 他プレイヤーの位置を受け取る
  useRealtimeSubscription(
    info?.gameId ? [chGame(info.gameId)] : [],
    useCallback((msg) => {
      if (msg.t !== 'presence') return;
      // ハブは直列化を1回で済ませるため自分を含めた全員を配る。自分はここで除く。
      const others = msg.players.filter(p => p.sessionId !== sessionId);
      setGhostPlayers(others);
      setOnlineCount(others.length + 1);
    }, [sessionId]),
    realtimeConfigured && !!info?.gameId
  );

  // 実況コメントを受け取る
  useRealtimeSubscription(
    info?.postId ? [chThread(info.postId)] : [],
    useCallback((msg) => {
      if (msg.t !== 'event' || msg.event !== 'reply.created') return;
      const r = msg.data as { id: string; displayName: string; content: string };
      const rid = decodeId(r.id) || 0;
      if (rid <= commentLastIdRef.current) return;
      commentLastIdRef.current = rid;
      setDanmakuComments(prev => [...prev, `${getAvatarInfo(r.displayName).username}: ${r.content}`]);
    }, []),
    realtimeConfigured && !!info?.postId
  );

  // ── フォールバック経路（ハブ未設定時のみ） ───────────────────
  // プレイヤーの位置・在席人数はここでは同期しない（ゴースト表示なし）。
  // ハブ無しの環境向けに Postgres へ2秒間隔でupsertするフォールバックを
  // 持たせていたが、実況ゲームのように多人数が同時に開くと Neon への
  // 書き込みが人数×秒間隔で積み上がる。プレゼンスは「ハブがあれば動く
  // おまけ機能」と割り切り、無ければ単に出さない。
  // コメント（返信）の表示だけは、ハブが無くても通常の投稿APIを
  // ポーリングすれば得られるので、そこだけ引き続きフォールバックする。
  useEffect(() => {
    if (realtimeConfigured) return;
    if (!info?.gameId) return;
    const postId = info.postId;

    const sync = async () => {
      // コメント（返信）をポーリング
      if (postId) {
        try {
          const res = await fetch(`/api/posts/${postId}/replies`);
          if (res.ok) {
            const replies: { id: string; displayName: string; content: string }[] = await res.json();
            if (!commentBaselineSetRef.current) {
              // ゲーム開始前に存在した返信は流れるコメントとして表示しない
              commentBaselineSetRef.current = true;
              commentLastIdRef.current = replies.reduce((max, r) => Math.max(max, decodeId(r.id) || 0), 0);
              return;
            }
            const newOnes = replies.filter(r => (decodeId(r.id) || 0) > commentLastIdRef.current);
            if (newOnes.length > 0) {
              commentLastIdRef.current = Math.max(...newOnes.map(r => decodeId(r.id) || 0));
              setDanmakuComments(prev => [...prev, ...newOnes.map(r => `${getAvatarInfo(r.displayName).username}: ${r.content}`)]);
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
        {liveManifest && info ? (
          <GameMaker
            onClose={() => {}}
            userId={userId}
            initialManifest={liveManifest}
            playOnly
            embedded
            ghostPlayers={ghostPlayers}
            onPositionChange={handlePositionChange}
            postId={info.postId ?? undefined}
            gameId={info.gameId ?? undefined}
            danmakuComments={danmakuComments}
            onComment={async (text, displayName) => {
              if (!info.postId) return;
              setDanmakuComments(prev => [...prev, `${getAvatarInfo(displayName).username}: ${text}`]);
              try {
                const res = await fetch(`/api/posts/${info.postId}/replies`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ displayName, content: text, parentPostId: info.postId }),
                });
                if (res.ok) {
                  const reply: { id: string } = await res.json();
                  const replyId = decodeId(reply.id) || 0;
                  commentLastIdRef.current = Math.max(commentLastIdRef.current, replyId);
                }
              } catch {}
            }}
          />
        ) : info && !info.manifestUrl ? (
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
