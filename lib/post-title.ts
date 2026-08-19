/**
 * unj純正スレはスレタイ(threads.title)と本文(content_text)が別入力なので食い違いうるが、
 * reze発の投稿には元々スレタイ入力欄が無い。createPost（lib/db/pg.ts）は title を NULL の
 * まま保存する＝「title が空＝reze発、非空＝unj発の本物のスレタイ」という前提で振り分ける。
 *
 * 移行前(このtitle=NULL化より前)に作られた reze発の行だけは、本文1行目をtitleへ複製する
 * 旧ロジックの名残りで title が非空のまま残っている。DBの一括移行(NULLへのUPDATE)が済むまでの
 * 保険として、title が本文1行目(64文字切り捨て)と一致する場合も「見出し無し」扱いにする。
 */
export function getDistinctTitle(post: {
	title?: string;
	content: string;
}): string | null {
	const title = (post.title || "").trim();
	if (!title) return null;
	const firstLine = (post.content || "").split(/\r\n|\r|\n/)[0].trim();
	if (title === firstLine.slice(0, 64)) return null;
	return title;
}
