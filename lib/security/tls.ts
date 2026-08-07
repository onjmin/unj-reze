/**
 * TLSハンドシェイク由来のシグナルを一箇所に集約するモジュール。
 *
 * 本番は Cloudflare Workers 上で動くため、TLSを終端しているのは自分自身であり、
 * request.cf から直接ハンドシェイク情報を読める（上流プロキシを別途立てる必要はない）。
 * proxy(middleware) が request.cf から値を取り出してヘッダに詰め直し、
 * 下流のルートハンドラはヘッダ経由でそれを読む、という一方向の流れに統一する。
 *
 * セキュリティ上の要点: これらのヘッダはクライアントが偽装して送れてしまうため、
 * proxy 側で必ず「上書き、または削除」する。マージしてはいけない。
 */

/** request.cf のうち本モジュールが参照するフィールドだけを構造的に定義する。
 * @cloudflare/workers-types を依存に加えずに済ませるため、あえて最小限にしている。 */
export interface CfTlsProperties {
	/** Bot Management 契約時のみ入る。未契約なら undefined。 */
	botManagement?: { ja3Hash?: string | null; ja4?: string | null } | null;
	/** 全プランで取得可能。例: "TLSv1.3" */
	tlsVersion?: string | null;
	/** 全プランで取得可能。例: "AEAD-AES128-GCM-SHA256" */
	tlsCipher?: string | null;
}

export interface TlsSignals {
	/** Bot Management 有効時のみ得られる JA4 指紋。 */
	ja4: string | null;
	/** 同 JA3 ハッシュ。照合用データベースを持たないため現状は記録のみ。 */
	ja3: string | null;
	/** 例: "TLSv1.3"。JA4 が無い環境での代替シグナル。 */
	version: string | null;
	cipher: string | null;
}

export const TLS_HEADERS = {
	ja4: "x-ja4-fingerprint",
	ja3: "x-ja3-fingerprint",
	version: "x-tls-version",
	cipher: "x-tls-cipher",
} as const;

export const EMPTY_TLS_SIGNALS: TlsSignals = {
	ja4: null,
	ja3: null,
	version: null,
	cipher: null,
};

const clean = (v: string | null | undefined): string | null => {
	const s = typeof v === "string" ? v.trim() : "";
	return s.length > 0 ? s : null;
};

/** Cloudflare の request.cf から TLS シグナルを取り出す。 */
export function readTlsSignalsFromCf(
	cf: CfTlsProperties | undefined | null,
): TlsSignals {
	if (!cf) return EMPTY_TLS_SIGNALS;
	return {
		ja4: clean(cf.botManagement?.ja4),
		ja3: clean(cf.botManagement?.ja3Hash),
		version: clean(cf.tlsVersion),
		cipher: clean(cf.tlsCipher),
	};
}

/** proxy が下流に渡すヘッダを組み立てる。値が無いキーは「削除」を意味する null を返す。 */
export function tlsSignalsToHeaderEntries(
	signals: TlsSignals,
): [string, string | null][] {
	return [
		[TLS_HEADERS.ja4, signals.ja4],
		[TLS_HEADERS.ja3, signals.ja3],
		[TLS_HEADERS.version, signals.version],
		[TLS_HEADERS.cipher, signals.cipher],
	];
}

/** ルートハンドラ側でヘッダから TLS シグナルを復元する。 */
export function readTlsSignalsFromHeaders(headers: Headers): TlsSignals {
	return {
		ja4: clean(headers.get(TLS_HEADERS.ja4)),
		ja3: clean(headers.get(TLS_HEADERS.ja3)),
		version: clean(headers.get(TLS_HEADERS.version)),
		cipher: clean(headers.get(TLS_HEADERS.cipher)),
	};
}

// ── 判定ロジック ──

// 「一般的なブラウザ」として知られるJA4指紋のプレフィックス例。
// 実運用では既知ハッシュのデータベース/専用サービスと突き合わせる。ここでは代表例のみ。
const KNOWN_BROWSER_JA4_PREFIXES = [
	"t13d1516h2_",
	"t13d1517h2_",
	"t13d1715h2_",
];

// 主要ブラウザは2020年に TLS 1.0/1.1 のサポートを打ち切っている。
// したがって「モダンブラウザを名乗りながら 1.0/1.1 で繋いでくる」のは明確な矛盾。
const MODERN_TLS_VERSIONS = new Set(["TLSv1.2", "TLSv1.3"]);

// TLS指紋が取得できない場合のフォールバック: 既知のボット/HTTPクライアントのUser-Agent断片
const BOT_UA_PATTERNS = [
	/curl/i,
	/python-requests/i,
	/go-http-client/i,
	/axios/i,
	/node-fetch/i,
	/puppeteer/i,
	/headlesschrome/i,
	/playwright/i,
];

export function isBotUserAgent(userAgent: string): boolean {
	return BOT_UA_PATTERNS.some((re) => re.test(userAgent));
}

export type TlsVerdict = "browser" | "non-browser" | "unknown";

export interface TlsAssessment {
	verdict: TlsVerdict;
	/** high = JA4 実測に基づく。low = TLSバージョン等の間接的な根拠。 */
	confidence: "high" | "low" | "none";
	reason: string | null;
}

/**
 * TLSハンドシェイクがブラウザ標準のものに見えるかを判定する。
 * - JA4 が取れる環境（Bot Management 有効）では指紋を直接照合する。
 * - 取れない場合でも TLS バージョンだけは全プランで取れるため、
 *   「モダンブラウザを名乗りながらレガシーTLS」という矛盾だけは検出できる。
 */
export function assessTls(signals: TlsSignals): TlsAssessment {
	if (signals.ja4) {
		const known = KNOWN_BROWSER_JA4_PREFIXES.some((p) =>
			signals.ja4!.startsWith(p),
		);
		return {
			verdict: known ? "browser" : "non-browser",
			confidence: "high",
			reason: known ? null : "ja4-not-a-known-browser",
		};
	}

	if (signals.version) {
		if (!MODERN_TLS_VERSIONS.has(signals.version)) {
			return {
				verdict: "non-browser",
				confidence: "low",
				reason: `legacy-tls:${signals.version}`,
			};
		}
		// モダンTLSはボットも普通に使うため、これだけでブラウザとは断定できない。
		return { verdict: "unknown", confidence: "low", reason: null };
	}

	return { verdict: "unknown", confidence: "none", reason: null };
}

/** User-Agent の主張と TLS ハンドシェイクの矛盾を評価し、加点すべきスコアと理由を返す。 */
export function scoreUaTlsMismatch(
	userAgent: string,
	signals: TlsSignals,
): { score: number; reasons: string[] } {
	const reasons: string[] = [];
	let score = 0;

	if (isBotUserAgent(userAgent)) {
		return { score: 30, reasons: ["bot-user-agent"] };
	}

	// ここから先は「ブラウザを名乗っている」ケース。
	const tls = assessTls(signals);
	if (tls.verdict === "non-browser") {
		score += tls.confidence === "high" ? 40 : 20;
		reasons.push(`ua-tls-mismatch:${tls.reason}`);
	}

	return { score, reasons };
}
