import { NextRequest, NextResponse } from "next/server";
import {
	isClientSessionId,
	isSameOriginRequest,
	resolveSessionUser,
} from "@/lib/auth/session-server";
import { db } from "@/lib/db";

// 発行・引き換えとも同じオリジンのページからだけ受ける（lib/auth/session-server.ts
// isSameOriginRequest）。他サイトから引き換えさせると、閲覧者のセッションを攻撃者の
// アカウントへ付け替えられる（ログイン CSRF）。

// 移行トークンの発行(過去の匿名アカウントを新セッションへ引き継ぐため)
//
// 引き換え側(PUT)は session_id を丸ごと差し替えるため、発行はアカウント乗っ取りと
// 同じ重みを持つ。誰の分を発行するかは絶対に body で指定させず、セッション本人に限る。
export async function POST(request: NextRequest) {
	if (!isSameOriginRequest(request)) {
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	}
	const { sessionId } = await request.json().catch(() => ({}));
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	const token = await db.issueMigrationToken(user.id);
	return NextResponse.json({ token });
}

// 移行トークンの引き換え(新セッションを既存アカウントに再バインド)
//
// Cookie はサーバーで書かない。クライアント（SettingsPanel）は自分の今のセッションID
// （ensureSessionId）で引き換えてから再読み込みするので、Cookie も localStorage も既にその値。
// サーバーが本文の sessionId で Set-Cookie すると、他人のブラウザの Cookie を任意の値に
// 差し替える口になる（セッション固定）。
export async function PUT(request: NextRequest) {
	if (!isSameOriginRequest(request)) {
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	}
	const { token, sessionId } = await request.json();
	if (!token || !sessionId) {
		return NextResponse.json(
			{ error: "token and sessionId are required" },
			{ status: 400 },
		);
	}
	// 付け替え先のセッションIDもクライアントが名乗る値なので、内部専用の `bbscgi:` などは
	// 弾く（通すと専ブラ利用者のIPトークンを自分のアカウントへ付け替えられる）。
	if (typeof token !== "string" || token.length > 128 || !isClientSessionId(sessionId)) {
		return NextResponse.json({ error: "invalid token or sessionId" }, { status: 400 });
	}
	const user = await db.redeemMigrationToken(token, sessionId);
	if (!user)
		return NextResponse.json(
			{ error: "invalid or expired token" },
			{ status: 404 },
		);

	return NextResponse.json(user);
}
