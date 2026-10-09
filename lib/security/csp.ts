// Content-Security-Policy の組み立て（middleware.ts の applySecurityHeaders から使う）。
//
// 2 段構え:
// - ENFORCED: 壊れようのないものだけを強制する（<object>/<embed> は一切使っていない、<base> も無い、
//   他所の iframe へ埋め込まれる用途も無い）。
// - REPORT_ONLY: スクリプト・iframe・画像などを含む本番想定の全体ポリシー。まだ強制はせず、
//   違反を /api/csp-report に集めて取りこぼしを洗い出す（docs/ANTI_ABUSE.md「CSP」参照）。
//
// 外部オリジンの棚卸し（2026-10 時点。増やしたらここに足すこと）:
// - script: Turnstile(challenges.cloudflare.com)、GA(googletagmanager)、BgmManager の midi-player
//   (cdn.jsdelivr.net)、YouTube/SoundCloud の iframe API、@onjmin/dtm の WebAudioFont
//   (surikov.github.io を <script> で読む) と koe の TTS（onjmin.github.io の Go ランタイム・
//   jpreprocess を動的 import・worldline.js）。
// - wasm: dtm の utautts.wasm / jpreprocess / worldline と Havok → 'wasm-unsafe-eval'。
// - worker: dtm の voice worker は別オリジンなら fetch→Blob URL で起動する → blob:。
// - frame: EmbedPart（YouTube・ニコニコ・SoundCloud・Spotify・Suno・RPGEN・onjmin.github.io・X）、
//   BgmManager の YouTube/SoundCloud、dtm の埋め込みデモ、Turnstile。
// - img / media / font / connect: 投稿本文の直リンク画像・動画、MV のカスタムフォント（任意URL）、
//   ゲーム素材、uploader / R2 / リアルタイムハブ（wss）など**利用者が貼る任意の https URL** を
//   読むので https: で広く許す。ここで絞っても守れるものが少なく、誤検知で壊すほうが痛い。
//
// script-src の 'unsafe-inline' は Next の RSC ペイロード（インライン <script>）と GA の初期化
// スクリプトのため。nonce を配線すれば外せる（その時は 'strict-dynamic' と組で）。

const REPORT_URI = "/api/csp-report";
export const CSP_REPORT_GROUP = "csp-endpoint";

const SCRIPT_ORIGINS = [
	"https://challenges.cloudflare.com",
	"https://www.googletagmanager.com",
	"https://cdn.jsdelivr.net",
	"https://surikov.github.io",
	"https://onjmin.github.io",
	"https://www.youtube.com",
	"https://w.soundcloud.com",
];

const FRAME_ORIGINS = [
	"https://challenges.cloudflare.com",
	"https://www.youtube.com",
	"https://www.youtube-nocookie.com",
	"https://embed.nicovideo.jp",
	"https://w.soundcloud.com",
	"https://open.spotify.com",
	"https://suno.com",
	"https://rpgen.org",
	"https://onjmin.github.io",
	"https://platform.twitter.com",
];

/** 強制する CSP。frame-ancestors はこれまでどおり。 */
export const ENFORCED_CSP =
	"frame-ancestors 'self'; object-src 'none'; base-uri 'self'";

/** 本番想定の全体ポリシー（Report-Only で出す）。`dev` は next dev の HMR が eval を使うぶん。 */
export function buildReportOnlyCsp(opts: { dev: boolean }): string {
	const directives: Record<string, string[]> = {
		"default-src": ["'self'"],
		"script-src": [
			"'self'",
			"'unsafe-inline'",
			"'wasm-unsafe-eval'",
			...(opts.dev ? ["'unsafe-eval'"] : []),
			...SCRIPT_ORIGINS,
		],
		"style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
		"font-src": ["'self'", "data:", "blob:", "https:"],
		"img-src": ["'self'", "data:", "blob:", "https:"],
		"media-src": ["'self'", "data:", "blob:", "https:"],
		"connect-src": ["'self'", "https:", "wss:", "data:", "blob:"],
		"worker-src": ["'self'", "blob:"],
		"frame-src": ["'self'", "blob:", ...FRAME_ORIGINS],
		"object-src": ["'none'"],
		"base-uri": ["'self'"],
		"form-action": ["'self'"],
		"frame-ancestors": ["'self'"],
		"report-uri": [REPORT_URI],
		"report-to": [CSP_REPORT_GROUP],
	};
	return Object.entries(directives)
		.map(([name, values]) => `${name} ${values.join(" ")}`)
		.join("; ");
}

/** Reporting API 用（`report-to` が指すグループ名 → 送り先）。 */
export const REPORTING_ENDPOINTS = `${CSP_REPORT_GROUP}="${REPORT_URI}"`;
