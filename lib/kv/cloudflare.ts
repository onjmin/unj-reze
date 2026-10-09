// Cloudflare KV REST API implementation
// Requires: KV_ACCOUNT_ID, KV_NAMESPACE_ID, KV_API_TOKEN

function base(): string {
	const accountId = process.env.KV_ACCOUNT_ID!;
	const namespaceId = process.env.KV_NAMESPACE_ID!;
	return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;
}

function headers(): HeadersInit {
	return { Authorization: `Bearer ${process.env.KV_API_TOKEN}` };
}

// ── 遮断器（サーキットブレーカー） ──
// KV を Workers のバインディングではなく Cloudflare の REST API で叩いているので、書き込み枠
// （無料 1000 回/日）や API 全体の制限を使い切ると、以後の呼び出しは全部 429 で返ってくる。
// それでも毎回 fetch し続けると、失敗するだけの往復でレイテンシを食い、API の制限も回復しない
// （トークンが利用者トークンなら、オーナーの wrangler 操作まで巻き添えで 429 になる）。
// なので 429 / 5xx / 通信エラーを見たら一定時間は fetch せずに即座に失敗させる。
// 呼び出し側（スコアリング・重複排除・レート制限の KV フォールバック）はどれも失敗時に
// 素通しする作りなので、遮断中も機能が黙って緩むだけで止まりはしない。
// 状態はアイソレート単位（モジュール変数）。全アイソレートで揃える必要は無い。
const BREAKER_OPEN_MS = 120_000;
let breakerOpenUntil = 0;

function tripBreaker(reason: string) {
	const now = Date.now();
	// 開くたびに1回だけ痕跡を残す（遮断中に届いた並行リクエストの失敗で何行も出さない）
	if (breakerOpenUntil <= now) {
		console.warn(
			`[kv] Cloudflare KV REST API が ${reason} を返したので ${BREAKER_OPEN_MS / 1000} 秒間呼び出しを止める`,
		);
	}
	breakerOpenUntil = now + BREAKER_OPEN_MS;
}

/** すべての KV REST 呼び出しの入口。遮断中は fetch せずに投げる（呼び出し側は fail-open）。 */
async function kvFetch(url: string, init?: RequestInit): Promise<Response> {
	if (Date.now() < breakerOpenUntil) {
		throw new Error("KV circuit breaker open");
	}
	let res: Response;
	try {
		res = await fetch(url, init);
	} catch (err) {
		tripBreaker("network error");
		throw err;
	}
	if (res.status === 429 || res.status >= 500)
		tripBreaker(`HTTP ${res.status}`);
	return res;
}

export async function kvGet(key: string): Promise<string | null> {
	const res = await kvFetch(`${base()}/values/${encodeURIComponent(key)}`, {
		headers: headers(),
	});
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`KV GET failed: ${res.status}`);
	return res.text();
}

export async function kvSet(key: string, value: string): Promise<void> {
	const res = await kvFetch(`${base()}/values/${encodeURIComponent(key)}`, {
		method: "PUT",
		headers: { ...headers(), "Content-Type": "text/plain" },
		body: value,
	});
	if (!res.ok) throw new Error(`KV SET failed: ${res.status}`);
}

export async function kvSetEx(
	key: string,
	value: string,
	ttlSeconds: number,
): Promise<void> {
	// Cloudflare KV は expiration_ttl の最小値が 60 秒
	const ttl = Math.max(60, Math.floor(ttlSeconds));
	const res = await kvFetch(
		`${base()}/values/${encodeURIComponent(key)}?expiration_ttl=${ttl}`,
		{
			method: "PUT",
			headers: { ...headers(), "Content-Type": "text/plain" },
			body: value,
		},
	);
	if (!res.ok) throw new Error(`KV SETEX failed: ${res.status}`);
}

export async function kvIncr(key: string): Promise<number> {
	const current = parseInt((await kvGet(key)) || "0", 10);
	const next = current + 1;
	await kvSet(key, String(next));
	return next;
}

export async function kvDecr(key: string): Promise<number> {
	const current = parseInt((await kvGet(key)) || "0", 10);
	const next = Math.max(0, current - 1);
	await kvSet(key, String(next));
	return next;
}

export async function kvDel(key: string): Promise<void> {
	await kvFetch(`${base()}/values/${encodeURIComponent(key)}`, {
		method: "DELETE",
		headers: headers(),
	});
}

export async function kvExists(key: string): Promise<boolean> {
	return (await kvGet(key)) !== null;
}

export async function kvHGet(
	key: string,
	field: string,
): Promise<string | null> {
	const raw = await kvGet(key);
	try {
		const obj = JSON.parse(raw || "{}");
		return obj[field] ?? null;
	} catch {
		return null;
	}
}

export async function kvHSet(
	key: string,
	field: string,
	value: string,
): Promise<void> {
	const raw = await kvGet(key);
	const obj = JSON.parse(raw || "{}");
	obj[field] = value;
	await kvSet(key, JSON.stringify(obj));
}

export async function kvHDel(key: string, field: string): Promise<void> {
	const raw = await kvGet(key);
	try {
		const obj = JSON.parse(raw || "{}");
		delete obj[field];
		await kvSet(key, JSON.stringify(obj));
	} catch {}
}

export async function kvHIncr(key: string, field: string): Promise<number> {
	const raw = await kvGet(key);
	const obj = JSON.parse(raw || "{}");
	obj[field] = (parseInt(obj[field] || "0", 10) + 1).toString();
	await kvSet(key, JSON.stringify(obj));
	return parseInt(obj[field], 10);
}

export async function kvHDecr(key: string, field: string): Promise<number> {
	const raw = await kvGet(key);
	const obj = JSON.parse(raw || "{}");
	obj[field] = Math.max(0, parseInt(obj[field] || "0", 10) - 1).toString();
	await kvSet(key, JSON.stringify(obj));
	return parseInt(obj[field], 10);
}

export async function kvHGetAll(key: string): Promise<Record<string, string>> {
	const raw = await kvGet(key);
	try {
		return JSON.parse(raw || "{}");
	} catch {
		return {};
	}
}

export async function kvDisconnect(): Promise<void> {}
