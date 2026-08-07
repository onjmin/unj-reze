import { AnonymousUser, FollowUser, GameVoteCandidate, OriginType, OshiItemKind } from '../types';
import { DbPost, DbGameRecord, DbMvRecord, DbNotification, DbOshiItem, DbMediaSearchPost } from '../types-db';
import type { Trend, Message } from '../mock-db';
import type { GameManifestDraft } from '@/components/GameMaker';
import type { MvManifest, MvPresetKind } from '../mv-config';

/**
 * manifest 本体はブラウザが uploader-worker へ直接上げ、DBにはURLだけが渡る。
 * サーバーは manifest を一度も受け取らない（docs/NEON_EGRESS.md）。
 * bgRef / bgUrl はサムネイル用の非正規化値で、manifest を引かずに一覧を出すために持つ。
 */
export interface ManifestRef {
  manifestUrl: string;
  manifestDeleteId?: string;
  manifestDeleteHash?: string;
}

export interface CreateGameParams extends ManifestRef {
  preset: string;
  title: string;
  bgRef?: string;
  creatorSlug?: string;
}

export interface CreateMvParams extends ManifestRef {
  preset: MvPresetKind;
  title: string;
  bgUrl?: string;
  creatorSlug?: string;
}

export interface UpdateGameParams extends ManifestRef {
  title: string;
  bgRef?: string;
}

export interface UpdateMvParams extends ManifestRef {
  title: string;
  bgUrl?: string;
}

export interface RecordGamePlayParams {
  /** クリアまで到達したか（false ならゲームオーバー/中断） */
  cleared: boolean;
  /** そのプレイのスコア。ハイスコア更新の判定に使う。 */
  score?: number;
  /** ハイスコアを更新したときに残す表示名 */
  displayName?: string;
  /** プレイ回数を加算するか（同一プレイ中の再挑戦では false にする） */
  countPlay?: boolean;
}

export interface AddOshiItemParams {
  kind: OshiItemKind;
  trackId?: number;
  collectionId?: number;
  artistId?: number;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  viewUrl?: string;
  previewUrl?: string;
}

/**
 * MML本文の保存先。ブラウザが uploader-worker へ直接上げ、DBにはURLだけが渡る。
 * content 側にはマーカー（`#mml`）だけが残り、本文は入らない。
 */
export interface MmlRef {
  mmlUrl?: string;
  mmlDeleteId?: string;
  mmlDeleteHash?: string;
}

export interface CreatePostParams extends MmlRef {
  displayName: string;
  content: string;
  hasImage?: boolean;
  imageSrc?: string;
  imageAlt?: string;
  avatarColor?: string;
  slug?: string;
  gameId?: number;
  mvId?: number;
  /** 自己申告の権利表記。未設定なら undefined */
  originType?: OriginType;
}

