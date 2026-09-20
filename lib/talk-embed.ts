import { db } from "./db";
import type { DbPost, DbTalkRecord } from "./types-db";

/** サムネイルに使うURL。保存時に解決済みの http(s) URL のみ通す（lib/mv-embed.ts と同じ）。 */
function thumbnailFromTalk(talk: DbTalkRecord): string | undefined {
	return talk.bgUrl?.startsWith("http") ? talk.bgUrl : undefined;
}

/**
 * 投稿(および返信)にひもづくかけあい動画の title/サムネイルを埋め込む。破壊的に post を更新する。
 * lib/mv-embed.ts と同じ構造。manifest 本体は絶対に載せない（docs/NEON_EGRESS.md）。
 */
export async function attachTalkInfo<
	T extends DbPost | null | (DbPost | null)[],
>(posts: T): Promise<T> {
	const list = (Array.isArray(posts) ? posts : [posts]).filter(
		(p): p is DbPost => !!p,
	);

	const ids = new Set<number>();
	const collect = (p: DbPost) => {
		if (p.talkId) ids.add(p.talkId);
		p.replies?.forEach(collect);
	};
	list.forEach(collect);
	if (ids.size === 0) return posts;

	const map = new Map<number, DbTalkRecord>();
	const idArray = [...ids];
	const talks =
		typeof db.getTalksByIds === "function"
			? await db.getTalksByIds(idArray)
			: (await Promise.all(idArray.map((id) => db.getTalk(id)))).filter(
					(t): t is DbTalkRecord => !!t,
				);
	talks.forEach((t) => {
		if (t) map.set(t.id, t);
	});

	const apply = (p: DbPost) => {
		if (p.talkId && map.has(p.talkId)) {
			const t = map.get(p.talkId)!;
			p.talkTitle = t.title;
			p.talkThumbnail = thumbnailFromTalk(t);
			p.talkPlays = t.plays ?? 0;
		}
		p.replies?.forEach(apply);
	};
	list.forEach(apply);

	return posts;
}
