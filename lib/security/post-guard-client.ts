import { collectFingerprint } from "./fingerprint";
import {
	prefetchTurnstileToken,
	takeTurnstileToken,
} from "./turnstile-client";
import type { FingerprintSignals } from "./types";

// 新規スレ・返信の本文に足す「書き込み前検査」の材料（サーバー側は lib/security/post-guard.ts）。
// lib/api.ts の posts.create / posts.replies.create がここを呼ぶので、コンポーザごとに
// 配線しなくても、どの画面から投稿してもトークンと指紋が付く。

let cachedFingerprint: FingerprintSignals | null | undefined;

/** 指紋はページを開いている間は変わらないので 1 回だけ取る（canvas/WebGL を毎回叩かない）。 */
function fingerprintOnce(): FingerprintSignals | null {
	if (cachedFingerprint !== undefined) return cachedFingerprint;
	try {
		cachedFingerprint = collectFingerprint();
	} catch {
		cachedFingerprint = null;
	}
	return cachedFingerprint;
}

/** コンポーザを開いた／入力欄に触れた時に呼ぶ。Turnstile の読み込みとトークンの先取りを始める。 */
export function prefetchPostGuard(): void {
	if (typeof window === "undefined") return;
	prefetchTurnstileToken();
}

/** 送信の直前に呼び、返り値を POST 本文へ混ぜる。毎回新しいトークンを使う（再送でも取り直す）。 */
export async function collectPostGuard(): Promise<{
	turnstileToken: string | null;
	fingerprint: FingerprintSignals | null;
}> {
	if (typeof window === "undefined")
		return { turnstileToken: null, fingerprint: null };
	const [turnstileToken, fingerprint] = await Promise.all([
		takeTurnstileToken(),
		Promise.resolve(fingerprintOnce()),
	]);
	return { turnstileToken, fingerprint };
}
