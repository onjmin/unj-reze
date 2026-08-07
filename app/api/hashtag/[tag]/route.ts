import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { attachEmbedInfo } from "@/lib/post-embeds";
import { encodePost } from "@/lib/sqids";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ tag: string }> },
) {
	const { tag } = await params;
	const url = new URL(request.url);
	const userId = url.searchParams.get("userId") || undefined;
	const limitParam = url.searchParams.get("limit");
	const limit = limitParam
		? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50)
		: 20;
	const decoded = decodeURIComponent(tag);
	const posts = await db.getPostsByHashtag(decoded, userId, limit);
	await attachEmbedInfo(posts);
	return NextResponse.json(posts.map(encodePost));
}
