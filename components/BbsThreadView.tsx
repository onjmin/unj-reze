"use client";

import { ArrowLeft, Share2, ThumbsUp } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getUserIdLabel } from "@/lib/avatar";
import { createGame, createMv, loadGame, loadMv } from "@/lib/game-mv-client";
import {
	useOlderReplies,
	useScrollToNewestReply,
} from "@/lib/hooks/useOlderReplies";
import { getDistinctTitle } from "@/lib/post-title";
import { getDisplayContent, stripMmlLine } from "@/lib/mml";
import type { MvManifest, MvPresetKind } from "@/lib/mv-config";
import { ensureSessionId } from "@/lib/session";
import { postShareUrl } from "@/lib/share";
import { buildPostShareText } from "@/lib/share-text";
import { getThreadDisplayTime } from "@/lib/time";
import { showToast } from "@/lib/toast";
import { OriginType, Post } from "@/lib/types";
import type { GameManifestDraft } from "./GameMaker";
import ImagePreview from "./ImagePreview";
import PostComposer from "./PostComposer";
import PostEmbeds from "./PostEmbeds";
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

function parseContent(text: string, onJumpToRes: (num: number) => void) {
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
									onJumpToRes(n);
								}}
							>
								{part}
							</a>
						);
					}
					if (/^#[^\s#]+$/.test(part)) {
						const tagClean = part.slice(1);
						return (
							<a
								key={pi}
								href={`/hashtag/${encodeURIComponent(tagClean)}`}
								className="text-blue-400 hover:underline"
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

/**
 * 返信関係にある投稿は、本文に >>レス番 の安価が入っているテイでBBS表示する。
 * ただしスレ1番目（OP）への返信は例外（BBSの慣習上、地の文への返信に逐一安価を付けないため）。
 * 実データの content 自体は書き換えず、表示用に合成するだけ。
 */
function withSyntheticQuote(p: Post, indexMap: Map<string, number>): string {
	// 親のレス番号はサーバー由来の parentNum を優先する。indexMap は読み込み済みの
	// 窓しか持たないので、それだけに頼ると「親が窓の外にいる返信の安価が消える」
	// （parentPostId 側は窓外の親を解決できずOP扱いにフォールバックしてしまう）。
	const parentNum =
		p.parentNum ?? (p.parentPostId ? indexMap.get(p.parentPostId) : undefined);
	if (!parentNum || parentNum === 1) return p.content;
	const quote = `>>${parentNum}`;
	if (p.content.split("\n")[0].trim() === quote) return p.content;
	return `${quote}\n${p.content}`;
}

export default function BbsThreadView({
	post: initial,
	openCollab,
}: BbsThreadViewProps) {
	const router = useRouter();
	const [post, setPost] = useState<Post>(initial);
	const [replyText, setReplyText] = useState("");
	const [replyImage, setReplyImage] = useState<string | null>(null);
	/** replyImage が DrawingEditor/DotDrawingEditor 経由か（app/page.tsx の attachedImageIsDrawn と同じ役割） */
	const [replyImageIsDrawn, setReplyImageIsDrawn] = useState(false);
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
	const [replyDotSize, setReplyDotSize] = useState<
		{ w: number; h: number } | null
	>(null);
	const [replyAnim, setReplyAnim] = useState<{
		animFrames: number;
		animFps: number;
		walkPreset?: string;
	} | null>(null);
	/**
	 * PostComposer の「画像を消す」に直接渡す setter。DrawingEditor/DotDrawingEditor経由の
	 * ときはこれを使わず setReplyImage→setReplyAnim/setReplyDotSize の順で個別に呼ぶため、
	 * ここで一律クリアしても問題ない（app/page.tsx の setAttachedImageDirect と同じ理由）。
	 */
	const setReplyImageDirect = useCallback((v: string | null) => {
		setReplyImage(v);
		setReplyImageIsDrawn(false);
		setReplyDotSize(null);
		setReplyAnim(null);
	}, []);
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
		userId?: string;
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
		animFrames?: number | null;
		animFps?: number | null;
		walkPreset?: string | null;
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

	// レスはサーバーから直近N件しか来ない。上へ遡ったぶんだけ読み足す。
	const { hasOlder, loadingOlder, loadOlder, loadOlderUntil } = useOlderReplies(
		post,
		setPost,
		userSlug,
	);

	/**
	 * `>>N` 安価のジャンプ。飛び先がまだ窓の外なら、そこまで遡ってから飛ぶ。
	 * 遡らずに `getElementById` するだけだと、古いレスへの安価が無反応になる。
	 */
	const handleJumpToRes = useCallback(
		async (num: number) => {
			const jump = (el: HTMLElement) => {
				const before = window.scrollY;
				el.scrollIntoView({ behavior: "smooth", block: "center" });
				// smooth スクロールを実装していない環境（組み込みWebView等。実際に
				// 検証用ブラウザで無反応だった）では安価ジャンプが黙って死ぬので、
				// 動かなければ即時スクロールで補う。
				setTimeout(() => {
					if (window.scrollY === before) el.scrollIntoView({ block: "center" });
				}, 250);
			};
			const loaded = document.getElementById(`res-${num}`);
			if (loaded) {
				jump(loaded);
				return;
			}
			if (!(await loadOlderUntil(num))) {
				showToast("info", "そのレスはまだ読み込まれていません");
				return;
			}
			// 要素が現れるまで待つ。要素が見えた時点でその commit は終わっており、
			// スクロール位置を戻す useLayoutEffect（useOlderReplies）も既に走っている
			// ——先に飛ぶと、その補正に上書きされて目的のレスから弾き飛ばされる。
			// 待ちに requestAnimationFrame は使わない。タブが背面のときに発火せず、
			// 安価ジャンプが「押しても何も起きない」状態で固まる。
			for (let tick = 0; tick < 20; tick++) {
				const el = document.getElementById(`res-${num}`);
				if (el) {
					jump(el);
					return;
				}
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			showToast("info", "そのレスは見つかりませんでした");
		},
		[loadOlderUntil],
	);
	const { anchorRef: newestReplyRef } = useScrollToNewestReply(
		post.id,
		post.replies.length,
	);

	// Build ordered list: OP as #1, then replies in order.
	// レス番号はサーバー採番の Post.num を使う。一覧は直近N件の窓なので、
	// 配列の添字は実際のレス番と一致しない（num の無い旧データだけ添字で代用）。
	const allPosts: Post[] = [post, ...post.replies];
	const numberOf = (p: Post, i: number) => p.num ?? i + 1;
	const indexMap = new Map<string, number>(
		allPosts.map((p, i) => [p.id, numberOf(p, i)]),
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
		// >>レス番号 は返信ボタン押下時に content-text 側へ既に挿入済みなのでここでは足さない
		// 曲を添付したときは本文側の `#mml` 行を落とす。両方残すとマーカーが二重になり、
		// 2本目は外部化されないまま生MMLが content_text に残る（lib/mml.ts 参照）。
		const parts: string[] = [];
		const bodyText = (replyMml ? stripMmlLine(replyText) : replyText).trim();
		if (bodyText) parts.push(bodyText);
		if (replyMml) parts.push(`#mml ${replyMml}`);
		const content = parts.join("\n");

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
			// 仮のレス番号。サーバーの採番で上書きされる（PostDetail と同じ）。
			num: (post.replies[post.replies.length - 1]?.num ?? 1) + 1,
			// 掲示板モードの返信先は常にOP。安価は本文の >>N で表現する。
			parentNum: 1,
			hasImage: !!replyImage,
			imageSrc: replyImage ?? undefined,
			dotW: replyDotSize?.w,
			dotH: replyDotSize?.h,
			animFrames: replyAnim?.animFrames,
			animFps: replyAnim?.animFps,
			walkPreset: replyAnim?.walkPreset,
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
		const capturedImageIsDrawn = replyImageIsDrawn;
		const capturedMml = replyMml;
		const capturedGameDraft = replyGameDraft;
		const capturedMvDraft = replyMvDraft;
		const capturedOriginType = replyOriginType;
		const capturedDotSize = replyDotSize;
		const capturedAnim = replyAnim;
		setReplyText("");
		setReplyImage(null);
		setReplyImageIsDrawn(false);
		setReplyDotSize(null);
		setReplyAnim(null);
		setReplyMml(null);
		setReplyGameDraft(null);
		setReplyMvDraft(null);
		setReplyOriginType(undefined);
		setReplyTo(null);

		const toastId = showToast("info", "送信中...", { duration: 0 });

		try {
			// dataURLのときだけアップロードしてURL化する（アニメ/歩行グラ等はエディタ保存時にアップロード済みURLが渡される）
			let imageSrc: string | undefined;
			if (capturedImage) {
				imageSrc = capturedImage.startsWith("data:")
					? (await api.upload.image({ image: capturedImage })).url
					: capturedImage;
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
				content,
				parentPostId: post.id,
				hasImage: !!capturedImage,
				imageSrc,
				imageIsDrawn: capturedImageIsDrawn,
				gameId,
				mvId,
				dotW: capturedDotSize?.w,
				dotH: capturedDotSize?.h,
				animFrames: capturedAnim?.animFrames,
				animFps: capturedAnim?.animFps,
				walkPreset: capturedAnim?.walkPreset,
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

	const handleSaveDrawing = (
		canvasData: string,
		animMeta?: { animFrames: number; animFps: number },
	) => {
		setReplyImage(canvasData);
		setReplyImageIsDrawn(true);
		if (animMeta) {
			setReplyAnim(animMeta);
		} else {
			setReplyAnim(null);
		}
		setActiveScreen(null);
		setReplyText((prev) =>
			prev.trim() ? prev : "#お絵描き 自作イラスト完成！",
		);
	};

	const handleSaveDotDrawing = (
		canvasData: string,
		gridW?: number,
		gridH?: number,
	) => {
		setReplyImage(canvasData);
		setReplyImageIsDrawn(true);
		if (gridW && gridH) {
			setReplyDotSize({ w: gridW, h: gridH });
		} else {
			setReplyDotSize(null);
		}
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

			{/* Thread title (unj純正スレのスレタイがある場合のみ。reze発は本文と重複するため出さない) */}
			{(() => {
				const distinctTitle = getDistinctTitle(post);
				return distinctTitle ? (
					<div className="px-3 pt-2 text-sm font-bold text-gray-100 break-words leading-snug shrink-0">
						{distinctTitle}
					</div>
				) : null;
			})()}

			{/* Thread stats bar */}
			<div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800/60 text-[10px] text-gray-500 shrink-0">
				<span>
					全{" "}
					<span className="text-gray-300 font-bold">
						{post.repliesCount + 1}
					</span>{" "}
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
				{/* 上スクロールでも自動で読み足すが、スクロールが起きない画面用にボタンも出す */}
				{hasOlder && (
					<button
						type="button"
						onClick={loadOlder}
						disabled={loadingOlder}
						className="w-full py-2 text-[11px] text-blue-400 hover:bg-gray-100/5 transition-colors disabled:text-gray-600"
					>
						{loadingOlder ? "読み込み中..." : "過去のレスを読む"}
					</button>
				)}
				{allPosts.map((p, idx) => {
					const num = numberOf(p, idx);
					return (
						<div key={p.id} id={`res-${num}`} className="px-3 py-3">
							{/* Header line */}
							<div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5 mb-1.5 text-xs">
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
											userId: p.bbsId || p.userId,
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
									onClick={() => {
										setReplyTo(num);
										setReplyText((prev) => {
											const withoutPrefix = prev.replace(
												/^>>\d+\n/,
												"",
											);
											return `>>${num}\n${withoutPrefix}`;
										});
									}}
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
							<div className="pl-6 text-[15px] text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
								{parseContent(
									withSyntheticQuote(p, indexMap),
									handleJumpToRes,
								)}
							</div>

							{/* Embeds (MML / Chord / URL埋め込み / 画像 / MV / ゲーム) */}
							<PostEmbeds
								post={p}
								onOpenCollab={openCollab}
								onPreviewImage={setPreviewImage}
								userId={userId}
								order="text-first"
								mvClassName="pl-6 mt-2"
								gameClassName="pl-6 mt-2"
								textEmbedWrapperClassName="pl-6 mt-2"
								suppressGenericEmbedIf={() => false}
							/>

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
				{/* 開いた直後にここへ着地させる＝最新レスが見えている状態 */}
				<div ref={newestReplyRef} />
			</div>

			{/* Reply composer */}
			<div className="border-t border-gray-800 mt-2">
				{replyTo !== null && (
					<div className="flex items-center justify-between px-3 pt-2 text-[10px] text-gray-500">
						<span className="text-green-400">&gt;&gt;{replyTo} に返信中</span>
						<button
							onClick={() => {
								setReplyTo(null);
								setReplyText((prev) => prev.replace(/^>>\d+\n/, ""));
							}}
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
					setImage={setReplyImageDirect}
					imageAnim={replyAnim}
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
					targetUserId={selectedUser.userId}
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
					animFrames={previewImage.animFrames}
					animFps={previewImage.animFps}
					walkPreset={previewImage.walkPreset}
					onClose={() => setPreviewImage(null)}
				/>
			)}
		</>
	);
}
