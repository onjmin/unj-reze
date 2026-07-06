import { Post, AnonymousUser, GhostPlayer, GameVoteCandidate, OriginType } from '../types';
import type { Notification, Message, Trend } from '../mock-db';
import type { GameManifestDraft } from '@/components/GameMaker';

export interface GameRecord {
  id: number;
  preset: string;
  title: string;
  manifest: GameManifestDraft;
  createdAt: string;
}

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
  getPosts(userId?: string): Promise<Post[]>;
  getPost(id: number, userId?: string): Promise<Post | null>;
  createPost(data: CreatePostParams): Promise<Post>;
  likePost(id: number, userId: string): Promise<Post | null>;
  dislikePost(id: number, userId: string): Promise<Post | null>;
  heartPost(id: number, userId: string, count?: number): Promise<Post | null>;
  repostPost(id: number): Promise<Post | null>;
  getReplies(postId: number, userId?: string): Promise<Post[]>;
  addReply(postId: number, data: ReplyParams): Promise<Post | null>;
  editPost(id: number, userId: string, content: string, originType?: OriginType | null): Promise<Post | null>;
  deletePost(id: number, userId: string): Promise<boolean>;
  deleteMessage(id: number, userId: string): Promise<boolean>;
  getUserPostsBySlug(slug: string, userId?: string): Promise<Post[]>;
  getUserDisplayName(slug: string): Promise<string | undefined>;
  getLikedPosts(userId: string): Promise<Post[]>;
  getDislikedPosts(userId: string): Promise<Post[]>;
  getHeartedPosts(userId: string): Promise<Post[]>;
  getNotifications(userId?: string): Promise<Notification[]>;
  markNotificationRead(id: number, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  deleteNotification(id: number, userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
  getMessages(userId?: string): Promise<Message[]>;
  addMessage(data: MessageParams): Promise<Message>;
  getTrends(): Promise<Trend[]>;
  searchPosts(query: string, userId?: string): Promise<Post[]>;
  getPostsByHashtag(tag: string, userId?: string): Promise<Post[]>;
  getOrCreateAnonymousUser(sessionId: string, ipAddress: string): Promise<AnonymousUser>;
  updateUserDisplayName(userId: string, displayName: string): Promise<void>;
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
  createGame(data: CreateGameParams): Promise<GameRecord>;
  getGame(id: number): Promise<GameRecord | null>;
  listAllGames(): Promise<GameRecord[]>;
  getLiveGameInfo(ipAddress: string): Promise<{ gameId: number | null; gameTitle: string; gamePreset: string; hourSlot: string; postId: number | null; nextCandidates: GameVoteCandidate[]; myVote: number | null }>;
  voteGame(gameId: number, ipAddress: string): Promise<void>;
  updatePlayerPosition(sessionId: string, gameId: number, x: number, y: number, emoji: string): Promise<void>;
  getGamePlayers(gameId: number, excludeSession: string): Promise<GhostPlayer[]>;
}
