'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Hash } from 'lucide-react';
import { Post, AnonymousUser } from '@/lib/types';
import { api } from '@/lib/api';
import PostContainer from './PostContainer';

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(`(?:^|;\\s*)${name}=([^;]*)`);
  return match ? decodeURIComponent(match[1]) : undefined;
}

interface HashtagViewProps {
  tag: string;
}

export default function HashtagView({ tag }: HashtagViewProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [currentUser, setCurrentUser] = useState<AnonymousUser | null>(null);
  const inited = useRef(false);

  const normalized = tag.startsWith('#') ? tag : `#${tag}`;

  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    const sessionId = getCookie('unj_reze_session');
    if (sessionId) {
      api.auth.anonymous(sessionId).then(u => {
        setUserId(u.displayName);
        setCurrentUser(u);
      }).catch(() => {});
    }
  }, []);

  const fetchPosts = useCallback(() => {
    setLoading(true);
    api.hashtag.posts(normalized, userId || undefined)
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [normalized, userId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleLike = async (id: string) => {
    setPosts(prev => prev.map(p => p.id !== id ? p : { ...p, liked: !p.liked, likes: Math.max(0, p.liked ? p.likes - 1 : p.likes + 1) }));
    try { const u = await api.posts.like(id, userId); setPosts(prev => prev.map(p => p.id === id ? u : p)); } catch {}
  };
  const handleDislike = async (id: string) => {
    setPosts(prev => prev.map(p => p.id !== id ? p : { ...p, disliked: !p.disliked, dislikes: Math.max(0, p.disliked ? p.dislikes - 1 : p.dislikes + 1) }));
    try { const u = await api.posts.dislike(id, userId); setPosts(prev => prev.map(p => p.id === id ? u : p)); } catch {}
  };
  const handleRepost = async (id: string) => {
    try { const u = await api.posts.repost(id); setPosts(prev => prev.map(p => p.id === id ? u : p)); } catch {}
  };
  const handleHeart = async (id: string) => {
    setPosts(prev => prev.map(p => p.id !== id ? p : { ...p, heartsTotal: (Number(p.heartsTotal) || 0) + 1 }));
    try { await api.posts.heart(id, userId, 1); } catch {}
  };
  const handleAddReply = async (id: string, text: string) => {
    if (!text.trim()) return;
    try {
      const reply = await api.posts.replies.create(id, { displayName: userId, content: text, parentPostId: id });
      setPosts(prev => prev.map(p => p.id === id ? { ...p, repliesCount: p.repliesCount + 1, replies: [...p.replies, reply] } : p));
    } catch {}
  };

  return (
    <div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col">
      <div className="w-full max-w-2xl mx-auto border-x border-gray-800 flex-1 flex flex-col">
        <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
          <div className="flex items-center px-3 h-11">
            <Link href="/" className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors">
              <ArrowLeft size={18} className="text-gray-300" />
            </Link>
            <span className="ml-3 font-bold text-sm text-gray-200 flex items-center gap-1">
              <Hash size={15} className="text-blue-400" />
              {normalized.slice(1)}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-800/80">
          {loading ? (
            <div className="p-8 text-center text-xs text-gray-600">読み込み中...</div>
          ) : posts.length > 0 ? (
            posts.map((post, index) => (
              <PostContainer
                key={post.id}
                post={post}
                isRankingMode={false}
                rankIndex={index + 1}
                rankCategory=""
                onLike={handleLike}
                onDislike={handleDislike}
                onRepost={handleRepost}
                onHeart={handleHeart}
                onAddReply={handleAddReply}
                onQuickPost={() => {}}
                openGame={() => {}}
                openCollab={() => {}}
                openMml={() => {}}
                currentUserSlug={currentUser?.slug}
                currentUserDisplayName={currentUser?.displayName}
                onModerationChange={fetchPosts}
              />
            ))
          ) : (
            <div className="p-12 text-center text-xs text-gray-600 flex flex-col items-center gap-2">
              <Hash size={24} className="text-gray-700" />
              <span>「{normalized}」の投稿はまだありません</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
