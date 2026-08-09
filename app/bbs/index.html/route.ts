import { sjisTextResponse } from "@/lib/bbs/sjis";
import { SITE_NAME } from "@/lib/site";

// 専ブラ対応: GET /bbs/index.html
// 仕様: https://scrapbox.io/2chtypebbs/index.html
// 板一覧登録・板名表示に使われるダミーページ。<title>が板名としてChMate等に読まれる。
export async function GET() {
	const html = `<!doctype html>
<html lang="ja"><head><meta charset="Shift_JIS">
<title>${SITE_NAME}</title>
</head><body>${SITE_NAME}</body></html>
`;
	return sjisTextResponse(html, { contentType: "text/html" });
}
