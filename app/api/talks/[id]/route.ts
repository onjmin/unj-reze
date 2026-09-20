import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";
import { parseBgRef, parseManifestRef } from "@/lib/manifest-ref";
import { decodeId, encodeTalk } from "@/lib/sqids";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	// 中身は再編集されるまで変わらないので、エッジで長めに持たせてよい（誰が見ても同じ）。
	return await withEdgeCache(
		request,
		{ sMaxAge: 300, personalized: false },
		async () => {
			const talk = await db.getTalk(decodedId);
			if (!talk)
				return NextResponse.json({ error: "not found" }, { status: 404 });
			return NextResponse.json(encodeTalk(talk));
		},
	);
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
	const { title, sessionId } = body as { title?: string; sessionId?: string };
	if (!title) {
		return NextResponse.json({ error: "title is required" }, { status: 400 });
	}

	// 編集は毎回R2の新しいキーへ上げ直したうえで、そのURLが送られてくる（immutable 配信のため）。
	const manifestRef = parseManifestRef(body, "talk");
	if (!manifestRef) {
		return NextResponse.json(
			{ error: "valid manifestUrl is required" },
			{ status: 400 },
		);
	}

	// 作者判定はセッション本人の slug で行う（body の slug は公開情報）。
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	const talk = await db.getTalk(decodedId);
	if (!talk)
		return NextResponse.json({ error: "not found" }, { status: 404 });
	if (!talk.creatorSlug || talk.creatorSlug !== user.slug) {
		return NextResponse.json(
			{ error: "Only the creator can edit this talk" },
			{ status: 403 },
		);
	}

	const updated = await db.updateTalk(decodedId, {
		title,
		...manifestRef,
		bgUrl: parseBgRef(body.bgUrl),
	});
	if (!updated)
		return NextResponse.json({ error: "not found" }, { status: 404 });

	// 旧オブジェクトの削除トークンを返す。DB更新が成功したあとにクライアントが消す
	return NextResponse.json({
		...encodeTalk(updated),
		previousManifest: talk.manifestDeleteId
			? { deleteId: talk.manifestDeleteId, deleteHash: talk.manifestDeleteHash }
			: undefined,
	});
}
