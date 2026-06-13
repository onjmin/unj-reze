import { Post, AnonymousUser } from './types';
import { INITIAL_POSTS } from './data';
import { formatRelativeTime, nowISO } from './time';

export interface Notification {
  id: number;
  user: string;
  action: string;
  target: string;
  type: string;
  postId?: number;
  targetUser?: string;
  createdAt: string;
  time: string;
}

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
  let suffix = '';
  for (let i = 0; i < 3; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  return `名無し${suffix}`;
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
    return this.posts.filter(p => p.id === p.threadId).map(p => this.applyUserState({ ...p, replies: [...p.replies] }, userId));
  }

  getUserPostsBySlug(slug: string, userId?: string): Post[] {
    return this.posts.filter(p => p.slug === slug).map(p => this.applyUserState({ ...p, replies: [...p.replies] }, userId));
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
    return this.getPost(id) ?? null;
  }

  repostPost(id: number): Post | null {
    const post = this.posts.find(p => p.id === id);
    if (!post) return null;
    post.reposted = !post.reposted;
    post.reposts = post.reposted ? post.reposts + 1 : post.reposts - 1;
    return post;
  }

  addReply(postId: number, data: { displayName: string; content: string; parentPostId?: number }): Post | null {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return null;
    const id = Math.max(0, ...this.posts.map(p => p.id)) + 1;
    const reply: Post = {
      id, displayName: data.displayName, slug: data.displayName, createdAt: new Date().toISOString(), time: "たった今",
      content: data.content, likes: 0, dislikes: 0, liked: false, disliked: false,
      repliesCount: 0, reposts: 0, reposted: false,
      avatarColor: 'from-blue-400 to-indigo-500', heartsTotal: 0, replies: [],
      threadId: post.threadId === post.id ? post.id : post.threadId,
      parentPostId: data.parentPostId ?? post.id,
    };
    this.posts.push(reply);
    post.repliesCount += 1;
    if (post.replies) post.replies.push(reply);
    return reply;
  }

  getReplies(postId: number): Post[] {
    const post = this.posts.find(p => p.id === postId);
    return post?.replies ?? [];
  }

  getNotifications(userId?: string): Notification[] {
    if (!userId) return this.notifications;
    return this.notifications.filter(n => n.targetUser === userId);
  }

  getMessages(userId?: string): Message[] {
    if (!userId) return this.messages;
    return this.messages.filter(m =>
      !m.recipient || m.sender === userId || m.recipient === userId
    );
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

  searchPosts(query: string): Post[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return this.posts
      .filter(p => p.id === p.threadId)
      .filter(p => p.content.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q))
      .map(p => this.applyUserState({ ...p, replies: [...p.replies] }));
  }

  getTrends(): Trend[] {
    const freq = new Map<string, number>();
    const allContent = this.posts.map(p => p.content).concat(
      this.posts.flatMap(p => p.replies.map(r => r.content))
    );
    for (const content of allContent) {
      const hashtags = content.match(/#[^\s#]+/g);
      if (hashtags) {
        for (const tag of hashtags) {
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
    if (followerId === followedId) return;
    const exists = this.follows.some(f => f.followerId === followerId && f.followedId === followedId);
    if (!exists) this.follows.push({ followerId, followedId });
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
}

export const db = new MockDB();
