import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";
import { parseMmlRef } from "@/lib/manifest-ref";
import { attachEmbedInfo } from "@/lib/post-embeds";
import { CH_FEED, chThread } from "@/lib/realtime/channels";
import { publishRealtime } from "@/lib/realtime/publish";
import { decodeId, encodePost } from "@/lib/sqids";

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	const userId = new URL(_request.url).searchParams.get("userId") || undefined;
	return await withEdgeCache(
		_request,
		{ sMaxAge: 5, personalized: !!userId },
		async () => {
			const replies = await db.getReplies(decodedId, userId);
			await attachEmbedInfo(replies);
			return NextResponse.json(replies.map(encodePost));
		},
	);
}

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	const body = await request.json();
	const {
		displayName: bodyDisplayName,
		content,
		parentPostId,
		hasImage,
		imageSrc,
		imageAlt,
		avatarColor,
		gameId,
		mvId,
		originType,
		sessionId,
	} = body;

	if (!bodyDisplayName) {
		return NextResponse.json(
			{ error: "displayName is required" },
			{ status: 400 },
		);
	}

	if (!content && !hasImage && !gameId && !mvId) {
		return NextResponse.json(
			{ error: "content, image, or game is required" },
			{ status: 400 },
		);
	}

	// セッションが確認できた場合はセッション本人の identity を使う。
	// 返信もログイン不要なので、セッション不明の場合は body の displayName にフォールバックする。
	const sessionUser = await resolveSessionUser(request, sessionId);
	const displayName = sessionUser?.displayName ?? bodyDisplayName;
	const authorSlug = sessionUser?.slug ?? undefined;

	const decodedParentPostId = parentPostId ? decodeId(parentPostId) : undefined;
	if (parentPostId && decodedParentPostId === null) {
		return NextResponse.json(
			{ error: "Invalid parentPostId" },
			{ status: 400 },
		);
	}

	// MML本文はブラウザが uploader-worker へ直接上げ済み。ここに来るのはURLだけ
	const mmlRef = parseMmlRef(body);
	if (!mmlRef) {
		return NextResponse.json({ error: "Invalid mmlUrl" }, { status: 400 });
	}

	const reply = await db.addReply(decodedId, {
		displayName,
		slug: authorSlug,
		content: content || "",
		parentPostId:
			decodedParentPostId === null ? undefined : decodedParentPostId,
		hasImage,
		imageSrc,
		imageAlt,
		avatarColor,
		gameId: gameId ? Number(gameId) : undefined,
		mvId: mvId ? Number(mvId) : undefined,
		...mmlRef,
		originType,
	});
	if (!reply) {
		return NextResponse.json({ error: "Post not found" }, { status: 404 });
	}

	await attachEmbedInfo(reply);
	const encoded = encodePost(reply);

	// スレッド購読者（詳細画面・実況コメント）とフィードの返信タブへ push する。
	// ライブ配信中の 2〜3秒ポーリングを置き換えるのがここ。
	publishRealtime([
		{ channel: chThread(id), event: "reply.created", data: encoded },
		{ channel: CH_FEED, event: "reply.created", data: encoded },
	]);

	return NextResponse.json(encoded, { status: 201 });
}
