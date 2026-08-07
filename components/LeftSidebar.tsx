"use client";

import {
	Bell,
	Home,
	Link2,
	Mail,
	PenSquare,
	Search,
	Settings,
	User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface LeftSidebarProps {
	current: string;
	set: (id: string) => void;
	notifCount?: number;
	messageCount?: number;
	userAvatarUrl?: string;
	userSlug?: string;
	onPost: () => void;
}

const items = [
	{ id: "home", icon: Home, label: "ホーム" },
	{ id: "search", icon: Search, label: "話題を検索" },
	{ id: "notifications", icon: Bell, label: "通知" },
	{ id: "messages", icon: Mail, label: "メッセージ" },
	{ id: "profile", icon: User, label: "マイページ" },
	{ id: "links", icon: Link2, label: "リンク" },
	{ id: "settings", icon: Settings, label: "設定とプライバシー" },
];

export default function LeftSidebar({
	current,
	set,
	notifCount = 0,
	messageCount = 0,
	userAvatarUrl,
	userSlug,
	onPost,
}: LeftSidebarProps) {
	const router = useRouter();
	const badgeMap: Record<string, number> = {
		notifications: notifCount,
		messages: messageCount,
	};
	const [avatarBroken, setAvatarBroken] = useState(false);
	const [pendingActiveId, setPendingActiveId] = useState<string | null>(null);
	// current（実際のアクティブタブ）が変わったら、楽観的表示用の pendingActiveId をリセットする。
	// レンダー中の条件付き setState（Reactが公式に認める「propが変わったらstateを調整する」パターン）。
	const [prevCurrent, setPrevCurrent] = useState(current);
	if (current !== prevCurrent) {
		setPrevCurrent(current);
		setPendingActiveId(null);
	}

	useEffect(() => {
		router.prefetch("/");
		router.prefetch("/search");
		router.prefetch("/notifications");
		router.prefetch("/messages");
		router.prefetch("/links");
		router.prefetch("/settings");
		if (userSlug) router.prefetch(`/user/${userSlug}`);
	}, [router, userSlug]);

	const getItemHref = (id: string) => {
		if (id === "search") return "/search";
		if (id === "profile") return userSlug ? `/user/${userSlug}` : "/";
		if (id === "settings") return "/settings";
		if (id === "notifications") return "/notifications";
		if (id === "messages") return "/messages";
		if (id === "links") return "/links";
		return "/";
	};

	const activeId = pendingActiveId ?? current;

	return (
		<div className="hidden md:flex flex-col justify-between w-17 xl:w-64 sticky top-0 h-screen shrink-0 px-2 xl:px-3 py-4 border-r border-gray-800 select-none">
			<div className="flex flex-col gap-1">
				{items.map((item) => {
					const isActive = activeId === item.id;
					const badge = badgeMap[item.id] || 0;
					const showAvatar =
						item.id === "profile" && !!userAvatarUrl && !avatarBroken;
					const href = getItemHref(item.id);

					return (
						<Link
							key={item.id}
							href={href}
							prefetch={true}
							onClick={() => {
								setPendingActiveId(item.id);
								if (item.id === "home") set("home");
							}}
							className={`flex items-center gap-4 px-3 py-3 rounded-full transition-all w-fit xl:w-full ${isActive ? "text-[#a3e635]" : "text-gray-300 hover:text-white"} hover:bg-white/10`}
							title={item.label}
						>
							<span className="relative inline-flex shrink-0">
								{showAvatar ? (
									<img
										src={userAvatarUrl}
										alt=""
										className="w-6 h-6 rounded-full object-cover border border-gray-700/50"
										onError={() => setAvatarBroken(true)}
									/>
								) : (
									<item.icon size={26} strokeWidth={isActive ? 2.5 : 2} />
								)}
								{badge > 0 && (
									<span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none shadow-lg">
										{badge > 99 ? "99+" : badge}
									</span>
								)}
							</span>
							<span className="hidden xl:inline text-lg truncate">
								{item.label}
							</span>
						</Link>
					);
				})}
			</div>

			<button
				onClick={onPost}
				className="flex items-center justify-center gap-2 bg-[#a3e635] hover:bg-[#bef264] text-black font-bold rounded-full h-12 w-12 xl:w-full transition-colors"
				title="ポストする"
			>
				<PenSquare size={20} className="xl:hidden" />
				<span className="hidden xl:inline">ポストする</span>
			</button>
		</div>
	);
}
