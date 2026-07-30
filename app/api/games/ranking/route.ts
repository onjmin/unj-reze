import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodeId } from '@/lib/sqids';
import type { GameRankingEntry } from '@/lib/types';
import { withEdgeCache } from '@/lib/edge-cache';

/** プレイ数順のゲームランキング。manifest は含めない（一覧表示には不要で重いため）。 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 30), 50) : 30;

  // ランキングは全員に同じ内容。プレイ数はリアルタイム性が要らないので長めに持つ。
  return await withEdgeCache(
    request,
    { sMaxAge: 60, maxAge: 30, personalized: false },
    async () => {
      const games = await db.listTopGames(limit);
      const entries: GameRankingEntry[] = games.map(g => ({
        id: encodeId(g.id),
        preset: g.preset,
        title: g.title,
        createdAt: g.createdAt,
        creatorSlug: g.creatorSlug,
        plays: g.plays ?? 0,
        clears: g.clears ?? 0,
        bestScore: g.bestScore ?? 0,
        bestScoreBy: g.bestScoreBy,
        postId: g.postId ? encodeId(g.postId) : undefined,
      }));
      return NextResponse.json(entries);
    }
  );
}
