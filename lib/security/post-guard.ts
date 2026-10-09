import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session-server";
import { getClientIp } from "@/lib/ip";
import { POST_GUARD_MESSAGES } from "./post-guard-messages";
import { scoreRequest } from "./scoring";
import { readTlsSignalsFromHeaders } from "./tls";
import { verifyTurnstileToken } from "./turnstile";
import type { FingerprintSignals } from "./types";

// 新規スレ・返信（POST /api/posts と POST /api/posts/[id]/replies）の書き込み前検査。
// docs/ANTI_ABUSE.md の 3 層（Turnstile・指紋・TLS）をここでまとめて掛ける。
//
// - TURNSTILE_SECRET_KEY があれば Turnstile のトークンを**必須**にする（無い・無効なら 403）。
//   Cloudflare 側に届かない（タイムアウト等）ときは通す＝ fail-open（スコアに軽く足すだけ）。
// - 無ければ（ローカル開発）Turnstile は飛ばす。本番で設定し忘れに気付けるよう 1 度だけ警告する。
// - 指紋が付いていればスコアリング（IP ホッピング・シークレットタブ使い回し・UA/TLS 不一致）。
//   KV が落ちていたらスコアリングだけ飛ばして通す（可用性優先）。
// - Tor（cf-ipcountry: T1）からは書かせない（unj と揃える。理由は torBlockedResponse のコメント）。
// - 専ブラの /test/bbs.cgi は Turnstile を実行できないので対象外（middleware のレート制限だけ）。
//
// API キー等の抜け道は作らない。自動運用（ペルソナ運営）も実ブラウザの UI から投稿するので
// UI 経由ならトークンが付く。

let warnedNoSecret = false;

/** 指紋は公開ボディ由来なので、型と長さを確かめてから使う（壊れていれば「無し」扱い）。 */
function sanitizeFingerprint(raw: unknown): FingerprintSignals | null {
	if (!raw || typeof raw !== "object") return null;
	const fp = raw as Record<string, unknown>;
	const strOrNull = (v: unknown, max: number) =>
		v === null || (typeof v === "string" && v.length <= max);
	const numOrNull = (v: unknown) =>
		v === null || (typeof v === "number" && Number.isFinite(v));
	const screen = fp.screen as Record<string, unknown> | undefined;
	const ok =
		typeof fp.canvas === "string" &&
		fp.canvas.length <= 64 * 1024 &&
		strOrNull(fp.webglVendor, 256) &&
		strOrNull(fp.webglRenderer, 512) &&
		numOrNull(fp.hardwareConcurrency) &&
		numOrNull(fp.deviceMemory) &&
		!!screen &&
		typeof screen === "object" &&
		["width", "height", "colorDepth", "pixelRatio"].every(
			(k) => typeof screen[k] === "number" && Number.isFinite(screen[k]),
		) &&
		strOrNull(fp.timezone, 64) &&
		strOrNull(fp.language, 64) &&
		strOrNull(fp.platform, 64) &&
		Array.isArray(fp.languages) &&
		fp.languages.length <= 32 &&
		fp.languages.every((l) => typeof l === "string" && l.length <= 64);
	return ok ? (fp as unknown as FingerprintSignals) : null;
}

/** スコアリングは KV にセッションIDを書くので、秘密そのものではなくハッシュを渡す。 */
async function hashedSessionId(
	request: NextRequest,
	bodySessionId: unknown,
): Promise<string | null> {
	const raw =
		request.cookies.get(SESSION_COOKIE)?.value ||
		request.headers.get(SESSION_HEADER) ||
		(typeof bodySessionId === "string" ? bodySessionId : "");
	if (!raw) return null;
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`session:${raw}`),
	);
	return Array.from(new Uint8Array(digest).slice(0, 8))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Tor（Cloudflare は出口ノードを国コード T1 で示す）からの書き込みなら 403 のレスポンス、
 * そうでなければ null。
 *
 * reze で作る・書き換えるスレ・レスは unj と同じ threads/res に入り unj の板にも出るので、
 * unj の Tor 拒否と揃える（unj 側だけ拒否しても reze 経由で書けてしまう）。
 * 使っている場所は guardNewPost（新規スレ・返信）、PATCH /api/posts/[id]（編集）、
 * app/test/bbs.cgi（同じ判定を errorPage で返す）の 3 か所。運用で Tor を許すと決めたら、
 * この関数を常に null にして bbs.cgi の判定を消せばよい。
 */
