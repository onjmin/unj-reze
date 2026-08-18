import { INITIAL_POSTS } from "./data";
import type { GetPostsOptions } from "./db/interface";
import {
	cleanContentForTrends,
	extractMmlFromContent,
	isValidTrendKeyword,
} from "./mml";
import { formatRelativeTime, nowISO } from "./time";
import { AnonymousUser, FollowUser, OriginType } from "./types";
import {
	DbOshiItem,
	DbNotification as Notification,
	DbPost as Post,
} from "./types-db";

export interface Trend {
	keyword: string;
	count: number;
}

export interface Message {
	id: number;
	sender: string;
	text: string;
	recipient?: string;
	createdAt: string;
	time: string;
}

const NOTIFICATION_INFOS: {
	user: string;
	action: string;
	target: string;
	type: string;
	postId?: number;
	targetUser?: string;
	time: string;
}[] = [
	{
		user: "名無しXz9",
		action: "がいいねしました",
		target: "青空の写真",
		type: "like",
		postId: 7,
		time: "3分前",
	},
	{
		user: "名無しLm8",
		action: "がリポストしました",
		target: "ドット絵の練習中",
		type: "repost",
		postId: 6,
		time: "8分前",
	},
	{
		user: "名無しBn5",
		action: "が返信しました",
		target: "作業用BGM何聴いてる？",
		type: "reply",
		postId: 5,
		time: "15分前",
	},
	{
		user: "名無しVc1",
		action: "がフォローしました",
		target: "",
		type: "follow",
		targetUser: "名無しvFZ",
		time: "1時間前",
	},
];

function deriveSlug(fullName: string): string {
	const match = fullName.match(/[a-zA-Z0-9]+$/);
	return match ? match[0] : fullName;
}

const MESSAGE_INFOS: {
	sender: string;
	text: string;
	recipient?: string;
	time: string;
}[] = [
	{
		sender: "名無しLm8",
		text: "おはよう！今日の雪写真見た？",
		time: "7時間前",
	},
	{
		sender: "名無しXz9",
		text: "イラストまとめ見てくれてありがとう！",
		time: "2日前",
	},
	{ sender: "名無しQp7", text: "ドット絵のコツ教えてくれる？", time: "1日前" },
];

function parseRelativeTime(relative: string): string {
	const now = Date.now();
	const match = relative.match(/^(\d+)(分前|時間前|日前|秒前)$/);
	if (!match) return nowISO();
	const num = parseInt(match[1]);
	const unit = match[2];
	let offset = 0;
	if (unit === "秒前") offset = num * 1000;
	else if (unit === "分前") offset = num * 60 * 1000;
	else if (unit === "時間前") offset = num * 60 * 60 * 1000;
	else if (unit === "日前") offset = num * 24 * 60 * 60 * 1000;
	return new Date(now - offset).toISOString();
}

const AVATAR_GRADIENTS = [
	"from-blue-500 to-indigo-600",
	"from-red-500 to-rose-600",
	"from-emerald-400 to-teal-500",
	"from-purple-400 to-violet-500",
	"from-amber-400 to-yellow-500",
	"from-pink-400 to-rose-500",
	"from-cyan-400 to-indigo-500",
	"from-lime-400 to-green-500",
	"from-orange-400 to-red-500",
	"from-teal-400 to-cyan-500",
];

function generateDisplayName(): string {
	const chars =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let result = "";
	for (let i = 0; i < 15; i++)
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	return result;
}

function generateSlug(fullName: string): string {
	const match = fullName.match(/[a-zA-Z0-9]+$/);
	return match ? match[0] : fullName;
}

function randomGradient(): string {
	return AVATAR_GRADIENTS[Math.floor(Math.random() * AVATAR_GRADIENTS.length)];
}

class MockDB {
	private posts: Post[];
	private notifications: Notification[];
	private messages: Message[];
	private votes: Map<string, "like" | "dislike"> = new Map();
	private heartCounts: Map<number, number> = new Map();
	private heartEntries: { postId: number; userId: string }[] = [];
	private anonUserData: Map<
		string,
		{
			id: string;
			ipAddress: string;
			sessionId: string;
			displayName: string;
			slug: string;
			avatarColor: string;
			avatarUrl?: string;
			bio?: string;
			createdAt: string;
			lastSeenAt: string;
		}
	> = new Map();
	private oshiItems: DbOshiItem[] = [];
	private sessionToUser: Map<string, string> = new Map();
	private follows: { followerId: string; followedId: string }[] = [];
	private blocks: { blockerSlug: string; blockedSlug: string }[] = [];
	private mutes: { muterSlug: string; mutedSlug: string }[] = [];
	private reports: {
		id: number;
		reporterSlug: string;
		targetType: string;
		targetId: string;
		reason: string;
		createdAt: string;
	}[] = [];
	// Phase 7: ユーザー設定(slug単位)。isPrivate / hideFromSearch / hideReactions。
	private userSettings: Map<
		string,
		{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }
	> = new Map();
	private hiddenFromSearchSlugs: Set<string> = new Set();
	// Phase 2: 移行トークン(token -> userId)。
	private migrationTokens: Map<string, string> = new Map();

	constructor() {
		this.posts = JSON.parse(JSON.stringify(INITIAL_POSTS));
		for (const post of this.posts) {
			if (!post.slug) post.slug = deriveSlug(post.displayName);
			if (!post.createdAt) post.createdAt = parseRelativeTime(post.time);
			if (post.hasMml === undefined)
				post.hasMml = extractMmlFromContent(post.content) !== null;
			this.heartCounts.set(post.id, post.heartsTotal);
			for (const reply of post.replies) {
				if (!reply.slug) reply.slug = deriveSlug(reply.displayName);
				if (!reply.createdAt) reply.createdAt = parseRelativeTime(reply.time);
				if (reply.hasMml === undefined)
					reply.hasMml = extractMmlFromContent(reply.content) !== null;
			}
		}
		this.notifications = NOTIFICATION_INFOS.map((n, i) => ({
			id: i + 1,
			user: n.user,
			action: n.action,
			target: n.target,
			type: n.type,
			postId: n.postId,
			targetUser: n.targetUser,
			recipientId: n.targetUser,
			read: false,
			time: n.time,
			createdAt: parseRelativeTime(n.time),
		}));
		this.messages = MESSAGE_INFOS.map((m, i) => ({
			id: i + 1,
			...m,
			createdAt: parseRelativeTime(m.time),
		}));
	}

