import type { GameManifestDraft } from "@/components/GameMaker";
import { type DmGate, rejectDmReason } from "./dm-rules";
import { updateGame, updateMv } from "./game-mv-client";
import { externalizeMml } from "./mml-payload";
import type { Message, Trend } from "./mock-db";
import { db as mockDbInstance } from "./mock-db";
import type { MvManifest } from "./mv-config";
import { ensureSessionId } from "./session";
import {
	decodeIdOrThrow,
	encodeId,
	encodeNotification,
	encodeOshiItem,
	encodePost,
} from "./sqids";
import {
	AnonymousUser,
	FollowUser,
	MediaSearchPost,
	Notification,
	OriginType,
	OshiItem,
	OshiItemKind,
	Post,
} from "./types";

const BASE = "/api";
const useStaticMockData =
	process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ||
	process.env.GITHUB_ACTIONS === "true";

/**
 * 書き込み系リクエストのJSON本文へセッションIDを必ず載せる。
 *
 * 本人確認はサーバー側で必ずセッションから行う（body の userId / slug は公開情報なので
 * 身元の根拠にできない）。通常はCookieで届くが、サードパーティCookie制限などで
 * 落ちる環境があるため、localStorage 由来のIDを本文にも積んで確実に届かせる。
 */
function withSessionId(init?: RequestInit): RequestInit | undefined {
	if (!init?.body || typeof init.body !== "string") return init;
	try {
		const parsed = JSON.parse(init.body);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
			return init;
		if (parsed.sessionId) return init;
		return {
			...init,
			body: JSON.stringify({ ...parsed, sessionId: ensureSessionId() }),
		};
	} catch {
		return init;
	}
}

