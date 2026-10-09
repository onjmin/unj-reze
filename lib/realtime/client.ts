"use client";

import { ensureSessionId } from "@/lib/session";
import { isUserChannel, type RealtimeMessage } from "./channels";

/**
 * リアルタイムハブへの接続をアプリ全体で1本だけ張る。
 *
 * NEXT_PUBLIC_REALTIME_URL が未設定なら何もしない（`realtimeConfigured === false`）。
 * その場合、呼び出し側は従来どおりポーリングにフォールバックする — ハブを立てなくても
 * アプリが動くという既存の方針（バックエンドはすべて env で差し替え可能）を崩さないため。
 *
 * **セッションID（ensureSessionId）はハブへ絶対に送らない。** ハブは presence やチャットを
 * ルームの購読者全員へ配るので、そこへ載せると誰でもセッションを収集してアカウントを
 * 乗っ取れる（実際にそうなっていた）。自分の識別はハブが接続ごとに振る公開ID
 * （`getSelfId()`）で行い、個人宛チャンネルは /api/realtime/token の署名トークンで開ける。
 */

const HUB_URL = process.env.NEXT_PUBLIC_REALTIME_URL || "";

export const realtimeConfigured = !!HUB_URL;

type Handler = (msg: RealtimeMessage) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
/** user:* 購読トークンを、期限のこれだけ手前で取り直す。 */
const TOKEN_REFRESH_MARGIN_SEC = 5 * 60;
/** トークン取得に失敗したら、しばらく取りに行かない（未登録・ハブ未設定で叩き続けない）。 */
const TOKEN_RETRY_MS = 60_000;

