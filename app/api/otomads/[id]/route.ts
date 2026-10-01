import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";
import { parseBgRef, parseManifestRef } from "@/lib/assets/manifest-ref";
import { decodeId, encodeOtomad } from "@/lib/sqids";

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
			const otomad = await db.getOtomad(decodedId);
			if (!otomad)
				return NextResponse.json({ error: "not found" }, { status: 404 });
			return NextResponse.json(encodeOtomad(otomad));
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
	const manifestRef = parseManifestRef(body, "otomad");
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

	const otomad = await db.getOtomad(decodedId);
	if (!otomad)
		return NextResponse.json({ error: "not found" }, { status: 404 });
	if (!otomad.creatorSlug || otomad.creatorSlug !== user.slug) {
		return NextResponse.json(
			{ error: "Only the creator can edit this otomad" },
			{ status: 403 },
		);
	}

	const updated = await db.updateOtomad(decodedId, {
		title,
		...manifestRef,
		bgUrl: parseBgRef(body.bgUrl),
	});
	if (!updated)
		return NextResponse.json({ error: "not found" }, { status: 404 });

	// 旧オブジェクトの削除トークンを返す。DB更新が成功したあとにクライアントが消す
	return NextResponse.json({
		...encodeOtomad(updated),
		previousManifest: otomad.manifestDeleteId
			? { deleteId: otomad.manifestDeleteId, deleteHash: otomad.manifestDeleteHash }
			: undefined,
	});
}
