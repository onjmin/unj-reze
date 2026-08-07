import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { parseBgRef, parseManifestRef } from "@/lib/manifest-ref";
import { encodeGame } from "@/lib/sqids";

export async function GET(request: NextRequest) {
	const url = new URL(request.url);
	const limitParam = url.searchParams.get("limit");
	const limit = limitParam
		? Math.min(Math.max(1, parseInt(limitParam, 10) || 30), 50)
		: 30;
	const games = await db.listAllGames(limit);
	return NextResponse.json(games.map(encodeGame));
}

export async function POST(request: NextRequest) {
	const body = await request.json();
	const { preset, title, sessionId } = body;

	if (!preset || !title) {
		return NextResponse.json(
			{ error: "preset and title are required" },
			{ status: 400 },
		);
	}

	// manifest 本体はブラウザが uploader-worker へ直接上げ済み。ここに来るのはURLだけ。
	// 公開ボディ由来なので保存先ホストを必ず検証する（任意の外部URLを登録させない）。
	const manifestRef = parseManifestRef(body, "game");
	if (!manifestRef) {
		return NextResponse.json(
			{ error: "valid manifestUrl is required" },
			{ status: 400 },
		);
	}

	// creatorSlug はセッション本人の slug を使う。body の creatorSlug は公開情報なので信用できない。
	const user = await resolveSessionUser(request, sessionId);
	const creatorSlug = user?.slug;

	const game = await db.createGame({
		preset,
		title,
		...manifestRef,
		bgRef: parseBgRef(body.bgRef),
		creatorSlug,
	});
	return NextResponse.json(encodeGame(game), { status: 201 });
}
