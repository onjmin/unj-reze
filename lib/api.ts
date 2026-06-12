import { Post } from './types';
import { db } from './mock-db';
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
  upload: {
    image: async (data: { image: string; filename?: string }) => ({ url: data.image }),
  },
  posts: {
    list: async (userId?: string) => db.getPosts(userId),
    get: async (id: number, userId?: string) => {
      const post = db.getPost(id, userId);
      if (!post) throw new Error('Post not found');
      return post;
    },
    create: async (data: { displayName: string; content: string; hasImage?: boolean; imageSrc?: string; imageAlt?: string; avatarColor?: string }) =>
      db.createPost(data),
    like: async (id: number, userId?: string) => {
      const post = db.likePost(id, userId || '');
      if (!post) throw new Error('Post not found');
      return post;
    },
    dislike: async (id: number, userId?: string) => {
      const post = db.dislikePost(id, userId || '');
      if (!post) throw new Error('Post not found');
      return post;
    },
    heart: async (id: number, userId?: string, count?: number) => {
      const post = db.heartPost(id, userId || '', count);
      if (!post) throw new Error('Post not found');
      return post;
    },
    repost: async (id: number) => {
      const post = db.repostPost(id);
      if (!post) throw new Error('Post not found');
      return post;
    },
    replies: {
      list: async (postId: number) => db.getReplies(postId),
      create: async (postId: number, data: { displayName: string; content: string; parentPostId?: number }) => {
        const reply = db.addReply(postId, data);
        if (!reply) throw new Error('Post not found');
        return reply;
      },
    },
  },
  notifications: {
    list: async () => db.getNotifications(),
  },
  messages: {
    list: async () => db.getMessages(),
    send: async (data: { sender: string; text: string }) => db.addMessage(data),
  },
  search: {
    trends: async () => db.getTrends(),
  },
  users: {
    profile: async (id: string, userId?: string) => {
      const posts = db.getUserPostsBySlug(id, userId);
      const displayName = db.getUserDisplayName(id) || id;
      return { id, displayName, posts, postCount: posts.length };
    },
  },
};

const liveApi = {
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
    create: (data: { displayName: string; content: string; hasImage?: boolean; imageSrc?: string; imageAlt?: string; avatarColor?: string }) =>
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
    list: () => fetcher<Notification[]>('/notifications'),
  },
  messages: {
    list: () => fetcher<Message[]>('/messages'),
    send: (data: { sender: string; text: string }) =>
      fetcher<Message>('/messages', { method: 'POST', body: JSON.stringify(data) }),
  },
  search: {
    trends: () => fetcher<Trend[]>('/search/trends'),
  },
  users: {
    profile: (id: string, userId?: string) => {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return fetcher<{ id: string; displayName: string; posts: Post[]; postCount: number }>(`/users/${encodeURIComponent(id)}${qs}`);
    },
  },
};

export const api = useStaticMockData ? staticApi : liveApi;
