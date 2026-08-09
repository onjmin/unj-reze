import type { NextRequest } from "next/server";
import { firstLineTitle, formatSubjectLine } from "@/lib/bbs/format";
import { sjisTextResponse } from "@/lib/bbs/sjis";
import { db } from "@/lib/db";
import { withEdgeCache } from "@/lib/edge-cache";

// 専ブラ対応: GET /bbs/subject.txt
// 仕様: https://scrapbox.io/2chtypebbs/subject.txt
// 行数が極端に多いと落ちる専ブラがある(twinkle等)ので上限を切る。
const MAX_THREADS = 300;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	return await withEdgeCache(
		request,
		{ sMaxAge: 10, personalized: false },
		async () => {
			const posts = await db.getPosts(undefined, { limit: MAX_THREADS });
			const body = posts
				.map((p) =>
					formatSubjectLine(
						p.id,
						firstLineTitle(p.content),
						p.repliesCount + 1,
					),
				)
				.join("");
			return sjisTextResponse(body);
		},
	);
}
