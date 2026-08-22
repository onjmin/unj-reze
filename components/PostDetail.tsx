"use client";

import {
	ArrowLeft,
	Ban,
	Copy,
	Flag,
	Heart,
	Mail,
	MessageCircle,
	MoreHorizontal,
	Pencil,
	Repeat,
	ThumbsDown,
	ThumbsUp,
	Trash2,
	User as UserIcon,
	UserPlus,
	VolumeX,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getAvatarInfo } from "@/lib/avatar";
import { createGame, createMv, loadGame, loadMv } from "@/lib/game-mv-client";
import { usePostActions } from "@/lib/hooks/usePostActions";
import {
	extractMmlFromContent,
	getDisplayContent,
	stripAnkaPrefixForSnsDisplay,
	stripMmlLine,
} from "@/lib/mml";
import type { MvManifest, MvPresetKind } from "@/lib/mv-config";
import { getDistinctTitle } from "@/lib/post-title";
import { cachePost } from "@/lib/post-cache";
import { cacheProfileSeed } from "@/lib/profile-cache";
import { startMvRemix } from "@/lib/remix";
import { ensureSessionId } from "@/lib/session";
import { postShareUrl } from "@/lib/share";
import { buildPostShareText } from "@/lib/share-text";
import { showToast } from "@/lib/toast";
import {
	isCollabAllowed,
	ORIGIN_TYPE_OPTIONS,
	OriginType,
	POST_BODY_COLLAPSE_LINES,
	Post,
} from "@/lib/types";
import { fetchText } from "@/lib/uploader";
import BbsThreadView from "./BbsThreadView";
import type { GameManifestDraft } from "./GameMaker";
import ImagePreview from "./ImagePreview";
import { useMmlSource } from "./MmlSource";
import PostEmbeds from "./PostEmbeds";
import ShareButton from "./ShareButton";

const DrawingEditor = dynamic(() => import("./DrawingEditor"), { ssr: false });
const DotDrawingEditor = dynamic(() => import("./DotDrawingEditor"), {
	ssr: false,
});
const MmlEditor = dynamic(() => import("./MmlEditor"), { ssr: false });
const GameMaker = dynamic(() => import("./GameMaker"), { ssr: false });
const MvMaker = dynamic(() => import("./MvMaker"), { ssr: false });
const PostComposer = dynamic(() => import("./PostComposer"), { ssr: false });
const EditPostModal = dynamic(() => import("./EditPostModal"), { ssr: false });
const DeletePostModal = dynamic(() => import("./DeletePostModal"), {
	ssr: false,
});
const OriginTypeModal = dynamic(() => import("./OriginTypeModal"), {
	ssr: false,
});

import CollabSelector from "./CollabSelector";
import UserActionMenu from "./UserActionMenu";

interface PostDetailProps {
	post: Post;
}

