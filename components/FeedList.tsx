'use client';

import { Post } from '@/lib/types';
import PostContainer from './PostContainer';

interface FeedListProps {
  posts: Post[];
  activeTab: string;
  rankCategory: string;
  onLike: (id: number) => void;
  onDislike: (id: number) => void;
  onRepost: (id: number) => void;
  onAddReply: (id: number, text: string) => void;
  openGame: () => void;
  openDrawing: () => void;
}

export default function FeedList({ posts, activeTab, rankCategory, onLike, onDislike, onRepost, onAddReply, openGame, openDrawing }: FeedListProps) {
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
  } else if (activeTab === 'game') {
    displayPosts = displayPosts.filter(p => p.hasGame || p.content.includes('#ゲーム') || p.id === 3);
  } else if (activeTab === 'following') {
    displayPosts = displayPosts.filter(p => p.id === 1 || p.id === 3);
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
          onAddReply={onAddReply}
          openGame={openGame}
          openDrawing={openDrawing}
        />
      ))}
      <div className="p-8 text-center text-xs text-gray-600 bg-gray-900/10">
        すべて表示されました 🌱
      </div>
    </div>
  );
}
