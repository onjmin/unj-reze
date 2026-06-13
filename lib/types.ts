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

export interface Obstacle {
  x: number;
  y: number;
  size: number;
  passed?: boolean;
}
