import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/ip";
import { decodeId } from "@/lib/sqids";

export async function POST(request: NextRequest) {
	const { gameId: gameIdRaw } = await request.json();
	const gameId = decodeId(gameIdRaw);
	if (gameId === null) {
		return NextResponse.json({ error: "Invalid gameId" }, { status: 400 });
	}
	const ip = getClientIp(request.headers);
	await db.voteGame(gameId, ip);
	return NextResponse.json({ ok: true });
}
