import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId, encodeGame } from '@/lib/sqids';
import { getClientIp } from '@/lib/ip';
import { kvExists, kvSetEx } from '@/lib/kv';

/** 同じIPからの連打でプレイ数が水増しされないようにする猶予（秒） */
const PLAY_DEDUPE_SEC = 120;

/**
 * プレイ結果の記録。
 *  - phase: 'start' … プレイ回数を+1（短時間の再読み込みは数えない）
 *  - phase: 'end'   … クリア数とハイスコアを記録（プレイ回数は加算しない）
 * 匿名サイトなのでスコアの自己申告は防ぎようがなく、ここでは回数の水増しだけを抑える。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = decodeId(id);
  if (gameId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    // ページ離脱時の sendBeacon などで空ボディが来ることがある
  }

  const phase = body.phase === 'end' ? 'end' : 'start';
  const cleared = phase === 'end' && !!body.cleared;
  const score = Math.max(0, Math.min(Number(body.score) || 0, 9_999_999));
  const displayName = typeof body.displayName === 'string' ? body.displayName.slice(0, 40) : undefined;

  let countPlay = phase === 'start';
  if (countPlay) {
    const key = `gameplay:${gameId}:${getClientIp(request.headers)}`;
    try {
      if (await kvExists(key)) countPlay = false;
      else await kvSetEx(key, '1', PLAY_DEDUPE_SEC);
    } catch {
      // KVが落ちていても記録自体は続行する
    }
  }

  if (!countPlay && phase === 'start') {
    return NextResponse.json({ ok: true, counted: false });
  }

  const updated = await db.recordGamePlay(gameId, { cleared, score, displayName, countPlay });
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const encoded = encodeGame(updated);
  return NextResponse.json({
    ok: true,
    counted: countPlay,
    plays: encoded.plays ?? 0,
    clears: encoded.clears ?? 0,
    bestScore: encoded.bestScore ?? 0,
    bestScoreBy: encoded.bestScoreBy,
  });
}
