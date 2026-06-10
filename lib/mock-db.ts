import { Post, Reply } from './types';
import { INITIAL_POSTS } from './data';

export interface Notification {
  id: number;
  user: string;
  action: string;
  target: string;
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

const NOTIFICATIONS: Notification[] = [
  { id: 1, user: "名無しXz9", action: "がいいねしました", target: "青空の写真", time: "3分前" },
  { id: 2, user: "名無しLm8", action: "がリポストしました", target: "ドット絵の練習中", time: "8分前" },
  { id: 3, user: "名無しBn5", action: "が返信しました", target: "作業用BGM何聴いてる？", time: "15分前" },
  { id: 4, user: "名無しVc1", action: "がフォローしました", target: "", time: "1時間前" },
];

const MESSAGES: Message[] = [
  { id: 1, sender: "名無しLm8", text: "おはよう！今日の雪写真見た？", time: "7時間前" },
  { id: 2, sender: "名無しXz9", text: "イラストまとめ見てくれてありがとう！", time: "2日前" },
  { id: 3, sender: "名無しQp7", text: "ドット絵のコツ教えてくれる？", time: "1日前" },
];

class MockDB {
  private posts: Post[];
  private notifications: Notification[];
  private messages: Message[];
  private trends: Trend[];

  constructor() {
    this.posts = JSON.parse(JSON.stringify(INITIAL_POSTS));
    this.notifications = [...NOTIFICATIONS];
    this.messages = [...MESSAGES];
    this.trends = [...TRENDS];
  }

  private genId(): number {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  now(): string {
    return "たった今";
  }

  getPosts(): Post[] {
    return this.posts;
  }

  getPost(id: number): Post | undefined {
    return this.posts.find(p => p.id === id);
  }

  createPost(data: {
    name: string;
    content: string;
    hasImage?: boolean;
    imageSrc?: string;
    imageAlt?: string;
    avatarColor?: string;
  }): Post {
    const post: Post = {
      id: this.genId(),
      name: data.name,
      time: this.now(),
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

  addReply(postId: number, data: { name: string; content: string }): Reply | null {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return null;
    const reply: Reply = {
      id: this.genId(),
      name: data.name,
      content: data.content,
      time: this.now(),
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
    const msg: Message = {
      id: this.genId(),
      sender: data.sender,
      text: data.text,
      time: this.now(),
    };
    this.messages.push(msg);
    return msg;
  }

  getTrends(): Trend[] {
    return this.trends;
  }
}

export const db = new MockDB();
