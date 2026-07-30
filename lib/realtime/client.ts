'use client';

import type { RealtimeMessage } from './channels';

/**
 * リアルタイムハブへの接続をアプリ全体で1本だけ張る。
 *
 * NEXT_PUBLIC_REALTIME_URL が未設定なら何もしない（`realtimeConfigured === false`）。
 * その場合、呼び出し側は従来どおりポーリングにフォールバックする — ハブを立てなくても
 * アプリが動くという既存の方針（バックエンドはすべて env で差し替え可能）を崩さないため。
 */

const HUB_URL = process.env.NEXT_PUBLIC_REALTIME_URL || '';

export const realtimeConfigured = !!HUB_URL;

type Handler = (msg: RealtimeMessage) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  /** チャンネル -> 購読者数。複数コンポーネントが同じチャンネルを見るので参照カウントで持つ。 */
  private refCounts = new Map<string, number>();
  private pending: string[] = [];
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private connect() {
    if (!realtimeConfigured || this.disposed) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

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
      // 再接続時に購読を張り直す（ハブ側は接続ごとに状態を持つため）
      const channels = [...this.refCounts.keys()];
      if (channels.length > 0) this.rawSend({ t: 'sub', channels });
      const queued = this.pending;
      this.pending = [];
      for (const raw of queued) {
        try { ws.send(raw); } catch { /* 次の再接続で捨てる */ }
      }
    };

    ws.onmessage = (ev) => {
      let msg: RealtimeMessage;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      for (const h of this.handlers) {
        try { h(msg); } catch { /* 1つのハンドラの例外で他を巻き込まない */ }
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose が続けて呼ばれるのでここでは何もしない
    };
  }

  private scheduleReconnect() {
    if (this.disposed || this.reconnectTimer) return;
    // 一斉再接続でハブを潰さないようにジッタを入れる
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.retries, RECONNECT_MAX_MS);
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

  /** メッセージ購読。返り値を呼ぶと解除。 */
  addHandler(handler: Handler): () => void {
    this.handlers.add(handler);
    this.connect();
    return () => { this.handlers.delete(handler); };
  }

  /** チャンネル購読。返り値を呼ぶと解除（参照カウントが0になったときだけ unsub を送る）。 */
  subscribe(channelList: string[]): () => void {
    const added: string[] = [];
    for (const c of channelList) {
      const next = (this.refCounts.get(c) ?? 0) + 1;
      this.refCounts.set(c, next);
      if (next === 1) added.push(c);
    }
    if (added.length > 0) this.rawSend({ t: 'sub', channels: added });
    else this.connect();

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
      if (removed.length > 0) this.rawSend({ t: 'unsub', channels: removed });
    };
  }

  /** 自分の位置を送る。DBには一切書かれず、ハブのメモリ上だけで完結する。 */
  sendPosition(gameId: string, sessionId: string, x: number, y: number, emoji: string) {
    this.rawSend({ t: 'pos', game: gameId, sessionId, x, y, emoji });
  }

  leaveGame(gameId: string) {
    this.rawSend({ t: 'leave', game: gameId });
  }
}

/** SSR 中は生成しない（WebSocket が存在しないため）。 */
let instance: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient | null {
  if (!realtimeConfigured || typeof window === 'undefined') return null;
  if (!instance) instance = new RealtimeClient();
  return instance;
}
