import { db } from "@/lib/db";
import type { DbPost, DbOtomadRecord } from "@/lib/types-db";

/** サムネイルに使うURL。保存時に解決済みの http(s) URL のみ通す（lib/talk/talk-embed.ts と同じ）。 */
function thumbnailFromOtomad(otomad: DbOtomadRecord): string | undefined {
	return otomad.bgUrl?.startsWith("http") ? otomad.bgUrl : undefined;
}

/**
 * 投稿(および返信)にひもづく音MADの title/サムネイルを埋め込む。破壊的に post を更新する。
 * lib/talk/talk-embed.ts と同じ構造。manifest 本体は絶対に載せない（docs/NEON_EGRESS.md）。
 */
export async function attachOtomadInfo<
	T extends DbPost | null | (DbPost | null)[],
>(posts: T): Promise<T> {
	const list = (Array.isArray(posts) ? posts : [posts]).filter(
		(p): p is DbPost => !!p,
	);

	const ids = new Set<number>();
	const collect = (p: DbPost) => {
		if (p.otomadId) ids.add(p.otomadId);
		p.replies?.forEach(collect);
	};
	list.forEach(collect);
	if (ids.size === 0) return posts;

	const map = new Map<number, DbOtomadRecord>();
	const idArray = [...ids];
	const otomads =
		typeof db.getOtomadsByIds === "function"
			? await db.getOtomadsByIds(idArray)
			: (await Promise.all(idArray.map((id) => db.getOtomad(id)))).filter(
					(t): t is DbOtomadRecord => !!t,
				);
	otomads.forEach((t) => {
		if (t) map.set(t.id, t);
	});

	const apply = (p: DbPost) => {
		if (p.otomadId && map.has(p.otomadId)) {
			const t = map.get(p.otomadId)!;
			p.otomadTitle = t.title;
			p.otomadThumbnail = thumbnailFromOtomad(t);
			p.otomadPlays = t.plays ?? 0;
		}
		p.replies?.forEach(apply);
	};
	list.forEach(apply);

	return posts;
}
