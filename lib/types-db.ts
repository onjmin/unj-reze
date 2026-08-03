import type { GameManifestDraft } from '@/components/GameMaker';
import type { MvManifest, MvPresetKind } from './mv-config';
import type { OriginType, OshiItemKind } from './types';

/**
 * ゲーム/MVエディタの素材ピッカー（画像/MML検索）専用の軽量な行。
 * スレッド構造・投票数・ハート数などは持たない（docs/NEON_EGRESS.md）。
 */
export interface DbMediaSearchPost {
  id: number;
  displayName: string;
  content: string;
  imageSrc?: string;
  imageAlt?: string;
}

export interface DbPost {
  id: number;
  displayName: string;
  slug?: string;
  createdAt: string;
  time: string;
  content: string;
  likes: number;
  dislikes: number;
  liked: boolean;
  disliked: boolean;
  repliesCount: number;
  reposts: number;
  reposted: boolean;
  hasImage?: boolean;
  imageSrc?: string;
  imageAlt?: string;
  avatarColor: string;
  avatarUrl?: string;
  hasCollabButton?: boolean;
  heartsTotal: number;
  hasGame?: boolean;
  gameId?: number;
  gameTitle?: string;
  gameThumbnail?: string;
  /** ゲームの累計プレイ数（フィードのサムネに出す） */
  gamePlays?: number;
  /** ゲームの累計クリア数 */
  gameClears?: number;
  hasMv?: boolean;
  mvId?: number;
  mvTitle?: string;
  mvThumbnail?: string;
  mvPreset?: MvPresetKind;
  /** MVの累計再生数 */
  mvPlays?: number;
  hasMml?: boolean;
  originType?: OriginType;
  isFalseDeclaration?: boolean;
  isEdited?: boolean;
  threadId: number;
  parentPostId?: number;
  replies: DbPost[];
}

export interface DbGameRecord {
  id: number;
  preset: string;
  title: string;
  manifest: GameManifestDraft;
  createdAt: string;
  creatorSlug?: string;
  /** 累計プレイ回数 */
  plays?: number;
  /** 累計クリア回数 */
  clears?: number;
  /** 記録されたハイスコア */
  bestScore?: number;
  /** ハイスコア保持者の表示名 */
  bestScoreBy?: string;
  /** ひもづく投稿ID（ランキングからコメントへ飛ぶ用） */
  postId?: number;
}

export interface DbMvRecord {
  id: number;
  preset: MvPresetKind;
  title: string;
  manifest: MvManifest;
  createdAt: string;
  creatorSlug?: string;
  /** 累計再生回数 */
  plays?: number;
}

export interface DbOshiItem {
  id: number;
  userSlug: string;
  kind: OshiItemKind;
  trackId?: number;
  collectionId?: number;
  artistId?: number;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  viewUrl?: string;
  previewUrl?: string;
  position: number;
  createdAt: string;
}

export interface DbNotification {
  id: number;
  actorSlug?: string;
  targetSlug?: string;
  user: string;
  action: string;
  target: string;
  type: string;
  postId?: number;
  targetUser?: string;
  recipientId?: string;
  read?: boolean;
  createdAt: string;
  time: string;
}
