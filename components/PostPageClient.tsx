"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PostDetail from "@/components/PostDetail";
import { api } from "@/lib/api";
import { getDisplayContent } from "@/lib/mml";
import { cachePost, readCachedPost } from "@/lib/post-cache";
import { SITE_URL } from "@/lib/site";
import type { Post } from "@/lib/types";

interface PostPageClientProps {
	id: string;
}

/**
 * /post/[id] の本体描画。page.tsx はサーバー側で投稿データを待たない
 * （generateMetadata 以外は id の妥当性チェックのみ）ので、投稿の取得と
 * 表示はすべてここ＝クライアント側で行う。
 *
 * 1. まず sessionStorage のキャッシュ（一覧から遷移した場合に post-cache.ts が
 *    置いたもの）があれば即描画する。
 * 2. 裏で最新データを fetch し、成功したら差し替える。
 * 3. fetch が失敗しても（サーバー障害等）、キャッシュ表示があればそのまま維持する
 *    ＝ネットワークが死んでいても直前まで一覧で見えていた内容は壊さない。
 */
export default function PostPageClient({ id }: PostPageClientProps) {
	const [post, setPost] = useState<Post | null>(null);
	const [notFound, setNotFound] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const cached = readCachedPost(id);
		if (cached) Promise.resolve().then(() => !cancelled && setPost(cached));

		api.posts
			.get(id)
			.then((fresh) => {
				if (cancelled) return;
				cachePost(fresh);
				setPost(fresh);
			})
			.catch(() => {
				if (cancelled) return;
				// キャッシュが無ければ本当に見られない＝見つからない扱いにする。
				// キャッシュがあれば何もせず、直前のスナップショット表示のまま留める。
				if (!cached) setNotFound(true);
			});

		return () => {
			cancelled = true;
		};
	}, [id]);

	useEffect(() => {
		if (!post) return;
		// JSON-LD はサーバー側の待ちを増やさないよう、データが揃った時点で
		// クライアントから注入する（構造化データはあくまで付加情報のため）。
		const script = document.createElement("script");
		script.type = "application/ld+json";
		script.text = JSON.stringify({
			"@context": "https://schema.org",
			"@type": "DiscussionForumPosting",
			headline:
				post.hasGame && post.gameTitle
					? post.gameTitle
					: `${post.displayName}の投稿`,
			text: getDisplayContent(post.content),
			url: `${SITE_URL}/post/${id}`,
			datePublished: post.createdAt,
			dateModified: post.createdAt,
			author: { "@type": "Person", name: post.displayName },
			...(post.hasImage && post.imageSrc ? { image: post.imageSrc } : {}),
			interactionStatistic: [
				{
					"@type": "InteractionCounter",
					interactionType: "https://schema.org/LikeAction",
					userInteractionCount: post.likes,
				},
				{
					"@type": "InteractionCounter",
					interactionType: "https://schema.org/ReplyAction",
					userInteractionCount: post.repliesCount,
				},
			],
		});
		document.head.appendChild(script);
		return () => {
			document.head.removeChild(script);
		};
	}, [post, id]);

	if (notFound) {
		return (
			<div className="bg-[#0b0e14] text-gray-100 min-h-dvh flex flex-col items-center justify-center space-y-3">
				<p className="text-gray-500 text-sm">投稿が見つかりません</p>
				<Link href="/" className="text-blue-400 text-xs hover:underline">
					戻る
				</Link>
			</div>
		);
	}

	if (!post) {
		return (
			<div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col items-center justify-center">
				<style>{`@keyframes post-page-spin{to{transform:rotate(360deg)}}`}</style>
				<div
					className="w-6 h-6 rounded-full border-2 border-gray-700"
					style={{
						borderTopColor: "transparent",
						animation: "post-page-spin .6s linear infinite",
					}}
				/>
			</div>
		);
	}

	return (
		<div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col">
			<div className="w-full max-w-2xl mx-auto border-x border-gray-800 flex-1 flex flex-col">
				<PostDetail post={post} />
			</div>
		</div>
	);
}
