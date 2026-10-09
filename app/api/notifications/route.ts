import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";
import { decodeId, encodeNotification } from "@/lib/sqids";

export async function GET(request: NextRequest) {
	// 対象は必ずセッション本人（?userId= は受け付けない。他人の通知が読めてしまう）。
	// 既読化・削除（PATCH/DELETE）と同じく user.id をキーにする。
	const user = await resolveSessionUser(request);
	if (!user)
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	const url = new URL(request.url);
	if (url.searchParams.get("unread") === "1") {
		const count = await db.getUnreadCount(user.id);
		const res = NextResponse.json({ count });
		res.headers.set("Cache-Control", "private, no-store");
		return res;
	}
	// 通知は常に個人向けなので共有キャッシュには載せない（private のみ）。
	return await withEdgeCache(
		request,
		{ sMaxAge: 10, personalized: true },
		async () => {
			const notifications = await db.getNotifications(user.id);
			return NextResponse.json(notifications.map(encodeNotification));
		},
	);
}

// 既読化・削除の対象は必ずセッション本人の通知（body の userId は受け付けない）
export async function PATCH(request: NextRequest) {
	const { id, all, sessionId } = await request.json();
	const user = await resolveSessionUser(request, sessionId);
	if (!user)
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	if (all) {
		await db.markAllNotificationsRead(user.id);
	} else if (id != null) {
		const decodedId = decodeId(id);
		if (decodedId === null) {
			return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
		}
		await db.markNotificationRead(decodedId, user.id);
	} else {
		return NextResponse.json(
			{ error: "id or all is required" },
			{ status: 400 },
		);
	}
	return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
	const { id, sessionId } = await request.json();
	const user = await resolveSessionUser(request, sessionId);
	if (!user)
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	if (id == null)
		return NextResponse.json({ error: "id is required" }, { status: 400 });
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}
	await db.deleteNotification(decodedId, user.id);
	return NextResponse.json({ success: true });
}
