import { NextResponse } from "next/server";

/**
 * 廃止（410）。以前は Turnstile 検証 → 多信号スコアリング → レート判定を単独で行う
 * 事前確認エンドポイントだったが、どこからも呼ばれていなかった（投稿・返信は
 * lib/security/post-guard.ts の guardNewPost が同じことをルート内で行う）。
 * 残しておくと、認証なしで叩くだけでスコアリングが KV へ書き込み（REST API の書き込み枠を
 * 焼ける）、しかも生のセッションIDを KV のフィールド名に書いていた。
 * スコアリングも KV も触らずに 410 を返す。
 */
export async function POST() {
	return NextResponse.json(
		{ error: "gone" },
		{ status: 410, headers: { "Cache-Control": "no-store" } },
	);
}
