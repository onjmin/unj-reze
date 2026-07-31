import { Post, AnonymousUser, OriginType, Notification, OshiItem, OshiItemKind } from './types';
import { db as mockDbInstance } from './mock-db';
import type { Message, Trend } from './mock-db';
import { decodeIdOrThrow, encodePost, encodeNotification, encodeId, encodeOshiItem } from './sqids';

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
    updateDisplayName: async (userId: string, displayName: string, avatarUrl?: string, bio?: string) => {
      mockDbInstance.updateUserDisplayName(userId, displayName, avatarUrl, bio);
    },
    getSettings: async (slug: string) => mockDbInstance.getUserSettings(slug),
    updateSettings: async (slug: string, settings: Partial<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>) => {
      mockDbInstance.updateUserSettings(slug, settings);
      return mockDbInstance.getUserSettings(slug);
    },
    issueMigrationToken: async (userId: string) => ({ token: mockDbInstance.issueMigrationToken(userId) }),
    redeemMigrationToken: async (token: string, sessionId: string) => {
      const user = mockDbInstance.redeemMigrationToken(token, sessionId);
      if (!user) throw new Error('invalid or expired token');
      return user;
    },
  },
  upload: {
    image: async (data: { image: string; filename?: string }) => ({ url: data.image }),
  },
  posts: {
    list: async (userId?: string, opts?: { beforeId?: string; limit?: number }) => {
      const beforeId = opts?.beforeId ? decodeIdOrThrow(opts.beforeId) : undefined;
      const posts = await mockDbInstance.getPosts(userId, opts?.limit, beforeId);
      return posts.map(encodePost);
    },
    get: async (id: string, userId?: string) => {
      const post = mockDbInstance.getPost(decodeIdOrThrow(id), userId);
      if (!post) throw new Error('Post not found');
      return encodePost(post);
    },
    create: async (data: { displayName: string; content: string; hasImage?: boolean; imageSrc?: string; imageAlt?: string; avatarColor?: string; gameId?: string; originType?: OriginType }) => {
      const decodedGameId = data.gameId ? decodeIdOrThrow(data.gameId) : undefined;
      const post = await mockDbInstance.createPost({ ...data, gameId: decodedGameId });
      return encodePost(post);
    },
    like: async (id: string, userId?: string) => {
      const post = mockDbInstance.likePost(decodeIdOrThrow(id), userId || '');
      if (!post) throw new Error('Post not found');
      return encodePost(post);
    },
    dislike: async (id: string, userId?: string) => {
      const post = mockDbInstance.dislikePost(decodeIdOrThrow(id), userId || '');
      if (!post) throw new Error('Post not found');
      return encodePost(post);
    },
    heart: async (id: string, userId?: string, count?: number) => {
      const post = mockDbInstance.heartPost(decodeIdOrThrow(id), userId || '', count);
      if (!post) throw new Error('Post not found');
      return encodePost(post);
    },
    repost: async (id: string) => {
      const post = mockDbInstance.repostPost(decodeIdOrThrow(id));
      if (!post) throw new Error('Post not found');
      return encodePost(post);
    },
    edit: async (id: string, userId: string, content: string, originType?: OriginType | null, imageSrc?: string) => {
      const post = mockDbInstance.editPost(decodeIdOrThrow(id), userId, content, originType, imageSrc);
      if (!post) throw new Error('Post not found or not owned');
      return encodePost(post);
    },
    remove: async (id: string, userId: string) => {
      const ok = mockDbInstance.deletePost(decodeIdOrThrow(id), userId);
      if (!ok) throw new Error('Post not found or not owned');
      return { success: true };
    },
    replies: {
      list: async (postId: string, userId?: string) => {
        const replies = await mockDbInstance.getReplies(decodeIdOrThrow(postId), userId);
        return replies.map(encodePost);
      },
      create: async (postId: string, data: {
        displayName: string;
        content: string;
        parentPostId?: string;
        hasImage?: boolean;
        imageSrc?: string;
        imageAlt?: string;
        avatarColor?: string;
        gameId?: string | number;
        originType?: OriginType;
      }) => {
        const decodedParentPostId = data.parentPostId ? decodeIdOrThrow(data.parentPostId) : undefined;
        const gameIdNum = data.gameId ? Number(data.gameId) : undefined;
        const reply = await mockDbInstance.addReply(decodeIdOrThrow(postId), {
          ...data,
          parentPostId: decodedParentPostId,
          gameId: gameIdNum
        });
        if (!reply) throw new Error('Post not found');
        return encodePost(reply);
      },
    },
  },
  notifications: {
    list: async (userId?: string) => {
      const notifications = await mockDbInstance.getNotifications(userId);
      return notifications.map(encodeNotification);
    },
    unreadCount: async (userId: string) => ({ count: mockDbInstance.getUnreadCount(userId) }),
    markRead: async (id: string, userId: string) => {
      mockDbInstance.markNotificationRead(decodeIdOrThrow(id), userId);
      return { success: true };
    },
    markAllRead: async (userId: string) => { mockDbInstance.markAllNotificationsRead(userId); return { success: true }; },
    remove: async (id: string, userId: string) => {
      mockDbInstance.deleteNotification(decodeIdOrThrow(id), userId);
      return { success: true };
    },
  },
  messages: {
    list: async (userId?: string) => mockDbInstance.getMessages(userId),
    send: async (data: { sender: string; text: string; recipient?: string }) => mockDbInstance.addMessage(data),
    remove: async (id: number, userId: string) => {
      const ok = mockDbInstance.deleteMessage(id, userId);
      if (!ok) throw new Error('Message not found or not owned');
      return { success: true };
    },
  },
  search: {
    trends: async () => mockDbInstance.getTrends(),
    posts: async (query: string, userId?: string) => {
      if (!query.trim()) return [];
      const posts = await mockDbInstance.searchPosts(query, userId);
      return posts.map(encodePost);
    },
  },
  hashtag: {
    posts: async (tag: string, userId?: string) => {
      const posts = await mockDbInstance.getPostsByHashtag(tag, userId);
      return posts.map(encodePost);
    },
  },
  users: {
    profile: async (id: string, userId?: string, tab?: string) => {
      let posts: Post[];
      // いいね/だめね/ハートの記録は displayName をキーに持つため、
      // スラッグではなく持ち主のdisplayNameで引く（サーバー側の /api/users/[id] と同じ扱い）。
      const displayName = mockDbInstance.getUserDisplayName(id) || id;
      if (tab === 'likes') {
        posts = (await mockDbInstance.getLikedPosts(displayName)).map(encodePost);
      } else if (tab === 'dislikes') {
        posts = (await mockDbInstance.getDislikedPosts(displayName)).map(encodePost);
      } else if (tab === 'hearts') {
        posts = (await mockDbInstance.getHeartedPosts(displayName)).map(encodePost);
      } else {
        posts = (await mockDbInstance.getUserPostsBySlug(id, userId)).map(encodePost);
      }
      const avatarUrl = mockDbInstance.getUserAvatarUrl(id);
      const bio = mockDbInstance.getUserBio(id);
      return { id, displayName, avatarUrl, bio, posts, postCount: posts.length };
    },
  },
  oshi: {
    list: async (userSlug: string) => mockDbInstance.listOshiItems(userSlug).map(encodeOshiItem),
    add: async (userSlug: string, item: {
      kind: OshiItemKind; trackId?: number; collectionId?: number; artistId?: number;
      title: string; subtitle?: string; artworkUrl?: string; viewUrl?: string; previewUrl?: string;
    }) => encodeOshiItem(mockDbInstance.addOshiItem(userSlug, item)),
    remove: async (userSlug: string, id: string) => {
      mockDbInstance.removeOshiItem(userSlug, decodeIdOrThrow(id));
      return { success: true };
    },
  },
  music: {
    search: async (term: string, entity: 'song' | 'album' | 'musicArtist') => {
      const params = new URLSearchParams({ term, entity, limit: '25', country: 'jp' });
      const res = await fetch(`https://itunes.apple.com/search?${params.toString()}`);
      return res.json();
    },
  },
  follow: {
    getCounts: async (userId: string) => mockDbInstance.getFollowCounts(userId),
    isFollowing: async (followerId: string, followedId: string) => ({ isFollowing: mockDbInstance.isFollowing(followerId, followedId) }),
    follow: async (followerId: string, followedId: string) => { mockDbInstance.followUser(followerId, followedId); return { success: true }; },
    unfollow: async (followerId: string, followedId: string) => { mockDbInstance.unfollowUser(followerId, followedId); return { success: true }; },
  },
  block: {
    list: async (blockerSlug: string) => ({ blocked: mockDbInstance.getBlockedSlugs(blockerSlug) }),
    block: async (blockerSlug: string, blockedSlug: string) => { mockDbInstance.blockUser(blockerSlug, blockedSlug); return { success: true }; },
    unblock: async (blockerSlug: string, blockedSlug: string) => { mockDbInstance.unblockUser(blockerSlug, blockedSlug); return { success: true }; },
  },
  mute: {
    list: async (muterSlug: string) => ({ muted: mockDbInstance.getMutedSlugs(muterSlug) }),
    mute: async (muterSlug: string, mutedSlug: string) => { mockDbInstance.muteUser(muterSlug, mutedSlug); return { success: true }; },
    unmute: async (muterSlug: string, mutedSlug: string) => { mockDbInstance.unmuteUser(muterSlug, mutedSlug); return { success: true }; },
  },
  report: {
    create: async (data: { reporterSlug: string; targetType: string; targetId: string; reason?: string }) => { mockDbInstance.reportContent({ ...data, reason: data.reason || '' }); return { success: true }; },
  },
};

