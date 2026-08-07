'use client';

import { useEffect, useRef } from 'react';
import { encodeId } from '@/lib/sqids';
import { Post } from '@/lib/types';
import PostContainer from './PostContainer';
import ConsecutivePostGroup from './ConsecutivePostGroup';
import BbsBoardView from './BbsBoardView';
import VirtualizedItem from './VirtualizedItem';
import MediaGrid from './MediaGrid';
import { Loader2 } from 'lucide-react';
import type { FeedSubMode } from './TopTabs';

interface FeedListProps {
  posts: Post[];
  activeTab: string;
  feedSubMode?: FeedSubMode;
  rankCategory: string;
  bbsMode: string;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onRepost: (id: string) => void;
  onHeart: (id: string) => void;
  onAddReply: (id: string, text: string, replyToNum?: number) => void;
  onQuickPost: (text?: string) => void;
  openGame: (gameId?: string, postId?: string) => void;
  openCollab: (post: Post) => void;
  openMml: () => void;
  currentUserSlug?: string;
  currentUserDisplayName?: string;
  onModerationChange?: () => void;
  loading?: boolean;
  onReplyClick?: (post: Post) => void;
  onEditImage: ((post: Post) => void) | null;
  onEditMml: ((post: Post) => void) | null;
  onEditMv: ((post: Post) => void) | null;
  onEditPost?: (post: Post) => void;
  userId?: string;
  /** 続きの読み込み。未指定なら「すべて表示されました」で終わる。 */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

export default function FeedList({ posts, activeTab, feedSubMode = 'threads', rankCategory, bbsMode, onLike, onDislike, onRepost, onHeart, onAddReply, onQuickPost, openGame, openCollab, openMml, currentUserSlug, currentUserDisplayName, onModerationChange, loading, onReplyClick, onEditImage, onEditMml, onEditMv, onEditPost, userId, onLoadMore, hasMore, loadingMore }: FeedListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(loadingMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
    hasMoreRef.current = hasMore;
    loadingMoreRef.current = loadingMore;
  });

