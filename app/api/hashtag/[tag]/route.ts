import { NextRequest, NextResponse } from "next/server";
import { resolveViewerId } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { attachEmbedInfo } from "@/lib/post/post-embeds";
import { encodePost } from "@/lib/sqids";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ tag: string }> },
) {
	const { tag } = await params;
	const url = new URL(request.url);
	// 「誰として見るか」はセッションで裏取りする（lib/auth/session-server.ts resolveViewerId）。
	// クエリを信じると他人の id でその人のブロック/ミュート一覧や投票状態が覗ける。
	const userId = await resolveViewerId(request, url.searchParams.get("userId"));
	const limitParam = url.searchParams.get("limit");
	const limit = limitParam
		? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50)
		: 20;
	let decoded = tag;
	try {
		decoded = decodeURIComponent(tag);
	} catch {}
	const posts = await db.getPostsByHashtag(decoded, userId, limit);
	await attachEmbedInfo(posts);
	return NextResponse.json(posts.map(encodePost));
}
