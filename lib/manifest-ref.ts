/**
 * APIが受け取る manifest 参照の検証。
 *
 * manifest 本体はブラウザが uploader-worker へ直接上げるので、サーバーに届くのは
 * URLだけになった。URLは公開ボディから来るため、**保存先ホストを必ず検証する**。
 * これをやらないと、任意の外部URLをゲーム/MVの manifest として登録できてしまい、
 * プレイヤーに好きなJSONを読ませる踏み台になる。
 */

const UPLOADER_PUBLIC_URL = process.env.NEXT_PUBLIC_UPLOADER_PUBLIC_URL || "";

export interface ParsedManifestRef {
	manifestUrl: string;
	manifestDeleteId?: string;
	manifestDeleteHash?: string;
}

/**
 * `kind` は uploader 側のキー接頭辞（`mv` / `game` / `mml`）。
 * ホスト名だけでなくパスまで見るので、MVのURLをゲームとして登録する類も弾ける。
 */
export function isValidPayloadUrl(
	url: unknown,
	kind: "mv" | "game" | "mml",
): url is string {
	if (typeof url !== "string" || url === "") return false;
	if (!UPLOADER_PUBLIC_URL) {
		// 未設定なら検証できない。通してしまうと素通しになるので落とす
		console.error(
			"NEXT_PUBLIC_UPLOADER_PUBLIC_URL が未設定のため manifest URL を検証できません",
		);
		return false;
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	const base = new URL(UPLOADER_PUBLIC_URL);
	if (parsed.origin !== base.origin) return false;
	return new RegExp(`^/${kind}/[0-9a-f]{16}\\.(json|mml|txt)$`).test(
		parsed.pathname,
	);
}

/** 削除トークンは自由文字列だが、長さと文字種だけは縛っておく */
function sanitizeToken(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	if (!/^[0-9a-zA-Z/_.-]{1,128}$/.test(value)) return undefined;
	return value;
}

/**
 * リクエストボディから manifest 参照を取り出す。不正なら null。
 * 呼び出し側は null を 400 として返すこと。
 */
export function parseManifestRef(
	body: any,
	kind: "mv" | "game",
): ParsedManifestRef | null {
	if (!isValidPayloadUrl(body?.manifestUrl, kind)) return null;
	return {
		manifestUrl: body.manifestUrl,
		manifestDeleteId: sanitizeToken(body.manifestDeleteId),
		manifestDeleteHash: sanitizeToken(body.manifestDeleteHash),
	};
}

/**
 * 投稿のMML参照。未指定（MMLなしの投稿）は許すので、
 * 「指定が無い」と「指定が不正」を呼び出し側で区別できるように undefined / null を返し分ける。
 */
export function parseMmlRef(
	body: any,
): { mmlUrl?: string; mmlDeleteId?: string; mmlDeleteHash?: string } | null {
	if (
		body?.mmlUrl === undefined ||
		body?.mmlUrl === null ||
		body?.mmlUrl === ""
	)
		return {};
	if (!isValidPayloadUrl(body.mmlUrl, "mml")) return null;
	return {
		mmlUrl: body.mmlUrl,
		mmlDeleteId: sanitizeToken(body.mmlDeleteId),
		mmlDeleteHash: sanitizeToken(body.mmlDeleteHash),
	};
}

/** サムネ用の背景参照。解決済み http(s) URL だけ通す */
export function parseBgRef(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	if (!/^https?:\/\//.test(value)) return undefined;
	if (value.length > 2048) return undefined;
	return value;
}
