import { Post, Reply } from './types';
import type { Notification, Message, Trend } from './mock-db';

const BASE = '/api';

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

export const api = {
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
