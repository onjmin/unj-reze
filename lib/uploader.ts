/**
 * uploader-worker（Cloudflare Workers + R2）のクライアント。
 *
 * ゲーム/MVの manifest と MML本文をDBから追い出すために使う。
 * ブラウザから直接 Worker を叩くので、manifest が unj-reze のサーバーを一切通らない。
 * Neon の転送量だけでなく、Workers Functions 側の帯域も減る（docs/NEON_EGRESS.md）。
 *
 * 読み出しも同じくブラウザ→R2で、Next のサーバーは介在しない。
 * R2は immutable で配っているので2回目以降はブラウザキャッシュから返る。
 */

const UPLOADER_URL = process.env.NEXT_PUBLIC_UPLOADER_URL || "";
const CLIENT_ID = process.env.NEXT_PUBLIC_UPLOADER_CLIENT_ID || "";
const UPLOAD_SECRET_PEPPER =
	process.env.NEXT_PUBLIC_UPLOADER_UPLOAD_SECRET_PEPPER || "";

export const isUploaderAvailable = UPLOADER_URL !== "";

/** uploader 側の kind。content_type のビットと1対1で対応する */
export type UploadKind = "mml" | "encrypt" | "mv" | "game";

/** kind ごとの gzip 要否。mv/game のJSONは30倍近く縮む。
 *  mml は encodeMml 済み、encrypt は base64 なので圧縮は効かない */
const NEEDS_GZIP: Record<UploadKind, boolean> = {
	mml: false,
	encrypt: false,
	mv: true,
	game: true,
};

export interface UploadResult {
	/** R2の公開URL。DBにはこれだけを保存する */
	link: string;
	/** 削除用のキー */
	deleteId: string;
	/**
	 * 削除トークン。DELETE_SECRET_PEPPER はWorker側にしか無く後から再計算できないので、
	 * DBに保存しておかないと二度と消せなくなる。
	 */
	deleteHash: string;
}

async function sha256(message: string): Promise<string> {
	const bytes = new TextEncoder().encode(message);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function gzip(text: string): Promise<ArrayBuffer> {
	const stream = new Response(new TextEncoder().encode(text)).body!.pipeThrough(
		new CompressionStream("gzip"),
	);
	return new Response(stream).arrayBuffer();
}

/**
 * テキストをR2へ上げてURLを返す。
 *
 * nonce は毎回作り直す。これが無いと、本文がバイト単位で一致する正当な保存
 * （プリセットのまま無編集で投稿、編集を元に戻して再保存、同じMMLのコピペ）が
 * Worker のリプレイ検知で 403 になる。nonce自体が署名対象なのでリプレイ防止は効いたまま。
 */
export async function uploadText(
	kind: UploadKind,
	text: string,
): Promise<UploadResult> {
	if (!isUploaderAvailable) {
		throw new Error("NEXT_PUBLIC_UPLOADER_URL が設定されていません");
	}

	const nonce = crypto.randomUUID().replace(/-/g, "");
	// 署名対象は展開後のテキスト。gzipの有無でハッシュは変わらない
	const requestHash = await sha256(
		`${kind}\n${nonce}\n${text}` + UPLOAD_SECRET_PEPPER,
	);

	const useGzip = NEEDS_GZIP[kind];
	const params = new URLSearchParams({ kind, nonce });
	if (useGzip) params.set("gzip", "1");

	const res = await fetch(`${UPLOADER_URL}/text?${params.toString()}`, {
		method: "POST",
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			Authorization: `Client-ID ${CLIENT_ID}`,
			"X-Request-Hash": requestHash,
		},
		body: useGzip ? await gzip(text) : text,
	});
	if (!res.ok)
		throw new Error(
			`アップロードに失敗しました: ${res.status} ${await res.text()}`,
		);

	const json = (await res.json()) as {
		data: { link: string; delete_id: string; delete_hash: string };
	};
	return {
		link: json.data.link,
		deleteId: json.data.delete_id,
		deleteHash: json.data.delete_hash,
	};
}

/** manifest（JSON）をR2へ。JSON.stringify してから上げる */
export async function uploadJson(
	kind: "mv" | "game",
	value: unknown,
): Promise<UploadResult> {
	return uploadText(kind, JSON.stringify(value));
}

/**
 * R2に置いたテキストを取り戻す。
 * gzipで置いたものは Content-Encoding をブラウザが見て透過的に展開するので、
 * 呼び出し側にデコードのコードは要らない。
 */
export async function fetchText(url: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`データの取得に失敗しました: ${res.status}`);
	return res.text();
}

/** R2に置いたJSONを取り戻す */
export async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`データの取得に失敗しました: ${res.status}`);
	return res.json() as Promise<T>;
}

/**
 * R2に置いたオブジェクトのサイズだけをHEADで取る（本文はダウンロードしない）。
 * gzip配信の場合、Content-Length は転送量＝gzip後サイズを返す（展開後サイズではない）。
 * 取得できない・失敗した場合は null。
 */
export async function fetchSize(url: string): Promise<number | null> {
	try {
		const res = await fetch(url, { method: "HEAD" });
		if (!res.ok) return null;
		const len = res.headers.get("Content-Length");
		if (!len) return null;
		const n = Number(len);
		return Number.isFinite(n) ? n : null;
	} catch {
		return null;
	}
}

/**
 * R2のオブジェクトを消す。
 *
 * 編集は「同じキーへの上書き」ができない（immutable で配っているので、エッジと
 * ブラウザが最大1年間ずっと古い内容を返す）。新しいキーに上げ直したうえで、
 * **DBを更新してから** 旧オブジェクトを消すこと。順序を逆にすると、DB更新に
 * 失敗した時点で投稿が復旧不能になる。
 */
export async function deleteObject(
	deleteId: string,
	deleteHash: string,
): Promise<void> {
	if (!isUploaderAvailable) return;
	const params = new URLSearchParams({
		delete_id: deleteId,
		delete_hash: deleteHash,
	});
	await fetch(`${UPLOADER_URL}/delete?${params.toString()}`, {
		method: "DELETE",
		headers: { Authorization: `Client-ID ${CLIENT_ID}` },
	});
}
