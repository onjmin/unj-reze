import type { GameManifestDraft } from '@/components/GameMaker';
import { BASE_PATH } from './site';

export interface RemixDraft {
  manifest: GameManifestDraft;
  title: string;
  preset: string;
  /** 元ゲームのID（改造元へのリンクに使う） */
  sourceGameId?: string;
  /** 元ゲームのタイトル（本文のひな形に使う） */
  sourceTitle?: string;
}

const STASH_KEY = 'unj_pending_remix';

/**
 * 「改造する」の受け口。ホーム画面がマウントされている間はそこへ直接渡し、
 * 投稿詳細やゲーム単独ページから押された場合は sessionStorage に預けてホームへ飛ばす。
 * lib/toast.ts と同じく、深いコンポーネントからのプロップスのバケツリレーを避けるための仕組み。
 */
type RemixHandler = (draft: RemixDraft) => void;
let handler: RemixHandler | null = null;

export function setRemixHandler(fn: RemixHandler) {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

export function startRemix(draft: RemixDraft) {
  if (handler) {
    handler(draft);
    return;
  }
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify(draft));
  } catch {
    // 容量オーバー等で預けられない場合は諦めてホームへ戻すだけにする
  }
  window.location.href = `${BASE_PATH}/`;
}

/** 預けられた改造データを取り出す（取り出したら消す） */
export function takeStashedRemix(): RemixDraft | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STASH_KEY);
    return JSON.parse(raw) as RemixDraft;
  } catch {
    return null;
  }
}
