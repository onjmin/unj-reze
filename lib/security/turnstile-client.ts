// Cloudflare Turnstile のクライアント側（新規スレ・返信の送信前にトークンを取る）。
//
// - スクリプトは**コンポーザを開いた／触った時**に初めて読む（prefetchTurnstileToken）。
//   ページを見ているだけの人には challenges.cloudflare.com を読ませない。
// - トークンは 1 回きり・有効 300 秒。先取りした 1 枚を送信時に使って捨て、次の送信
//   （再送を含む）では必ず取り直す。古くなった先取りは使わない。
// - ウィジェットは毎回作って取り終えたら消す（reset/execute の使い回しはコールバックの
//   取り違えが起きやすい）。appearance: interaction-only なので、ふだんは何も見えず、
//   Cloudflare が人の操作を求めた時だけ右下にチェックボックスが出る。
// - NEXT_PUBLIC_TURNSTILE_SITE_KEY が無ければ何もしない（null を返す）。サーバー側も
//   TURNSTILE_SECRET_KEY が無ければ検査しないので、ローカル開発はそのまま動く。

declare global {
	interface Window {
		turnstile?: {
			render: (
				container: HTMLElement,
				options: Record<string, unknown>,
			) => string;
			remove: (widgetId: string) => void;
		};
	}
}

const SCRIPT_SRC =
	"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** 人の操作が要らない場合の待ち時間。 */
const TOKEN_TIMEOUT_MS = 15_000;
/** チェックボックスが出た（人の操作待ち）場合の待ち時間。 */
const INTERACTIVE_TIMEOUT_MS = 120_000;
/** 有効期限 300 秒より手前で先取りを捨てる。 */
const PREFETCH_MAX_AGE_MS = 240_000;

const siteKey = (): string | undefined =>
	process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined;

export function isTurnstileEnabled(): boolean {
	return typeof window !== "undefined" && !!siteKey();
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
	if (window.turnstile) return Promise.resolve();
	if (scriptPromise) return scriptPromise;
	scriptPromise = new Promise<void>((resolve, reject) => {
		const script = document.createElement("script");
		script.src = SCRIPT_SRC;
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => {
			scriptPromise = null; // 次回また試せるように
			reject(new Error("failed to load turnstile script"));
		};
		document.head.appendChild(script);
	});
	return scriptPromise;
}

function createHost(): HTMLDivElement {
	const host = document.createElement("div");
	host.setAttribute("data-turnstile-host", "");
	// 人の操作が要る時だけ中身が出る。出た時に押せる位置・重なり順にしておく
	host.style.cssText =
		"position:fixed;right:12px;bottom:12px;z-index:2147483000;";
	document.body.appendChild(host);
	return host;
}

/** 新しいウィジェットを作って 1 枚取る。取れなければ null（呼び出し側はそのまま送り、サーバーが 403 を返す）。 */
async function fetchFreshToken(): Promise<string | null> {
	const key = siteKey();
	if (!key || typeof window === "undefined") return null;
	try {
		await loadScript();
	} catch (err) {
		console.warn("[turnstile] スクリプトを読めませんでした", err);
		return null;
	}
	const turnstile = window.turnstile;
	if (!turnstile) return null;

	return new Promise<string | null>((resolve) => {
		const host = createHost();
		let widgetId: string | null = null;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let settled = false;
		const finish = (token: string | null) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			// コールバックの中から remove すると SDK が落ちることがあるので一拍置く
			setTimeout(() => {
				try {
					if (widgetId) turnstile.remove(widgetId);
				} catch {}
				host.remove();
			}, 0);
			resolve(token);
		};
		const arm = (ms: number) => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => finish(null), ms);
		};
		arm(TOKEN_TIMEOUT_MS);
		try {
			widgetId = turnstile.render(host, {
				sitekey: key,
				action: "post",
				appearance: "interaction-only",
				"refresh-expired": "never",
				callback: (token: string) => finish(token),
				"error-callback": () => {
					finish(null);
					return true; // SDK 既定のコンソール出力を抑える
				},
				"expired-callback": () => finish(null),
				"timeout-callback": () => finish(null),
				// チェックボックスが出た＝人を待つので時間を延ばす
				"before-interactive-callback": () => arm(INTERACTIVE_TIMEOUT_MS),
			});
		} catch (err) {
			console.warn("[turnstile] render に失敗", err);
			finish(null);
		}
	});
}

let prefetched: { token: string; at: number } | null = null;
let inflight: Promise<string | null> | null = null;

function startFetch(): Promise<string | null> {
	if (!inflight) {
		inflight = fetchFreshToken().finally(() => {
			inflight = null;
		});
	}
	return inflight;
}

/** コンポーザを開いた／触った時に呼ぶ。送信までに 1 枚用意しておく（何度呼んでもよい）。 */
export function prefetchTurnstileToken(): void {
	if (!isTurnstileEnabled()) return;
	if (prefetched && Date.now() - prefetched.at < PREFETCH_MAX_AGE_MS) return;
	if (inflight) return;
	void startFetch().then((token) => {
		if (token) prefetched = { token, at: Date.now() };
	});
}

/** 送信の直前に呼ぶ。返ったトークンはこの 1 回の送信だけに使うこと（使い回すと siteverify で弾かれる）。 */
export async function takeTurnstileToken(): Promise<string | null> {
	if (!isTurnstileEnabled()) return null;
	const cached = prefetched;
	prefetched = null;
	if (cached && Date.now() - cached.at < PREFETCH_MAX_AGE_MS) return cached.token;
	// 先取りが走っている最中ならそれを受け取る（先取り側の then より先に横取りする）
	if (inflight) {
		const token = await inflight;
		// 先取りの then が prefetched に入れたものは、この送信で使ったので消す
		// （await の間に書き換わるので、TS の「null のまま」という絞り込みを外して読む）
		const now = prefetched as { token: string; at: number } | null;
		if (now?.token === token) prefetched = null;
		if (token) return token;
	}
	return startFetch();
}
