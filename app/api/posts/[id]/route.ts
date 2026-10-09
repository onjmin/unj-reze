import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser, resolveViewerId } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import type { DotMetaEdit } from "@/lib/db/interface";
import { parseImageDeleteRef, parseMmlRef } from "@/lib/assets/manifest-ref";
import { attachEmbedInfo } from "@/lib/post/post-embeds";
import { CH_FEED, chThread } from "@/lib/realtime/channels";
import { publishRealtime } from "@/lib/realtime/publish";
import { decodeId, encodeId, encodePost } from "@/lib/sqids";
import type { OriginType } from "@/lib/types";
import { tryHeart, tryVote } from "@/lib/security/vote-guard";
import { isValidWalkPreset } from "@/lib/assets/walk-cycle";
import { contentError, isAcceptableEditedImageSrc } from "../../_lib/post-input";

/**
 * ハート1回の送信で足せる上限。クライアント（lib/hooks/usePostActions.ts handleHeart）は
 * 連打を2秒まとめて count で送るので、人の指で届く範囲に収める。以前は count を
 * そのまま足していたので、1リクエストで hearts_total を任意の値にできた。
 */
const MAX_HEARTS_PER_REQUEST = 50;

/**
 * ドット絵素材メタの後付け編集。投稿済みの任意の画像URLに dotW/dotH/animFrames/animFps/
 * walkPreset を（再）設定でき、これを設定した画像はSpriteImageのアニメ/歩行グラ再生対象に
 * なる＝一般の画像投稿を後からドット絵素材化する導線。キー省略＝既存値を保つ、
 * 値がnull＝その列だけクリア、として渡ってくる。不正な値は 400 で弾く（黙って捨てない
 * ＝ユーザーが明示的に設定しようとした値が消えたように見える事故を防ぐ）。
 */
function parseDotMeta(raw: unknown): DotMetaEdit | undefined | "invalid" {
	if (raw === undefined) return undefined;
	if (raw === null || typeof raw !== "object") return "invalid";
	const r = raw as Record<string, unknown>;
	const out: DotMetaEdit = {};

	const posInt = (v: unknown, max: number): number | null | "invalid" => {
		if (v === null) return null;
		if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > max)
			return "invalid";
		return v;
	};

	if ("dotW" in r) {
		const v = posInt(r.dotW, 512);
		if (v === "invalid") return "invalid";
		out.dotW = v;
	}
	if ("dotH" in r) {
		const v = posInt(r.dotH, 512);
		if (v === "invalid") return "invalid";
		out.dotH = v;
	}
	if ("animFrames" in r) {
		const v = posInt(r.animFrames, 200);
		if (v === "invalid") return "invalid";
		out.animFrames = v;
	}
	if ("animFps" in r) {
		const v = posInt(r.animFps, 60);
		if (v === "invalid") return "invalid";
		out.animFps = v;
	}
	if ("walkPreset" in r) {
		if (r.walkPreset === null) out.walkPreset = null;
		else if (isValidWalkPreset(r.walkPreset)) out.walkPreset = r.walkPreset;
		else return "invalid";
	}
	return out;
}

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	const url = new URL(_request.url);
	// 「誰として見るか」はセッションで裏取りする（lib/auth/session-server.ts resolveViewerId）。
	// クエリを信じると他人の id でその人のブロック/ミュート一覧や投票状態が覗ける。
	const userId = await resolveViewerId(
		_request,
		url.searchParams.get("userId"),
	);
	const post = await db.getPost(decodedId, userId);
	if (!post) {
		return NextResponse.json({ error: "Post not found" }, { status: 404 });
	}
	await attachEmbedInfo(post);
	return NextResponse.json(encodePost(post));
}

