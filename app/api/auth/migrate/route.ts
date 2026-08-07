import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";

// 移行トークンの発行(過去の匿名アカウントを新セッションへ引き継ぐため)
//
// 引き換え側(PUT)は session_id を丸ごと差し替えるため、発行はアカウント乗っ取りと
// 同じ重みを持つ。誰の分を発行するかは絶対に body で指定させず、セッション本人に限る。
export async function POST(request: NextRequest) {
	const { sessionId } = await request.json().catch(() => ({}));
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	const token = await db.issueMigrationToken(user.id);
	return NextResponse.json({ token });
}

// 移行トークンの引き換え(新セッションを既存アカウントに再バインド)
export async function PUT(request: NextRequest) {
	const { token, sessionId } = await request.json();
	if (!token || !sessionId) {
		return NextResponse.json(
			{ error: "token and sessionId are required" },
			{ status: 400 },
		);
	}
	const user = await db.redeemMigrationToken(token, sessionId);
	if (!user)
		return NextResponse.json(
			{ error: "invalid or expired token" },
			{ status: 404 },
		);

	const response = NextResponse.json(user);
	response.cookies.set("unj_reze_session", sessionId, {
		httpOnly: false,
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 60 * 24 * 365,
	});
	return response;
}
