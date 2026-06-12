import { Post, Reply } from '../types';
import type { Notification, Message, Trend } from '../mock-db';

export interface CreatePostParams {
  displayName: string;
  content: string;
  hasImage?: boolean;
  imageSrc?: string;
  imageAlt?: string;
  avatarColor?: string;
  slug?: string;
}

export interface ReplyParams {
  displayName: string;
  content: string;
}

export interface MessageParams {
  sender: string;
  text: string;
}

export interface DataStore {
  getPosts(userId?: string): Promise<Post[]>;
  getPost(id: number, userId?: string): Promise<Post | null>;
  createPost(data: CreatePostParams): Promise<Post>;
  likePost(id: number, userId: string): Promise<Post | null>;
  dislikePost(id: number, userId: string): Promise<Post | null>;
  heartPost(id: number, userId: string, count?: number): Promise<Post | null>;
  repostPost(id: number): Promise<Post | null>;
  getReplies(postId: number): Promise<Reply[]>;
  addReply(postId: number, data: ReplyParams): Promise<Reply | null>;
  getUserPostsBySlug(slug: string, userId?: string): Promise<Post[]>;
  getUserDisplayName(slug: string): Promise<string | undefined>;
  getNotifications(): Promise<Notification[]>;
  getMessages(): Promise<Message[]>;
  addMessage(data: MessageParams): Promise<Message>;
  getTrends(): Promise<Trend[]>;
}
