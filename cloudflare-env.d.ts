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
	}
}

export {};