/** ページごとの使い捨て乱数ID。旧ハブ（sessionId 必須だった頃）へ名乗るためだけに使う。 */
function randomId(): string {
	if (typeof crypto !== "undefined" && crypto.randomUUID)
		return crypto.randomUUID();
	return `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** 旧ハブ（sessionId 時代のプロトコル）からのメッセージを新しい形へ寄せる。
 *  新クライアントが旧ハブへ名乗るのは localId（乱数）なので、そこで配られる値も秘密ではない。 */
function normalizeLegacy(msg: RealtimeMessage): RealtimeMessage {
	const legacy = (o: Record<string, unknown>) => {
		if (o.playerId === undefined && typeof o.sessionId === "string") {
			o.playerId = o.sessionId;
		}
		delete o.sessionId;
	};
	if (msg.t === "presence" && Array.isArray(msg.players)) {
		for (const p of msg.players) legacy(p as unknown as Record<string, unknown>);
	} else if (msg.t === "chat") {
		legacy(msg as unknown as Record<string, unknown>);
	} else if (msg.t === "partyInvite") {
		const m = msg as unknown as Record<string, unknown>;
		if (m.fromPlayerId === undefined && typeof m.fromSessionId === "string") {
			m.fromPlayerId = m.fromSessionId;
		}
		delete m.fromSessionId;
	} else if (msg.t === "partyUpdate" && Array.isArray(msg.members)) {
		for (const p of msg.members) legacy(p as unknown as Record<string, unknown>);
	}
	return msg;
}

class RealtimeClient {
	private ws: WebSocket | null = null;
	private handlers = new Set<Handler>();
	/** チャンネル -> 購読者数。複数コンポーネントが同じチャンネルを見るので参照カウントで持つ。 */
	private refCounts = new Map<string, number>();
	private pending: string[] = [];
	private retries = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;
	/** ハブが welcome で振った公開ID（接続ごとに変わる）。旧ハブからは届かない。 */
	private serverId: string | null = null;
	/** 旧ハブ向けの名乗り。**セッションIDは絶対に使わない**（ハブはルーム全員へ配る）。 */
	private readonly localId = randomId();
	/** user:* 購読用の署名トークン（/api/realtime/token）。 */
	private userToken: { token: string; userId: string; exp: number } | null =
		null;
	private tokenPromise: Promise<string | null> | null = null;
	private tokenFailedAt = 0;

	constructor() {
		if (typeof window === "undefined") return;
		// スリープ復帰やタブのバックグラウンド復帰では、ソケットが死んでいても
		// readyState が OPEN のまま & onclose が発火しないことがある（ブラウザ/OS依存）。
		// 可視化/オンライン復帰のタイミングで強制的に張り直す。
		const wake = () => this.reconnectIfStale();
		window.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible") wake();
		});
		window.addEventListener("online", wake);
	}

	/** タブが前面に戻った／オンライン復帰したタイミングで、既存接続を捨てて張り直す。 */
	private reconnectIfStale() {
		if (!realtimeConfigured || this.disposed) return;
		if (this.handlers.size === 0 && this.refCounts.size === 0) return;
		if (this.ws) {
			// readyState は信用しない（半死ソケットでも OPEN のことがある）。close させて
			// onclose 経由の scheduleReconnect に任せる。CONNECTING 中はそのまま待つ。
			if (this.ws.readyState === WebSocket.OPEN) {
				try {
					this.ws.close();
				} catch {}
				return;
			}
			if (this.ws.readyState === WebSocket.CONNECTING) return;
		}
		this.retries = 0;
		this.connect();
	}

	private connect() {
		if (!realtimeConfigured || this.disposed) return;
		if (
			this.ws &&
			(this.ws.readyState === WebSocket.OPEN ||
				this.ws.readyState === WebSocket.CONNECTING)
		)
			return;

		let ws: WebSocket;
		try {
			ws = new WebSocket(HUB_URL);
		} catch {
			this.scheduleReconnect();
			return;
		}
		this.ws = ws;

		ws.onopen = () => {
			this.retries = 0;
			// 再接続時に購読を張り直す（ハブ側は接続ごとに状態を持つため）。
			// user:* はトークンが要るので別経路（期限が近ければここで取り直す）。
			const channels = [...this.refCounts.keys()];
			const publicChannels = channels.filter((c) => !isUserChannel(c));
			const userChannels = channels.filter(isUserChannel);
			if (publicChannels.length > 0)
				this.rawSend({ t: "sub", channels: publicChannels });
			if (userChannels.length > 0)
				void this.subscribeUserChannels(userChannels);
			const queued = this.pending;
			this.pending = [];
			for (const raw of queued) {
				try {
					ws.send(raw);
				} catch {
					/* 次の再接続で捨てる */
				}
			}
		};

		ws.onmessage = (ev) => {
			let msg: RealtimeMessage;
			try {
				msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
			} catch {
				return;
			}
			if (!msg || typeof msg !== "object") return;
			if (msg.t === "welcome" && this.ws === ws) {
				this.serverId =
					typeof msg.playerId === "string" ? msg.playerId : null;
			}
			msg = normalizeLegacy(msg);
			for (const h of this.handlers) {
				try {
					h(msg);
				} catch {
					/* 1つのハンドラの例外で他を巻き込まない */
				}
			}
		};

		ws.onclose = () => {
			if (this.ws === ws) {
				this.ws = null;
				this.serverId = null;
			}
			this.scheduleReconnect();
		};

		ws.onerror = () => {
			// onclose が続けて呼ばれるのでここでは何もしない
		};
	}

	private scheduleReconnect() {
		if (this.disposed || this.reconnectTimer) return;
		// 一斉再接続でハブを潰さないようにジッタを入れる
		const delay = Math.min(
			RECONNECT_BASE_MS * 2 ** this.retries,
			RECONNECT_MAX_MS,
		);
		const jittered = delay * (0.5 + Math.random() * 0.5);
		this.retries++;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, jittered);
	}

	private rawSend(payload: unknown) {
		const raw = JSON.stringify(payload);
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			try {
				this.ws.send(raw);
				return;
			} catch {
				// 下のキューへ回す
			}
		}
		// 未接続のあいだは取りこぼさないよう少しだけ貯める
		if (this.pending.length < 32) this.pending.push(raw);
		this.connect();
	}

	/** presence/チャット/パーティーでの自分のID。ハブが振った公開IDがあればそれ、
	 *  無ければ（旧ハブ・未接続）ページごとの乱数。どちらもセッションIDではない。
	 *  再接続すると変わるので、presence を受け取るたびに読み直すこと。 */
	getSelfId(): string {
		return this.serverId ?? this.localId;
	}

	/** user:* 購読トークンを取る（期限が近ければ取り直す）。取れなければ null。 */
	private async getUserToken(): Promise<string | null> {
		const nowSec = Date.now() / 1000;
		if (
			this.userToken &&
			this.userToken.exp - nowSec > TOKEN_REFRESH_MARGIN_SEC
		)
			return this.userToken.token;
		if (Date.now() - this.tokenFailedAt < TOKEN_RETRY_MS) return null;
		if (this.tokenPromise) return this.tokenPromise;
		this.tokenPromise = (async () => {
			try {
				// Cookie が消えていても localStorage から戻しておく（トークンAPIは Cookie で本人を引く）。
				// 値そのものは同一オリジンの自前APIへ Cookie として行くだけで、ハブには渡らない。
				ensureSessionId();
				const res = await fetch("/api/realtime/token", {
					method: "POST",
					credentials: "same-origin",
				});
				if (res.status !== 200) throw new Error(String(res.status));
				const body = (await res.json()) as {
					token?: string;
					userId?: string;
					exp?: number;
				} | null;
				if (!body?.token || !body.userId || !body.exp)
					throw new Error("empty token");
				this.userToken = {
					token: body.token,
					userId: String(body.userId),
					exp: body.exp,
				};
				return body.token;
			} catch {
				this.tokenFailedAt = Date.now();
				return null;
			} finally {
				this.tokenPromise = null;
			}
		})();
		return this.tokenPromise;
	}

	/** user:* チャンネルをトークン付きで購読する。トークンが取れなくても sub は送る
	 *  （新ハブは黙って捨てるだけ。トークン非対応の旧ハブならそのまま購読できる）。
	 *  ハブはトークンを購読の瞬間にだけ見るので、期限切れでも張った購読は接続が続く限り生きる。
	 *  再接続時は onopen からここへ来て、期限が近ければ取り直す。 */
	private async subscribeUserChannels(list: string[]) {
		const token = await this.getUserToken();
		// 待っている間に解除されたものは送らない
		const still = list.filter((c) => this.refCounts.has(c));
		if (still.length === 0) return;
		this.rawSend(
			token
				? { t: "sub", channels: still, token }
				: { t: "sub", channels: still },
		);
	}

	/** メッセージ購読。返り値を呼ぶと解除。 */
	addHandler(handler: Handler): () => void {
		this.handlers.add(handler);
		this.connect();
		return () => {
			this.handlers.delete(handler);
		};
	}

	/** チャンネル購読。返り値を呼ぶと解除（参照カウントが0になったときだけ unsub を送る）。 */
	subscribe(channelList: string[]): () => void {
		const added: string[] = [];
		for (const c of channelList) {
			const next = (this.refCounts.get(c) ?? 0) + 1;
			this.refCounts.set(c, next);
			if (next === 1) added.push(c);
		}
		const addedPublic = added.filter((c) => !isUserChannel(c));
		const addedUser = added.filter(isUserChannel);
		if (addedPublic.length > 0)
			this.rawSend({ t: "sub", channels: addedPublic });
		this.connect();
		// user:* は、未接続なら onopen がまとめて張るので、開いているときだけここで送る
		if (
			addedUser.length > 0 &&
			this.ws &&
			this.ws.readyState === WebSocket.OPEN
		)
			void this.subscribeUserChannels(addedUser);

		let released = false;
		return () => {
			if (released) return;
			released = true;
			const removed: string[] = [];
			for (const c of channelList) {
				const next = (this.refCounts.get(c) ?? 1) - 1;
				if (next <= 0) {
					this.refCounts.delete(c);
					removed.push(c);
				} else {
					this.refCounts.set(c, next);
				}
			}
			if (removed.length > 0) this.rawSend({ t: "unsub", channels: removed });
		};
	}

	/** 自分の位置を送る。DBには一切書かれず、ハブのメモリ上だけで完結する。
	 *  rotY/anim/level/name は mmo3d専用（任意）。2Dゲームは渡さなくてよい。
	 *  誰の位置かはハブが接続から決める。`sessionId` は旧ハブ互換のための乱数（localId）で、
	 *  新ハブは読まない。**ここへ本物のセッションIDを入れてはいけない。** */
	sendPosition(
		gameId: string,
		x: number,
		y: number,
		emoji: string,
		extra?: {
			rotY?: number;
			anim?: "idle" | "walk" | "run";
			level?: number;
			name?: string;
		},
	) {
		this.rawSend({
			t: "pos",
			game: gameId,
			sessionId: this.localId,
			x,
			y,
			emoji,
			...(extra?.rotY !== undefined ? { rotY: extra.rotY } : {}),
			...(extra?.anim !== undefined ? { anim: extra.anim } : {}),
			...(extra?.level !== undefined ? { level: extra.level } : {}),
			...(extra?.name !== undefined ? { name: extra.name } : {}),
		});
	}

	leaveGame(gameId: string) {
		this.rawSend({ t: "leave", game: gameId });
	}

	/** チャット送信（フェーズ25）。ハブが同じゲームルームの購読者全員へそのまま中継する。
	 *  DBには一切書かない（TODO(persist): 履歴を残すなら別途設計）。 */
	sendChat(gameId: string, name: string, text: string) {
		this.rawSend({
			t: "chat",
			game: gameId,
			sessionId: this.localId,
			name,
			text,
		});
	}

	/** 他プレイヤー（presence の playerId）をパーティーに誘う（フェーズ25）。招待された側にだけ届く。 */
	sendPartyInvite(gameId: string, targetPlayerId: string) {
		this.rawSend({
			t: "partyInvite",
			game: gameId,
			sessionId: this.localId,
			targetPlayerId,
			// 旧ハブ互換
			targetSessionId: targetPlayerId,
		});
	}

	/** 招待を承諾する（送り主の playerId を渡す）。ハブは実際に招待が届いている相手しか通さない。 */
	sendPartyAccept(gameId: string, inviterPlayerId: string) {
		this.rawSend({
			t: "partyAccept",
			game: gameId,
			sessionId: this.localId,
			targetPlayerId: inviterPlayerId,
			// 旧ハブ互換
			targetSessionId: inviterPlayerId,
		});
	}

	/** パーティーから抜ける。 */
	sendPartyLeave(gameId: string) {
		this.rawSend({ t: "partyLeave", game: gameId, sessionId: this.localId });
	}
}

/** SSR 中は生成しない（WebSocket が存在しないため）。 */
let instance: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient | null {
	if (!realtimeConfigured || typeof window === "undefined") return null;
	if (!instance) instance = new RealtimeClient();
	return instance;
}
