import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { firstLineTitle, formatDatLine } from "@/lib/bbs/format";
import { utf8ToSjisBytes } from "@/lib/bbs/sjis";
import { db } from "@/lib/db";
// 専ブラ対応: GET /bbs/dat/スレ番.dat
// 仕様: https://scrapbox.io/2chtypebbs/dat
// フォルダ名は [id] だがURLは `123.dat` の1セグメントなので id には ".dat" が付いたまま来る。
// ファイル名(数値)はDBの連番id(threadId*2等)ではなくDbPost.datKey(Unixエポック秒)。
// 生のidを使うと極端に小さい数値になり、専ブラがエポック秒として誤読して「1970年」表示になる。
// Range / Last-Modified による差分取得に対応(推奨事項。専ブラの安定性に直結)。

export const dynamic = "force-dynamic";

function datKeyFromParam(raw: string): number | null {
	const m = /^(\d+)\.dat$/.exec(raw);
	if (!m) return null;
	const n = Number(m[1]);
	return Number.isFinite(n) && n > 0 ? n : null;
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
	const replies = await db.getReplies(op.id);

	// 最終更新 = 最新レスの投稿日時(レス無しならスレ立て日時)。
	const lastMs = replies.reduce(
		(latest, r) => Math.max(latest, new Date(r.createdAt).getTime()),
		new Date(op.createdAt).getTime(),
	);
	const lastModified = new Date(lastMs);

	const ifModifiedSince = request.headers.get("if-modified-since");
	if (ifModifiedSince) {
		const since = new Date(ifModifiedSince).getTime();
		if (!Number.isNaN(since) && lastMs <= since + 999) {
			return new NextResponse(null, {
				status: 304,
				headers: { "Last-Modified": lastModified.toUTCString() },
			});
		}
	}

	const title = firstLineTitle(op.content);
	const lines = [
		formatDatLine(op, true, title),
		...replies.map((r) => formatDatLine(r, false, title)),
	];
	const fullBody = utf8ToSjisBytes(lines.join(""));

	const headers = new Headers({
		"Content-Type": "text/plain; charset=Shift_JIS",
		"Last-Modified": lastModified.toUTCString(),
		"Accept-Ranges": "bytes",
	});

	const range = request.headers.get("range");
	if (range) {
		const m = /^bytes=(\d*)-(\d*)$/.exec(range);
		if (m) {
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
		}
	}

	headers.set("Content-Length", String(fullBody.byteLength));
	return new NextResponse(fullBody as BodyInit, { status: 200, headers });
}
