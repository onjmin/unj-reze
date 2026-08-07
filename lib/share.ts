import { BASE_PATH, SITE_NAME, SITE_URL } from "./site";

/**
 * 共有用の絶対URLを組み立てる。
 * ブラウザ上では今いるオリジンを優先する（デモ/ステージングのリンクが本番を指してしまうのを防ぐ）。
 */
export function absoluteUrl(path: string): string {
	const p = path.startsWith("/") ? path : `/${path}`;
	if (typeof window !== "undefined" && window.location?.origin) {
		return `${window.location.origin}${BASE_PATH}${p}`;
	}
	return `${SITE_URL}${BASE_PATH}${p}`;
}

export const postShareUrl = (postId: string) => absoluteUrl(`/post/${postId}`);
export const gameShareUrl = (gameId: string) => absoluteUrl(`/game/${gameId}`);

/** X（旧Twitter）の投稿画面URL。実際に投稿するかどうかはX側でユーザーが決める。 */
export function xIntentUrl(text: string, url: string): string {
	const params = new URLSearchParams({ text, url });
	return `https://x.com/intent/post?${params.toString()}`;
}

export type ShareResult = "shared" | "copied" | "unavailable";

/**
 * OS標準の共有シートを開く。使えない環境ではクリップボードへコピーにフォールバックする。
 * 呼び出し側でユーザーへのフィードバック文言を出し分けられるよう、どちらを行ったかを返す。
 */
export async function shareOrCopy(opts: {
	url: string;
	title?: string;
	text?: string;
}): Promise<ShareResult> {
	const { url, title, text } = opts;
	if (typeof navigator !== "undefined" && navigator.share) {
		try {
			await navigator.share({ title: title ?? SITE_NAME, text, url });
			return "shared";
		} catch {
			// ユーザーがキャンセルした場合もここに来る。コピーへは落とさない。
			return "shared";
		}
	}
	return (await copyText(url)) ? "copied" : "unavailable";
}

export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		// https でない環境やクリップボード権限なしの場合の保険
		try {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.setAttribute("readonly", "");
			ta.style.position = "fixed";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand("copy");
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
}
