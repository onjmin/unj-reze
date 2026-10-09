import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getClientIp, rateLimitKeyFromIp } from "@/lib/ip";
import { decodeId } from "@/lib/sqids";

export async function POST(request: NextRequest) {
	const { gameId: gameIdRaw } = await request.json();
	const gameId = decodeId(gameIdRaw);
	if (gameId === null) {
		return NextResponse.json({ error: "Invalid gameId" }, { status: 400 });
	}
	// 1時間1票の単位は IP。IPv6 は /64 に丸める（生のアドレスだと末尾を変えるだけで何票でも入れられる）。
	// games/live の myVote も同じキーで引くので、ここを変えるときは揃えること。
	// 切り替えた時間帯だけは、生の IPv6 で入れた票と別扱いになり1票多く入れられる（許容）。
	const voterKey = rateLimitKeyFromIp(getClientIp(request.headers));
	await db.voteGame(gameId, voterKey);
	return NextResponse.json({ ok: true });
}
