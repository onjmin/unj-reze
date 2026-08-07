"use client";

import { Bell, Home, Mail, Search, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useScrollNav } from "@/lib/hooks/useScrollNav";

interface BottomNavProps {
	current: string;
	set: (id: string) => void;
	notifCount?: number;
	messageCount?: number;
	userAvatarUrl?: string;
	userSlug?: string;
}

const items = [
	{ id: "home", icon: Home, label: "ホーム" },
	{ id: "search", icon: Search, label: "話題を検索" },
	{ id: "notifications", icon: Bell, label: "通知" },
	{ id: "messages", icon: Mail, label: "メッセージ" },
	{ id: "profile", icon: User, label: "マイページ" },
];

export default function BottomNav({
	current,
	set,
	notifCount = 0,
	messageCount = 0,
	userAvatarUrl,
	userSlug,
}: BottomNavProps) {
	const router = useRouter();
	const badgeMap: Record<string, number> = {
		notifications: notifCount,
		messages: messageCount,
	};
	const [avatarBroken, setAvatarBroken] = useState(false);
	// 下スクロール中はフッターを畳んで本文の可視領域を広げる（上スクロール／上下端で復帰）
	const { footerHidden } = useScrollNav();
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
		if (userSlug) router.prefetch(`/user/${userSlug}`);
	}, [router, userSlug]);

	const getItemHref = (id: string) => {
		if (id === "search") return "/search";
		if (id === "profile") return userSlug ? `/user/${userSlug}` : "/";
		if (id === "notifications") return "/notifications";
		if (id === "messages") return "/messages";
		return "/";
	};

	const activeId = pendingActiveId ?? current;

	return (
		<div
			className={`flex justify-around items-center h-14 border-t border-gray-800 bg-[#0b0e14]/95 backdrop-blur pb-safe fixed bottom-0 w-full max-w-2xl z-25 transition-transform duration-200 ease-out ${footerHidden ? "translate-y-full" : "translate-y-0"}`}
			aria-hidden={footerHidden}
		>
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
						className={`flex-1 min-w-0 px-1 py-2 rounded-full flex flex-col items-center justify-center gap-0.5 transition-all ${isActive ? "text-[#a3e635]" : "text-gray-500 hover:text-gray-300"}`}
						title={item.label}
					>
						<span className="relative inline-flex">
							{showAvatar ? (
								<img
									src={userAvatarUrl}
									alt=""
									className="w-[22px] h-[22px] rounded-full object-cover border border-gray-700/50"
									onError={() => setAvatarBroken(true)}
								/>
							) : (
								<item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
							)}
							{badge > 0 && (
								<span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none shadow-lg animate-pop">
									{badge > 99 ? "99+" : badge}
								</span>
							)}
						</span>
						<span className="text-[9px] leading-none truncate max-w-full">
							{item.label}
						</span>
					</Link>
				);
			})}
		</div>
	);
}
