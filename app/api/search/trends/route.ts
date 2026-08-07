import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";

// トレンドは全投稿を舐める regexp_matches 集計で、内容は誰に対しても同じ。
// エッジで長めに持たせて Neon への到達を減らす。
export async function GET(request: NextRequest) {
	return await withEdgeCache(
		request,
		{ sMaxAge: 300, maxAge: 60, personalized: false },
		async () => NextResponse.json(await db.getTrends()),
	);
}