export interface ReplyParams extends MmlRef {
  displayName: string;
  /** セッションから解決済みのスラッグ。省略時は displayName から導出する。 */
  slug?: string;
  content: string;
  parentPostId?: number;
  hasImage?: boolean;
  imageSrc?: string;
  imageAlt?: string;
  avatarColor?: string;
  gameId?: number;
  mvId?: number;
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

export interface GetPostsOptions {
  limit?: number;
  beforeId?: number;
  hasMml?: boolean;
  hasImage?: boolean;
  hasGame?: boolean;
  hasMv?: boolean;
}

export interface DataStore {
  /** `beforeId` はキーセットページング用のカーソル（そのIDより古いスレッドを返す）。 */
  getPosts(userId?: string, limitOrOptions?: number | GetPostsOptions, beforeId?: number, options?: GetPostsOptions): Promise<DbPost[]>;
  getPost(id: number, userId?: string): Promise<DbPost | null>;
  createPost(data: CreatePostParams): Promise<DbPost>;
  likePost(id: number, userId: string): Promise<DbPost | null>;
  dislikePost(id: number, userId: string): Promise<DbPost | null>;
  heartPost(id: number, userId: string, count?: number): Promise<DbPost | null>;
  repostPost(id: number): Promise<DbPost | null>;
  getReplies(postId: number, userId?: string): Promise<DbPost[]>;
  addReply(postId: number, data: ReplyParams): Promise<DbPost | null>;
  editPost(id: number, userId: string, content: string, originType?: OriginType | null, imageSrc?: string, mml?: MmlRef): Promise<DbPost | null>;
  deletePost(id: number, userId: string): Promise<boolean>;
  deleteMessage(id: number, userId: string): Promise<boolean>;
  getUserPostsBySlug(slug: string, userId?: string, limit?: number): Promise<DbPost[]>;
  getUserDisplayName(slug: string): Promise<string | undefined>;
  getLikedPosts(userId: string, limit?: number): Promise<DbPost[]>;
  getDislikedPosts(userId: string, limit?: number): Promise<DbPost[]>;
  getHeartedPosts(userId: string, limit?: number): Promise<DbPost[]>;
  getNotifications(userId?: string): Promise<DbNotification[]>;
  markNotificationRead(id: number, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  deleteNotification(id: number, userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
  getMessages(userId?: string): Promise<Message[]>;
  /** userId と partnerId の1対1スレッドだけを新しい順に返す。 */
  getConversation(userId: string, partnerId: string, limit?: number): Promise<Message[]>;
  /** 初回DM制限の判定材料。sent=自分が送った通数 / received=相手から届いた通数。 */
  getDmGate(userId: string, partnerId: string): Promise<{ sent: number; received: number }>;
  addMessage(data: MessageParams): Promise<Message>;
  getTrends(): Promise<Trend[]>;
  searchPosts(query: string, userId?: string, limit?: number): Promise<DbPost[]>;
  /**
   * ゲーム/MVエディタの素材ピッカー専用の軽量検索。`kind` で `has_image` / `has_mml` を絞り込み、
   * スレッド構造・投票数・返信は一切引かない（docs/NEON_EGRESS.md）。
   */
  searchMedia(kind: 'image' | 'mml', query: string, userId?: string, limit?: number, offset?: number): Promise<DbMediaSearchPost[]>;
  getPostsByHashtag(tag: string, userId?: string, limit?: number): Promise<DbPost[]>;
  getOrCreateAnonymousUser(sessionId: string, ipAddress: string): Promise<AnonymousUser>;
  /**
   * セッションIDから本人を引く。**作成はしない**（未知のセッションは null）。
   * 書き込み系APIの本人確認に使うので、ここで作ってしまうと「名乗れば通る」に戻る。
   */
  getAnonymousUserBySession(sessionId: string): Promise<AnonymousUser | null>;
  /**
   * プロフィールを更新する。`displayName` を省略すればアイコン/自己紹介だけを更新できる。
   * slug は所有者キーなので、このメソッドでは**絶対に**書き換えない。
   */
  updateUserDisplayName(userId: string, displayName?: string, avatarUrl?: string, bio?: string): Promise<void>;
  getUserAvatarUrl(slug: string): Promise<string | undefined>;
  getUserBio(slug: string): Promise<string | undefined>;
  listOshiItems(userSlug: string): Promise<DbOshiItem[]>;
  addOshiItem(userSlug: string, data: AddOshiItemParams): Promise<DbOshiItem>;
  removeOshiItem(userSlug: string, id: number): Promise<void>;
  getUserSettings(slug: string): Promise<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>;
  updateUserSettings(slug: string, settings: Partial<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>): Promise<void>;
  issueMigrationToken(userId: string): Promise<string>;
  redeemMigrationToken(token: string, newSessionId: string): Promise<AnonymousUser | null>;
  followUser(followerId: string, followedId: string): Promise<void>;
  unfollowUser(followerId: string, followedId: string): Promise<void>;
  isFollowing(followerId: string, followedId: string): Promise<boolean>;
  getFollowCounts(userId: string): Promise<{ followers: number; following: number }>;
  /** userId をフォローしているユーザー一覧。viewerId を渡すと isFollowing / isSelf が埋まる。 */
  getFollowers(userId: string, viewerId?: string, limit?: number): Promise<FollowUser[]>;
  /** userId がフォローしているユーザー一覧。 */
  getFollowing(userId: string, viewerId?: string, limit?: number): Promise<FollowUser[]>;
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
  getGamesByIds(ids: number[]): Promise<DbGameRecord[]>;
  updateGame(id: number, data: UpdateGameParams): Promise<DbGameRecord | null>;
  listAllGames(limit?: number): Promise<DbGameRecord[]>;
  createMv(data: CreateMvParams): Promise<DbMvRecord>;
  getMv(id: number): Promise<DbMvRecord | null>;
  /**
   * 投稿一覧に埋めるMV情報をまとめて引く。
   * manifest 本体はもうDBに無いので、返るのは manifestUrl と bgUrl だけ。
   */
  getMvsByIds(ids: number[]): Promise<DbMvRecord[]>;
  updateMv(id: number, data: UpdateMvParams): Promise<DbMvRecord | null>;
  /** MVの再生数を1加算する。 */
  recordMvPlay(id: number): Promise<void>;
  /** プレイ結果を記録する。plays/clears を加算し、スコアが上回っていればハイスコアを更新する。 */
  recordGamePlay(gameId: number, data: RecordGamePlayParams): Promise<DbGameRecord | null>;
  /** プレイ数の多い順のゲームランキング。postId を含む。 */
  listTopGames(limit?: number): Promise<DbGameRecord[]>;
  /** ゲームにひもづく最初の投稿ID（コメント欄への導線に使う） */
  getPostIdByGameId(gameId: number): Promise<number | null>;
  getLiveGameInfo(ipAddress: string): Promise<{ gameId: number | null; gameTitle: string; gamePreset: string; hourSlot: string; postId: number | null; nextCandidates: GameVoteCandidate[]; myVote: number | null }>;
  voteGame(gameId: number, ipAddress: string): Promise<void>;
  // ゴーストプレイヤーの位置同期はDBに一切持たない。ハブ（Koyeb）のメモリ上のみで
  // 完結する仕組みに一本化した（components/LiveGameView.tsx）。ハブ未設定時は
  // プレゼンス機能自体を出さない。DB書き込みへのフォールバックは意図的に作らない。
}
