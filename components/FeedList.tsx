'use client';

import { encodeId } from '@/lib/sqids';
import { Post } from '@/lib/types';
import PostContainer from './PostContainer';
import BbsBoardView from './BbsBoardView';

interface FeedListProps {
  posts: Post[];
  activeTab: string;
  rankCategory: string;
  bbsMode: string;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onRepost: (id: string) => void;
  onHeart: (id: string) => void;
  onAddReply: (id: string, text: string, replyToNum?: number) => void;
  onQuickPost: () => void;
  openGame: (gameId?: string, postId?: string) => void;
  openCollab: (post: Post) => void;
  openMml: () => void;
  currentUserSlug?: string;
  currentUserDisplayName?: string;
  onModerationChange?: () => void;
}

export default function FeedList({ posts, activeTab, rankCategory, bbsMode, onLike, onDislike, onRepost, onHeart, onAddReply, onQuickPost, openGame, openCollab, openMml, currentUserSlug, currentUserDisplayName, onModerationChange }: FeedListProps) {
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
  }

  if (bbsMode === '掲示板モード') {
    return (
      <BbsBoardView
        posts={displayPosts}
        activeTab={activeTab}
        rankCategory={rankCategory}
        onQuickPost={onQuickPost}
      />
    );
  }

  return (
    <div className="divide-y divide-gray-800/80">
      {displayPosts.map((post, index) => (
        <PostContainer
          key={post.id}
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
        />
      ))}
      <div className="p-8 text-center text-xs text-gray-600 bg-gray-900/10">
        すべて表示されました 🌱
      </div>
    </div>
  );
}
