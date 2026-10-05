"use client";

import { Image as ImageIcon, MessageCircle, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useLoadMoreSentinel } from "@/lib/hooks/useLoadMoreSentinel";
import type { MediaSearchPost } from "@/lib/types";
import SpriteImage from "@/components/assets/SpriteImage";

const PAGE_SIZE = 48;

type MediaSort = "new" | "likes" | "dislikes";

const SORT_TABS: { id: MediaSort; label: string }[] = [
	{ id: "new", label: "新着" },
	{ id: "likes", label: "いいね順" },
	{ id: "dislikes", label: "だめね順" },
];

interface MediaGridProps {
	userId?: string;
}

/**
 * タイムラインの「メディア」欄。フィードに読み込み済みの投稿（最新ページ＋返信の窓）から
 * 拾うと過去の画像が出ないので、軽量な /api/media-search を created_at の
 * カーソル（before）で遡って引く。いいね順・だめね順は読み込んだぶんの中での並べ替え。
 */
export default function MediaGrid({ userId }: MediaGridProps) {
	const router = useRouter();
	const [sort, setSort] = useState<MediaSort>("new");
	const [items, setItems] = useState<MediaSearchPost[]>([]);
	const [hasMore, setHasMore] = useState(true);
	const [loading, setLoading] = useState(false);
	const [failed, setFailed] = useState(false);
	const loadingRef = useRef(false);
	const sentinelRef = useRef<HTMLDivElement>(null);

	const loadMore = useCallback(async () => {
		if (loadingRef.current) return;
		loadingRef.current = true;
		setLoading(true);
		setFailed(false);
		try {
			const before = items.at(-1)?.createdAt;
			const res = await api.search.media(
				"image",
				"",
				userId,
				PAGE_SIZE,
				0,
				before,
			);
			setItems((prev) => {
				const seen = new Set(prev.map((p) => p.id));
				return [
					...prev,
					...res.posts.filter((p) => p.imageSrc && !seen.has(p.id)),
				];
			});
			// 1件も進まないなら打ち切る（同時刻の投稿でカーソルが止まるのを防ぐ）。
			setHasMore(res.hasMore && res.posts.length > 0);
		} catch (err) {
			console.error("メディアの読み込みに失敗", err);
			setFailed(true);
		} finally {
			loadingRef.current = false;
			setLoading(false);
		}
	}, [items, userId]);

	// 初回
	const loadMoreRef = useRef(loadMore);
	useEffect(() => {
		loadMoreRef.current = loadMore;
	});
	useEffect(() => {
		void loadMoreRef.current();
	}, []);

	// 失敗したら自動では引き直さない（下の「再試行」から）。張り直しで連打になるため。
	useLoadMoreSentinel({
		sentinelRef,
		onLoadMore: () => void loadMore(),
		hasMore: hasMore && !failed,
		loading,
		rearmKey: items.length,
	});

	const sorted = useMemo(() => {
		const next = [...items];
		if (sort === "likes")
			next.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
		else if (sort === "dislikes")
			next.sort((a, b) => (b.dislikes ?? 0) - (a.dislikes ?? 0));
		return next;
	}, [items, sort]);

	if (items.length === 0 && loading) {
		return (
			<div className="flex justify-center py-12">
				<Loader2 className="text-gray-500 animate-spin" size={20} />
			</div>
		);
	}

	if (items.length === 0 && !failed) {
		return (
			<div className="flex flex-col items-center justify-center p-12 text-center py-20 bg-gray-900/5">
				<div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500/10 to-indigo-500/10 flex items-center justify-center mb-4 border border-blue-500/20 shadow-lg shadow-blue-500/5">
					<ImageIcon className="w-7 h-7 text-blue-400" />
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
						onClick={() => router.push(`/post/${post.id}`)}
						className="relative aspect-square bg-[#1a1b26] overflow-hidden group gimp-checkered-background-white"
					>
						<SpriteImage
							src={post.imageSrc}
							alt={post.imageAlt || "ユーザーアート"}
							className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
						fit="cover"
							animFrames={post.animFrames}
							animFps={post.animFps}
							walkPreset={post.walkPreset}
						/>
						{(post.imageSrc?.toLowerCase().includes(".gif") ||
							post.imageSrc?.toLowerCase().startsWith("data:image/gif")) && (
							<span className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
								GIF
							</span>
						)}
						{!post.walkPreset && post.animFrames && post.animFrames > 1 && (
							<span className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
								ANIM
							</span>
						)}
						{post.walkPreset && (
							<span className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
								歩行
							</span>
						)}
						<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 flex items-center gap-2 text-[10px] text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">
							<span className="flex items-center gap-0.5">
								<ThumbsUp size={10} />
								{post.likes ?? 0}
							</span>
							<span className="flex items-center gap-0.5">
								<ThumbsDown size={10} />
								{post.dislikes ?? 0}
							</span>
							<span className="flex items-center gap-0.5">
								<MessageCircle size={10} />
								{post.repliesCount ?? 0}
							</span>
						</div>
					</button>
				))}
			</div>
			{failed ? (
				<div className="p-6 text-center">
					<button
						onClick={() => void loadMore()}
						className="text-xs font-bold text-blue-400 hover:text-blue-300"
					>
						読み込みに失敗しました。再試行
					</button>
				</div>
			) : hasMore ? (
				<div
					ref={sentinelRef}
					className="p-6 text-center bg-gray-900/10 flex items-center justify-center space-x-2"
				>
					<Loader2 className="animate-spin text-blue-500" size={16} />
					<span className="text-xs text-gray-400 font-bold">
						自動読み込み中…
					</span>
				</div>
			) : (
				<div className="p-8 text-center text-xs text-gray-600 bg-gray-900/10">
					すべて表示されました 🌱
				</div>
			)}
		</div>
	);
}
