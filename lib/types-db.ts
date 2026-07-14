import type { GameManifestDraft } from '@/components/GameMaker';
import type { OriginType, OshiItemKind } from './types';

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
  position: number;
  createdAt: string;
}

export interface DbNotification {
  id: number;
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