  useEffect(() => {
    if (!sentinelRef.current) return;
    const sentinel = sentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingMoreRef.current && onLoadMoreRef.current) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: '400px 0px 400px 0px', threshold: 0 }
    );

    observer.observe(sentinel);

    const scrollContainer = document.getElementById('scrollable-content') || window;
    const handleScroll = () => {
      if (!hasMoreRef.current || loadingMoreRef.current || !onLoadMoreRef.current) return;
      const target = scrollContainer === window ? document.documentElement : (scrollContainer as HTMLElement);
      if (target.scrollHeight - target.scrollTop - target.clientHeight < 500) {
        onLoadMoreRef.current();
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [posts.length]);

  let displayPosts = [...posts];

  if (activeTab === 'ranking') {
    if (rankCategory === 'イイ') {
      displayPosts.sort((a, b) => b.likes - a.likes);
    } else if (rankCategory === 'コメ') {
      displayPosts.sort((a, b) => b.repliesCount - a.repliesCount);
    } else if (rankCategory === 'ダメ') {
      displayPosts.sort((a, b) => b.dislikes - a.dislikes);
    } else {
      displayPosts.sort((a, b) => b.heartsTotal - a.heartsTotal);
    }
  } else if (activeTab === 'following') {
    displayPosts = displayPosts.filter(p => p.id === encodeId(3) || p.id === encodeId(6));
  } else {
    const lastActivity = (p: Post) => p.replies.reduce(
      (latest, r) => Math.max(latest, new Date(r.createdAt).getTime()),
      new Date(p.createdAt).getTime()
    );
    displayPosts.sort((a, b) => lastActivity(b) - lastActivity(a));
  }

  if (bbsMode === '掲示板モード') {
    return (
      <BbsBoardView
        posts={displayPosts}
        activeTab={activeTab}
        rankCategory={rankCategory}
        onQuickPost={onQuickPost}
        loading={loading}
        onLoadMore={onLoadMore}
        hasMore={hasMore}
        loadingMore={loadingMore}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="text-gray-500 animate-spin" size={20} />
      </div>
    );
  }

  if (activeTab === 'everyone' && feedSubMode === 'media') {
    const mediaItems = posts.flatMap(p => [p, ...p.replies]).filter(p => p.hasImage && p.imageSrc);
    return <MediaGrid items={mediaItems} />;
  }

  if (activeTab === 'everyone' && feedSubMode === 'replies') {
    const repliesFlat = posts
      .flatMap(p => p.replies.map(r => ({ reply: r, parent: p })))
      .sort((a, b) => new Date(b.reply.createdAt).getTime() - new Date(a.reply.createdAt).getTime());

    if (repliesFlat.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center py-20 bg-gray-900/5">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500/10 to-indigo-500/10 flex items-center justify-center mb-4 border border-blue-500/20 shadow-lg shadow-blue-500/5">
            <span className="text-2xl">💬</span>
          </div>
          <p className="text-sm font-bold text-gray-200">まだ返信がありません。</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-gray-800/80">
        {repliesFlat.map(({ reply, parent }, index) => (
          <VirtualizedItem key={reply.id} initialVisible={index < 8}>
            <PostContainer
              post={reply}
              quotedPost={parent}
              isRankingMode={false}
              rankIndex={index + 1}
              rankCategory={rankCategory}
              onLike={onLike}
              onDislike={onDislike}
              onRepost={onRepost}
              onHeart={onHeart}
              onAddReply={onAddReply}
              onQuickPost={onQuickPost}
              openGame={openGame}
              openCollab={openCollab}
              openMml={openMml}
              currentUserSlug={currentUserSlug}
              currentUserDisplayName={currentUserDisplayName}
              onModerationChange={onModerationChange}
              onReplyClick={onReplyClick}
              onEditImage={onEditImage}
              onEditMml={onEditMml}
              onEditMv={onEditMv}
              onEditPost={onEditPost}
              userId={userId}
            />
          </VirtualizedItem>
        ))}
        <div className="p-8 text-center text-xs text-gray-600 bg-gray-900/10">
          すべて表示されました 🌱
        </div>
      </div>
    );
  }

  if (displayPosts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center py-20 bg-gray-900/5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500/10 to-indigo-500/10 flex items-center justify-center mb-4 border border-blue-500/20 shadow-lg shadow-blue-500/5">
          <span className="text-2xl animate-pulse">🌱</span>
        </div>
        <p className="text-sm font-bold text-gray-200">まだ投稿がありません。</p>
        <p className="text-xs text-gray-400 mt-1 font-medium">最初の投稿をしてみましょう！</p>
      </div>
    );
  }

  const groups: { id: string; authorKey: string; posts: Post[] }[] = [];
  for (const post of displayPosts) {
    const authorKey = (post.slug || post.displayName).trim();
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.authorKey === authorKey) {
      lastGroup.posts.push(post);
    } else {
      groups.push({
        id: post.id,
        authorKey,
        posts: [post],
      });
    }
  }

  let currentIndex = 0;

  return (
    <div className="divide-y divide-gray-800/80">
      {groups.map((group, groupIdx) => {
        const startIndex = currentIndex;
        currentIndex += group.posts.length;
        return (
          <VirtualizedItem key={group.id} initialVisible={groupIdx < 8}>
            <ConsecutivePostGroup
              posts={group.posts}
              startIndex={startIndex}
              isRankingMode={activeTab === 'ranking'}
              rankCategory={rankCategory}
              onLike={onLike}
              onDislike={onDislike}
              onRepost={onRepost}
              onHeart={onHeart}
              onAddReply={onAddReply}
              onQuickPost={onQuickPost}
              openGame={openGame}
              openCollab={openCollab}
              openMml={openMml}
              currentUserSlug={currentUserSlug}
              currentUserDisplayName={currentUserDisplayName}
              onModerationChange={onModerationChange}
              onReplyClick={onReplyClick}
              onEditImage={onEditImage}
              onEditMml={onEditMml}
              onEditMv={onEditMv}
              onEditPost={onEditPost}
              userId={userId}
            />
          </VirtualizedItem>
        );
      })}
      {onLoadMore && hasMore ? (
        <div ref={sentinelRef} className="p-6 text-center bg-gray-900/10 flex items-center justify-center space-x-2">
          <Loader2 className="animate-spin text-blue-500" size={16} />
          <span className="text-xs text-gray-400 font-bold">自動読み込み中…</span>
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-gray-600 bg-gray-900/10">
          すべて表示されました 🌱
        </div>
      )}
    </div>
  );
}
