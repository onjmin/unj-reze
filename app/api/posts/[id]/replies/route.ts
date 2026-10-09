import { NextRequest, NextResponse } from "next/server";
import {
	isClientSessionId,
	resolveOrCreateSessionUser,
	resolveViewerId,
} from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { REPLIES_PAGE_MAX, REPLIES_PAGE_SIZE } from "@/lib/db/interface";
import { withEdgeCache } from "@/lib/edge-cache";
import { parseImageDeleteRef, parseMmlRef } from "@/lib/assets/manifest-ref";
import { attachEmbedInfo } from "@/lib/post/post-embeds";
import { CH_FEED, chThread } from "@/lib/realtime/channels";
import { publishRealtime } from "@/lib/realtime/publish";
import { decodeId, encodePost } from "@/lib/sqids";
import { sanitizeWalkPreset } from "@/lib/assets/walk-cycle";
import {
	contentError,
	isAcceptableNewImageSrc,
	sanitizeAvatarColor,
} from "../../../_lib/post-input";
import { workOwnershipError } from "../../../_lib/work-owner";

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
	const sp = new URL(_request.url).searchParams;
	const claimedUserId = sp.get("userId");
	// 「誰として見るか」はセッションで裏取りする（lib/auth/session-server.ts resolveViewerId）。
	// クエリを信じると他人の id でその人のブロック/ミュート一覧や投票状態が覗ける。
	const userId = await resolveViewerId(_request, claimedUserId);
	// 既定は「直近 REPLIES_PAGE_SIZE 件」。スレ全件は返さない（docs/NEON_EGRESS.md）。
	// before=<レス番号> で、その番号より古い側の直近 limit 件＝上スクロールの追加読み込み。
	// 未指定は Number(null) === 0 になるので、パラメータの有無を先に見る
	// （0 を limit として通すと1件しか返さない）。
	const rawLimit = Number(sp.get("limit") ?? Number.NaN);
	const limit =
		Number.isFinite(rawLimit) && rawLimit > 0
			? Math.min(rawLimit, REPLIES_PAGE_MAX)
			: REPLIES_PAGE_SIZE;
	const rawBefore = Number(sp.get("before") ?? Number.NaN);
	// >>1 はOPなので、それ以前は存在しない
	const beforeNum =
		Number.isFinite(rawBefore) && rawBefore > 1 ? rawBefore : undefined;
	return await withEdgeCache(
		_request,
		{ sMaxAge: 5, personalized: !!claimedUserId },
		async () => {
			const replies = await db.getReplies(decodedId, userId, {
				limit,
				beforeNum,
			});
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
			imageIsDrawn,
			avatarColor,
			gameId,
			mvId,
			talkId,
			otomadId,
			dotW,
			dotH,
			animFrames,
			animFps,
			walkPreset,
			originType,
			sessionId,
		} = body;

		if (
			!content &&
			!hasImage &&
			!gameId &&
			!mvId &&
			!talkId &&
			!otomadId
		) {
			return NextResponse.json(
				{ error: "content, image, or game is required" },
				{ status: 400 },
			);
		}

		// 本文の長さと画像URLは公開ボディ由来なので必ず検証する（app/api/_lib/post-input.ts）
		const badContent = contentError(content);
		if (badContent) {
			return NextResponse.json({ error: badContent }, { status: 400 });
		}
		if (!isAcceptableNewImageSrc(imageSrc)) {
			return NextResponse.json({ error: "Invalid imageSrc" }, { status: 400 });
		}

		// 作品IDは /api/posts と同じく decodeId で読む（旧sqids形式のIDも通すため）
		const decodedWorkIds: Record<string, number | undefined> = {};
		for (const [key, raw] of Object.entries({ gameId, mvId, talkId, otomadId })) {
			if (!raw) continue;
			const decoded = decodeId(String(raw));
			if (decoded === null) {
				return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
			}
			decodedWorkIds[key] = decoded;
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

		// 添付できるのは自分の作品だけ（app/api/_lib/work-owner.ts）
		const ownershipError = await workOwnershipError(sessionUser, decodedWorkIds);
		if (ownershipError) {
			return NextResponse.json({ error: ownershipError }, { status: 403 });
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
			imageIsDrawn,
			avatarColor: sanitizeAvatarColor(avatarColor),
			gameId: decodedWorkIds.gameId,
			mvId: decodedWorkIds.mvId,
			talkId: decodedWorkIds.talkId,
			otomadId: decodedWorkIds.otomadId,
			dotW: dotW ? Number(dotW) : undefined,
			dotH: dotH ? Number(dotH) : undefined,
			animFrames: animFrames ? Number(animFrames) : undefined,
			animFps: animFps ? Number(animFps) : undefined,
			walkPreset: sanitizeWalkPreset(walkPreset),
			...mmlRef,
			...parseImageDeleteRef(body, imageSrc),
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
			(isClientSessionId(sessionId) ? sessionId : undefined);
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
