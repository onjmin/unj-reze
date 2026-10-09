import type { Post } from "@/lib/types";

/**
 * 削除した投稿の本文。サーバーは投稿（スレの OP・レス）を消すと行と番号を残したまま本文をこれに差し替え、
 * 添付を全部外す（lib/db/pg.ts / mock-db.ts の DELETED_POST_TEXT と同じ値）。
 */
export const DELETED_POST_TEXT = "(削除されました)";

/** サーバーが残した削除済みのプレースホルダか。編集（PATCH）は 404 になるので、UI は編集の導線を出さない */
export function isDeletedPlaceholder(post: Post): boolean {
	return (
		post.content === DELETED_POST_TEXT &&
		!post.hasImage &&
		!post.hasMml &&
		!post.hasGame &&
		!post.hasMv &&
		!post.hasTalk &&
		!post.hasOtomad
	);
}

/**
 * 削除に成功した投稿を、サーバーと同じプレースホルダに置き換えた写し。
 * 一覧から抜くと、再読み込みでプレースホルダとして戻ってきて食い違う。
 */
export function toDeletedPlaceholder(post: Post): Post {
	return {
		...post,
		content: DELETED_POST_TEXT,
		hasImage: false,
		imageSrc: undefined,
		hasMml: false,
		mmlUrl: undefined,
		hasGame: false,
		gameId: undefined,
		hasMv: false,
		mvId: undefined,
		hasTalk: false,
		talkId: undefined,
		hasOtomad: false,
		otomadId: undefined,
		dotW: undefined,
		dotH: undefined,
		animFrames: undefined,
		animFps: undefined,
		walkPreset: undefined,
	};
}
