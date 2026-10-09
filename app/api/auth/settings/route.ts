import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";

/** PUT で受け付ける設定キー（すべて真偽値）。これ以外のキーは無視する */
const SETTING_KEYS = ["isPrivate", "hideFromSearch", "hideReactions"] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

/**
 * 利用者に見せてよいエラー（`expose: true` と `status` を持つ Error。db 側の入力検査など）は
 * その文言と status の JSON にする。それ以外は投げ直す（従来どおり 500）。
 */
function exposedErrorResponse(e: unknown): NextResponse {
	const err = e as {
		expose?: unknown;
		status?: unknown;
		message?: unknown;
	} | null;
	if (
		err &&
		err.expose === true &&
		typeof err.status === "number" &&
		Number.isInteger(err.status) &&
		err.status >= 400 &&
		err.status <= 599
	) {
		return NextResponse.json(
			{ error: String(err.message ?? "error") },
			{ status: err.status },
		);
	}
	throw e;
}

export async function GET(request: NextRequest) {
	// 公開範囲設定は本人だけが読む。?slug= は受け付けない（PUT と同じくセッションから決める）。
	const user = await resolveSessionUser(request);
	if (!user?.slug)
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	const settings = await db.getUserSettings(user.slug);
	const res = NextResponse.json(settings);
	res.headers.set("Cache-Control", "private, no-store");
	return res;
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
	// 値は真偽値だけ。文字列 "false" などを素通しすると DB 側で true に化ける／型エラーで 500 になる。
	// 渡すのは既知のキーだけ（余計なキーを DataStore へ流さない）。
	if (typeof settings !== "object" || Array.isArray(settings)) {
		return NextResponse.json({ error: "invalid settings" }, { status: 400 });
	}
	const patch: Partial<Record<SettingKey, boolean>> = {};
	for (const key of SETTING_KEYS) {
		const v = (settings as Record<string, unknown>)[key];
		if (v === undefined) continue;
		if (typeof v !== "boolean") {
			return NextResponse.json(
				{ error: `invalid settings.${key}` },
				{ status: 400 },
			);
		}
		patch[key] = v;
	}

	try {
		await db.updateUserSettings(user.slug, patch);
	} catch (e) {
		return exposedErrorResponse(e);
	}
	const updated = await db.getUserSettings(user.slug);
	return NextResponse.json(updated);
}
