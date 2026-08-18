"use client";

import {
	Ban,
	Copy,
	Edit3,
	Flag,
	Heart,
	Mail,
	MessageCircle,
	MoreHorizontal,
	Pencil,
	Plus,
	Repeat,
	ThumbsDown,
	ThumbsUp,
	Trash2,
	UserPlus,
	VolumeX,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getAvatarInfo } from "@/lib/avatar";
import { extractChordsFromContent } from "@/lib/chord";
import { extractFirstEmbed } from "@/lib/embed";
import {
	extractMmlFromContent,
	findMmlMarker,
	getDisplayContent,
	stripAnkaPrefixForSnsDisplay,
} from "@/lib/mml";
import { cachePost } from "@/lib/post-cache";
import { cacheProfileSeed } from "@/lib/profile-cache";
import { postShareUrl } from "@/lib/share";
import { buildPostShareText } from "@/lib/share-text";
import { getThreadDisplayTime } from "@/lib/time";
import { showToast } from "@/lib/toast";
import {
	isCollabAllowed,
	ORIGIN_TYPE_OPTIONS,
	OriginType,
	POST_BODY_COLLAPSE_LINES,
	Post,
} from "@/lib/types";
import ChordPlayer from "./ChordPlayer";
import DeletePostModal from "./DeletePostModal";
import EditPostModal from "./EditPostModal";
import EmbedPart from "./EmbedPart";
import GameBox from "./GameBox";
import ImagePreview from "./ImagePreview";
import MmlSource from "./MmlSource";
import MvBox from "./MvBox";
import OriginTypeModal from "./OriginTypeModal";
import ShareButton from "./ShareButton";
import SpriteImage from "./SpriteImage";
import UserActionMenu from "./UserActionMenu";

const MmlPlayer = dynamic(() => import("./MmlPlayer"), { ssr: false });

interface PostContainerProps {
	post: Post;
	isRankingMode: boolean;
	rankIndex: number;
	rankCategory: string;
	onLike: (id: string) => void;
	onDislike: (id: string) => void;
	onRepost: (id: string) => void;
	onHeart: (id: string) => void;
	onAddReply: (id: string, text: string) => void;
	onQuickPost: (text?: string) => void;
	openGame: (gameId?: string, postId?: string) => void;
	openCollab: (post: Post) => void;
	openMml: () => void;
	currentUserSlug?: string;
	currentUserDisplayName?: string;
	onModerationChange?: () => void;
	onReplyClick?: (post: Post) => void;
	/**
	 * 添付の編集導線。任意propsにすると「非対応」と「渡し忘れ」が区別できず、
	 * 実際に検索画面だけMV編集が落ちていた。非対応なら null を明示すること。
	 */
	onEditImage: ((post: Post) => void) | null;
	onEditMml: ((post: Post, mml: string) => void) | null;
	onEditMv: ((post: Post) => void) | null;
	onEditPost?: (post: Post) => void;
	/**
	 * 編集成功後に API レスポンスの更新済ぽストを渡す。
	 * フィード全体を再取得する代わりに該当エントリーだけを差し替えるために使う。
	 */
	onPostUpdated?: (post: Post) => void;
	userId?: string;
	/** 「最新レス」タブ用: 返信元の元スレ投稿を引用カードとして本文の下に表示する */
	quotedPost?: Post;
}