export function torBlockedResponse(request: NextRequest): NextResponse | null {
	if (request.headers.get("cf-ipcountry")?.toUpperCase() !== "T1") return null;
	return NextResponse.json(
		{ error: "Tor からの書き込みはできません", code: "tor_blocked" },
		{ status: 403 },
	);
}

/**
 * 通してよければ null、拒否するならそのまま返すレスポンス。
 * セッションユーザーの自動作成より**前**に呼ぶこと（ボットのためにユーザーを作らない）。
 */
export async function guardNewPost(
	request: NextRequest,
	body: { turnstileToken?: unknown; fingerprint?: unknown; sessionId?: unknown },
	action: "post" | "reply",
): Promise<NextResponse | null> {
	// Tor は拒否（理由は torBlockedResponse）。Turnstile の siteverify（外部への fetch）より
	// 前に置き、無駄なサブリクエストを使わない。
	const torBlocked = torBlockedResponse(request);
	if (torBlocked) return torBlocked;

	const ip = getClientIp(request.headers);
	const token =
		typeof body.turnstileToken === "string" && body.turnstileToken.length <= 4096
			? body.turnstileToken
			: null;

	let turnstileOk = true;
	let turnstileUnreachable = false;
	if (process.env.TURNSTILE_SECRET_KEY) {
		// クライアント（lib/security/turnstile-client.ts）はスレ立て・返信とも action "post" で
		// ウィジェットを出すので、ここも "post" で照合する（引数の action とは別物）
		const result = await verifyTurnstileToken(token, ip, "post");
		if (!result.success && !result.unreachable) {
			console.warn(
				`[post-guard] ${action}: turnstile rejected (${result.errorCodes.join(",") || "unknown"})`,
			);
			return NextResponse.json(
				{ error: POST_GUARD_MESSAGES.turnstile, code: "turnstile_failed" },
				{ status: 403 },
			);
		}
		if (result.unreachable) {
			console.warn(
				`[post-guard] ${action}: turnstile unreachable (${result.errorCodes.join(",")}), failing open`,
			);
			turnstileOk = false;
			turnstileUnreachable = true;
		}
	} else if (!warnedNoSecret) {
		warnedNoSecret = true;
		console.warn(
			"[post-guard] TURNSTILE_SECRET_KEY 未設定のため Turnstile 検証をスキップ（本番では必ず設定すること）",
		);
	}

	const fingerprint = sanitizeFingerprint(body.fingerprint);
	if (!fingerprint) return null;

	try {
		const assessment = await scoreRequest({
			fingerprint,
			ip,
			sessionId: await hashedSessionId(request, body.sessionId),
			userAgent: request.headers.get("user-agent") || "",
			tls: readTlsSignalsFromHeaders(request.headers),
			turnstileOk,
			turnstileUnreachable,
		});
		if (assessment.blocked) {
			console.warn(
				`[post-guard] ${action}: blocked score=${assessment.score} reasons=${assessment.reasons.join(",")}`,
			);
			return NextResponse.json(
				{ error: POST_GUARD_MESSAGES.blocked, code: "abuse_blocked" },
				{ status: 403 },
			);
		}
		if (assessment.rateLimited) {
			return NextResponse.json(
				{ error: POST_GUARD_MESSAGES.rateLimited, code: "abuse_rate_limited" },
				{ status: 429, headers: { "Retry-After": "10" } },
			);
		}
	} catch (err) {
		console.warn(`[post-guard] ${action}: scoring failed, failing open`, err);
	}
	return null;
}
