import Sqids from 'sqids';
import type { Post as ApiPost, GameRecord as ApiGame, Notification as ApiNotification, OshiItem as ApiOshiItem } from './types';
import type { DbPost, DbGameRecord, DbNotification, DbOshiItem } from './types-db';

const sqids = new Sqids({
  alphabet: 'FsaJLNPRTVXZbdfhjklnpqrtvwxyz8u64o20mYWGUSQOMKIECAegicBDH31975',
  minLength: 6,
});

function getChecksum(id: number): number {
  return (id * 17 + 5) % 97;
}

/**
 * ID変換のメモ化。
 *
 * Cloudflare Workers の無料枠は1リクエストあたり CPU 10ms しかない。
 * sqids.encode は1回あたり約15µs かかり、フィード1ページ（スレッド＋返信）では
 * 1投稿につき id / threadId / parentPostId / gameId の最大4回呼ばれる。
 * 400投稿ぶんで 17ms 前後になり、**これだけで CPU 上限を超えて 500 になる**。
 *
 * 同じIDは何度も現れる（threadId はスレッド内で共通、再リクエストでも同じ投稿が並ぶ）ため、
 * アイソレート内でメモ化するだけで実測13倍速くなる。
 * 変換は純粋な関数なので、キャッシュしても結果は変わらない。
 */
const MEMO_MAX = 5000;
const encodeMemo = new Map<number, string>();
const decodeMemo = new Map<string, number | null>();

export function encodeId(id: number): string {
  const hit = encodeMemo.get(id);
  if (hit !== undefined) return hit;
  const encoded = sqids.encode([id, getChecksum(id)]);
  // アイソレートは長生きしうるので、際限なく溜めない
  if (encodeMemo.size >= MEMO_MAX) encodeMemo.clear();
  encodeMemo.set(id, encoded);
  return encoded;
}

export function decodeId(sqid: string): number | null {
  if (!sqid) return null;
  const hit = decodeMemo.get(sqid);
  if (hit !== undefined) return hit;
  let result: number | null;
  try {
    const numbers = sqids.decode(sqid);
    if (numbers.length !== 2) {
      result = null;
    } else {
      const [id, checksum] = numbers;
      result = getChecksum(id) !== checksum ? null : id;
    }
  } catch {
    result = null;
  }
  // 不正な文字列を無限に溜め込まないよう、こちらも上限を設ける
  if (decodeMemo.size >= MEMO_MAX) decodeMemo.clear();
  decodeMemo.set(sqid, result);
  return result;
}

export function decodeIdOrThrow(sqid: string, errorMessage = 'Invalid ID'): number {
  const id = decodeId(sqid);
  if (id === null) {
    throw new Error(errorMessage);
  }
  return id;
}

export function encodePost(post: DbPost): ApiPost {
  return {
    ...post,
    id: encodeId(post.id),
    parentPostId: post.parentPostId ? encodeId(post.parentPostId) : undefined,
    gameId: post.gameId ? encodeId(post.gameId) : undefined,
    threadId: encodeId(post.threadId),
    replies: post.replies ? post.replies.map(encodePost) : [],
  } as ApiPost;
}

export function encodeGame(game: DbGameRecord): ApiGame {
  return {
    ...game,
    id: encodeId(game.id),
  } as ApiGame;
}

export function encodeOshiItem(item: DbOshiItem): ApiOshiItem {
  return {
    id: encodeId(item.id),
    kind: item.kind,
    trackId: item.trackId,
    collectionId: item.collectionId,
    artistId: item.artistId,
    title: item.title,
    subtitle: item.subtitle,
    artworkUrl: item.artworkUrl,
    viewUrl: item.viewUrl,
    previewUrl: item.previewUrl,
    position: item.position,
  };
}

export function encodeNotification(notification: DbNotification): ApiNotification {
  return {
    ...notification,
    id: encodeId(notification.id),
    postId: notification.postId ? encodeId(notification.postId) : undefined,
  } as ApiNotification;
}
