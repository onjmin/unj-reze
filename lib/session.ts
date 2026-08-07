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
	document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

/**
 * ロードバランサー越しではクライアントIPを取得できない（edge環境の制約）ため、
 * IPでの同一ユーザー判定は行わない。代わりに、ログイン不要・追加レイテンシなしで
 * 「同一ブラウザ＝同一ユーザー」を維持できる Cookie を主・localStorage を副とした
 * 冗長なセッションID管理を使う。片方だけ消えても（サードパーティCookie制限や
 * サイトデータ削除の粒度差など）もう片方から復元できる。
 */
export function ensureSessionId(): string {
	const fromCookie = readCookie(COOKIE_NAME);
	let fromStorage: string | undefined;
	try {
		fromStorage = localStorage.getItem(STORAGE_KEY) ?? undefined;
	} catch {}

	const sessionId =
		fromCookie ||
		fromStorage ||
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
