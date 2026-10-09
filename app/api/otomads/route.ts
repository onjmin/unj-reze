import { NextRequest, NextResponse } from "next/server";
import { resolveOrCreateSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { parseBgRef, parseManifestRef } from "@/lib/assets/manifest-ref";
import { encodeOtomad } from "@/lib/sqids";

/** 作品タイトルの上限（文字数）。超えた分は切る */
const MAX_TITLE_LENGTH = 100;

/**
 * タイトルの前後の空白を落とし、上限を超えた分は切る。文字列でない・空なら null（400）。
 * 長すぎても弾かない：タイトル欄に maxLength が無く、改造のたびに「（改造）」が付くうえ、
 * 編集の保存（app/page.tsx handleSaveEdited*）は失敗を表示しないので、弾くと長いタイトルの
 * 作品が黙って保存できなくなる。共有行に積ませない目的は切るだけで足りる。
 */
function parseTitle(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const t = value.trim();
	if (!t) return null;
	let cut = t.slice(0, MAX_TITLE_LENGTH);
	// 切り口でサロゲートペアの片割れを残さない
	if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
	return cut.trimEnd();
}

/**
 * 利用者に見せてよいエラー（`expose: true` と `status` を持つ Error。セッション作成の 401/400/429 や db 側の入力検査）は
 * その文言と status の JSON にする。それ以外は投げ直す（従来どおり 500）。
 */
function exposedErrorResponse(e: unknown): NextResponse {
	const err = e as {
		expose?: unknown;
		status?: unknown;
		message?: unknown;
	} | null;
	if (
		err &&
		err.expose === true &&
		typeof err.status === "number" &&
		Number.isInteger(err.status) &&
		err.status >= 400 &&
		err.status <= 599
	) {
		return NextResponse.json(
			{ error: String(err.message ?? "error") },
			{ status: err.status },
		);
	}
	throw e;
}

/**
 * 音MAD（otomad）の作成。app/api/talks/route.ts と同じ形。
 * manifest 本体はブラウザが uploader-worker へ直接上げ済みで、ここには URL だけが届く。
 * 構造の検証は (1) uploader の JSON 検証、(2) OtomadMaker の保存前チェック（otomadPostability）、
 * (3) OtomadPlayer が壊れた manifest を握り潰す、の三段で守る。ここで守るのは保存先だけ。
 */
export async function POST(request: NextRequest) {
	const body = await request.json();
	const { title, sessionId } = body as { title?: string; sessionId?: string };

	if (!title) {
		return NextResponse.json({ error: "title is required" }, { status: 400 });
	}
	const safeTitle = parseTitle(title);
	if (safeTitle === null) {
		return NextResponse.json(
			{ error: "title must be a non-empty string" },
			{ status: 400 },
		);
	}

	const manifestRef = parseManifestRef(body, "otomad");
	if (!manifestRef) {
		return NextResponse.json(
			{ error: "valid manifestUrl is required" },
			{ status: 400 },
		);
	}

	try {
		// creatorSlug はセッション本人の slug を使う。body の creatorSlug は公開情報なので信用できない。
		// 投稿（/api/posts）と同じく未登録セッションならここで作る：作者が空だと、続く投稿で
		// 「自分の作品か」を確かめられず添付できない（app/api/_lib/work-owner.ts）。
		// セッションが無い・作成の上限に当たったときは 401/400/429 が投げられる（exposedErrorResponse）。
		const user = await resolveOrCreateSessionUser(request, sessionId);
		const creatorSlug = user.slug;

		const otomad = await db.createOtomad({
			title: safeTitle,
			...manifestRef,
			bgUrl: parseBgRef(body.bgUrl),
			creatorSlug,
		});
		return NextResponse.json(encodeOtomad(otomad), { status: 201 });
	} catch (e) {
		return exposedErrorResponse(e);
	}
}
