import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { attachEmbedInfo } from "@/lib/post-embeds";
import { encodePost } from "@/lib/sqids";
import { DbPost } from "@/lib/types-db";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const rawParams = await params;
	const id = decodeURIComponent(rawParams.id || "");
	const url = new URL(request.url);
	const userId = url.searchParams.get("userId") || undefined;
	const tab = url.searchParams.get("tab");

	// DMスレッドのヘッダーのように「表示名とアイコンだけ」欲しい呼び出し。
	// 投稿一覧まで引くと転送量が跳ねるので、メタ情報だけを返す。
	if (url.searchParams.get("meta") === "1") {
		const [name, avatarUrl, bio] = await Promise.all([
			db.getUserDisplayName(id),
			db.getUserAvatarUrl(id),
			db.getUserBio(id),
		]);
		return NextResponse.json({ id, displayName: name || id, avatarUrl, bio });
	}

	const limitParam = url.searchParams.get("limit");
	const limit = limitParam
		? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50)
		: 20;

	// いいね/だめね/ハートは「このプロフィールの持ち主が押した記録」を引く。
	// 記録は displayName（名無しXXX）をキーに保存されているため、URLのスラッグ
	// （/user/NxV の NxV）で引くと常に0件になる。持ち主のdisplayNameへ解決してから引く。
	const displayNameResult = await db.getUserDisplayName(id);
	const ownerId = displayNameResult || id;

	const [posts, avatarUrl, bio] = await Promise.all([
		tab === "likes"
			? db.getLikedPosts(ownerId, limit)
			: tab === "dislikes"
				? db.getDislikedPosts(ownerId, limit)
				: tab === "hearts"
					? db.getHeartedPosts(ownerId, limit)
					: db.getUserPostsBySlug(id, userId, limit),
		db.getUserAvatarUrl(id),
		db.getUserBio(id),
	]);

	const displayName = ownerId;
	await attachEmbedInfo(posts);

	return NextResponse.json({
		id,
		displayName,
		avatarUrl,
		bio,
		posts: posts.map(encodePost),
		postCount: posts.length,
	});
}
