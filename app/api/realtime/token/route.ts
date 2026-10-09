import { type NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";

export const dynamic = "force-dynamic";

/**
 * リアルタイムハブの個人宛チャンネル（`user:<id>`：DM本文・通知）を購読するための署名トークン。
 *
 * ハブは誰でも WebSocket で繋げるので、`user:<id>` を素通しで購読させると他人の DM を
 * 盗み読みできてしまう。ここで Cookie のセッションから本人を引き、その本人の id にだけ
 * 有効なトークンを発行する。ハブ（services/realtime/server.mjs の verifyUserToken）は
 * 同じ鍵で検証し、合わなければ購読を黙って捨てる。
 *
 * 形式: `<userId>.<expiryUnixSec>.<base64url(HMAC-SHA256(secret, "user:"+userId+"."+expiry))>`
 * 鍵は /publish と共有の REALTIME_PUBLISH_SECRET（Worker とハブしか知らない）。
 *
 * ハブ未設定（REALTIME_URL / REALTIME_PUBLISH_SECRET 欠け）なら 204。クライアントは
 * そのまま従来のポーリングで動く。
 */

/** トークンの寿命。ハブは購読の瞬間にだけ検証するので、張った購読は接続が続く限り生きる。 */
const TOKEN_TTL_SEC = 60 * 60;

function base64url(bytes: ArrayBuffer): string {
	let bin = "";
	for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(secret: string, message: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return base64url(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

export async function POST(request: NextRequest) {
	const secret = process.env.REALTIME_PUBLISH_SECRET;
	if (!process.env.REALTIME_URL || !secret) {
		return new NextResponse(null, { status: 204 });
	}

	// 本人確認は Cookie だけ（ボディの sessionId は受け付けない。送らせる理由が無い）
	const user = await resolveSessionUser(request);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	// チャンネル名は chUser(AnonymousUser.id)。ハブ側の許可文字（英数字・_-、64文字以内）に合わせる
	const userId = String(user.id);
	if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) {
		return NextResponse.json({ error: "invalid user" }, { status: 400 });
	}
	const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
	const sig = await sign(secret, `user:${userId}.${exp}`);

	return NextResponse.json(
		{ token: `${userId}.${exp}.${sig}`, userId, exp },
		{ headers: { "Cache-Control": "private, no-store" } },
	);
}
