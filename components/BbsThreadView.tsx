"use client";

import { ArrowLeft, Edit3, Share2, ThumbsUp } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getUserIdLabel } from "@/lib/avatar";
import { extractChordsFromContent } from "@/lib/chord";
import { extractFirstEmbed } from "@/lib/embed";
import { createGame, createMv, loadGame, loadMv } from "@/lib/game-mv-client";
import {
	extractMmlFromContent,
	findMmlMarker,
	getDisplayContent,
} from "@/lib/mml";
import type { MvManifest, MvPresetKind } from "@/lib/mv-config";
import { ensureSessionId } from "@/lib/session";
import { postShareUrl } from "@/lib/share";
import { buildPostShareText } from "@/lib/share-text";
import { getThreadDisplayTime } from "@/lib/time";
import { showToast } from "@/lib/toast";
import { isCollabAllowed, OriginType, Post } from "@/lib/types";
import ChordPlayer from "./ChordPlayer";
import EmbedPart from "./EmbedPart";
import GameBox from "./GameBox";
import type { GameManifestDraft } from "./GameMaker";
import ImagePreview from "./ImagePreview";
import MmlPlayer from "./MmlPlayer";
import MmlSource from "./MmlSource";
import MvBox from "./MvBox";
import PostComposer from "./PostComposer";
import ShareButton from "./ShareButton";
import UserActionMenu from "./UserActionMenu";

const DrawingEditor = dynamic(() => import("./DrawingEditor"), { ssr: false });
const DotDrawingEditor = dynamic(() => import("./DotDrawingEditor"), {
	ssr: false,
});
const MmlEditor = dynamic(() => import("./MmlEditor"), { ssr: false });
const GameMaker = dynamic(() => import("./GameMaker"), { ssr: false });
const MvMaker = dynamic(() => import("./MvMaker"), { ssr: false });

type ReplyGameDraft = {
	manifest: GameManifestDraft;
	title: string;
	preset: string;
};

interface BbsThreadViewProps {
	post: Post;
	openCollab: (post: Post) => void;
}

function parseContent(text: string, replyMap: Map<string, number>) {
	const displayText = getDisplayContent(text);
	const lines = displayText.split("\n");
	return lines.map((line, li) => {
		const parts = line.split(/(>>[\d]+)/g);
		return (
			<span key={li} className="block">
				{parts.map((part, pi) => {
					if (/^>>\d+$/.test(part)) {
						const n = parseInt(part.slice(2));
						return (
							<a
								key={pi}
								href={`#res-${n}`}
								className="text-green-400 hover:underline"
								onClick={(e) => {
									e.preventDefault();
									document
										.getElementById(`res-${n}`)
										?.scrollIntoView({ behavior: "smooth", block: "center" });
								}}
							>
								{part}
							</a>
						);
					}
					if (/^https?:\/\//.test(part)) {
						return (
							<a
								key={pi}
								href={part}
								target="_blank"
								rel="noopener noreferrer"
								className="text-blue-400 hover:underline"
							>
								{part}
							</a>
						);
					}
					return <span key={pi}>{part}</span>;
				})}
			</span>
		);
	});
}

