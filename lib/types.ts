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
  /** true=自作 false=他作 undefined=未設定 */
  isOriginal?: boolean;
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
