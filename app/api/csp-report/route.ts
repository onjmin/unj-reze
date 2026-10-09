import { NextRequest } from "next/server";

// CSP 違反レポートの受け口（middleware.ts の Content-Security-Policy-Report-Only が送ってくる）。
// 保存はしない。1 件 1 行の要約を console.warn に出すだけで、本番は `wrangler tail` か
// Workers のログ（observability）で読む。読み方は docs/ANTI_ABUSE.md「CSP」。
//
// 受ける形式は 2 つ:
// - 旧式 `report-uri`: Content-Type application/csp-report、本文 {"csp-report": {...}}（ケバブケース）
// - Reporting API `report-to`: Content-Type application/reports+json、本文 [{type:"csp-violation", body:{...}}]（キャメルケース）
//
// 誰でも POST できる口なので、本文は 16KB で打ち切り、URL はオリジン／パスだけに丸めて出す
// （クエリに他人のセッション等が載っていてもログへ残さない）。レート制限は middleware の csp 枠。

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_REPORTS_PER_REQUEST = 20;

interface CspSummary {
	directive: string;
	blocked: string;
	document: string;
	source: string;
	disposition: string;
}

/** オリジンだけ（"inline" / "eval" などのキーワードはそのまま）。 */
function originOnly(raw: unknown): string {
	if (typeof raw !== "string" || !raw) return "-";
	try {
		const u = new URL(raw);
		if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "wss:")
			return u.origin;
		return `${u.protocol}`; // data: / blob: など
	} catch {
		return raw.slice(0, 40);
	}
}

/** 自サイトのページはパスだけ（クエリ・ハッシュは捨てる）。 */
function pathOnly(raw: unknown): string {
	if (typeof raw !== "string" || !raw) return "-";
	try {
		return new URL(raw).pathname.slice(0, 120);
	} catch {
		return "-";
	}
}

function str(v: unknown): string {
	return typeof v === "string" ? v.slice(0, 80) : "";
}

function summarize(r: Record<string, unknown>): CspSummary {
	// 旧式はケバブケース、Reporting API はキャメルケース
	const directive =
		str(r["effective-directive"]) ||
		str(r.effectiveDirective) ||
		str(r["violated-directive"]) ||
		"-";
	const sourceFile = r["source-file"] ?? r.sourceFile;
	const line = r["line-number"] ?? r.lineNumber;
	return {
		directive: directive.split(" ")[0],
		blocked: originOnly(r["blocked-uri"] ?? r.blockedURL),
		document: pathOnly(r["document-uri"] ?? r.documentURL),
		source:
			typeof sourceFile === "string" && sourceFile
				? `${originOnly(sourceFile)}${typeof line === "number" ? `:${line}` : ""}`
				: "-",
		disposition: str(r.disposition) || "report",
	};
}

function extractReports(payload: unknown): Record<string, unknown>[] {
	if (Array.isArray(payload)) {
		return payload
			.filter(
				(x): x is { type?: unknown; body: Record<string, unknown> } =>
					!!x &&
					typeof x === "object" &&
					!!(x as { body?: unknown }).body &&
					typeof (x as { body?: unknown }).body === "object",
			)
			.filter((x) => x.type === undefined || x.type === "csp-violation")
			.map((x) => x.body);
	}
	if (payload && typeof payload === "object") {
		const legacy = (payload as { "csp-report"?: unknown })["csp-report"];
		if (legacy && typeof legacy === "object")
			return [legacy as Record<string, unknown>];
	}
	return [];
}

async function readCappedText(request: NextRequest): Promise<string | null> {
	const declared = Number(request.headers.get("content-length") || "0");
	if (declared > MAX_BODY_BYTES) return null;
	if (!request.body) return "";
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_BODY_BYTES) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}
	const buf = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		buf.set(c, offset);
		offset += c.byteLength;
	}
	return new TextDecoder().decode(buf);
}

const ACCEPTED_TYPES = [
	"application/csp-report",
	"application/reports+json",
	"application/json",
];

export async function POST(request: NextRequest) {
	const type = (request.headers.get("content-type") || "")
		.split(";")[0]
		.trim()
		.toLowerCase();
	if (!ACCEPTED_TYPES.includes(type)) {
		return new Response(null, { status: 415 });
	}
	const text = await readCappedText(request);
	if (text === null) return new Response(null, { status: 413 });

	let payload: unknown;
	try {
		payload = JSON.parse(text);
	} catch {
		return new Response(null, { status: 400 });
	}

	for (const r of extractReports(payload).slice(0, MAX_REPORTS_PER_REQUEST)) {
		const s = summarize(r);
		// grep しやすい固定の頭（`wrangler tail | grep csp-violation`）
		console.warn(
			`[csp-violation] ${s.disposition} directive=${s.directive} blocked=${s.blocked} page=${s.document} source=${s.source}`,
		);
	}
	return new Response(null, { status: 204 });
}
