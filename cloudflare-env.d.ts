// wrangler.json で足したバインディングの型（getCloudflareContext().env）。
// @opennextjs/cloudflare が宣言しているグローバルの CloudflareEnv を拡張する。
// `wrangler types` は使っていない（@cloudflare/workers-types を入れていないため）ので手で足すこと。
import type { RateLimitBinding } from "./lib/security/rate-limit";

declare global {
	interface CloudflareEnv {
		/** 通常の書き込み 30 回 / 10 秒（wrangler.json の ratelimits） */
		WRITE_LIMITER?: RateLimitBinding;
		/** ブラウザらしくない相手の書き込み 5 回 / 10 秒 */
		WRITE_LIMITER_STRICT?: RateLimitBinding;
		// 以下は任意（無ければ素通し。DEDUPE だけは従来の KV に落ちる）。上限は wrangler.json、
		// 使い方は lib/security/rate-limit.ts の RateLimitEnv と docs/ANTI_ABUSE.md §4
		/** 重い読み取り GET（/64 ごと） */
		READ_LIMITER?: RateLimitBinding;
		/** 重い読み取り GET の IPv6 /48 の段 */
		READ_LIMITER_48?: RateLimitBinding;
		/** 書き込みの IPv6 /48 の段 */
		WRITE_LIMITER_48?: RateLimitBinding;
		/** 匿名ユーザーの新規作成（/64 ごと） */
		SIGNUP_LIMITER?: RateLimitBinding;
		/** 匿名ユーザーの新規作成の IPv6 /48 の段 */
		SIGNUP_LIMITER_48?: RateLimitBinding;
		/** 1 回 / 60 秒の重複排除（再生数・投票・last_used_at の更新など。dedupeOnce） */
		DEDUPE_LIMITER?: RateLimitBinding;
	}
}

export {};
