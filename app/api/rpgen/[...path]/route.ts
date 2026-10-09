import { NextRequest, NextResponse } from "next/server";

// RPGen Search（https://rpgen-search.pages.dev）への薄いサーバープロキシ。
//
// 3系統を扱う:
//   /api/rpgen/<endpoint>?...           → 上流 /api/rpgen/<endpoint>  検索JSON。認証トークンを付与。
//   /api/rpgen/picotune|rechord/...     → 上流 /api/picotune|rechord/... dtm の MIDI/コード検索。トークンを付与。
//   /api/rpgen/data/<path...>           → 上流 /data/<path...>        画像/音声の実体。
//   POST /api/rpgen/encode              → 上流 /api/rpgen/encode      素材ID→ハッシュ変換（RPGEN取り込み）。
//
// 画像/音声を「自前オリジン経由」にすることで:
//   - 上流CDNがCORSヘッダを返さない /data/* でも crossOrigin 画像が安全に読める。
//   - ゲームcanvasが tainted にならず、書き出し（toDataURL等）も可能になる。
//
// トークンはサーバー専用の RPGEN_SEARCH_TOKEN だけを使う。ブラウザから上流を直接叩くと
// NEXT_PUBLIC_* としてバンドルに焼き込まれ誰でも読めてしまうので、クライアントは必ずここを通すこと。
// NEXT_PUBLIC_RPGEN_SEARCH_TOKEN へのフォールバックは、所有者がトークンを入れ替えるまでの互換用。
//
// 参照: tmp/asset_collect_guide.md, rpgen-crawler/deploy/api

const ORIGIN = "https://rpgen-search.pages.dev";
const AUTH_TOKEN =
	process.env.RPGEN_SEARCH_TOKEN ||
	process.env.NEXT_PUBLIC_RPGEN_SEARCH_TOKEN ||
	"";

// 許可するトップレベルAPI（プロキシ濫用防止の allowlist）。上流 /api/rpgen/* へ流す。
const ALLOWED_API = new Set([
	"sprites",
	"sprite-anims",
	"sheets",
	"sounds",
	"maps",
]);

// dtm（@onjmin/dtm の MidiSearchClient）が使う上流 /api/* 直下のAPI。
const ALLOWED_ROOT_API = new Set(["picotune", "rechord"]);

// 各セグメントは英数・_・.・- のみ。`.` / `..` は弾く（%2e%2e による上流でのパス遡りを防ぐ）。
const SEGMENT_RE = /^[\w.-]+$/;
const isSafeSegment = (s: string) => SEGMENT_RE.test(s) && s !== "." && s !== "..";
// picotune の MIDI ファイル名（`picotune/songs/<file>`）だけは日本語や空白を含みうるので緩める。
// それでも区切り文字・制御文字・ドットだけの名前は通さない（encodeURIComponent で1セグメントに閉じる）。
const isLooseSegment = (s: string) =>
	s.length > 0 &&
	s.length <= 200 &&
	!/^\.+$/.test(s) &&
	!/[/\\\u0000-\u001f\u007f]/.test(s);
const isSafePath = (path: string[]) =>
	path.every((seg, i) =>
		path[0] === "picotune" && path[1] === "songs" && i === 2
			? isLooseSegment(seg)
			: isSafeSegment(seg),
	);

// 上流の Content-Type をそのまま返すと、上流が HTML や SVG を返したときに
// 自オリジンのページとして解釈されてしまう。呼び出し側が使う型だけ通す。
const isPassableContentType = (ct: string) => {
	const mime = ct.split(";")[0].trim().toLowerCase();
	if (mime === "image/svg+xml") return false;
	return (
		mime.startsWith("image/") ||
		mime.startsWith("audio/") ||
		mime === "application/json"
	);
};

/** プロキシしたレスポンスに必ず付けるヘッダ（MIME 推測とページとしての解釈を止める） */
const hardenHeaders = (headers: Headers, upstreamType: string | null) => {
	headers.set(
		"Content-Type",
		upstreamType && isPassableContentType(upstreamType)
			? upstreamType
			: "application/octet-stream",
	);
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Content-Security-Policy", "sandbox; frame-ancestors 'self'");
	return headers;
};

const notFound = () =>
	NextResponse.json({ error: "unknown rpgen endpoint" }, { status: 404 });

const upstreamError = () =>
	NextResponse.json({ error: "rpgen upstream unreachable" }, { status: 502 });

const authHeaders = (request: NextRequest): Record<string, string> => ({
	Authorization: `Bearer ${AUTH_TOKEN}`,
	Origin: request.headers.get("origin") ?? "",
	Referer: request.headers.get("referer") ?? request.headers.get("origin") ?? "",
	"User-Agent": request.headers.get("user-agent") ?? "Mozilla/5.0",
});

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path } = await params;
	if (!path?.length || !isSafePath(path)) return notFound();

	const isData = path[0] === "data";
	const isRootApi = ALLOWED_ROOT_API.has(path[0]);
	if (!isData && !isRootApi && !ALLOWED_API.has(path[0])) return notFound();

	const search = new URL(request.url).search;
	const joined = path.map(encodeURIComponent).join("/");
	const upstreamUrl = isData
		? `${ORIGIN}/${joined}${search}`
		: isRootApi
			? `${ORIGIN}/api/${joined}${search}`
			: `${ORIGIN}/api/rpgen/${joined}${search}`;

	try {
		const res = await fetch(upstreamUrl, {
			headers: isData ? {} : authHeaders(request),
			next: { revalidate: isData ? 86400 : 300 },
		});

		// 本文はストリームのまま返す（MIDI 等のバイナリもあるので text() にしない）。
		const headers = hardenHeaders(
			new Headers(),
			res.headers.get("Content-Type"),
		);
		headers.set(
			"Cache-Control",
			isData ? "public, max-age=86400, immutable" : "public, max-age=300",
		);
		return new NextResponse(res.body, { status: res.status, headers });
	} catch {
		return upstreamError();
	}
}

/** encode に一度に渡せるIDの上限（rpgen-parser は 1000 件ずつ送る） */
const MAX_ENCODE_IDS = 1000;

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path } = await params;
	if (path?.length !== 1 || path[0] !== "encode") return notFound();

	// 上流へは検証済みの形だけを組み直して送る（任意のJSONを素通ししない）。
	let ids: unknown;
	try {
		ids = ((await request.json()) as { ids?: unknown } | null)?.ids;
	} catch {
		return NextResponse.json({ error: "invalid body" }, { status: 400 });
	}
	if (
		!Array.isArray(ids) ||
		ids.length === 0 ||
		ids.length > MAX_ENCODE_IDS ||
		!ids.every((id) => Number.isSafeInteger(id) && id >= 0)
	) {
		return NextResponse.json({ error: "invalid ids" }, { status: 400 });
	}

	try {
		const res = await fetch(`${ORIGIN}/api/rpgen/encode`, {
			method: "POST",
			headers: { ...authHeaders(request), "Content-Type": "application/json" },
			body: JSON.stringify({ ids }),
		});
		const headers = hardenHeaders(
			new Headers(),
			res.headers.get("Content-Type"),
		);
		headers.set("Cache-Control", "no-store");
		return new NextResponse(res.body, { status: res.status, headers });
	} catch {
		return upstreamError();
	}
}
