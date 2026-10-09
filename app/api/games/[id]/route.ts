import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { parseBgRef, parseManifestRef } from "@/lib/assets/manifest-ref";
import { decodeId, encodeGame, encodeId } from "@/lib/sqids";

/** 作品タイトルの上限（文字数）。超えた分は切る（app/api/games/route.ts と同じ） */
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
	const game = await db.getGame(decodedId);
	if (!game) return NextResponse.json({ error: "not found" }, { status: 404 });
	// 鍵アカの作者のゲームは、投稿と同じ規則（lib/db/pg.ts authorVisibleSql）で
	// 本人か「作者がフォローしている人」にだけ見せる。それ以外には存在しない扱い。
	// 公開の作者のときは設定を1回引くだけで、セッションは引かない。
	if (game.creatorSlug) {
		const settings = await db.getUserSettings(game.creatorSlug);
		if (settings.isPrivate) {
			const viewer = await resolveSessionUser(request);
			const allowed =
				!!viewer?.slug &&
				(viewer.slug === game.creatorSlug ||
					(await db.isFollowing(game.creatorSlug, viewer.slug)));
			if (!allowed)
				return NextResponse.json({ error: "not found" }, { status: 404 });
		}
	}
	// ゲーム単独ページ（/game/[id]）が1回のフェッチで完結できるよう、
	// 紐づく投稿ID・権利表記（改造可否の判定に使う）もここで一緒に返す。
	const postId = await db.getPostIdByGameId(decodedId);
	const post = postId ? await db.getPost(postId) : null;
	return NextResponse.json({
		...encodeGame(game),
		postId: postId ? encodeId(postId) : undefined,
		originType: post?.originType,
	});
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
	const { title, sessionId } = body;
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

	// 編集は毎回R2の新しいキーへ上げ直したうえで、そのURLが送られてくる。
	// 同じキーへの上書きは不可（immutable で配っているので古い内容が残り続ける）。
	const manifestRef = parseManifestRef(body, "game");
	if (!manifestRef) {
		return NextResponse.json(
			{ error: "valid manifestUrl is required" },
			{ status: 400 },
		);
	}

	// 作者判定はセッション本人の slug で行う（body の userSlug は公開情報なので信用できない）
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	const game = await db.getGame(decodedId);
	if (!game) return NextResponse.json({ error: "not found" }, { status: 404 });
	if (!game.creatorSlug || game.creatorSlug !== user.slug) {
		return NextResponse.json(
			{ error: "Only the creator can edit this game" },
			{ status: 403 },
		);
	}

	let updated: Awaited<ReturnType<typeof db.updateGame>>;
	try {
		updated = await db.updateGame(decodedId, {
			title: safeTitle,
			...manifestRef,
			bgRef: parseBgRef(body.bgRef),
		});
	} catch (e) {
		return exposedErrorResponse(e);
	}
	if (!updated)
		return NextResponse.json({ error: "not found" }, { status: 404 });

	// 旧オブジェクトの削除トークンを返す。DB更新が成功したあとにクライアントが消す。
	// 順序を逆にすると、UPDATE失敗時にゲームが復旧不能になる。
	return NextResponse.json({
		...encodeGame(updated),
		previousManifest: game.manifestDeleteId
			? { deleteId: game.manifestDeleteId, deleteHash: game.manifestDeleteHash }
			: undefined,
	});
}
