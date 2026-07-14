import { AnonymousUser, GhostPlayer, GameVoteCandidate, OriginType } from '../types';
import { DbPost, DbGameRecord, DbNotification } from '../types-db';
import type { Trend, Message } from '../mock-db';
import type { GameManifestDraft } from '@/components/GameMaker';

export interface CreateGameParams {
  preset: string;
  title: string;
  manifest: GameManifestDraft;
}

export interface CreatePostParams {
  displayName: string;
  content: string;
  hasImage?: boolean;
  imageSrc?: string;
  imageAlt?: string;
  avatarColor?: string;
  slug?: string;
  gameId?: number;
  /** 自己申告の権利表記。未設定なら undefined */
  originType?: OriginType;
}

export interface ReplyParams {
  displayName: string;
  content: string;
  parentPostId?: number;
  hasImage?: boolean;
  imageSrc?: string;
  imageAlt?: string;
  avatarColor?: string;
  gameId?: number;
  originType?: OriginType;
}

export interface MessageParams {
  sender: string;
  text: string;
  recipient?: string;
}

export interface ReportParams {
  reporterSlug: string;
  targetType: string; // 'post' | 'reply' | 'user' | 'message'
  targetId: string;
  reason: string;
}

export interface DataStore {
  getPosts(userId?: string): Promise<DbPost[]>;
  getPost(id: number, userId?: string): Promise<DbPost | null>;
  createPost(data: CreatePostParams): Promise<DbPost>;
  likePost(id: number, userId: string): Promise<DbPost | null>;
  dislikePost(id: number, userId: string): Promise<DbPost | null>;
  heartPost(id: number, userId: string, count?: number): Promise<DbPost | null>;
  repostPost(id: number): Promise<DbPost | null>;
  getReplies(postId: number, userId?: string): Promise<DbPost[]>;
  addReply(postId: number, data: ReplyParams): Promise<DbPost | null>;
  editPost(id: number, userId: string, content: string, originType?: OriginType | null): Promise<DbPost | null>;
  deletePost(id: number, userId: string): Promise<boolean>;
  deleteMessage(id: number, userId: string): Promise<boolean>;
  getUserPostsBySlug(slug: string, userId?: string): Promise<DbPost[]>;
  getUserDisplayName(slug: string): Promise<string | undefined>;
  getLikedPosts(userId: string): Promise<DbPost[]>;
  getDislikedPosts(userId: string): Promise<DbPost[]>;
  getHeartedPosts(userId: string): Promise<DbPost[]>;
  getNotifications(userId?: string): Promise<DbNotification[]>;
  markNotificationRead(id: number, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  deleteNotification(id: number, userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
  getMessages(userId?: string): Promise<Message[]>;
  addMessage(data: MessageParams): Promise<Message>;
  getTrends(): Promise<Trend[]>;
  searchPosts(query: string, userId?: string): Promise<DbPost[]>;
  getPostsByHashtag(tag: string, userId?: string): Promise<DbPost[]>;
  getOrCreateAnonymousUser(sessionId: string, ipAddress: string): Promise<AnonymousUser>;
  updateUserDisplayName(userId: string, displayName: string, avatarUrl?: string): Promise<void>;
  getUserAvatarUrl(slug: string): Promise<string | undefined>;
  getUserSettings(slug: string): Promise<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>;
  updateUserSettings(slug: string, settings: Partial<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>): Promise<void>;
  issueMigrationToken(userId: string): Promise<string>;
  redeemMigrationToken(token: string, newSessionId: string): Promise<AnonymousUser | null>;
  followUser(followerId: string, followedId: string): Promise<void>;
  unfollowUser(followerId: string, followedId: string): Promise<void>;
  isFollowing(followerId: string, followedId: string): Promise<boolean>;
  getFollowCounts(userId: string): Promise<{ followers: number; following: number }>;
  // ブロック / ミュート / 通報（slug 単位で識別）
  blockUser(blockerSlug: string, blockedSlug: string): Promise<void>;
  unblockUser(blockerSlug: string, blockedSlug: string): Promise<void>;
  getBlockedSlugs(blockerSlug: string): Promise<string[]>;
  muteUser(muterSlug: string, mutedSlug: string): Promise<void>;
  unmuteUser(muterSlug: string, mutedSlug: string): Promise<void>;
  getMutedSlugs(muterSlug: string): Promise<string[]>;
  reportContent(data: ReportParams): Promise<void>;
  createGame(data: CreateGameParams): Promise<DbGameRecord>;
  getGame(id: number): Promise<DbGameRecord | null>;
  listAllGames(): Promise<DbGameRecord[]>;
  getLiveGameInfo(ipAddress: string): Promise<{ gameId: number | null; gameTitle: string; gamePreset: string; hourSlot: string; postId: number | null; nextCandidates: GameVoteCandidate[]; myVote: number | null }>;
  voteGame(gameId: number, ipAddress: string): Promise<void>;
  updatePlayerPosition(sessionId: string, gameId: number, x: number, y: number, emoji: string): Promise<void>;
  getGamePlayers(gameId: number, excludeSession: string): Promise<GhostPlayer[]>;
}