export default function PostContainer({
	post,
	isRankingMode,
	rankIndex,
	rankCategory,
	onLike,
	onDislike,
	onRepost,
	onHeart,
	onAddReply,
	onQuickPost,
	openGame,
	openCollab,
	openMml,
	currentUserSlug,
	currentUserDisplayName,
	onModerationChange,
	onReplyClick,
	onEditImage,
	onEditMml,
	onEditMv,
	onEditPost,
	userId,
	quotedPost,
	onPostUpdated,
}: PostContainerProps) {
	const router = useRouter();
	const avatarInfo = getAvatarInfo(post.displayName);
	const [showReplyInput, setShowReplyInput] = useState(false);
	const [replyText, setReplyText] = useState("");
	const [menuOpen, setMenuOpen] = useState(false);
	const [following, setFollowing] = useState(false);
	const [blocked, setBlocked] = useState(false);
	const [muted, setMuted] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [showOriginModal, setShowOriginModal] = useState(false);
	const [showReportModal, setShowReportModal] = useState(false);
	const [reportReason, setReportReason] = useState("");
	const [reportToast, setReportToast] = useState(false);
	const [bodyExpanded, setBodyExpanded] = useState(false);
	const [userMenuOpen, setUserMenuOpen] = useState(false);
	const [avatarMenuPos, setAvatarMenuPos] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [previewImage, setPreviewImage] = useState<{
		src: string;
		alt?: string;
	} | null>(null);
	const [optimisticallyDeleted, setOptimisticallyDeleted] = useState(false);
	const targetSlug = post.slug || post.displayName;
	const isSelf = !!currentUserSlug && currentUserSlug === targetSlug;
	const shareText = buildPostShareText(post);

	const toggleMenu = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		setMenuOpen((v) => !v);
	}, []);

	const handleMenuCopy = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			navigator.clipboard.writeText(post.content);
			setMenuOpen(false);
		},
		[post.content],
	);

	const handleMenuFollow = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		setFollowing((v) => !v);
		setMenuOpen(false);
	}, []);

	const handleMenuBlock = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			setMenuOpen(false);
			if (!currentUserSlug) return;
			try {
				if (blocked) {
					await api.block.unblock(currentUserSlug, targetSlug);
					setBlocked(false);
				} else {
					await api.block.block(currentUserSlug, targetSlug);
					setBlocked(true);
				}
				onModerationChange?.();
			} catch {
				/* レートリミット等は無視 */
			}
		},
		[currentUserSlug, targetSlug, blocked, onModerationChange],
	);

	const handleMenuMute = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			setMenuOpen(false);
			if (!currentUserSlug) return;
			try {
				if (muted) {
					await api.mute.unmute(currentUserSlug, targetSlug);
					setMuted(false);
				} else {
					await api.mute.mute(currentUserSlug, targetSlug);
					setMuted(true);
				}
				onModerationChange?.();
			} catch {
				/* noop */
			}
		},
		[currentUserSlug, targetSlug, muted, onModerationChange],
	);

	const handleMenuReport = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		setMenuOpen(false);
		setShowReportModal(true);
	}, []);

	const submitReport = useCallback(async () => {
		try {
			await api.report.create({
				reporterSlug: currentUserSlug || "名無し",
				targetType: "post",
				targetId: String(post.id),
				reason: reportReason,
			});
			setShowReportModal(false);
			setReportReason("");
			setReportToast(true);
			setTimeout(() => setReportToast(false), 3000);
		} catch {
			/* noop */
		}
	}, [currentUserSlug, post.id, reportReason]);

	const handleMenuEdit = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			setMenuOpen(false);
			if (!currentUserSlug) return;
			if (onEditPost) {
				onEditPost(post);
			} else {
				setShowEditModal(true);
			}
		},
		[currentUserSlug, onEditPost, post],
	);

	const handleSaveEdit = useCallback(
		async (
			next: string,
			nextImageSrc?: string | null,
			dotMeta?: {
				dotW?: number | null;
				dotH?: number | null;
				animFrames?: number | null;
				animFps?: number | null;
				walkPreset?: string | null;
			},
		) => {
			setShowEditModal(false);
			if (!currentUserDisplayName) return;
			try {
				const updated = await api.posts.edit(
					post.id,
					currentUserDisplayName,
					next,
					post.originType,
					nextImageSrc === null ? "" : nextImageSrc,
					dotMeta,
				);
				// フィード全再取得（onModerationChange = fetchPosts）はMMLが空で再描画される原因になる。
				// PATCHレスポンスで該当エントリだけを差し替える。
				onPostUpdated?.(updated);
				onModerationChange?.();
			} catch {
				showToast("error", "投稿の編集に失敗しました");
			}
		},
		[
			currentUserDisplayName,
			post.id,
			post.originType,
			onModerationChange,
			onPostUpdated,
		],
	);

	const handleMenuOriginType = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			setMenuOpen(false);
			if (!currentUserSlug) return;
			setShowOriginModal(true);
		},
		[currentUserSlug],
	);

	const handleSelectOriginType = useCallback(
		async (value: OriginType | undefined) => {
			setShowOriginModal(false);
			if (!currentUserDisplayName) return;
			try {
				await api.posts.edit(
					post.id,
					currentUserDisplayName,
					post.content,
					value ?? null,
				);
				onModerationChange?.();
			} catch {
				showToast("error", "権利表記の更新に失敗しました");
			}
		},
		[currentUserDisplayName, post.id, post.content, onModerationChange],
	);

	const handleMenuDelete = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			setMenuOpen(false);
			if (!currentUserSlug) return;
			setShowDeleteModal(true);
		},
		[currentUserSlug],
	);

	const handleConfirmDelete = useCallback(async () => {
		setShowDeleteModal(false);
		if (!currentUserSlug) return;
		setOptimisticallyDeleted(true);
		try {
			await api.posts.remove(post.id, currentUserSlug);
			onModerationChange?.();
		} catch {
			setOptimisticallyDeleted(false);
			showToast("error", "投稿の削除に失敗しました");
		}
	}, [currentUserSlug, post.id, onModerationChange]);

	useEffect(() => {
		if (!menuOpen) return;
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [menuOpen]);

	const handlePostClick = useCallback(
		(e: React.MouseEvent) => {
			const t = e.target as HTMLElement;
			if (
				t.closest("button") ||
				t.closest("input") ||
				t.closest("textarea") ||
				t.closest("a") ||
				t.closest('[role="button"]') ||
				t.closest("video")
			)
				return;
			cachePost(post);
			router.push(`/post/${post.id}`);
		},
		[router, post.id, post],
	);

	const getRankScoreDisplay = () => {
		if (rankCategory === "イイ") return `${post.likes} いいね`;
		if (rankCategory === "コメ") return `${post.repliesCount} コメ`;
		if (rankCategory === "ダメ") return `${post.dislikes} ダメ`;
		return `${post.repliesCount} レス`;
	};

	const threadTime = getThreadDisplayTime(post);

	if (optimisticallyDeleted) return null;

	return (
		<div
			className={`flex relative transition-all ${isRankingMode ? "bg-gradient-to-r from-gray-900/10 via-transparent to-transparent" : ""}`}
		>
			{isRankingMode && (
				<div className="w-10 shrink-0 flex items-start justify-center pt-4 pl-1">
					<span
						className={`font-mono font-bold text-sm ${
							rankIndex === 1
								? "text-yellow-500 scale-110 drop-shadow-[0_0_8px_rgba(234,179,8,0.2)]"
								: rankIndex === 2
									? "text-gray-400"
									: rankIndex === 3
										? "text-amber-600"
										: "text-gray-600"
						}`}
					>
						{rankIndex}
					</span>
				</div>
			)}

			{isRankingMode && (
				<div className="absolute top-4 right-3 flex flex-col items-end z-10 pointer-events-none">
					<span className="text-[10px] font-bold text-gray-400 bg-[#0f121a]/80 px-2 py-0.5 rounded border border-gray-800">
						{getRankScoreDisplay()}
					</span>
				</div>
			)}

			<div className="flex-1 p-3 flex space-x-2.5 min-w-0 pr-4">
				<div
					onClick={(e) => {
						e.stopPropagation();
						// プロフィールへ行く可能性があるので、一覧で判っている見た目を先に渡しておく。
						cacheProfileSeed({
							slug: post.slug || undefined,
							displayName: post.displayName,
							avatarUrl: post.avatarUrl,
						});
						if (isSelf) {
							router.push(`/user/${post.slug || post.displayName}`);
						} else {
							const rect = e.currentTarget.getBoundingClientRect();
							setAvatarMenuPos({ x: rect.left, y: rect.bottom });
							setUserMenuOpen(true);
						}
					}}
					className="w-9 h-9 rounded-full shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white relative cursor-pointer hover:opacity-80 transition-opacity"
					style={post.avatarUrl ? undefined : avatarInfo.style}
				>
					{post.avatarUrl ? (
						<img
							src={post.avatarUrl}
							alt={avatarInfo.username}
							className="w-full h-full object-cover rounded-full"
						/>
					) : (
						(() => {
							const AvatarIcon = avatarInfo.Icon;
							return (
								<AvatarIcon className="w-5 h-5 text-white/40 leading-none" />
							);
						})()
					)}
					<button
						onClick={(e) => {
							e.stopPropagation();
							onQuickPost();
						}}
						className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5 border border-gray-800 hover:bg-blue-600 transition-colors cursor-pointer"
					>
						<Plus size={8} className="text-gray-400" />
					</button>
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex justify-between items-baseline mb-0.5">
						<div className="flex items-baseline space-x-1.5 flex-wrap gap-y-1">
							<span className="font-bold text-xs text-gray-200">
								{avatarInfo.username}
							</span>
							{isSelf && (
								<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40">
									自分
								</span>
							)}
							{(() => {
								const opt = ORIGIN_TYPE_OPTIONS.find(
									(o) => o.value === post.originType,
								);
								return opt ? (
									<span
										className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${opt.badgeClass}`}
									>
										{opt.label}
									</span>
								) : null;
							})()}
							{post.isFalseDeclaration && (
								<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40">
									虚偽申告
								</span>
							)}
							<span
								className="text-gray-500 text-[10px] font-medium"
								title={
									threadTime.isReplyUpdate
										? `投稿日時: ${post.time} (最新返信: ${threadTime.time})`
										: undefined
								}
							>
								{post.time}
								{post.isEdited && (
									<span className="ml-1 text-[9px] text-gray-500/70">
										(編集済み)
									</span>
								)}
								{quotedPost && (
									<span className="ml-1 text-[9px] text-gray-500/70">
										↩返信
									</span>
								)}
							</span>
						</div>
						<div ref={menuRef} className="relative">
							<button
								onClick={toggleMenu}
								className="p-2 -mr-2 -mt-1 rounded hover:bg-gray-100/10 transition-colors"
							>
								<MoreHorizontal
									size={16}
									className="text-gray-500 hover:text-gray-300"
								/>
							</button>
							{menuOpen && (
								<div
									role="menu"
									className="absolute right-0 top-6 z-50 w-48 rounded-lg border border-gray-700 bg-[#131720] shadow-xl py-1 text-xs"
									onClick={(e) => e.stopPropagation()}
								>
									<button
										role="menuitem"
										onClick={handleMenuCopy}
										className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
									>
										<Copy size={12} className="shrink-0" />
										<span>テキストをコピー</span>
									</button>
									{isSelf && (
										<button
											role="menuitem"
											onClick={handleMenuEdit}
											className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
										>
											<Pencil size={12} className="shrink-0" />
											<span>ポストを編集</span>
										</button>
									)}
									{isSelf && (
										<button
											role="menuitem"
											onClick={handleMenuOriginType}
											className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
										>
											<Pencil size={12} className="shrink-0" />
											<span>権利表記を設定</span>
										</button>
									)}
									{isSelf && (
										<button
											role="menuitem"
											onClick={handleMenuDelete}
											className="flex items-center gap-2.5 w-full px-3 py-2 text-red-400 hover:bg-gray-100/10 text-left transition-colors"
										>
											<Trash2 size={12} className="shrink-0" />
											<span>ポストを削除</span>
										</button>
									)}
									{!isSelf && (
										<button
											role="menuitem"
											onClick={handleMenuFollow}
											className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
										>
											<UserPlus size={12} className="shrink-0" />
											<span>
												{following
													? "フォロー中"
													: `${avatarInfo.username}さんをフォロー`}
											</span>
										</button>
									)}
									{!isSelf && (
										<button
											role="menuitem"
											onClick={handleMenuMute}
											className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
										>
											<VolumeX size={12} className="shrink-0" />
											<span>
												{muted
													? "ミュート中"
													: `${avatarInfo.username}さんをミュート`}
											</span>
										</button>
									)}
									{!isSelf && (
										<button
											role="menuitem"
											onClick={handleMenuBlock}
											className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
										>
											<Ban size={12} className="shrink-0" />
											<span>
												{blocked
													? "ブロック中"
													: `${avatarInfo.username}さんをブロック`}
											</span>
										</button>
									)}
									{!isSelf && <div className="border-t border-gray-800 my-1" />}
									{!isSelf && (
										<button
											role="menuitem"
											onClick={handleMenuReport}
											className="flex items-center gap-2.5 w-full px-3 py-2 text-red-400 hover:bg-gray-100/10 text-left transition-colors"
										>
											<Flag size={12} className="shrink-0" />
											<span>ポストを通報</span>
										</button>
									)}
								</div>
							)}
						</div>
					</div>

					<div
						onClick={handlePostClick}
						className="text-[13px] text-gray-200 whitespace-pre-wrap break-words leading-relaxed mb-2.5 cursor-pointer hover:text-white transition-colors"
					>
						{(() => {
							const displayText = stripAnkaPrefixForSnsDisplay(
								getDisplayContent(post.content),
							);
							const allLines = displayText ? displayText.split("\n") : [];
							const isOverflowing = allLines.length > POST_BODY_COLLAPSE_LINES;
							const lines =
								isOverflowing && !bodyExpanded
									? allLines.slice(0, POST_BODY_COLLAPSE_LINES)
									: allLines;
							return lines.map((line, lIdx) => (
								<span key={lIdx} className="block">
									{line.split(" ").map((word, wIdx) => {
										if (word.startsWith("#") && word.length > 1) {
											const tagClean = word.slice(1);
											return (
												<a
													key={wIdx}
													href={`/hashtag/${encodeURIComponent(tagClean)}`}
													className="text-blue-400 hover:underline mr-1"
													onClick={(e) => {
														e.stopPropagation();
														router.push(
															`/hashtag/${encodeURIComponent(tagClean)}`,
														);
													}}
												>
													{word}
												</a>
											);
										}
										if (/^https?:\/\//.test(word)) {
											return (
												<a
													key={wIdx}
													href={word}
													target="_blank"
													rel="noopener noreferrer"
													className="text-blue-400 hover:underline mr-1"
												>
													{word}
												</a>
											);
										}
										return <span key={wIdx}>{word} </span>;
									})}
								</span>
							));
						})()}
					</div>

					{(() => {
						const displayText = getDisplayContent(post.content);
						const allLines = displayText ? displayText.split("\n") : [];
						if (allLines.length <= POST_BODY_COLLAPSE_LINES) return null;
						return (
							<button
								onClick={(e) => {
									e.stopPropagation();
									setBodyExpanded((v) => !v);
								}}
								className="text-[11px] text-blue-400 hover:underline mb-2.5 -mt-1.5 block"
							>
								{bodyExpanded ? "折りたたむ" : "続きを読む"}
							</button>
						);
					})()}

					{post.hasImage && (
						<div
							onClick={(e) => {
								e.stopPropagation();
								if (post.imageSrc)
									setPreviewImage({
										src: post.imageSrc,
										alt: post.imageAlt || "ユーザーアート",
									});
							}}
							className="relative rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] cursor-pointer gimp-checkered-background-white"
						>
							<SpriteImage
								src={post.imageSrc}
								alt={post.imageAlt || "ユーザーアート"}
								className="max-w-full h-auto max-h-55 block mx-auto"
								animFrames={post.animFrames}
								animFps={post.animFps}
								walkPreset={post.walkPreset}
								dotArt={!!post.dotW}
								onError={(e) => {
									const target = e.currentTarget;
									target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="100%" height="100%" fill="%231a1b26"/><rect x="12" y="12" width="296" height="156" rx="8" fill="none" stroke="%23374151" stroke-width="1.5" stroke-dasharray="6,6"/><text x="160" y="85" fill="%23ef4444" font-weight="900" text-anchor="middle" font-size="28" font-family="sans-serif">404</text><text x="160" y="115" fill="%239ca3af" font-weight="bold" text-anchor="middle" font-size="14" font-family="sans-serif">NOT FOUND</text></svg>`;
								}}
							/>
							{post.hasCollabButton && isCollabAllowed(post.originType) && (
								<button
									onClick={(e) => {
										e.stopPropagation();
										openCollab(post);
									}}
									className="absolute bottom-2.5 right-2.5 bg-black/75 hover:bg-black/90 px-2.5 py-1 rounded-full text-[10px] text-[#a3e635] flex items-center space-x-1 border border-gray-800 font-bold active:scale-95 transition-all"
								>
									<Edit3 size={11} />
									<span>コラボ</span>
								</button>
							)}
						</div>
					)}

					{post.hasMv && post.mvId && (
						<MvBox
							mvId={post.mvId}
							postId={post.id}
							mvTitle={post.mvTitle || "MV"}
							mvThumbnail={post.mvThumbnail}
							mvPreset={post.mvPreset}
							mvPlays={post.mvPlays}
							originType={post.originType}
							className="mb-3"
						/>
					)}

					{post.hasGame && userId && (
						<GameBox
							gameId={post.gameId || ""}
							postId={post.id}
							gameTitle={post.gameTitle || "ゲーム"}
							gameThumbnail={post.gameThumbnail}
							gamePlays={post.gamePlays}
							gameClears={post.gameClears}
							userId={userId}
							originType={post.originType}
							className="mb-3"
						/>
					)}

					{(() => {
						// MML本文はR2から。プレイヤーの枠とコラボボタンは本文を待たずに出す
						if (post.hasMml || extractMmlFromContent(post.content)) {
							return (
								<div onClick={(e) => e.stopPropagation()} className="relative">
									{(() => {
										const mmlMarker = findMmlMarker(post.content) ?? "#mml";
										const tagClean = mmlMarker.replace(/^#/, "");
										return (
											<a
												href={`/hashtag/${encodeURIComponent(tagClean)}`}
												onClick={(e) => {
													e.stopPropagation();
													router.push(
														`/hashtag/${encodeURIComponent(tagClean)}`,
													);
												}}
												className="text-blue-400 hover:underline mb-1 inline-block text-[13px]"
											>
												{mmlMarker}
											</a>
										);
									})()}
									<MmlSource post={post}>
										{(mml) => <MmlPlayer mml={mml} />}
									</MmlSource>
									{post.hasCollabButton && isCollabAllowed(post.originType) && (
										<button
											onClick={(e) => {
												e.stopPropagation();
												openCollab(post);
											}}
											className="absolute bottom-2.5 right-2.5 bg-black/75 hover:bg-black/90 px-2.5 py-1 rounded-full text-[10px] text-pink-400 flex items-center space-x-1 border border-gray-800 font-bold active:scale-95 transition-all z-10"
										>
											<Edit3 size={11} />
											<span>コラボ</span>
										</button>
									)}
								</div>
							);
						}
						const chordRes = extractChordsFromContent(post.content);
						if (chordRes)
							return (
								<div onClick={(e) => e.stopPropagation()}>
									<a
										href={`/hashtag/${encodeURIComponent("コード進行")}`}
										onClick={(e) => {
											e.stopPropagation();
											router.push(
												`/hashtag/${encodeURIComponent("コード進行")}`,
											);
										}}
										className="text-blue-400 hover:underline mb-1 inline-block text-[13px]"
									>
										#コード進行
									</a>
									<ChordPlayer chords={chordRes.chords} />
								</div>
							);
						if (post.hasImage || post.hasGame) return null;
						const embed = extractFirstEmbed(post.content);
						return embed ? (
							<div onClick={(e) => e.stopPropagation()}>
								<EmbedPart embed={embed} />
							</div>
						) : null;
					})()}

					{quotedPost &&
						(() => {
							const quotedAvatarInfo = getAvatarInfo(quotedPost.displayName);
							return (
								<div
									onClick={(e) => {
										e.stopPropagation();
										cachePost(quotedPost);
										router.push(`/post/${quotedPost.id}`);
									}}
									className="mb-2.5 rounded-xl border border-gray-800 bg-gray-100/[0.03] p-2.5 cursor-pointer hover:bg-gray-100/[0.06] transition-colors"
								>
									<div className="flex items-center gap-1.5 mb-1">
										<div
											className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold text-white overflow-hidden"
											style={
												quotedPost.avatarUrl
													? undefined
													: quotedAvatarInfo.style
											}
										>
											{quotedPost.avatarUrl ? (
												<img
													src={quotedPost.avatarUrl}
													alt={quotedAvatarInfo.username}
													className="w-full h-full object-cover rounded-full"
												/>
											) : (
												(() => {
													const QuotedAvatarIcon = quotedAvatarInfo.Icon;
													return (
														<QuotedAvatarIcon className="w-2.5 h-2.5 text-white/40 leading-none" />
													);
												})()
											)}
										</div>
										<span className="font-bold text-[11px] text-gray-300">
											{quotedAvatarInfo.username}
										</span>
										<span className="text-gray-600 text-[10px]">
											{quotedPost.time}
										</span>
									</div>
									<p className="text-[11px] text-gray-400 line-clamp-2 whitespace-pre-wrap">
										{stripAnkaPrefixForSnsDisplay(
											getDisplayContent(quotedPost.content),
										)}
									</p>
									{quotedPost.hasImage && quotedPost.imageSrc && (
										<SpriteImage
											src={quotedPost.imageSrc}
											alt={quotedPost.imageAlt || "ユーザーアート"}
											className="mt-1.5 max-h-[120px] rounded-lg object-cover"
											animFrames={quotedPost.animFrames}
											animFps={quotedPost.animFps}
											walkPreset={quotedPost.walkPreset}
											dotArt={!!quotedPost.dotW}
										/>
									)}
								</div>
							);
						})()}

					<div className="flex justify-between items-center text-gray-500 mt-1 max-w-[280px]">
						<button
							onClick={() => onLike(post.id)}
							className={`flex items-center space-x-1 hover:text-blue-400 transition-colors ${post.liked ? "text-blue-400 font-bold" : ""}`}
						>
							<ThumbsUp size={14} />
							<span className="text-[11px]">{post.likes || ""}</span>
						</button>

						<button
							onClick={() => onDislike(post.id)}
							className={`flex items-center space-x-1 hover:text-red-500 transition-colors ${post.disliked ? "text-red-500 font-bold" : ""}`}
						>
							<ThumbsDown size={14} />
							<span className="text-[11px]">{post.dislikes || ""}</span>
						</button>

						<button
							onClick={() => {
								if (onReplyClick) {
									onReplyClick(post);
								} else {
									setShowReplyInput(!showReplyInput);
								}
							}}
							className={`flex items-center space-x-1 hover:text-green-400 transition-colors ${showReplyInput ? "text-green-400" : ""}`}
						>
							<MessageCircle size={14} />
							<span className="text-[11px]">{post.repliesCount || ""}</span>
						</button>

						<button
							onClick={() => onRepost(post.id)}
							className={`flex items-center space-x-1 hover:text-purple-400 transition-colors ${post.reposted ? "text-purple-400" : ""}`}
						>
							<Repeat size={14} />
							<span className="text-[11px]">{post.reposts || ""}</span>
						</button>

						<button
							onClick={(e) => {
								e.stopPropagation();
								const targetSlug = post.slug || post.displayName;
								if (targetSlug) {
									router.push(`/messages/${encodeURIComponent(targetSlug)}`);
								}
							}}
							className="flex items-center hover:text-blue-400 transition-colors"
							title="DMを送る"
						>
							<Mail size={14} />
						</button>

						<button
							onClick={() => onHeart(post.id)}
							className="flex items-center space-x-1 hover:text-pink-400 transition-colors"
						>
							<Heart size={12} className="fill-current text-pink-600/65" />
							<span className="text-[10px]">{post.heartsTotal || "0"}</span>
						</button>

						<ShareButton url={postShareUrl(post.id)} text={shareText} />
					</div>

					{post.replies.length > 0 && (
						<ReplyPreview replies={post.replies} post={post} />
					)}

					<div
						className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
							showReplyInput ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
						}`}
					>
						<div className="overflow-hidden">
							<div className="mt-2.5 flex items-center space-x-2 bg-gray-100/5 rounded-lg px-2.5 py-1.5 border border-gray-800">
								<input
									type="text"
									placeholder="返信を書き込む..."
									value={replyText}
									onChange={(e) => setReplyText(e.target.value)}
									className="bg-transparent flex-1 text-xs outline-none text-gray-100 placeholder:text-gray-600"
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											onAddReply(post.id, replyText);
											setReplyText("");
											setShowReplyInput(false);
										}
									}}
								/>
								<button
									onClick={() => {
										onAddReply(post.id, replyText);
										setReplyText("");
										setShowReplyInput(false);
									}}
									className="text-blue-500 hover:text-blue-400 text-xs font-bold px-1"
								>
									送信
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			{showEditModal && (
				<EditPostModal
					post={post}
					onClose={() => setShowEditModal(false)}
					onSave={handleSaveEdit}
					capabilities={{
						editImage: onEditImage
							? () => {
									onEditImage(post);
									setShowEditModal(false);
								}
							: null,
						canRemoveImage: true,
						editMml: onEditMml
							? (mml) => {
									onEditMml(post, mml);
									setShowEditModal(false);
								}
							: null,
						editGame: openGame
							? () => {
									openGame(post.gameId, post.id);
									setShowEditModal(false);
								}
							: null,
						removeGame: null,
						editMv: onEditMv
							? () => {
									onEditMv(post);
									setShowEditModal(false);
								}
							: null,
					}}
				/>
			)}
			{showDeleteModal && (
				<DeletePostModal
					onClose={() => setShowDeleteModal(false)}
					onConfirm={handleConfirmDelete}
				/>
			)}
			{showOriginModal && (
				<OriginTypeModal
					value={post.originType}
					onClose={() => setShowOriginModal(false)}
					onSelect={handleSelectOriginType}
				/>
			)}
			<UserActionMenu
				isOpen={userMenuOpen}
				onClose={() => setUserMenuOpen(false)}
				targetUserDisplayName={post.displayName}
				targetUserSlug={post.slug || undefined}
				currentUserId={currentUserDisplayName}
				currentUserSlug={currentUserSlug}
				onMention={(username) => {
					onQuickPost(`@${username}`);
				}}
				position={avatarMenuPos}
			/>
			{previewImage && (
				<ImagePreview
					src={previewImage.src}
					alt={previewImage.alt}
					onClose={() => setPreviewImage(null)}
				/>
			)}
			{/* ── 通報入力モーダル ── */}
			{showReportModal && (
				<div
					className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
					onClick={(e) => e.stopPropagation()}
				>
					<div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 font-sans text-gray-200 shadow-2xl">
						<h4 className="text-sm font-bold text-gray-100 flex items-center gap-1.5">
							投稿の通報
						</h4>
						<p className="text-xs text-gray-400">
							通報理由を入力してください（任意）
						</p>
						<textarea
							value={reportReason}
							onChange={(e) => setReportReason(e.target.value)}
							placeholder="理由の詳細…"
							rows={3}
							className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-gray-200 outline-none focus:border-red-500 resize-none"
						/>
						<div className="flex justify-end gap-2 pt-1">
							<button
								onClick={() => {
									setShowReportModal(false);
									setReportReason("");
								}}
								className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 rounded-lg transition"
							>
								キャンセル
							</button>
							<button
								onClick={submitReport}
								className="px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg transition"
							>
								送信
							</button>
						</div>
					</div>
				</div>
			)}
			{/* ── 通報完了トースト ── */}
			{reportToast && (
				<div className="fixed bottom-6 right-6 z-[130] bg-gray-900 border border-emerald-500/50 text-emerald-400 text-xs font-bold px-4 py-2.5 rounded-lg shadow-xl animate-bounce">
					✓ 通報を受け付けました。
				</div>
			)}
		</div>
	);
}

function ReplyPreview({
	replies,
	post: parentPost,
}: {
	replies: Post[];
	post: Post;
}) {
	const postId = parentPost.id;
	const router = useRouter();
	const [index, setIndex] = useState(0);
	const [pop, setPop] = useState(false);

	useEffect(() => {
		if (replies.length < 2) return;
		const timer = setInterval(() => {
			setIndex((i) => (i + 1) % replies.length);
		}, 4000);
		return () => clearInterval(timer);
	}, [replies.length]);

	useEffect(() => {
		Promise.resolve().then(() => setPop(true));
		const timeout = setTimeout(() => setPop(false), 350);
		return () => clearTimeout(timeout);
	}, [index]);

	const reply = replies[index];

	const uniqueReplies = Array.from(
		replies
			.reduce((map, r) => {
				map.set(r.slug || r.displayName, r);
				return map;
			}, new Map<string, Post>())
			.values(),
	);
	const maxAvatars = Math.min(uniqueReplies.length, 5);
	const extraCount = replies.length - maxAvatars;

	const activeAvatarInfo = getAvatarInfo(reply?.displayName);

	return (
		<div
			onClick={() => {
				cachePost(parentPost);
				router.push(`/post/${postId}`);
			}}
			className="mt-2 pl-2.5 cursor-pointer hover:opacity-80 transition-opacity"
		>
			<div className="flex items-center gap-1.5 py-1">
				<div className="flex items-center shrink-0 -space-x-1.5">
					{uniqueReplies.slice(0, maxAvatars).map((r, i) => {
						const isActive =
							(r.slug || r.displayName) ===
							(reply?.slug || reply?.displayName);
						const rAvatarInfo = getAvatarInfo(r.displayName);
						return (
							<div
								key={r.id}
								className={`w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0 transition-colors duration-300 relative overflow-hidden ${
									isActive
										? "border-2 border-[#a3e635] ring-2 ring-[#a3e635]/40 " +
											(pop ? "animate-pop" : "")
										: "border border-gray-900"
								}`}
								style={{
									zIndex: isActive ? maxAvatars + 1 : maxAvatars - i,
									...(r.avatarUrl ? {} : rAvatarInfo.style),
								}}
							>
								{r.avatarUrl ? (
									<img
										src={r.avatarUrl}
										alt={rAvatarInfo.username}
										className="w-full h-full object-cover rounded-full"
									/>
								) : (
									(() => {
										const RAvatarIcon = rAvatarInfo.Icon;
										return (
											<RAvatarIcon className="w-3 h-3 text-white/40 leading-none" />
										);
									})()
								)}
							</div>
						);
					})}
					{extraCount > 0 && (
						<div className="w-5 h-5 rounded-full bg-gray-800 border border-gray-900 flex items-center justify-center text-[7px] text-gray-400 font-bold shrink-0">
							+{extraCount}
						</div>
					)}
				</div>
				<span
					key={index}
					className="flex items-center min-w-0 animate-fade-in-up"
				>
					{reply?.hasImage && reply.imageSrc && (
						<SpriteImage
							src={reply.imageSrc}
							alt={reply.imageAlt || "ユーザーアート"}
							className="shrink-0 w-5 h-5 rounded object-cover border border-gray-800 mr-1.5"
						fit="cover"
							animFrames={reply.animFrames}
							animFps={reply.animFps}
							walkPreset={reply.walkPreset}
							animate={false}
							onError={(e) => {
								e.currentTarget.style.display = "none";
							}}
						/>
					)}
					<span className="truncate text-[11px] text-gray-400">
						<span className="text-gray-300 font-bold">
							{activeAvatarInfo.username}
						</span>
						<span className="text-gray-500 ml-1">{reply?.content}</span>
					</span>
					<span className="text-[11px] text-gray-600 shrink-0 ml-1.5">
						{reply?.time}
					</span>
				</span>
			</div>
		</div>
	);
}
