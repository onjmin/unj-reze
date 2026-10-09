// 書き込み前検査（lib/security/post-guard.ts）が返すエラー文。
// クライアントはこの文をそのままトーストに出す（isPostGuardMessage で見分ける）ので、
// サーバーとクライアントの両方から import できるよう、ここには依存の無い定数だけを置く。

export const POST_GUARD_MESSAGES = {
	turnstile:
		"ボット確認（Turnstile）を通過できませんでした。少し待ってからもう一度送信してください。",
	blocked:
		"不正な書き込みの疑いがあるため送信できませんでした。時間をおいてお試しください。",
	rateLimited: "書き込みが多すぎます。しばらくしてから再試行してください。",
} as const;

const MESSAGES = new Set<string>(Object.values(POST_GUARD_MESSAGES));

export function isPostGuardMessage(message: unknown): message is string {
	return typeof message === "string" && MESSAGES.has(message);
}