export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	const body = await request.json();
	const { action, sessionId } = body;

	// 投票者は必ずセッション本人。body の userId を信じると
	// 公開情報である slug / displayName で他人になりすまして投票できてしまう。
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	// displayName はいつでも変更できるので投票の同一性キーには使わない。
	// slug は作成時に決まって以後変わらない（lib/db/pg.ts の updateUserDisplayName 参照）ので、
	// 改名後も同一ユーザーとして重複投票判定・通知解決ができる。
	const actorId = user.slug;

	let result;

	switch (action) {
		case "like":
		case "dislike":
			// 重複投票の判定はインメモリ（unj の like.ts と同じ方式）。
			// DBに投票行を持たないので、再投票済みなら現状の投稿をそのまま返す。
			if (!tryVote(actorId, decodedId, action)) {
				const current = await db.getPost(decodedId, actorId);
				if (!current)
					return NextResponse.json(
						{ error: "Post not found" },
						{ status: 404 },
					);
				await attachEmbedInfo(current);
				return NextResponse.json(encodePost(current));
			}
			result =
				action === "like"
					? await db.likePost(decodedId, actorId)
					: await db.dislikePost(decodedId, actorId);
			break;
		case "repost":
			result = await db.repostPost(decodedId, actorId);
			break;
		default:
			return NextResponse.json(
				{ error: "action must be like, dislike, or repost" },
				{ status: 400 },
			);
	}

	if (!result) {
		return NextResponse.json({ error: "Post not found" }, { status: 404 });
	}

	await attachEmbedInfo(result);
	return NextResponse.json(encodePost(result));
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
	const { count: rawCount = 1, sessionId } = body;

	// ハートもセッション本人から。身元が無いと tryHeart の「1投稿1回」が効かない
	// （空の actorId は素通しになる）ので、未認証は受け付けない。
	// slug を使う理由は上の PUT ハンドラと同じ（displayName は改名で変わる）。
	const user = await resolveSessionUser(request, sessionId);
	if (!user?.slug) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	const actorId = user.slug;
	// 1..MAX_HEARTS_PER_REQUEST の整数に丸める（負数・小数・巨大値で hearts_total を壊させない）
	const count = Math.min(
		MAX_HEARTS_PER_REQUEST,
		Math.max(1, Math.floor(Number(rawCount) || 1)),
	);

	// ハートも1投稿1回まで（インメモリ判定）
	if (!tryHeart(actorId, decodedId)) {
		const current = await db.getPost(decodedId, actorId);
		if (!current)
			return NextResponse.json({ error: "Post not found" }, { status: 404 });
		await attachEmbedInfo(current);
		return NextResponse.json(encodePost(current));
	}

	const result = await db.heartPost(decodedId, actorId, count);
	if (!result) {
		return NextResponse.json({ error: "Post not found" }, { status: 404 });
	}
	await attachEmbedInfo(result);
	return NextResponse.json(encodePost(result));
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
	const body = (await request.json()) as {
		content?: string;
		originType?: OriginType | null;
		imageSrc?: string;
		sessionId?: string;
		dotMeta?: unknown;
	};
	const { content, originType, imageSrc, sessionId, dotMeta: rawDotMeta } = body;
	// 所有者判定に使う身元は必ずセッションから取る。body の userId を信じると
	// display_name / slug はどちらも公開情報なので、他人の投稿を編集できてしまう。
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	if (typeof content !== "string") {
		return NextResponse.json({ error: "content is required" }, { status: 400 });
	}
	// 本文の長さと画像URLの検証は新規投稿と同じ（app/api/_lib/post-input.ts）。
	// 画像は「本文中のURLを添付に昇格」導線があるので https の外部URLも通す。
	const badContent = contentError(content);
	if (badContent) {
		return NextResponse.json({ error: badContent }, { status: 400 });
	}
	if (!isAcceptableEditedImageSrc(imageSrc)) {
		return NextResponse.json({ error: "Invalid imageSrc" }, { status: 400 });
	}
	const dotMeta = parseDotMeta(rawDotMeta);
	if (dotMeta === "invalid") {
		return NextResponse.json({ error: "Invalid dotMeta" }, { status: 400 });
	}
	// 編集でMMLを差し替えたときは新しいURLが来る。未指定なら既存のMMLを触らない
	const mmlRef = parseMmlRef(body);
	if (mmlRef === null) {
		return NextResponse.json({ error: "Invalid mmlUrl" }, { status: 400 });
	}
	const result = await db.editPost(
		decodedId,
		user.slug,
		content,
		originType,
		imageSrc,
		mmlRef,
		dotMeta,
		parseImageDeleteRef(body, imageSrc),
	);
	if (!result) {
		return NextResponse.json(
			{ error: "Post not found or not owned" },
			{ status: 404 },
		);
	}
	await attachEmbedInfo(result);
	const encoded = encodePost(result);
	// 他クライアントのタイムライン/スレ表示にも編集内容を反映させる。いいね等の
	// 個人差分フィールドは result.liked/disliked/reposted が「編集した本人（作者）視点」の
	// 値なので載せない（クライアント側は content 系だけ拾って上書きする設計、
	// app/page.tsx の post.updated ハンドラ参照）。
	//
	// 配信ペイロードは encoded の**そのまま**ではなく、下の2点を落としたものを使う:
	// - previousMml … R2の削除トークン。encodePost の stripDeleteTokens は
	//   mmlDeleteId/mmlDeleteHash しか剥がさず、editPost が result に後付けする
	//   previousMml はすり抜ける。作者へのレスポンスに載せるのは意図通りだが、
	//   フィード購読者全員へ配ると「見た人全員が他人のMMLを消せる」ことになる
	//   （lib/sqids.ts stripDeleteTokens のコメント参照）。
	// - replies … スレ本体の編集では getPost がスレ配下の全レスを詰めて返す。
	//   クライアントは content 系しか使わないのに、返信1000件のスレを編集するたび
	//   その全文を全接続へブロードキャストすることになる（docs/NEON_EGRESS.md）。
	const {
		previousMml: _omitPreviousMml,
		previousImage: _omitPreviousImage,
		replies: _omitReplies,
		...broadcast
	} = encoded as typeof encoded & {
		previousMml?: { deleteId: string; deleteHash: string };
		previousImage?: { deleteId: string; deleteHash: string };
	};
	// 鍵アカの投稿は編集内容も配信しない（新規投稿の post.created と同じ扱い）
	if (!result.authorIsPrivate) {
		publishRealtime([
			{ channel: CH_FEED, event: "post.updated", data: broadcast },
			{
				channel: chThread(encoded.threadId),
				event: "post.updated",
				data: broadcast,
			},
		]);
	}
	// 旧MMLの削除トークンをDB更新確定後だけレスポンスに載せる。作者判定は上で
	// 通過済み。クライアントはこれを見てR2の旧オブジェクトを消す
	// （lib/post/game-mv-client.ts の previousManifest と同じ仕組み、詳細は lib/uploader.ts）。
	// 差し替えで外れた旧画像（previousImage）も同じ扱い。
	const { previousMml, previousImage } = result as typeof result & {
		previousMml?: { deleteId: string; deleteHash: string };
		previousImage?: { deleteId: string; deleteHash: string };
	};
	return NextResponse.json({ ...encoded, previousMml, previousImage });
}

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	const { sessionId } = await request.json().catch(() => ({}));
	// 削除も同様にセッション本人のみ。body/クエリの userId は受け付けない。
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	const result = await db.deletePost(decodedId, user.slug);
	if (!result) {
		return NextResponse.json(
			{ error: "Post not found or not owned" },
			{ status: 404 },
		);
	}
	// 配信IDはURLの `id` ではなく decodedId を正規化し直したものを使う。decodeId は
	// 旧sqids形式のURLも受け付けるので、`id` をそのまま流すとクライアント側の
	// post.id（= encodeId 済みの生の数値文字列）と一致せず、配信が黙って無視される。
	const encodedId = encodeId(decodedId);
	// threadId は deletePost が返す（レスは物理削除・スレは論理削除で、どちらも
	// 削除後には引けないため）。ここで getPost を撃つとスレ配下の全レスを読むことになり、
	// しかも所有者チェック前なので他人のスレへのDELETE試行だけで無駄な全件読み出しを
	// 誘発できてしまう（docs/NEON_EGRESS.md）。
	const threadId =
		result.threadId != null ? encodeId(result.threadId) : undefined;
	// 他クライアントのタイムライン/スレ表示から消す。CH_FEED はスレッド一覧・返信タブ、
	// chThread はスレ詳細（将来ワイヤリングする際の受け皿も兼ねる）向け。
	publishRealtime([
		{
			channel: CH_FEED,
			event: "post.deleted",
			data: { id: encodedId, threadId },
		},
		...(threadId
			? [
					{
						channel: chThread(threadId),
						event: "post.deleted" as const,
						data: { id: encodedId, threadId },
					},
				]
			: []),
	]);
	// 削除確定後だけMML/ゲーム・MV・かけあい動画・音MAD manifestの削除トークンを載せる。クライアント
	// （lib/api.ts posts.remove）がこれを見てR2の実体を消す
	// （editPostのpreviousMmlと同じ仕組み）。ゲーム/MVは他の投稿からまだ参照されて
	// いれば db.deletePost 側で削除自体をスキップしているので、この時点で無ければ
	// 「消さなかった」という意味になる。
	return NextResponse.json({
		success: true,
		previousMml: result.mmlDeleteId
			? { deleteId: result.mmlDeleteId, deleteHash: result.mmlDeleteHash }
			: undefined,
		previousImage: result.imageDeleteId
			? { deleteId: result.imageDeleteId, deleteHash: result.imageDeleteHash }
			: undefined,
		previousGameManifest: result.gameManifestDeleteId
			? {
					deleteId: result.gameManifestDeleteId,
					deleteHash: result.gameManifestDeleteHash,
				}
			: undefined,
		previousMvManifest: result.mvManifestDeleteId
			? {
					deleteId: result.mvManifestDeleteId,
					deleteHash: result.mvManifestDeleteHash,
				}
			: undefined,
		previousTalkManifest: result.talkManifestDeleteId
			? {
					deleteId: result.talkManifestDeleteId,
					deleteHash: result.talkManifestDeleteHash,
				}
			: undefined,
		previousOtomadManifest: result.otomadManifestDeleteId
			? {
					deleteId: result.otomadManifestDeleteId,
					deleteHash: result.otomadManifestDeleteHash,
				}
			: undefined,
	});
}
