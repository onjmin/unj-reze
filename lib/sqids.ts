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

export function encodeId(id: number): string {
  const checksum = getChecksum(id);
  return sqids.encode([id, checksum]);
}

export function decodeId(sqid: string): number | null {
  if (!sqid) return null;
  try {
    const numbers = sqids.decode(sqid);
    if (numbers.length !== 2) return null;
    const [id, checksum] = numbers;
    if (getChecksum(id) !== checksum) return null;
    return id;
  } catch {
    return null;
  }
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
