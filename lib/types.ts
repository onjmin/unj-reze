import type { GameManifestDraft } from '@/components/GameMaker';

/** 投稿本文をこの行数を超えたら折りたたむ（タイムライン・投稿個別ページ共通） */
export const POST_BODY_COLLAPSE_LINES = 8;

/** 自己申告の権利表記。未設定(undefined)は「申告なし」 */
export type OriginType =
  | 'own_modify_ok'
  | 'own_modify_ng'
  | 'own_no_unauthorized_use'
  | 'others_modify_ok'
  | 'others_modify_ng'
  | 'others_no_unauthorized_use';

export const ORIGIN_TYPE_OPTIONS: { value: OriginType; label: string; badgeClass: string }[] = [
  { value: 'own_modify_ok', label: '自作 & 改変OK', badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
  { value: 'own_modify_ng', label: '自作 & 改変NG', badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  { value: 'own_no_unauthorized_use', label: '自作 & 無断使用禁止', badgeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  { value: 'others_modify_ok', label: '自作以外 & 改変OK', badgeClass: 'bg-sky-500/20 text-sky-400 border-sky-500/40' },
  { value: 'others_modify_ng', label: '自作以外 & 改変NG', badgeClass: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  { value: 'others_no_unauthorized_use', label: '自作以外 & 無断使用禁止', badgeClass: 'bg-pink-500/20 text-pink-400 border-pink-500/40' },
];

export interface Post {
  id: string;
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
  gameId?: string;
  gameTitle?: string;
  gameThumbnail?: string;
  /** 自己申告の権利表記。未設定(申告なし)なら undefined */
  originType?: OriginType;
  /** 権利自己申告が虚偽だったと運営が手動で付与するフラグ。ユーザーからは設定不可 */
  isFalseDeclaration?: boolean;
  isEdited?: boolean;
  threadId: string;
  parentPostId?: string;
  replies: Post[];
}

export type Reply = Post;

export interface GameRecord {
  id: string;
  preset: string;
  title: string;
  manifest: GameManifestDraft;
  createdAt: string;
}

export interface AnonymousUser {
  id: string;
  displayName: string;
  slug: string;
  avatarColor: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface GhostPlayer {
  sessionId: string;
  x: number;
  y: number;
  emoji: string;
  color?: string;
  updatedAt?: string;
}

export interface GameVoteCandidate {
  game: { id: number; preset: string; title: string; createdAt: string };
  votes: number;
}

export interface LiveGameInfo {
  gameId: number | null;
  gameTitle: string;
  gamePreset: string;
  hourSlot: string;
  nextCandidates: GameVoteCandidate[];
  myVote: number | null;
}

/** sessionId（または任意の文字列）から一意な HSL 色を返す。陣取りのプレイヤー識別色に使用。 */
export function colorFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 70%, 55%)`;
}

export interface Obstacle {
  x: number;
  y: number;
  size: number;
  passed?: boolean;
}

export interface Notification {
  id: string;
  user: string;
  action: string;
  target: string;
  type: string;
  postId?: string;
  targetUser?: string;
  recipientId?: string;
  read?: boolean;
  createdAt: string;
  time: string;
}
