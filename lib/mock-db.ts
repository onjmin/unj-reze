import { Post, Reply } from './types';
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

  constructor() {
    this.posts = JSON.parse(JSON.stringify(INITIAL_POSTS));
    for (const post of this.posts) {
      if (!post.slug) post.slug = deriveSlug(post.displayName);
      if (!post.createdAt) post.createdAt = parseRelativeTime(post.time);
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

  getPosts(): Post[] {
    return this.posts;
  }

  getUserPostsBySlug(slug: string): Post[] {
    return this.posts.filter(p => p.slug === slug);
  }

  getUserDisplayName(slug: string): string | undefined {
    const post = this.posts.find(p => p.slug === slug);
    return post?.displayName;
  }

  getPost(id: number): Post | undefined {
    return this.posts.find(p => p.id === id);
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
      replies: [],
    };
    this.posts.unshift(post);
    return post;
  }

  likePost(id: number): Post | null {
    const post = this.posts.find(p => p.id === id);
    if (!post) return null;
    const liked = !post.liked;
    post.liked = liked;
    post.likes = liked ? post.likes + 1 : post.likes - 1;
    if (liked && post.disliked) {
      post.disliked = false;
      post.dislikes -= 1;
    }
    return post;
  }

  dislikePost(id: number): Post | null {
    const post = this.posts.find(p => p.id === id);
    if (!post) return null;
    const disliked = !post.disliked;
    post.disliked = disliked;
    post.dislikes = disliked ? post.dislikes + 1 : post.dislikes - 1;
    if (disliked && post.liked) {
      post.liked = false;
      post.likes -= 1;
    }
    return post;
  }

  repostPost(id: number): Post | null {
    const post = this.posts.find(p => p.id === id);
    if (!post) return null;
    post.reposted = !post.reposted;
    post.reposts = post.reposted ? post.reposts + 1 : post.reposts - 1;
    return post;
  }

  addReply(postId: number, data: { displayName: string; content: string }): Reply | null {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return null;
    const createdAt = this.now();
    const reply: Reply = {
      id: this.genId(),
      displayName: data.displayName,
      content: data.content,
      createdAt,
      time: formatRelativeTime(createdAt),
    };
    post.replies.push(reply);
    post.repliesCount = post.replies.length;
    return reply;
  }

  getReplies(postId: number): Reply[] {
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
