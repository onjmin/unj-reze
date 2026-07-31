'use client';

/** 一覧（タイムライン/スレッド/通知/フォロー一覧）で既に判っている「相手の見た目」を
 *  sessionStorage に置き、プロフィールページ（/user/[id]）がサーバー応答を待たずに
 *  ヘッダー（アイコン・名前）を描けるようにする。
 *  投稿詳細の lib/post-cache.ts と同じ考え方で、こちらは1画面ぶんの本体ではなく
 *  「先に出せるところだけ」を持つ。正規データが届いた時点で上書きされる。 */

export interface ProfileSeed {
  slug?: string;
  displayName?: string;
  avatarUrl?: string;
}

const PREFIX = 'unj_profile_seed_';
const INDEX_KEY = 'unj_profile_seed_keys';
const MAX_ENTRIES = 40;

function readIndex(): string[] {
  try {
    const raw = sessionStorage.getItem(INDEX_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeEntry(key: string, seed: ProfileSeed) {
  sessionStorage.setItem(`${PREFIX}${key}`, JSON.stringify(seed));
  const index = readIndex().filter(k => k !== key);
  index.push(key);
  while (index.length > MAX_ENTRIES) {
    const oldest = index.shift();
    if (oldest) sessionStorage.removeItem(`${PREFIX}${oldest}`);
  }
  sessionStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

/**
 * プロフィールへ遷移する直前に呼ぶ。
 * URL は slug でも displayName でも来るため、両方をキーにして引けるようにしておく。
 */
export function cacheProfileSeed(seed: ProfileSeed): void {
  if (typeof sessionStorage === 'undefined') return;
  const keys = [seed.slug, seed.displayName].filter(Boolean) as string[];
  if (keys.length === 0) return;
  try {
    for (const key of keys) writeEntry(key, seed);
  } catch {
    // 容量超過やプライベートモードでは黙って諦める（従来どおりの読み込み表示になるだけ）
  }
}

/** プロフィール側で使う。無ければ null（＝従来どおりスピナー表示）。 */
export function readProfileSeed(key: string | null | undefined): ProfileSeed | null {
  if (!key || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${key}`);
    return raw ? (JSON.parse(raw) as ProfileSeed) : null;
  } catch {
    return null;
  }
}
