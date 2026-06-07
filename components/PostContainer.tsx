'use client';

import { useState } from 'react';
import {
  Plus, MoreHorizontal, ThumbsUp, ThumbsDown,
  MessageCircle, Repeat, Mail, Heart, Edit3, PlaySquare
} from 'lucide-react';
import { Post } from '@/lib/types';

interface PostContainerProps {
  post: Post;
  isRankingMode: boolean;
  rankIndex: number;
  rankCategory: string;
  onLike: (id: number) => void;
  onDislike: (id: number) => void;
  onRepost: (id: number) => void;
  onAddReply: (id: number, text: string) => void;
  openGame: () => void;
  openDrawing: () => void;
}

export default function PostContainer({ post, isRankingMode, rankIndex, rankCategory, onLike, onDislike, onRepost, onAddReply, openGame, openDrawing }: PostContainerProps) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');

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
        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${post.avatarColor} shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white relative`}>
          {post.name.substring(3, 5) || "名無"}
          <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5 border border-gray-800">
            <Plus size={8} className="text-gray-400" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-0.5">
            <div className="flex items-baseline space-x-1.5">
              <span className="font-bold text-xs text-gray-200">{post.name}</span>
              <span className="text-gray-500 text-[10px] font-medium">{post.time}</span>
            </div>
            <MoreHorizontal size={14} className="text-gray-500 hover:text-gray-300 cursor-pointer" />
          </div>

          <p className="text-[13px] text-gray-200 whitespace-pre-wrap leading-relaxed mb-2.5">
            {post.content.split('\n').map((line, lIdx) => (
              <span key={lIdx} className="block">
                {line.split(' ').map((word, wIdx) => {
                  if (word.startsWith('#')) {
                    return <span key={wIdx} className="text-blue-400 mr-1 cursor-pointer hover:underline">{word}</span>;
                  }
                  return <span key={wIdx}>{word} </span>;
                })}
              </span>
            ))}
          </p>

          {post.hasImage && (
            <div className="relative rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] max-h-[220px]">
              <img
                src={post.imageSrc}
                alt={post.imageAlt || "ユーザーアート"}
                className="w-full h-auto object-cover max-h-[220px]"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="100%" height="100%" fill="%231a1b26"/><circle cx="160" cy="90" r="50" fill="orange" opacity="0.8"/><text x="160" y="95" fill="white" font-weight="bold" text-anchor="middle" font-size="14">ねるネルねるね</text></svg>`;
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

            <div className="flex items-center space-x-1 text-gray-600">
              <Heart size={12} className="fill-current text-pink-600/65" />
              <span className="text-[10px]">{post.heartsTotal || '0'}</span>
            </div>
          </div>

          {post.replies.length > 0 && (
            <div className="mt-2 pl-2.5 border-l-2 border-gray-800 space-y-1.5">
              {post.replies.map(reply => (
                <div key={reply.id} className="text-[11px] bg-gray-100/5 p-2 rounded-lg border border-gray-800/40">
                  <div className="flex justify-between text-gray-500 mb-0.5 font-bold">
                    <span>{reply.name}</span>
                    <span>{reply.time}</span>
                  </div>
                  <p className="text-gray-300">{reply.content}</p>
                </div>
              ))}
            </div>
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
