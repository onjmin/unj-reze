"use client";

import { Loader2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { getAvatarInfo } from "@/lib/avatar";
import { cacheProfileSeed } from "@/lib/profile-cache";
import { FollowUser } from "@/lib/types";

export type FollowListTab = "followers" | "following";

interface FollowListSheetProps {
	/** 一覧の持ち主（プロフィールの表示対象） */
	userId: string;
	initialTab: FollowListTab;
	followersCount: number;
	followingCount: number;
	/** 閲覧者。各行のフォロー状態と、行内フォロー操作に使う。未ログイン相当なら省略。 */
	viewerId?: string;
	onClose: () => void;
	/** 行内フォローで閲覧者のフォロー数が変わったとき、呼び出し元のカウントを直すため。 */
	onFollowChange?: (targetSlug: string, isFollowing: boolean) => void;
}

/**
 * フォロワー / フォロー一覧のボトムシート。
 * プロフィールのカウントをタップして開き、その場でフォロー操作まで完了できるようにする。
 */
export default function FollowListSheet({
	userId,
	initialTab,
	followersCount,
	followingCount,
	viewerId,
	onClose,
	onFollowChange,
}: FollowListSheetProps) {
	const router = useRouter();
	const [tab, setTab] = useState<FollowListTab>(initialTab);
	const [users, setUsers] = useState<FollowUser[]>([]);
	const [loading, setLoading] = useState(true);
	const [pendingSlug, setPendingSlug] = useState<string | null>(null);
	// createPortal は document が要るので、マウント後だけ描画する。
	const mounted = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);

	// 開いている間は背面のフィードをスクロールさせない
	useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = prev;
		};
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	useEffect(() => {
		let cancelled = false;
		Promise.resolve().then(() => {
			if (!cancelled) setLoading(true);
		});
		const req =
			tab === "followers"
				? api.follow.getFollowers(userId, viewerId)
				: api.follow.getFollowing(userId, viewerId);
		req
			.then((r) => {
				if (!cancelled) setUsers(r.users);
			})
			.catch(() => {
				if (!cancelled) setUsers([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [tab, userId, viewerId]);

	const handleToggleFollow = async (target: FollowUser) => {
		if (!viewerId || target.isSelf || pendingSlug) return;
		const wasFollowing = !!target.isFollowing;
		setPendingSlug(target.slug);
		setUsers((prev) =>
			prev.map((u) =>
				u.slug === target.slug ? { ...u, isFollowing: !wasFollowing } : u,
			),
		);
		try {
			if (wasFollowing) await api.follow.unfollow(viewerId, target.slug);
			else await api.follow.follow(viewerId, target.slug);
			onFollowChange?.(target.slug, !wasFollowing);
		} catch {
			setUsers((prev) =>
				prev.map((u) =>
					u.slug === target.slug ? { ...u, isFollowing: wasFollowing } : u,
				),
			);
		} finally {
			setPendingSlug(null);
		}
	};

	if (!mounted) return null;

	const tabBtn = (id: FollowListTab, label: string, count: number) => {
		const active = tab === id;
		return (
			<button
				key={id}
				onClick={() => setTab(id)}
				className={`flex-1 py-3 text-xs font-bold relative transition-colors ${active ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
			>
				{label}{" "}
				<span className={active ? "text-white" : "text-gray-500"}>{count}</span>
				{active && (
					<span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-[3px] bg-[#a3e635] rounded-full" />
				)}
			</button>
		);
	};

	return createPortal(
		<div
			className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-[1px]"
			onClick={onClose}
		>
			<div
				className="bg-[#0b0e14] w-full max-w-2xl h-[82vh] rounded-t-2xl border-t border-x border-gray-800 shadow-2xl flex flex-col animate-fade-in-up"
				onClick={(e) => e.stopPropagation()}
			>
				{/* ドラッグハンドル（見た目のみ。閉じるのは背面タップ/Esc） */}
				<div
					className="pt-2.5 pb-1 shrink-0 flex justify-center cursor-pointer"
					onClick={onClose}
				>
					<span className="w-10 h-1 rounded-full bg-gray-700" />
				</div>

				<div className="flex border-b border-gray-800 shrink-0">
					{tabBtn("followers", "フォロワー", followersCount)}
					{tabBtn("following", "フォロー", followingCount)}
				</div>

				<div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-gray-800/60">
					{loading ? (
						<div className="p-10 flex justify-center text-gray-600">
							<Loader2 size={18} className="animate-spin" />
						</div>
					) : users.length === 0 ? (
						<div className="p-12 text-center text-xs text-gray-600 flex flex-col items-center gap-2">
							<Users size={24} className="text-gray-700" />
							<span>
								{tab === "followers"
									? "フォロワーはまだいません"
									: "まだ誰もフォローしていません"}
							</span>
						</div>
					) : (
						users.map((u) => {
							const info = getAvatarInfo(u.displayName);
							const isPending = pendingSlug === u.slug;
							return (
								<div
									key={u.slug}
									onClick={() => {
										cacheProfileSeed({
											slug: u.slug,
											displayName: u.displayName,
											avatarUrl: u.avatarUrl,
										});
										onClose();
										router.push(`/user/${u.slug}`);
									}}
									className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-100/5 transition-colors"
								>
									<div
										className="w-9 h-9 rounded-full shrink-0 border border-gray-700/50 flex items-center justify-center overflow-hidden"
										style={u.avatarUrl ? undefined : info.style}
									>
										{u.avatarUrl ? (
											<img
												src={u.avatarUrl}
												alt={info.username}
												className="w-full h-full object-cover"
											/>
										) : (
											<info.Icon className="w-5 h-5 text-white/40" />
										)}
									</div>
									<span className="flex-1 min-w-0 text-xs font-bold text-gray-200 truncate">
										{info.username}
									</span>
									{viewerId && !u.isSelf && (
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleToggleFollow(u);
											}}
											disabled={isPending}
											className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-colors disabled:opacity-50 ${
												u.isFollowing
													? "border-gray-700 text-gray-300 hover:border-red-500 hover:text-red-400"
													: "border-gray-600 text-white hover:bg-gray-100/10"
											}`}
										>
											{u.isFollowing ? "フォロー中" : "フォロー"}
										</button>
									)}
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>,
		document.body,
	);
}
