import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { formatDatLine, titleOf } from "@/lib/bbs/format";
import { utf8ToSjisBytes } from "@/lib/bbs/sjis";
import { db } from "@/lib/db";
import { RES_LIMIT } from "@/lib/bbs/thread-limits";
import { withEdgeCache } from "@/lib/edge-cache";
import type { DbPost } from "@/lib/types-db";
// 専ブラ対応: GET /unj/dat/スレ番.dat
// 板ID("unj" = board_id:1 うんでも実況J。C:\_own\git\_users\onjmin\unj\src\common\request\board.ts 参照)配下に配置。
// 仕様: https://scrapbox.io/2chtypebbs/dat
// フォルダ名は [id] だがURLは `123.dat` の1セグメントなので id には ".dat" が付いたまま来る。
// ファイル名(数値)はDBの連番id(threadId*2等)ではなくDbPost.datKey(Unixエポック秒)。
// 生のidを使うと極端に小さい数値になり、専ブラがエポック秒として誤読して「1970年」表示になる。
// Range / Last-Modified による差分取得に対応(推奨事項。専ブラの安定性に直結)。

export const dynamic = "force-dynamic";

/**
 * dat_key は Unix エポック秒（いまは10桁）。先頭 0 付きの別表記（0123.dat）は受け付けず、桁も縛る
 * （極端な値だと pg の created_at の範囲検索 `TIMESTAMP 'epoch' + n 秒` が timestamp の範囲外で 500 になる）。
 */
function datKeyFromParam(raw: string): number | null {
	const m = /^([1-9]\d{0,10})\.dat$/.exec(raw);
	return m ? Number(m[1]) : null;
}

/** 最終更新 = 最新レスの投稿日時(レス無しならスレ立て日時)。 */
function lastModifiedMs(op: DbPost, replies: DbPost[]): number {
	return replies.reduce(
		(latest, r) => Math.max(latest, new Date(r.createdAt).getTime()),
		new Date(op.createdAt).getTime(),
	);
}

/** If-Modified-Since 以降に更新が無いか（秒精度の HTTP 日付なので 999ms の幅を見る） */
function notModifiedSince(request: NextRequest, lastMs: number): boolean {
	const ifModifiedSince = request.headers.get("if-modified-since");
	if (!ifModifiedSince) return false;
	const since = new Date(ifModifiedSince).getTime();
	return !Number.isNaN(since) && lastMs <= since + 999;
}

function notModified(lastMs: number): NextResponse {
	return new NextResponse(null, {
		status: 304,
		headers: { "Last-Modified": new Date(lastMs).toUTCString() },
	});
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id: rawId } = await params;
	const datKey = datKeyFromParam(rawId);
	if (datKey === null) {
		return new NextResponse("Not Found", { status: 404 });
	}

	const op = await db.getPostByDatKey(datKey);
	if (!op) {
		return new NextResponse("Not Found", { status: 404 });
	}

	// 304 の判定はスレ全件を読む前に行う。getPostByDatKey は直近の返信の窓（REPLIES_PAGE_SIZE 件、
	// num の新しい順）を op.replies に付けて返すので、最新レスの日時はそこから分かる。
	// 専ブラは数秒おきに If-Modified-Since 付きで取りに来るので、ここで全件を読むと
	// 1000 レスのスレ1本で共有 Neon の転送量を焼ける。
	const windowLastMs = lastModifiedMs(op, op.replies ?? []);
	if (notModifiedSince(request, windowLastMs)) {
		return notModified(windowLastMs);
	}

	// 本文（Shift_JIS のバイト列）は誰が見ても同じなので、エッジに数秒だけ載せる。
	// 書き込みが続くスレへの専ブラのポーリングがスレ全件の読み出しと SJIS 変換（Workers の CPU 10ms 枠）を
	// 毎回やり直さないように。Range はキャッシュした全体から切り出す（キャッシュキーは URL だけなので）。
	// キーは正規の URL で作る。生の URL だと %エンコードした数字などの別表記で同じスレを
	// 毎回 MISS させ、スレ全件の読み出しと SJIS 変換をやり直させられる。
	const cacheKeyRequest = new Request(
		new URL(`/unj/dat/${datKey}.dat`, request.url),
		{ method: request.method },
	);
	const full = await withEdgeCache(
		cacheKeyRequest,
		{ sMaxAge: 5, personalized: false },
		async () => {
			// .dat は「>>1から全部を1本のテキストで返す」プロトコルで、専ブラは Range の
			// バイトオフセットで差分を取る。直近N件だけを返すとオフセットがずれて既読が
			// 壊れるので、ここだけは明示的にスレ全件（レス数上限＝RES_LIMIT）を引く。
			const replies = await db.getReplies(op.id, undefined, {
				limit: RES_LIMIT,
			});
			const lastModified = new Date(lastModifiedMs(op, replies));

			const title = titleOf(op);
			const lines = [
				formatDatLine(op, true, title),
				...replies.map((r) => formatDatLine(r, false, title)),
			];
			const fullBody = utf8ToSjisBytes(lines.join(""));
			return new NextResponse(fullBody as BodyInit, {
				status: 200,
				headers: {
					"Content-Type": "text/plain; charset=Shift_JIS",
					"Last-Modified": lastModified.toUTCString(),
					"Accept-Ranges": "bytes",
					"Content-Length": String(fullBody.byteLength),
				},
			});
		},
	);
	if (full.status !== 200) return full;

	// キャッシュから返した本文は数秒古いことがある。Last-Modified は必ず本文と揃える
	// （新しい日時を付けると、専ブラが次から 304 をもらい続けて抜けたレスを取り直せない）。
	// 専ブラの手元の方が新しいときは 304 にして、古い（短い）本文で既読を壊さない。
	const cachedLastMs = new Date(
		full.headers.get("Last-Modified") ?? "",
	).getTime();
	if (!Number.isNaN(cachedLastMs) && notModifiedSince(request, cachedLastMs)) {
		return notModified(cachedLastMs);
	}

	const range = request.headers.get("range");
	if (range) {
		const m = /^bytes=(\d*)-(\d*)$/.exec(range);
		if (m) {
			const fullBody = new Uint8Array(await full.arrayBuffer());
			const headers = new Headers(full.headers);
			const total = fullBody.byteLength;
			const start = m[1] ? parseInt(m[1], 10) : 0;
			const end = m[2] ? parseInt(m[2], 10) : total - 1;
			const clampedEnd = Math.min(end, total - 1);
			if (start >= 0 && start <= clampedEnd) {
				const chunk = fullBody.slice(start, clampedEnd + 1);
				headers.set("Content-Range", `bytes ${start}-${clampedEnd}/${total}`);
				headers.set("Content-Length", String(chunk.byteLength));
				return new NextResponse(chunk as BodyInit, { status: 206, headers });
			}
			headers.set("Content-Length", String(total));
			return new NextResponse(fullBody as BodyInit, { status: 200, headers });
		}
	}

	return full;
}
