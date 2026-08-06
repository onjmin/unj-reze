import { db } from './db';
import type { DbGameRecord, DbPost } from './types-db';

function thumbnailFromGame(game: DbGameRecord): string | undefined {
  // bgRef は titleScreen.bgRef の非正規化列。manifest がR2に出たので、
  // 保存時に書き込み側が写しておいた値をそのまま読む。
  // 解決済みURLのみ通す（内蔵アセット参照キーはクライアント側の
  // ハイドレーションが要るのでサーバーでは解決できない）。
  return game.bgRef?.startsWith('http') ? game.bgRef : undefined;
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
  const idArray = [...ids];
  const games = typeof db.getGamesByIds === 'function'
    ? await db.getGamesByIds(idArray)
    : (await Promise.all(idArray.map(id => db.getGame(id)))).filter((g): g is DbGameRecord => !!g);
  games.forEach(game => {
    if (game) gameMap.set(game.id, game);
  });

  const apply = (p: DbPost) => {
    if (p.gameId && gameMap.has(p.gameId)) {
      const game = gameMap.get(p.gameId)!;
      p.gameTitle = game.title;
      p.gameThumbnail = thumbnailFromGame(game);
      p.gamePlays = game.plays ?? 0;
      p.gameClears = game.clears ?? 0;
    }
    p.replies?.forEach(apply);
  };
  list.forEach(apply);

  return posts;
}
