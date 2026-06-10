export interface Reply {
  id: number;
  name: string;
  content: string;
  time: string;
}

export interface Post {
  id: number;
  name: string;
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
  replyTo?: number;
  replies: Reply[];
}

export interface Obstacle {
  x: number;
  y: number;
  size: number;
  passed?: boolean;
}
