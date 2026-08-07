import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
	const slug = new URL(request.url).searchParams.get("slug");
	if (!slug)
		return NextResponse.json({ error: "slug is required" }, { status: 400 });
	const settings = await db.getUserSettings(slug);
	return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
	const { settings, sessionId } = await request.json();

	// 更新対象はセッションから決める。slug は公開情報なので、
	// body で指定させると他人の公開範囲設定を誰でも書き換えられてしまう。
	const user = await resolveSessionUser(request, sessionId);
	if (!user?.slug) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	if (!settings) {
		return NextResponse.json(
			{ error: "settings are required" },
			{ status: 400 },
		);
	}

	await db.updateUserSettings(user.slug, settings);
	const updated = await db.getUserSettings(user.slug);
	return NextResponse.json(updated);
}
