/**
 * unj純正スレはスレタイ(threads.title)と本文(content_text)が別入力なので食い違いうるが、
 * reze発の投稿には元々スレタイ入力欄が無い。createPost（lib/db/pg.ts）は title を空文字('')の
 * まま保存する（threads.title は NOT NULL 制約）＝「title が空＝reze発、非空＝unj発の本物の
 * スレタイ」という前提で振り分ける。
 *
 * 移行前(この空文字化より前)に作られた reze発の行だけは、本文1行目をtitleへ複製する旧ロジック
 * の名残りで title が非空のまま残っている。DBの一括移行（docs/migrations/2026-08-19-null-reze-title.sql）
 * が済むまでの保険として、title が本文1行目(64文字切り捨て)と一致する場合も「見出し無し」扱いにする。
 *
 * ⚠️ 投稿を「見出し(title) + 本文(content)」として描画する箇所は、必ずこの関数を経由すること。
 * 直接 post.title や post.content の1行目を出すと、reze発投稿で見出しと本文が二重表示される
 * （実際にタイムライン側だけ直して掲示板モードを直し忘れる、という抜けが起きた）。
 * 2026-08-19 時点の呼び出し箇所（新しい表示面を増やしたらここに追記し、getDistinctTitle を通すこと）:
 *   - components/PostContainer.tsx   … フィードの投稿カード
 *   - components/PostDetail.tsx      … 投稿個別ページ（OP・返信の両方で使用）
 *   - components/ProfileView.tsx     … プロフィールページの投稿一覧
 *   - components/BbsBoardView.tsx    … 掲示板モードのスレ一覧
 *   - components/BbsThreadView.tsx   … 掲示板モードのスレ詳細
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
