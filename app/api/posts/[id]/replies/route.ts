import { NextRequest, NextResponse } from "next/server";
import { resolveOrCreateSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";
import { parseMmlRef } from "@/lib/manifest-ref";
import { attachEmbedInfo } from "@/lib/post-embeds";
import { CH_FEED, chThread } from "@/lib/realtime/channels";
import { publishRealtime } from "@/lib/realtime/publish";
import { decodeId, encodePost } from "@/lib/sqids";
import { sanitizeWalkPreset } from "@/lib/walk-cycle";

export const dynamic = "force-dynamic";

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
	try {
		const { id } = await params;
		const decodedId = decodeId(id);
		if (decodedId === null) {
			return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
		}
		const body = await request.json();
		const {
			content,
			parentPostId,
			hasImage,
			imageSrc,
			imageAlt,
			avatarColor,
			gameId,
			mvId,
			dotW,
			dotH,
			animFrames,
			animFps,
			walkPreset,
			originType,
			sessionId,
		} = body;

		if (!content && !hasImage && !gameId && !mvId) {
			return NextResponse.json(
				{ error: "content, image, or game is required" },
				{ status: 400 },
			);
		}

		// セッション本人を解決、未登録セッションなら自動作成
		const sessionUser = await resolveOrCreateSessionUser(request, sessionId);
		const displayName = sessionUser.displayName;
		const authorSlug = sessionUser.slug;

		const decodedParentPostId = parentPostId ? decodeId(parentPostId) : undefined;
		if (parentPostId && decodedParentPostId === null) {
			return NextResponse.json(
				{ error: "Invalid parentPostId" },
				{ status: 400 },
			);
		}

		// MML本文はブラウザが uploader-worker へ直接上げ済み。ここに来るのはURLだけ
		const mmlRef = parseMmlRef(body);
		if (mmlRef === null) {
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
			dotW: dotW ? Number(dotW) : undefined,
			dotH: dotH ? Number(dotH) : undefined,
			animFrames: animFrames ? Number(animFrames) : undefined,
			animFps: animFps ? Number(animFps) : undefined,
			walkPreset: sanitizeWalkPreset(walkPreset),
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

		const response = NextResponse.json(encoded, { status: 201 });
		const resolvedSessionId =
			request.cookies.get("unj_reze_session")?.value ||
			(typeof sessionId === "string" ? sessionId : undefined);
		if (resolvedSessionId) {
			response.cookies.set("unj_reze_session", resolvedSessionId, {
				httpOnly: false,
				sameSite: "lax",
				path: "/",
				maxAge: 60 * 60 * 24 * 365,
			});
		}
		return response;
	} catch (e) {
		console.error("[POST /api/posts/[id]/replies]", e);
		const message = e instanceof Error ? e.message : String(e);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
