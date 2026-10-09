import { NextRequest, NextResponse } from "next/server";
import { resolveOrCreateSessionUser, resolveViewerId } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";
import { parseImageDeleteRef, parseMmlRef } from "@/lib/assets/manifest-ref";
import { attachEmbedInfo } from "@/lib/post/post-embeds";
import { CH_FEED } from "@/lib/realtime/channels";
import { publishRealtime } from "@/lib/realtime/publish";
import { guardNewPost } from "@/lib/security/post-guard";
import { decodeId, encodePost } from "@/lib/sqids";
import type { OriginType } from "@/lib/types";
import { sanitizeWalkPreset } from "@/lib/assets/walk-cycle";
import {
	contentError,
	isAcceptableNewImageSrc,
	sanitizeAvatarColor,
} from "../_lib/post-input";
import { workOwnershipError } from "../_lib/work-owner";

export async function GET(request: NextRequest) {
	try {
		const url = new URL(request.url);
		const claimedUserId = url.searchParams.get("userId");
		// 「誰として見るか」はセッションで裏取りする（lib/auth/session-server.ts resolveViewerId）。
		// クエリを信じると他人の id でその人のブロック/ミュート一覧や投票状態が覗ける。
		const userId = await resolveViewerId(request, claimedUserId);
		const limitParam = url.searchParams.get("limit");
		const limit = limitParam
			? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50)
			: 20;

		// キーセットページングのカーソル。クライアントは sqids でエンコードされたIDを持っているのでデコードする。
		const beforeIdParam = url.searchParams.get("beforeId");
		let beforeId: number | undefined;
		if (beforeIdParam) {
			const decoded = decodeId(beforeIdParam);
			if (decoded === null) {
				return NextResponse.json(
					{ error: "Invalid beforeId" },
					{ status: 400 },
				);
			}
			beforeId = decoded;
		}
		const hasMmlParam = url.searchParams.get("hasMml");
		const hasMml = hasMmlParam !== null ? hasMmlParam === "true" : undefined;
		const hasImageParam = url.searchParams.get("hasImage");
		const hasImage =
			hasImageParam !== null ? hasImageParam === "true" : undefined;
		const hasGameParam = url.searchParams.get("hasGame");
		const hasGame = hasGameParam !== null ? hasGameParam === "true" : undefined;
		const hasMvParam = url.searchParams.get("hasMv");
		const hasMv = hasMvParam !== null ? hasMvParam === "true" : undefined;
		const hasTalkParam = url.searchParams.get("hasTalk");
		const hasTalk =
			hasTalkParam !== null ? hasTalkParam === "true" : undefined;
		const hasOtomadParam = url.searchParams.get("hasOtomad");
		const hasOtomad =
			hasOtomadParam !== null ? hasOtomadParam === "true" : undefined;

		return await withEdgeCache(
			request,
			// 過去ページ（カーソル付き）は内容がほぼ変わらないので長めに持たせる。
			{ sMaxAge: beforeId ? 60 : 10, personalized: !!claimedUserId },
			async () => {
				const posts = await db.getPosts(userId, {
					limit,
					beforeId,
					hasMml,
					hasImage,
					hasGame,
					hasMv,
					hasTalk,
					hasOtomad,
				});
				await attachEmbedInfo(posts);
				return NextResponse.json(posts.map(encodePost));
			},
		);
	} catch (e) {
		console.error("[GET /api/posts]", e);
		const message = e instanceof Error ? e.message : String(e);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const {
			displayName: bodyDisplayName,
			content,
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
			sessionId: bodySessionId,
		}: {
			displayName?: string;
			content?: string;
			hasImage?: boolean;
			imageSrc?: string;
			imageAlt?: string;
			imageIsDrawn?: boolean;
			avatarColor?: string;
			gameId?: string;
			mvId?: string;
			talkId?: string;
			otomadId?: string;
			dotW?: number;
			dotH?: number;
			animFrames?: number;
			animFps?: number;
			walkPreset?: string;
			originType?: OriginType;
			sessionId?: string;
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
				{ error: "content or attachment is required" },
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

		// 多層不正検知（Turnstile + 指紋 + TLS、lib/security/post-guard.ts）。
		// ボットのためにユーザーを作らないよう、セッションユーザーの自動作成より前に掛ける。
		const guardResponse = await guardNewPost(request, body, "post");
		if (guardResponse) return guardResponse;

		// セッション本人を解決、未登録セッションなら自動作成
		const sessionUser = await resolveOrCreateSessionUser(request, bodySessionId);
		const displayName = sessionUser.displayName;
		const authorSlug = sessionUser.slug;

		const decodedGameId = gameId ? decodeId(gameId) : undefined;
		if (gameId && decodedGameId === null) {
			return NextResponse.json({ error: "Invalid gameId" }, { status: 400 });
		}
		const decodedMvId = mvId ? decodeId(mvId) : undefined;
		if (mvId && decodedMvId === null) {
			return NextResponse.json({ error: "Invalid mvId" }, { status: 400 });
		}
		const decodedTalkId = talkId ? decodeId(talkId) : undefined;
		if (talkId && decodedTalkId === null) {
			return NextResponse.json({ error: "Invalid talkId" }, { status: 400 });
		}
		const decodedOtomadId = otomadId ? decodeId(otomadId) : undefined;
		if (otomadId && decodedOtomadId === null) {
			return NextResponse.json({ error: "Invalid otomadId" }, { status: 400 });
		}

		// 添付できるのは自分の作品だけ（app/api/_lib/work-owner.ts）
		const ownershipError = await workOwnershipError(sessionUser, {
			gameId: decodedGameId ?? undefined,
			mvId: decodedMvId ?? undefined,
			talkId: decodedTalkId ?? undefined,
			otomadId: decodedOtomadId ?? undefined,
		});
		if (ownershipError) {
			return NextResponse.json({ error: ownershipError }, { status: 403 });
		}

		// MML本文はブラウザが uploader-worker へ直接上げ済み。ここに来るのはURLだけ。
		// 公開ボディ由来なので保存先ホストを必ず検証する
		const mmlRef = parseMmlRef(body);
		if (mmlRef === null) {
			return NextResponse.json({ error: "Invalid mmlUrl" }, { status: 400 });
		}

		const post = await db.createPost({
			displayName,
			content: content ?? "",
			hasImage,
			imageSrc,
			imageAlt,
			imageIsDrawn,
			avatarColor: sanitizeAvatarColor(avatarColor),
			slug: authorSlug,
			gameId: decodedGameId === null ? undefined : decodedGameId,
			mvId: decodedMvId === null ? undefined : decodedMvId,
			talkId: decodedTalkId === null ? undefined : decodedTalkId,
			otomadId: decodedOtomadId === null ? undefined : decodedOtomadId,
			dotW: dotW ? Number(dotW) : undefined,
			dotH: dotH ? Number(dotH) : undefined,
			animFrames: animFrames ? Number(animFrames) : undefined,
			animFps: animFps ? Number(animFps) : undefined,
			walkPreset: sanitizeWalkPreset(walkPreset),
			...mmlRef,
			...parseImageDeleteRef(body, imageSrc),
			originType,
		});
		await attachEmbedInfo(post);
		const encoded = encodePost(post);

		// フィード購読者へ push する。これがあるおかげでクライアントは
		// 「新着があるか」を確かめるためだけの定期ポーリングをしなくて済む。
		// 鍵アカの投稿は配信しない（購読者を選べないので全員に届いてしまう）。
		// 本人と許可された人は次の読み込み・ポーリングで見える（lib/db/pg.ts authorVisibleSql）。
		if (!post.authorIsPrivate) {
			publishRealtime({ channel: CH_FEED, event: "post.created", data: encoded });
		}

		return NextResponse.json(encoded, { status: 201 });
	} catch (e) {
		console.error("[POST /api/posts]", e);
		const message = e instanceof Error ? e.message : String(e);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
