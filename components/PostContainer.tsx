'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Plus, MoreHorizontal, ThumbsUp, ThumbsDown,
  MessageCircle, Repeat, Mail, Heart, Edit3, PlaySquare, Copy, UserPlus, Ban, Flag
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Post } from '@/lib/types';
import { extractMmlFromContent } from '@/lib/mml';
import { extractChordsFromContent } from '@/lib/chord';
import { extractFirstEmbed } from '@/lib/embed';
import MmlPlayer from './MmlPlayer';
import ChordPlayer from './ChordPlayer';
import EmbedPart from './EmbedPart';

interface PostContainerProps {
  post: Post;
  isRankingMode: boolean;
  rankIndex: number;
  rankCategory: string;
  onLike: (id: number) => void;
  onDislike: (id: number) => void;
  onRepost: (id: number) => void;
  onHeart: (id: number) => void;
  onAddReply: (id: number, text: string) => void;
  onQuickPost: () => void;
  openGame: () => void;
  openDrawing: () => void;
  openMml: () => void;
}

export default function PostContainer({ post, isRankingMode, rankIndex, rankCategory, onLike, onDislike, onRepost, onHeart, onAddReply, onQuickPost, openGame, openDrawing, openMml }: PostContainerProps) {
  const router = useRouter();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen(v => !v);
  }, []);

  const handleMenuCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(post.content);
    setMenuOpen(false);
  }, [post.content]);

  const handleMenuFollow = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFollowing(v => !v);
    setMenuOpen(false);
  }, []);

  const handleMenuBlock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setBlocked(v => !v);
    setMenuOpen(false);
  }, []);

  const handleMenuReport = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handlePostClick = useCallback((e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('button') || t.closest('input') || t.closest('textarea') || t.closest('a') || t.closest('[role="button"]') || t.closest('video')) return;
    router.push(`/post/${post.id}`);
  }, [router, post.id]);

  const getRankScoreDisplay = () => {
    if (rankCategory === 'イイ') return `${post.likes} いいね`;
    if (rankCategory === 'コメ') return `${post.repliesCount} コメ`;
    if (rankCategory === 'ダメ') return `${post.dislikes} ダメ`;
    return `${post.repliesCount} レス`;
  };

  return (
    <div className={`flex relative transition-all ${isRankingMode ? 'bg-gradient-to-r from-gray-900/10 via-transparent to-transparent' : ''}`}>
      {isRankingMode && (
        <div className="w-10 shrink-0 flex items-start justify-center pt-4 pl-1">
          <span className={`font-mono font-bold text-sm ${rankIndex === 1 ? 'text-yellow-500 scale-110 drop-shadow-[0_0_8px_rgba(234,179,8,0.2)]' :
            rankIndex === 2 ? 'text-gray-400' :
              rankIndex === 3 ? 'text-amber-600' : 'text-gray-600'
            }`}>
            {rankIndex}
          </span>
        </div>
      )}

      {isRankingMode && (
        <div className="absolute top-4 right-3 flex flex-col items-end z-10 pointer-events-none">
          <span className="text-[10px] font-bold text-gray-400 bg-[#0f121a]/80 px-2 py-0.5 rounded border border-gray-800">
            {getRankScoreDisplay()}
          </span>
        </div>
      )}

      <div className="flex-1 p-3 flex space-x-2.5 min-w-0 pr-4">
        <div
          onClick={(e) => { e.stopPropagation(); router.push(`/user/${post.slug || post.displayName}`); }}
          className={`w-9 h-9 rounded-full bg-gradient-to-br ${post.avatarColor} shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white relative cursor-pointer hover:opacity-80 transition-opacity`}
        >
          {post.displayName.substring(3, 5) || "名無"}
          <button
            onClick={(e) => { e.stopPropagation(); onQuickPost(); }}
            className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5 border border-gray-800 hover:bg-blue-600 transition-colors cursor-pointer"
          >
            <Plus size={8} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={handlePostClick}>
          <div className="flex justify-between items-baseline mb-0.5">
            <div className="flex items-baseline space-x-1.5">
              <span className="font-bold text-xs text-gray-200">{post.displayName}</span>
              <span className="text-gray-500 text-[10px] font-medium">{post.time}</span>
            </div>
            <div ref={menuRef} className="relative">
              <button onClick={toggleMenu} className="p-0.5 -mr-0.5 rounded hover:bg-gray-100/10 transition-colors">
                <MoreHorizontal size={14} className="text-gray-500 hover:text-gray-300" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-6 z-50 w-48 rounded-lg border border-gray-700 bg-[#131720] shadow-xl py-1 text-xs"
                  onClick={e => e.stopPropagation()}
                >
                  <button role="menuitem" onClick={handleMenuCopy} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                    <Copy size={12} className="shrink-0" />
                    <span>テキストをコピー</span>
                  </button>
                  <button role="menuitem" onClick={handleMenuFollow} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                    <UserPlus size={12} className="shrink-0" />
                    <span>{following ? 'フォロー中' : `${post.displayName}さんをフォロー`}</span>
                  </button>
                  <button role="menuitem" onClick={handleMenuBlock} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                    <Ban size={12} className="shrink-0" />
                    <span>{blocked ? 'ブロック中' : `${post.displayName}さんをブロック`}</span>
                  </button>
                  <div className="border-t border-gray-800 my-1" />
                  <button role="menuitem" onClick={handleMenuReport} className="flex items-center gap-2.5 w-full px-3 py-2 text-red-400 hover:bg-gray-100/10 text-left transition-colors">
                    <Flag size={12} className="shrink-0" />
                    <span>ポストを通報</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className="text-[13px] text-gray-200 whitespace-pre-wrap leading-relaxed mb-2.5">
            {(() => {
              const markers = ['#mml', '#chord',];
              const markerPos = markers.reduce((best, kw) => {
                const p = post.content.indexOf(kw);
                return p >= 0 ? Math.min(best, p) : best;
              }, Infinity);
              const displayText = markerPos < Infinity ? post.content.slice(0, markerPos).trimEnd() : post.content;
              const lines = displayText ? displayText.split('\n') : [];
              return lines.map((line, lIdx) => (
                <span key={lIdx} className="block">
                  {line.split(' ').map((word, wIdx) => {
                    if (word.startsWith('#')) {
                      return <span key={wIdx} className="text-blue-400 mr-1 cursor-pointer hover:underline">{word}</span>;
                    }
                    if (/^https?:\/\//.test(word)) {
                      return <a key={wIdx} href={word} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline mr-1">{word}</a>;
                    }
                    return <span key={wIdx}>{word} </span>;
                  })}
                </span>
              ));
            })()}
          </p>

          {post.hasImage && (
            <div className="relative rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] max-h-[220px]">
              <img
                src={post.imageSrc}
                alt={post.imageAlt || "ユーザーアート"}
                className="w-full h-auto object-cover max-h-[220px]"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="100%" height="100%" fill="%231a1b26"/><circle cx="160" cy="90" r="50" fill="orange" opacity="0.8"/><text x="160" y="95" fill="white" font-weight="bold" text-anchor="middle" font-size="14">うんｊレゼ</text></svg>`;
                }}
              />
              {post.hasCollabButton && (
                <button
                  onClick={openDrawing}
                  className="absolute bottom-2.5 right-2.5 bg-black/75 hover:bg-black/90 px-2.5 py-1 rounded-full text-[10px] text-[#a3e635] flex items-center space-x-1 border border-gray-800 font-bold active:scale-95 transition-all"
                >
                  <Edit3 size={11} />
                  <span>コラボ</span>
                </button>
              )}
            </div>
          )}

          {post.hasGame && (
            <div
              onClick={openGame}
              className="w-full aspect-[16/9] bg-gray-900 rounded-xl mb-3 flex items-center justify-center overflow-hidden border border-gray-800 relative group cursor-pointer transition-all shadow-inner"
            >
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=800')] bg-cover bg-center opacity-30 group-hover:opacity-40 transition-opacity"></div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
              <div className="z-10 flex flex-col items-center space-y-1">
                <div className="bg-red-600 p-3 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)] group-hover:scale-110 transition-transform">
                  <PlaySquare size={28} className="text-white ml-0.5" />
                </div>
                <span className="text-[9px] tracking-widest text-gray-400 font-bold bg-black/60 px-2 py-0.5 rounded backdrop-blur mt-1.5">TAP TO PLAY GAME</span>
              </div>
              <div className="absolute bottom-2 left-2.5 z-10 flex items-center space-x-1.5">
                <span className="font-bold text-xs bg-red-600/90 text-white px-2 py-0.5 rounded">escape_the_mushroom</span>
              </div>
            </div>
          )}

          {(() => {
            const mmlCode = extractMmlFromContent(post.content);
            if (mmlCode) return <MmlPlayer mml={mmlCode} />;
            const chordRes = extractChordsFromContent(post.content);
            if (chordRes) return <ChordPlayer chords={chordRes.chords} />;
            if (post.hasImage || post.hasGame) return null;
            const embed = extractFirstEmbed(post.content);
            return embed ? <EmbedPart embed={embed} /> : null;
          })()}

          <div className="flex justify-between items-center text-gray-500 mt-1 max-w-[280px]">
            <button
              onClick={() => onLike(post.id)}
              className={`flex items-center space-x-1 hover:text-blue-400 transition-colors ${post.liked ? 'text-blue-400 font-bold' : ''}`}
            >
              <ThumbsUp size={14} />
              <span className="text-[11px]">{post.likes || ''}</span>
            </button>

            <button
              onClick={() => onDislike(post.id)}
              className={`flex items-center space-x-1 hover:text-red-500 transition-colors ${post.disliked ? 'text-red-500 font-bold' : ''}`}
            >
              <ThumbsDown size={14} />
              <span className="text-[11px]">{post.dislikes || ''}</span>
            </button>

            <button
              onClick={() => setShowReplyInput(!showReplyInput)}
              className={`flex items-center space-x-1 hover:text-green-400 transition-colors ${showReplyInput ? 'text-green-400' : ''}`}
            >
              <MessageCircle size={14} />
              <span className="text-[11px]">{post.repliesCount || ''}</span>
            </button>

            <button
              onClick={() => onRepost(post.id)}
              className={`flex items-center space-x-1 hover:text-purple-400 transition-colors ${post.reposted ? 'text-purple-400' : ''}`}
            >
              <Repeat size={14} />
              <span className="text-[11px]">{post.reposts || ''}</span>
            </button>

            <button className="flex items-center hover:text-blue-400 transition-colors">
              <Mail size={14} />
            </button>

            <button
              onClick={() => onHeart(post.id)}
              className="flex items-center space-x-1 hover:text-pink-400 transition-colors"
            >
              <Heart size={12} className="fill-current text-pink-600/65" />
              <span className="text-[10px]">{post.heartsTotal || '0'}</span>
            </button>
          </div>

          {post.replies.length > 0 && (
            <ReplyPreview replies={post.replies} postId={post.id} />
          )}

          {showReplyInput && (
            <div className="mt-2.5 flex items-center space-x-2 bg-gray-100/5 rounded-lg px-2.5 py-1.5 border border-gray-800">
              <input
                type="text"
                placeholder="返信を書き込む..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="bg-transparent flex-1 text-xs outline-none text-gray-100 placeholder:text-gray-600"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onAddReply(post.id, replyText);
                    setReplyText('');
                    setShowReplyInput(false);
                  }
                }}
              />
              <button
                onClick={() => {
                  onAddReply(post.id, replyText);
                  setReplyText('');
                  setShowReplyInput(false);
                }}
                className="text-blue-500 hover:text-blue-400 text-xs font-bold px-1"
              >
                送信
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const AVATAR_COLORS = [
  'from-blue-400 to-indigo-500',
  'from-pink-400 to-rose-500',
  'from-green-400 to-teal-500',
  'from-orange-400 to-red-500',
  'from-purple-400 to-violet-500',
  'from-cyan-400 to-blue-500',
  'from-amber-400 to-yellow-500',
  'from-lime-400 to-green-500',
  'from-emerald-400 to-teal-500',
  'from-sky-400 to-indigo-500',
];

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function nameToInitials(name: string): string {
  return name.substring(3, 5) || '名無';
}

function ReplyPreview({ replies, postId }: { replies: Post[]; postId: number }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (replies.length < 2) return;
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % replies.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [replies.length]);

  useEffect(() => {
    setPop(true);
    const timeout = setTimeout(() => setPop(false), 350);
    return () => clearTimeout(timeout);
  }, [index]);

  const reply = replies[index];
  const maxAvatars = Math.min(replies.length, 5);
  const extraCount = replies.length - maxAvatars;

  return (
    <div
      onClick={() => router.push(`/post/${postId}`)}
      className="mt-2 pl-2.5 cursor-pointer hover:opacity-80 transition-opacity"
    >
      <div className="flex items-center gap-1.5 py-1">
        <div className="flex items-center shrink-0 -space-x-1.5">
          {replies.slice(0, maxAvatars).map((r, i) => {
            const isActive = r.id === reply.id;
            return (
              <div
                key={r.id}
                className={`w-5 h-5 rounded-full bg-gradient-to-br ${nameToColor(r.displayName)} flex items-center justify-center text-[7px] font-bold text-white shrink-0 transition-colors duration-300 ${
                  isActive
                    ? 'border-2 border-[#a3e635] ring-2 ring-[#a3e635]/40 ' + (pop ? 'animate-pop' : '')
                    : 'border border-gray-900'
                }`}
                style={{ zIndex: isActive ? maxAvatars + 1 : maxAvatars - i }}
              >
                {nameToInitials(r.displayName)}
              </div>
            );
          })}
          {extraCount > 0 && (
            <div className="w-5 h-5 rounded-full bg-gray-800 border border-gray-900 flex items-center justify-center text-[7px] text-gray-400 font-bold shrink-0">
              +{extraCount}
            </div>
          )}
        </div>
        <span key={index} className="flex items-center min-w-0 animate-fade-in-up">
          <span className="truncate text-[11px] text-gray-400">
            <span className="text-gray-300 font-bold">{reply.displayName}</span>
            <span className="text-gray-500 ml-1">{reply.content}</span>
          </span>
          <span className="text-[11px] text-gray-600 shrink-0 ml-1.5">{reply.time}</span>
        </span>
      </div>
    </div>
  );
}