async function fetcher<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${url}`, {
		headers: { "Content-Type": "application/json" },
		...withSessionId(init),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: "Unknown error" }));
		throw new Error(err.error || `HTTP ${res.status}`);
	}
	return res.json();
}

const staticApi = {
	auth: {
		anonymous: async (sessionId: string, _ipAddress?: string) => {
			return mockDbInstance.getOrCreateAnonymousUser(
				sessionId,
				_ipAddress || "127.0.0.1",
			);
		},
		updateProfile: async (changes: {
			displayName?: string;
			avatarUrl?: string;
			bio?: string;
		}) => {
			mockDbInstance.updateUserDisplayName(
				mockDbInstance.getOrCreateAnonymousUser(ensureSessionId(), "127.0.0.1")
					.id,
				changes.displayName,
				changes.avatarUrl,
				changes.bio,
			);
		},
		getSettings: async (slug: string) => mockDbInstance.getUserSettings(slug),
		updateSettings: async (
			settings: Partial<{
				isPrivate: boolean;
				hideFromSearch: boolean;
				hideReactions: boolean;
			}>,
		) => {
			const slug = mockDbInstance.getOrCreateAnonymousUser(
				ensureSessionId(),
				"127.0.0.1",
			).slug;
			mockDbInstance.updateUserSettings(slug, settings);
			return mockDbInstance.getUserSettings(slug);
		},
		issueMigrationToken: async () => ({
			token: mockDbInstance.issueMigrationToken(
				mockDbInstance.getOrCreateAnonymousUser(ensureSessionId(), "127.0.0.1")
					.id,
			),
		}),
		redeemMigrationToken: async (token: string, sessionId: string) => {
			const user = mockDbInstance.redeemMigrationToken(token, sessionId);
			if (!user) throw new Error("invalid or expired token");
			return user;
		},
	},
	upload: {
		image: async (data: { image: string; filename?: string }) => ({
			url: data.image,
		}),
	},
	posts: {
		list: async (
			userId?: string,
			opts?: {
				beforeId?: string;
				limit?: number;
				hasMml?: boolean;
				hasImage?: boolean;
				hasGame?: boolean;
				hasMv?: boolean;
			},
		) => {
			const beforeId = opts?.beforeId
				? decodeIdOrThrow(opts.beforeId)
				: undefined;
			const posts = await mockDbInstance.getPosts(userId, {
				limit: opts?.limit,
				beforeId,
				hasMml: opts?.hasMml,
				hasImage: opts?.hasImage,
				hasGame: opts?.hasGame,
				hasMv: opts?.hasMv,
			});
			return posts.map(encodePost);
		},
		get: async (id: string, userId?: string) => {
			const post = mockDbInstance.getPost(decodeIdOrThrow(id), userId);
			if (!post) throw new Error("Post not found");
			return encodePost(post);
		},
		create: async (data: {
			displayName?: string;
			content: string;
			hasImage?: boolean;
			imageSrc?: string;
			imageAlt?: string;
			avatarColor?: string;
			gameId?: string;
			mvId?: string;
			dotW?: number;
			dotH?: number;
			originType?: OriginType;
		}) => {
			const decodedGameId = data.gameId
				? decodeIdOrThrow(data.gameId)
				: undefined;
			const decodedMvId = data.mvId ? decodeIdOrThrow(data.mvId) : undefined;
			const post = await mockDbInstance.createPost({
				...data,
				displayName: data.displayName || "名無し",
				gameId: decodedGameId,
				mvId: decodedMvId,
			});
			return encodePost(post);
		},
		like: async (id: string, userId?: string) => {
			const post = mockDbInstance.likePost(decodeIdOrThrow(id), userId || "");
			if (!post) throw new Error("Post not found");
			return encodePost(post);
		},
		dislike: async (id: string, userId?: string) => {
			const post = mockDbInstance.dislikePost(
				decodeIdOrThrow(id),
				userId || "",
			);
			if (!post) throw new Error("Post not found");
			return encodePost(post);
		},
		heart: async (id: string, userId?: string, count?: number) => {
			const post = mockDbInstance.heartPost(
				decodeIdOrThrow(id),
				userId || "",
				count,
			);
			if (!post) throw new Error("Post not found");
			return encodePost(post);
		},
		repost: async (id: string) => {
			const post = mockDbInstance.repostPost(decodeIdOrThrow(id));
			if (!post) throw new Error("Post not found");
			return encodePost(post);
		},
		edit: async (
			id: string,
			userId: string,
			content: string,
			originType?: OriginType | null,
			imageSrc?: string,
		) => {
			const post = mockDbInstance.editPost(
				decodeIdOrThrow(id),
				userId,
				content,
				originType,
				imageSrc,
			);
			if (!post) throw new Error("Post not found or not owned");
			return encodePost(post);
		},
		remove: async (id: string, userId: string) => {
			const ok = mockDbInstance.deletePost(decodeIdOrThrow(id), userId);
			if (!ok) throw new Error("Post not found or not owned");
			return { success: true };
		},
		replies: {
			list: async (postId: string, userId?: string) => {
				const replies = await mockDbInstance.getReplies(
					decodeIdOrThrow(postId),
					userId,
				);
				return replies.map(encodePost);
			},
			create: async (
				postId: string,
				data: {
					displayName?: string;
					content: string;
					parentPostId?: string;
					hasImage?: boolean;
					imageSrc?: string;
					imageAlt?: string;
					avatarColor?: string;
					gameId?: string | number;
					mvId?: string | number;
					dotW?: number;
					dotH?: number;
					originType?: OriginType;
				},
			) => {
				const decodedParentPostId = data.parentPostId
					? decodeIdOrThrow(data.parentPostId)
					: undefined;
				const gameIdNum = data.gameId ? Number(data.gameId) : undefined;
				const mvIdNum = data.mvId ? Number(data.mvId) : undefined;
				const reply = await mockDbInstance.addReply(decodeIdOrThrow(postId), {
					...data,
					displayName: data.displayName || "名無し",
					parentPostId: decodedParentPostId,
					gameId: gameIdNum,
					mvId: mvIdNum,
				});
				if (!reply) throw new Error("Post not found");
				return encodePost(reply);
			},
		},
	},
	notifications: {
		list: async (userId?: string) => {
			const notifications = await mockDbInstance.getNotifications(userId);
			return notifications.map(encodeNotification);
		},
		unreadCount: async (userId: string) => ({
			count: mockDbInstance.getUnreadCount(userId),
		}),
		markRead: async (id: string, userId: string) => {
			mockDbInstance.markNotificationRead(decodeIdOrThrow(id), userId);
			return { success: true };
		},
		markAllRead: async (userId: string) => {
			mockDbInstance.markAllNotificationsRead(userId);
			return { success: true };
		},
		remove: async (id: string, userId: string) => {
			mockDbInstance.deleteNotification(decodeIdOrThrow(id), userId);
			return { success: true };
		},
	},
	messages: {
		list: async (userId?: string) => mockDbInstance.getMessages(userId),
		conversation: async (userId: string, partner: string) => ({
			messages: mockDbInstance.getConversation(userId, partner),
			gate: mockDbInstance.getDmGate(userId, partner),
		}),
		send: async (data: {
			sender: string;
			text: string;
			recipient?: string;
		}) => {
			if (data.recipient) {
				const gate = mockDbInstance.getDmGate(data.sender, data.recipient);
				const rejection = rejectDmReason(gate, data.text);
				if (rejection) throw new Error(rejection);
			}
			return mockDbInstance.addMessage(data);
		},
		remove: async (id: number, userId: string) => {
			const ok = mockDbInstance.deleteMessage(id, userId);
			if (!ok) throw new Error("Message not found or not owned");
			return { success: true };
		},
	},
	search: {
		trends: async () => mockDbInstance.getTrends(),
		posts: async (query: string, userId?: string) => {
			if (!query.trim()) return [];
			const posts = await mockDbInstance.searchPosts(query, userId);
			return posts.map(encodePost);
		},
		media: async (
			kind: "image" | "mml",
			query: string,
			userId?: string,
			limit?: number,
			offset?: number,
		) => {
			const safeLimit = limit ?? 50;
			const rows = await mockDbInstance.searchMedia(
				kind,
				query,
				userId,
				safeLimit + 1,
				offset,
			);
			const hasMore = rows.length > safeLimit;
			return {
				posts: rows
					.slice(0, safeLimit)
					.map((r) => ({ ...r, id: encodeId(r.id) })),
				hasMore,
			};
		},
	},
	hashtag: {
		posts: async (tag: string, userId?: string) => {
			const posts = await mockDbInstance.getPostsByHashtag(tag, userId);
			return posts.map(encodePost);
		},
	},
	users: {
		profile: async (id: string, userId?: string, tab?: string) => {
			let posts: Post[];
			// いいね/だめね/ハートの記録は displayName をキーに持つため、
			// スラッグではなく持ち主のdisplayNameで引く（サーバー側の /api/users/[id] と同じ扱い）。
			const displayName = mockDbInstance.getUserDisplayName(id) || id;
			if (tab === "likes") {
				posts = (await mockDbInstance.getLikedPosts(displayName)).map(
					encodePost,
				);
			} else if (tab === "dislikes") {
				posts = (await mockDbInstance.getDislikedPosts(displayName)).map(
					encodePost,
				);
			} else if (tab === "hearts") {
				posts = (await mockDbInstance.getHeartedPosts(displayName)).map(
					encodePost,
				);
			} else {
				posts = (await mockDbInstance.getUserPostsBySlug(id, userId)).map(
					encodePost,
				);
			}
			const avatarUrl = mockDbInstance.getUserAvatarUrl(id);
			const bio = mockDbInstance.getUserBio(id);
			return {
				id,
				displayName,
				avatarUrl,
				bio,
				posts,
				postCount: posts.length,
			};
		},
		meta: async (id: string) => ({
			id,
			displayName: mockDbInstance.getUserDisplayName(id) || id,
			avatarUrl: mockDbInstance.getUserAvatarUrl(id),
			bio: mockDbInstance.getUserBio(id),
		}),
	},
	oshi: {
		list: async (userSlug: string) =>
			mockDbInstance.listOshiItems(userSlug).map(encodeOshiItem),
		add: async (
			userSlug: string,
			item: {
				kind: OshiItemKind;
				trackId?: number;
				collectionId?: number;
				artistId?: number;
				title: string;
				subtitle?: string;
				artworkUrl?: string;
				viewUrl?: string;
				previewUrl?: string;
			},
		) => encodeOshiItem(mockDbInstance.addOshiItem(userSlug, item)),
		remove: async (userSlug: string, id: string) => {
			mockDbInstance.removeOshiItem(userSlug, decodeIdOrThrow(id));
			return { success: true };
		},
	},
	music: {
		search: async (term: string, entity: "song" | "album" | "musicArtist") => {
			const params = new URLSearchParams({
				term,
				entity,
				limit: "25",
				country: "jp",
			});
			const res = await fetch(
				`https://itunes.apple.com/search?${params.toString()}`,
			);
			return res.json();
		},
	},
	follow: {
		getCounts: async (userId: string) => mockDbInstance.getFollowCounts(userId),
		getFollowers: async (userId: string, viewerId?: string) => ({
			users: mockDbInstance.getFollowers(userId, viewerId),
		}),
		getFollowing: async (userId: string, viewerId?: string) => ({
			users: mockDbInstance.getFollowing(userId, viewerId),
		}),
		isFollowing: async (followerId: string, followedId: string) => ({
			isFollowing: mockDbInstance.isFollowing(followerId, followedId),
		}),
		follow: async (followerId: string, followedId: string) => {
			mockDbInstance.followUser(followerId, followedId);
			return { success: true };
		},
		unfollow: async (followerId: string, followedId: string) => {
			mockDbInstance.unfollowUser(followerId, followedId);
			return { success: true };
		},
	},
	block: {
		list: async (blockerSlug: string) => ({
			blocked: mockDbInstance.getBlockedSlugs(blockerSlug),
		}),
		block: async (blockerSlug: string, blockedSlug: string) => {
			mockDbInstance.blockUser(blockerSlug, blockedSlug);
			return { success: true };
		},
		unblock: async (blockerSlug: string, blockedSlug: string) => {
			mockDbInstance.unblockUser(blockerSlug, blockedSlug);
			return { success: true };
		},
	},
	mute: {
		list: async (muterSlug: string) => ({
			muted: mockDbInstance.getMutedSlugs(muterSlug),
		}),
		mute: async (muterSlug: string, mutedSlug: string) => {
			mockDbInstance.muteUser(muterSlug, mutedSlug);
			return { success: true };
		},
		unmute: async (muterSlug: string, mutedSlug: string) => {
			mockDbInstance.unmuteUser(muterSlug, mutedSlug);
			return { success: true };
		},
	},
	report: {
		create: async (data: {
			reporterSlug: string;
			targetType: string;
			targetId: string;
			reason?: string;
		}) => {
			mockDbInstance.reportContent({ ...data, reason: data.reason || "" });
			return { success: true };
		},
	},
	mvs: {
		edit: async (
			_id: string,
			_params: { title: string; manifest: unknown },
		) => {
			return { success: true };
		},
	},
	games: {
		edit: async (
			_id: string,
			_params: { title: string; manifest: unknown },
		) => {
			return { success: true };
		},
	},
};

