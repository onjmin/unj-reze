import { NextRequest, NextResponse } from "next/server";
import { resolveOrCreateSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { parseBgRef, parseManifestRef } from "@/lib/assets/manifest-ref";
import { encodeGame } from "@/lib/sqids";

/** 作品タイトルの上限（文字数）。超えた分は切る */
const MAX_TITLE_LENGTH = 100;
/**
 * preset の形だけを見る（PresetId・'blank' など。値の一覧では縛らない：
 * プリセットを足し引きするたびにここを直す羽目になり、AGENTS.md の「プリセット ID で
 * 挙動を分けない」にも反する）。共有行に任意の長さ・文字の文字列を積ませないためのもの。
 */
const PRESET_RE = /^[\w:-]{1,64}$/;

/**
 * タイトルの前後の空白を落とし、上限を超えた分は切る。文字列でない・空なら null（400）。
 * 長すぎても弾かない：タイトル欄に maxLength が無く、改造のたびに「（改造）」が付くうえ、
 * 編集の保存（app/page.tsx handleSaveEdited*）は失敗を表示しないので、弾くと長いタイトルの
 * 作品が黙って保存できなくなる。共有行に積ませない目的は切るだけで足りる。
 */
function parseTitle(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const t = value.trim();
	if (!t) return null;
	let cut = t.slice(0, MAX_TITLE_LENGTH);
	// 切り口でサロゲートペアの片割れを残さない
	if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
	return cut.trimEnd();
}

/**
 * 利用者に見せてよいエラー（`expose: true` と `status` を持つ Error。セッション作成の
 * 401/400/429 や db 側の入力検査）はその文言と status の JSON にする。それ以外は投げ直す（従来どおり 500）。
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
	const url = new URL(request.url);
	const limitParam = url.searchParams.get("limit");
	const limit = limitParam
		? Math.min(Math.max(1, parseInt(limitParam, 10) || 30), 50)
		: 30;
	const games = await db.listAllGames(limit);
	return NextResponse.json(games.map(encodeGame));
}

export async function POST(request: NextRequest) {
	const body = await request.json();
	const { preset, title, sessionId } = body;

	if (!preset || !title) {
		return NextResponse.json(
			{ error: "preset and title are required" },
			{ status: 400 },
		);
	}
	if (typeof preset !== "string" || !PRESET_RE.test(preset)) {
		return NextResponse.json({ error: "invalid preset" }, { status: 400 });
	}
	const safeTitle = parseTitle(title);
	if (safeTitle === null) {
		return NextResponse.json(
			{ error: "title must be a non-empty string" },
			{ status: 400 },
		);
	}

	// manifest 本体はブラウザが uploader-worker へ直接上げ済み。ここに来るのはURLだけ。
	// 公開ボディ由来なので保存先ホストを必ず検証する（任意の外部URLを登録させない）。
	const manifestRef = parseManifestRef(body, "game");
	if (!manifestRef) {
		return NextResponse.json(
			{ error: "valid manifestUrl is required" },
			{ status: 400 },
		);
	}

	try {
		// creatorSlug はセッション本人の slug を使う。body の creatorSlug は公開情報なので信用できない。
		// 投稿（/api/posts）と同じく未登録セッションならここで作る：作者が空だと、続く投稿で
		// 「自分の作品か」を確かめられず添付できない（app/api/_lib/work-owner.ts）。
		// セッションが無い・作成の上限に当たったときは 401/400/429 が投げられる（exposedErrorResponse）。
		const user = await resolveOrCreateSessionUser(request, sessionId);
		const creatorSlug = user.slug;

		const game = await db.createGame({
			preset,
			title: safeTitle,
			...manifestRef,
			bgRef: parseBgRef(body.bgRef),
			creatorSlug,
		});
		return NextResponse.json(encodeGame(game), { status: 201 });
	} catch (e) {
		return exposedErrorResponse(e);
	}
}
