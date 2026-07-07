import { AnonymousUser, OriginType } from './types';
import { DbPost as Post, DbNotification as Notification } from './types-db';
import { INITIAL_POSTS } from './data';
import { formatRelativeTime, nowISO } from './time';
import { cleanContentForTrends, isValidTrendKeyword } from './mml';


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

const NOTIFICATION_INFOS: { user: string; action: string; target: string; type: string; postId?: number; targetUser?: string; time: string }[] = [
  { user: "名無しXz9", action: "がいいねしました", target: "青空の写真", type: "like", postId: 7, time: "3分前" },
  { user: "名無しLm8", action: "がリポストしました", target: "ドット絵の練習中", type: "repost", postId: 6, time: "8分前" },
  { user: "名無しBn5", action: "が返信しました", target: "作業用BGM何聴いてる？", type: "reply", postId: 5, time: "15分前" },
  { user: "名無しVc1", action: "がフォローしました", target: "", type: "follow", targetUser: "名無しvFZ", time: "1時間前" },
];

function deriveSlug(fullName: string): string {
  const match = fullName.match(/[a-zA-Z0-9]+$/);
  return match ? match[0] : fullName;
}

const MESSAGE_INFOS: { sender: string; text: string; recipient?: string; time: string }[] = [
  { sender: "名無しLm8", text: "おはよう！今日の雪写真見た？", time: "7時間前" },
  { sender: "名無しXz9", text: "イラストまとめ見てくれてありがとう！", time: "2日前" },
  { sender: "名無しQp7", text: "ドット絵のコツ教えてくれる？", time: "1日前" },
];

function parseRelativeTime(relative: string): string {
  const now = Date.now();
  const match = relative.match(/^(\d+)(分前|時間前|日前|秒前)$/);
  if (!match) return nowISO();
  const num = parseInt(match[1]);
  const unit = match[2];
  let offset = 0;
  if (unit === '秒前') offset = num * 1000;
  else if (unit === '分前') offset = num * 60 * 1000;
  else if (unit === '時間前') offset = num * 60 * 60 * 1000;
  else if (unit === '日前') offset = num * 24 * 60 * 60 * 1000;
  return new Date(now - offset).toISOString();
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-red-500 to-rose-600',
  'from-emerald-400 to-teal-500',
  'from-purple-400 to-violet-500',
  'from-amber-400 to-yellow-500',
  'from-pink-400 to-rose-500',
  'from-cyan-400 to-indigo-500',
  'from-lime-400 to-green-500',
  'from-orange-400 to-red-500',
  'from-teal-400 to-cyan-500',
];

