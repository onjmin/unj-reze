import { NextRequest, NextResponse } from "next/server";
import { uploadImage } from "@/lib/storage";
import { isUploaderAvailable } from "@/lib/uploader";

export const dynamic = "force-dynamic";

/** 本文（data URL の JSON）の上限。ローカル開発専用なので uploader の画像上限より緩めでよい */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * R2_ENDPOINT がローカルの S3 互換（docker-compose の MinIO）を指しているか。
 * .env.example の既定は STORAGE_PROVIDER=r2 + MinIO。本番の R2 は R2_ENDPOINT を使わない
 * （lib/storage/r2.ts は未設定なら R2 のアカウントのエンドポイントへ繋ぐ）。
 */
function isLocalR2Endpoint(): boolean {
	const endpoint = process.env.R2_ENDPOINT;
	if (!endpoint) return false;
	try {
		const host = new URL(endpoint).hostname.toLowerCase();
		return (
			host === "localhost" ||
			host === "127.0.0.1" ||
			host === "[::1]" ||
			host === "minio" ||
			host.endsWith(".localhost")
		);
	} catch {
		return false;
	}
}

/**
 * 本文を上限付きで読む。上限を超えたら null（読みかけの本文は捨てる）。
 * Content-Length の無い（chunked）本文も、全部をメモリに溜めてパースする前に止める。
 */
async function readTextCapped(
	request: Request,
	maxBytes: number,
): Promise<string | null> {
	if (!request.body) return "";
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		bytes.set(c, offset);
		offset += c.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

export async function POST(request: NextRequest) {
	// uploader が設定されている環境（本番）では画像は必ず uploader を通す
	// （lib/uploader.ts uploadImage）。ここでR2へ直接書くと、uploader の
	// リプレイ検知・形式チェック・サイズ上限・レート制限を全部素通りできてしまう。
	// このルートは uploader の無いローカル開発専用。
	// NEXT_PUBLIC_UPLOADER_URL を入れ忘れたビルドでも、保存先が本物の R2 なら同じ理由で必ず断る
	// （認証もサイズ上限も無いまま本番の R2 に書けてしまう。AGENTS.md: R2 へ直接書かない）。
	// ローカルの MinIO（R2_ENDPOINT が localhost 等）だけは従来どおり通す。
	if (
		isUploaderAvailable ||
		(process.env.STORAGE_PROVIDER === "r2" && !isLocalR2Endpoint())
	) {
		return NextResponse.json(
			{ error: "images must be uploaded via the uploader" },
			{ status: 410 },
		);
	}
	// 本文を読む前に大きさを見る（巨大な JSON をパースさせない）
	const contentLength = Number(request.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
		return NextResponse.json({ error: "image too large" }, { status: 413 });
	}
	try {
		const text = await readTextCapped(request, MAX_BODY_BYTES);
		if (text === null) {
			return NextResponse.json({ error: "image too large" }, { status: 413 });
		}
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
		}
		// 保存名（R2のキー）は必ずサーバーで作る。クライアントの filename を使うと
		// 既存のキーを指定して他人の画像を上書きできてしまう。
		const image = (body as { image?: unknown } | null)?.image;

		if (!image) {
			return NextResponse.json({ error: "image is required" }, { status: 400 });
		}

		if (typeof image !== "string" || !image.startsWith("data:image/")) {
			return NextResponse.json(
				{ error: "invalid image format" },
				{ status: 400 },
			);
		}

		const url = await uploadImage(image);
		return NextResponse.json({ url }, { status: 201 });
	} catch (e) {
		console.error("Upload error:", e);
		return NextResponse.json({ error: "upload failed" }, { status: 500 });
	}
}
