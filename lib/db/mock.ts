import { db as mockDb } from '../mock-db';
import type { DataStore, CreatePostParams, ReplyParams, MessageParams } from './interface';

function deriveSlug(fullName: string): string {
  const match = fullName.match(/[a-zA-Z0-9]+$/);
  return match ? match[0] : fullName;
}

export const mockStore: DataStore = {
  async getPosts() {
    return mockDb.getPosts();
  },

  async getPost(id: number) {
    return mockDb.getPost(id) ?? null;
  },

  async createPost(data: CreatePostParams) {
    return mockDb.createPost(data);
  },

  async likePost(id: number) {
    return mockDb.likePost(id);
  },

  async dislikePost(id: number) {
    return mockDb.dislikePost(id);
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

  async getUserPostsBySlug(slug: string) {
    return mockDb.getUserPostsBySlug(slug);
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