function generateDisplayName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 15; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
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
  private votes: Map<string, 'like' | 'dislike'> = new Map();
  private heartCounts: Map<number, number> = new Map();
  private heartEntries: { postId: number; userId: string }[] = [];
  private anonUserData: Map<string, { id: string; ipAddress: string; sessionId: string; displayName: string; slug: string; avatarColor: string; createdAt: string; lastSeenAt: string }> = new Map();
  private ipToUser: Map<string, string> = new Map();
  private sessionToUser: Map<string, string> = new Map();
  private follows: { followerId: string; followedId: string }[] = [];
  private blocks: { blockerSlug: string; blockedSlug: string }[] = [];
  private mutes: { muterSlug: string; mutedSlug: string }[] = [];
  private reports: { id: number; reporterSlug: string; targetType: string; targetId: string; reason: string; createdAt: string }[] = [];
  // Phase 7: ユーザー設定(slug単位)。isPrivate / hideFromSearch / hideReactions。
  private userSettings: Map<string, { isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }> = new Map();
  private hiddenFromSearchSlugs: Set<string> = new Set();
  // Phase 2: 移行トークン(token -> userId)。
  private migrationTokens: Map<string, string> = new Map();

  constructor() {
    this.posts = JSON.parse(JSON.stringify(INITIAL_POSTS));
    for (const post of this.posts) {
      if (!post.slug) post.slug = deriveSlug(post.displayName);
      if (!post.createdAt) post.createdAt = parseRelativeTime(post.time);
      this.heartCounts.set(post.id, post.heartsTotal);
      for (const reply of post.replies) {
        if (!reply.slug) reply.slug = deriveSlug(reply.displayName);
        if (!reply.createdAt) reply.createdAt = parseRelativeTime(reply.time);
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

  getOrCreateAnonymousUser(sessionId: string, ipAddress: string): AnonymousUser {
    const existingBySession = this.sessionToUser.get(sessionId);
    if (existingBySession) {
      const stored = this.anonUserData.get(existingBySession)!;
      stored.lastSeenAt = this.now();
      return { id: stored.id, displayName: stored.displayName, slug: stored.slug, avatarColor: stored.avatarColor, createdAt: stored.createdAt };
    }

    const existingByIp = this.ipToUser.get(ipAddress);
    if (existingByIp) {
      const stored = this.anonUserData.get(existingByIp)!;
      this.sessionToUser.set(sessionId, stored.id);
      stored.lastSeenAt = this.now();
      return { id: stored.id, displayName: stored.displayName, slug: stored.slug, avatarColor: stored.avatarColor, createdAt: stored.createdAt };
    }

    const id = this.generateId();
    const displayName = generateDisplayName();
    const slug = generateSlug(displayName);
    const avatarColor = randomGradient();
    const createdAt = this.now();
    const stored = { id, ipAddress, sessionId, displayName, slug, avatarColor, createdAt, lastSeenAt: createdAt };
    this.anonUserData.set(id, stored);
    this.ipToUser.set(ipAddress, id);
    this.sessionToUser.set(sessionId, id);
    return { id, displayName, slug, avatarColor, createdAt };
  }

  updateUserDisplayName(userId: string, displayName: string): void {
    const stored = this.anonUserData.get(userId);
    if (stored) {
      stored.displayName = displayName;
      stored.slug = generateSlug(displayName);
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
      post.liked = this.votes.get(likeKey) === 'like';
      post.disliked = this.votes.get(dislikeKey) === 'dislike';
    } else {
      post.liked = false;
      post.disliked = false;
    }
    post.heartsTotal = this.heartCounts.get(post.id) ?? post.heartsTotal;
    return post;
  }

  getPosts(userId?: string): Post[] {
    const hidden = this.getHiddenSlugs(userId);
    return this.posts
      .filter(p => p.id === p.threadId)
      .filter(p => !hidden.has(p.slug ?? ''))
      .filter(p => this.canViewAuthor(p.slug ?? '', p.displayName, userId))
      .map(p => this.applyUserState({ ...p, replies: [...p.replies].filter(r => !hidden.has(r.slug ?? '')) }, userId));
  }

  getUserPostsBySlug(slug: string, userId?: string): Post[] {
    const hidden = this.getHiddenSlugs(userId);
    if (hidden.has(slug)) return [];
    const posts = this.posts.filter(p => p.slug === slug);
    const author = posts[0];
    if (author && !this.canViewAuthor(slug, author.displayName, userId)) return [];
    return posts.map(p => this.applyUserState({ ...p, replies: [...p.replies] }, userId));
  }

  getLikedPosts(userId: string): Post[] {
    const likedIds = new Set<number>();
    for (const [key, val] of this.votes) {
      if (key.endsWith(`:${userId}:like`) && val === 'like') {
        likedIds.add(parseInt(key.split(':')[0], 10));
      }
    }
    return this.posts.filter(p => likedIds.has(p.id)).map(p => this.applyUserState({ ...p, replies: [...p.replies] }, userId));
  }

  getDislikedPosts(userId: string): Post[] {
    const dislikedIds = new Set<number>();
    for (const [key, val] of this.votes) {
      if (key.endsWith(`:${userId}:dislike`) && val === 'dislike') {
        dislikedIds.add(parseInt(key.split(':')[0], 10));
      }
    }
    return this.posts.filter(p => dislikedIds.has(p.id)).map(p => this.applyUserState({ ...p, replies: [...p.replies] }, userId));
  }

  getHeartedPosts(userId: string): Post[] {
    const heartedIds = new Set<number>();
    for (const e of this.heartEntries) {
      if (e.userId === userId) heartedIds.add(e.postId);
    }
    return this.posts.filter(p => heartedIds.has(p.id)).map(p => this.applyUserState({ ...p, replies: [...p.replies] }, userId));
  }

  getUserDisplayName(slug: string): string | undefined {
    const post = this.posts.find(p => p.slug === slug);
    return post?.displayName;
  }

  getPost(id: number, userId?: string): Post | undefined {
    const post = this.posts.find(p => p.id === id);
    if (!post) return undefined;
    if (!this.canViewAuthor(post.slug ?? '', post.displayName, userId)) return undefined;
    return this.applyUserState({ ...post, replies: [...post.replies] }, userId);
  }

  createPost(data: {
    displayName: string;
    content: string;
    hasImage?: boolean;
    imageSrc?: string;
    imageAlt?: string;
    avatarColor?: string;
    slug?: string;
    gameId?: number;
    originType?: OriginType;
  }): Post {
    const createdAt = this.now();
    const post: Post = {
      id: this.genId(),
      displayName: data.displayName,
      slug: data.slug || deriveSlug(data.displayName),
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
    const post = this.posts.find(p => p.id === id);
    if (!post) return null;
    const likeKey = `${id}:${userId}:like`;
    const dislikeKey = `${id}:${userId}:dislike`;
    const alreadyLiked = this.votes.get(likeKey) === 'like';
    if (alreadyLiked) {
      this.votes.delete(likeKey);
      post.likes -= 1;
    } else {
      if (this.votes.get(dislikeKey) === 'dislike') {
        this.votes.delete(dislikeKey);
        post.dislikes -= 1;
      }
      this.votes.set(likeKey, 'like');
      post.likes += 1;
      this.createNotification({ recipientId: post.displayName, actor: userId, type: 'like', action: 'がいいねしました', target: this.snippet(post.content), postId: id });
    }
    return this.getPost(id, userId) ?? null;
  }

  dislikePost(id: number, userId: string): Post | null {
    const post = this.posts.find(p => p.id === id);
    if (!post) return null;
    const likeKey = `${id}:${userId}:like`;
    const dislikeKey = `${id}:${userId}:dislike`;
    const alreadyDisliked = this.votes.get(dislikeKey) === 'dislike';
    if (alreadyDisliked) {
      this.votes.delete(dislikeKey);
      post.dislikes -= 1;
    } else {
      if (this.votes.get(likeKey) === 'like') {
        this.votes.delete(likeKey);
        post.likes -= 1;
      }
      this.votes.set(dislikeKey, 'dislike');
      post.dislikes += 1;
    }
    return this.getPost(id, userId) ?? null;
  }

  heartPost(id: number, userId: string, count: number = 1): Post | null {
    const post = this.posts.find(p => p.id === id);
    if (!post) return null;
    for (let i = 0; i < count; i++) {
      this.heartEntries.push({ postId: id, userId });
    }
    const current = this.heartCounts.get(id) ?? 0;
    this.heartCounts.set(id, current + count);
    this.createNotification({ recipientId: post.displayName, actor: userId, type: 'heart', action: 'がハートを送りました', target: this.snippet(post.content), postId: id });
    return this.getPost(id) ?? null;
  }

  repostPost(id: number): Post | null {
    const post = this.posts.find(p => p.id === id);
    if (!post) return null;
    post.reposted = !post.reposted;
    post.reposts = post.reposted ? post.reposts + 1 : post.reposts - 1;
    return post;
  }

  addReply(postId: number, data: {
    displayName: string;
    content: string;
    parentPostId?: number;
    hasImage?: boolean;
    imageSrc?: string;
    imageAlt?: string;
    avatarColor?: string;
    gameId?: number;
    originType?: OriginType;
  }): Post | null {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return null;
    const id = Math.max(0, ...this.posts.map(p => p.id)) + 1;
    const reply: Post = {
      id, displayName: data.displayName, slug: data.displayName, createdAt: new Date().toISOString(), time: "たった今",
      content: data.content, likes: 0, dislikes: 0, liked: false, disliked: false,
      repliesCount: 0, reposts: 0, reposted: false,
      avatarColor: data.avatarColor || 'from-blue-400 to-indigo-500', heartsTotal: 0, replies: [],
      threadId: post.threadId === post.id ? post.id : post.threadId,
      parentPostId: data.parentPostId ?? post.id,
      hasImage: data.hasImage,
      imageSrc: data.imageSrc,
      imageAlt: data.imageAlt,
      gameId: data.gameId,
      hasGame: !!data.gameId,
      originType: data.originType,
    };
    this.posts.push(reply);
    post.repliesCount += 1;
    if (post.replies) post.replies.push(reply);

    // 返信先の投稿主へ通知(自己宛は除外)
    const parentId = data.parentPostId ?? post.id;
    const parent = this.posts.find(p => p.id === parentId) ?? post;
    this.createNotification({ recipientId: parent.displayName, actor: data.displayName, type: 'reply', action: 'が返信しました', target: this.snippet(data.content), postId: post.id });

    // 本文中の @slug メンション宛に通知
    const mentions = data.content.match(/@([A-Za-z0-9]+)/g);
    if (mentions) {
      const seen = new Set<string>();
      for (const m of mentions) {
        const slug = m.slice(1);
        if (seen.has(slug)) continue;
        seen.add(slug);
        const target = this.posts.find(p => p.slug === slug);
        if (target && target.displayName !== parent.displayName) {
          this.createNotification({ recipientId: target.displayName, actor: data.displayName, type: 'mention', action: 'があなたにメンションしました', target: this.snippet(data.content), postId: post.id });
        }
      }
    }
    return reply;
  }

  getReplies(postId: number, userId?: string): Post[] {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return [];
    const hidden = this.getHiddenSlugs(userId);
    return (post.replies ?? []).filter(r => !hidden.has(r.slug ?? ''));
  }

  getNotifications(userId?: string): Notification[] {
    if (!userId) return this.notifications;
    return this.notifications
      .filter(n => n.recipientId === userId || n.targetUser === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  /** 通知を生成する。自己宛(actor===recipient)は生成しない。 */
  createNotification(data: { recipientId: string; actor: string; type: string; action: string; target?: string; postId?: number }): void {
    if (!data.recipientId || data.recipientId === data.actor) return;
    this.notifications.push({
      id: this.genId(),
      user: data.actor,
      action: data.action,
      target: data.target ?? '',
      type: data.type,
      postId: data.postId,
      recipientId: data.recipientId,
      targetUser: data.recipientId,
      read: false,
      createdAt: this.now(),
      time: 'たった今',
    });
  }

  markNotificationRead(id: number, userId: string): void {
    const n = this.notifications.find(n => n.id === id && (n.recipientId === userId || n.targetUser === userId));
    if (n) n.read = true;
  }

  markAllNotificationsRead(userId: string): void {
    for (const n of this.notifications) {
      if (n.recipientId === userId || n.targetUser === userId) n.read = true;
    }
  }

  deleteNotification(id: number, userId: string): void {
    this.notifications = this.notifications.filter(n => !(n.id === id && (n.recipientId === userId || n.targetUser === userId)));
  }

  getUnreadCount(userId: string): number {
    return this.notifications.filter(n => (n.recipientId === userId || n.targetUser === userId) && !n.read).length;
  }

  private snippet(text: string): string {
    return text.length > 20 ? text.slice(0, 20) + '…' : text;
  }

  getMessages(userId?: string): Message[] {
    if (!userId) return this.messages;
    const hidden = this.getHiddenSlugs(userId);
    return this.messages
      .filter(m => !m.recipient || m.sender === userId || m.recipient === userId)
      .filter(m => !hidden.has(this.slugForUser(m.sender)));
  }

  addMessage(data: { sender: string; text: string; recipient?: string }): Message {
    const createdAt = this.now();
    const msg: Message = {
      id: this.genId(),
      sender: data.sender,
      text: data.text,
      recipient: data.recipient,
      createdAt,
      time: formatRelativeTime(createdAt),
    };
    this.messages.push(msg);
    return msg;
  }

  searchPosts(query: string, userId?: string): Post[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const hidden = this.getHiddenSlugs(userId);
    return this.posts
      .filter(p => p.id === p.threadId)
      .filter(p => !hidden.has(p.slug ?? ''))
      .filter(p => !this.hiddenFromSearchSlugs.has(p.slug ?? ''))
      .filter(p => p.content.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q))
      .map(p => this.applyUserState({ ...p, replies: [...p.replies] }, userId));
  }

  getPostsByHashtag(tag: string, userId?: string): Post[] {
    const normalized = tag.startsWith('#') ? tag : `#${tag}`;
    const hidden = this.getHiddenSlugs(userId);
    return this.posts
      .filter(p => p.id === p.threadId)
      .filter(p => !hidden.has(p.slug ?? ''))
      .filter(p => !this.hiddenFromSearchSlugs.has(p.slug ?? ''))
      .filter(p => {
        const tags = p.content.match(/#[^\s#]+/g);
        return tags?.some(t => t === normalized) ?? false;
      })
      .map(p => this.applyUserState({ ...p, replies: [...p.replies] }, userId));
  }

  getTrends(): Trend[] {
    const freq = new Map<string, number>();
    const allContent = this.posts.map(p => p.content).concat(
      this.posts.flatMap(p => p.replies.map(r => r.content))
    );
    for (const content of allContent) {
      const cleaned = cleanContentForTrends(content);
      const hashtags = cleaned.match(/#[^\s#]+/g);
      if (hashtags) {
        for (const tag of hashtags) {
          if (isValidTrendKeyword(tag)) {
            freq.set(tag, (freq.get(tag) || 0) + 1);
          }
        }
      }
    }
    return Array.from(freq.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  followUser(followerId: string, followedId: string): void {
    if (followerId === followedId) return;
    const exists = this.follows.some(f => f.followerId === followerId && f.followedId === followedId);
    if (!exists) {
      this.follows.push({ followerId, followedId });
      this.createNotification({ recipientId: followedId, actor: followerId, type: 'follow', action: 'がフォローしました', target: '', postId: undefined });
    }
  }

  unfollowUser(followerId: string, followedId: string): void {
    this.follows = this.follows.filter(f => !(f.followerId === followerId && f.followedId === followedId));
  }

  isFollowing(followerId: string, followedId: string): boolean {
    return this.follows.some(f => f.followerId === followerId && f.followedId === followedId);
  }

  getFollowCounts(userId: string): { followers: number; following: number } {
    return {
      followers: this.follows.filter(f => f.followedId === userId).length,
      following: this.follows.filter(f => f.followerId === userId).length,
    };
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
    if (!this.blocks.some(b => b.blockerSlug === blockerSlug && b.blockedSlug === blockedSlug)) {
      this.blocks.push({ blockerSlug, blockedSlug });
    }
  }

  unblockUser(blockerSlug: string, blockedSlug: string): void {
    this.blocks = this.blocks.filter(b => !(b.blockerSlug === blockerSlug && b.blockedSlug === blockedSlug));
  }

  getBlockedSlugs(blockerSlug: string): string[] {
    return this.blocks.filter(b => b.blockerSlug === blockerSlug).map(b => b.blockedSlug);
  }

  muteUser(muterSlug: string, mutedSlug: string): void {
    if (muterSlug === mutedSlug) return;
    if (!this.mutes.some(m => m.muterSlug === muterSlug && m.mutedSlug === mutedSlug)) {
      this.mutes.push({ muterSlug, mutedSlug });
    }
  }

  unmuteUser(muterSlug: string, mutedSlug: string): void {
    this.mutes = this.mutes.filter(m => !(m.muterSlug === muterSlug && m.mutedSlug === mutedSlug));
  }

  getMutedSlugs(muterSlug: string): string[] {
    return this.mutes.filter(m => m.muterSlug === muterSlug).map(m => m.mutedSlug);
  }

  reportContent(data: { reporterSlug: string; targetType: string; targetId: string; reason: string }): void {
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
    return post.displayName === userId || post.slug === this.slugForUser(userId);
  }

  editPost(id: number, userId: string, content: string, originType?: OriginType | null): Post | null {
    const post = this.posts.find(p => p.id === id);
    if (!post || !this.ownsPost(post, userId)) return null;
    const hasContentChanged = post.content !== content;
    const hasOriginTypeChanged = originType !== undefined && (post.originType !== (originType == null ? undefined : originType));
    if (hasContentChanged || hasOriginTypeChanged) {
      post.isEdited = true;
    }
    post.content = content;
    if (originType !== undefined) post.originType = originType == null ? undefined : originType;
    // 親スレッドの replies 配列内の同一投稿も更新
    for (const thread of this.posts) {
      const child = thread.replies?.find(r => r.id === id);
      if (child) {
        child.content = content;
        if (originType !== undefined) child.originType = originType == null ? undefined : originType;
        if (hasContentChanged || hasOriginTypeChanged) {
          child.isEdited = true;
        }
      }
    }
    return this.getPost(id, userId) ?? null;
  }

  deletePost(id: number, userId: string): boolean {
    const post = this.posts.find(p => p.id === id);
    if (!post || !this.ownsPost(post, userId)) return false;

    const isReply = post.parentPostId != null && post.threadId !== post.id;
    const hasChildren = this.posts.some(p => p.parentPostId === id && p.id !== id)
      || (post.replies?.length ?? 0) > 0;

    if (!isReply && hasChildren) {
      // 子を持つスレッド親は論理削除(プレースホルダ表示)
      post.content = '(削除されました)';
      post.hasImage = false;
      post.imageSrc = undefined;
      post.hasGame = false;
      post.gameId = undefined;
      return true;
    }

    // それ以外はハード削除
    this.posts = this.posts.filter(p => p.id !== id);
    // 親スレッドの replies 配列とカウントを更新
    for (const thread of this.posts) {
      if (thread.replies?.some(r => r.id === id)) {
        thread.replies = thread.replies.filter(r => r.id !== id);
        thread.repliesCount = Math.max(0, thread.repliesCount - 1);
      }
    }
    return true;
  }

  deleteMessage(id: number, userId: string): boolean {
    const msg = this.messages.find(m => m.id === id);
    if (!msg) return false;
    if (msg.sender !== userId && this.slugForUser(msg.sender) !== this.slugForUser(userId)) return false;
    this.messages = this.messages.filter(m => m.id !== id);
    return true;
  }

  // ── プライバシー設定 ──

  getUserSettings(slug: string): { isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean } {
    const key = this.slugForUser(slug);
    return this.userSettings.get(key) ?? { isPrivate: false, hideFromSearch: false, hideReactions: false };
  }

  updateUserSettings(slug: string, settings: Partial<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>): void {
    const key = this.slugForUser(slug);
    const current = this.getUserSettings(key);
    const next = { ...current, ...settings };
    this.userSettings.set(key, next);
    if (next.hideFromSearch) this.hiddenFromSearchSlugs.add(key);
    else this.hiddenFromSearchSlugs.delete(key);
  }

  /** 鍵アカウント考慮: 閲覧者が投稿主を閲覧できるか。 */
  private canViewAuthor(authorSlug: string, authorDisplayName: string, viewerId?: string): boolean {
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

  redeemMigrationToken(token: string, newSessionId: string): AnonymousUser | null {
    const userId = this.migrationTokens.get(token);
    if (!userId) return null;
    const stored = this.anonUserData.get(userId);
    if (!stored) return null;
    // 新セッションを既存ユーザーに再バインド
    this.sessionToUser.set(newSessionId, userId);
    stored.sessionId = newSessionId;
    stored.lastSeenAt = this.now();
    this.migrationTokens.delete(token); // ワンタイム
    return { id: stored.id, displayName: stored.displayName, slug: stored.slug, avatarColor: stored.avatarColor, createdAt: stored.createdAt };
  }
}

export const db = new MockDB();
