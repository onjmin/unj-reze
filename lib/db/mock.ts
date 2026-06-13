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

  async getLikedPosts(userId: string) {
    return mockDb.getLikedPosts(userId);
  },

  async getDislikedPosts(userId: string) {
    return mockDb.getDislikedPosts(userId);
  },

  async getHeartedPosts(userId: string) {
    return mockDb.getHeartedPosts(userId);
  },

  async getUserDisplayName(slug: string) {
    return mockDb.getUserDisplayName(slug);
  },

  async getNotifications(userId?: string) {
    return mockDb.getNotifications(userId);
  },

  async getMessages(userId?: string) {
    return mockDb.getMessages(userId);
  },

  async addMessage(data: MessageParams) {
    return mockDb.addMessage(data);
  },

  async getTrends() {
    return mockDb.getTrends();
  },

  async searchPosts(query: string) {
    return mockDb.searchPosts(query);
  },

  async getOrCreateAnonymousUser(sessionId: string, ipAddress: string) {
    return mockDb.getOrCreateAnonymousUser(sessionId, ipAddress);
  },

  async updateUserDisplayName(userId: string, displayName: string) {
    return mockDb.updateUserDisplayName(userId, displayName);
  },

  async followUser(followerId: string, followedId: string) {
    return mockDb.followUser(followerId, followedId);
  },

  async unfollowUser(followerId: string, followedId: string) {
    return mockDb.unfollowUser(followerId, followedId);
  },

  async isFollowing(followerId: string, followedId: string) {
    return mockDb.isFollowing(followerId, followedId);
  },

  async getFollowCounts(userId: string) {
    return mockDb.getFollowCounts(userId);
  },
};
