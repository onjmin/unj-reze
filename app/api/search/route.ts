import { NextRequest, NextResponse } from "next/server";
import { resolveViewerId } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { attachEmbedInfo } from "@/lib/post/post-embeds";
import { encodePost } from "@/lib/sqids";

/** 検索語の上限（文字数）。lib/db/pg.ts searchPosts / searchMedia も同じ値で切る */
const MAX_QUERY_LENGTH = 100;

export async function GET(request: NextRequest) {
	const url = new URL(request.url);
	const q = url.searchParams.get("q");
	if (!q || !q.trim()) {
		return NextResponse.json(
			{ error: "query parameter q is required" },
			{ status: 400 },
		);
	}
	// LIKE 検索は全件走査になるので、極端に長い語は受け付けない
	if (q.length > MAX_QUERY_LENGTH) {
		return NextResponse.json({ error: "query too long" }, { status: 400 });
	}
	// 「誰として見るか」はセッションで裏取りする（lib/auth/session-server.ts resolveViewerId）。
	// クエリを信じると他人の id でその人のブロック/ミュート一覧や投票状態が覗ける。
	const userId = await resolveViewerId(request, url.searchParams.get("userId"));
	const limitParam = url.searchParams.get("limit");
	const limit = limitParam
		? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50)
		: 20;
	const posts = await db.searchPosts(q, userId, limit);
	await attachEmbedInfo(posts);
	return NextResponse.json(posts.map(encodePost));
}
