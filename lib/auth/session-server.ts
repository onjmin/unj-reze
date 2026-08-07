import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { AnonymousUser } from "@/lib/types";

/** lib/session.ts がクライアント側で書くセッションCookieと同名 */
export const SESSION_COOKIE = "unj_reze_session";

/**
 * 書き込み系APIの本人確認。
 *
 * このアプリはログイン不要なので、セッションID（Cookie、無ければリクエストボディ）が
 * 唯一の秘密情報になる。**誰を更新するかをリクエスト本文に書かせてはいけない**：
 * slug も displayName も公開情報なので、それを鍵にすると他人のプロフィールや設定を
 * 誰でも書き換えられてしまう（実際にそうなっていた）。
 *
 * 呼び出し側は必ず「戻り値のユーザー」だけを更新すること。
 * 未知のセッションでは null を返す（ここでアカウントを作ってはいけない。
 * 作ると「名乗れば通る」に逆戻りする）。
 */
export async function resolveSessionUser(
	request: NextRequest,
	bodySessionId?: unknown,
): Promise<AnonymousUser | null> {
	const fromCookie = request.cookies.get(SESSION_COOKIE)?.value;
	const sessionId =
		fromCookie ||
		(typeof bodySessionId === "string" ? bodySessionId : undefined);
	if (!sessionId) return null;
	return await db.getAnonymousUserBySession(sessionId);
}