const liveApi = {
  auth: {
    anonymous: (sessionId: string) => {
      const qs = `?sessionId=${encodeURIComponent(sessionId)}`;
      return fetcher<AnonymousUser>(`/auth/anonymous${qs}`);
    },
    updateDisplayName: (userId: string, displayName: string, avatarUrl?: string, bio?: string) =>
      fetcher<{ success: boolean }>('/auth/anonymous', { method: 'PUT', body: JSON.stringify({ userId, displayName, avatarUrl, bio }) }),
    getSettings: (slug: string) => fetcher<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>(`/auth/settings?slug=${encodeURIComponent(slug)}`),
    updateSettings: (slug: string, settings: Partial<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>) =>
      fetcher<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>('/auth/settings', { method: 'PUT', body: JSON.stringify({ slug, settings }) }),
    issueMigrationToken: (userId: string) => fetcher<{ token: string }>('/auth/migrate', { method: 'POST', body: JSON.stringify({ userId }) }),
    redeemMigrationToken: (token: string, sessionId: string) => fetcher<AnonymousUser>('/auth/migrate', { method: 'PUT', body: JSON.stringify({ token, sessionId }) }),
  },
  upload: {
    image: (data: { image: string; filename?: string }) =>
      fetcher<{ url: string }>('/upload', { method: 'POST', body: JSON.stringify(data) }),
  },
  posts: {
    /** `beforeId` を渡すとそのスレッドより古いページを取得する（キーセットページング）。 */
    list: (userId?: string, opts?: { beforeId?: string; limit?: number }) => {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      if (opts?.beforeId) params.set('beforeId', opts.beforeId);
      if (opts?.limit) params.set('limit', String(opts.limit));
      const qs = params.toString();
      return fetcher<Post[]>(`/posts${qs ? `?${qs}` : ''}`);
    },
    get: (id: string, userId?: string) => {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return fetcher<Post>(`/posts/${id}${qs}`);
    },
    create: (data: { displayName: string; content: string; hasImage?: boolean; imageSrc?: string; imageAlt?: string; avatarColor?: string; gameId?: string; originType?: OriginType }) =>
      fetcher<Post>('/posts', { method: 'POST', body: JSON.stringify(data) }),
    like: (id: string, userId?: string) => fetcher<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify({ action: 'like', userId }) }),
    dislike: (id: string, userId?: string) => fetcher<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify({ action: 'dislike', userId }) }),
    heart: (id: string, userId?: string, count?: number) => fetcher<Post>(`/posts/${id}`, { method: 'POST', body: JSON.stringify({ userId, count }) }),
    repost: (id: string) => fetcher<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify({ action: 'repost' }) }),
    edit: (id: string, userId: string, content: string, originType?: OriginType | null, imageSrc?: string) => fetcher<Post>(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify({ userId, content, originType, imageSrc }) }),
    remove: (id: string, userId: string) => fetcher<{ success: boolean }>(`/posts/${id}`, { method: 'DELETE', body: JSON.stringify({ userId }) }),
    replies: {
      list: (postId: string, userId?: string) => {
        const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
        return fetcher<Post[]>(`/posts/${postId}/replies${qs}`);
      },
      create: (postId: string, data: {
        displayName: string;
        content: string;
        parentPostId?: string;
        hasImage?: boolean;
        imageSrc?: string;
        imageAlt?: string;
        avatarColor?: string;
        gameId?: string | number;
        originType?: OriginType;
      }) =>
        fetcher<Post>(`/posts/${postId}/replies`, { method: 'POST', body: JSON.stringify(data) }),
    },
  },
  notifications: {
    list: (userId?: string) => {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return fetcher<Notification[]>(`/notifications${qs}`);
    },
    unreadCount: (userId: string) => fetcher<{ count: number }>(`/notifications?unread=1&userId=${encodeURIComponent(userId)}`),
    markRead: (id: string, userId: string) => fetcher<{ success: boolean }>('/notifications', { method: 'PATCH', body: JSON.stringify({ id, userId }) }),
    markAllRead: (userId: string) => fetcher<{ success: boolean }>('/notifications', { method: 'PATCH', body: JSON.stringify({ all: true, userId }) }),
    remove: (id: string, userId: string) => fetcher<{ success: boolean }>('/notifications', { method: 'DELETE', body: JSON.stringify({ id, userId }) }),
  },
  messages: {
    list: (userId?: string) => {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return fetcher<Message[]>(`/messages${qs}`);
    },
    send: (data: { sender: string; text: string; recipient?: string }) =>
      fetcher<Message>('/messages', { method: 'POST', body: JSON.stringify(data) }),
    remove: (id: number, userId: string) =>
      fetcher<{ success: boolean }>('/messages', { method: 'DELETE', body: JSON.stringify({ id, userId }) }),
  },
  search: {
    trends: () => fetcher<Trend[]>('/search/trends'),
    posts: (query: string, userId?: string) => {
      const params = new URLSearchParams({ q: query });
      if (userId) params.set('userId', userId);
      return fetcher<Post[]>(`/search?${params.toString()}`);
    },
  },
  hashtag: {
    posts: (tag: string, userId?: string) => {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return fetcher<Post[]>(`/hashtag/${encodeURIComponent(tag)}${qs}`);
    },
  },
  users: {
    profile: (id: string, userId?: string, tab?: string) => {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      if (tab) params.set('tab', tab);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return fetcher<{ id: string; displayName: string; avatarUrl?: string; bio?: string; posts: Post[]; postCount: number }>(`/users/${encodeURIComponent(id)}${qs}`);
    },
  },
  oshi: {
    list: (userSlug: string) => fetcher<OshiItem[]>(`/oshi?slug=${encodeURIComponent(userSlug)}`),
    add: (userSlug: string, item: {
      kind: OshiItemKind; trackId?: number; collectionId?: number; artistId?: number;
      title: string; subtitle?: string; artworkUrl?: string; viewUrl?: string; previewUrl?: string;
    }) => fetcher<OshiItem>('/oshi', { method: 'POST', body: JSON.stringify({ userSlug, ...item }) }),
    remove: (userSlug: string, id: string) => fetcher<{ success: boolean }>(`/oshi/${id}`, { method: 'DELETE', body: JSON.stringify({ userSlug }) }),
  },
  music: {
    search: async (term: string, entity: 'song' | 'album' | 'musicArtist') => {
      try {
        const params = new URLSearchParams({ term, entity, limit: '25', country: 'JP', lang: 'ja_jp' });
        const res = await fetch(`https://itunes.apple.com/search?${params.toString()}`);
        if (!res.ok) return { resultCount: 0, results: [] };
        return await res.json();
      } catch {
        return { resultCount: 0, results: [] };
      }
    },
  },
  follow: {
    getCounts: (userId: string) => fetcher<{ followers: number; following: number }>(`/follow?userId=${encodeURIComponent(userId)}`),
    isFollowing: (followerId: string, followedId: string) => fetcher<{ isFollowing: boolean }>(`/follow?followerId=${encodeURIComponent(followerId)}&followedId=${encodeURIComponent(followedId)}`),
    follow: (followerId: string, followedId: string) => fetcher<{ success: boolean }>('/follow', { method: 'POST', body: JSON.stringify({ followerId, followedId }) }),
    unfollow: (followerId: string, followedId: string) => fetcher<{ success: boolean }>('/follow', { method: 'DELETE', body: JSON.stringify({ followerId, followedId }) }),
  },
  block: {
    list: (blockerSlug: string) => fetcher<{ blocked: string[] }>(`/block?blockerSlug=${encodeURIComponent(blockerSlug)}`),
    block: (blockerSlug: string, blockedSlug: string) => fetcher<{ success: boolean }>('/block', { method: 'POST', body: JSON.stringify({ blockerSlug, blockedSlug }) }),
    unblock: (blockerSlug: string, blockedSlug: string) => fetcher<{ success: boolean }>('/block', { method: 'DELETE', body: JSON.stringify({ blockerSlug, blockedSlug }) }),
  },
  mute: {
    list: (muterSlug: string) => fetcher<{ muted: string[] }>(`/mute?muterSlug=${encodeURIComponent(muterSlug)}`),
    mute: (muterSlug: string, mutedSlug: string) => fetcher<{ success: boolean }>('/mute', { method: 'POST', body: JSON.stringify({ muterSlug, mutedSlug }) }),
    unmute: (muterSlug: string, mutedSlug: string) => fetcher<{ success: boolean }>('/mute', { method: 'DELETE', body: JSON.stringify({ muterSlug, mutedSlug }) }),
  },
  report: {
    create: (data: { reporterSlug: string; targetType: string; targetId: string; reason?: string }) =>
      fetcher<{ success: boolean }>('/report', { method: 'POST', body: JSON.stringify(data) }),
  },
};

export const api = useStaticMockData ? staticApi : liveApi;