export default function PostDetail({ post: initial }: PostDetailProps) {
	const router = useRouter();
	const [bbsMode, setBbsMode] = useState("SNSモード");

	useEffect(() => {
		if (typeof localStorage !== "undefined") {
			const saved = localStorage.getItem("unj_bbs_mode");
			if (saved) {
				Promise.resolve().then(() => setBbsMode(saved));
			}
		}
	}, []);

	const [post, setPost] = useState<Post>(initial);
	// MML本文はR2にある（content にはマーカーだけ）。「曲を編集」導線はここで
	// 解決済みの本文を使い回す。独自に都度フェッチすると失敗時の扱いがずれて
	// 「編集画面に移行できない」「MMLが空の編集画面に遷移する」の両方の温床になっていた。
	const { mml: resolvedOwnMml } = useMmlSource(post);
	const [replyText, setReplyText] = useState("");
	const [replyTo, setReplyTo] = useState<Post | null>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [following, setFollowing] = useState(false);
	const [blocked, setBlocked] = useState(false);
	const [muted, setMuted] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const [userId, setUserId] = useState("名無しvFZ");
	const [userSlug, setUserSlug] = useState<string | undefined>(undefined);
	const [showReportModal, setShowReportModal] = useState(false);
	const [reportReason, setReportReason] = useState("");
	const [reportToast, setReportToast] = useState(false);

	const [composerOpen, setComposerOpen] = useState(false);
	const [replyImage, setReplyImage] = useState<string | null>(null);
	/** replyImage が DrawingEditor/DotDrawingEditor 経由か（app/page.tsx の attachedImageIsDrawn と同じ役割） */
	const [replyImageIsDrawn, setReplyImageIsDrawn] = useState(false);
	/** PostComposer の setImage に渡す直接setter。プレーンなファイル選択のときはここを通るので必ず false に倒す */
	const setReplyImageDirect = useCallback((v: string | null) => {
		setReplyImage(v);
		setReplyImageIsDrawn(false);
	}, []);
	const [replyMml, setReplyMml] = useState<string | null>(null);
	const [replyGameDraft, setReplyGameDraft] = useState<{
		manifest: GameManifestDraft;
		title: string;
		preset: string;
	} | null>(null);
	const [replyMvDraft, setReplyMvDraft] = useState<{
		manifest: MvManifest;
		title: string;
		preset: MvPresetKind;
	} | null>(null);
	const [replyOriginType, setReplyOriginType] = useState<
		OriginType | undefined
	>(undefined);
	const [activeScreen, setActiveScreen] = useState<string | null>(null);
	const [collabImageUrl, setCollabImageUrl] = useState<string | undefined>(
		undefined,
	);
	const [editMmlText, setEditMmlText] = useState<string | undefined>(undefined);
	// null=トップ投稿自身を編集中。返信のMMLを編集する場合はその返信を保持する
	// （返信のMV編集がmvId単体で完結するのと違い、MMLは post.content の marker行を
	// 書き換えて api.posts.edit に渡す必要があるため、「どのpost/replyか」を持ち回る）。
	const [editMmlTarget, setEditMmlTarget] = useState<Post | null>(null);
	const [collabMml, setCollabMml] = useState<string | undefined>(undefined);
	// mvId を持たせるのは、返信のMVも同じ画面で編集するため（トップレベルの post.mvId 固定にしない）
	const [editMvDraft, setEditMvDraft] = useState<{
		mvId: string;
		manifest: MvManifest;
		title: string;
		preset: MvPresetKind;
	} | null>(null);
	const [editGameDraft, setEditGameDraft] = useState<{
		manifest: GameManifestDraft;
		title: string;
		preset: string;
	} | null>(null);
	const [collabDotSize, setCollabDotSize] = useState<
		{ w: number; h: number } | undefined
	>(undefined);
	const [replyDotSize, setReplyDotSize] = useState<
		{ w: number; h: number } | null
	>(null);
	const [replyAnim, setReplyAnim] = useState<{
		animFrames: number;
		animFps: number;
		walkPreset?: string;
	} | null>(null);
	const [showCollabSelector, setShowCollabSelector] = useState(false);
	const [previewImage, setPreviewImage] = useState<{
		src: string;
		alt?: string;
		animFrames?: number | null;
		animFps?: number | null;
		walkPreset?: string | null;
	} | null>(null);

	const [showEditModal, setShowEditModal] = useState(false);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [showOriginModal, setShowOriginModal] = useState(false);

	const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
	const [avatarColor, setAvatarColor] = useState("from-blue-500 to-indigo-600");
	const [selectedUser, setSelectedUser] = useState<{
		displayName: string;
		slug?: string;
	} | null>(null);
	const [avatarMenuPos, setAvatarMenuPos] = useState<{
		x: number;
		y: number;
	} | null>(null);

	const handleAvatarClick = useCallback(
		(
			user: { displayName: string; slug?: string },
			pos: { x: number; y: number },
		) => {
			setSelectedUser(user);
			setAvatarMenuPos(pos);
		},
		[],
	);

	useEffect(() => {
		const targetSlug = post.slug || post.displayName;
		if (!userSlug || userSlug === targetSlug) return;
		api.mute
			.list(userSlug)
			.then((r) => setMuted(r.muted.includes(targetSlug)))
			.catch(() => {});
		api.block
			.list(userSlug)
			.then((r) => setBlocked(r.blocked.includes(targetSlug)))
			.catch(() => {});
	}, [userSlug, post.slug, post.displayName]);

	const [prevInitial, setPrevInitial] = useState(initial);
	if (prevInitial !== initial) {
		setPrevInitial(initial);
		setPost((prev) => {
			if (prev.id !== initial.id) return initial;
			const pendingReplies = prev.replies.filter((r) =>
				r.id.startsWith("temp-"),
			);
			if (pendingReplies.length === 0) return initial;
			const existingIds = new Set(initial.replies.map((r) => r.id));
			const unmerged = pendingReplies.filter((r) => !existingIds.has(r.id));
			if (unmerged.length === 0) return initial;
			return {
				...initial,
				repliesCount: initial.replies.length + unmerged.length,
				replies: [...initial.replies, ...unmerged],
			};
		});
	}

	useEffect(() => {
		cachePost(initial);
	}, [initial]);

	useEffect(() => {
		const sessionId = ensureSessionId();
		api.auth
			.anonymous(sessionId)
			.then((user) => {
				setUserId(user.displayName);
				setUserSlug(user.slug);
				setAvatarUrl(user.avatarUrl);
				if (user.avatarColor) setAvatarColor(user.avatarColor);
			})
			.catch(() => {});
	}, []);

	const uiSessionRef = useRef(0);
	const replySubmittingRef = useRef(false);
	const beginUiSession = useCallback(() => {
		uiSessionRef.current += 1;
		return uiSessionRef.current;
	}, []);
	const openComposer = useCallback(
		(target: Post | null) => {
			beginUiSession();
			setReplyTo(target);
			setComposerOpen(true);
			// BBSモードへ切り替えても誰への返信か分かるよう、レス番号(>>N)を
			// content-text に直接埋め込む。番号はBbsThreadViewと同じ
			// [post, ...post.replies] の並び順で採番する。
			if (target) {
				const allPosts: Post[] = [post, ...post.replies];
				const num = allPosts.findIndex((p) => p.id === target.id) + 1;
				if (num > 0) {
					setReplyText((prev) => `>>${num}\n${prev.replace(/^>>\d+\n/, "")}`);
				}
			} else {
				setReplyText((prev) => prev.replace(/^>>\d+\n/, ""));
			}
		},
		[beginUiSession, post],
	);
	const openScreen = useCallback(
		(screen: string) => {
			beginUiSession();
			setActiveScreen(screen);
		},
		[beginUiSession],
	);

	const handleComposerClose = () => {
		beginUiSession();
		setComposerOpen(false);
		setReplyTo(null);
		setReplyText((prev) => prev.replace(/^>>\d+\n/, ""));
	};
	// いいね／低評価／リポスト／ハートは usePostActions に集約（フィード/検索と同じ実装を共有）。
	// 以前はここに専用のデバウンス・楽観的更新ロジックを再実装しており、
	// API失敗時のロールバック/トーストが欠けたまま放置されていた。
	const { handleLike, handleDislike, handleRepost, handleHeart } =
		usePostActions(userId, (_postId, updater) => setPost(updater));
	const [bodyExpanded, setBodyExpanded] = useState(false);

	const toggleMenu = (e: React.MouseEvent) => {
		e.stopPropagation();
		setMenuOpen((v) => !v);
	};

	const handleMenuCopy = () => {
		navigator.clipboard.writeText(post.content);
		setMenuOpen(false);
	};

	const handleMenuFollow = () => {
		setFollowing((v) => !v);
		setMenuOpen(false);
	};

	const handleMenuBlock = async () => {
		setMenuOpen(false);
		const targetSlug = post.slug || post.displayName;
		if (!userSlug || userSlug === targetSlug) return;
		const was = blocked;
		setBlocked(!was);
		try {
			if (was) await api.block.unblock(userSlug, targetSlug);
			else await api.block.block(userSlug, targetSlug);
			showToast("info", was ? "ブロックを解除しました" : "ブロックしました");
		} catch {
			setBlocked(was);
			showToast("error", "ブロックに失敗しました");
		}
	};

	const handleMenuMute = async () => {
		setMenuOpen(false);
		const targetSlug = post.slug || post.displayName;
		if (!userSlug || userSlug === targetSlug) return;
		const was = muted;
		setMuted(!was);
		try {
			if (was) await api.mute.unmute(userSlug, targetSlug);
			else await api.mute.mute(userSlug, targetSlug);
			showToast("info", was ? "ミュートを解除しました" : "ミュートしました");
		} catch {
			setMuted(was);
			showToast("error", "ミュートに失敗しました");
		}
	};

	const handleMenuReport = () => {
		setMenuOpen(false);
		setShowReportModal(true);
	};

	const submitReport = useCallback(async () => {
		try {
			await api.report.create({
				reporterSlug: userSlug || "名無し",
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
	}, [userSlug, post.id, reportReason]);

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

	const handleCreateReplyFromComposer = async () => {
		if (replySubmittingRef.current) return;
		replySubmittingRef.current = true;
		const session = beginUiSession();
		const targetParent = replyTo ?? post;
		const parts: string[] = [];
		if (replyText.trim()) parts.push(replyText.trim());
		if (replyMml) parts.push(`#mml ${replyMml}`);
		const content = parts.join("\n");

		const capturedImage = replyImage;
		const capturedImageIsDrawn = replyImageIsDrawn;
		const capturedMml = replyMml;
		const capturedGameDraft = replyGameDraft;
		const capturedMvDraft = replyMvDraft;
		const capturedOriginType = replyOriginType;
		const capturedDotSize = replyDotSize;
		const capturedAnim = replyAnim;

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
			avatarColor: avatarColor,
			avatarUrl: avatarUrl,
			heartsTotal: 0,
			replies: [],
			threadId: post.id,
			parentPostId: targetParent.id,
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

		setReplyText("");
		setReplyImage(null);
		setReplyImageIsDrawn(false);
		setReplyDotSize(null);
		setReplyAnim(null);
		setReplyMml(null);
		setReplyGameDraft(null);
		setReplyMvDraft(null);
		setReplyOriginType(undefined);
		setComposerOpen(false);

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
				parentPostId: targetParent.id,
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
			showToast("error", "返信の送信に失敗しました", { id: toastId });
		} finally {
			replySubmittingRef.current = false;
		}
		if (uiSessionRef.current === session) setReplyTo(null);
	};

	const handleEditReply = async (
		replyId: string,
		content: string,
		originType?: OriginType,
		imageSrc?: string | null,
		dotMeta?: {
			dotW?: number | null;
			dotH?: number | null;
			animFrames?: number | null;
			animFps?: number | null;
			walkPreset?: string | null;
		},
	) => {
		const prevReply = post.replies.find((r) => r.id === replyId);
		setPost((p) => ({
			...p,
			replies: p.replies.map((r) =>
				r.id === replyId
					? {
							...r,
							content,
							originType,
							imageSrc:
								imageSrc === null ? undefined : (imageSrc ?? r.imageSrc),
							hasImage:
								imageSrc === null ? false : imageSrc ? true : r.hasImage,
							isEdited: true,
						}
					: r,
			),
		}));
		try {
			const updated = await api.posts.edit(
				replyId,
				userId,
				content,
				originType,
				imageSrc === null ? "" : imageSrc,
				dotMeta,
			);
			setPost((p) => ({
				...p,
				replies: p.replies.map((r) =>
					r.id === replyId
						? {
								...r,
								content: updated.content,
								originType: updated.originType,
								imageSrc: updated.imageSrc,
								hasImage: updated.hasImage,
								dotW: updated.dotW,
								dotH: updated.dotH,
								animFrames: updated.animFrames,
								animFps: updated.animFps,
								walkPreset: updated.walkPreset,
								isEdited: true,
							}
						: r,
				),
			}));
		} catch {
			if (prevReply) {
				setPost((p) => ({
					...p,
					replies: p.replies.map((r) => (r.id === replyId ? prevReply : r)),
				}));
			}
			showToast("error", "返信の編集に失敗しました");
		}
	};

	const handleDeleteReply = async (replyId: string) => {
		const prevReplies = post.replies;
		setPost((p) => ({
			...p,
			replies: p.replies.filter((r) => r.id !== replyId),
			repliesCount: Math.max(0, p.repliesCount - 1),
		}));
		try {
			await api.posts.remove(replyId, userId);
		} catch {
			setPost((p) => ({
				...p,
				replies: prevReplies,
				repliesCount: prevReplies.length,
			}));
			showToast("error", "返信の削除に失敗しました");
		}
	};

	const handleOpenCollab = useCallback(async (p: Post) => {
		// 導線側でも弾いているが、権利表記を最終的に守るのはこの入り口
		if (!isCollabAllowed(p.originType)) return;
		if (p.hasGame && p.gameId) {
			try {
				// manifest はDBに無いのでR2から。loadGame が両方まとめて解決する
				const loaded = await loadGame(p.gameId);
				if (!loaded) throw new Error();
				setReplyGameDraft({
					manifest: loaded.manifest,
					title: loaded.record.title,
					preset: "action",
				});
				setActiveScreen("gamemaker");
				return;
			} catch {}
		}
		if (p.hasMv && p.mvId) {
			try {
				const loaded = await loadMv(p.mvId);
				if (!loaded) throw new Error();
				setReplyMvDraft({
					manifest: loaded.manifest,
					title: loaded.record.title,
					preset: loaded.record.preset || "pianoRoll",
				});
				setActiveScreen("mvmaker");
				return;
			} catch {}
		}

		// MML本文はR2にある。content にはマーカーしか残っていないので、
		// hasMml/mmlUrl を経由しないと(inline抽出は常に空文字になる)コラボ編集を開始できない
		if (!p.hasImage && (p.hasMml || extractMmlFromContent(p.content))) {
			const inline = extractMmlFromContent(p.content);
			try {
				const pMml = inline || (p.mmlUrl ? await fetchText(p.mmlUrl) : "");
				if (pMml) {
					setCollabMml(pMml);
					setActiveScreen("mml");
					return;
				}
			} catch {
				showToast("error", "MMLの読み込みに失敗しました");
				return;
			}
		}
		if (p.dotW && p.dotH) {
			setCollabDotSize({ w: p.dotW, h: p.dotH });
		} else {
			setCollabDotSize(undefined);
		}
		setCollabImageUrl(p.imageSrc);
		setShowCollabSelector(true);
	}, []);

	const handleCollabSelectDrawing = useCallback(() => {
		setShowCollabSelector(false);
		setActiveScreen("drawing");
	}, []);

	const handleCollabSelectDotDrawing = useCallback(
		(w?: number, h?: number) => {
			if (w && h) {
				setCollabDotSize({ w, h });
			} else {
				setCollabDotSize(undefined);
			}
			setShowCollabSelector(false);
			setActiveScreen("dotdrawing");
		},
		[],
	);

	const handleCloseCollabSelector = useCallback(() => {
		setShowCollabSelector(false);
		setCollabImageUrl(undefined);
		setCollabDotSize(undefined);
	}, []);

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
		setCollabImageUrl(undefined);
		setReplyText("#お絵描き 自作イラスト完成！");
	};

	const handleSaveDotDrawing = (
		canvasData: string,
		gridW?: number,
		gridH?: number,
		animMeta?: { animFrames: number; animFps: number; walkPreset?: string },
	) => {
		setReplyImage(canvasData);
		setReplyImageIsDrawn(true);
		if (gridW && gridH) {
			setReplyDotSize({ w: gridW, h: gridH });
		} else {
			setReplyDotSize(null);
		}
		if (animMeta) {
			setReplyAnim(animMeta);
		} else {
			setReplyAnim(null);
		}
		setActiveScreen(null);
		setCollabImageUrl(undefined);
		setReplyText("#ドット絵 自作ドット絵完成！");
	};

	const handleSaveMml = (mml: string) => {
		setActiveScreen(null);
		setCollabMml(undefined);
		setReplyMml(mml);
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

	const handleSaveEdit = async (
		newContent: string,
		nextImageSrc?: string | null,
		dotMeta?: {
			dotW?: number | null;
			dotH?: number | null;
			animFrames?: number | null;
			animFps?: number | null;
			walkPreset?: string | null;
		},
	) => {
		const prevPost = post;
		setShowEditModal(false);
		setPost((p) => ({
			...p,
			content: newContent,
			imageSrc:
				nextImageSrc === null ? undefined : (nextImageSrc ?? p.imageSrc),
			hasImage:
				nextImageSrc === null ? false : nextImageSrc ? true : p.hasImage,
			isEdited: true,
		}));
		try {
			const updated = await api.posts.edit(
				post.id,
				userId,
				newContent,
				post.originType,
				nextImageSrc === null ? "" : nextImageSrc,
				dotMeta,
			);
			setPost(updated);
			router.refresh();
		} catch {
			setPost(prevPost);
			showToast("error", "投稿の編集に失敗しました");
		}
	};

	const handleEditArt = () => {
		setMenuOpen(false);
		setCollabImageUrl(post.imageSrc);
		if (post.content.includes("#ドット絵")) {
			setActiveScreen("edit-dotdrawing");
		} else {
			setActiveScreen("edit-drawing");
		}
	};

	const handleSaveEditedImage = async (canvasData: string) => {
		const prevPost = post;
		setActiveScreen(null);
		setCollabImageUrl(undefined);
		let finalImageSrc = canvasData;
		if (canvasData.startsWith("data:")) {
			try {
				const res = await api.upload.image({ image: canvasData });
				finalImageSrc = res.url;
			} catch {
				showToast("error", "画像のアップロードに失敗しました");
				return;
			}
		}
		setPost((p) => ({
			...p,
			imageSrc: finalImageSrc,
			hasImage: true,
			isEdited: true,
		}));
		try {
			const updated = await api.posts.edit(
				post.id,
				userId,
				post.content,
				post.originType,
				finalImageSrc,
			);
			setPost(updated);
			router.refresh();
		} catch {
			setPost(prevPost);
			showToast("error", "画像の編集に失敗しました");
		}
	};

	// mml はEditPostModal側で既に解決済み（useMmlSource）のものを受け取る。
	// ここで独自に再フェッチすると、失敗時の扱いがずれて「編集画面に移行できない」
	// 「MMLが空の編集画面に遷移する」の両方の温床になっていた。
	//
	// target を取るのは、返信ツリー内の返信のMMLもこの同じ画面で編集するため
	// （handleEditMvFor と同じ理由）。トップ投稿自身なら target===post なので
	// editMmlTarget は null のままにし、保存時は従来通り setPost で更新する。
	const handleEditMusicFor = (target: Post, mml: string) => {
		setEditMmlTarget(target.id === post.id ? null : target);
		setEditMmlText(mml);
		setActiveScreen("edit-mml");
	};

	const handleEditMusic = (mml: string) => {
		setMenuOpen(false);
		handleEditMusicFor(post, mml);
	};

	/** 指定ポストのMVを編集画面で開く。トップレベル投稿と返信の両方がここを通る。 */
	const handleEditMvFor = useCallback(async (target: Post) => {
		if (!target.mvId) return;
		try {
			const loaded = await loadMv(target.mvId);
			if (!loaded) throw new Error();
			setEditMvDraft({
				mvId: target.mvId,
				manifest: loaded.manifest,
				title: loaded.record.title,
				preset: loaded.record.preset || "pianoRoll",
			});
			setActiveScreen("edit-mv");
		} catch {
			showToast("error", "MVの読み込みに失敗しました");
		}
	}, []);

	const handleEditMv = async () => {
		setMenuOpen(false);
		await handleEditMvFor(post);
	};

	const handleRemixMv = async () => {
		setMenuOpen(false);
		if (!post.mvId) return;
		try {
			const loaded = await loadMv(post.mvId);
			if (!loaded) throw new Error();
			const mv = loaded.record;
			startMvRemix({
				manifest: loaded.manifest,
				title: `${mv.title || post.mvTitle || "MV"}（改造）`,
				preset: mv.preset || post.mvPreset || "pianoRoll",
				sourceMvId: post.mvId,
				sourceTitle: mv.title || post.mvTitle || "MV",
			});
		} catch {
			showToast("error", "MVの読み込みに失敗しました");
		}
	};

	const handleEditGame = async () => {
		setMenuOpen(false);
		if (!post.gameId) return;
		try {
			const loaded = await loadGame(post.gameId);
			if (!loaded) throw new Error();
			setEditGameDraft({
				manifest: loaded.manifest,
				title: loaded.record.title,
				preset: "action",
			});
			setActiveScreen("edit-game");
		} catch {
			showToast("error", "ゲームの読み込みに失敗しました");
		}
	};

	const handleSaveEditedMv = async (data: {
		manifest: MvManifest;
		title: string;
		preset: MvPresetKind;
	}) => {
		const mvId = editMvDraft?.mvId;
		setActiveScreen(null);
		if (!mvId) return;
		try {
			await api.mvs.edit(mvId, { title: data.title, manifest: data.manifest });
			showToast("success", "MVを更新しました");
			router.refresh();
		} catch {
			showToast("error", "MVの更新に失敗しました");
		}
	};

	const handleSaveEditedGame = async (
		manifest: GameManifestDraft,
		meta: { title: string; preset: string },
	) => {
		setActiveScreen(null);
		try {
			await api.games.edit(post.gameId!, { title: meta.title, manifest });
			showToast("success", "ゲームを更新しました");
			router.refresh();
		} catch {
			showToast("error", "ゲームの更新に失敗しました");
		}
	};

	const handleSaveEditedMusic = async (mml: string) => {
		const target = editMmlTarget ?? post;
		const newContent = `${stripMmlLine(target.content)}\n#mml ${mml}`.trim();
		setActiveScreen(null);
		if (!editMmlTarget) {
			const prevPost = post;
			setPost((p) => ({ ...p, content: newContent, isEdited: true }));
			try {
				const updated = await api.posts.edit(
					post.id,
					userId,
					newContent,
					post.originType,
				);
				setPost(updated);
				router.refresh();
			} catch {
				setPost(prevPost);
				showToast("error", "楽曲の編集に失敗しました");
			}
		} else {
			// 返信のMML編集は、返信の本文編集と同じ経路（handleEditReply）に乗せる。
			// 別経路を作るとロールバック・replies配列の更新ロジックが二重管理になる。
			await handleEditReply(target.id, newContent, target.originType);
		}
		setEditMmlTarget(null);
	};

	const handleSelectOriginType = async (ot: OriginType | undefined) => {
		const prevPost = post;
		setShowOriginModal(false);
		setPost((p) => ({ ...p, originType: ot }));
		try {
			const updated = await api.posts.edit(post.id, userId, post.content, ot);
			setPost(updated);
			router.refresh();
		} catch {
			setPost(prevPost);
			showToast("error", "権利表記の更新に失敗しました");
		}
	};

	const handleConfirmDelete = async () => {
		setShowDeleteModal(false);
		try {
			await api.posts.remove(post.id, userId);
			router.push("/");
			router.refresh();
		} catch {
			showToast("error", "投稿の削除に失敗しました");
		}
	};

	const handleMenuEdit = () => {
		setShowEditModal(true);
		setMenuOpen(false);
	};

	const handleMenuOriginType = () => {
		setShowOriginModal(true);
		setMenuOpen(false);
	};

	const handleMenuDelete = () => {
		setShowDeleteModal(true);
		setMenuOpen(false);
	};

	const isSelf = !!userSlug && (post.slug || post.displayName) === userSlug;

	// MML本文はR2にある。content にはマーカーだけが残るので、埋め込み表示可否の
	// 判定は hasMml も見る（inline抽出は常に空文字になる）
	const hasMmlContent = post.hasMml || !!extractMmlFromContent(post.content);

	if (bbsMode === "掲示板モード") {
		return <BbsThreadView post={initial} openCollab={handleOpenCollab} />;
	}

	return (
		<>
			<div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
				<div className="flex items-center px-3 h-11">
					<Link
						href="/"
						className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors"
					>
						<ArrowLeft size={18} className="text-gray-300" />
					</Link>
					<span className="ml-3 font-bold text-sm text-gray-200">投稿</span>
					<div ref={menuRef} className="relative ml-auto">
						<button
							onClick={toggleMenu}
							className="p-2.5 -mr-1 rounded hover:bg-gray-100/10 transition-colors"
						>
							<MoreHorizontal size={18} className="text-gray-400" />
						</button>
						{menuOpen && (
							<div
								role="menu"
								className="absolute right-0 top-8 z-50 w-48 rounded-lg border border-gray-700 bg-[#131720] shadow-xl py-1 text-xs"
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
								{isSelf && post.hasImage && (
									<button
										role="menuitem"
										onClick={handleEditArt}
										className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
									>
										<Pencil size={12} className="shrink-0" />
										<span>作品を編集</span>
									</button>
								)}
								{isSelf && hasMmlContent && (
									<button
										role="menuitem"
										disabled={!resolvedOwnMml}
										onClick={() =>
											resolvedOwnMml && handleEditMusic(resolvedOwnMml)
										}
										className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors disabled:opacity-40 disabled:pointer-events-none"
									>
										<Pencil size={12} className="shrink-0" />
										<span>曲を編集</span>
									</button>
								)}
								{isSelf && post.hasMv && (
									<button
										role="menuitem"
										onClick={handleEditMv}
										className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
									>
										<Pencil size={12} className="shrink-0" />
										<span>MVを編集</span>
									</button>
								)}
								{isSelf && post.hasGame && (
									<button
										role="menuitem"
										onClick={handleEditGame}
										className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
									>
										<Pencil size={12} className="shrink-0" />
										<span>ゲームを編集</span>
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
								{!isSelf && post.hasMv && isCollabAllowed(post.originType) && (
									<button
										role="menuitem"
										onClick={handleRemixMv}
										className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
									>
										<Pencil size={12} className="shrink-0" />
										<span>MVを改造する</span>
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
												: `${getAvatarInfo(post.displayName).username}さんをフォロー`}
										</span>
									</button>
								)}
								{!isSelf && (
									<button
										role="menuitem"
										onClick={() => {
											setMenuOpen(false);
											router.push(`/user/${post.slug || post.displayName}`);
										}}
										className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
									>
										<UserIcon size={12} className="shrink-0" />
										<span>プロフページ</span>
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
												? "ミュート解除"
												: `${getAvatarInfo(post.displayName).username}さんをミュート`}
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
												? "ブロック解除"
												: `${getAvatarInfo(post.displayName).username}さんをブロック`}
										</span>
									</button>
								)}
								<div className="border-t border-gray-800 my-1" />
								<button
									role="menuitem"
									onClick={handleMenuReport}
									className="flex items-center gap-2.5 w-full px-3 py-2 text-red-400 hover:bg-gray-100/10 text-left transition-colors"
								>
									<Flag size={12} className="shrink-0" />
									<span>ポストを通報</span>
								</button>
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="flex p-3 space-x-2.5">
				<div
					onClick={(e) => {
						e.stopPropagation();
						cacheProfileSeed({
							slug: post.slug || undefined,
							displayName: post.displayName,
							avatarUrl: post.avatarUrl,
						});
						if (isSelf) {
							router.push(`/user/${post.slug || post.displayName}`);
						} else {
							const rect = e.currentTarget.getBoundingClientRect();
							handleAvatarClick(
								{ displayName: post.displayName, slug: post.slug || undefined },
								{ x: rect.left, y: rect.bottom },
							);
						}
					}}
					className="w-9 h-9 rounded-full shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white hover:opacity-80 transition-opacity relative overflow-hidden cursor-pointer"
					style={
						post.avatarUrl ? undefined : getAvatarInfo(post.displayName).style
					}
				>
					{post.avatarUrl ? (
						<img
							src={post.avatarUrl}
							alt={getAvatarInfo(post.displayName).username}
							className="w-full h-full object-cover rounded-full"
						/>
					) : (
						(() => {
							const AvatarIcon = getAvatarInfo(post.displayName).Icon;
							return (
								<AvatarIcon className="w-5 h-5 text-white/40 leading-none" />
							);
						})()
					)}
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-baseline space-x-1.5 mb-0.5">
						<span className="font-bold text-sm text-gray-200">
							{getAvatarInfo(post.displayName).username}
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
						<span className="text-gray-500 text-xs font-medium">
							{post.time}
							{post.isEdited && (
								<span className="ml-1 text-[9px] text-gray-500/70">
									(編集済み)
								</span>
							)}
						</span>
					</div>

					{(() => {
						const distinctTitle = getDistinctTitle(post);
						return distinctTitle ? (
							<div className="text-base font-bold text-gray-100 break-words leading-snug mb-1">
								{distinctTitle}
							</div>
						) : null;
					})()}
					<div className="text-[15px] text-gray-200 whitespace-pre-wrap break-words leading-relaxed mb-2.5">
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
								onClick={() => setBodyExpanded((v) => !v)}
								className="text-[11px] text-blue-400 hover:underline mb-2.5 -mt-1.5 block"
							>
								{bodyExpanded ? "折りたたむ" : "続きを読む"}
							</button>
						);
					})()}

					<PostEmbeds
						post={post}
						onOpenCollab={handleOpenCollab}
						onPreviewImage={(img) => setPreviewImage(img)}
						userId={userId}
						suppressGenericEmbedIf={(p) => !!(p.hasImage || p.hasGame)}
					/>

					<div className="flex justify-between items-center text-gray-500 mt-2 max-w-[320px]">
						<button
							onClick={() => handleLike(post.id)}
							className={`flex items-center space-x-1 hover:text-blue-400 transition-colors ${post.liked ? "text-blue-400 font-bold" : ""}`}
						>
							<ThumbsUp size={14} />
							<span className="text-[11px]">{post.likes || ""}</span>
						</button>
						<button
							onClick={() => handleDislike(post.id)}
							className={`flex items-center space-x-1 hover:text-red-500 transition-colors ${post.disliked ? "text-red-500 font-bold" : ""}`}
						>
							<ThumbsDown size={14} />
							<span className="text-[11px]">{post.dislikes || ""}</span>
						</button>
						<button
							onClick={() => openComposer(null)}
							className="flex items-center space-x-1 hover:text-green-400 transition-colors"
						>
							<MessageCircle size={14} />
							<span className="text-[11px]">{post.repliesCount || ""}</span>
						</button>
						<button
							onClick={() => handleRepost(post.id)}
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
							onClick={() => handleHeart(post.id)}
							className="flex items-center space-x-1 hover:text-pink-400 transition-colors"
						>
							<Heart size={12} className="fill-current text-pink-600/65" />
							<span className="text-[10px]">{post.heartsTotal || "0"}</span>
						</button>
						<ShareButton
							url={postShareUrl(post.id)}
							text={buildPostShareText(post)}
						/>
					</div>
				</div>
			</div>

			{post.replies.length > 0 &&
				(() => {
					const ids = new Set(post.replies.map((r) => r.id));
					const roots = post.replies.filter(
						(r) =>
							!r.parentPostId ||
							r.parentPostId === post.id ||
							!ids.has(r.parentPostId),
					);
					return (
						<div className="border-t border-gray-800 px-3 py-3 space-y-2">
							<span className="text-[11px] text-gray-500 font-bold">返信</span>
							{roots.map((reply) => {
								return (
									<ReplyTreeItem
										key={reply.id}
										post={reply}
										replies={post.replies}
										depth={0}
										onReply={openComposer}
										userId={userId}
										userSlug={userSlug}
										onEdit={handleEditReply}
										onDelete={handleDeleteReply}
										onAvatarClick={handleAvatarClick}
										onPreviewImage={(src, alt, animFrames, animFps, walkPreset) =>
											setPreviewImage({
												src,
												alt,
												animFrames,
												animFps,
												walkPreset,
											})
										}
										onOpenCollab={handleOpenCollab}
										onEditMv={handleEditMvFor}
										onEditMml={handleEditMusicFor}
									/>
								);
							})}
						</div>
					);
				})()}

			<div className="border-t border-gray-800 px-3 pt-1 pb-3 space-y-1 mx-3 mb-4 mt-2">
				<div
					onClick={() => openComposer(null)}
					className="flex items-center space-x-2 bg-gray-100/5 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-100/10 transition-colors"
				>
					<span className="text-xs text-gray-500 flex-1">
						返信を書き込む...
					</span>
					<button className="text-blue-500 text-xs font-bold px-1">送信</button>
				</div>
			</div>

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

			{composerOpen && (
				<PostComposer
					userId={userId}
					avatarUrl={avatarUrl}
					text={replyText}
					setText={setReplyText}
					image={replyImage}
					setImage={setReplyImageDirect}
					mml={replyMml}
					setMml={setReplyMml}
					gameDraft={replyGameDraft}
					setGameDraft={setReplyGameDraft}
					mvDraft={replyMvDraft}
					setMvDraft={setReplyMvDraft}
					originType={replyOriginType}
					setOriginType={setReplyOriginType}
					onClose={handleComposerClose}
					onSubmit={handleCreateReplyFromComposer}
					onOpenDrawing={() => {
						setCollabImageUrl(undefined);
						handleCollabSelectDrawing();
					}}
					onOpenDotDrawing={() => {
						setCollabImageUrl(undefined);
						handleCollabSelectDotDrawing();
					}}
					onOpenMml={() => openScreen("mml")}
					onOpenGameMaker={() => openScreen("gamemaker")}
					onOpenMvMaker={() => openScreen("mvmaker")}
					replyToDisplayName={replyTo ? replyTo.displayName : post.displayName}
				/>
			)}

			{activeScreen === "drawing" && (
				<DrawingEditor
					onClose={() => {
						setActiveScreen(null);
						setCollabImageUrl(undefined);
					}}
					onSave={handleSaveDrawing}
					collabImageUrl={collabImageUrl}
				/>
			)}
			{activeScreen === "dotdrawing" && (
				<DotDrawingEditor
					onClose={() => {
						setActiveScreen(null);
						setCollabImageUrl(undefined);
						setCollabDotSize(undefined);
					}}
					onSave={handleSaveDotDrawing}
					collabImageUrl={collabImageUrl}
					initialGridW={collabDotSize?.w}
					initialGridH={collabDotSize?.h}
				/>
			)}
			{activeScreen === "gamemaker" && (
				<GameMaker
					onClose={() => setActiveScreen(null)}
					userId={userId}
					onSave={handleSaveGame}
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
			{activeScreen === "mml" && (
				<MmlEditor
					onClose={() => {
						setActiveScreen(null);
						setCollabMml(undefined);
					}}
					onSave={handleSaveMml}
					initialMml={collabMml}
				/>
			)}
			{activeScreen === "edit-drawing" && (
				<DrawingEditor
					onClose={() => {
						setActiveScreen(null);
						setCollabImageUrl(undefined);
					}}
					onSave={handleSaveEditedImage}
					collabImageUrl={collabImageUrl}
				/>
			)}
			{activeScreen === "edit-dotdrawing" && (
				<DotDrawingEditor
					onClose={() => {
						setActiveScreen(null);
						setCollabImageUrl(undefined);
					}}
					onSave={handleSaveEditedImage}
					collabImageUrl={collabImageUrl}
				/>
			)}
			{activeScreen === "edit-mml" && (
				<MmlEditor
					onClose={() => setActiveScreen(null)}
					onSave={handleSaveEditedMusic}
					initialMml={editMmlText}
					isEditing
					postId={(editMmlTarget ?? post).id}
				/>
			)}
			{activeScreen === "edit-mv" && editMvDraft && (
				<MvMaker
					onClose={() => setActiveScreen(null)}
					userId={userId}
					onSave={handleSaveEditedMv}
					initialManifest={editMvDraft.manifest}
					isEditing={true}
					mvId={editMvDraft.mvId}
				/>
			)}
			{activeScreen === "edit-game" && editGameDraft && (
				<GameMaker
					onClose={() => setActiveScreen(null)}
					userId={userId}
					onSave={handleSaveEditedGame}
					initialManifest={editGameDraft.manifest}
				/>
			)}

			{showCollabSelector && collabImageUrl && (
				<CollabSelector
					imageUrl={collabImageUrl}
					onSelectDrawing={handleCollabSelectDrawing}
					onSelectDotDrawing={handleCollabSelectDotDrawing}
					onClose={handleCloseCollabSelector}
				/>
			)}

			{showEditModal && (
				<EditPostModal
					post={post}
					onClose={() => setShowEditModal(false)}
					onSave={handleSaveEdit}
					capabilities={{
						editImage: () => {
							handleEditArt();
							setShowEditModal(false);
						},
						canRemoveImage: true,
						editMml: (mml) => {
							handleEditMusic(mml);
							setShowEditModal(false);
						},
						editGame: () => {
							handleEditGame();
							setShowEditModal(false);
						},
						removeGame: null,
						editMv: () => {
							handleEditMv();
							setShowEditModal(false);
						},
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
			{selectedUser && (
				<UserActionMenu
					isOpen={true}
					onClose={() => setSelectedUser(null)}
					targetUserDisplayName={selectedUser.displayName}
					targetUserSlug={selectedUser.slug}
					currentUserId={userId}
					currentUserSlug={userSlug}
					onMention={(username) => {
						setReplyText((prev) =>
							prev ? `${prev} @${username} ` : `@${username} `,
						);
					}}
					position={avatarMenuPos}
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
		</>
	);
}

function ReplyTreeItem({
	post,
	replies,
	depth,
	onReply,
	userId,
	userSlug,
	onEdit,
	onDelete,
	onAvatarClick,
	onPreviewImage,
	onOpenCollab,
	onEditMv,
	onEditMml,
}: {
	post: Post;
	replies: Post[];
	depth: number;
	onReply: (post: Post) => void;
	userId: string;
	userSlug?: string;
	onEdit: (
		replyId: string,
		content: string,
		originType?: OriginType,
		imageSrc?: string | null,
		dotMeta?: {
			dotW?: number | null;
			dotH?: number | null;
			animFrames?: number | null;
			animFps?: number | null;
			walkPreset?: string | null;
		},
	) => Promise<void>;
	onDelete: (replyId: string) => Promise<void>;
	onAvatarClick: (
		user: { displayName: string; slug?: string },
		pos: { x: number; y: number },
	) => void;
	onPreviewImage?: (
		src: string,
		alt?: string,
		animFrames?: number | null,
		animFps?: number | null,
		walkPreset?: string | null,
	) => void;
	onOpenCollab?: (post: Post) => void;
	onEditMv?: (post: Post) => void;
	onEditMml?: (post: Post, mml: string) => void;
}) {
	const router = useRouter();
	const children = replies.filter((r) => r.parentPostId === post.id);
	const [collapsed, setCollapsed] = useState<boolean>(false);
	const [localPost, setLocalPost] = useState<Post>(post);

	useEffect(() => {
		Promise.resolve().then(() => setLocalPost(post));
	}, [post]);

	const [menuOpen, setMenuOpen] = useState(false);
	const [muted, setMuted] = useState(false);
	const [blocked, setBlocked] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [showOriginModal, setShowOriginModal] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	const toggleMenu = (e: React.MouseEvent) => {
		e.stopPropagation();
		setMenuOpen((v) => !v);
	};

	const handleMenuCopy = () => {
		navigator.clipboard.writeText(localPost.content);
		setMenuOpen(false);
	};

	const handleMenuEdit = () => {
		setShowEditModal(true);
		setMenuOpen(false);
	};

	const handleMenuOriginType = () => {
		setShowOriginModal(true);
		setMenuOpen(false);
	};

	const handleMenuDelete = () => {
		setShowDeleteModal(true);
		setMenuOpen(false);
	};

	/** 返信者のプロフィールへ移動する。 */
	const handleMenuProfile = () => {
		setMenuOpen(false);
		cacheProfileSeed({
			slug: localPost.slug || undefined,
			displayName: localPost.displayName,
			avatarUrl: localPost.avatarUrl,
		});
		router.push(`/user/${localPost.slug || localPost.displayName}`);
	};

	// メニューを開いたときに現在のミュート/ブロック状態を取り出し、解除表記にできるようにする
	useEffect(() => {
		if (!menuOpen || !userSlug) return;
		const targetSlug = localPost.slug || localPost.displayName;
		if (userSlug === targetSlug) return;
		api.mute
			.list(userSlug)
			.then((r) => setMuted(r.muted.includes(targetSlug)))
			.catch(() => {});
		api.block
			.list(userSlug)
			.then((r) => setBlocked(r.blocked.includes(targetSlug)))
			.catch(() => {});
	}, [menuOpen, userSlug, localPost.slug, localPost.displayName]);

	/** 返信者をミュート／ブロックする。SNSモードの返信からも導線を出す。 */
	const toggleModeration = async (kind: "mute" | "block") => {
		setMenuOpen(false);
		const targetSlug = localPost.slug || localPost.displayName;
		if (!userSlug || userSlug === targetSlug) return;
		const was = kind === "mute" ? muted : blocked;
		const setLocal = kind === "mute" ? setMuted : setBlocked;
		setLocal(!was);
		try {
			if (kind === "mute") {
				if (was) await api.mute.unmute(userSlug, targetSlug);
				else await api.mute.mute(userSlug, targetSlug);
			} else {
				if (was) await api.block.unblock(userSlug, targetSlug);
				else await api.block.block(userSlug, targetSlug);
			}
			showToast(
				"info",
				kind === "mute"
					? was
						? "ミュートを解除しました"
						: "ミュートしました"
					: was
						? "ブロックを解除しました"
						: "ブロックしました",
			);
		} catch {
			setLocal(was);
			showToast("error", "設定の変更に失敗しました");
		}
	};

	// 編集結果は親（post prop）を単一の情報源とする。
	// ここで localPost を直に書き換えると、API失敗でロールバックされたときに
	// ローカルだけ新しい内容のまま残り、編集内容が反映されない／戻らない状態になる。
	const handleSaveEdit = async (
		newContent: string,
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
		await onEdit(
			localPost.id,
			newContent,
			localPost.originType,
			nextImageSrc,
			dotMeta,
		);
	};

	const handleSelectOriginType = async (ot: OriginType | undefined) => {
		setShowOriginModal(false);
		await onEdit(localPost.id, localPost.content, ot);
	};

	const handleConfirmDelete = async () => {
		await onDelete(localPost.id);
		setShowDeleteModal(false);
	};

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

	// トップレベル投稿と同じく usePostActions に集約（デバウンス無しの連打API直撃と
	// 失敗時ロールバック漏れを解消）。
	const { handleLike, handleDislike, handleRepost, handleHeart } =
		usePostActions(userId, (_id, updater) => setLocalPost(updater));

	const avatarInfo = getAvatarInfo(localPost.displayName);
	const isSelf =
		!!userSlug && (localPost.slug || localPost.displayName) === userSlug;

	return (
		<div
			style={{ marginLeft: depth * 12 }}
			className={depth > 0 ? "pl-3 border-l-2 border-gray-800/40" : ""}
		>
			<div className="flex p-3 space-x-2.5">
				<div
					onClick={(e) => {
							e.stopPropagation();
							if (isSelf) {
								router.push(`/user/${localPost.slug || localPost.displayName}`);
							} else {
								const rect = e.currentTarget.getBoundingClientRect();
								onAvatarClick(
									{
										displayName: localPost.displayName,
										slug: localPost.slug || undefined,
									},
									{ x: rect.left, y: rect.bottom },
								);
							}
						}}
						className="w-9 h-9 rounded-full shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white hover:opacity-80 transition-opacity relative overflow-hidden cursor-pointer"
						style={localPost.avatarUrl ? undefined : avatarInfo.style}
					>
						{localPost.avatarUrl ? (
							<img
								src={localPost.avatarUrl}
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
					</div>
				<div className="flex-1 min-w-0">
					<div className="flex justify-between items-baseline mb-0.5">
						<div className="flex items-baseline space-x-1.5">
							<span className="font-bold text-sm text-gray-200">
								{avatarInfo.username}
							</span>
							{isSelf && (
								<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40">
									自分
								</span>
							)}
							{(() => {
								const opt = ORIGIN_TYPE_OPTIONS.find(
									(o) => o.value === localPost.originType,
								);
								return opt ? (
									<span
										className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${opt.badgeClass}`}
									>
										{opt.label}
									</span>
								) : null;
							})()}
							{localPost.isFalseDeclaration && (
								<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40">
									虚偽申告
								</span>
							)}
							<span className="text-gray-500 text-xs font-medium">
								{localPost.time}
								{localPost.isEdited && (
									<span className="ml-1 text-[9px] text-gray-500/70">
										(編集済み)
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
									size={14}
									className="text-gray-500 hover:text-gray-300"
								/>
							</button>
							{menuOpen && (
								<div
									role="menu"
									className="absolute right-0 top-5 z-50 w-40 rounded-lg border border-gray-700 bg-[#131720] shadow-xl py-1 text-[10px]"
									onClick={(e) => e.stopPropagation()}
								>
									<button
										role="menuitem"
										onClick={handleMenuCopy}
										className="flex items-center gap-2 w-full px-2.5 py-1.5 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
									>
										<Copy size={11} className="shrink-0" />
										<span>コピー</span>
									</button>
									{isSelf && (
										<button
											role="menuitem"
											onClick={handleMenuEdit}
											className="flex items-center gap-2 w-full px-2.5 py-1.5 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
										>
											<Pencil size={11} className="shrink-0" />
											<span>編集</span>
										</button>
									)}
									{isSelf && (
										<button
											role="menuitem"
											onClick={handleMenuOriginType}
											className="flex items-center gap-2 w-full px-2.5 py-1.5 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
										>
											<Pencil size={11} className="shrink-0" />
											<span>権利表記</span>
										</button>
									)}
									{isSelf && (
										<button
											role="menuitem"
											onClick={handleMenuDelete}
											className="flex items-center gap-2 w-full px-2.5 py-1.5 text-red-400 hover:bg-gray-100/10 text-left transition-colors"
										>
											<Trash2 size={11} className="shrink-0" />
											<span>削除</span>
										</button>
									)}
									{!isSelf && (
										<button
											role="menuitem"
											onClick={handleMenuProfile}
											className="flex items-center gap-2 w-full px-2.5 py-1.5 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
										>
											<UserIcon size={11} className="shrink-0" />
											<span>プロフページ</span>
										</button>
									)}
									{!isSelf && (
										<button
											role="menuitem"
											onClick={() => toggleModeration("mute")}
											className="flex items-center gap-2 w-full px-2.5 py-1.5 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
										>
											<VolumeX size={11} className="shrink-0" />
											<span>{muted ? "ミュート解除" : "この人をミュート"}</span>
										</button>
									)}
									{!isSelf && (
										<button
											role="menuitem"
											onClick={() => toggleModeration("block")}
											className="flex items-center gap-2 w-full px-2.5 py-1.5 text-red-400 hover:bg-gray-100/10 text-left transition-colors"
										>
											<Ban size={11} className="shrink-0" />
											<span>
												{blocked ? "ブロック解除" : "この人をブロック"}
											</span>
										</button>
									)}
								</div>
							)}
						</div>
					</div>

					{(() => {
						const distinctTitle = getDistinctTitle(localPost);
						return distinctTitle ? (
							<div className="text-base font-bold text-gray-100 break-words leading-snug mb-1">
								{distinctTitle}
							</div>
						) : null;
					})()}
					<p className="text-[15px] text-gray-200 whitespace-pre-wrap break-words leading-relaxed mb-2.5">
						{(() => {
							const displayText = stripAnkaPrefixForSnsDisplay(
								getDisplayContent(localPost.content),
							);
							const lines = displayText ? displayText.split("\n") : [];
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
					</p>

					<PostEmbeds
						post={localPost}
						onOpenCollab={(p) => onOpenCollab?.(p)}
						onPreviewImage={(img) =>
							onPreviewImage?.(
								img.src,
								img.alt,
								img.animFrames,
								img.animFps,
								img.walkPreset,
							)
						}
						userId={userId}
					/>

					<div className="flex justify-between items-center text-gray-500 mt-2 max-w-[280px]">
						<button
							onClick={() => handleLike(localPost.id)}
							className={`flex items-center space-x-1 hover:text-blue-400 transition-colors ${localPost.liked ? "text-blue-400 font-bold" : ""}`}
						>
							<ThumbsUp size={14} />
							<span className="text-[11px]">{localPost.likes || ""}</span>
						</button>
						<button
							onClick={() => handleDislike(localPost.id)}
							className={`flex items-center space-x-1 hover:text-red-500 transition-colors ${localPost.disliked ? "text-red-500 font-bold" : ""}`}
						>
							<ThumbsDown size={14} />
							<span className="text-[11px]">{localPost.dislikes || ""}</span>
						</button>
						<button
							onClick={() => onReply(localPost)}
							className="flex items-center space-x-1 hover:text-green-400 transition-colors"
						>
							<MessageCircle size={14} />
							<span className="text-[11px]">{children.length || ""}</span>
						</button>
						<button
							onClick={() => handleRepost(localPost.id)}
							className={`flex items-center space-x-1 hover:text-purple-400 transition-colors ${localPost.reposted ? "text-purple-400" : ""}`}
						>
							<Repeat size={14} />
							<span className="text-[11px]">{localPost.reposts || ""}</span>
						</button>
						<button
							onClick={(e) => {
								e.stopPropagation();
								const targetSlug = localPost.slug || localPost.displayName;
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
							onClick={() => handleHeart(localPost.id)}
							className="flex items-center space-x-1 hover:text-pink-400 transition-colors"
						>
							<Heart size={12} className="fill-current text-pink-600/65" />
							<span className="text-[10px]">
								{localPost.heartsTotal || "0"}
							</span>
						</button>
					</div>

					<div className="flex items-center gap-3 mt-1">
						<button
							onClick={() => onReply(localPost)}
							className="text-[10px] text-gray-600 hover:text-blue-400 transition-colors"
						>
							返信
						</button>
						{children.length > 0 && (
							<button
								onClick={() => setCollapsed((v) => !v)}
								className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
							>
								{collapsed ? `▸ ${children.length}件` : `▾ 折り畳む`}
							</button>
						)}
					</div>
				</div>
			</div>
			{children.length > 0 && (
				<div
					className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
						collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
					}`}
				>
					<div className="overflow-hidden">
						{children.map((child) => {
							return (
								<ReplyTreeItem
									key={child.id}
									post={child}
									replies={replies}
									depth={depth + 1}
									onReply={onReply}
									userId={userId}
									userSlug={userSlug}
									onEdit={onEdit}
									onDelete={onDelete}
									onAvatarClick={onAvatarClick}
									onPreviewImage={onPreviewImage}
									onOpenCollab={onOpenCollab}
									onEditMv={onEditMv}
									onEditMml={onEditMml}
								/>
							);
						})}
					</div>
				</div>
			)}

			{showEditModal && (
				<EditPostModal
					post={localPost}
					onClose={() => setShowEditModal(false)}
					onSave={handleSaveEdit}
					capabilities={{
						// 返信ツリーには画像/ゲームのエディタを持ち込んでいないので明示的に非対応。
						// 「渡し忘れ」ではなく「未対応」であることを型の上で言い切っておく。
						// MMLだけは handleEditMusicFor 経由でトップ投稿と同じ画面を共有できる
						// （api.mvs.edit のようにID単体で完結せず post.content の書き換えが要るため
						// onEdit と同じ「対象replyを渡す」形にしてある）。
						editImage: null,
						canRemoveImage: true,
						editMml: onEditMml
							? (mml) => {
									onEditMml(localPost, mml);
									setShowEditModal(false);
								}
							: null,
						editGame: null,
						removeGame: null,
						editMv:
							onEditMv && localPost.mvId
								? () => {
										onEditMv(localPost);
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
					value={localPost.originType}
					onClose={() => setShowOriginModal(false)}
					onSelect={handleSelectOriginType}
				/>
			)}
		</div>
	);
}
