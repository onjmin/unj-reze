import { attachGameInfo } from "./game-embed";
import { attachMvInfo } from "./mv-embed";
import type { DbPost } from "./types-db";

/**
 * 投稿に埋め込む「ゲーム」「MV」のメタ情報をまとめて付ける。
 *
 * どちらも該当IDを持つ投稿が1件も無ければクエリを撃たずに即返すので、
 * ゲームもMVも無いフィードでは追加コストがゼロになる。
 * manifest 本体は絶対にここへ載せない（docs/NEON_EGRESS.md）。
 */
export async function attachEmbedInfo<
	T extends DbPost | null | (DbPost | null)[],
>(posts: T): Promise<T> {
	await attachGameInfo(posts);
	await attachMvInfo(posts);
	return posts;
}
