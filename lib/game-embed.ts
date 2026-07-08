import { db } from './db';
import type { DbGameRecord, DbPost } from './types-db';

function thumbnailFromGame(game: DbGameRecord): string | undefined {
  // titleScreen.bgRef は保存時解決済みURLのみ通す（内蔵アセット参照キーは
  // クライアント側ハイドレーションが必要なためサーバーでは解決できない）。
  const bgRef = game.manifest?.titleScreen?.bgRef;
  return bgRef?.startsWith('http') ? bgRef : undefined;
}

/** 投稿(および返信)にひもづくゲームの title/サムネイルを埋め込む。破壊的に post を更新する。 */
export async function attachGameInfo<T extends DbPost | null | (DbPost | null)[]>(posts: T): Promise<T> {
  const list = (Array.isArray(posts) ? posts : [posts]).filter((p): p is DbPost => !!p);

  const ids = new Set<number>();
  const collect = (p: DbPost) => {
    if (p.gameId) ids.add(p.gameId);
    p.replies?.forEach(collect);
  };
  list.forEach(collect);
  if (ids.size === 0) return posts;

  const gameMap = new Map<number, DbGameRecord>();
  await Promise.all(
    [...ids].map(async (id) => {
      const game = await db.getGame(id);
      if (game) gameMap.set(id, game);
    })
  );

  const apply = (p: DbPost) => {
    if (p.gameId && gameMap.has(p.gameId)) {
      const game = gameMap.get(p.gameId)!;
      p.gameTitle = game.title;
      p.gameThumbnail = thumbnailFromGame(game);
    }
    p.replies?.forEach(apply);
  };
  list.forEach(apply);

  return posts;
}
