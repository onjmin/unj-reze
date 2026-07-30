'use client';

import { encodeId } from '@/lib/sqids';
import { Post } from '@/lib/types';
import PostContainer from './PostContainer';
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
  onEditImage?: (post: Post) => void;
  onEditMml?: (post: Post) => void;
  onEditPost?: (post: Post) => void;
  userId?: string;
  /** 続きの読み込み。未指定なら「すべて表示されました」で終わる。 */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

export default function FeedList({ posts, activeTab, feedSubMode = 'threads', rankCategory, bbsMode, onLike, onDislike, onRepost, onHeart, onAddReply, onQuickPost, openGame, openCollab, openMml, currentUserSlug, currentUserDisplayName, onModerationChange, loading, onReplyClick, onEditImage, onEditMml, onEditPost, userId, onLoadMore, hasMore, loadingMore }: FeedListProps) {
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

  return (
    <div className="divide-y divide-gray-800/80">
      {displayPosts.map((post, index) => (
        <VirtualizedItem key={post.id} initialVisible={index < 8}>
          <PostContainer
            post={post}
            isRankingMode={activeTab === 'ranking'}
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
            onEditPost={onEditPost}
            userId={userId}
          />
        </VirtualizedItem>
      ))}
      {onLoadMore && hasMore ? (
        // 無限スクロール（IntersectionObserver）は iframe 内で rootMargin が効かない事例があるため、
        // 明示的なボタンにしている。
        <div className="p-6 text-center bg-gray-900/10">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-5 py-2 rounded-full text-xs font-bold bg-gray-100/10 text-gray-200 hover:bg-gray-100/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingMore ? '読み込み中…' : 'もっと読み込む'}
          </button>
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-gray-600 bg-gray-900/10">
          すべて表示されました 🌱
        </div>
      )}
    </div>
  );
}
