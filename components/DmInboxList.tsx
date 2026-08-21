"use client";

import { MessageSquare, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getAvatarInfo } from "@/lib/avatar";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { markMessagesSeen } from "@/lib/read-state";
import { chUser } from "@/lib/realtime/channels";
import { getRealtimeClient } from "@/lib/realtime/client";

interface DmInboxListProps {
	userId?: string;
}

type MsgItem = {
	id: number;
	sender: string;
	text: string;
	recipient?: string;
	time: string;
};

/**
 * DM受信箱一覧。相手ごとに直近メッセージをプレビュー表示し、
 * タップしたら /messages/[slug]（DmThreadView）へ遷移する。
 * スレッド表示そのものはここでは持たない（DmThreadViewと二重実装しない）。
 */
export default function DmInboxList({ userId }: DmInboxListProps) {
	const router = useRouter();
	const me = useCurrentUser();
	const [messages, setMessages] = useState<MsgItem[]>([]);
	const [isStartingNew, setIsStartingNew] = useState(false);
	const [newRecipientInput, setNewRecipientInput] = useState("");

	const currentSender = userId || me?.slug || me?.displayName || "名無し";

	const myIdentifiers = useMemo(
		() =>
			new Set(
				[userId, me?.slug, me?.displayName, me?.id].filter(Boolean) as string[],
			),
		[userId, me?.slug, me?.displayName, me?.id],
	);

	const isMine = useCallback(
		(m: MsgItem) => myIdentifiers.has(m.sender),
		[myIdentifiers],
	);
	const getPartner = useCallback(
		(m: MsgItem) => (isMine(m) ? m.recipient : m.sender),
		[isMine],
	);

	useEffect(() => {
		if (!currentSender) return;
		api.messages.list(currentSender).then((msgs) => {
			setMessages(msgs);
			markMessagesSeen(msgs);
		});
	}, [currentSender]);

	// リアルタイム受信。プレビュー/並び順を最新に保つだけで、スレッド表示は行わない。
	useEffect(() => {
		const client = getRealtimeClient();
		if (!client || !currentSender) return;
		const channelsToSub = Array.from(
			new Set(Array.from(myIdentifiers).map(chUser)),
		);
		const unsubChannel = client.subscribe(channelsToSub);
		const unsubHandler = client.addHandler((msg) => {
			if (
				msg.t === "event" &&
				channelsToSub.includes(msg.channel) &&
				msg.event === "message.created"
			) {
				const data = msg.data as MsgItem;
				if (data?.id) {
					setMessages((prev) => {
						if (prev.some((m) => m.id === data.id)) return prev;
						const updated = [data, ...prev];
						markMessagesSeen(updated);
						return updated;
					});
				}
			}
		});
		return () => {
			unsubChannel();
			unsubHandler();
		};
	}, [currentSender, myIdentifiers]);

	// 相手ごとに直近1件だけ残す（messagesは新しい順なので最初に出た方が最新）。
	const previews = useMemo(() => {
		const seen = new Set<string>();
		const result: MsgItem[] = [];
		for (const m of messages) {
			const p = getPartner(m);
			if (!p || seen.has(p)) continue;
			seen.add(p);
			result.push(m);
		}
		return result;
	}, [messages, getPartner]);

	const openThread = (partner: string) => {
		if (!partner) return;
		router.push(`/messages/${encodeURIComponent(partner)}`);
	};

	const startNew = () => {
		const target = newRecipientInput.trim();
		if (!target) return;
		setIsStartingNew(false);
		setNewRecipientInput("");
		openThread(target);
	};

	return (
		<div className="flex flex-col flex-1 min-h-[calc(100vh-44px-56px)] md:min-h-[calc(100vh-44px)]">
			<div className="p-2 border-b border-gray-800 flex items-center justify-end bg-[#0b0e14]">
				<button
					onClick={() => setIsStartingNew((v) => !v)}
					className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs shrink-0 transition-colors ${
						isStartingNew
							? "bg-blue-600 text-white font-bold"
							: "bg-gray-100/10 text-gray-400 hover:text-white hover:bg-gray-100/15"
					}`}
				>
					<Plus size={13} />
					<span>新規DM</span>
				</button>
			</div>

			{isStartingNew && (
				<div className="p-3 border-b border-gray-800 bg-gray-900/50 flex items-center gap-2">
					<span className="text-xs text-gray-400 font-bold">
						送信先 (ID/名前):
					</span>
					<input
						type="text"
						value={newRecipientInput}
						onChange={(e) => setNewRecipientInput(e.target.value)}
						placeholder="相手のユーザー名を入力"
						className="flex-1 bg-gray-100/10 rounded px-3 py-1 text-xs text-white outline-none border border-gray-700"
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.nativeEvent.isComposing) {
								e.preventDefault();
								startNew();
							}
						}}
					/>
					<button
						onClick={startNew}
						disabled={!newRecipientInput.trim()}
						className="bg-blue-600 disabled:opacity-50 px-3 py-1 rounded-full text-white text-xs font-bold hover:bg-blue-500"
					>
						開く
					</button>
				</div>
			)}

			{previews.length === 0 ? (
				<div className="p-10 text-center text-xs text-gray-500 flex flex-col items-center gap-2">
					<MessageSquare size={24} className="text-gray-600" />
					<span>
						ダイレクトメッセージはありません。「新規DM」から相手を指定してメッセージを送信できます。
					</span>
				</div>
			) : (
				<div className="flex-1 divide-y divide-gray-800">
					{previews.map((m) => {
						const partner = getPartner(m);
						if (!partner) return null;
						const avatar = getAvatarInfo(partner);
						return (
							<button
								key={partner}
								onClick={() => openThread(partner)}
								className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-100/5 transition-colors"
							>
								<div
									className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center overflow-hidden text-white font-bold text-sm"
									style={avatar.style}
								>
									{avatar.username.charAt(0)}
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex items-baseline gap-2">
										<span className="font-bold text-sm text-gray-100 truncate">
											{avatar.username}
										</span>
										<span className="text-[10px] text-gray-500 shrink-0">
											{m.time}
										</span>
									</div>
									<p className="text-xs text-gray-400 truncate">
										{isMine(m) ? `自分: ${m.text}` : m.text}
									</p>
								</div>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
