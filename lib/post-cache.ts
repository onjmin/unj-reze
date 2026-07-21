'use client';

import type { Post } from './types';

/** 一覧（タイムライン/板/メディア/プロフィール等）で取得済みの投稿を
 *  sessionStorage に置いておき、詳細ページ（/post/[id]）が
 *  サーバー側のフェッチを待たずに即描画するために使う。
 *  loading.tsx がこのキャッシュを読んで楽観的に本文を出し、
 *  サーバーの応答が届いた時点で正規のデータへ差し替わる。 */

const PREFIX = 'unj_post_';
const INDEX_KEY = 'unj_post_keys';
/** 貯めすぎて sessionStorage を圧迫しないための上限（古いものから捨てる）。 */
const MAX_ENTRIES = 30;

function readIndex(): string[] {
  try {
    const raw = sessionStorage.getItem(INDEX_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** 一覧から詳細へ遷移する直前に呼ぶ。id をキーに投稿スナップショットを保存する。 */
export function cachePost(post: Post | null | undefined): void {
  if (!post?.id || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(`${PREFIX}${post.id}`, JSON.stringify(post));
    const index = readIndex().filter(id => id !== post.id);
    index.push(post.id);
    while (index.length > MAX_ENTRIES) {
      const oldest = index.shift();
      if (oldest) sessionStorage.removeItem(`${PREFIX}${oldest}`);
    }
    sessionStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // 容量超過やプライベートモード等では黙って諦める（通常のローディング表示になるだけ）
  }
}

/** 詳細ページ側で使う。無ければ null（＝従来どおりスピナー表示）。
 *  読んでも消さないので、戻る→再度開く のような操作でも即描画できる。 */
export function readCachedPost(id: string): Post | null {
  if (!id || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${id}`);
    return raw ? (JSON.parse(raw) as Post) : null;
  } catch {
    return null;
  }
}
