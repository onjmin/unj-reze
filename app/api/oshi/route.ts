import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { encodeOshiItem } from "@/lib/sqids";
import { OshiItemKind } from "@/lib/types";
import type { DbOshiItem } from "@/lib/types-db";

const VALID_KINDS: OshiItemKind[] = ["song", "album", "artist"];

/** 1人が持てる推しの件数（DB 側の一覧は LIMIT 100 で頭打ち） */
const MAX_OSHI_ITEMS = 30;
/** title / subtitle の上限（文字数） */
const MAX_OSHI_TEXT_LENGTH = 200;
/** 保存する URL の上限（文字数）。iTunes の viewUrl は日本語名を %XX にしても 500 字前後 */
const MAX_OSHI_URL_LENGTH = 1000;

// 保存してよい URL のホスト（接尾辞一致）。値は MusicShareModal が iTunes Search API
// （/api/music/search）の結果からそのまま詰めるもの:
//   artworkUrl ← artworkUrl100      https://is1-ssl.mzstatic.com/image/thumb/...
//   previewUrl ← previewUrl         https://audio-ssl.itunes.apple.com/itunes-assets/...
//   viewUrl    ← track/collection/artistViewUrl  https://music.apple.com/jp/... （古いものは itunes.apple.com）
// 推しは他人のプロフィールで <img>/<audio> として読み込まれるので、任意の URL を入れさせると
// 閲覧者のブラウザに任意のリクエストを撃たせられる（自サイトの API を叩かせる CSRF の踏み台にもなる）。
const ARTWORK_HOSTS = ["mzstatic.com"];
const PREVIEW_HOSTS = ["apple.com", "mzstatic.com"];
const VIEW_HOSTS = ["apple.com"];

/**
 * 推しの URL 欄を検証する。未指定（undefined/null/""）は undefined、
 * https・資格情報なし・許可ホストなら元の文字列、それ以外は null（400）。
 */
function parseAppleUrl(
	value: unknown,
	hosts: string[],
): string | undefined | null {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value !== "string" || value.length > MAX_OSHI_URL_LENGTH)
		return null;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || url.username || url.password) return null;
	const host = url.hostname.toLowerCase();
	return hosts.some((h) => host === h || host.endsWith(`.${h}`)) ? value : null;
}

/**
 * 保存済みの推しの URL を読み出すときにも同じ規則で検査し、通らないものは落とす。
 * POST の検査を入れる前に保存された行（任意の https URL）も、閲覧者のブラウザに読ませないため。
 */
function withSafeUrls(item: DbOshiItem): DbOshiItem {
	return {
		...item,
		artworkUrl: parseAppleUrl(item.artworkUrl, ARTWORK_HOSTS) ?? undefined,
		viewUrl: parseAppleUrl(item.viewUrl, VIEW_HOSTS) ?? undefined,
		previewUrl: parseAppleUrl(item.previewUrl, PREVIEW_HOSTS) ?? undefined,
	};
}

/** 上限の文字数で切る。切り口でサロゲートペアの片割れを残さない */
function clampText(value: string, max: number): string {
	const cut = value.slice(0, max);
	return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** trackId などの iTunes の数値 ID。未指定は undefined、正の安全な整数でなければ null（400） */
function parseItunesId(value: unknown): number | undefined | null {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value !== "number" && typeof value !== "string") return null;
	const n = Number(value);
	return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * 利用者に見せてよいエラー（`expose: true` と `status` を持つ Error。db 側の入力検査など）は
 * その文言と status の JSON にする。それ以外は投げ直す（従来どおり 500）。
 */
function exposedErrorResponse(e: unknown): NextResponse {
	const err = e as {
		expose?: unknown;
		status?: unknown;
		message?: unknown;
	} | null;
	if (
		err &&
		err.expose === true &&
		typeof err.status === "number" &&
		Number.isInteger(err.status) &&
		err.status >= 400 &&
		err.status <= 599
	) {
		return NextResponse.json(
			{ error: String(err.message ?? "error") },
			{ status: err.status },
		);
	}
	throw e;
}

export async function GET(request: NextRequest) {
	const slug = new URL(request.url).searchParams.get("slug");
	if (!slug)
		return NextResponse.json({ error: "slug is required" }, { status: 400 });
	const items = await db.listOshiItems(slug);
	return NextResponse.json(items.map((i) => encodeOshiItem(withSafeUrls(i))));
}

export async function POST(request: NextRequest) {
	const body = await request.json();
	const {
		kind,
		trackId,
		collectionId,
		artistId,
		title,
		subtitle,
		artworkUrl,
		viewUrl,
		previewUrl,
		sessionId,
	} = body;

	// 追加先は必ずセッション本人の推しリスト（body の userSlug は受け付けない）
	const user = await resolveSessionUser(request, sessionId);
	if (!user?.slug)
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	if (!kind || typeof title !== "string" || !title.trim()) {
		return NextResponse.json(
			{ error: "kind and title are required" },
			{ status: 400 },
		);
	}
	if (!VALID_KINDS.includes(kind)) {
		return NextResponse.json({ error: "invalid kind" }, { status: 400 });
	}
	if (
		subtitle !== undefined &&
		subtitle !== null &&
		typeof subtitle !== "string"
	) {
		return NextResponse.json({ error: "invalid subtitle" }, { status: 400 });
	}
	// 曲名・「アーティスト · アルバム」はクラシックなどで長くなりうるので、弾かずに上限で切る
	// （iTunes の結果をそのまま詰めているだけなので、弾くとその曲を推しに入れられなくなる）。
	const safeTitle = clampText(title.trim(), MAX_OSHI_TEXT_LENGTH);
	const safeSubtitle = subtitle
		? clampText(subtitle, MAX_OSHI_TEXT_LENGTH)
		: undefined;

	const ids = {
		trackId: parseItunesId(trackId),
		collectionId: parseItunesId(collectionId),
		artistId: parseItunesId(artistId),
	};
	if (
		ids.trackId === null ||
		ids.collectionId === null ||
		ids.artistId === null
	) {
		return NextResponse.json({ error: "invalid id" }, { status: 400 });
	}
	const urls = {
		artworkUrl: parseAppleUrl(artworkUrl, ARTWORK_HOSTS),
		viewUrl: parseAppleUrl(viewUrl, VIEW_HOSTS),
		previewUrl: parseAppleUrl(previewUrl, PREVIEW_HOSTS),
	};
	if (
		urls.artworkUrl === null ||
		urls.viewUrl === null ||
		urls.previewUrl === null
	) {
		return NextResponse.json({ error: "invalid url" }, { status: 400 });
	}

	const existing = await db.listOshiItems(user.slug);
	if (existing.length >= MAX_OSHI_ITEMS) {
		return NextResponse.json(
			{ error: `推しは${MAX_OSHI_ITEMS}件まで登録できます` },
			{ status: 400 },
		);
	}

	try {
		const item = await db.addOshiItem(user.slug, {
			kind,
			trackId: ids.trackId,
			collectionId: ids.collectionId,
			artistId: ids.artistId,
			title: safeTitle,
			subtitle: safeSubtitle,
			artworkUrl: urls.artworkUrl,
			viewUrl: urls.viewUrl,
			previewUrl: urls.previewUrl,
		});
		return NextResponse.json(encodeOshiItem(item), { status: 201 });
	} catch (e) {
		return exposedErrorResponse(e);
	}
}
