import { NextRequest, NextResponse } from "next/server";
import {
	isClientSessionId,
	resolveSessionUser,
	SESSION_COOKIE,
} from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/ip";
import {
	isAcceptableAvatarUrl,
	MAX_BIO_LENGTH,
	MAX_DISPLAY_NAME_LENGTH,
} from "../../_lib/post-input";

/**
 * セッションIDに対応する匿名ユーザーを返す（無ければ作る）。
 * `bbscgi:` で始まるIDなど、クライアントが名乗ってはいけないIDは弾く
 * （lib/auth/session-server.ts isClientSessionId）。
 */
async function getOrCreate(request: NextRequest, sessionId: unknown) {
	if (!sessionId) {
		return NextResponse.json(
			{ error: "sessionId is required" },
			{ status: 400 },
		);
	}
	if (!isClientSessionId(sessionId)) {
		return NextResponse.json({ error: "invalid sessionId" }, { status: 400 });
	}

	const ipAddress = getClientIp(request.headers);
	const user = await db.getOrCreateAnonymousUser(sessionId, ipAddress);

	const response = NextResponse.json(user);
	response.headers.set("Cache-Control", "private, no-store");
	response.cookies.set(SESSION_COOKIE, sessionId, {
		httpOnly: false,
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 60 * 24 * 365,
	});
	return response;
}

/**
 * 旧方式（`?sessionId=` をクエリで渡す）。セッションIDは秘密そのものなので、
 * クエリに載せるとアクセスログ・Referer・履歴に残る。クライアントは POST へ移した
 * （lib/api.ts auth.anonymous）。古いタブ・キャッシュされたJSのために当面残す。
 */
export async function GET(request: NextRequest) {
	return getOrCreate(request, new URL(request.url).searchParams.get("sessionId"));
}

/** 本文 `{ sessionId }` で受ける（推奨） */
export async function POST(request: NextRequest) {
	const body = await request.json().catch(() => ({}));
	return getOrCreate(request, (body as { sessionId?: unknown })?.sessionId);
}

export async function PUT(request: NextRequest) {
	const body = await request.json();
	const { displayName, avatarUrl, bio, sessionId } = body;

	// 更新対象はセッションから決める。body の userId/slug は受け付けない
	// （どちらも公開情報なので、指定させると他人のプロフィールを書き換えられる）。
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	// displayName は任意。アイコンや自己紹介だけの更新で表示名を送らせると、
	// 画面表示用のラベル（例: 名無しWSG）がそのまま保存され、slug ごと変わってしまう。
	if (
		displayName === undefined &&
		avatarUrl === undefined &&
		bio === undefined
	) {
		return NextResponse.json({ error: "nothing to update" }, { status: 400 });
	}

	// 値の検証。アイコンは data: URL を入れさせない（users 行に画像本体が入り、
	// 投稿のたびに著者情報として読まれて Neon の転送量を壊す）。
	if (
		displayName !== undefined &&
		(typeof displayName !== "string" ||
			displayName.length > MAX_DISPLAY_NAME_LENGTH)
	) {
		return NextResponse.json({ error: "Invalid displayName" }, { status: 400 });
	}
	if (
		bio !== undefined &&
		(typeof bio !== "string" || bio.length > MAX_BIO_LENGTH)
	) {
		return NextResponse.json({ error: "Invalid bio" }, { status: 400 });
	}
	if (avatarUrl !== undefined && !isAcceptableAvatarUrl(avatarUrl)) {
		return NextResponse.json({ error: "Invalid avatarUrl" }, { status: 400 });
	}

	await db.updateUserDisplayName(user.id, displayName, avatarUrl, bio);

	return NextResponse.json({ success: true });
}
