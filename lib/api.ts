import { Post, AnonymousUser } from './types';
import { db as mockDbInstance } from './mock-db';
import type { Notification, Message, Trend } from './mock-db';

const BASE = '/api';
const useStaticMockData = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true' || process.env.GITHUB_ACTIONS === 'true';

async function fetcher<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const staticApi = {
  auth: {
    anonymous: async (sessionId: string, _ipAddress?: string) => {
      return mockDbInstance.getOrCreateAnonymousUser(sessionId, _ipAddress || '127.0.0.1');
    },
    updateDisplayName: async (userId: string, displayName: string) => {
      mockDbInstance.updateUserDisplayName(userId, displayName);
    },
  },
  upload: {
    image: async (data: { image: string; filename?: string }) => ({ url: data.image }),
  },
  posts: {
    list: async (userId?: string) => mockDbInstance.getPosts(userId),
    get: async (id: number, userId?: string) => {
      const post = mockDbInstance.getPost(id, userId);
      if (!post) throw new Error('Post not found');
      return post;
    },
    create: async (data: { displayName: string; content: string; hasImage?: boolean; imageSrc?: string; imageAlt?: string; avatarColor?: string; gameId?: number }) =>
      mockDbInstance.createPost(data),
    like: async (id: number, userId?: string) => {
      const post = mockDbInstance.likePost(id, userId || '');
      if (!post) throw new Error('Post not found');
      return post;
    },
    dislike: async (id: number, userId?: string) => {
      const post = mockDbInstance.dislikePost(id, userId || '');
      if (!post) throw new Error('Post not found');
      return post;
    },
    heart: async (id: number, userId?: string, count?: number) => {
      const post = mockDbInstance.heartPost(id, userId || '', count);
      if (!post) throw new Error('Post not found');
      return post;
    },
    repost: async (id: number) => {
      const post = mockDbInstance.repostPost(id);
      if (!post) throw new Error('Post not found');
      return post;
    },
    replies: {
      list: async (postId: number) => mockDbInstance.getReplies(postId),
      create: async (postId: number, data: { displayName: string; content: string; parentPostId?: number }) => {
        const reply = mockDbInstance.addReply(postId, data);
        if (!reply) throw new Error('Post not found');
        return reply;
      },
    },
  },
  notifications: {
    list: async (userId?: string) => mockDbInstance.getNotifications(userId),
  },
  messages: {
    list: async (userId?: string) => mockDbInstance.getMessages(userId),
    send: async (data: { sender: string; text: string; recipient?: string }) => mockDbInstance.addMessage(data),
  },
  search: {
    trends: async () => mockDbInstance.getTrends(),
    posts: async (query: string) => {
      if (!query.trim()) return [];
      return mockDbInstance.searchPosts(query);
    },
  },
  users: {
    profile: async (id: string, userId?: string, tab?: string) => {
      let posts: Post[];
      if (tab === 'likes' && userId) {
        posts = mockDbInstance.getLikedPosts(userId);
      } else if (tab === 'dislikes' && userId) {
        posts = mockDbInstance.getDislikedPosts(userId);
      } else if (tab === 'hearts' && userId) {
        posts = mockDbInstance.getHeartedPosts(userId);
      } else {
        posts = mockDbInstance.getUserPostsBySlug(id, userId);
      }
      const displayName = mockDbInstance.getUserDisplayName(id) || id;
      return { id, displayName, posts, postCount: posts.length };
    },
  },
  follow: {
    getCounts: async (userId: string) => mockDbInstance.getFollowCounts(userId),
    isFollowing: async (followerId: string, followedId: string) => ({ isFollowing: mockDbInstance.isFollowing(followerId, followedId) }),
    follow: async (followerId: string, followedId: string) => { mockDbInstance.followUser(followerId, followedId); return { success: true }; },
    unfollow: async (followerId: string, followedId: string) => { mockDbInstance.unfollowUser(followerId, followedId); return { success: true }; },
  },
};

const liveApi = {
  auth: {
    anonymous: (sessionId: string) => {
      const qs = `?sessionId=${encodeURIComponent(sessionId)}`;
      return fetcher<AnonymousUser>(`/auth/anonymous${qs}`);
    },
    updateDisplayName: (userId: string, displayName: string) =>
      fetcher<{ success: boolean }>('/auth/anonymous', { method: 'PUT', body: JSON.stringify({ userId, displayName }) }),
  },
  upload: {
    image: (data: { image: string; filename?: string }) =>
      fetcher<{ url: string }>('/upload', { method: 'POST', body: JSON.stringify(data) }),
  },
  posts: {
    list: (userId?: string) => {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return fetcher<Post[]>(`/posts${qs}`);
    },
    get: (id: number, userId?: string) => {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return fetcher<Post>(`/posts/${id}${qs}`);
    },
    create: (data: { displayName: string; content: string; hasImage?: boolean; imageSrc?: string; imageAlt?: string; avatarColor?: string; gameId?: number }) =>
      fetcher<Post>('/posts', { method: 'POST', body: JSON.stringify(data) }),
    like: (id: number, userId?: string) => fetcher<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify({ action: 'like', userId }) }),
    dislike: (id: number, userId?: string) => fetcher<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify({ action: 'dislike', userId }) }),
    heart: (id: number, userId?: string, count?: number) => fetcher<Post>(`/posts/${id}`, { method: 'POST', body: JSON.stringify({ userId, count }) }),
    repost: (id: number) => fetcher<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify({ action: 'repost' }) }),
    replies: {
      list: (postId: number) => fetcher<Post[]>(`/posts/${postId}/replies`),
      create: (postId: number, data: { displayName: string; content: string; parentPostId?: number }) =>
        fetcher<Post>(`/posts/${postId}/replies`, { method: 'POST', body: JSON.stringify(data) }),
    },
  },
  notifications: {
    list: (userId?: string) => {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return fetcher<Notification[]>(`/notifications${qs}`);
    },
  },
  messages: {
    list: (userId?: string) => {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return fetcher<Message[]>(`/messages${qs}`);
    },
    send: (data: { sender: string; text: string; recipient?: string }) =>
      fetcher<Message>('/messages', { method: 'POST', body: JSON.stringify(data) }),
  },
  search: {
    trends: () => fetcher<Trend[]>('/search/trends'),
    posts: (query: string) => fetcher<Post[]>(`/search?q=${encodeURIComponent(query)}`),
  },
  users: {
    profile: (id: string, userId?: string, tab?: string) => {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      if (tab) params.set('tab', tab);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return fetcher<{ id: string; displayName: string; posts: Post[]; postCount: number }>(`/users/${encodeURIComponent(id)}${qs}`);
    },
  },
  follow: {
    getCounts: (userId: string) => fetcher<{ followers: number; following: number }>(`/follow?userId=${encodeURIComponent(userId)}`),
    isFollowing: (followerId: string, followedId: string) => fetcher<{ isFollowing: boolean }>(`/follow?followerId=${encodeURIComponent(followerId)}&followedId=${encodeURIComponent(followedId)}`),
    follow: (followerId: string, followedId: string) => fetcher<{ success: boolean }>('/follow', { method: 'POST', body: JSON.stringify({ followerId, followedId }) }),
    unfollow: (followerId: string, followedId: string) => fetcher<{ success: boolean }>('/follow', { method: 'DELETE', body: JSON.stringify({ followerId, followedId }) }),
  },
};

export const api = useStaticMockData ? staticApi : liveApi;