	private generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	}

	private getUserInfoBySlug(slug: string | null | undefined) {
		if (!slug) return null;
		for (const user of this.anonUserData.values()) {
			if (user.slug === slug) {
				return user;
			}
		}
		return null;
	}

	getUserAvatarUrl(slug: string): string | undefined {
		const user = this.getUserInfoBySlug(slug);
		return user?.avatarUrl;
	}

	getUserBio(slug: string): string | undefined {
		const user = this.getUserInfoBySlug(slug);
		return user?.bio;
	}

	listOshiItems(userSlug: string): DbOshiItem[] {
		return this.oshiItems
			.filter((o) => o.userSlug === userSlug)
			.sort((a, b) => a.position - b.position);
	}

	addOshiItem(
		userSlug: string,
		data: {
			kind: DbOshiItem["kind"];
			trackId?: number;
			collectionId?: number;
			artistId?: number;
			title: string;
			subtitle?: string;
			artworkUrl?: string;
			viewUrl?: string;
			previewUrl?: string;
		},
	): DbOshiItem {
		const id = Date.now() + Math.floor(Math.random() * 1000);
		const position = this.oshiItems.filter(
			(o) => o.userSlug === userSlug,
		).length;
		const item: DbOshiItem = {
			id,
			userSlug,
			position,
			createdAt: this.now(),
			...data,
		};
		this.oshiItems.push(item);
		return item;
	}

	removeOshiItem(userSlug: string, id: number): void {
		this.oshiItems = this.oshiItems.filter(
			(o) => !(o.id === id && o.userSlug === userSlug),
		);
	}

	/** セッションIDから本人を引く。作成はしない（本人確認用） */
	getAnonymousUserBySession(sessionId: string): AnonymousUser | null {
		const id = this.sessionToUser.get(sessionId);
		if (!id) return null;
		const stored = this.anonUserData.get(id);
		if (!stored) return null;
		return {
			id: stored.id,
			displayName: stored.displayName,
			slug: stored.slug,
			avatarColor: stored.avatarColor,
			avatarUrl: stored.avatarUrl,
			bio: stored.bio,
			createdAt: stored.createdAt,
		};
	}

	getOrCreateAnonymousUser(
		sessionId: string,
		ipAddress: string,
	): AnonymousUser {
		const existingBySession = this.sessionToUser.get(sessionId);
		if (existingBySession) {
			const stored = this.anonUserData.get(existingBySession)!;
			stored.lastSeenAt = this.now();
			return {
				id: stored.id,
				displayName: stored.displayName,
				slug: stored.slug,
				avatarColor: stored.avatarColor,
				avatarUrl: stored.avatarUrl,
				bio: stored.bio,
				createdAt: stored.createdAt,
			};
		}

		// 注意: 以前は ipAddress が一致する既存ユーザーに割り当てる同一IPフォールバックがあったが、
		// Netlify環境ではロードバランサーのアドレスしか取得できず（context.ip 含む）、
		// 全訪問者が同一IPとして扱われ他人のアカウントに merge される実害があったため削除。
		// ipAddress 自体は分析/レート制限用に引き続き保持するが、本人確認には使わない。

		const id = this.generateId();
		const displayName = generateDisplayName();
		const slug = generateSlug(displayName);
		const avatarColor = randomGradient();
		const createdAt = this.now();
		const stored = {
			id,
			ipAddress,
			sessionId,
			displayName,
			slug,
			avatarColor,
			avatarUrl: undefined,
			createdAt,
			lastSeenAt: createdAt,
		};
		this.anonUserData.set(id, stored);
		this.sessionToUser.set(sessionId, id);
		return {
			id,
			displayName,
			slug,
			avatarColor,
			avatarUrl: undefined,
			createdAt,
		};
	}

	/**
	 * プロフィールを更新する。`displayName` を省略すればアイコン/自己紹介だけ更新できる。
	 * slug は所有者キーなので作成時のまま固定し、ここでは絶対に書き換えない
	 * （pg.ts と同じ規約。表示名から derive し直すと所有権が切れる）。
	 */
	updateUserDisplayName(
		userId: string,
		displayName?: string,
		avatarUrl?: string,
		bio?: string,
	): void {
		let stored = this.anonUserData.get(userId);
		if (!stored) {
			for (const u of this.anonUserData.values()) {
				if (u.slug === userId || u.displayName === userId) {
					stored = u;
					break;
				}
			}
		}
		if (stored) {
			const slug = stored.slug;
			if (displayName !== undefined) {
				stored.displayName = displayName;
			}
			if (avatarUrl !== undefined) {
				stored.avatarUrl = avatarUrl;
			}
			if (bio !== undefined) {
				stored.bio = bio;
			}

			// 表示名とアイコンは posts に非正規化されているので追随させる（slug は不変）
			if (slug) {
				for (const post of this.posts) {
					if (post.slug === slug) {
						post.displayName = stored.displayName;
						post.avatarUrl = stored.avatarUrl;
					}
					if (post.replies) {
						for (const r of post.replies) {
							if (r.slug === slug) {
								r.displayName = stored.displayName;
								r.avatarUrl = stored.avatarUrl;
							}
						}
					}
				}
			}
		}
	}

	private genId(): number {
		return Date.now() + Math.floor(Math.random() * 1000);
	}

	now(): string {
		return nowISO();
	}

	private applyUserState(post: Post, userId?: string): Post {
		if (userId) {
			const likeKey = `${post.id}:${userId}:like`;
			const dislikeKey = `${post.id}:${userId}:dislike`;
			post.liked = this.votes.get(likeKey) === "like";
			post.disliked = this.votes.get(dislikeKey) === "dislike";
		} else {
			post.liked = false;
			post.disliked = false;
		}
		post.heartsTotal = this.heartCounts.get(post.id) ?? post.heartsTotal;

		const user = this.getUserInfoBySlug(post.slug);
		if (user) {
			post.displayName = user.displayName;
			post.avatarUrl = user.avatarUrl;
		}
		return post;
	}

	getPosts(
		userId?: string,
		limitOrOptions?: number | GetPostsOptions,
		beforeId?: number,
		optionsArg?: GetPostsOptions,
	): Post[] {
		const options =
			typeof limitOrOptions === "object" ? limitOrOptions : optionsArg || {};
		const limit =
			typeof limitOrOptions === "number" ? limitOrOptions : options.limit;
		const before = beforeId ?? options.beforeId;

		const hidden = this.getHiddenSlugs(userId);
		const result = this.posts
			.filter((p) => p.id === p.threadId)
			// キーセットページング: カーソルより古いスレッドだけ返す
			.filter((p) => !before || p.id < before)
			.filter((p) => {
				const threadPosts = [p, ...(p.replies || [])];
				if (
					options.hasMml !== undefined &&
					threadPosts.some((tp) => !!tp.hasMml) !== options.hasMml
				)
					return false;
				if (
					options.hasImage !== undefined &&
					threadPosts.some((tp) => !!tp.hasImage) !== options.hasImage
				)
					return false;
				if (
					options.hasGame !== undefined &&
					threadPosts.some((tp) => !!tp.hasGame) !== options.hasGame
				)
					return false;
				if (
					options.hasMv !== undefined &&
					threadPosts.some((tp) => !!tp.hasMv) !== options.hasMv
				)
					return false;
				return true;
			})
			.filter((p) => !hidden.has(p.slug ?? ""))
			.filter((p) => this.canViewAuthor(p.slug ?? "", p.displayName, userId))
			.sort((a, b) => b.id - a.id)
			.map((p) =>
				this.applyUserState(
					{
						...p,
						replies: [...p.replies]
							.filter((r) => !hidden.has(r.slug ?? ""))
							.map((r) => this.applyUserState(r, userId)),
					},
					userId,
				),
			);
		if (limit && limit > 0) {
			return result.slice(0, limit);
		}
		return result;
	}

	getUserPostsBySlug(slug: string, userId?: string, limit?: number): Post[] {
		const hidden = this.getHiddenSlugs(userId);
		if (hidden.has(slug)) return [];
		const posts = this.posts.filter((p) => p.slug === slug);
		const author = posts[0];
		if (author && !this.canViewAuthor(slug, author.displayName, userId))
			return [];
		const res = posts.map((p) =>
			this.applyUserState(
				{
					...p,
					replies: [...p.replies].map((r) => this.applyUserState(r, userId)),
				},
				userId,
			),
		);
		return limit && limit > 0 ? res.slice(0, limit) : res;
	}

	getLikedPosts(userId: string, limit?: number): Post[] {
		const likedIds = new Set<number>();
		for (const [key, val] of this.votes) {
			if (key.endsWith(`:${userId}:like`) && val === "like") {
				likedIds.add(parseInt(key.split(":")[0], 10));
			}
		}
		const res = this.posts
			.filter((p) => likedIds.has(p.id))
			.map((p) =>
				this.applyUserState({ ...p, replies: [...p.replies] }, userId),
			);
		return limit && limit > 0 ? res.slice(0, limit) : res;
	}

	getDislikedPosts(userId: string, limit?: number): Post[] {
		const dislikedIds = new Set<number>();
		for (const [key, val] of this.votes) {
			if (key.endsWith(`:${userId}:dislike`) && val === "dislike") {
				dislikedIds.add(parseInt(key.split(":")[0], 10));
			}
		}
		const res = this.posts
			.filter((p) => dislikedIds.has(p.id))
			.map((p) =>
				this.applyUserState({ ...p, replies: [...p.replies] }, userId),
			);
		return limit && limit > 0 ? res.slice(0, limit) : res;
	}

	getHeartedPosts(userId: string, limit?: number): Post[] {
		const heartedIds = new Set<number>();
		for (const e of this.heartEntries) {
			if (e.userId === userId) heartedIds.add(e.postId);
		}
		const res = this.posts
			.filter((p) => heartedIds.has(p.id))
			.map((p) =>
				this.applyUserState({ ...p, replies: [...p.replies] }, userId),
			);
		return limit && limit > 0 ? res.slice(0, limit) : res;
	}

	getUserDisplayName(slug: string): string | undefined {
		const post = this.posts.find((p) => p.slug === slug);
		return post?.displayName;
	}

	getPost(id: number, userId?: string): Post | undefined {
		const post = this.posts.find((p) => p.id === id);
		if (!post) return undefined;
		if (!this.canViewAuthor(post.slug ?? "", post.displayName, userId))
			return undefined;
		return this.applyUserState({ ...post, replies: [...post.replies] }, userId);
	}

	/** 専ブラ向け。dat/subject.txt の datKey（Unixエポック秒）からOPを引く。 */
	getPostByDatKey(datKey: number, userId?: string): Post | undefined {
		const post = this.posts.find(
			(p) => p.id === p.threadId && this.datKeyOf(p) === datKey,
		);
		if (!post) return undefined;
		if (!this.canViewAuthor(post.slug ?? "", post.displayName, userId))
			return undefined;
		return this.applyUserState({ ...post, replies: [...post.replies] }, userId);
	}

	/** post.datKey があればそれを、無ければ createdAt から都度算出する（秒精度）。 */
	private datKeyOf(post: Post): number {
		return post.datKey ?? Math.floor(new Date(post.createdAt).getTime() / 1000);
	}

	/**
	 * 新規スレのdatKey採番。同じ秒に複数スレが立っても衝突しないよう、
	 * 既存の最大値+1と現在秒の大きい方を使う（lib/db/pg.ts createPost と同じ方式）。
	 */
	private nextDatKey(): number {
		const nowSec = Math.floor(Date.now() / 1000);
		const maxExisting = this.posts
			.filter((p) => p.id === p.threadId)
			.reduce((max, p) => Math.max(max, this.datKeyOf(p)), 0);
		return Math.max(nowSec, maxExisting + 1);
	}

	createPost(data: {
		displayName?: string;
		content: string;
		hasImage?: boolean;
		imageSrc?: string;
		imageAlt?: string;
		avatarColor?: string;
		slug?: string;
		gameId?: number;
		mvId?: number;
		dotW?: number;
		dotH?: number;
		animFrames?: number;
		animFps?: number;
		walkPreset?: string;
		originType?: OriginType;
	}): Post {
		const createdAt = this.now();
		const name = data.displayName || "名無し";
		const post: Post = {
			id: this.genId(),
			datKey: this.nextDatKey(),
			displayName: name,
			slug: data.slug || deriveSlug(name),
			createdAt,
			time: formatRelativeTime(createdAt),
			content: data.content,
			likes: 0,
			dislikes: 0,
			liked: false,
			disliked: false,
			repliesCount: 0,
			reposts: 0,
			reposted: false,
			hasImage: data.hasImage,
			imageSrc: data.imageSrc,
			imageAlt: data.imageAlt,
			avatarColor: data.avatarColor || "from-blue-500 to-indigo-600",
			hasCollabButton: true,
			heartsTotal: 0,
			hasGame: !!data.gameId,
			gameId: data.gameId,
			hasMv: !!data.mvId,
			mvId: data.mvId,
			hasMml: extractMmlFromContent(data.content) !== null,
			dotW: data.dotW,
			dotH: data.dotH,
			animFrames: data.animFrames,
			animFps: data.animFps,
			walkPreset: data.walkPreset,
			originType: data.originType,
			isFalseDeclaration: false,
			threadId: this.genId(),
			replies: [],
		};
		post.threadId = post.id;
		this.heartCounts.set(post.id, 0);
		this.posts.unshift(post);
		return post;
	}

	likePost(id: number, userId: string): Post | null {
		const post = this.posts.find((p) => p.id === id);
		if (!post) return null;
		const likeKey = `${id}:${userId}:like`;
		const dislikeKey = `${id}:${userId}:dislike`;
		const alreadyLiked = this.votes.get(likeKey) === "like";
		if (alreadyLiked) {
			this.votes.delete(likeKey);
			post.likes -= 1;
		} else {
			if (this.votes.get(dislikeKey) === "dislike") {
				this.votes.delete(dislikeKey);
				post.dislikes -= 1;
			}
			this.votes.set(likeKey, "like");
			post.likes += 1;
			this.createNotification({
				recipientId: post.displayName,
				actor: userId,
				type: "like",
				postId: id,
			});
		}
		return this.getPost(id, userId) ?? null;
	}

	dislikePost(id: number, userId: string): Post | null {
		const post = this.posts.find((p) => p.id === id);
		if (!post) return null;
		const likeKey = `${id}:${userId}:like`;
		const dislikeKey = `${id}:${userId}:dislike`;
		const alreadyDisliked = this.votes.get(dislikeKey) === "dislike";
		if (alreadyDisliked) {
			this.votes.delete(dislikeKey);
			post.dislikes -= 1;
		} else {
			if (this.votes.get(likeKey) === "like") {
				this.votes.delete(likeKey);
				post.likes -= 1;
			}
			this.votes.set(dislikeKey, "dislike");
			post.dislikes += 1;
		}
		return this.getPost(id, userId) ?? null;
	}

	heartPost(id: number, userId: string, count: number = 1): Post | null {
		const post = this.posts.find((p) => p.id === id);
		if (!post) return null;
		for (let i = 0; i < count; i++) {
			this.heartEntries.push({ postId: id, userId });
		}
		const current = this.heartCounts.get(id) ?? 0;
		this.heartCounts.set(id, current + count);
		this.createNotification({
			recipientId: post.displayName,
			actor: userId,
			type: "heart",
			postId: id,
		});
		return this.getPost(id) ?? null;
	}

	repostPost(id: number): Post | null {
		const post = this.posts.find((p) => p.id === id);
		if (!post) return null;
		post.reposted = !post.reposted;
		post.reposts = post.reposted ? post.reposts + 1 : post.reposts - 1;
		return post;
	}

	addReply(
		postId: number,
		data: {
			displayName?: string;
			content: string;
			parentPostId?: number;
			hasImage?: boolean;
			imageSrc?: string;
			imageAlt?: string;
			avatarColor?: string;
			gameId?: number;
			mvId?: number;
			dotW?: number;
			dotH?: number;
			animFrames?: number;
			animFps?: number;
			walkPreset?: string;
			originType?: OriginType;
		},
	): Post | null {
		const post = this.posts.find((p) => p.id === postId);
		if (!post) return null;
		const id = Math.max(0, ...this.posts.map((p) => p.id)) + 1;
		const name = data.displayName || "名無し";
		const reply: Post = {
			id,
			displayName: name,
			slug: name,
			createdAt: new Date().toISOString(),
			time: "たった今",
			content: data.content,
			likes: 0,
			dislikes: 0,
			liked: false,
			disliked: false,
			repliesCount: 0,
			reposts: 0,
			reposted: false,
			avatarColor: data.avatarColor || "from-blue-400 to-indigo-500",
			heartsTotal: 0,
			replies: [],
			threadId: post.threadId === post.id ? post.id : post.threadId,
			parentPostId: data.parentPostId ?? post.id,
			hasImage: data.hasImage,
			imageSrc: data.imageSrc,
			imageAlt: data.imageAlt,
			gameId: data.gameId,
			hasGame: !!data.gameId,
			mvId: data.mvId,
			hasMv: !!data.mvId,
			hasMml: extractMmlFromContent(data.content) !== null,
			dotW: data.dotW,
			dotH: data.dotH,
			animFrames: data.animFrames,
			animFps: data.animFps,
			walkPreset: data.walkPreset,
			originType: data.originType,
		};
		this.posts.push(reply);
		post.repliesCount += 1;
		if (post.replies) post.replies.push(reply);

		// 返信先の投稿主へ通知(自己宛は除外)
		const parentId = data.parentPostId ?? post.id;
		const parent = this.posts.find((p) => p.id === parentId) ?? post;
		this.createNotification({
			recipientId: parent.displayName,
			actor: name,
			type: "reply",
			postId: post.id,
		});

		// 本文中の @slug メンション宛に通知
		const mentions = data.content.match(/@([A-Za-z0-9]+)/g);
		if (mentions) {
			const seen = new Set<string>();
			for (const m of mentions) {
				const slug = m.slice(1);
				if (seen.has(slug)) continue;
				seen.add(slug);
				const target = this.posts.find((p) => p.slug === slug);
				if (target && target.displayName !== parent.displayName) {
					this.createNotification({
						recipientId: target.displayName,
						actor: name,
						type: "mention",
						postId: post.id,
					});
				}
			}
		}
		return reply;
	}

	getReplies(postId: number, userId?: string): Post[] {
		const post = this.posts.find((p) => p.id === postId);
		if (!post) return [];
		const hidden = this.getHiddenSlugs(userId);
		return (post.replies ?? []).filter((r) => !hidden.has(r.slug ?? ""));
	}

	/**
	 * 通知の宛先キーは **ユーザーの主キー(id)** で突き合わせる。slug を照合キーにしない
	 * （pg 側で slug はカラムですらなく `String(users.id)` の別名にすぎず、テキストキーを
	 * 持たせないのが本番Neonのストレージ/転送量方針。docs/NEON_EGRESS.md）。
	 *
	 * 例外は NOTIFICATION_INFOS の手書きデモ通知だけで、これは実ユーザーレコードを持たず
	 * displayName しか持たないため、そのユーザーの displayName も併せて見る。
	 * ここで slug 派生の緩い一致を許すと、mock では通って本番Neonで 500 になる差が
	 * 生まれる（実際にそれで通知ページが落ちた）。
	 */
	private notificationKeysFor(userId: string): string[] {
		const stored = this.anonUserData.get(userId);
		return stored ? [stored.id, stored.displayName] : [userId];
	}

	private isNotificationFor(n: Notification, keys: string[]): boolean {
		return (
			(n.recipientId != null && keys.includes(n.recipientId)) ||
			(n.targetUser != null && keys.includes(n.targetUser))
		);
	}

	getNotifications(userId?: string): Notification[] {
		if (!userId) return this.notifications;
		const keys = this.notificationKeysFor(userId);
		return this.notifications
			.filter((n) => this.isNotificationFor(n, keys))
			.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
	}

	/** 通知を生成する。自己宛(actor===recipient)は生成しない。 */
	createNotification(data: {
		recipientId: string;
		actor: string;
		type: string;
		postId?: number;
	}): void {
		if (!data.recipientId || data.recipientId === data.actor) return;
		const post = data.postId
			? this.posts.find((p) => p.id === data.postId)
			: undefined;
		const actionText = (() => {
			switch (data.type) {
				case "reply":
					return "が返信しました";
				case "like":
					return "がいいねしました";
				case "heart":
					return "がハートを送りました";
				case "follow":
					return "がフォローしました";
				case "mention":
					return "があなたにメンションしました";
				case "repost":
					return "がリポストしました";
				default:
					return "がいいねしました";
			}
		})();
		this.notifications.push({
			id: this.genId(),
			actorSlug: data.actor,
			targetSlug: data.recipientId,
			user: data.actor,
			action: actionText,
			target: post ? this.snippet(post.content) : "",
			type: data.type,
			postId: data.postId,
			recipientId: data.recipientId,
			targetUser: data.recipientId,
			read: false,
			createdAt: this.now(),
			time: "たった今",
		});
	}

	markNotificationRead(id: number, userId: string): void {
		const keys = this.notificationKeysFor(userId);
		const n = this.notifications.find(
			(n) => n.id === id && this.isNotificationFor(n, keys),
		);
		if (n) n.read = true;
	}

	markAllNotificationsRead(userId: string): void {
		const keys = this.notificationKeysFor(userId);
		for (const n of this.notifications) {
			if (this.isNotificationFor(n, keys)) n.read = true;
		}
	}

	deleteNotification(id: number, userId: string): void {
		const keys = this.notificationKeysFor(userId);
		this.notifications = this.notifications.filter(
			(n) => !(n.id === id && this.isNotificationFor(n, keys)),
		);
	}

	getUnreadCount(userId: string): number {
		const keys = this.notificationKeysFor(userId);
		return this.notifications.filter(
			(n) => this.isNotificationFor(n, keys) && !n.read,
		).length;
	}

	private snippet(text: string): string {
		return text.length > 20 ? text.slice(0, 20) + "…" : text;
	}

	getMessages(userId?: string): Message[] {
		if (!userId) return this.messages.filter((m) => !!m.recipient);
		const userSlug = this.slugForUser(userId);
		const hidden = this.getHiddenSlugs(userId);
		return this.messages
			.filter(
				(m) =>
					!!m.recipient &&
					(this.slugForUser(m.sender) === userSlug ||
						(m.recipient ? this.slugForUser(m.recipient) === userSlug : false)),
			)
			.filter((m) => !hidden.has(this.slugForUser(m.sender)));
	}

	/** 1対1スレッド。id/displayName/slug のどの表記で渡されても slug に正規化して突き合わせる。 */
	getConversation(userId: string, partnerId: string, limit = 100): Message[] {
		const me = this.slugForUser(userId);
		const partner = this.slugForUser(partnerId);
		return this.messages
			.filter((m) => {
				const sender = this.slugForUser(m.sender);
				const recipient = m.recipient
					? this.slugForUser(m.recipient)
					: undefined;
				return (
					(sender === me && recipient === partner) ||
					(sender === partner && recipient === me)
				);
			})
			.slice()
			.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
			.slice(0, limit);
	}

	getDmGate(
		userId: string,
		partnerId: string,
	): { sent: number; received: number } {
		const me = this.slugForUser(userId);
		const convo = this.getConversation(
			userId,
			partnerId,
			Number.MAX_SAFE_INTEGER,
		);
		let sent = 0;
		let received = 0;
		for (const m of convo) {
			if (this.slugForUser(m.sender) === me) sent++;
			else received++;
		}
		return { sent, received };
	}

	addMessage(data: {
		sender: string;
		text: string;
		recipient?: string;
	}): Message {
		const createdAt = this.now();
		const msg: Message = {
			id: this.genId(),
			sender: this.slugForUser(data.sender),
			text: data.text,
			recipient: data.recipient ? this.slugForUser(data.recipient) : undefined,
			createdAt,
			time: formatRelativeTime(createdAt),
		};
		this.messages.push(msg);
		return msg;
	}

	searchPosts(query: string, userId?: string, limit?: number): Post[] {
		if (!query.trim()) return [];
		const q = query.toLowerCase();
		const hidden = this.getHiddenSlugs(userId);
		const res = this.posts
			.filter((p) => p.id === p.threadId)
			.filter((p) => !hidden.has(p.slug ?? ""))
			.filter((p) => !this.hiddenFromSearchSlugs.has(p.slug ?? ""))
			.filter((p) => {
				const threadPosts = [p, ...(p.replies || [])];
				return threadPosts.some(
					(tp) =>
						tp.content.toLowerCase().includes(q) ||
						tp.displayName.toLowerCase().includes(q),
				);
			})
			.map((p) =>
				this.applyUserState({ ...p, replies: [...p.replies] }, userId),
			);
		return limit && limit > 0 ? res.slice(0, limit) : res;
	}

	searchMedia(
		kind: "image" | "mml",
		query: string,
		userId?: string,
		limit?: number,
		offset?: number,
	): {
		id: number;
		displayName: string;
		content: string;
		imageSrc?: string;
		imageAlt?: string;
		mmlUrl?: string;
		dotW?: number;
		dotH?: number;
		animFrames?: number;
		animFps?: number;
		walkPreset?: string;
		originType?: OriginType;
		isOwner?: boolean;
	}[] {
		const q = query.trim().toLowerCase();
		const hidden = this.getHiddenSlugs(userId);
		const mySlug = userId ? this.slugForUser(userId) : undefined;
		const all = this.posts.flatMap((p) => [p, ...p.replies]);
		const res = all
			.filter((p) => (kind === "image" ? p.hasImage : p.hasMml))
			.filter((p) => !hidden.has(p.slug ?? ""))
			.filter((p) => !this.hiddenFromSearchSlugs.has(p.slug ?? ""))
			.filter(
				(p) =>
					!q ||
					p.content.toLowerCase().includes(q) ||
					p.displayName.toLowerCase().includes(q),
			)
			.sort((a, b) => Number(b.id) - Number(a.id))
			.map((p) => ({
				id: p.id,
				displayName: p.displayName,
				content: p.content,
				imageSrc: p.imageSrc,
				imageAlt: p.imageAlt,
				mmlUrl: kind === "mml" ? p.mmlUrl : undefined,
				dotW: p.dotW,
				dotH: p.dotH,
				animFrames: p.animFrames,
				animFps: p.animFps,
				walkPreset: p.walkPreset,
				originType: p.originType,
				isOwner: mySlug !== undefined && p.slug === mySlug,
			}));
		const start = offset && offset > 0 ? offset : 0;
		const safeLimit = limit && limit > 0 ? limit : 50;
		return res.slice(start, start + safeLimit);
	}

	getPostsByHashtag(tag: string, userId?: string, limit?: number): Post[] {
		const normalized = tag.startsWith("#") ? tag : `#${tag}`;
		const hidden = this.getHiddenSlugs(userId);
		const res = this.posts
			.filter((p) => p.id === p.threadId)
			.filter((p) => !hidden.has(p.slug ?? ""))
			.filter((p) => !this.hiddenFromSearchSlugs.has(p.slug ?? ""))
			.filter((p) => {
				const tags = p.content.match(/#[^\s#]+/g);
				return tags?.some((t) => t === normalized) ?? false;
			})
			.map((p) =>
				this.applyUserState({ ...p, replies: [...p.replies] }, userId),
			);
		return limit && limit > 0 ? res.slice(0, limit) : res;
	}

	getTrends(): Trend[] {
		const freq = new Map<string, number>();
		const allContent = this.posts
			.map((p) => p.content)
			.concat(this.posts.flatMap((p) => p.replies.map((r) => r.content)));
		for (const content of allContent) {
			const cleaned = cleanContentForTrends(content);
			// 先頭が空白/行頭でない「#」は和音進行(例: C#m)のシャープ記号なのでハッシュタグ扱いしない
			const hashtags = [...cleaned.matchAll(/(?:^|\s)#([^\s#]+)/g)].map(
				(m) => `#${m[1]}`,
			);
			for (const tag of hashtags) {
				if (isValidTrendKeyword(tag)) {
					freq.set(tag, (freq.get(tag) || 0) + 1);
				}
			}
		}
		return Array.from(freq.entries())
			.map(([keyword, count]) => ({ keyword, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);
	}

	followUser(followerId: string, followedId: string): void {
		const followerSlug = this.slugForUser(followerId);
		const followedSlug = this.slugForUser(followedId);
		// 同一ユーザーを別表記(id/displayName/slug)で指した自己フォローも弾く。
		if (followerSlug === followedSlug) return;
		const exists = this.follows.some(
			(f) =>
				(f.followerId === followerSlug || f.followerId === followerId) &&
				(f.followedId === followedSlug || f.followedId === followedId),
		);
		if (!exists) {
			this.follows.push({ followerId: followerSlug, followedId: followedSlug });
			this.createNotification({
				recipientId: followedSlug,
				actor: followerSlug,
				type: "follow",
				postId: undefined,
			});
		}
	}

	unfollowUser(followerId: string, followedId: string): void {
		const followerSlug = this.slugForUser(followerId);
		const followedSlug = this.slugForUser(followedId);
		this.follows = this.follows.filter(
			(f) =>
				!(
					(f.followerId === followerSlug || f.followerId === followerId) &&
					(f.followedId === followedSlug || f.followedId === followedId)
				),
		);
	}

	isFollowing(followerId: string, followedId: string): boolean {
		const followerSlug = this.slugForUser(followerId);
		const followedSlug = this.slugForUser(followedId);
		return this.follows.some(
			(f) =>
				(f.followerId === followerSlug || f.followerId === followerId) &&
				(f.followedId === followedSlug || f.followedId === followedId),
		);
	}

	getFollowCounts(userId: string): { followers: number; following: number } {
		const slug = this.slugForUser(userId);
		return {
			followers: this.follows.filter(
				(f) => f.followedId === slug || f.followedId === userId,
			).length,
			following: this.follows.filter(
				(f) => f.followerId === slug || f.followerId === userId,
			).length,
		};
	}

	/** slug から一覧表示用のユーザー情報を組み立てる。匿名ユーザー未登録なら投稿から拾う。 */
	private followUserForSlug(slug: string): {
		slug: string;
		displayName: string;
		avatarUrl?: string;
	} {
		const stored = this.getUserInfoBySlug(slug);
		if (stored)
			return {
				slug,
				displayName: stored.displayName,
				avatarUrl: stored.avatarUrl,
			};
		const post = this.posts.find((p) => p.slug === slug);
		if (post)
			return { slug, displayName: post.displayName, avatarUrl: post.avatarUrl };
		return { slug, displayName: slug };
	}

	private buildFollowList(
		slugs: string[],
		viewerId?: string,
		limit = 100,
	): FollowUser[] {
		const hidden = this.getHiddenSlugs(viewerId);
		const viewerSlug = viewerId ? this.slugForUser(viewerId) : undefined;
		const viewerFollowing = viewerSlug
			? new Set(
					this.follows
						.filter((f) => f.followerId === viewerSlug)
						.map((f) => f.followedId),
				)
			: null;
		return slugs
			.filter((s) => !hidden.has(s))
			.slice(0, limit)
			.map((s) => ({
				...this.followUserForSlug(s),
				isFollowing: viewerFollowing ? viewerFollowing.has(s) : undefined,
				isSelf: viewerSlug ? viewerSlug === s : undefined,
			}));
	}

	getFollowers(userId: string, viewerId?: string, limit = 100): FollowUser[] {
		const slug = this.slugForUser(userId);
		const slugs = this.follows
			.filter((f) => f.followedId === slug || f.followedId === userId)
			.map((f) => f.followerId);
		return this.buildFollowList(slugs.reverse(), viewerId, limit);
	}

	getFollowing(userId: string, viewerId?: string, limit = 100): FollowUser[] {
		const slug = this.slugForUser(userId);
		const slugs = this.follows
			.filter((f) => f.followerId === slug || f.followerId === userId)
			.map((f) => f.followedId);
		return this.buildFollowList(slugs.reverse(), viewerId, limit);
	}

	// ── ブロック / ミュート / 通報 ──

	/**
	 * userId(匿名ID) / displayName / slug のいずれからでも slug を解決する。
	 * クライアントは userId として displayName を渡すため deriveSlug でフォールバックする。
	 */
	private slugForUser(userOrSlug: string): string {
		const stored = this.anonUserData.get(userOrSlug);
		if (stored) return stored.slug;
		return deriveSlug(userOrSlug);
	}

	/** 閲覧者(viewer)に対して非表示にすべき slug 集合: 自分がブロック/ミュート ＋ 自分をブロックした相手。 */
	private getHiddenSlugs(viewerUserOrSlug?: string): Set<string> {
		const hidden = new Set<string>();
		if (!viewerUserOrSlug) return hidden;
		const viewerSlug = this.slugForUser(viewerUserOrSlug);
		for (const b of this.blocks) {
			if (b.blockerSlug === viewerSlug) hidden.add(b.blockedSlug);
			if (b.blockedSlug === viewerSlug) hidden.add(b.blockerSlug); // ブロックは相互不可視
		}
		for (const m of this.mutes) {
			if (m.muterSlug === viewerSlug) hidden.add(m.mutedSlug);
		}
		return hidden;
	}

	blockUser(blockerSlug: string, blockedSlug: string): void {
		if (blockerSlug === blockedSlug) return;
		if (
			!this.blocks.some(
				(b) => b.blockerSlug === blockerSlug && b.blockedSlug === blockedSlug,
			)
		) {
			this.blocks.push({ blockerSlug, blockedSlug });
		}
	}

	unblockUser(blockerSlug: string, blockedSlug: string): void {
		this.blocks = this.blocks.filter(
			(b) => !(b.blockerSlug === blockerSlug && b.blockedSlug === blockedSlug),
		);
	}

	getBlockedSlugs(blockerSlug: string): string[] {
		return this.blocks
			.filter((b) => b.blockerSlug === blockerSlug)
			.map((b) => b.blockedSlug);
	}

	muteUser(muterSlug: string, mutedSlug: string): void {
		if (muterSlug === mutedSlug) return;
		if (
			!this.mutes.some(
				(m) => m.muterSlug === muterSlug && m.mutedSlug === mutedSlug,
			)
		) {
			this.mutes.push({ muterSlug, mutedSlug });
		}
	}

	unmuteUser(muterSlug: string, mutedSlug: string): void {
		this.mutes = this.mutes.filter(
			(m) => !(m.muterSlug === muterSlug && m.mutedSlug === mutedSlug),
		);
	}

	getMutedSlugs(muterSlug: string): string[] {
		return this.mutes
			.filter((m) => m.muterSlug === muterSlug)
			.map((m) => m.mutedSlug);
	}

	reportContent(data: {
		reporterSlug: string;
		targetType: string;
		targetId: string;
		reason: string;
	}): void {
		this.reports.push({
			id: this.genId(),
			reporterSlug: data.reporterSlug,
			targetType: data.targetType,
			targetId: data.targetId,
			reason: data.reason,
			createdAt: this.now(),
		});
	}

	// ── 投稿 / リプライ / メッセージの編集・削除 ──

	/** userId(displayName) が対象投稿の所有者か。 */
	private ownsPost(post: Post, userId: string): boolean {
		return (
			post.displayName === userId || post.slug === this.slugForUser(userId)
		);
	}

	editPost(
		id: number,
		userId: string,
		content: string,
		originType?: OriginType | null,
		imageSrc?: string,
		_mml?: unknown,
		dotMeta?: {
			dotW?: number | null;
			dotH?: number | null;
			animFrames?: number | null;
			animFps?: number | null;
			walkPreset?: string | null;
		},
	): Post | null {
		const post = this.posts.find((p) => p.id === id);
		if (!post || !this.ownsPost(post, userId)) return null;
		const hasContentChanged = post.content !== content;
		const hasOriginTypeChanged =
			originType !== undefined &&
			post.originType !== (originType == null ? undefined : originType);
		const hasDotMetaChanged = !!dotMeta;
		if (
			hasContentChanged ||
			hasOriginTypeChanged ||
			imageSrc !== undefined ||
			hasDotMetaChanged
		) {
			post.isEdited = true;
		}
		post.content = content;
		post.hasMml = extractMmlFromContent(content) !== null;
		if (originType !== undefined)
			post.originType = originType == null ? undefined : originType;
		if (imageSrc !== undefined) post.imageSrc = imageSrc;
		if (dotMeta) {
			if ("dotW" in dotMeta) post.dotW = dotMeta.dotW ?? undefined;
			if ("dotH" in dotMeta) post.dotH = dotMeta.dotH ?? undefined;
			if ("animFrames" in dotMeta)
				post.animFrames = dotMeta.animFrames ?? undefined;
			if ("animFps" in dotMeta) post.animFps = dotMeta.animFps ?? undefined;
			if ("walkPreset" in dotMeta)
				post.walkPreset = dotMeta.walkPreset ?? undefined;
		}
		// 親スレッドの replies 配列内の同一投稿も更新
		for (const thread of this.posts) {
			const child = thread.replies?.find((r) => r.id === id);
			if (child) {
				child.content = content;
				child.hasMml = extractMmlFromContent(content) !== null;
				if (originType !== undefined)
					child.originType = originType == null ? undefined : originType;
				if (imageSrc !== undefined) child.imageSrc = imageSrc;
				if (dotMeta) {
					if ("dotW" in dotMeta) child.dotW = dotMeta.dotW ?? undefined;
					if ("dotH" in dotMeta) child.dotH = dotMeta.dotH ?? undefined;
					if ("animFrames" in dotMeta)
						child.animFrames = dotMeta.animFrames ?? undefined;
					if ("animFps" in dotMeta)
						child.animFps = dotMeta.animFps ?? undefined;
					if ("walkPreset" in dotMeta)
						child.walkPreset = dotMeta.walkPreset ?? undefined;
				}
				if (
					hasContentChanged ||
					hasOriginTypeChanged ||
					imageSrc !== undefined ||
					hasDotMetaChanged
				) {
					child.isEdited = true;
				}
			}
		}
		return this.getPost(id, userId) ?? null;
	}

	deletePost(id: number, userId: string): boolean {
		const post = this.posts.find((p) => p.id === id);
		if (!post || !this.ownsPost(post, userId)) return false;

		const isReply = post.parentPostId != null && post.threadId !== post.id;
		const hasChildren =
			this.posts.some((p) => p.parentPostId === id && p.id !== id) ||
			(post.replies?.length ?? 0) > 0;

		if (!isReply && hasChildren) {
			// 子を持つスレッド親は論理削除(プレースホルダ表示)
			post.content = "(削除されました)";
			post.hasImage = false;
			post.imageSrc = undefined;
			post.hasGame = false;
			post.gameId = undefined;
			post.hasMv = false;
			post.mvId = undefined;
			return true;
		}

		// それ以外はハード削除
		this.posts = this.posts.filter((p) => p.id !== id);
		// 親スレッドの replies 配列とカウントを更新
		for (const thread of this.posts) {
			if (thread.replies?.some((r) => r.id === id)) {
				thread.replies = thread.replies.filter((r) => r.id !== id);
				thread.repliesCount = Math.max(0, thread.repliesCount - 1);
			}
		}
		return true;
	}

	deleteMessage(id: number, userId: string): boolean {
		const msg = this.messages.find((m) => m.id === id);
		if (!msg) return false;
		if (
			msg.sender !== userId &&
			this.slugForUser(msg.sender) !== this.slugForUser(userId)
		)
			return false;
		this.messages = this.messages.filter((m) => m.id !== id);
		return true;
	}

	// ── プライバシー設定 ──

	getUserSettings(slug: string): {
		isPrivate: boolean;
		hideFromSearch: boolean;
		hideReactions: boolean;
	} {
		const key = this.slugForUser(slug);
		return (
			this.userSettings.get(key) ?? {
				isPrivate: false,
				hideFromSearch: false,
				hideReactions: false,
			}
		);
	}

	updateUserSettings(
		slug: string,
		settings: Partial<{
			isPrivate: boolean;
			hideFromSearch: boolean;
			hideReactions: boolean;
		}>,
	): void {
		const key = this.slugForUser(slug);
		const current = this.getUserSettings(key);
		const next = { ...current, ...settings };
		this.userSettings.set(key, next);
		if (next.hideFromSearch) this.hiddenFromSearchSlugs.add(key);
		else this.hiddenFromSearchSlugs.delete(key);
	}

	/** 鍵アカウント考慮: 閲覧者が投稿主を閲覧できるか。 */
	private canViewAuthor(
		authorSlug: string,
		authorDisplayName: string,
		viewerId?: string,
	): boolean {
		const settings = this.userSettings.get(authorSlug);
		if (!settings?.isPrivate) return true;
		if (!viewerId) return false;
		if (this.slugForUser(viewerId) === authorSlug) return true; // 本人
		return this.isFollowing(viewerId, authorDisplayName);
	}

	// ── 移行トークン(匿名アカウントの引き継ぎ) ──

	issueMigrationToken(userId: string): string {
		const token = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
		this.migrationTokens.set(token, userId);
		return token;
	}

	redeemMigrationToken(
		token: string,
		newSessionId: string,
	): AnonymousUser | null {
		const userId = this.migrationTokens.get(token);
		if (!userId) return null;
		const stored = this.anonUserData.get(userId);
		if (!stored) return null;
		// 新セッションを既存ユーザーに再バインド
		this.sessionToUser.set(newSessionId, userId);
		stored.sessionId = newSessionId;
		stored.lastSeenAt = this.now();
		this.migrationTokens.delete(token); // ワンタイム
		return {
			id: stored.id,
			displayName: stored.displayName,
			slug: stored.slug,
			avatarColor: stored.avatarColor,
			createdAt: stored.createdAt,
		};
	}
}

export const db = new MockDB();
