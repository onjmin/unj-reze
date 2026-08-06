import { db } from './db';
import type { DbMvRecord, DbPost } from './types-db';

/**
 * サムネイルに使うURL。保存時に解決済みの http(s) URL のみ通す。
 * 内蔵アセット参照キーはクライアント側のハイドレーションが要るのでサーバーでは解決できない。
 */
function thumbnailFromMv(mv: DbMvRecord): string | undefined {
  // bgUrl は stage.bgUrl の非正規化列。manifest がR2に出たので、
  // 保存時に書き込み側が写しておいた値をそのまま読む。
  return mv.bgUrl?.startsWith('http') ? mv.bgUrl : undefined;
}

/**
 * 投稿(および返信)にひもづくMVの title/サムネイルを埋め込む。破壊的に post を更新する。
 * lib/game-embed.ts と同じ構造。manifest 本体は絶対に載せない（docs/NEON_EGRESS.md）。
 */
export async function attachMvInfo<T extends DbPost | null | (DbPost | null)[]>(posts: T): Promise<T> {
  const list = (Array.isArray(posts) ? posts : [posts]).filter((p): p is DbPost => !!p);

  const ids = new Set<number>();
  const collect = (p: DbPost) => {
    if (p.mvId) ids.add(p.mvId);
    p.replies?.forEach(collect);
  };
  list.forEach(collect);
  if (ids.size === 0) return posts;

  const mvMap = new Map<number, DbMvRecord>();
  const idArray = [...ids];
  const mvs = typeof db.getMvsByIds === 'function'
    ? await db.getMvsByIds(idArray)
    : (await Promise.all(idArray.map(id => db.getMv(id)))).filter((m): m is DbMvRecord => !!m);
  mvs.forEach(mv => {
    if (mv) mvMap.set(mv.id, mv);
  });

  const apply = (p: DbPost) => {
    if (p.mvId && mvMap.has(p.mvId)) {
      const mv = mvMap.get(p.mvId)!;
      p.mvTitle = mv.title;
      p.mvThumbnail = thumbnailFromMv(mv);
      p.mvPreset = mv.preset;
      p.mvPlays = mv.plays ?? 0;
    }
    p.replies?.forEach(apply);
  };
  list.forEach(apply);

  return posts;
}
