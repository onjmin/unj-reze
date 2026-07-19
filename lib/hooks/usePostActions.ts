'use client';

import { useRef } from 'react';
import { Post } from '@/lib/types';
import { api } from '@/lib/api';
import { showToast } from '@/lib/toast';

type UpdatePost = (postId: string, updater: (p: Post) => Post) => void;

const toggleLike = (p: Post): Post => ({
  ...p,
  liked: !p.liked,
  likes: Math.max(0, p.liked ? p.likes - 1 : p.likes + 1),
  disliked: p.liked ? p.disliked : false,
  dislikes: p.liked ? p.dislikes : (p.disliked ? Math.max(0, p.dislikes - 1) : p.dislikes),
});

const toggleDislike = (p: Post): Post => ({
  ...p,
  disliked: !p.disliked,
  dislikes: Math.max(0, p.disliked ? p.dislikes - 1 : p.dislikes + 1),
  liked: p.disliked ? p.liked : false,
  likes: p.disliked ? p.likes : (p.liked ? Math.max(0, p.likes - 1) : p.likes),
});

const toggleRepost = (p: Post): Post => ({
  ...p,
  reposted: !p.reposted,
  reposts: Math.max(0, p.reposted ? p.reposts - 1 : p.reposts + 1),
});

/** 投稿の いいね／低評価／リポスト／ハート／返信 の楽観的更新＋API同期を共通化するフック。
 * 更新対象の配列（メインフィード／検索結果など）は updatePost 経由で呼び出し側に委譲する。 */
export function usePostActions(userId: string, updatePost: UpdatePost, options?: { avatarUrl?: string }) {
  const heartQueue = useRef<Map<string, number>>(new Map());
  const heartTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const likeParity = useRef<Map<string, number>>(new Map());
  const likeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dislikeParity = useRef<Map<string, number>>(new Map());
  const dislikeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleLike = (postId: string) => {
    updatePost(postId, toggleLike);
    const parity = (likeParity.current.get(postId) || 0) + 1;
    likeParity.current.set(postId, parity);
    if (likeTimers.current.has(postId)) clearTimeout(likeTimers.current.get(postId)!);
    likeTimers.current.set(postId, setTimeout(async () => {
      const p = likeParity.current.get(postId) || 0;
      likeParity.current.delete(postId);
      likeTimers.current.delete(postId);
      if (p % 2 === 0) return;
      try {
        const updated = await api.posts.like(postId, userId);
        updatePost(postId, () => updated);
      } catch {
        updatePost(postId, toggleLike);
        showToast('error', 'いいねの送信に失敗しました');
      }
    }, 2000));
  };

  const handleDislike = (postId: string) => {
    updatePost(postId, toggleDislike);
    const parity = (dislikeParity.current.get(postId) || 0) + 1;
    dislikeParity.current.set(postId, parity);
    if (dislikeTimers.current.has(postId)) clearTimeout(dislikeTimers.current.get(postId)!);
    dislikeTimers.current.set(postId, setTimeout(async () => {
      const p = dislikeParity.current.get(postId) || 0;
      dislikeParity.current.delete(postId);
      dislikeTimers.current.delete(postId);
      if (p % 2 === 0) return;
      try {
        const updated = await api.posts.dislike(postId, userId);
        updatePost(postId, () => updated);
      } catch {
        updatePost(postId, toggleDislike);
        showToast('error', '低評価の送信に失敗しました');
      }
    }, 2000));
  };

  const handleRepost = async (postId: string) => {
    updatePost(postId, toggleRepost);
    try {
      const updated = await api.posts.repost(postId);
      updatePost(postId, () => updated);
    } catch {
      updatePost(postId, toggleRepost);
      showToast('error', 'リポストに失敗しました');
    }
  };

  const handleHeart = (postId: string) => {
    updatePost(postId, p => ({ ...p, heartsTotal: (Number(p.heartsTotal) || 0) + 1 }));
    const current = heartQueue.current.get(postId) || 0;
    heartQueue.current.set(postId, current + 1);
    if (heartTimers.current.has(postId)) clearTimeout(heartTimers.current.get(postId)!);
    heartTimers.current.set(postId, setTimeout(async () => {
      const count = heartQueue.current.get(postId) || 0;
      heartQueue.current.delete(postId);
      heartTimers.current.delete(postId);
      try {
        const updated = await api.posts.heart(postId, userId, count);
        updatePost(postId, () => updated);
      } catch {
        updatePost(postId, p => ({ ...p, heartsTotal: Math.max(0, (Number(p.heartsTotal) || 0) - count) }));
        showToast('error', 'ハートの送信に失敗しました');
      }
    }, 2000));
  };

  const handleAddReply = async (postId: string, replyText: string) => {
    if (!replyText.trim()) return;
    const tempId = `temp-${Date.now()}`;
    const optimisticReply: Post = {
      id: tempId, displayName: userId, createdAt: new Date().toISOString(), time: 'たった今', content: replyText,
      likes: 0, dislikes: 0, liked: false, disliked: false,
      repliesCount: 0, reposts: 0, reposted: false,
      avatarColor: 'from-blue-500 to-indigo-600',
      heartsTotal: 0, replies: [],
      threadId: postId, parentPostId: postId,
    };
    updatePost(postId, p => ({ ...p, repliesCount: p.repliesCount + 1, replies: [...p.replies, optimisticReply] }));
    try {
      const reply = await api.posts.replies.create(postId, {
        displayName: userId,
        content: replyText,
        parentPostId: postId,
      });
      updatePost(postId, p => ({ ...p, replies: p.replies.map(r => r.id === tempId ? { ...reply, avatarUrl: reply.avatarUrl ?? options?.avatarUrl } : r) }));
    } catch {
      updatePost(postId, p => ({ ...p, repliesCount: Math.max(0, p.repliesCount - 1), replies: p.replies.filter(r => r.id !== tempId) }));
      showToast('error', '返信の送信に失敗しました');
    }
  };

  return { handleLike, handleDislike, handleRepost, handleHeart, handleAddReply };
}
