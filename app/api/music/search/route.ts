import { NextRequest, NextResponse } from "next/server";

const VALID_ENTITIES = ["song", "album", "musicArtist"];
/** 検索語の上限（文字数） */
const MAX_TERM_LENGTH = 100;
/** iTunes Search API の limit（1〜200）のうち、ここで許す範囲。既定は 25 */
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;
/** 遡れる深さの上限。素通しすると1回で大きな応答を何度でも引かせられる */
const MAX_OFFSET = 200;

/** 整数として読んで [min, max] に収める。読めなければ fallback */
function clampInt(
	raw: string | null,
	min: number,
	max: number,
	fallback: number,
) {
	const n = raw === null ? Number.NaN : parseInt(raw, 10);
	return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

export async function GET(request: NextRequest) {
	const url = new URL(request.url);
	const term = url.searchParams.get("term");
	const entity = url.searchParams.get("entity") || "song";
	const limit = clampInt(
		url.searchParams.get("limit"),
		1,
		MAX_LIMIT,
		DEFAULT_LIMIT,
	);
	const offset = clampInt(url.searchParams.get("offset"), 0, MAX_OFFSET, 0);

	if (!term) {
		return NextResponse.json({ error: "term is required" }, { status: 400 });
	}
	if (term.length > MAX_TERM_LENGTH) {
		return NextResponse.json({ error: "term too long" }, { status: 400 });
	}
	if (!VALID_ENTITIES.includes(entity)) {
		return NextResponse.json({ error: "invalid entity" }, { status: 400 });
	}

	try {
		const params = new URLSearchParams({
			term,
			entity,
			limit: String(limit),
			offset: String(offset),
			country: "JP",
			lang: "ja_jp",
		});
		const res = await fetch(
			`https://itunes.apple.com/search?${params.toString()}`,
			{
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Accept: "application/json",
				},
			},
		);

		if (!res.ok) {
			return NextResponse.json({ resultCount: 0, results: [] });
		}

		const data = await res.json();
		return NextResponse.json(data);
	} catch {
		return NextResponse.json({ resultCount: 0, results: [] });
	}
}
