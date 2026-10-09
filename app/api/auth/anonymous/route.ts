import { NextRequest, NextResponse } from "next/server";
import {
	getOrCreateSessionUserById,
	isClientSessionId,
	isExposedError,
	isSameOriginRequest,
	resolveSessionUser,
} from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/ip";
import {
	isAcceptableAvatarUrl,
	MAX_BIO_LENGTH,
	MAX_DISPLAY_NAME_LENGTH,
} from "../../_lib/post-input";

// セッション（Cookie `unj_reze_session`）はクライアントが lib/session.ts の ensureSessionId で
// 自分で書く。サーバーはここで Set-Cookie しない。
// 以前は GET ?sessionId=X / POST がサーバー側で Cookie を X に書き換えていたので、
// 画像 URL などに自サイトのこの URL を仕込むだけで、閲覧者全員を攻撃者のセッション X に
// 切り替えられた（セッション固定）。攻撃者は同じ X で DM・通知を読める。

const NO_STORE = { "Cache-Control": "private, no-store" };

function jsonError(error: string, status: number) {
	return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function isJsonRequest(request: NextRequest): boolean {
	const type = (request.headers.get("content-type") || "")
		.split(";")[0]
		.trim()
		.toLowerCase();
	return type === "application/json";
}

/**
 * 廃止。セッションIDは秘密そのものなのでクエリに載せるとログ・Referer・履歴に残り、
 * しかも GET は `<img src>` 1つで他人のブラウザに踏ませられる（上のコメント）。
 * クライアントは POST に移行済み（lib/api.ts auth.anonymous）。古いタブ・キャッシュされた JS は
 * ここで失敗し、useCurrentUser が黙って諦める（再読み込みで新しい JS になる）。
 * ユーザーの作成も Cookie の書き込みも DB への問い合わせもしない。
 */
export async function GET() {
	return jsonError(
		"このエンドポイントは廃止されました。ページを再読み込みしてください",
		410,
	);
}

/**
 * 本文 `{ sessionId }` に対応する匿名ユーザーを返す（無ければ作る）。
 * - 同じオリジンのページからだけ受ける（他サイトのフォーム・fetch によるログイン CSRF を防ぐ）
 * - JSON だけ受ける（`<form>` は application/json を送れないので、CORS の事前確認なしに
 *   他サイトから送れる形を締め出す）
 * - `bbscgi:` で始まるIDなど、クライアントが名乗ってはいけないIDは弾く（isClientSessionId）
 * - 新規作成は UUID 形式と登録枠に限る（getOrCreateSessionUserById）
 */
export async function POST(request: NextRequest) {
	if (!isSameOriginRequest(request)) return jsonError("forbidden", 403);
	if (!isJsonRequest(request)) {
		return jsonError("Content-Type must be application/json", 415);
	}

	const body = await request.json().catch(() => ({}));
	const sessionId = (body as { sessionId?: unknown } | null)?.sessionId;
	if (!sessionId) return jsonError("sessionId is required", 400);
	if (!isClientSessionId(sessionId)) return jsonError("invalid sessionId", 400);

	try {
		const user = await getOrCreateSessionUserById(
			sessionId,
			getClientIp(request.headers),
		);
		return NextResponse.json(user, { headers: NO_STORE });
	} catch (err) {
		if (isExposedError(err)) return jsonError(err.message, err.status);
		throw err;
	}
}

export async function PUT(request: NextRequest) {
	// 他サイトからプロフィールを書き換えさせない（POST と同じ理由）
	if (!isSameOriginRequest(request)) return jsonError("forbidden", 403);

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
