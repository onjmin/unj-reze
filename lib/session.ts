"use client";

const COOKIE_NAME = "unj_reze_session";
const STORAGE_KEY = "unj_reze_session_backup";

function readCookie(name: string): string | undefined {
	if (typeof document === "undefined") return undefined;
	const match = document.cookie.match(`(?:^|;\\s*)${name}=([^;]*)`);
	return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string, days: number) {
	if (typeof document === "undefined") return;
	const expires = new Date(Date.now() + days * 864e5).toUTCString();
	// https では Secure を付ける（平文の http に流れてセッションIDが盗聴されないように）。
	// ローカル開発の http://localhost では付けると書けないので付けない。
	const secure =
		typeof location !== "undefined" && location.protocol === "https:"
			? ";Secure"
			: "";
	document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax${secure}`;
}

/**
 * ロードバランサー越しではクライアントIPを取得できない（edge環境の制約）ため、
 * IPでの同一ユーザー判定は行わない。代わりに、ログイン不要・追加レイテンシなしで
 * 「同一ブラウザ＝同一ユーザー」を維持できる Cookie と localStorage の
 * 冗長なセッションID管理を使う。片方だけ消えても（サードパーティCookie制限や
 * サイトデータ削除の粒度差など）もう片方から復元できる。
 *
 * 両方あって値が違うときは localStorage を正とし、Cookie を書き直す（セッション固定の対策）。
 * 正規の経路は必ず両方を同じ値で書く（このファイルだけが書く）ので、食い違うのは
 * 「外から Cookie だけを差し替えられた」とき。以前は Cookie を優先して localStorage まで
 * 上書きしていたため、サーバーの Set-Cookie（廃止済み）を踏まされると元のアカウントが失われた。
 */
export function ensureSessionId(): string {
	const fromCookie = readCookie(COOKIE_NAME);
	let fromStorage: string | undefined;
	try {
		fromStorage = localStorage.getItem(STORAGE_KEY) ?? undefined;
	} catch {}

	const sessionId =
		fromStorage ||
		fromCookie ||
		(typeof crypto !== "undefined" && crypto.randomUUID
			? crypto.randomUUID()
			: "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
					const r = (Math.random() * 16) | 0;
					const v = c === "x" ? r : (r & 0x3) | 0x8;
					return v.toString(16);
				}));

	writeCookie(COOKIE_NAME, sessionId, 365);
	try {
		localStorage.setItem(STORAGE_KEY, sessionId);
	} catch {}

	return sessionId;
}
