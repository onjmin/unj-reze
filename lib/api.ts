import { Post, Reply } from './types';
import { db } from './mock-db';
import type { Notification, Message, Trend } from './mock-db';

const BASE = '/api';
const useStaticMockData = process.env.GITHUB_ACTIONS === 'true' || process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';

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
  posts: {
    list: async () => db.getPosts(),
    get: async (id: number) => {
      const post = db.getPost(id);
      if (!post) throw new Error('Post not found');
      return post;
    },
    create: async (data: { name: string; content: string; hasImage?: boolean; imageSrc?: string; imageAlt?: string; avatarColor?: string }) =>
      db.createPost(data),
    like: async (id: number) => {
      const post = db.likePost(id);
      if (!post) throw new Error('Post not found');
      return post;
    },
    dislike: async (id: number) => {
      const post = db.dislikePost(id);
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
      create: async (postId: number, data: { name: string; content: string }) => {
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
    profile: async (id: string) => ({
      id,
      posts: db.getPosts().filter(post => post.name === id),
      postCount: db.getPosts().filter(post => post.name === id).length,
    }),
  },
};

const liveApi = {
  posts: {
    list: () => fetcher<Post[]>('/posts'),
    get: (id: number) => fetcher<Post>(`/posts/${id}`),
    create: (data: { name: string; content: string; hasImage?: boolean; imageSrc?: string; imageAlt?: string; avatarColor?: string }) =>
      fetcher<Post>('/posts', { method: 'POST', body: JSON.stringify(data) }),
    like: (id: number) => fetcher<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify({ action: 'like' }) }),
    dislike: (id: number) => fetcher<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify({ action: 'dislike' }) }),
    repost: (id: number) => fetcher<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify({ action: 'repost' }) }),
    replies: {
      list: (postId: number) => fetcher<Reply[]>(`/posts/${postId}/replies`),
      create: (postId: number, data: { name: string; content: string }) =>
        fetcher<Reply>(`/posts/${postId}/replies`, { method: 'POST', body: JSON.stringify(data) }),
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
    profile: (id: string) => fetcher<{ id: string; posts: Post[]; postCount: number }>(`/users/${encodeURIComponent(id)}`),
  },
};

export const api = useStaticMockData ? staticApi : liveApi;
