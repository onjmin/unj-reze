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

/** サーバー→クライアントのメッセージ。
 *  chat/partyInvite/partyUpdate はフェーズ25で追加（mmo3dのソーシャル機能）。
 *  完全にインメモリのハブ内で完結し、DBには一切書かない。
 *  TODO(persist): チャット履歴・パーティー状態を残したいなら別途保存経路の設計が要る。 */
export type RealtimeMessage =
	| { t: "welcome"; presenceTtlMs: number }
	| { t: "pong" }
	| { t: "event"; channel: string; event: RealtimeEventName; data: unknown }
	| { t: "presence"; game: string; players: RealtimePlayer[] }
	| { t: "chat"; game: string; sessionId: string; name: string; text: string; ts: number }
	| { t: "partyInvite"; game: string; fromSessionId: string; fromName: string }
	| { t: "partyUpdate"; game: string; members: { sessionId: string; name?: string }[] };

export interface RealtimePlayer {
	sessionId: string;
	x: number;
	y: number;
	emoji: string;
	/** mmo3d専用（任意・後方互換）。Y軸回転(ラジアン)。 */
	rotY?: number;
	/** mmo3d専用（任意・後方互換）。現在のアニメ状態。 */
	anim?: "idle" | "walk" | "run";
	/** mmo3d専用（任意、フェーズ25）。現在のレベル。育成データ本体はエンジン内のみに
	 *  持ち、ここでは他プレイヤーへ見せるための表示用の値だけを流す。 */
	level?: number;
	/** 表示名（任意、フェーズ25）。パーティー招待UI等で使う。 */
	name?: string;
}
