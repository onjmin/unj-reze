import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";
import { getClientIp } from "@/lib/ip";
import { parseMmlRef } from "@/lib/manifest-ref";
import { attachEmbedInfo } from "@/lib/post-embeds";
import { CH_FEED } from "@/lib/realtime/channels";
import { publishRealtime } from "@/lib/realtime/publish";
import { scoreRequest } from "@/lib/security/scoring";
import { readTlsSignalsFromHeaders } from "@/lib/security/tls";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import type { FingerprintSignals } from "@/lib/security/types";
import { decodeId, encodePost } from "@/lib/sqids";
import type { OriginType } from "@/lib/types";

export async function GET(request: NextRequest) {
	try {
		const url = new URL(request.url);
		const userId = url.searchParams.get("userId") || undefined;
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

		return await withEdgeCache(
			request,
			// 過去ページ（カーソル付き）は内容がほぼ変わらないので長めに持たせる。
			{ sMaxAge: beforeId ? 60 : 10, personalized: !!userId },
			async () => {
				const posts = await db.getPosts(userId, {
					limit,
					beforeId,
					hasMml,
					hasImage,
					hasGame,
					hasMv,
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
			avatarColor,
			gameId,
			mvId,
			dotW,
			dotH,
			originType,
			turnstileToken,
			fingerprint,
			sessionId: bodySessionId,
		}: {
			displayName: string;
			content: string;
			hasImage?: boolean;
			imageSrc?: string;
			imageAlt?: string;
			avatarColor?: string;
			gameId?: string;
			mvId?: string;
			dotW?: number;
			dotH?: number;
			originType?: OriginType;
			turnstileToken?: string | null;
			fingerprint?: FingerprintSignals | null;
			sessionId?: string;
		} = body;

		if (!bodyDisplayName || (!content && !hasImage)) {
			return NextResponse.json(
				{ error: "displayName and content are required" },
				{ status: 400 },
			);
		}

		// セッションが確認できた場合はセッション本人の identity を使う。
		// 投稿はログイン不要なので、セッション不明の場合は body の displayName にフォールバックする。
		const sessionUser = await resolveSessionUser(request, bodySessionId);
		const displayName = sessionUser?.displayName ?? bodyDisplayName;
		const authorSlug = sessionUser?.slug ?? undefined;

		// 参考実装: 多層不正検知（Turnstile + 指紋 + IP/セッション相関）。
		// fingerprint がクライアントから送られてきた場合のみ評価する後方互換設計 —
		// 未対応クライアント（既存の PostComposer 等）はそのまま通過する。
		if (fingerprint) {
			const ip = getClientIp(request.headers);
			const sessionId = request.cookies.get("unj_reze_session")?.value || null;
			const userAgent = request.headers.get("user-agent") || "";
			const tls = readTlsSignalsFromHeaders(request.headers);

			const turnstileResult = await verifyTurnstileToken(
				turnstileToken ?? null,
				ip,
			);
			const assessment = await scoreRequest({
				fingerprint,
				ip,
				sessionId,
				userAgent,
				tls,
				turnstileOk: turnstileResult.success,
				turnstileUnreachable: turnstileResult.unreachable,
			});

			if (assessment.blocked) {
				return NextResponse.json(
					{ error: "forbidden", reasons: assessment.reasons },
					{ status: 403 },
				);
			}
			if (assessment.rateLimited) {
				return NextResponse.json(
					{ error: "too many requests", reasons: assessment.reasons },
					{ status: 429, headers: { "Retry-After": "10" } },
				);
			}
		}

		const decodedGameId = gameId ? decodeId(gameId) : undefined;
		if (gameId && decodedGameId === null) {
			return NextResponse.json({ error: "Invalid gameId" }, { status: 400 });
		}
		const decodedMvId = mvId ? decodeId(mvId) : undefined;
		if (mvId && decodedMvId === null) {
			return NextResponse.json({ error: "Invalid mvId" }, { status: 400 });
		}

		// MML本文はブラウザが uploader-worker へ直接上げ済み。ここに来るのはURLだけ。
		// 公開ボディ由来なので保存先ホストを必ず検証する
		const mmlRef = parseMmlRef(body);
		if (mmlRef === null) {
			return NextResponse.json({ error: "Invalid mmlUrl" }, { status: 400 });
		}

		const post = await db.createPost({
			displayName,
			content,
			hasImage,
			imageSrc,
			imageAlt,
			avatarColor,
			slug: authorSlug,
			gameId: decodedGameId === null ? undefined : decodedGameId,
			mvId: decodedMvId === null ? undefined : decodedMvId,
			dotW: dotW ? Number(dotW) : undefined,
			dotH: dotH ? Number(dotH) : undefined,
			...mmlRef,
			originType,
		});
		await attachEmbedInfo(post);
		const encoded = encodePost(post);

		// フィード購読者へ push する。これがあるおかげでクライアントは
		// 「新着があるか」を確かめるためだけの定期ポーリングをしなくて済む。
		publishRealtime({ channel: CH_FEED, event: "post.created", data: encoded });

		return NextResponse.json(encoded, { status: 201 });
	} catch (e) {
		console.error("[POST /api/posts]", e);
		const message = e instanceof Error ? e.message : String(e);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