const liveApi = {
	auth: {
		anonymous: (sessionId: string) => {
			const qs = `?sessionId=${encodeURIComponent(sessionId)}`;
			return fetcher<AnonymousUser>(`/auth/anonymous${qs}`);
		},
		/**
		 * プロフィール更新。`displayName` は省略可（アイコン/自己紹介だけ更新するときは渡さない）。
		 * 画面表示用のラベルをここへ渡すと、それが本名として保存され slug まで変わるので注意。
		 */
		updateProfile: (changes: {
			displayName?: string;
			avatarUrl?: string;
			bio?: string;
		}) =>
			fetcher<{ success: boolean }>("/auth/anonymous", {
				method: "PUT",
				body: JSON.stringify({ ...changes, sessionId: ensureSessionId() }),
			}),
		getSettings: (slug: string) =>
			fetcher<{
				isPrivate: boolean;
				hideFromSearch: boolean;
				hideReactions: boolean;
			}>(`/auth/settings?slug=${encodeURIComponent(slug)}`),
		updateSettings: (
			settings: Partial<{
				isPrivate: boolean;
				hideFromSearch: boolean;
				hideReactions: boolean;
			}>,
		) =>
			fetcher<{
				isPrivate: boolean;
				hideFromSearch: boolean;
				hideReactions: boolean;
			}>("/auth/settings", {
				method: "PUT",
				body: JSON.stringify({ settings, sessionId: ensureSessionId() }),
			}),
		issueMigrationToken: () =>
			fetcher<{ token: string }>("/auth/migrate", {
				method: "POST",
				body: JSON.stringify({ sessionId: ensureSessionId() }),
			}),
		redeemMigrationToken: (token: string, sessionId: string) =>
			fetcher<AnonymousUser>("/auth/migrate", {
				method: "PUT",
				body: JSON.stringify({ token, sessionId }),
			}),
	},
	upload: {
		image: (data: { image: string; filename?: string }) =>
			fetcher<{ url: string }>("/upload", {
				method: "POST",
				body: JSON.stringify(data),
			}),
	},
	posts: {
		/** `beforeId` を渡すとそのスレッドより古いページを取得する（キーセットページング）。 */
		list: (
			userId?: string,
			opts?: {
				beforeId?: string;
				limit?: number;
				hasMml?: boolean;
				hasImage?: boolean;
				hasGame?: boolean;
				hasMv?: boolean;
			},
		) => {
			const params = new URLSearchParams();
			if (userId) params.set("userId", userId);
			if (opts?.beforeId) params.set("beforeId", opts.beforeId);
			if (opts?.limit) params.set("limit", String(opts.limit));
			if (opts?.hasMml !== undefined) params.set("hasMml", String(opts.hasMml));
			if (opts?.hasImage !== undefined)
				params.set("hasImage", String(opts.hasImage));
			if (opts?.hasGame !== undefined)
				params.set("hasGame", String(opts.hasGame));
			if (opts?.hasMv !== undefined) params.set("hasMv", String(opts.hasMv));
			const qs = params.toString();
			return fetcher<Post[]>(`/posts${qs ? `?${qs}` : ""}`);
		},
		get: (id: string, userId?: string) => {
			const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
			return fetcher<Post>(`/posts/${id}${qs}`);
		},
		// MMLはここでR2へ逃がす。投稿系の入口を1本にしておくと、コンポーザ・返信・編集の
		// どこから来ても content にMML本文が残らない（docs/NEON_EGRESS.md）
		create: async (data: {
			displayName?: string;
			content: string;
			hasImage?: boolean;
			imageSrc?: string;
			imageAlt?: string;
			avatarColor?: string;
			gameId?: string;
			mvId?: string;
			dotW?: number;
			dotH?: number;
			originType?: OriginType;
		}) =>
			fetcher<Post>("/posts", {
				method: "POST",
				body: JSON.stringify({
					...data,
					...(await externalizeMml(data.content)),
					sessionId: ensureSessionId(),
				}),
			}),
		like: (id: string) =>
			fetcher<Post>(`/posts/${id}`, {
				method: "PUT",
				body: JSON.stringify({ action: "like", sessionId: ensureSessionId() }),
			}),
		dislike: (id: string) =>
			fetcher<Post>(`/posts/${id}`, {
				method: "PUT",
				body: JSON.stringify({
					action: "dislike",
					sessionId: ensureSessionId(),
				}),
			}),
		heart: (id: string, _userId?: string, count?: number) =>
			fetcher<Post>(`/posts/${id}`, {
				method: "POST",
				body: JSON.stringify({ count, sessionId: ensureSessionId() }),
			}),
		repost: (id: string) =>
			fetcher<Post>(`/posts/${id}`, {
				method: "PUT",
				body: JSON.stringify({
					action: "repost",
					sessionId: ensureSessionId(),
				}),
			}),
		// userId は互換のため残しているがサーバーは見ない（所有者判定はセッション）
		edit: async (
			id: string,
			userId: string,
			content: string,
			originType?: OriginType | null,
			imageSrc?: string,
		) =>
			fetcher<Post>(`/posts/${id}`, {
				method: "PATCH",
				body: JSON.stringify({
					userId,
					originType,
					imageSrc,
					...(await externalizeMml(content)),
					sessionId: ensureSessionId(),
				}),
			}),
		remove: (id: string, userId: string) =>
			fetcher<{ success: boolean }>(`/posts/${id}`, {
				method: "DELETE",
				body: JSON.stringify({ userId, sessionId: ensureSessionId() }),
			}),
		replies: {
			list: (postId: string, userId?: string) => {
				const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
				return fetcher<Post[]>(`/posts/${postId}/replies${qs}`);
			},
			create: (
				postId: string,
				data: {
					displayName?: string;
					content: string;
					parentPostId?: string;
					hasImage?: boolean;
					imageSrc?: string;
					imageAlt?: string;
					avatarColor?: string;
					gameId?: string | number;
					mvId?: string | number;
					dotW?: number;
					dotH?: number;
					originType?: OriginType;
				},
			) =>
				externalizeMml(data.content).then((mml) =>
					fetcher<Post>(`/posts/${postId}/replies`, {
						method: "POST",
						body: JSON.stringify({
							...data,
							...mml,
							sessionId: ensureSessionId(),
						}),
					}),
				),
		},
	},
	notifications: {
		list: (userId?: string) => {
			const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
			return fetcher<Notification[]>(`/notifications${qs}`);
		},
		unreadCount: (userId: string) =>
			fetcher<{ count: number }>(
				`/notifications?unread=1&userId=${encodeURIComponent(userId)}`,
			),
		markRead: (id: string, userId: string) =>
			fetcher<{ success: boolean }>("/notifications", {
				method: "PATCH",
				body: JSON.stringify({ id, userId }),
			}),
		markAllRead: (userId: string) =>
			fetcher<{ success: boolean }>("/notifications", {
				method: "PATCH",
				body: JSON.stringify({ all: true, userId }),
			}),
		remove: (id: string, userId: string) =>
			fetcher<{ success: boolean }>("/notifications", {
				method: "DELETE",
				body: JSON.stringify({ id, userId }),
			}),
	},
	messages: {
		list: (userId?: string) => {
			const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
			return fetcher<Message[]>(`/messages${qs}`);
		},
		conversation: (userId: string, partner: string) =>
			fetcher<{ messages: Message[]; gate: DmGate }>(
				`/messages?userId=${encodeURIComponent(userId)}&partner=${encodeURIComponent(partner)}`,
			),
		send: (data: { sender: string; text: string; recipient?: string }) =>
			fetcher<Message>("/messages", {
				method: "POST",
				body: JSON.stringify(data),
			}),
		remove: (id: number, userId: string) =>
			fetcher<{ success: boolean }>("/messages", {
				method: "DELETE",
				body: JSON.stringify({ id, userId }),
			}),
	},
	search: {
		trends: () => fetcher<Trend[]>("/search/trends"),
		posts: (query: string, userId?: string) => {
			const params = new URLSearchParams({ q: query });
			if (userId) params.set("userId", userId);
			return fetcher<Post[]>(`/search?${params.toString()}`);
		},
		media: (
			kind: "image" | "mml",
			query: string,
			userId?: string,
			limit?: number,
			offset?: number,
		) => {
			const params = new URLSearchParams({ kind });
			if (query.trim()) params.set("q", query.trim());
			if (userId) params.set("userId", userId);
			if (limit) params.set("limit", String(limit));
			if (offset) params.set("offset", String(offset));
			return fetcher<{ posts: MediaSearchPost[]; hasMore: boolean }>(
				`/media-search?${params.toString()}`,
			);
		},
	},
	hashtag: {
		posts: (tag: string, userId?: string) => {
			const tagClean = tag.replace(/^#/, "");
			const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
			return fetcher<Post[]>(`/hashtag/${encodeURIComponent(tagClean)}${qs}`);
		},
	},
	users: {
		profile: (id: string, userId?: string, tab?: string) => {
			const params = new URLSearchParams();
			if (userId) params.set("userId", userId);
			if (tab) params.set("tab", tab);
			const qs = params.toString() ? `?${params.toString()}` : "";
			return fetcher<{
				id: string;
				displayName: string;
				avatarUrl?: string;
				bio?: string;
				posts: Post[];
				postCount: number;
			}>(`/users/${encodeURIComponent(id)}${qs}`);
		},
		/** 表示名とアイコンだけ（投稿一覧を引かない軽い版）。 */
		meta: (id: string) =>
			fetcher<{
				id: string;
				displayName: string;
				avatarUrl?: string;
				bio?: string;
			}>(`/users/${encodeURIComponent(id)}?meta=1`),
	},
	oshi: {
		list: (userSlug: string) =>
			fetcher<OshiItem[]>(`/oshi?slug=${encodeURIComponent(userSlug)}`),
		add: (
			userSlug: string,
			item: {
				kind: OshiItemKind;
				trackId?: number;
				collectionId?: number;
				artistId?: number;
				title: string;
				subtitle?: string;
				artworkUrl?: string;
				viewUrl?: string;
				previewUrl?: string;
			},
		) =>
			fetcher<OshiItem>("/oshi", {
				method: "POST",
				body: JSON.stringify({ userSlug, ...item }),
			}),
		remove: (userSlug: string, id: string) =>
			fetcher<{ success: boolean }>(`/oshi/${id}`, {
				method: "DELETE",
				body: JSON.stringify({ userSlug }),
			}),
	},
	music: {
		search: async (term: string, entity: "song" | "album" | "musicArtist") => {
			try {
				const params = new URLSearchParams({
					term,
					entity,
					limit: "25",
					country: "JP",
					lang: "ja_jp",
				});
				const res = await fetch(
					`https://itunes.apple.com/search?${params.toString()}`,
				);
				if (!res.ok) return { resultCount: 0, results: [] };
				return await res.json();
			} catch {
				return { resultCount: 0, results: [] };
			}
		},
	},
	follow: {
		getCounts: (userId: string) =>
			fetcher<{ followers: number; following: number }>(
				`/follow?userId=${encodeURIComponent(userId)}`,
			),
		getFollowers: (userId: string, viewerId?: string) =>
			fetcher<{ users: FollowUser[] }>(
				`/follow?list=followers&userId=${encodeURIComponent(userId)}${viewerId ? `&viewerId=${encodeURIComponent(viewerId)}` : ""}`,
			),
		getFollowing: (userId: string, viewerId?: string) =>
			fetcher<{ users: FollowUser[] }>(
				`/follow?list=following&userId=${encodeURIComponent(userId)}${viewerId ? `&viewerId=${encodeURIComponent(viewerId)}` : ""}`,
			),
		isFollowing: (followerId: string, followedId: string) =>
			fetcher<{ isFollowing: boolean }>(
				`/follow?followerId=${encodeURIComponent(followerId)}&followedId=${encodeURIComponent(followedId)}`,
			),
		// followerId は受け取るが送らない：フォローする側は必ずセッション本人
		// （app/api/follow/route.ts が body を無視して resolveSessionUser で決める）。
		// 引数だけ block/mute/mock と揃えておかないと、呼び出し側が2引数で書いた際に
		// 1引数関数へ位置渡しされて「自分のidがfollowedIdとして送られる」事故になる
		// （実際にそうなっていた: UserActionMenu/ProfileView 双方が2引数で呼んでいた）。
		follow: (_followerId: string, followedId: string) =>
			fetcher<{ success: boolean }>("/follow", {
				method: "POST",
				body: JSON.stringify({ followedId, sessionId: ensureSessionId() }),
			}),
		unfollow: (_followerId: string, followedId: string) =>
			fetcher<{ success: boolean }>("/follow", {
				method: "DELETE",
				body: JSON.stringify({ followedId, sessionId: ensureSessionId() }),
			}),
	},
	block: {
		list: (blockerSlug: string) =>
			fetcher<{ blocked: string[] }>(
				`/block?blockerSlug=${encodeURIComponent(blockerSlug)}`,
			),
		block: (blockerSlug: string, blockedSlug: string) =>
			fetcher<{ success: boolean }>("/block", {
				method: "POST",
				body: JSON.stringify({ blockerSlug, blockedSlug }),
			}),
		unblock: (blockerSlug: string, blockedSlug: string) =>
			fetcher<{ success: boolean }>("/block", {
				method: "DELETE",
				body: JSON.stringify({ blockerSlug, blockedSlug }),
			}),
	},
	mute: {
		list: (muterSlug: string) =>
			fetcher<{ muted: string[] }>(
				`/mute?muterSlug=${encodeURIComponent(muterSlug)}`,
			),
		mute: (muterSlug: string, mutedSlug: string) =>
			fetcher<{ success: boolean }>("/mute", {
				method: "POST",
				body: JSON.stringify({ muterSlug, mutedSlug }),
			}),
		unmute: (muterSlug: string, mutedSlug: string) =>
			fetcher<{ success: boolean }>("/mute", {
				method: "DELETE",
				body: JSON.stringify({ muterSlug, mutedSlug }),
			}),
	},
	report: {
		create: (data: {
			reporterSlug: string;
			targetType: string;
			targetId: string;
			reason?: string;
		}) =>
			fetcher<{ success: boolean }>("/report", {
				method: "POST",
				body: JSON.stringify(data),
			}),
	},
	/**
	 * 作者判定は slug で行う（displayName ではない）。
	 * 位置引数だと userId(displayName) と userSlug がどちらも string で取り違えても
	 * 型検査を通ってしまい、実際に返信側から編集すると必ず403になっていた。
	 * 呼び出し側に `userSlug:` と書かせるため名前付きで受け取る。
	 */
	// 作者判定はサーバーがセッションから行うので、呼び出し側は身元を渡さない
	// manifest はR2へ上げてURLだけを送る必要があるので、lib/game-mv-client.ts の
	// updateMv / updateGame に委譲する。ここで manifest を直接PATCHすると400になる。
	mvs: {
		edit: (id: string, params: { title: string; manifest: MvManifest }) =>
			updateMv(id, params),
	},
	games: {
		edit: (
			id: string,
			params: { title: string; manifest: GameManifestDraft },
		) => updateGame(id, params),
	},
};

export const api = useStaticMockData ? staticApi : liveApi;
