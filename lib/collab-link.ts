import type { Post } from "./types";

/**
 * 「コラボ／改造」はコンポーザ＋各種エディタが載っている画面でしか完結しない。
 * ハッシュタグ/検索/プロフィールの一覧はそれらを持たないので（`openMml` や
 * `openGame` も同じ理由でno-opになっている）、コラボだけはポスト詳細へ委譲する。
 *
 * コラボの成果物は元ポストへの返信として投稿されるので、着地点としても
 * スレッド＝ポスト詳細が正しい。飛んだ先で PostDetail がこのクエリを見て
 * コラボ導線を自動で開く。
 */
export const COLLAB_QUERY_PARAM = "collab";

/** 一覧画面のコラボボタンの遷移先。`post` 自身をコラボ相手にする。 */
export function collabHref(post: Pick<Post, "id">): string {
	return `/post/${post.id}?${COLLAB_QUERY_PARAM}=1`;
}
