/**
 * スレッドのレス数上限。
 *
 * unj とDBを統合する前提で、unj 側の制約をこちらにも引き継いでいる。
 * unj の `res` は `num SMALLINT` かつ `UNIQUE (thread_id, num)` で、
 * `threads.res_limit` の既定が1000。統合時に reze の投稿を `threads`/`res` へ
 * 写すので、ここで上限を掛けておかないと `num` の採番が破綻する。
 *
 * 「移行時にまとめて何とかする」は効かない。1000件を超えたスレッドは
 * 超過分を捨てるか別スレッドに割るしかなく、どちらも投稿が失われる。
 * 超えさせないことが唯一の対処になる。
 */
export const RES_LIMIT = 1000;

/**
 * スレ主は次スレ誘導のために +5 まで書ける（unj の cache.ts:isMax と同じ扱い）。
 */
export const RES_LIMIT_OWNER_BONUS = 5;

export function isThreadFull(repliesCount: number, isOwner = false): boolean {
  return repliesCount >= RES_LIMIT + (isOwner ? RES_LIMIT_OWNER_BONUS : 0);
}

/** UIに出す残り件数。0 なら埋まっている */
export function remainingReplies(repliesCount: number, isOwner = false): number {
  return Math.max(0, RES_LIMIT + (isOwner ? RES_LIMIT_OWNER_BONUS : 0) - repliesCount);
}
