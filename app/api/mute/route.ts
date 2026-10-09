import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
	// 一覧は本人の分だけ。?muterSlug= を信じると他人の一覧が覗けるので、セッションから決める。
	const user = await resolveSessionUser(request);
	if (!user?.slug)
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	const muted = await db.getMutedSlugs(user.slug);
	const res = NextResponse.json({ muted });
	res.headers.set("Cache-Control", "private, no-store");
	return res;
}

// ミュートする側は必ずセッション本人（body の muterSlug は公開情報なので受け付けない）
export async function POST(request: NextRequest) {
	const { mutedSlug, sessionId } = await request.json();
	const user = await resolveSessionUser(request, sessionId);
	if (!user?.slug)
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	if (!mutedSlug)
		return NextResponse.json(
			{ error: "mutedSlug is required" },
			{ status: 400 },
		);
	await db.muteUser(user.slug, mutedSlug);
	return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
	const { mutedSlug, sessionId } = await request.json();
	const user = await resolveSessionUser(request, sessionId);
	if (!user?.slug)
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	if (!mutedSlug)
		return NextResponse.json(
			{ error: "mutedSlug is required" },
			{ status: 400 },
		);
	await db.unmuteUser(user.slug, mutedSlug);
	return NextResponse.json({ success: true });
}
