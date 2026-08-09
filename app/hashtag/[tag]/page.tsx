import type { Metadata } from "next";
import HashtagView from "@/components/HashtagView";
import { db as mockDb } from "@/lib/mock-db";
import { SITE_URL } from "@/lib/site";

export function generateStaticParams() {
	if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true") return [];
	const tags = new Set<string>();
	for (const p of mockDb.getPosts()) {
		const matches = p.content.match(/#[^\s#]+/g);
		if (matches) for (const m of matches) tags.add(m.slice(1));
	}
	const result = Array.from(tags).map((tag) => ({ tag }));
	return result.length > 0 ? result : [{ tag: "demo" }];
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ tag: string }>;
}): Promise<Metadata> {
	const { tag } = await params;
	let decodedTag = tag;
	try {
		decodedTag = decodeURIComponent(tag);
	} catch {}
	const title = `#${decodedTag}`;
	const description = `#${decodedTag} のハッシュタグが付いた投稿一覧`;
	return {
		title,
		description,
		alternates: { canonical: `${SITE_URL}/hashtag/${tag}` },
		openGraph: { title, description, url: `${SITE_URL}/hashtag/${tag}` },
	};
}

import AppShell from "@/components/AppShell";

export default async function HashtagPage({
	params,
}: {
	params: Promise<{ tag: string }>;
}) {
	const { tag } = await params;
	let decodedTag = tag;
	try {
		decodedTag = decodeURIComponent(tag);
	} catch {}
	return (
		<AppShell current="search">
			<HashtagView tag={decodedTag} />
		</AppShell>
	);
}
