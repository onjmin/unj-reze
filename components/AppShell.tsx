"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import {
	countUnreadMessages,
	MESSAGES_READ_EVENT,
	NOTIFICATIONS_READ_EVENT,
} from "@/lib/read-state";
import BottomNav from "./BottomNav";
import LeftSidebar from "./LeftSidebar";
import RightSidebar from "./RightSidebar";
import ScrollJumpControls from "./ScrollJumpControls";

interface AppShellProps {
	/** LeftSidebar / BottomNav のどの項目をハイライトするか（例: 'settings'） */
	current: string;
	children: React.ReactNode;
}

/** 設定/通知/メッセージ/検索/リンク/プロフィールなど、独立ルート化した各ページで
 * PC版の左右サイドメニューおよびモバイル版のボトムナビを共通描画するためのシェル。 */
export default function AppShell({ current, children }: AppShellProps) {
	const router = useRouter();
	const currentUser = useCurrentUser();
	const [notifCount, setNotifCount] = useState(0);
	const [messageCount, setMessageCount] = useState(0);
	/**
	 * 既読化が済んだかどうか。
	 * 通知画面を直接開くと、こちらの件数取得と画面側の既読化が同時に走る。
	 * 取得リクエストの方が既読化より先にサーバーへ届くと「0にした直後に古い件数で上書き」され、
	 * バッジが消えないまま残る。既読を受け取ったあとは、飛行中の取得結果を捨てる。
	 */
	const notifsClearedRef = useRef(false);
	const messagesClearedRef = useRef(false);

	useEffect(() => {
		const userSlug = currentUser?.slug;
		if (!userSlug) return;
		notifsClearedRef.current = false;
		messagesClearedRef.current = false;
		api.notifications
			.unreadCount(userSlug)
			.then(({ count }) => {
				if (!notifsClearedRef.current) setNotifCount(count);
			})
			.catch(() => {});
		api.messages
			.list(userSlug)
			.then((msgs) => {
				if (!messagesClearedRef.current)
					setMessageCount(
						countUnreadMessages(
							msgs,
							currentUser?.displayName || userSlug,
						),
					);
			})
			.catch(() => {});
	}, [currentUser?.slug, currentUser?.displayName]);

	// メッセージ／通知が既読になったらバッジを即座に落とす。
	useEffect(() => {
		const clearMessages = () => {
			messagesClearedRef.current = true;
			setMessageCount(0);
		};
		const clearNotifs = () => {
			notifsClearedRef.current = true;
			setNotifCount(0);
		};
		window.addEventListener(MESSAGES_READ_EVENT, clearMessages);
		window.addEventListener(NOTIFICATIONS_READ_EVENT, clearNotifs);
		return () => {
			window.removeEventListener(MESSAGES_READ_EVENT, clearMessages);
			window.removeEventListener(NOTIFICATIONS_READ_EVENT, clearNotifs);
		};
	}, []);

	const handleOuterWheel = (e: React.WheelEvent<HTMLDivElement>) => {
		const scrollable = document.getElementById("scrollable-content");
		if (!scrollable) return;
		const rightSidebar = document.getElementById("right-sidebar");
		if (rightSidebar && rightSidebar.contains(e.target as Node)) {
			return;
		}
		if (!scrollable.contains(e.target as Node)) {
			scrollable.scrollTop += e.deltaY;
		}
	};

	return (
		<div
			className="bg-[#0b0e14] text-gray-100 min-h-screen w-full flex justify-center select-none font-sans"
			onWheel={handleOuterWheel}
		>
			<LeftSidebar
				current={current}
				set={(id) => {
					if (id === "home") router.push("/");
				}}
				notifCount={notifCount}
				messageCount={messageCount}
				userAvatarUrl={currentUser?.avatarUrl}
				userSlug={currentUser?.slug}
				onPost={() => router.push("/")}
			/>
			<div className="relative w-full max-w-2xl border-x border-gray-800 flex flex-col shrink-0">
				<div
					id="scrollable-content"
					className="flex-1 scrollbar-none flex flex-col min-h-0 pb-14 md:pb-0"
				>
					{children}
				</div>
				<ScrollJumpControls />
				<BottomNav
					current={current}
					set={(id) => {
						if (id === "home") router.push("/");
					}}
					notifCount={notifCount}
					messageCount={messageCount}
					userAvatarUrl={currentUser?.avatarUrl}
					userSlug={currentUser?.slug}
				/>
			</div>
			<RightSidebar
				onSearch={(q) => router.push(`/search?q=${encodeURIComponent(q)}`)}
			/>
		</div>
	);
}
