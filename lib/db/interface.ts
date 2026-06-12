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
  getPosts(): Promise<Post[]>;
  getPost(id: number): Promise<Post | null>;
  createPost(data: CreatePostParams): Promise<Post>;
  likePost(id: number): Promise<Post | null>;
  dislikePost(id: number): Promise<Post | null>;
  repostPost(id: number): Promise<Post | null>;
  getReplies(postId: number): Promise<Reply[]>;
  addReply(postId: number, data: ReplyParams): Promise<Reply | null>;
  getUserPostsBySlug(slug: string): Promise<Post[]>;
  getUserDisplayName(slug: string): Promise<string | undefined>;
  getNotifications(): Promise<Notification[]>;
  getMessages(): Promise<Message[]>;
  addMessage(data: MessageParams): Promise<Message>;
  getTrends(): Promise<Trend[]>;
}
