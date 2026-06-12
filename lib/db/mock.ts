import { db as mockDb } from '../mock-db';
import type { DataStore, CreatePostParams, ReplyParams, MessageParams } from './interface';

export const mockStore: DataStore = {
  async getPosts(userId?: string) {
    return mockDb.getPosts(userId);
  },

  async getPost(id: number, userId?: string) {
    return mockDb.getPost(id, userId) ?? null;
  },

  async createPost(data: CreatePostParams) {
    return mockDb.createPost(data);
  },

  async likePost(id: number, userId: string) {
    return mockDb.likePost(id, userId);
  },

  async dislikePost(id: number, userId: string) {
    return mockDb.dislikePost(id, userId);
  },

  async heartPost(id: number, userId: string, count?: number) {
    return mockDb.heartPost(id, userId, count);
  },

  async repostPost(id: number) {
    return mockDb.repostPost(id);
  },

  async getReplies(postId: number) {
    return mockDb.getReplies(postId);
  },

  async addReply(postId: number, data: ReplyParams) {
    return mockDb.addReply(postId, data);
  },

  async getUserPostsBySlug(slug: string, userId?: string) {
    return mockDb.getUserPostsBySlug(slug, userId);
  },

  async getUserDisplayName(slug: string) {
    return mockDb.getUserDisplayName(slug);
  },

  async getNotifications() {
    return mockDb.getNotifications();
  },

  async getMessages() {
    return mockDb.getMessages();
  },

  async addMessage(data: MessageParams) {
    return mockDb.addMessage(data);
  },

  async getTrends() {
    return mockDb.getTrends();
  },
};
