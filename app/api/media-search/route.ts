import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodeId } from '@/lib/sqids';
import type { MediaSearchPost } from '@/lib/types';

/**
 * ゲーム/MVエディタの素材ピッカー（画像/MML検索）専用の軽量検索API。
 * 汎用の /api/search はスレッド構造・投票数まで引いてしまうため、ここでは
 * has_image / has_mml で絞った最小限のカラムだけを返す（docs/NEON_EGRESS.md）。
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  if (kind !== 'image' && kind !== 'mml') {
    return NextResponse.json({ error: 'kind must be "image" or "mml"' }, { status: 400 });
  }
  const q = url.searchParams.get('q') || '';
  const userId = url.searchParams.get('userId') || undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 50) : 50;
  const offsetParam = url.searchParams.get('offset');
  const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0;

  // hasMore 判定のため limit+1 件引いて、末尾の1件を切り落とす。
  const rows = await db.searchMedia(kind, q, userId, limit + 1, offset);
  const hasMore = rows.length > limit;
  const posts: MediaSearchPost[] = rows.slice(0, limit).map((r) => ({
    id: encodeId(r.id),
    displayName: r.displayName,
    content: r.content,
    imageSrc: r.imageSrc,
    imageAlt: r.imageAlt,
    mmlUrl: r.mmlUrl,
  }));
  return NextResponse.json({ posts, hasMore });
}
