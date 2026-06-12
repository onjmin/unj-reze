import { Post } from './types';
import { INITIAL_POSTS } from './data';
import { formatRelativeTime, nowISO } from './time';

export interface Notification {
  id: number;
  user: string;
  action: string;
  target: string;
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
  createdAt: string;
  time: string;
}

const TRENDS: Trend[] = [
  { keyword: '#お絵描き', count: 150 },
  { keyword: '#ゲーム制作', count: 125 },
  { keyword: 'ドット絵講座', count: 100 },
  { keyword: '作業用BGM', count: 75 },
  { keyword: '名無しBBS', count: 50 },
  { keyword: '春のイラスト祭', count: 40 },
  { keyword: '青空フォト', count: 30 },
  { keyword: 'lofi beats', count: 25 },
];

const NOTIFICATION_INFOS: { user: string; action: string; target: string; time: string }[] = [
  { user: "名無しXz9", action: "がいいねしました", target: "青空の写真", time: "3分前" },
  { user: "名無しLm8", action: "がリポストしました", target: "ドット絵の練習中", time: "8分前" },
  { user: "名無しBn5", action: "が返信しました", target: "作業用BGM何聴いてる？", time: "15分前" },
  { user: "名無しVc1", action: "がフォローしました", target: "", time: "1時間前" },
];

function deriveSlug(fullName: string): string {
  const match = fullName.match(/[a-zA-Z0-9]+$/);
  return match ? match[0] : fullName;
}

const MESSAGE_INFOS: { sender: string; text: string; time: string }[] = [
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

class MockDB {
  private posts: Post[];
  private notifications: Notification[];
  private messages: Message[];
  private trends: Trend[];
  private votes: Map<string, 'like' | 'dislike'> = new Map();
  private heartCounts: Map<number, number> = new Map();

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
      ...n,
      createdAt: parseRelativeTime(n.time),
    }));
    this.messages = MESSAGE_INFOS.map((m, i) => ({
      id: i + 1,
      ...m,
      createdAt: parseRelativeTime(m.time),
    }));
    this.trends = [...TRENDS];
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

  heartPost(id: number, _userId: string, count: number = 1): Post | null {
    const post = this.posts.find(p => p.id === id);
    if (!post) return null;
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

  getNotifications(): Notification[] {
    return this.notifications;
  }

  getMessages(): Message[] {
    return this.messages;
  }

  addMessage(data: { sender: string; text: string }): Message {
    const createdAt = this.now();
    const msg: Message = {
      id: this.genId(),
      sender: data.sender,
      text: data.text,
      createdAt,
      time: formatRelativeTime(createdAt),
    };
    this.messages.push(msg);
    return msg;
  }

  getTrends(): Trend[] {
    return this.trends;
  }
}

export const db = new MockDB();
