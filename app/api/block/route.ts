import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
	const blockerSlug = new URL(request.url).searchParams.get("blockerSlug");
	if (!blockerSlug)
		return NextResponse.json(
			{ error: "blockerSlug is required" },
			{ status: 400 },
		);
	const blocked = await db.getBlockedSlugs(blockerSlug);
	return NextResponse.json({ blocked });
}

// ブロックする側は必ずセッション本人。body の blockerSlug は公開情報なので受け付けない
// （指定させると他人のブロック関係を勝手に作れてしまう）。
export async function POST(request: NextRequest) {
	const { blockedSlug, sessionId } = await request.json();
	const user = await resolveSessionUser(request, sessionId);
	if (!user?.slug)
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	if (!blockedSlug)
		return NextResponse.json(
			{ error: "blockedSlug is required" },
			{ status: 400 },
		);
	await db.blockUser(user.slug, blockedSlug);
	return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
	const { blockedSlug, sessionId } = await request.json();
	const user = await resolveSessionUser(request, sessionId);
	if (!user?.slug)
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	if (!blockedSlug)
		return NextResponse.json(
			{ error: "blockedSlug is required" },
			{ status: 400 },
		);
	await db.unblockUser(user.slug, blockedSlug);
	return NextResponse.json({ success: true });
}
