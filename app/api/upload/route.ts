import { NextRequest, NextResponse } from "next/server";
import { uploadImage } from "@/lib/storage";
import { isUploaderAvailable } from "@/lib/uploader";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
	// uploader が設定されている環境（本番）では画像は必ず uploader を通す
	// （lib/uploader.ts uploadImage）。ここでR2へ直接書くと、uploader の
	// リプレイ検知・形式チェック・サイズ上限・レート制限を全部素通りできてしまう。
	// このルートは uploader の無いローカル開発専用。
	if (isUploaderAvailable) {
		return NextResponse.json(
			{ error: "images must be uploaded via the uploader" },
			{ status: 410 },
		);
	}
	try {
		// 保存名（R2のキー）は必ずサーバーで作る。クライアントの filename を使うと
		// 既存のキーを指定して他人の画像を上書きできてしまう。
		const { image } = await request.json();

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
