import { NextRequest, NextResponse } from "next/server";
import { resolveViewerId } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";
import { attachEmbedInfo } from "@/lib/post/post-embeds";
import { encodePost } from "@/lib/sqids";

/** タグの上限（文字数）。LIKE 検索は全件走査になるので /api/search の q と同じ値で弾く */
const MAX_TAG_LENGTH = 100;

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ tag: string }> },
) {
	const { tag } = await params;
	const url = new URL(request.url);
	let decoded = tag;
	try {
		decoded = decodeURIComponent(tag);
	} catch {}
	if (decoded.length > MAX_TAG_LENGTH) {
		return NextResponse.json({ error: "tag too long" }, { status: 400 });
	}
	// 「誰として見るか」はセッションで裏取りする（lib/auth/session-server.ts resolveViewerId）。
	// クエリを信じると他人の id でその人のブロック/ミュート一覧や投票状態が覗ける。
	const userId = await resolveViewerId(request, url.searchParams.get("userId"));
	const limitParam = url.searchParams.get("limit");
	const limit = limitParam
		? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50)
		: 20;
	// 匿名の結果だけをエッジに載せる。パーソナライズするかは裏取りした viewer で決める
	// （クエリの userId だけでは決めない：セッションと食い違えば匿名の結果なので共有してよい）。
	// キーは実際に使う値（デコード後のタグ・丸めた limit）で作り直す。生の URL のままだと
	// limit=20a や %エンコードの違いで同じ検索を別キーにでき、毎回 MISS で LIKE 検索を走らせられる。
	const cacheKeyRequest = new Request(
		`${url.origin}/api/hashtag/${encodeURIComponent(decoded)}?limit=${limit}`,
		{ method: request.method },
	);
	return await withEdgeCache(
		cacheKeyRequest,
		{ sMaxAge: 30, personalized: !!userId },
		async () => {
			const posts = await db.getPostsByHashtag(decoded, userId, limit);
			await attachEmbedInfo(posts);
			return NextResponse.json(posts.map(encodePost));
		},
	);
}
