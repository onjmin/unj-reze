'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Loader2, PlaySquare } from 'lucide-react';
import { Post } from '@/lib/types';
import { extractFirstEmbed, getEmbedThumbnail } from '@/lib/embed';
import { cachePost } from '@/lib/post-cache';
import { getUserIdLabel } from '@/lib/avatar';
import { getThreadDisplayTime } from '@/lib/time';

interface BbsBoardViewProps {
  posts: Post[];
  activeTab: string;
  rankCategory: string;
  onQuickPost: (text?: string) => void;
  loading?: boolean;
}

const PAGE_SIZE = 15;

type SortKey = 'updated' | 'newThread' | 'momentum' | 'newReply' | 'replyCount' | 'oldest';

const SORT_OPTIONS: { key: SortKey; label: string; icon?: string }[] = [
  { key: 'updated', label: '更新順' },
  { key: 'newThread', label: '新スレ順' },
  { key: 'momentum', label: '勢い', icon: '🔥' },
  { key: 'newReply', label: '新レス順' },
  { key: 'replyCount', label: '投稿数' },
  { key: 'oldest', label: '古い順' },
];

const createdMs = (p: Post) => new Date(p.createdAt).getTime();
/** 最終レス時刻（レス無しはスレ立て時刻）。 */
const lastReplyMs = (p: Post) =>
  p.replies.reduce((latest, r) => Math.max(latest, new Date(r.createdAt).getTime()), 0);
const lastActivityMs = (p: Post) => Math.max(createdMs(p), lastReplyMs(p));
/** 勢い＝レス数 ÷ 経過時間（時間）。立ったばかりのスレが有利になりすぎないよう下限を1hに。 */
const momentum = (p: Post) => {
  const hours = Math.max(1, (Date.now() - createdMs(p)) / 3600_000);
  return p.repliesCount / hours;
};

