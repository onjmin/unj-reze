import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { parseBgRef, parseManifestRef } from "@/lib/manifest-ref";
import { encodeTalk } from "@/lib/sqids";

/**
 * かけあい動画（talk）の作成。app/api/mvs/route.ts と同じ形。
 * manifest 本体はブラウザが uploader-worker へ直接上げ済みで、ここには URL だけが届く。
 * 構造の検証は (1) uploader の JSON 検証、(2) TalkMaker の保存前チェック、
 * (3) TalkPlayer が壊れた manifest を握り潰す、の三段で守る。ここで守るのは保存先だけ。
 */
export async function POST(request: NextRequest) {
	const body = await request.json();
	const { title, sessionId } = body as { title?: string; sessionId?: string };

	if (!title) {
		return NextResponse.json({ error: "title is required" }, { status: 400 });
	}

	const manifestRef = parseManifestRef(body, "talk");
	if (!manifestRef) {
		return NextResponse.json(
			{ error: "valid manifestUrl is required" },
			{ status: 400 },
		);
	}

	// creatorSlug はセッション本人の slug を使う。body の creatorSlug は公開情報なので信用できない。
	const user = await resolveSessionUser(request, sessionId);
	const creatorSlug = user?.slug;

	const talk = await db.createTalk({
		title,
		...manifestRef,
		bgUrl: parseBgRef(body.bgUrl),
		creatorSlug,
	});
	return NextResponse.json(encodeTalk(talk), { status: 201 });
}
