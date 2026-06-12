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
  threadId: number;
  parentPostId?: number;
  replies: Post[];
}

export type Reply = Post;

export interface Obstacle {
  x: number;
  y: number;
  size: number;
  passed?: boolean;
}
