import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/ip';
import { verifyTurnstileToken } from '@/lib/security/turnstile';
import { scoreRequest } from '@/lib/security/scoring';
import { readTlsSignalsFromHeaders } from '@/lib/security/tls';
import type { VerifyRequestBody } from '@/lib/security/types';

function getSessionIdFromCookie(request: NextRequest): string | null {
  return request.cookies.get('unj_reze_session')?.value || null;
}

/**
 * 投稿など不正利用の対象になりうるアクションの直前に呼び出す共通検証エンドポイント。
 * Turnstile検証 → 多信号スコアリング → レート制限判定 の順で評価し、
 * 呼び出し元ルートはこの結果を見て処理を継続するか拒否するかを決める。
 */
export async function POST(request: NextRequest) {
  let body: VerifyRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.fingerprint) {
    return NextResponse.json({ error: 'fingerprint is required' }, { status: 400 });
  }

  const ip = getClientIp(request.headers);
  const sessionId = getSessionIdFromCookie(request);
  const userAgent = request.headers.get('user-agent') || '';
  // TLSシグナルは proxy(middleware) が request.cf から取り出して詰め直したものだけを読む。
  // proxy はクライアント由来の同名ヘッダを必ず上書き/削除するため、ここでの偽装は成立しない。
  const tls = readTlsSignalsFromHeaders(request.headers);

  const turnstileResult = await verifyTurnstileToken(body.turnstileToken, ip);

  const result = await scoreRequest({
    fingerprint: body.fingerprint,
    ip,
    sessionId,
    userAgent,
    tls,
    turnstileOk: turnstileResult.success,
    turnstileUnreachable: turnstileResult.unreachable,
  });

  if (result.blocked) {
    return NextResponse.json(
      { allowed: false, score: result.score, reasons: result.reasons },
      { status: 403 }
    );
  }

  if (result.rateLimited) {
    return NextResponse.json(
      { allowed: false, score: result.score, reasons: result.reasons },
      { status: 429, headers: { 'Retry-After': '10' } }
    );
  }

  return NextResponse.json({
    allowed: true,
    score: result.score,
    reasons: result.reasons,
  });
}
