"use client";

import { MessageCircle, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cachePost } from "@/lib/post-cache";
import { Post } from "@/lib/types";

type MediaSort = "new" | "likes" | "dislikes";

const SORT_TABS: { id: MediaSort; label: string }[] = [
	{ id: "new", label: "新着" },
	{ id: "likes", label: "いいね順" },
	{ id: "dislikes", label: "だめね順" },
];

interface MediaGridProps {
	items: Post[];
}

export default function MediaGrid({ items }: MediaGridProps) {
	const router = useRouter();
	const [sort, setSort] = useState<MediaSort>("new");

	const sorted = useMemo(() => {
		const next = [...items];
		if (sort === "likes") next.sort((a, b) => b.likes - a.likes);
		else if (sort === "dislikes") next.sort((a, b) => b.dislikes - a.dislikes);
		else
			next.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			);
		return next;
	}, [items, sort]);

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center p-12 text-center py-20 bg-gray-900/5">
				<div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500/10 to-indigo-500/10 flex items-center justify-center mb-4 border border-blue-500/20 shadow-lg shadow-blue-500/5">
					<span className="text-2xl">🖼️</span>
				</div>
				<p className="text-sm font-bold text-gray-200">
					メディア付き投稿はまだありません。
				</p>
			</div>
		);
	}

	return (
		<div>
			<div className="flex gap-4 px-4 py-2 text-xs font-bold text-gray-500 border-b border-gray-800/60">
				{SORT_TABS.map((tab) => (
					<button
						key={tab.id}
						onClick={() => setSort(tab.id)}
						className={`pb-1 transition-colors ${sort === tab.id ? "text-gray-100 border-b-2 border-blue-500" : "hover:text-gray-300"}`}
					>
						{tab.label}
					</button>
				))}
			</div>
			<div className="grid grid-cols-3 gap-0.5">
				{sorted.map((post) => (
					<button
						key={post.id}
						onClick={() => {
							cachePost(post);
							router.push(`/post/${post.id}`);
						}}
						className="relative aspect-square bg-[#1a1b26] overflow-hidden group gimp-checkered-background-white"
					>
						<img
							src={post.imageSrc}
							alt={post.imageAlt || "ユーザーアート"}
							className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
						/>
						{post.imageSrc?.toLowerCase().includes(".gif") && (
							<span className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
								GIF
							</span>
						)}
						<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 flex items-center gap-2 text-[10px] text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">
							<span className="flex items-center gap-0.5">
								<ThumbsUp size={10} />
								{post.likes}
							</span>
							<span className="flex items-center gap-0.5">
								<ThumbsDown size={10} />
								{post.dislikes}
							</span>
							<span className="flex items-center gap-0.5">
								<MessageCircle size={10} />
								{post.repliesCount}
							</span>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}
