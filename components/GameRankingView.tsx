'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, MessageCircle, Trophy } from 'lucide-react';
import type { GameRankingEntry } from '@/lib/types';

// game-presets/index からの import はプリセット本体（数百KB）を巻き込むので、
// LiveGameView と同じく表示用の絵文字だけをここに持つ。
const PRESET_EMOJI: Record<string, string> = {
  dq: '🐉', mario: '🍄', touhou: '🎀', rockman: '🤖', onjReze: '💣', undertale: '❤️', deltarune: '🖤', yume: '🌙',
};

const RANK_COLORS = ['text-yellow-300', 'text-gray-300', 'text-amber-600'];

/** プレイ数順のゲームランキング。ランキングタブの「ゲーム」カテゴリで表示する。 */
export default function GameRankingView() {
  const [games, setGames] = useState<GameRankingEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/games/ranking?limit=30')
      .then(res => (res.ok ? res.json() : []))
      .then(data => { if (!cancelled) setGames(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setGames([]); });
    return () => { cancelled = true; };
  }, []);

  if (games === null) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="text-gray-500 animate-spin" size={20} />
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center py-20 bg-gray-900/5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500/10 to-indigo-500/10 flex items-center justify-center mb-4 border border-blue-500/20">
          <span className="text-2xl">🎮</span>
        </div>
        <p className="text-sm font-bold text-gray-200">まだ遊ばれたゲームがありません。</p>
        <p className="text-[11px] text-gray-500 mt-1">最初の1本を作ってみよう。</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-800/80">
      {games.map((game, index) => {
        const plays = game.plays ?? 0;
        const clears = game.clears ?? 0;
        const clearRate = plays > 0 ? Math.round((clears / plays) * 100) : null;
        return (
          <div key={game.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className={`w-6 shrink-0 text-center text-sm font-bold ${RANK_COLORS[index] ?? 'text-gray-600'}`}>
              {index + 1}
            </span>
            <span className="text-xl shrink-0" aria-hidden>
              {PRESET_EMOJI[game.preset] ?? '🎮'}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/game/${game.id}`} className="block text-sm font-bold text-gray-100 truncate hover:text-blue-400 transition-colors">
                {game.title || '無題'}
              </Link>
              <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                <span>▶ {plays.toLocaleString()}</span>
                <span>🏁 {clears.toLocaleString()}{clearRate !== null && `（${clearRate}%）`}</span>
                {(game.bestScore ?? 0) > 0 && (
                  <span className="flex items-center gap-0.5 text-yellow-300/80">
                    <Trophy size={9} />
                    {(game.bestScore ?? 0).toLocaleString()}
                    {game.bestScoreBy && <span className="text-gray-600">/ {game.bestScoreBy}</span>}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {game.postId && (
                <Link
                  href={`/post/${game.postId}`}
                  aria-label="コメントを見る"
                  className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-100/10 transition-colors"
                >
                  <MessageCircle size={14} />
                </Link>
              )}
              <Link
                href={`/game/${game.id}`}
                className="px-2.5 py-1 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-400 text-[11px] font-bold hover:bg-blue-600/30 transition-colors"
              >
                あそぶ
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
