'use client';

import { useState } from 'react';
import { Post } from '@/lib/types';
import PostContainer from './PostContainer';
import { RotateCw } from 'lucide-react';

interface ConsecutivePostGroupProps {
  posts: Post[];
  isRankingMode: boolean;
  rankCategory: string;
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
  onReplyClick?: (post: Post) => void;
  onEditImage: ((post: Post) => void) | null;
  onEditMml: ((post: Post) => void) | null;
  onEditMv: ((post: Post) => void) | null;
  onEditPost?: (post: Post) => void;
  userId?: string;
  startIndex: number;
}

export default function ConsecutivePostGroup({
  posts,
  isRankingMode,
  rankCategory,
  onLike,
  onDislike,
  onRepost,
  onHeart,
  onAddReply,
  onQuickPost,
  openGame,
  openCollab,
  openMml,
  currentUserSlug,
  currentUserDisplayName,
  onModerationChange,
  onReplyClick,
  onEditImage,
  onEditMml,
  onEditMv,
  onEditPost,
  userId,
  startIndex,
}: ConsecutivePostGroupProps) {
  const [expanded, setExpanded] = useState(false);

  if (posts.length <= 1) {
    return (
      <PostContainer
        post={posts[0]}
        isRankingMode={isRankingMode}
        rankIndex={startIndex + 1}
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
    );
  }

  const visiblePosts = expanded ? posts : [posts[0]];

  return (
    <div className="border border-blue-600/60 bg-[#070c18]/80 rounded-xl my-2.5 overflow-hidden shadow-lg shadow-blue-500/5 divide-y divide-gray-800/80">
      {visiblePosts.map((post, idx) => (
        <PostContainer
          key={post.id}
          post={post}
          isRankingMode={isRankingMode}
          rankIndex={startIndex + idx + 1}
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
      ))}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full py-2.5 flex items-center justify-center gap-1.5 text-xs font-bold text-blue-400 bg-blue-950/40 hover:bg-blue-900/50 transition-colors border-t border-blue-600/60 cursor-pointer"
      >
        <RotateCw size={13} className="text-blue-400" />
        <span>
          {expanded
            ? '連投スレッドを閉じる ▲'
            : `連投スレッド 全 ${posts.length} 件 ▼`}
        </span>
      </button>
    </div>
  );
}
