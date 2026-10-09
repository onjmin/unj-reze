import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getClientIp, rateLimitKeyFromIp } from "@/lib/ip";
import {
	getRateLimitEnv,
	isFirstWithinWindow,
} from "@/lib/security/rate-limit";
import { decodeId } from "@/lib/sqids";

/** 同じIPからの連打で再生数が水増しされないようにする猶予（秒）。games/[id]/play と同じ。
 * KV で判定するとき用（本番は DEDUPE_LIMITER の 60 秒窓。lib/security/rate-limit.ts isFirstWithinWindow） */
const PLAY_DEDUPE_SEC = 120;

/** MVの再生数を1加算する。フィードで実際に再生されたときにだけ叩く。 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	// IPv6 は /64 に丸める（末尾を変えるだけで何度でも数え直せないように）
	const ipKey = rateLimitKeyFromIp(getClientIp(request.headers));
	const first = await isFirstWithinWindow(
		await getRateLimitEnv(),
		`play:mv:${decodedId}:${ipKey}`,
		PLAY_DEDUPE_SEC,
	);
	if (!first) return NextResponse.json({ ok: true, counted: false });
	await db.recordMvPlay(decodedId);
	return NextResponse.json({ ok: true });
}
