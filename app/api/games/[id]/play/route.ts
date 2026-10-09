import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { getClientIp, rateLimitKeyFromIp } from "@/lib/ip";
import {
	getRateLimitEnv,
	isFirstWithinWindow,
} from "@/lib/security/rate-limit";
import { decodeId, encodeGame } from "@/lib/sqids";

/**
 * 同じIPからの連打でプレイ数が水増しされないようにする猶予（秒）。KV で判定するとき用。
 * 本番は DEDUPE_LIMITER（60 秒窓）で判定し、KV の書き込み枠を食わない
 * （lib/security/rate-limit.ts isFirstWithinWindow）。
 */
const PLAY_DEDUPE_SEC = 120;

/**
 * プレイ結果の記録。
 *  - phase: 'start' … プレイ回数を+1（短時間の再読み込みは数えない）
 *  - phase: 'end'   … クリア数とハイスコアを記録（プレイ回数は加算しない）
 * 匿名サイトなのでスコアの自己申告は防ぎようがなく、ここでは回数の水増しだけを抑える。
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const gameId = decodeId(id);
	if (gameId === null) {
		return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
	}

	let body: Record<string, unknown> = {};
	try {
		const parsed = await request.json();
		if (parsed && typeof parsed === "object")
			body = parsed as Record<string, unknown>;
	} catch {
		// ページ離脱時の sendBeacon などで空ボディが来ることがある
	}

	const sessionUser = await resolveSessionUser(
		request,
		typeof body.sessionId === "string" ? body.sessionId : undefined,
	);
	const phase = body.phase === "end" ? "end" : "start";
	const cleared = phase === "end" && !!body.cleared;
	const score = Math.max(0, Math.min(Number(body.score) || 0, 9_999_999));
	// ハイスコア保持者の名前はセッション本人の表示名だけ。body の displayName を信じると
	// 誰でも他人の名前（や任意の文言）でランキングに載せられる。身元が無ければ名無し。
	const displayName = sessionUser?.displayName ?? "名無し";

	// IPv6 は /64 に丸める（末尾を変えるだけで何度でも数え直せないように）
	const ipKey = rateLimitKeyFromIp(getClientIp(request.headers));
	const env = await getRateLimitEnv();

	let countPlay = phase === "start";
	if (countPlay) {
		countPlay = await isFirstWithinWindow(
			env,
			`play:game:${gameId}:${ipKey}`,
			PLAY_DEDUPE_SEC,
		);
	}

	if (!countPlay && phase === "start") {
		return NextResponse.json({ ok: true, counted: false });
	}

	// クリア数も同じIPからの連打で水増しさせない（スコア自体は自己申告なので防げない）
	let countClear = cleared;
	if (countClear) {
		countClear = await isFirstWithinWindow(
			env,
			`clear:game:${gameId}:${ipKey}`,
			PLAY_DEDUPE_SEC,
		);
	}

	const updated = await db.recordGamePlay(gameId, {
		cleared: countClear,
		score,
		displayName,
		countPlay,
	});
	if (!updated)
		return NextResponse.json({ error: "not found" }, { status: 404 });

	const encoded = encodeGame(updated);
	return NextResponse.json({
		ok: true,
		counted: countPlay,
		plays: encoded.plays ?? 0,
		clears: encoded.clears ?? 0,
		bestScore: encoded.bestScore ?? 0,
		bestScoreBy: encoded.bestScoreBy,
	});
}
