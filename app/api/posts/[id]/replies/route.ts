import { NextRequest, NextResponse } from "next/server";
import {
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
import { guardNewPost } from "@/lib/security/post-guard";
import { decodeId, encodePost } from "@/lib/sqids";
import { sanitizeWalkPreset } from "@/lib/assets/walk-cycle";
import {
	contentError,
	errorResponse,
	isAcceptableNewImageSrc,
	isAcceptableOriginType,
	parseCreateDotMeta,
	sanitizeAvatarColor,
	sanitizeContentText,
} from "../../../_lib/post-input";
import { workOwnershipError } from "../../../_lib/work-owner";

export const dynamic = "force-dynamic";

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
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
			// パーソナライズは裏取りできた viewer があるときだけ（app/api/posts/route.ts の GET と同じ理由。
			// でたらめな ?userId= でキャッシュを素通りさせない）
			{ sMaxAge: 5, personalized: !!userId },
			async () => {
				const replies = await db.getReplies(decodedId, userId, {
					limit,
					beforeNum,
				});
				await attachEmbedInfo(replies);
				return NextResponse.json(replies.map(encodePost));
			},
		);
	} catch (e) {
		// Postgres のエラーメッセージを利用者に返さない（app/api/_lib/post-input.ts errorResponse）
		return errorResponse("[GET /api/posts/[id]/replies]", e);
	}
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
			content: rawContent,
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
			// dotW/dotH/animFrames/animFps は parseCreateDotMeta(body) で読む
			walkPreset,
			originType,
			sessionId,
		} = body;

		// 不可視・bidi・制御文字は保存前に除去する（unj のスレにそのまま出るレスなので。post-input.ts）。
		// 「本文が空か」の判定も除去後の値で行う。以降の検証・保存はすべてこの値を使うこと。
		const content = sanitizeContentText(rawContent);

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
		// ドット絵メタは PATCH と同じ範囲に収める（列は SMALLINT。NaN・文字列は 400、範囲外の数値は丸める／捨てる）
		const dotMeta = parseCreateDotMeta(body);
		if (dotMeta === "invalid") {
			return NextResponse.json({ error: "Invalid dotMeta" }, { status: 400 });
		}
		// 権利表記は選択肢の値だけ（任意の文字列を共有の行に置かせない）
		if (!isAcceptableOriginType(originType)) {
			return NextResponse.json({ error: "Invalid originType" }, { status: 400 });
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

		// 多層不正検知（Turnstile + 指紋 + TLS、lib/security/post-guard.ts）。
		// ボットのためにユーザーを作らないよう、セッションユーザーの自動作成より前に掛ける。
		const guardResponse = await guardNewPost(request, body, "reply");
		if (guardResponse) return guardResponse;

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
			...dotMeta,
			walkPreset: sanitizeWalkPreset(walkPreset),
			...mmlRef,
			...parseImageDeleteRef(body, imageSrc),
			originType: originType ?? undefined,
		});
		if (!reply) {
			return NextResponse.json({ error: "Post not found" }, { status: 404 });
		}

		await attachEmbedInfo(reply);
		const encoded = encodePost(reply);

		// スレッド購読者（詳細画面・実況コメント）とフィードの返信タブへ push する。
		// ライブ配信中の 2〜3秒ポーリングを置き換えるのがここ。
		// 鍵アカのレスは配信しない（購読者を選べないので全員に届いてしまう）。
		if (!reply.authorIsPrivate) {
			publishRealtime([
				{ channel: chThread(id), event: "reply.created", data: encoded },
				{ channel: CH_FEED, event: "reply.created", data: encoded },
			]);
		}

		// セッション Cookie はサーバーから書かない（クライアントの lib/session.ts が自分で書く）。
		// 以前は本文の sessionId をそのまま Set-Cookie していたので、他人に攻撃者の sessionId で
		// 返信させるだけでその人のブラウザを攻撃者のセッションに固定できた（R1）。
		return NextResponse.json(encoded, { status: 201 });
	} catch (e) {
		// スレ満杯・バルス・投稿種別（db.addReply）、セッション無し・登録枠
		// （resolveOrCreateSessionUser）は expose 付きで、その文言と status をそのまま返す
		return errorResponse("[POST /api/posts/[id]/replies]", e);
	}
}
