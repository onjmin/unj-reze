import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import type { DotMetaEdit } from "@/lib/db/interface";
import { parseMmlRef } from "@/lib/manifest-ref";
import { attachEmbedInfo } from "@/lib/post-embeds";
import { decodeId, encodePost } from "@/lib/sqids";
import type { OriginType } from "@/lib/types";
import { tryHeart, tryVote } from "@/lib/vote-guard";
import { isValidWalkPreset } from "@/lib/walk-cycle";

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
	const userId = url.searchParams.get("userId") || undefined;
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
			result = await db.repostPost(decodedId);
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
	const { count = 1, sessionId } = body;

	// ハートもセッション本人から。未認証の場合は空文字で続行（後方互換）。
	// slug を使う理由は上の PUT ハンドラと同じ（displayName は改名で変わる）。
	const user = await resolveSessionUser(request, sessionId);
	const actorId = user?.slug ?? "";

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
	);
	if (!result) {
		return NextResponse.json(
			{ error: "Post not found or not owned" },
			{ status: 404 },
		);
	}
	await attachEmbedInfo(result);
	return NextResponse.json(encodePost(result));
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
	const ok = await db.deletePost(decodedId, user.slug);
	if (!ok) {
		return NextResponse.json(
			{ error: "Post not found or not owned" },
			{ status: 404 },
		);
	}
	return NextResponse.json({ success: true });
}
