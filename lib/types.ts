/** 自己申告の権利表記。未設定(undefined)は「申告なし」 */
export type OriginType =
  | 'full_original'
  | 'others_work'
  | 'derivative_of_others'
  | 'ai'
  | 'trace'
  | 'ear_copy'
  | 'cover';

export const ORIGIN_TYPE_OPTIONS: { value: OriginType; label: string; badgeClass: string }[] = [
  { value: 'full_original', label: '完全自作', badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
  { value: 'others_work', label: '他者著作物', badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  { value: 'derivative_of_others', label: '他者著作物の二次加工', badgeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  { value: 'ai', label: 'AI作品', badgeClass: 'bg-sky-500/20 text-sky-400 border-sky-500/40' },
  { value: 'trace', label: 'トレス', badgeClass: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  { value: 'ear_copy', label: '耳コピ', badgeClass: 'bg-pink-500/20 text-pink-400 border-pink-500/40' },
  { value: 'cover', label: 'カバー', badgeClass: 'bg-teal-500/20 text-teal-400 border-teal-500/40' },
];

export interface Post {
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
  hasCollabButton?: boolean;
  heartsTotal: number;
  hasGame?: boolean;
  gameId?: number;
  /** 自己申告の権利表記。未設定(申告なし)なら undefined */
  originType?: OriginType;
  /** 権利自己申告が虚偽だったと運営が手動で付与するフラグ。ユーザーからは設定不可 */
  isFalseDeclaration?: boolean;
  threadId: number;
  parentPostId?: number;
  replies: Post[];
}

export type Reply = Post;

export interface AnonymousUser {
  id: string;
  displayName: string;
  slug: string;
  avatarColor: string;
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
