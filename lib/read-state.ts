'use client';

/**
 * 通知・メッセージの既読まわり。
 *
 * messages テーブルには notifications と違って `read` 列が無く、サーバー側に既読の概念が無い。
 * アカウントの無い匿名SNSなので、既読状態をサーバーに持たせると
 * 「誰の既読か」を識別するための書き込みが毎回発生し、Neon の転送量を無駄に食う。
 * そこで「どこまで見たか」だけを端末のローカルに持つ。
 *
 * これが無いと未読バッジは `messages.length`（＝表示可能な全メッセージ数）のままになり、
 * 開いても永久に消えない。
 */

const KEY = 'unj_last_seen_message_id';
/** 既読になったことを画面側（バッジ）へ伝えるイベント。 */
export const MESSAGES_READ_EVENT = 'unj:messages-read';
/** 通知を既読にしたときに発火。バッジを即座に落とすため。 */
export const NOTIFICATIONS_READ_EVENT = 'unj:notifications-read';

/** 通知が既読になったことを画面へ伝える。 */
export function emitNotificationsRead(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_READ_EVENT));
}

export function getLastSeenMessageId(): number {
  if (typeof localStorage === 'undefined') return 0;
  const raw = localStorage.getItem(KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 既読位置を進める。巻き戻しはしない。 */
export function markMessagesSeen(messages: { id: number }[]): void {
  if (typeof localStorage === 'undefined' || messages.length === 0) return;
  const maxId = messages.reduce((max, m) => (m.id > max ? m.id : max), 0);
  if (maxId <= getLastSeenMessageId()) return;
  localStorage.setItem(KEY, String(maxId));
  window.dispatchEvent(new CustomEvent(MESSAGES_READ_EVENT));
}

/**
 * 未読件数。
 * 自分が送ったものは除く（従来は自分の送信分も数えていたため、送るたびにバッジが増えていた）。
 */
export function countUnreadMessages(
  messages: { id: number; sender: string }[],
  currentUserName?: string
): number {
  const lastSeen = getLastSeenMessageId();
  return messages.filter(m => m.id > lastSeen && m.sender !== currentUserName).length;
}
