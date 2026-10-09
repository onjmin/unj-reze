import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/ip";
import { kvExists, kvSetEx } from "@/lib/kv";
import { decodeId } from "@/lib/sqids";

/** 同じIPからの連打で再生数が水増しされないようにする猶予（秒）。games/[id]/play と同じ */
const PLAY_DEDUPE_SEC = 120;

/** かけあい動画の再生数を1加算する。フィードで実際に再生されたときにだけ叩く。 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	const key = `talksplay:${decodedId}:${getClientIp(request.headers)}`;
	try {
		if (await kvExists(key)) return NextResponse.json({ ok: true, counted: false });
		await kvSetEx(key, "1", PLAY_DEDUPE_SEC);
	} catch {
		// KVが落ちていても記録自体は続行する
	}
	await db.recordTalkPlay(decodedId);
	return NextResponse.json({ ok: true });
}
