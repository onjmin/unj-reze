import { db as mockDb } from '../mock-db';
import type { DataStore, CreatePostParams, ReplyParams, MessageParams, GameRecord, CreateGameParams } from './interface';

const gameStore = new Map<number, GameRecord>();

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

  async createGame(data: CreateGameParams): Promise<GameRecord> {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const record: GameRecord = { id, preset: data.preset, title: data.title, manifest: data.manifest, createdAt: new Date().toISOString() };
    gameStore.set(id, record);
    return record;
  },

  async getGame(id: number): Promise<GameRecord | null> {
    return gameStore.get(id) ?? null;
  },

  async listAllGames() {
    return Array.from(gameStore.values());
  },

  async getLiveGameInfo(_ipAddress: string) {
    const games = Array.from(gameStore.values());
    const slot = new Date().toISOString().slice(0, 13);
    const game = games[0] ?? null;
    return {
      gameId: game?.id ?? null,
      gameTitle: game?.title ?? '',
      gamePreset: game?.preset ?? '',
      hourSlot: slot,
      postId: null,
      nextCandidates: games.map(g => ({ game: { id: g.id, preset: g.preset, title: g.title, createdAt: g.createdAt }, votes: 0 })),
      myVote: null,
    };
  },

  async voteGame(_gameId: number, _ipAddress: string) {},

  async updatePlayerPosition(_sessionId: string, _gameId: number, _x: number, _y: number, _emoji: string) {},

  async getGamePlayers(_gameId: number, _excludeSession: string) {
    return [];
  },
};
