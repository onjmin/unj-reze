/**
 * リアルタイムハブのチャンネル名。サーバー（publish 側）とクライアント（購読側）で
 * 同じ関数を使い、名前がずれて「配信しているのに誰にも届かない」事故を防ぐ。
 *
 * ID は sqids でエンコード済みの文字列を渡すこと（URL/クライアントで扱う表記に揃える）。
 */

/** 新規スレッドの発生。フィード画面が購読する。 */
export const CH_FEED = "feed";

/** スレッドへの新着返信。スレッド詳細・実況コメントが購読する。 */
export const chThread = (encodedThreadId: string) =>
	`thread:${encodedThreadId}`;

/** ゲームルームのゴーストプレイヤー位置。 */
export const chGame = (encodedGameId: string) => `game:${encodedGameId}`;

/** 個人宛の通知。値は notifications.target_user と同じ識別子。 */
export const chUser = (userId: string) => `user:${userId}`;

export type RealtimeEventName =
	| "post.created"
	| "reply.created"
	| "notify"
	| "message.created";

export interface RealtimeEvent {
	channel: string;
	event: RealtimeEventName;
	data?: unknown;
}

/** サーバー→クライアントのメッセージ。 */
export type RealtimeMessage =
	| { t: "welcome"; presenceTtlMs: number }
	| { t: "pong" }
	| { t: "event"; channel: string; event: RealtimeEventName; data: unknown }
	| { t: "presence"; game: string; players: RealtimePlayer[] };

export interface RealtimePlayer {
	sessionId: string;
	x: number;
	y: number;
	emoji: string;
}
