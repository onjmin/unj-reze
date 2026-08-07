import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";
import { parseBgRef, parseManifestRef } from "@/lib/manifest-ref";
import type { MvManifest } from "@/lib/mv-config";
import { decodeId, encodeMv } from "@/lib/sqids";

function isMvManifest(m: unknown): m is MvManifest {
	if (!m || typeof m !== "object") return false;
	const v = m as Partial<MvManifest>;
	return (
		typeof v.mml === "string" &&
		!!v.stage &&
		Array.isArray(v.layers) &&
		Array.isArray(v.sections)
	);
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	// MVの中身は再編集されるまで変わらないので、エッジで長めに持たせてよい。
	// 誰が見ても同じ内容（パーソナライズなし）。
	return await withEdgeCache(
		request,
		{ sMaxAge: 300, personalized: false },
		async () => {
			const mv = await db.getMv(decodedId);
			if (!mv)
				return NextResponse.json({ error: "not found" }, { status: 404 });
			return NextResponse.json(encodeMv(mv));
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
	const { title, manifest, sessionId } = body as {
		title?: string;
		manifest?: unknown;
		sessionId?: string;
	};
	if (!title) {
		return NextResponse.json({ error: "title is required" }, { status: 400 });
	}

	// 編集は毎回R2の新しいキーへ上げ直したうえで、そのURLが送られてくる。
	// 同じキーへの上書きは不可（immutable で配っているので古い内容が残り続ける）。
	const manifestRef = parseManifestRef(body, "mv");
	if (!manifestRef) {
		return NextResponse.json(
			{ error: "valid manifestUrl is required" },
			{ status: 400 },
		);
	}

	// 作者判定はセッション本人の slug で行う。body の userSlug を信じると
	// slug は公開情報なので、誰でも他人のMVを上書きできてしまう。
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	const mv = await db.getMv(decodedId);
	if (!mv) return NextResponse.json({ error: "not found" }, { status: 404 });
	if (!mv.creatorSlug || mv.creatorSlug !== user.slug) {
		return NextResponse.json(
			{ error: "Only the creator can edit this MV" },
			{ status: 403 },
		);
	}

	const updated = await db.updateMv(decodedId, {
		title,
		...manifestRef,
		bgUrl: parseBgRef(body.bgUrl),
	});
	if (!updated)
		return NextResponse.json({ error: "not found" }, { status: 404 });

	// 旧オブジェクトの削除トークンを返す。DB更新が成功したあとにクライアントが消す
	return NextResponse.json({
		...encodeMv(updated),
		previousManifest: mv.manifestDeleteId
			? { deleteId: mv.manifestDeleteId, deleteHash: mv.manifestDeleteHash }
			: undefined,
	});
}
