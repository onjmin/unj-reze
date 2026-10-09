import { db } from "@/lib/db";
import type { AnonymousUser } from "@/lib/types";

/**
 * 投稿に添付する作品（ゲーム/MV/かけあい動画/音MAD）が、投稿者本人の作ったものか。
 *
 * 作品IDは公開情報（投稿の埋め込みに出る）なので、確認しないと他人の作品を自分の投稿に
 * 付けられてしまう。付けた投稿を消すと orphanedManifestRefsOf（lib/db/pg.ts）が
 * 「他に参照が無い作品」として作品行と R2 の manifest まで消しにいくので、
 * 元の投稿が消えた後なら他人の作品を丸ごと消せることにもなる。
 *
 * 作品の作成（POST /api/games 等）は resolveOrCreateSessionUser で作者を必ず埋めるので、
 * creator が空の行は作成時に身元が取れなかった古い行だけ。誰のものか判断できないので
 * 添付は拒否する（既に投稿に付いている分はそのまま表示される）。
 *
 * 問題が無ければ null、あればエラーメッセージを返す。
 */
export async function workOwnershipError(
	user: AnonymousUser,
	ids: {
		gameId?: number;
		mvId?: number;
		talkId?: number;
		otomadId?: number;
	},
): Promise<string | null> {
	const checks: [string, number | undefined, (id: number) => Promise<{ creatorSlug?: string } | null>][] = [
		["game", ids.gameId, (id) => db.getGame(id)],
		["mv", ids.mvId, (id) => db.getMv(id)],
		["talk", ids.talkId, (id) => db.getTalk(id)],
		["otomad", ids.otomadId, (id) => db.getOtomad(id)],
	];
	for (const [label, id, load] of checks) {
		if (id == null) continue;
		const work = await load(id);
		if (!work) return `${label} not found`;
		if (!work.creatorSlug || work.creatorSlug !== user.slug)
			return `${label} is not yours`;
	}
	return null;
}
