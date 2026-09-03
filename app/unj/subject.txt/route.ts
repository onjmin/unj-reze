import type { NextRequest } from "next/server";
import { datKeyOf, formatSubjectLine, titleOf } from "@/lib/bbs/format";
import { sjisTextResponse } from "@/lib/bbs/sjis";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";

// 専ブラ対応: GET /unj/subject.txt
// 板ID("unj" = board_id:1 うんでも実況J。C:\_own\git\_users\onjmin\unj\src\common\request\board.ts 参照)配下に配置。
// 仕様: https://scrapbox.io/2chtypebbs/subject.txt
// 行数が極端に多いと落ちる専ブラがある(twinkle等)ので上限を切る。
const MAX_THREADS = 300;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	return await withEdgeCache(
		request,
		{ sMaxAge: 10, personalized: false },
		async () => {
			// レス数は threads.res_count 由来の repliesCount で足りる。返信本文は
			// 1行も使わないので引かせない（300スレ×20返信を読んで捨てていた）。
			const posts = await db.getPosts(undefined, {
				limit: MAX_THREADS,
				withReplies: false,
			});
			const body = posts
				.map((p) =>
					formatSubjectLine(
						datKeyOf(p),
						titleOf(p),
						p.repliesCount + 1,
					),
				)
				.join("");
			return sjisTextResponse(body);
		},
	);
}
