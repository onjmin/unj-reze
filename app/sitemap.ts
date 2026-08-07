import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { db as mockDb } from "@/lib/mock-db";
import { SITE_URL } from "@/lib/site";
import { encodeId, encodePost } from "@/lib/sqids";

// SSRモードでは投稿一覧が頻繁に変わるため、ビルド時にDBへ接続してプリレンダリングせず
// リクエスト時に生成する（output: "export" 時は Next.js が自動的に静的化するため無害）
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
	const posts = isStaticExport ? mockDb.getPosts() : await db.getPosts();

	const staticEntries: MetadataRoute.Sitemap = [
		{ url: SITE_URL, changeFrequency: "always", priority: 1 },
		{ url: `${SITE_URL}/terms`, changeFrequency: "monthly", priority: 0.5 },
		{ url: `${SITE_URL}/privacy`, changeFrequency: "monthly", priority: 0.5 },
		{ url: `${SITE_URL}/cookies`, changeFrequency: "monthly", priority: 0.5 },
		{
			url: `${SITE_URL}/accessibility`,
			changeFrequency: "monthly",
			priority: 0.5,
		},
	];

	const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
		url: `${SITE_URL}/post/${encodePost(post).id}`,
		lastModified: post.createdAt,
		changeFrequency: "hourly",
		priority: 0.7,
	}));

	// 投稿だけでなく、ゲーム単独ページ・ハッシュタグ・ユーザーページも回遊/検索の入口になる。
	// 静的エクスポートではこれらのデータが無いので投稿だけにしておく。
	let gameEntries: MetadataRoute.Sitemap = [];
	let hashtagEntries: MetadataRoute.Sitemap = [];
	let userEntries: MetadataRoute.Sitemap = [];

	if (!isStaticExport) {
		try {
			const games = await db.listTopGames(50);
			gameEntries = games.map((game) => ({
				url: `${SITE_URL}/game/${encodeId(game.id)}`,
				lastModified: game.createdAt,
				changeFrequency: "weekly",
				priority: 0.8,
			}));
		} catch {
			/* ゲームが取れなくてもサイトマップ自体は返す */
		}

		try {
			const trends = await db.getTrends();
			hashtagEntries = trends.slice(0, 50).map((trend) => ({
				url: `${SITE_URL}/hashtag/${encodeURIComponent(trend.keyword.replace(/^#/, ""))}`,
				changeFrequency: "daily",
				priority: 0.5,
			}));
		} catch {
			/* noop */
		}

		const slugs = new Set<string>();
		for (const post of posts) {
			const slug = post.slug || post.displayName;
			if (slug) slugs.add(slug);
		}
		userEntries = [...slugs].slice(0, 100).map((slug) => ({
			url: `${SITE_URL}/user/${encodeURIComponent(slug)}`,
			changeFrequency: "daily",
			priority: 0.4,
		}));
	}

	return [
		...staticEntries,
		...postEntries,
		...gameEntries,
		...hashtagEntries,
		...userEntries,
	];
}