export default function BbsThreadView({
	post: initial,
	openCollab,
}: BbsThreadViewProps) {
	const router = useRouter();
	const [post, setPost] = useState<Post>(initial);
	const [replyText, setReplyText] = useState("");
	const [replyImage, setReplyImage] = useState<string | null>(null);
	const [replyMml, setReplyMml] = useState<string | null>(null);
	const [replyGameDraft, setReplyGameDraft] = useState<ReplyGameDraft | null>(
		null,
	);
	const [replyMvDraft, setReplyMvDraft] = useState<{
		manifest: MvManifest;
		title: string;
		preset: MvPresetKind;
	} | null>(null);
	const [replyOriginType, setReplyOriginType] = useState<
		OriginType | undefined
	>(undefined);
	const [replyTo, setReplyTo] = useState<number | null>(null);
	/** 全画面エディタ（お絵描き/ドット絵/MML/ゲーム）。返信欄は閉じずに上へ重ねるので、
	 *  保存後もレス番指定（replyTo）や書きかけの本文はそのまま残る。 */
	const [activeScreen, setActiveScreen] = useState<
		"drawing" | "dotdrawing" | "mml" | "gamemaker" | "mvmaker" | null
	>(null);
	const [submitting, setSubmitting] = useState(false);
	const [userId, setUserId] = useState("名無しvFZ");
	const [userSlug, setUserSlug] = useState<string | undefined>(undefined);
	/** IDタップで開くユーザーメニュー（プロフ/ミュート/ブロック/DM/メンション）。 */
	const [selectedUser, setSelectedUser] = useState<{
		displayName: string;
		slug?: string;
	} | null>(null);
	const [userMenuPos, setUserMenuPos] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const heartQueue = useRef(0);
	const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [previewImage, setPreviewImage] = useState<{
		src: string;
		alt?: string;
	} | null>(null);

	useEffect(() => {
		const sessionId = ensureSessionId();
		api.auth
			.anonymous(sessionId)
			.then((user) => {
				setUserId(user.displayName);
				setUserSlug(user.slug);
			})
			.catch(() => {});
	}, []);

	// Build ordered list: OP as #1, then replies in order
	const allPosts: Post[] = [post, ...post.replies];
	const indexMap = new Map<string, number>(
		allPosts.map((p, i) => [p.id, i + 1]),
	);

	const handleAddReply = async () => {
		if (
			!replyText.trim() &&
			!replyImage &&
			!replyMml &&
			!replyGameDraft &&
			!replyMvDraft
		)
			return;
		if (submitting) return;
		setSubmitting(true);
		const replyNum = replyTo !== null ? `>>${replyTo}\n` : "";
		// MMLは本文の行として保存する（他の投稿経路と同じ書式）
		const parts: string[] = [];
		if (replyText.trim()) parts.push(replyText.trim());
		if (replyMml) parts.push(`#mml ${replyMml}`);
		const content = replyNum + parts.join("\n");

		const tempId = `temp-${Date.now()}`;
		const optimisticReply: Post = {
			id: tempId,
			displayName: userId,
			createdAt: new Date().toISOString(),
			time: "たった今",
			content,
			likes: 0,
			dislikes: 0,
			liked: false,
			disliked: false,
			repliesCount: 0,
			reposts: 0,
			reposted: false,
			avatarColor: "from-blue-500 to-indigo-600",
			heartsTotal: 0,
			replies: [],
			threadId: post.id,
			parentPostId: post.id,
			hasImage: !!replyImage,
			imageSrc: replyImage ?? undefined,
			originType: replyOriginType,
			hasGame: !!replyGameDraft,
			hasMv: !!replyMvDraft,
		};
		setPost((p) => ({
			...p,
			replies: [...p.replies, optimisticReply],
			repliesCount: p.repliesCount + 1,
		}));
		const capturedImage = replyImage;
		const capturedGameDraft = replyGameDraft;
		const capturedMvDraft = replyMvDraft;
		const capturedOriginType = replyOriginType;
		setReplyText("");
		setReplyImage(null);
		setReplyMml(null);
		setReplyGameDraft(null);
		setReplyMvDraft(null);
		setReplyOriginType(undefined);
		setReplyTo(null);

		const toastId = showToast("info", "送信中...", { duration: 0 });

		try {
			// dataURLのまま送るとDBに巨大な文字列が入ってしまうため、必ずアップロードしてURL化する
			let imageSrc: string | undefined;
			if (capturedImage) {
				const result = await api.upload.image({ image: capturedImage });
				imageSrc = result.url;
			}
			// manifest はR2へ上げてからURLだけをAPIに渡す（createGame/createMvが面倒を見る）
			let gameId: string | undefined;
			if (capturedGameDraft) {
				const saved = await createGame({
					preset: capturedGameDraft.preset,
					title: capturedGameDraft.title,
					manifest: capturedGameDraft.manifest,
				});
				gameId = saved.id;
			}

			let mvId: string | undefined;
			if (capturedMvDraft) {
				const saved = await createMv({
					preset: capturedMvDraft.preset,
					title: capturedMvDraft.title,
					manifest: capturedMvDraft.manifest,
				});
				mvId = saved.id;
			}

			const reply = await api.posts.replies.create(post.id, {
				displayName: userId,
				content,
				parentPostId: post.id,
				hasImage: !!capturedImage,
				imageSrc,
				gameId,
				mvId,
				originType: capturedOriginType,
			});
			setPost((p) => ({
				...p,
				replies: p.replies.map((r) => (r.id === tempId ? reply : r)),
			}));
			showToast("success", "送信完了！", { id: toastId });
		} catch {
			setPost((p) => ({
				...p,
				replies: p.replies.filter((r) => r.id !== tempId),
				repliesCount: Math.max(0, p.repliesCount - 1),
			}));
			showToast("error", "書き込みに失敗しました", { id: toastId });
		} finally {
			setSubmitting(false);
		}
	};

	const handleSaveDrawing = (canvasData: string) => {
		setReplyImage(canvasData);
		setActiveScreen(null);
		setReplyText((prev) =>
			prev.trim() ? prev : "#お絵描き 自作イラスト完成！",
		);
	};

	const handleSaveDotDrawing = (canvasData: string) => {
		setReplyImage(canvasData);
		setActiveScreen(null);
		setReplyText((prev) =>
			prev.trim() ? prev : "#ドット絵 自作ドット絵完成！",
		);
	};

	const handleSaveMml = (mml: string) => {
		setReplyMml(mml);
		setActiveScreen(null);
	};

	const handleSaveGame = (
		manifest: GameManifestDraft,
		meta: { title: string; preset: string },
	) => {
		setReplyGameDraft({ manifest, title: meta.title, preset: meta.preset });
		setActiveScreen(null);
		setReplyText((prev) =>
			prev.trim() ? prev : `#ゲーム 「${meta.title}」を作ったよ！`,
		);
	};

	const handleSaveMv = (data: {
		manifest: MvManifest;
		title: string;
		preset: MvPresetKind;
	}) => {
		setReplyMvDraft(data);
		setActiveScreen(null);
		setReplyText((prev) =>
			prev.trim() ? prev : `#MV 「${data.title}」を作ったよ！`,
		);
	};

	const handleHeart = useCallback(
		(targetPost: Post) => {
			setPost((p) => {
				if (p.id === targetPost.id)
					return { ...p, heartsTotal: (Number(p.heartsTotal) || 0) + 1 };
				return {
					...p,
					replies: p.replies.map((r) =>
						r.id === targetPost.id
							? { ...r, heartsTotal: (Number(r.heartsTotal) || 0) + 1 }
							: r,
					),
				};
			});
			heartQueue.current += 1;
			if (heartTimer.current) clearTimeout(heartTimer.current);
			heartTimer.current = setTimeout(async () => {
				const count = heartQueue.current;
				heartQueue.current = 0;
				await api.posts.heart(targetPost.id, userId, count);
			}, 2000);
		},
		[userId],
	);

	const formatDateTime = (iso: string) => {
		const d = new Date(iso);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		const h = String(d.getHours()).padStart(2, "0");
		const min = String(d.getMinutes()).padStart(2, "0");
		const sec = String(d.getSeconds()).padStart(2, "0");
		return `${y}/${m}/${day} ${h}:${min}:${sec}`;
	};

	const viewCount = 78 + post.repliesCount * 3;

	return (
		<>
			{/* Sticky header */}
			<div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800 shrink-0">
				<div className="flex items-center px-3 h-11 gap-2">
					<Link
						href="/"
						className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors flex items-center gap-1"
					>
						<ArrowLeft size={16} className="text-gray-300" />
						<span className="text-xs text-gray-400">板トップ</span>
					</Link>
					<ShareButton
						url={postShareUrl(post.id)}
						text={buildPostShareText(post)}
						size={15}
						className="ml-auto p-1.5 hover:bg-gray-100/10 rounded-full transition-colors text-gray-500 hover:text-gray-300"
					/>
				</div>
			</div>

			{/* Thread stats bar */}
			<div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800/60 text-[10px] text-gray-500 shrink-0">
				<span>
					全 <span className="text-gray-300 font-bold">{allPosts.length}</span>{" "}
					レス
				</span>
				<span>👁 {viewCount}</span>
				<span>
					⏱ {getThreadDisplayTime(post).time}
					{post.isEdited && " (編集済み)"}
				</span>
				<span>💬 {post.repliesCount}件</span>
			</div>

			{/* Replies */}
			<div className="divide-y divide-gray-800/40">
				{allPosts.map((p, idx) => {
					const num = idx + 1;
					return (
						<div key={p.id} id={`res-${num}`} className="px-3 py-3">
							{/* Header line */}
							<div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5 mb-1.5 text-[10px]">
								<span className="text-gray-500 font-bold tabular-nums w-5 text-right shrink-0">
									{num}
								</span>
								<span className="text-gray-200 font-bold">名無し</span>
								<span className="text-gray-600">
									：{formatDateTime(p.createdAt)}
								</span>
								<span className="text-gray-600">
									({p.time}){p.isEdited && " (編集済み)"}
								</span>
								<button
									onClick={(e) => {
										const rect = e.currentTarget.getBoundingClientRect();
										setSelectedUser({
											displayName: p.displayName,
											slug: p.slug || undefined,
										});
										setUserMenuPos({ x: rect.left, y: rect.bottom });
									}}
									className="text-gray-500 hover:text-gray-300 transition-colors"
									title="このIDの操作"
								>
									ID:{" "}
									<span className="text-green-400 font-bold underline decoration-dotted underline-offset-2">
										{getUserIdLabel(p.displayName, p.bbsId)}
									</span>
								</button>
								<button
									onClick={() => setReplyTo(num)}
									className="ml-auto text-gray-600 hover:text-blue-400 transition-colors tabular-nums"
									title={`>>${num} に返信`}
								>
									返信
								</button>
							</div>

							{/* Content */}
							{replyTo === num && (
								<div className="text-[10px] text-green-400 mb-1 pl-6">
									&gt;&gt;{num} に返信中
								</div>
							)}
							<div className="pl-6 text-[13px] text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
								{parseContent(p.content, indexMap)}
							</div>

							{/* Embeds (MML / Chord / URL埋め込み) */}
							{(() => {
								// MML本文はR2にある。展開済みスレッドの中身なのでここで解決してよい
								if (p.hasMml || extractMmlFromContent(p.content)) {
									return (
										<div
											className="pl-6 mt-2"
											onClick={(e) => e.stopPropagation()}
										>
											<div className="text-red-500 font-bold mb-1 text-[13px]">
												{findMmlMarker(p.content) ?? "#mml"}
											</div>
											<MmlSource post={p}>
												{(mml) => <MmlPlayer mml={mml} />}
											</MmlSource>
										</div>
									);
								}
								const chordRes = extractChordsFromContent(p.content);
								if (chordRes)
									return (
										<div
											className="pl-6 mt-2"
											onClick={(e) => e.stopPropagation()}
										>
											<div className="text-red-500 font-bold mb-1 text-[13px]">
												♪コード進行
											</div>
											<ChordPlayer chords={chordRes.chords} />
										</div>
									);
								const embed = extractFirstEmbed(p.content);
								return embed ? (
									<div
										className="pl-6 mt-2"
										onClick={(e) => e.stopPropagation()}
									>
										<EmbedPart embed={embed} />
									</div>
								) : null;
							})()}

							{/* Image */}
							{p.hasImage && (
								<div
									onClick={(e) => {
										e.stopPropagation();
										if (p.imageSrc)
											setPreviewImage({
												src: p.imageSrc,
												alt: p.imageAlt || "ユーザーアート",
											});
									}}
									className="relative rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] cursor-pointer gimp-checkered-background-white"
								>
									<img
										src={p.imageSrc}
										alt={p.imageAlt || "ユーザーアート"}
										className="max-w-full h-auto max-h-55 block mx-auto"
										onError={(e) => {
											const target = e.currentTarget;
											target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="100%" height="100%" fill="%231a1b26"/><rect x="12" y="12" width="296" height="156" rx="8" fill="none" stroke="%23374151" stroke-width="1.5" stroke-dasharray="6,6"/><text x="160" y="85" fill="%23ef4444" font-weight="900" text-anchor="middle" font-size="28" font-family="sans-serif">404</text><text x="160" y="115" fill="%239ca3af" font-weight="bold" text-anchor="middle" font-size="14" font-family="sans-serif">NOT FOUND</text></svg>`;
										}}
									/>
									{p.hasCollabButton && isCollabAllowed(p.originType) && (
										<button
											onClick={(e) => {
												e.stopPropagation();
												openCollab(p);
											}}
											className="absolute bottom-2.5 right-2.5 bg-black/75 hover:bg-black/90 px-2.5 py-1 rounded-full text-[10px] text-[#a3e635] flex items-center space-x-1 border border-gray-800 font-bold active:scale-95 transition-all"
										>
											<Edit3 size={11} />
											<span>コラボ</span>
										</button>
									)}
								</div>
							)}

							{/* MV */}
							{p.hasMv && p.mvId && (
								<div className="pl-6 mt-2">
									<MvBox
										mvId={p.mvId}
										postId={p.id}
										mvTitle={p.mvTitle || "MV"}
										mvThumbnail={p.mvThumbnail}
										mvPreset={p.mvPreset}
										mvPlays={p.mvPlays}
										originType={p.originType}
									/>
								</div>
							)}

							{/* Game */}
							{p.hasGame && (
								<div className="pl-6 mt-2">
									<GameBox
										gameId={p.gameId || ""}
										postId={p.id}
										gameTitle={p.gameTitle || "ゲーム"}
										gameThumbnail={p.gameThumbnail}
										gamePlays={p.gamePlays}
										gameClears={p.gameClears}
										userId={userId}
										originType={p.originType}
									/>
								</div>
							)}

							{/* Like count */}
							{(Number(p.likes) > 0 || Number(p.heartsTotal) > 0) && (
								<div className="pl-6 mt-1.5 flex items-center gap-3 text-[10px] text-gray-600">
									{Number(p.likes) > 0 && (
										<button
											onClick={() => handleHeart(p)}
											className="flex items-center gap-1 hover:text-pink-400 transition-colors"
										>
											<ThumbsUp size={11} />
											<span>{p.likes}</span>
										</button>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* Reply composer */}
			<div className="border-t border-gray-800 mt-2">
				{replyTo !== null && (
					<div className="flex items-center justify-between px-3 pt-2 text-[10px] text-gray-500">
						<span className="text-green-400">&gt;&gt;{replyTo} に返信中</span>
						<button
							onClick={() => setReplyTo(null)}
							className="text-gray-600 hover:text-gray-400 transition-colors"
						>
							取消
						</button>
					</div>
				)}
				<PostComposer
					inline
					userId={userId}
					bbsMode="掲示板モード"
					text={replyText}
					setText={setReplyText}
					image={replyImage}
					setImage={setReplyImage}
					mml={replyMml}
					setMml={setReplyMml}
					gameDraft={replyGameDraft}
					setGameDraft={setReplyGameDraft}
					mvDraft={replyMvDraft}
					setMvDraft={setReplyMvDraft}
					originType={replyOriginType}
					setOriginType={setReplyOriginType}
					onClose={() => {}}
					onSubmit={handleAddReply}
					onOpenDrawing={() => setActiveScreen("drawing")}
					onOpenDotDrawing={() => setActiveScreen("dotdrawing")}
					onOpenMml={() => setActiveScreen("mml")}
					onOpenGameMaker={() => setActiveScreen("gamemaker")}
					onOpenMvMaker={() => setActiveScreen("mvmaker")}
				/>
			</div>

			{activeScreen === "drawing" && (
				<DrawingEditor
					onClose={() => setActiveScreen(null)}
					onSave={handleSaveDrawing}
					collabImageUrl={replyImage ?? undefined}
				/>
			)}
			{activeScreen === "dotdrawing" && (
				<DotDrawingEditor
					onClose={() => setActiveScreen(null)}
					onSave={handleSaveDotDrawing}
					collabImageUrl={replyImage ?? undefined}
				/>
			)}
			{activeScreen === "mml" && (
				<MmlEditor
					onClose={() => setActiveScreen(null)}
					onSave={handleSaveMml}
					initialMml={replyMml ?? undefined}
				/>
			)}
			{activeScreen === "gamemaker" && (
				<GameMaker
					onClose={() => setActiveScreen(null)}
					userId={userId}
					onSave={handleSaveGame}
					initialManifest={replyGameDraft?.manifest}
				/>
			)}
			{activeScreen === "mvmaker" && (
				<MvMaker
					onClose={() => setActiveScreen(null)}
					userId={userId}
					onSave={handleSaveMv}
					initialManifest={replyMvDraft?.manifest}
					isEditing={!!replyMvDraft}
				/>
			)}

			{selectedUser && (
				<UserActionMenu
					isOpen={true}
					onClose={() => setSelectedUser(null)}
					targetUserDisplayName={selectedUser.displayName}
					targetUserSlug={selectedUser.slug}
					currentUserId={userId}
					currentUserSlug={userSlug}
					onMention={(username) =>
						setReplyText((prev) =>
							prev ? `${prev} @${username} ` : `@${username} `,
						)
					}
					position={userMenuPos}
				/>
			)}

			{previewImage && (
				<ImagePreview
					src={previewImage.src}
					alt={previewImage.alt}
					onClose={() => setPreviewImage(null)}
				/>
			)}
		</>
	);
}
