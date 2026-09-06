"use client";

import {
	ArrowLeft,
	Loader2,
	MoreHorizontal,
	Send,
	Trash2,
	Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { api } from "@/lib/api";
import { getAvatarInfo } from "@/lib/avatar";
import {
	canSendDm,
	type DmGate,
	FIRST_DM_NOTICE,
	isDmOpen,
} from "@/lib/dm-rules";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import type { Message } from "@/lib/mock-db";
import { markMessagesSeen } from "@/lib/read-state";
import { chUser } from "@/lib/realtime/channels";
import { getRealtimeClient } from "@/lib/realtime/client";
import UserActionMenu from "./UserActionMenu";

interface DmThreadViewProps {
	/** 相手の slug（/messages/[id] のパスパラメータ） */
	partnerSlug: string;
}

type Relation = "mutual" | "following" | "followed" | "none";

const RELATION_LABEL: Record<Relation, string> = {
	mutual: "相互フォロー",
	following: "フォロー中",
	followed: "フォローされています",
	none: "フォロー関係なし",
};

/**
 * 1対1のDMスレッド。プロフィールの「メッセージ」から直接ここへ来る。
 * 受信箱（DmInboxList）と違い、この相手との往復だけを取得する。
 */
export default function DmThreadView({ partnerSlug }: DmThreadViewProps) {
	const router = useRouter();
	const me = useCurrentUser();

	const [partnerName, setPartnerName] = useState<string>(partnerSlug);
	const [partnerAvatar, setPartnerAvatar] = useState<string | undefined>(
		undefined,
	);
	const [partnerActualSlug, setPartnerActualSlug] = useState<
		string | undefined
	>(undefined);
	const [partnerFollowers, setPartnerFollowers] = useState<number | null>(null);
	const [relation, setRelation] = useState<Relation>("none");

	const [messages, setMessages] = useState<Message[]>([]);
	const [gate, setGate] = useState<DmGate>({ sent: 0, received: 0 });
	const [loading, setLoading] = useState(true);
	const [input, setInput] = useState("");
	const [sendError, setSendError] = useState<string | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
	const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

	const bottomRef = useRef<HTMLDivElement>(null);
	const sendingRef = useRef(false);
	const mounted = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);

	// フォロー判定/会話取得は users.id が要る。displayName へフォールバックすると
	// pg 側で整数化できず空扱いになる（実際 follow/messages で起きていた）。
	const myId = me?.slug;

	/** サーバーの応答は slug と displayName が混在するので、どちらでも本人判定できるようにする。 */
	const myIdentifiers = useMemo(
		() =>
			new Set([me?.displayName, me?.slug, me?.id].filter(Boolean) as string[]),
		[me?.displayName, me?.slug, me?.id],
	);

	const partnerIdentifiers = useMemo(
		() =>
			new Set(
				[partnerSlug, partnerName, partnerActualSlug].filter(
					Boolean,
				) as string[],
			),
		[partnerSlug, partnerName, partnerActualSlug],
	);

	const isMine = useCallback(
		(m: Message) => myIdentifiers.has(m.sender),
		[myIdentifiers],
	);

	const scrollToBottom = (smooth = true) => {
		bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
	};

	// 相手のプロフィール情報（ヘッダー＋空スレッドの紹介カード用）
	useEffect(() => {
		api.users
			.meta(partnerSlug)
			.then((u) => {
				setPartnerName(u.displayName || partnerSlug);
				setPartnerAvatar(u.avatarUrl);
				const userMeta = u as { id?: string; slug?: string };
				if (userMeta.slug || userMeta.id)
					setPartnerActualSlug(userMeta.slug || userMeta.id);
			})
			.catch(() => {});
		api.follow
			.getCounts(partnerSlug)
			.then((c) => setPartnerFollowers(c.followers))
			.catch(() => {});
	}, [partnerSlug]);

	// フォロー関係。見知らぬ相手かどうかが、DMを開くときいちばん知りたい情報。
	useEffect(() => {
		if (!myId) return;
		Promise.all([
			api.follow
				.isFollowing(myId, partnerSlug)
				.then((r) => r.isFollowing)
				.catch(() => false),
			api.follow
				.isFollowing(partnerSlug, myId)
				.then((r) => r.isFollowing)
				.catch(() => false),
		]).then(([iFollow, followsMe]) => {
			setRelation(
				iFollow && followsMe
					? "mutual"
					: iFollow
						? "following"
						: followsMe
							? "followed"
							: "none",
			);
		});
	}, [myId, partnerSlug]);

	// スレッド本体
	useEffect(() => {
		if (!myId) return;
		let cancelled = false;
		Promise.resolve().then(() => {
			if (!cancelled) setLoading(true);
		});
		api.messages
			.conversation(myId, partnerSlug)
			.then((res) => {
				if (cancelled) return;
				setMessages(res.messages);
				setGate(res.gate);
				markMessagesSeen(res.messages);
				setTimeout(() => scrollToBottom(false), 50);
			})
			.catch(() => {
				if (!cancelled) setMessages([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [myId, partnerSlug]);

	// リアルタイム受信。自分宛チャンネルに届いたもののうち、この相手との往復だけを取り込む。
	useEffect(() => {
		const client = getRealtimeClient();
		if (!client || !myId) return;
		const channelsToSub = Array.from(
			new Set(Array.from(myIdentifiers).map(chUser)),
		);
		const unsubChannel = client.subscribe(channelsToSub);
		const unsubHandler = client.addHandler((msg) => {
			if (
				msg.t !== "event" ||
				!channelsToSub.includes(msg.channel) ||
				msg.event !== "message.created"
			)
				return;
			const data = msg.data as Message;
			if (!data?.id) return;
			const involvesPartner = [data.sender, data.recipient].some(
				(v) => v && partnerIdentifiers.has(v),
			);
			if (!involvesPartner) return;
			setMessages((prev) => {
				if (prev.some((m) => m.id === data.id)) return prev;
				const updated = [data, ...prev];
				markMessagesSeen(updated);
				return updated;
			});
			if (!myIdentifiers.has(data.sender))
				setGate((g) => ({ ...g, received: g.received + 1 }));
			setTimeout(() => scrollToBottom(true), 50);
		});
		return () => {
			unsubChannel();
			unsubHandler();
		};
	}, [myId, partnerIdentifiers, myIdentifiers]);

	const open = isDmOpen(gate);
	const canSend = canSendDm(gate);

	const handleSend = async () => {
		const text = input.trim();
		if (!text || !myId || sendingRef.current || !canSend) return;
		sendingRef.current = true;
		setSendError(null);
		try {
			const msg = await api.messages.send({
				sender: myId,
				recipient: partnerSlug,
				text,
			});
			setMessages((prev) =>
				prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev],
			);
			setGate((g) => ({ ...g, sent: g.sent + 1 }));
			setInput("");
			setTimeout(() => scrollToBottom(true), 50);
		} catch (err) {
			setSendError((err as Error)?.message || "送信に失敗しました");
		} finally {
			sendingRef.current = false;
		}
	};

	const handleDelete = async (id: number) => {
		if (!myId) return;
		try {
			await api.messages.remove(id, myId);
			setMessages((prev) => prev.filter((m) => m.id !== id));
			setGate((g) => ({ ...g, sent: Math.max(0, g.sent - 1) }));
			setConfirmDeleteId(null);
		} catch {
			/* noop */
		}
	};

	const partnerInfo = getAvatarInfo(partnerSlug, partnerName);
	// API は新しい順で返すので、表示は古い順に戻す。
	const ordered = useMemo(() => messages.slice().reverse(), [messages]);

	return (
		<div className="flex flex-col flex-1 min-h-[calc(100vh-56px)] md:min-h-screen">
			<div className="sticky top-0 z-20 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
				<div className="flex items-center px-3 h-11 gap-2">
					<button
						onClick={() => router.push("/messages")}
						className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors"
						aria-label="メッセージ一覧へ戻る"
					>
						<ArrowLeft size={18} className="text-gray-300" />
					</button>
					<div
						onClick={() => router.push(`/user/${partnerSlug}`)}
						className="w-7 h-7 rounded-full shrink-0 border border-gray-700/50 flex items-center justify-center overflow-hidden cursor-pointer"
						style={partnerAvatar ? undefined : partnerInfo.style}
					>
						{partnerAvatar ? (
							<img
								src={partnerAvatar}
								alt={partnerInfo.username}
								className="w-full h-full object-cover"
							/>
						) : (
							<partnerInfo.Icon className="w-4 h-4 text-white/40" />
						)}
					</div>
					<span
						onClick={() => router.push(`/user/${partnerSlug}`)}
						className="font-bold text-sm text-gray-200 truncate cursor-pointer hover:underline"
					>
						{partnerInfo.username}
					</span>
					<button
						onClick={(e) => {
							const rect = e.currentTarget.getBoundingClientRect();
							setMenuPos({ x: rect.right - 176, y: rect.bottom });
						}}
						className="ml-auto w-8 h-8 rounded-full border border-gray-700 text-gray-400 flex items-center justify-center hover:bg-gray-100/10 hover:text-white transition-colors"
						aria-label="この相手の操作"
					>
						<MoreHorizontal size={16} />
					</button>
				</div>
			</div>

			<div className="flex-1 flex flex-col px-4 py-4 gap-3">
				{loading ? (
					<div className="flex-1 flex items-center justify-center text-gray-600">
						<Loader2 size={18} className="animate-spin" />
					</div>
				) : ordered.length === 0 ? (
					// 空スレッド：どんな相手なのかをここで示してから1通目を書いてもらう。
					<div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
						<div
							className="w-20 h-20 rounded-full border border-gray-700/50 flex items-center justify-center overflow-hidden"
							style={partnerAvatar ? undefined : partnerInfo.style}
						>
							{partnerAvatar ? (
								<img
									src={partnerAvatar}
									alt={partnerInfo.username}
									className="w-full h-full object-cover"
								/>
							) : (
								<partnerInfo.Icon className="w-10 h-10 text-white/40" />
							)}
						</div>
						<span className="font-bold text-sm text-gray-100">
							{partnerInfo.username}
						</span>
						{partnerFollowers !== null && (
							<span className="text-[11px] text-gray-400 flex items-center gap-1.5">
								<Users size={12} className="text-gray-500" />
								フォロワー{" "}
								<span className="font-bold text-gray-200">
									{partnerFollowers}
								</span>
							</span>
						)}
						<span className="text-[11px] text-gray-500">
							{RELATION_LABEL[relation]}
						</span>
						<button
							onClick={() => router.push(`/user/${partnerSlug}`)}
							className="mt-2 px-5 py-2 rounded-full text-xs font-bold border border-gray-700 text-gray-200 hover:border-white hover:text-white transition-colors"
						>
							プロフィールを見る
						</button>
					</div>
				) : (
					<div className="flex-1 flex flex-col gap-3">
						{ordered.map((m) => {
							const mine = isMine(m);
							return (
								<div
									key={m.id}
									className={`flex flex-col group w-full ${mine ? "items-end" : "items-start"}`}
								>
									<span className="text-[10px] text-gray-500 mb-1 px-1">
										{m.time}
									</span>
									<div
										className={`flex items-end gap-1.5 max-w-[85%] sm:max-w-[75%] ${mine ? "flex-row-reverse" : "flex-row"}`}
									>
										<div
											className={`px-3.5 py-2 rounded-2xl text-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed shadow-sm ${
												mine
													? "bg-blue-600 text-white rounded-tr-xs"
													: "bg-gray-800/90 text-gray-100 border border-gray-700/60 rounded-tl-xs"
											}`}
										>
											{m.text}
										</div>
										{mine &&
											(confirmDeleteId === m.id ? (
												<div className="flex items-center gap-1 text-[10px] shrink-0 bg-gray-900 px-2 py-1 rounded border border-gray-800">
													<span className="text-red-400 font-bold">削除？</span>
													<button
														onClick={() => handleDelete(m.id)}
														className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
													>
														はい
													</button>
													<button
														onClick={() => setConfirmDeleteId(null)}
														className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded"
													>
														いいえ
													</button>
												</div>
											) : (
												<button
													onClick={() => setConfirmDeleteId(m.id)}
													className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 p-1 shrink-0"
													title="削除"
												>
													<Trash2 size={12} />
												</button>
											))}
									</div>
								</div>
							);
						})}
					</div>
				)}

				{/* 初回DMのルールは、送ってから弾かれるのではなく書く前に見せる。 */}
				{!loading && !open && (
					<div className="mx-auto max-w-sm text-center text-[11px] leading-relaxed text-gray-400 bg-gray-100/5 border border-gray-800 rounded-xl px-3.5 py-2.5">
						{canSend
							? FIRST_DM_NOTICE
							: "1通目を送信済みです。相手から返信があるまで続けて送ることはできません。"}
					</div>
				)}
				<div ref={bottomRef} />
			</div>

			{/* サーバー側では自分のセッションが分からず disabled 付きのHTMLになる。
          その状態でハイドレートすると disabled 属性が消えないまま固まるので、
          入力欄はマウント後にクライアント側で生成する。 */}
			<div className="sticky bottom-14 md:bottom-0 z-20 p-3 border-t border-gray-800 bg-[#0b0e14]/95 backdrop-blur">
				{sendError && (
					<div className="text-[11px] text-red-400 mb-2 px-1">{sendError}</div>
				)}
				{!mounted ? (
					<div className="h-[34px]" />
				) : (
					<div className="flex items-center gap-2">
						<input
							type="text"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							disabled={!myId || !canSend}
							placeholder={
								canSend ? "メッセージを入力..." : "相手からの返信を待っています"
							}
							className="flex-1 bg-gray-100/10 hover:bg-gray-100/15 disabled:opacity-50 rounded-full py-2 px-4 text-xs outline-none text-white border border-gray-800"
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.nativeEvent.isComposing) {
									e.preventDefault();
									handleSend();
								}
							}}
						/>
						<button
							onClick={handleSend}
							disabled={!myId || !canSend || !input.trim()}
							className="bg-blue-600 disabled:opacity-50 px-4 py-2 rounded-full text-white text-xs font-bold hover:bg-blue-500 transition-colors flex items-center gap-1.5"
						>
							<Send size={13} />
							送信
						</button>
					</div>
				)}
			</div>

			{menuPos && (
				<UserActionMenu
					isOpen={true}
					onClose={() => setMenuPos(null)}
					targetUserDisplayName={partnerName}
					targetUserId={partnerSlug}
					targetUserSlug={partnerSlug}
					currentUserId={me?.displayName}
					currentUserSlug={me?.slug}
					onMention={(username) =>
						router.push(`/?mention=${encodeURIComponent(username)}`)
					}
					position={menuPos}
					hideDm
				/>
			)}
		</div>
	);
}
