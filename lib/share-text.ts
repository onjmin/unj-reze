import { getDisplayContent } from "./mml";
import { SITE_NAME } from "./site";

/**
 * 投稿を共有するときの本文。
 * ゲーム付きの投稿はゲーム名を主役にする（リンク先でそのまま遊べるため、
 * 「何で遊べるのか」が分かるほうがクリックされやすい）。
 */
export function buildPostShareText(post: {
	content: string;
	displayName: string;
	hasGame?: boolean;
	gameTitle?: string;
}): string {
	if (post.hasGame && post.gameTitle) {
		return `「${post.gameTitle}」であそぶ | ${SITE_NAME}`;
	}
	const body = getDisplayContent(post.content).replace(/\s+/g, " ").trim();
	if (!body) return `${post.displayName}の投稿 | ${SITE_NAME}`;
	const head = body.length > 60 ? `${body.slice(0, 60)}…` : body;
	return `${head} | ${SITE_NAME}`;
}

/** ゲーム単体（/game/[id]）を共有するときの本文 */
export function buildGameShareText(title: string, cleared?: boolean): string {
	const name = title?.trim() || "ゲーム";
	if (cleared) return `「${name}」をクリアした | ${SITE_NAME}`;
	return `「${name}」であそぶ | ${SITE_NAME}`;
}