export default function BbsBoardView({ posts, activeTab, rankCategory, onQuickPost, loading }: BbsBoardViewProps) {
  const router = useRouter();
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortOpen]);

  const displayPosts = [...posts];
  if (activeTab === 'ranking') {
    if (rankCategory === 'イイ') displayPosts.sort((a, b) => b.likes - a.likes);
    else if (rankCategory === 'コメ') displayPosts.sort((a, b) => b.repliesCount - a.repliesCount);
    else if (rankCategory === 'ダメ') displayPosts.sort((a, b) => b.dislikes - a.dislikes);
  } else {
    switch (sortKey) {
      case 'newThread': displayPosts.sort((a, b) => createdMs(b) - createdMs(a)); break;
      case 'momentum': displayPosts.sort((a, b) => momentum(b) - momentum(a)); break;
      case 'newReply': displayPosts.sort((a, b) => lastReplyMs(b) - lastReplyMs(a)); break;
      case 'replyCount': displayPosts.sort((a, b) => b.repliesCount - a.repliesCount); break;
      case 'oldest': displayPosts.sort((a, b) => createdMs(a) - createdMs(b)); break;
      default: displayPosts.sort((a, b) => lastActivityMs(b) - lastActivityMs(a)); break;
    }
  }

  const currentSort = SORT_OPTIONS.find(o => o.key === sortKey) ?? SORT_OPTIONS[0];

  const totalPages = Math.max(1, Math.ceil(displayPosts.length / PAGE_SIZE));
  const pagePosts = displayPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const badgeClass = (count: number) => {
    if (count >= 100) return 'bg-red-600 text-white';
    if (count >= 20) return 'bg-orange-600 text-white';
    if (count >= 7) return 'bg-green-500 text-white';
    if (count >= 3) return 'bg-green-900 text-green-300';
    return 'bg-gray-800 text-gray-400';
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}/${day} ${h}:${min}`;
  };

  return (
    <div className="flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 flex-wrap shrink-0">
        <span className="text-gray-500 text-[10px]">並び:</span>
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setSortOpen(v => !v)}
            aria-haspopup="menu"
            aria-expanded={sortOpen}
            className={`bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded text-[10px] transition-colors ${sortOpen ? 'text-[#a3e635] ring-1 ring-[#a3e635]/40' : 'text-gray-200'}`}
          >
            {currentSort.icon && <span className="mr-0.5">{currentSort.icon}</span>}
            {currentSort.label} <span className="text-gray-500">▼</span>
          </button>
          {sortOpen && (
            <div role="menu" className="absolute left-0 top-6 z-30 w-32 rounded-lg border border-gray-700 bg-[#131720] shadow-xl py-1">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  role="menuitemradio"
                  aria-checked={opt.key === sortKey}
                  onClick={() => { setSortKey(opt.key); setPage(1); setSortOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-[11px] transition-colors hover:bg-gray-100/10 ${opt.key === sortKey ? 'text-[#a3e635] font-bold' : 'text-gray-300'}`}
                >
                  {opt.icon && <span className="mr-1">{opt.icon}</span>}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setAutoUpdate(v => !v)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${autoUpdate ? 'border-green-600/60 text-green-400' : 'border-gray-700 text-gray-500'
            }`}
        >
          <span className={`inline-flex items-center justify-center w-3 h-3 rounded-sm border text-[7px] font-bold transition-colors ${autoUpdate ? 'bg-green-500 border-green-500 text-white' : 'border-gray-600 text-transparent'
            }`}>✓</span>
          自動更新
          {autoUpdate && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
        </button>
        <button
          onClick={() => onQuickPost()}
          className="ml-auto flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-gray-100 px-2.5 py-1 rounded text-[11px] font-bold transition-colors"
        >
          <Plus size={11} /> スレ作成
        </button>
        <button className="p-1 hover:bg-gray-800 rounded text-gray-500 transition-colors">
          <Search size={14} />
        </button>
      </div>

      {/* Count + pagination */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800/50 shrink-0">
        <span className="text-[10px] text-gray-500">全 {displayPosts.length} スレッド</span>
        <div className="flex items-center gap-1 text-[10px]">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="w-5 h-5 flex items-center justify-center rounded bg-gray-800 text-gray-400 disabled:opacity-30 hover:bg-gray-700 transition-colors"
          >{'<'}</button>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="w-5 h-5 flex items-center justify-center rounded bg-gray-800 text-gray-400 disabled:opacity-30 hover:bg-gray-700 transition-colors"
          >{'>'}</button>
          <span className="text-gray-500 ml-0.5">{page} / {totalPages}</span>
        </div>
      </div>

      {/* Thread list */}
      <div className="divide-y divide-gray-800/50">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="text-gray-500 animate-spin" />
          </div>
        ) : displayPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center py-20 bg-gray-900/5">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500/10 to-indigo-500/10 flex items-center justify-center mb-4 border border-blue-500/20 shadow-lg shadow-blue-500/5">
              <span className="text-2xl animate-pulse">🌱</span>
            </div>
            <p className="text-sm font-bold text-gray-200">まだ投稿がありません。</p>
            <p className="text-xs text-gray-400 mt-1 font-medium">最初の投稿をしてみましょう！</p>
          </div>
        ) : (
          pagePosts.map(post => {
            const hasReplies = post.repliesCount > 0 || (post.replies && post.replies.length > 0);
            const threadTime = getThreadDisplayTime(post);
            return (
              <div
                key={post.id}
                onClick={() => {
                  cachePost(post);
                  router.push(`/post/${post.id}`);
                }}
                className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                  hasReplies
                    ? 'bg-blue-950/20 border-l-2 border-l-blue-500 hover:bg-blue-900/30'
                    : 'hover:bg-gray-800/25 active:bg-gray-800/40'
                }`}
              >
                {/* Reply count badge */}
                <div className={`shrink-0 min-w-[28px] h-6 rounded px-1.5 flex items-center justify-center text-[11px] font-bold tabular-nums ${badgeClass(post.repliesCount)}`}>
                  {post.repliesCount}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-gray-100 leading-snug line-clamp-2 break-words">
                    {post.content.split('\n')[0]}
                  </p>
                  <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0 mt-1 text-[10px] text-gray-500">
                    <span>ID:{getUserIdLabel(post.displayName, post.slug)}</span>
                    <span>{formatDate(threadTime.iso)}</span>
                    <span className="text-gray-600">({threadTime.time}){post.isEdited && ' (編集済み)'}</span>
                    {post.likes > 0 && (
                      <span className="flex items-center gap-0.5">
                        <span className="text-gray-600">👍</span>
                        <span>{post.likes}</span>
                      </span>
                    )}
                  </div>
                </div>

              {/* Thumbnail */}
              {(() => {
                if (post.hasImage && post.imageSrc) {
                  return (
                    <div className="shrink-0 w-11 h-11 rounded overflow-hidden border border-gray-700/60 gimp-checkered-background-white">
                      <img src={post.imageSrc} alt="" className="w-full h-full object-cover" />
                    </div>
                  );
                }
                if (post.hasGame) {
                  return (
                    <div className="shrink-0 w-11 h-11 rounded bg-red-600/20 border border-red-600/40 flex items-center justify-center">
                      <PlaySquare size={18} className="text-red-400" />
                    </div>
                  );
                }
                const embed = extractFirstEmbed(post.content);
                const thumb = embed ? getEmbedThumbnail(embed) : null;
                if (!thumb) return null;
                return (
                  <div className="shrink-0 w-11 h-11 rounded overflow-hidden border border-gray-700/60">
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  </div>
                );
              })()}
            </div>
          );
        })
        )}
      </div>

      {displayPosts.length > 0 && (
        <div className="py-8 text-center text-[10px] text-gray-700">
          すべて表示されました
        </div>
      )}
    </div>
  );
}
