import { db as mockDb } from '../mock-db';
import { OriginType } from '../types';
import type { DataStore, CreatePostParams, ReplyParams, MessageParams, CreateGameParams, ReportParams, RecordGamePlayParams } from './interface';
import type { DbGameRecord } from '../types-db';



const gameStore = new Map<number, DbGameRecord>();

export const mockStore: DataStore = {
  async getPosts(userId?: string, limit?: number) {
    return mockDb.getPosts(userId, limit);
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

  async getReplies(postId: number, userId?: string) {
    return mockDb.getReplies(postId, userId);
  },

  async addReply(postId: number, data: ReplyParams) {
    return mockDb.addReply(postId, data);
  },

  async editPost(id: number, userId: string, content: string, originType?: OriginType | null, imageSrc?: string) {
    return mockDb.editPost(id, userId, content, originType, imageSrc);
  },

  async deletePost(id: number, userId: string) {
    return mockDb.deletePost(id, userId);
  },

  async deleteMessage(id: number, userId: string) {
    return mockDb.deleteMessage(id, userId);
  },

  async getUserPostsBySlug(slug: string, userId?: string, limit?: number) {
    return mockDb.getUserPostsBySlug(slug, userId, limit);
  },

  async getLikedPosts(userId: string, limit?: number) {
    return mockDb.getLikedPosts(userId, limit);
  },

  async getDislikedPosts(userId: string, limit?: number) {
    return mockDb.getDislikedPosts(userId, limit);
  },

  async getHeartedPosts(userId: string, limit?: number) {
    return mockDb.getHeartedPosts(userId, limit);
  },

  async getUserDisplayName(slug: string) {
    return mockDb.getUserDisplayName(slug);
  },

  async getNotifications(userId?: string) {
    return mockDb.getNotifications(userId);
  },

  async markNotificationRead(id: number, userId: string) {
    return mockDb.markNotificationRead(id, userId);
  },

  async markAllNotificationsRead(userId: string) {
    return mockDb.markAllNotificationsRead(userId);
  },

  async deleteNotification(id: number, userId: string) {
    return mockDb.deleteNotification(id, userId);
  },

  async getUnreadCount(userId: string) {
    return mockDb.getUnreadCount(userId);
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

  async searchPosts(query: string, userId?: string, limit?: number) {
    return mockDb.searchPosts(query, userId, limit);
  },

  async getPostsByHashtag(tag: string, userId?: string, limit?: number) {
    return mockDb.getPostsByHashtag(tag, userId, limit);
  },

  async getOrCreateAnonymousUser(sessionId: string, ipAddress: string) {
    return mockDb.getOrCreateAnonymousUser(sessionId, ipAddress);
  },

  async updateUserDisplayName(userId: string, displayName: string, avatarUrl?: string, bio?: string) {
    return mockDb.updateUserDisplayName(userId, displayName, avatarUrl, bio);
  },

  async getUserAvatarUrl(slug: string) {
    return mockDb.getUserAvatarUrl(slug);
  },

  async getUserBio(slug: string) {
    return mockDb.getUserBio(slug);
  },

  async listOshiItems(userSlug: string) {
    return mockDb.listOshiItems(userSlug);
  },

  async addOshiItem(userSlug: string, data) {
    return mockDb.addOshiItem(userSlug, data);
  },

  async removeOshiItem(userSlug: string, id: number) {
    return mockDb.removeOshiItem(userSlug, id);
  },

  async getUserSettings(slug: string) {
    return mockDb.getUserSettings(slug);
  },

  async updateUserSettings(slug: string, settings: Partial<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>) {
    return mockDb.updateUserSettings(slug, settings);
  },

  async issueMigrationToken(userId: string) {
    return mockDb.issueMigrationToken(userId);
  },

  async redeemMigrationToken(token: string, newSessionId: string) {
    return mockDb.redeemMigrationToken(token, newSessionId);
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

  async blockUser(blockerSlug: string, blockedSlug: string) {
    return mockDb.blockUser(blockerSlug, blockedSlug);
  },

  async unblockUser(blockerSlug: string, blockedSlug: string) {
    return mockDb.unblockUser(blockerSlug, blockedSlug);
  },

  async getBlockedSlugs(blockerSlug: string) {
    return mockDb.getBlockedSlugs(blockerSlug);
  },

  async muteUser(muterSlug: string, mutedSlug: string) {
    return mockDb.muteUser(muterSlug, mutedSlug);
  },

  async unmuteUser(muterSlug: string, mutedSlug: string) {
    return mockDb.unmuteUser(muterSlug, mutedSlug);
  },

  async getMutedSlugs(muterSlug: string) {
    return mockDb.getMutedSlugs(muterSlug);
  },

  async reportContent(data: ReportParams) {
    return mockDb.reportContent(data);
  },

  async createGame(data: CreateGameParams): Promise<DbGameRecord> {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const record: DbGameRecord = { id, preset: data.preset, title: data.title, manifest: data.manifest, createdAt: new Date().toISOString(), creatorSlug: data.creatorSlug };
    gameStore.set(id, record);
    return record;
  },

  async getGame(id: number): Promise<DbGameRecord | null> {
    return gameStore.get(id) ?? null;
  },

  async getGamesByIds(ids: number[]): Promise<DbGameRecord[]> {
    if (!ids || ids.length === 0) return [];
    const set = new Set(ids);
    return Array.from(gameStore.values()).filter(g => set.has(g.id));
  },

  async updateGame(id: number, data: { title: string; manifest: CreateGameParams['manifest'] }): Promise<DbGameRecord | null> {
    const existing = gameStore.get(id);
    if (!existing) return null;
    const updated: DbGameRecord = { ...existing, title: data.title, manifest: data.manifest };
    gameStore.set(id, updated);
    return updated;
  },

  async listAllGames(limit?: number) {
    const list = Array.from(gameStore.values());
    return limit && limit > 0 ? list.slice(0, limit) : list;
  },

  async recordGamePlay(gameId: number, data: RecordGamePlayParams): Promise<DbGameRecord | null> {
    const existing = gameStore.get(gameId);
    if (!existing) return null;
    const score = Number(data.score) || 0;
    const updated: DbGameRecord = {
      ...existing,
      plays: (existing.plays ?? 0) + (data.countPlay === false ? 0 : 1),
      clears: (existing.clears ?? 0) + (data.cleared ? 1 : 0),
    };
    if (score > (existing.bestScore ?? 0)) {
      updated.bestScore = score;
      updated.bestScoreBy = data.displayName || '名無し';
    }
    gameStore.set(gameId, updated);
    return updated;
  },

  async listTopGames(limit?: number) {
    const safeLimit = Math.max(1, Math.min(limit || 30, 50));
    return Array.from(gameStore.values())
      .sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0) || b.id - a.id)
      .slice(0, safeLimit);
  },

  async getPostIdByGameId(_gameId: number) {
    return null;
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
