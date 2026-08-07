import type { RealtimeEvent } from "./channels";

/**
 * 書き込みAPIからリアルタイムハブへイベントを送る。
 *
 * 未設定（REALTIME_URL / REALTIME_PUBLISH_SECRET のどちらか欠け）なら完全な no-op。
 * 他のバックエンドと同じく「既定はモック相当、環境変数で差し替え」の方針に合わせている。
 *
 * 呼び出し側を絶対にブロックしない / 絶対に例外を投げない:
 * 配信はあくまで「ポーリングを止めるための最適化」であって、投稿処理の成否ではない。
 */

function config(): { url: string; secret: string } | null {
	const url = process.env.REALTIME_URL;
	const secret = process.env.REALTIME_PUBLISH_SECRET;
	if (!url || !secret) return null;
	return { url: url.replace(/\/$/, ""), secret };
}

export function realtimeEnabled(): boolean {
	return config() !== null;
}

type CfModule = {
	getCloudflareContext: () => {
		ctx?: { waitUntil?: (p: Promise<unknown>) => void };
	};
};

// Workers のモジュール参照は「先読み」しておく。
// publish の時点で `await import(...)` すると、その解決を待つあいだにレスポンスが返り、
// waitUntil を登録する前に進行中の fetch が打ち切られることがある（＝配信が無言で落ちる）。
// アイソレート初期化時に読み込んでおけば、publish 側は同期で waitUntil できる。
let cfModule: CfModule | null = null;
void import("@opennextjs/cloudflare")
	.then((m) => {
		cfModule = m as unknown as CfModule;
	})
	.catch(() => {
		/* Workers 以外（next dev / Node / 静的エクスポート）では使わない */
	});

/** Cloudflare Workers ではレスポンス後の非同期処理が打ち切られるので waitUntil に預ける。 */
function keepAlive(promise: Promise<unknown>): void {
	try {
		cfModule?.getCloudflareContext().ctx?.waitUntil?.(promise);
	} catch {
		// Workers 以外、またはリクエストコンテキスト外。投げっぱなしで構わない。
	}
}

/**
 * イベントを配信する。await 不要（fire-and-forget）。
 * ハブが落ちていてもクライアントはフォールバックのポーリングで拾えるので、失敗は無視する。
 */
export function publishRealtime(events: RealtimeEvent | RealtimeEvent[]): void {
	const cfg = config();
	if (!cfg) return;

	const list = Array.isArray(events) ? events : [events];
	if (list.length === 0) return;

	const body = JSON.stringify(list.length === 1 ? list[0] : { events: list });

	const request = fetch(`${cfg.url}/publish`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${cfg.secret}`,
		},
		body,
		// ハブが不調でも投稿APIを道連れにしない
		signal: AbortSignal.timeout(3000),
	})
		.then((res) => {
			if (!res.ok) console.warn("[realtime] publish failed", res.status);
		})
		.catch((err) => {
			console.warn(
				"[realtime] publish error",
				err instanceof Error ? err.message : err,
			);
		});

	keepAlive(request);
}
