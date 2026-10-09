import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";

/** 通報の対象種別。UI（PostContainer / PostDetail / ProfileView / UserActionMenu）が送るのはこの2つだけ */
const VALID_TARGET_TYPES = new Set(["post", "user"]);
/** targetId の上限（投稿 id・users.id の文字列。どちらも十分短い） */
const MAX_TARGET_ID_LENGTH = 64;
/** 通報理由の上限（文字数） */
const MAX_REASON_LENGTH = 1000;

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

// 通報者は必ずセッション本人。body の reporterSlug を信じると他人の名前で通報を捏造できる。
export async function POST(request: NextRequest) {
	const { targetType, targetId, reason, sessionId } = await request.json();
	const user = await resolveSessionUser(request, sessionId);
	if (!user?.slug)
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	if (!targetType || !targetId) {
		return NextResponse.json(
			{ error: "targetType and targetId are required" },
			{ status: 400 },
		);
	}
	// reports は管理者が読む表なので、任意の長さ・種別の文字列を積ませない
	if (typeof targetType !== "string" || !VALID_TARGET_TYPES.has(targetType)) {
		return NextResponse.json({ error: "invalid targetType" }, { status: 400 });
	}
	if (typeof targetId !== "string" || targetId.length > MAX_TARGET_ID_LENGTH) {
		return NextResponse.json({ error: "invalid targetId" }, { status: 400 });
	}
	if (
		reason !== undefined &&
		reason !== null &&
		(typeof reason !== "string" || reason.length > MAX_REASON_LENGTH)
	) {
		return NextResponse.json(
			{ error: `通報理由は${MAX_REASON_LENGTH}文字までです` },
			{ status: 400 },
		);
	}
	try {
		await db.reportContent({
			reporterSlug: user.slug,
			targetType,
			targetId,
			reason: reason || "",
		});
	} catch (e) {
		return exposedErrorResponse(e);
	}
	return NextResponse.json({ success: true });
}
