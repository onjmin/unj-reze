'use client';

import { Search, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Post } from '@/lib/types';
import { usePostActions } from '@/lib/hooks/usePostActions';
import PostContainer from './PostContainer';
import VirtualizedItem from './VirtualizedItem';

interface SearchViewProps {
  userId?: string;
  onLike?: (id: string) => void;
  onDislike?: (id: string) => void;
  onRepost?: (id: string) => void;
  onHeart?: (id: string) => void;
  onAddReply?: (id: string, text: string) => void;
  onQuickPost: (text?: string) => void;
  openGame: (gameId?: string, postId?: string) => void;
  openCollab: (post: Post) => void;
  openMml: () => void;
  currentUserSlug?: string;
  currentUserDisplayName?: string;
  onEditImage?: (post: Post) => void;
  onEditMml?: (post: Post) => void;
  onEditPost?: (post: Post) => void;
  initialQuery?: string;
}

export default function SearchView(props: SearchViewProps) {
  const router = useRouter();
  const [trends, setTrends] = useState<{ keyword: string; count: number }[]>([]);
  const [query, setQuery] = useState(props.initialQuery || '');
  const [results, setResults] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const updateResultPost = useCallback((postId: string, updater: (p: Post) => Post) => {
    setResults(prev => prev.map(p => p.id === postId ? updater(p) : p));
  }, []);
  const ownActions = usePostActions(
    props.userId || props.currentUserDisplayName || '',
    updateResultPost
  );
  const onLike = props.onLike ?? ownActions.handleLike;
  const onDislike = props.onDislike ?? ownActions.handleDislike;
  const onRepost = props.onRepost ?? ownActions.handleRepost;
  const onHeart = props.onHeart ?? ownActions.handleHeart;
  const onAddReply = props.onAddReply ?? ownActions.handleAddReply;

  useEffect(() => {
    api.search.trends().then(setTrends);
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.search.posts(trimmed);
      setResults(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (props.initialQuery && props.initialQuery.trim()) {
      setQuery(props.initialQuery);
      handleSearch(props.initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const handleTrendClick = (keyword: string) => {
    if (keyword.startsWith('#')) {
      router.push(`/hashtag/${encodeURIComponent(keyword.slice(1))}`);
      return;
    }
    setQuery(keyword);
    handleSearch(keyword);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 pb-0">
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-3.5 top-2.5 text-gray-500" size={16} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="掲示板内スレッド・素材を検索"
            className="w-full bg-gray-100/10 hover:bg-gray-100/15 rounded-full py-2 pl-10 pr-4 text-xs outline-none text-white transition-colors border border-gray-800"
          />
        </form>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="text-gray-400 animate-spin" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-xs">
          検索結果が見つかりませんでした
        </div>
      )}

      {!loading && searched && results.length > 0 && (
        <div className="divide-y divide-gray-800/80">
          {results.map((post, index) => (
            <VirtualizedItem key={post.id} initialVisible={index < 8}>
              <PostContainer
                post={post}
                isRankingMode={false}
                rankIndex={0}
                rankCategory=""
                onLike={onLike}
                onDislike={onDislike}
                onRepost={onRepost}
                onHeart={onHeart}
                onAddReply={onAddReply}
                onQuickPost={props.onQuickPost}
                openGame={props.openGame}
                openCollab={props.openCollab}
                openMml={props.openMml}
                currentUserSlug={props.currentUserSlug}
                currentUserDisplayName={props.currentUserDisplayName}
                onEditImage={props.onEditImage}
                onEditMml={props.onEditMml}
                onEditPost={props.onEditPost}
              />
            </VirtualizedItem>
          ))}
          <div className="p-8 text-center text-xs text-gray-600 bg-gray-900/10">
            すべて表示されました 🌱
          </div>
        </div>
      )}

      {!searched && (
        <div className="p-4">
          <h3 className="font-bold text-xs text-gray-400 mb-2 pl-1">急上昇キーワード</h3>
          <div className="bg-gray-100/5 border border-gray-800 rounded-xl divide-y divide-gray-800/65">
            {trends.map((trend, idx) => (
              <div
                key={trend.keyword}
                onClick={() => handleTrendClick(trend.keyword)}
                className="p-3 flex justify-between items-center hover:bg-gray-100/5 transition-colors cursor-pointer text-xs"
              >
                <div>
                  <span className="text-gray-500 mr-2.5 font-bold">{idx + 1}</span>
                  <span className="font-bold text-gray-200">{trend.keyword}</span>
                </div>
                <span className="text-[10px] text-gray-600">{trend.count}k スレッド</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
