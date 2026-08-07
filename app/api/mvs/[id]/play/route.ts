import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decodeId } from "@/lib/sqids";

/** MVの再生数を1加算する。フィードで実際に再生されたときにだけ叩く。 */
export async function POST(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	await db.recordMvPlay(decodedId);
	return NextResponse.json({ ok: true });
}
