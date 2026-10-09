import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getClientIp, rateLimitKeyFromIp } from "@/lib/ip";
import { encodeId } from "@/lib/sqids";

export async function GET(request: NextRequest) {
	// myVote は games/vote が票を入れたのと同じキー（IPv6 は /64）で引く。違うキーだと自分の票が見えない。
	const voterKey = rateLimitKeyFromIp(getClientIp(request.headers));
	const info = await db.getLiveGameInfo(voterKey);
	// manifest 本体はもうDBに無い。URLだけ返し、実体はクライアントがR2から直接引く
	const manifestUrl = info.gameId
		? ((await db.getGame(info.gameId))?.manifestUrl ?? null)
		: null;

	const encodedInfo = {
		...info,
		gameId: info.gameId ? encodeId(info.gameId) : null,
		postId: info.postId ? encodeId(info.postId) : null,
		nextCandidates: info.nextCandidates.map((c) => ({
			...c,
			game: {
				...c.game,
				id: encodeId(c.game.id),
			},
		})),
		manifestUrl,
	};

	return NextResponse.json(encodedInfo);
}
