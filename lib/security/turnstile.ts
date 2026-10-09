const SITEVERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 3000;

export interface TurnstileVerifyResult {
	success: boolean;
	/** ネットワーク断/タイムアウト等でCloudflareに問い合わせできなかった場合 true。
	 * 呼び出し側は fail-open するか（レイテンシ優先）fail-closed するかをここで判断する。 */
	unreachable: boolean;
	errorCodes: string[];
	/** siteverify が返したウィジェットの action（クライアントの render で指定した値） */
	action?: string;
	/** siteverify が返した、ウィジェットを表示したページのホスト名 */
	hostname?: string;
}

/**
 * 任意の env TURNSTILE_ALLOWED_HOSTNAMES（カンマ区切り）。未設定ならホスト名は照合しない。
 *
 * NEXT_PUBLIC_SITE_URL などから既定値を作らないのは、独自ドメインへ移したときに
 * env の更新を忘れると全員の投稿が 403 になるため（オーナーが明示的に設定したときだけ縛る）。
 */
function allowedHostnames(): Set<string> | null {
	const list = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	return list.length ? new Set(list) : null;
}

/**
 * Turnstile トークンを Cloudflare の siteverify エンドポイントで検証する。
 * ダウンストリームの遅延がユーザー体験を壊さないよう AbortController で確実にタイムアウトさせる。
 * TURNSTILE_SECRET_KEY 未設定時（ローカル開発など）は検証をスキップして常に成功扱いにする。
 *
 * `expectedAction` はクライアントが render で指定した action（lib/security/turnstile-client.ts は
 * "post"）。同じサイトキーの別用途のウィジェットで取ったトークンを投稿に流用させないために照合する。
 * siteverify が action を返さない（空）ときは照合しない。ホスト名は {@link allowedHostnames} を参照。
 */
export async function verifyTurnstileToken(
	token: string | null,
	remoteIp: string,
	expectedAction = "post",
): Promise<TurnstileVerifyResult> {
	const secret = process.env.TURNSTILE_SECRET_KEY;

	if (!secret) {
		// 開発環境などキー未設定時は検証自体を無効化（本番では必ず設定すること）
		return { success: true, unreachable: false, errorCodes: [] };
	}

	if (!token) {
		return {
			success: false,
			unreachable: false,
			errorCodes: ["missing-input-response"],
		};
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

	try {
		const res = await fetch(SITEVERIFY_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				secret,
				response: token,
				remoteip: remoteIp,
			}),
			signal: controller.signal,
		});

		if (!res.ok) {
			return {
				success: false,
				unreachable: true,
				errorCodes: [`http-${res.status}`],
			};
		}

		const data = (await res.json()) as {
			success: boolean;
			["error-codes"]?: string[];
			action?: unknown;
			hostname?: unknown;
		};
		const action = typeof data.action === "string" ? data.action : undefined;
		const hostname =
			typeof data.hostname === "string" ? data.hostname : undefined;
		if (!data.success) {
			return {
				success: false,
				unreachable: false,
				errorCodes: data["error-codes"] || [],
				action,
				hostname,
			};
		}
		// トークン自体は正しくても、別の action のウィジェットで取ったものは投稿に使わせない
		if (action && action !== expectedAction) {
			return {
				success: false,
				unreachable: false,
				errorCodes: ["action-mismatch"],
				action,
				hostname,
			};
		}
		// 他サイトに同じサイトキーを埋めて集めたトークンを弾く（env を設定したときだけ）。
		// action と同じく、siteverify が値を返さないときは照合しない（可用性優先）
		const allowed = allowedHostnames();
		if (allowed && hostname && !allowed.has(hostname.toLowerCase())) {
			return {
				success: false,
				unreachable: false,
				errorCodes: ["hostname-mismatch"],
				action,
				hostname,
			};
		}
		return {
			success: true,
			unreachable: false,
			errorCodes: [],
			action,
			hostname,
		};
	} catch (e) {
		const isAbort = e instanceof Error && e.name === "AbortError";
		return {
			success: false,
			unreachable: true,
			errorCodes: [isAbort ? "timeout" : "network-error"],
		};
	} finally {
		clearTimeout(timer);
	}
}
