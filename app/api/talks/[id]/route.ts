import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";
import { parseBgRef, parseManifestRef } from "@/lib/assets/manifest-ref";
import { decodeId, encodeTalk } from "@/lib/sqids";

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
 * 利用者に見せてよいエラー（`expose: true` と `status` を持つ Error。db 側の入力検査など）は
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

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	// 中身は再編集されるまで変わらないので、エッジで長めに持たせてよい（誰が見ても同じ）。
	return await withEdgeCache(
		request,
		{ sMaxAge: 300, personalized: false },
		async () => {
			const talk = await db.getTalk(decodedId);
			if (!talk)
				return NextResponse.json({ error: "not found" }, { status: 404 });
			return NextResponse.json(encodeTalk(talk));
		},
	);
}

export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
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

	// 編集は毎回R2の新しいキーへ上げ直したうえで、そのURLが送られてくる（immutable 配信のため）。
	const manifestRef = parseManifestRef(body, "talk");
	if (!manifestRef) {
		return NextResponse.json(
			{ error: "valid manifestUrl is required" },
			{ status: 400 },
		);
	}

	// 作者判定はセッション本人の slug で行う（body の slug は公開情報）。
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	const talk = await db.getTalk(decodedId);
	if (!talk)
		return NextResponse.json({ error: "not found" }, { status: 404 });
	if (!talk.creatorSlug || talk.creatorSlug !== user.slug) {
		return NextResponse.json(
			{ error: "Only the creator can edit this talk" },
			{ status: 403 },
		);
	}

	let updated: Awaited<ReturnType<typeof db.updateTalk>>;
	try {
		updated = await db.updateTalk(decodedId, {
			title: safeTitle,
			...manifestRef,
			bgUrl: parseBgRef(body.bgUrl),
		});
	} catch (e) {
		return exposedErrorResponse(e);
	}
	if (!updated)
		return NextResponse.json({ error: "not found" }, { status: 404 });

	// 旧オブジェクトの削除トークンを返す。DB更新が成功したあとにクライアントが消す
	return NextResponse.json({
		...encodeTalk(updated),
		previousManifest: talk.manifestDeleteId
			? { deleteId: talk.manifestDeleteId, deleteHash: talk.manifestDeleteHash }
			: undefined,
	});
}
