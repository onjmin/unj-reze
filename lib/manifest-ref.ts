/**
 * APIが受け取る manifest 参照の検証。
 *
 * manifest 本体はブラウザが uploader-worker へ直接上げるので、サーバーに届くのは
 * URLだけになった。fetch はクライアント側で行われるため SSRF は発生しない。
 *
 * 検証内容:
 * - https であること
 * - パスが /{kind}/[16桁hex].{ext} 形式であること（kind の取り違えを防ぐ）
 * - origin の検証は行わない（画像 URL も同様に検証していないため一貫性を保つ）
 */

export interface ParsedManifestRef {
	manifestUrl: string;
	manifestDeleteId?: string;
	manifestDeleteHash?: string;
}

/**
 * `kind` は uploader 側のキー接頭辞（`mv` / `game` / `mml`）。
 * パス形式を確認することで、MML URL をゲーム manifest として登録するといった
 * 種別取り違えを防ぐ。
 */
export function isValidPayloadUrl(
	url: unknown,
	kind: "mv" | "game" | "mml",
): url is string {
	if (typeof url !== "string" || url === "") return false;
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.protocol !== "https:") return false;
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
	body: unknown,
	kind: "mv" | "game",
): ParsedManifestRef | null {
	const b = body as Record<string, unknown> | null | undefined;
	if (!isValidPayloadUrl(b?.manifestUrl, kind)) return null;
	return {
		manifestUrl: b!.manifestUrl as string,
		manifestDeleteId: sanitizeToken(b!.manifestDeleteId),
		manifestDeleteHash: sanitizeToken(b!.manifestDeleteHash),
	};
}

/**
 * 投稿のMML参照。未指定（MMLなしの投稿、または添付に触れない編集）は許すので、
 * 「指定が無い」と「指定が不正」を呼び出し側で区別できるように undefined / null を返し分ける。
 *
 * 「指定が無い」で `{}` を返すと、呼び出し側（editPost）が「空のMML参照を明示指定された」
 * と区別できず、権利表記だけの編集などで既存の content_data_url を消してしまう事故になる。
 * 必ず undefined を返すこと。
 */
export function parseMmlRef(
	body: unknown,
):
	| { mmlUrl?: string; mmlDeleteId?: string; mmlDeleteHash?: string }
	| null
	| undefined {
	const b = body as Record<string, unknown> | null | undefined;
	if (
		b?.mmlUrl === undefined ||
		b?.mmlUrl === null ||
		b?.mmlUrl === ""
	)
		return undefined;
	if (!isValidPayloadUrl(b.mmlUrl, "mml")) return null;
	return {
		mmlUrl: b!.mmlUrl as string,
		mmlDeleteId: sanitizeToken(b!.mmlDeleteId),
		mmlDeleteHash: sanitizeToken(b!.mmlDeleteHash),
	};
}

/** サムネ用の背景参照。解決済み http(s) URL だけ通す */
export function parseBgRef(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	if (!/^https?:\/\//.test(value)) return undefined;
	if (value.length > 2048) return undefined;
	return value;
}
