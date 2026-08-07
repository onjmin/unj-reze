import type { Post } from "./types";

/**
 * カウンタ更新API（いいね／低評価／ハート／リポスト）のレスポンスを既存の投稿へ反映する。
 *
 * これらのAPIは Neon の転送量を抑えるためスレッドの返信を読み直さない（`replies` は常に空配列）。
 * レスポンスでそのまま置き換えると、画面に出ていた返信が消えてしまうので、
 * サーバーが返信を返さなかった場合は手元の `replies` / `repliesCount` を維持する。
 *
 * リポストAPIは以前から `replies: []` を返しており、この関数を通さない置き換えは
 * 返信が消えるバグになっていた。
 */
export function mergePostCounters(prev: Post, updated: Post): Post {
	const keepReplies = !updated.replies || updated.replies.length === 0;
	return {
		...prev,
		...updated,
		replies: keepReplies ? prev.replies : updated.replies,
		repliesCount: keepReplies ? prev.repliesCount : updated.repliesCount,
	};
}
