import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId, encodePost } from '@/lib/sqids';
import { attachGameInfo } from '@/lib/game-embed';
import { withEdgeCache } from '@/lib/edge-cache';
import { publishRealtime } from '@/lib/realtime/publish';
import { CH_FEED } from '@/lib/realtime/channels';
import type { OriginType } from '@/lib/types';
import { getClientIp } from '@/lib/ip';
import { verifyTurnstileToken } from '@/lib/security/turnstile';
import { scoreRequest } from '@/lib/security/scoring';
import { readTlsSignalsFromHeaders } from '@/lib/security/tls';
import type { FingerprintSignals } from '@/lib/security/types';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId') || undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50) : 20;
    return await withEdgeCache(
      request,
      { sMaxAge: 10, personalized: !!userId },
      async () => {
        const posts = await db.getPosts(userId, limit);
        await attachGameInfo(posts);
        return NextResponse.json(posts.map(encodePost));
      }
    );
  } catch (e) {
    console.error('[GET /api/posts]', e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      displayName, content, hasImage, imageSrc, imageAlt, avatarColor, gameId, originType,
      turnstileToken, fingerprint,
    }: {
      displayName: string; content: string; hasImage?: boolean; imageSrc?: string; imageAlt?: string;
      avatarColor?: string; gameId?: string; originType?: OriginType;
      turnstileToken?: string | null; fingerprint?: FingerprintSignals | null;
    } = body;

    if (!displayName || (!content && !hasImage)) {
      return NextResponse.json(
        { error: 'displayName and content are required' },
        { status: 400 }
      );
    }

    // 参考実装: 多層不正検知（Turnstile + 指紋 + IP/セッション相関）。
    // fingerprint がクライアントから送られてきた場合のみ評価する後方互換設計 —
    // 未対応クライアント（既存の PostComposer 等）はそのまま通過する。
    if (fingerprint) {
      const ip = getClientIp(request.headers);
      const sessionId = request.cookies.get('unj_reze_session')?.value || null;
      const userAgent = request.headers.get('user-agent') || '';
      const tls = readTlsSignalsFromHeaders(request.headers);

      const turnstileResult = await verifyTurnstileToken(turnstileToken ?? null, ip);
      const assessment = await scoreRequest({
        fingerprint, ip, sessionId, userAgent, tls,
        turnstileOk: turnstileResult.success,
        turnstileUnreachable: turnstileResult.unreachable,
      });

      if (assessment.blocked) {
        return NextResponse.json({ error: 'forbidden', reasons: assessment.reasons }, { status: 403 });
      }
      if (assessment.rateLimited) {
        return NextResponse.json(
          { error: 'too many requests', reasons: assessment.reasons },
          { status: 429, headers: { 'Retry-After': '10' } }
        );
      }
    }

    const decodedGameId = gameId ? decodeId(gameId) : undefined;
    if (gameId && decodedGameId === null) {
      return NextResponse.json({ error: 'Invalid gameId' }, { status: 400 });
    }

    const post = await db.createPost({ displayName, content, hasImage, imageSrc, imageAlt, avatarColor, gameId: decodedGameId === null ? undefined : decodedGameId, originType });
    await attachGameInfo(post);
    const encoded = encodePost(post);

    // フィード購読者へ push する。これがあるおかげでクライアントは
    // 「新着があるか」を確かめるためだけの定期ポーリングをしなくて済む。
    publishRealtime({ channel: CH_FEED, event: 'post.created', data: encoded });

    return NextResponse.json(encoded, { status: 201 });
  } catch (e) {
    console.error('[POST /api/posts]', e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
