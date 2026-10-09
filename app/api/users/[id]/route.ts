import { NextRequest, NextResponse } from "next/server";
import { resolveViewerId } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { attachEmbedInfo } from "@/lib/post/post-embeds";
import { encodePost } from "@/lib/sqids";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const rawParams = await params;
	let id: string;
	try {
		id = decodeURIComponent(rawParams.id || "");
	} catch {
		return NextResponse.json({ error: "not found" }, { status: 404 });
	}
	const url = new URL(request.url);

	// users.id は SERIAL（int4）。数として読むと int4 を超える id（"99999999999" や "1e10"。
	// pg の toUid は Number() で読む）をそのまま渡すと Postgres が 22003 で落ちて 500 になる
	const asNumber = Number(id);
	if (Number.isInteger(asNumber) && asNumber > 2147483647) {
		return NextResponse.json({ error: "not found" }, { status: 404 });
	}

	// reze の利用者（display_name を持つ users 行）以外は存在しない扱いにする。
	// users は unj と共有で、unj の利用者には display_name が無い（unj は一度も書かない）。
	// ここで弾かないと、id を総当たりするだけで unj 利用者の全期間・全板の書き込みを
	// 人単位で集められてしまう（unj が日替わり ID で隠している名寄せが reze 経由で破れる）。
	// '' は「名前を空にした reze 利用者」なので undefined だけを弾く。
	const displayNameResult = await db.getUserDisplayName(id);
	if (displayNameResult === undefined) {
		return NextResponse.json({ error: "not found" }, { status: 404 });
	}

	// DMスレッドのヘッダーのように「表示名とアイコンだけ」欲しい呼び出し。
	// 投稿一覧まで引くと転送量が跳ねるので、メタ情報だけを返す。
	if (url.searchParams.get("meta") === "1") {
		const [avatarUrl, bio] = await Promise.all([
			db.getUserAvatarUrl(id),
			db.getUserBio(id),
		]);
		return NextResponse.json({
			id,
			displayName: displayNameResult || id,
			avatarUrl,
			bio,
		});
	}

	// 「誰として見るか」はセッションで裏取りする（lib/auth/session-server.ts resolveViewerId）。
	// クエリを信じると他人の id でその人のブロック/ミュート一覧や投票状態が覗ける。
	const userId = await resolveViewerId(request, url.searchParams.get("userId"));
	const tab = url.searchParams.get("tab");

	const limitParam = url.searchParams.get("limit");
	const limit = limitParam
		? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50)
		: 20;
	const before = url.searchParams.get("before") || undefined;

	// いいね/だめね/ハートは「このプロフィールの持ち主が押した記録」を引く。
	// 記録は displayName（名無しXXX）をキーに保存されているため、URLのスラッグ
	// （/user/NxV の NxV）で引くと常に0件になる。持ち主のdisplayNameへ解決してから引く。
	const ownerId = displayNameResult || id;

	const [posts, avatarUrl, bio, settings] = await Promise.all([
		tab === "likes"
			? db.getLikedPosts(ownerId, limit)
			: tab === "dislikes"
				? db.getDislikedPosts(ownerId, limit)
				: tab === "hearts"
					? db.getHeartedPosts(ownerId, limit)
					: db.getUserPostsBySlug(id, userId, limit, before),
		db.getUserAvatarUrl(id),
		db.getUserBio(id),
		// プロフィールのヘッダーに 🔒 を出すため。鍵アカでもヘッダー（名前・アイコン・
		// 自己紹介）は誰にでも見せ、投稿一覧だけ getUserPostsBySlug が絞る。
		// 検索除外・リアクション非公開の設定値は他人に返さない。
		db.getUserSettings(id),
	]);

	const displayName = ownerId;
	await attachEmbedInfo(posts);

	const encodedPosts = posts.map(encodePost);
	const nextCursor =
		posts.length >= limit && posts[posts.length - 1]?.createdAt
			? posts[posts.length - 1].createdAt
			: null;

	return NextResponse.json({
		id,
		displayName,
		avatarUrl,
		bio,
		isPrivate: settings.isPrivate,
		posts: encodedPosts,
		postCount: posts.length,
		nextCursor,
	});
}
