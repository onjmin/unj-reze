'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, ThumbsUp, ThumbsDown, MessageCircle, Repeat, Mail, Heart, MoreHorizontal, Copy, UserPlus, Ban, Flag } from 'lucide-react';
import Link from 'next/link';
import { Post } from '@/lib/types';
import { api } from '@/lib/api';
import { extractMmlFromContent } from '@/lib/mml';
import { extractChordsFromContent } from '@/lib/chord';
import { extractFirstEmbed } from '@/lib/embed';
import MmlPlayer from './MmlPlayer';
import ChordPlayer from './ChordPlayer';
import EmbedPart from './EmbedPart';

interface PostDetailProps {
  post: Post;
}

export default function PostDetail({ post: initial }: PostDetailProps) {
  const [post, setPost] = useState<Post>(initial);
  const [replyText, setReplyText] = useState('');
  const [replyTo, setReplyTo] = useState<Post | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const userId = '名無しvFZ';
  const heartQueue = useRef(0);
  const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const likeParity = useRef(0);
  const likeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dislikeParity = useRef(0);
  const dislikeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(v => !v);
  };

  const handleMenuCopy = () => {
    navigator.clipboard.writeText(post.content);
    setMenuOpen(false);
  };

  const handleMenuFollow = () => {
    setFollowing(v => !v);
    setMenuOpen(false);
  };

  const handleMenuBlock = () => {
    setBlocked(v => !v);
    setMenuOpen(false);
  };

  const handleMenuReport = () => {
    setMenuOpen(false);
  };

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

  const handleLike = useCallback(() => {
    const postId = post.id;
    setPost(p => ({
      ...p, liked: !p.liked,
      likes: Math.max(0, p.liked ? p.likes - 1 : p.likes + 1),
      disliked: p.liked ? p.disliked : false,
      dislikes: p.liked ? p.dislikes : (p.disliked ? Math.max(0, p.dislikes - 1) : p.dislikes),
    }));
    likeParity.current += 1;
    if (likeTimer.current) clearTimeout(likeTimer.current);
    likeTimer.current = setTimeout(async () => {
      if (likeParity.current % 2 === 0) { likeParity.current = 0; return; }
      likeParity.current = 0;
      const updated = await api.posts.like(postId, userId);
      setPost(updated);
    }, 2000);
  }, [post.id, userId]);

  const handleDislike = useCallback(() => {
    const postId = post.id;
    setPost(p => ({
      ...p, disliked: !p.disliked,
      dislikes: Math.max(0, p.disliked ? p.dislikes - 1 : p.dislikes + 1),
      liked: p.disliked ? p.liked : false,
      likes: p.disliked ? p.likes : (p.liked ? Math.max(0, p.likes - 1) : p.likes),
    }));
    dislikeParity.current += 1;
    if (dislikeTimer.current) clearTimeout(dislikeTimer.current);
    dislikeTimer.current = setTimeout(async () => {
      if (dislikeParity.current % 2 === 0) { dislikeParity.current = 0; return; }
      dislikeParity.current = 0;
      const updated = await api.posts.dislike(postId, userId);
      setPost(updated);
    }, 2000);
  }, [post.id, userId]);

  const handleRepost = useCallback(async () => {
    setPost(p => ({
      ...p, reposted: !p.reposted,
      reposts: Math.max(0, p.reposted ? p.reposts - 1 : p.reposts + 1),
    }));
    const updated = await api.posts.repost(post.id);
    setPost(updated);
  }, [post.id]);

  const handleHeart = useCallback(() => {
    const postId = post.id;
    setPost(p => ({ ...p, heartsTotal: (Number(p.heartsTotal) || 0) + 1 }));
    heartQueue.current += 1;
    if (heartTimer.current) clearTimeout(heartTimer.current);
    heartTimer.current = setTimeout(async () => {
      const count = heartQueue.current;
      heartQueue.current = 0;
      const updated = await api.posts.heart(postId, userId, count);
      setPost(updated);
    }, 2000);
  }, [post.id, userId]);

  const handleAddReply = () => {
    if (!replyText.trim()) return;
    const now = Date.now();
    const targetParent = replyTo ?? post;
    const newReply: Post = {
      id: now, displayName: userId, createdAt: new Date(now).toISOString(), time: "たった今", content: replyText,
      likes: 0, dislikes: 0, liked: false, disliked: false,
      repliesCount: 0, reposts: 0, reposted: false,
      avatarColor: "from-blue-500 to-indigo-600",
      heartsTotal: 0, replies: [],
      threadId: post.threadId === post.id ? post.id : post.threadId,
      parentPostId: targetParent.id,
    };
    setPost(p => ({ ...p, replies: [...p.replies, newReply], repliesCount: p.repliesCount + 1 }));
    setReplyText('');
    setReplyTo(null);
  };

  const mmlCode = extractMmlFromContent(post.content);
  const chordRes = extractChordsFromContent(post.content);

  return (
    <>
      <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center px-3 h-11">
          <Link href="/" className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors">
            <ArrowLeft size={18} className="text-gray-300" />
          </Link>
          <span className="ml-3 font-bold text-sm text-gray-200">投稿</span>
          <div ref={menuRef} className="relative ml-auto">
            <button onClick={toggleMenu} className="p-1.5 rounded hover:bg-gray-100/10 transition-colors">
              <MoreHorizontal size={16} className="text-gray-400" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-8 z-50 w-48 rounded-lg border border-gray-700 bg-[#131720] shadow-xl py-1 text-xs"
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
      </div>

      <div className="flex p-3 space-x-2.5">
        <Link
          href={`/user/${post.slug || post.displayName}`}
          className={`w-9 h-9 rounded-full bg-gradient-to-br ${post.avatarColor} shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white hover:opacity-80 transition-opacity`}
        >
          {post.displayName.substring(3, 5) || "名無"}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline space-x-1.5 mb-0.5">
            <span className="font-bold text-xs text-gray-200">{post.displayName}</span>
            <span className="text-gray-500 text-[10px] font-medium">{post.time}</span>
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
                  {line.split(' ').map((word, wIdx) => (
                    word.startsWith('#')
                      ? <span key={wIdx} className="text-blue-400 mr-1">{word}</span>
                      : /^https?:\/\//.test(word)
                        ? <a key={wIdx} href={word} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline mr-1">{word}</a>
                        : <span key={wIdx}>{word} </span>
                  ))}
                </span>
              ));
            })()}
          </p>

          {post.hasImage && (
            <div className="rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] max-h-[220px]">
              <img src={post.imageSrc} alt={post.imageAlt || "ユーザーアート"} className="w-full h-auto object-cover max-h-[220px]" />
            </div>
          )}

          {(() => {
            if (mmlCode) return <MmlPlayer mml={mmlCode} />;
            if (chordRes) return <ChordPlayer chords={chordRes.chords} />;
            if (post.hasImage) return null;
            const embed = extractFirstEmbed(post.content);
            return embed ? <EmbedPart embed={embed} /> : null;
          })()}

          <div className="flex justify-between items-center text-gray-500 mt-2 max-w-[280px]">
            <button onClick={handleLike} className={`flex items-center space-x-1 hover:text-blue-400 transition-colors ${post.liked ? 'text-blue-400 font-bold' : ''}`}>
              <ThumbsUp size={14} /><span className="text-[11px]">{post.likes || ''}</span>
            </button>
            <button onClick={handleDislike} className={`flex items-center space-x-1 hover:text-red-500 transition-colors ${post.disliked ? 'text-red-500 font-bold' : ''}`}>
              <ThumbsDown size={14} /><span className="text-[11px]">{post.dislikes || ''}</span>
            </button>
            <button className="flex items-center space-x-1 hover:text-green-400 transition-colors">
              <MessageCircle size={14} /><span className="text-[11px]">{post.repliesCount || ''}</span>
            </button>
            <button onClick={handleRepost} className={`flex items-center space-x-1 hover:text-purple-400 transition-colors ${post.reposted ? 'text-purple-400' : ''}`}>
              <Repeat size={14} /><span className="text-[11px]">{post.reposts || ''}</span>
            </button>
            <button className="flex items-center hover:text-blue-400 transition-colors">
              <Mail size={14} />
            </button>
            <button onClick={handleHeart} className="flex items-center space-x-1 hover:text-pink-400 transition-colors">
              <Heart size={12} className="fill-current text-pink-600/65" />
              <span className="text-[10px]">{post.heartsTotal || '0'}</span>
            </button>
          </div>
        </div>
      </div>

      {post.replies.length > 0 && (
        <div className="border-t border-gray-800 px-3 py-3 space-y-2">
          <span className="text-[11px] text-gray-500 font-bold">返信</span>
          {post.replies.filter(r => r.parentPostId === post.id).map(reply => (
            <ReplyTreeItem key={reply.id} post={reply} replies={post.replies} depth={0} onReply={setReplyTo} />
          ))}
        </div>
      )}

      <div className="border-t border-gray-800 px-3 pt-1 pb-3 space-y-1 mx-3 mb-4 mt-2">
        {replyTo && (
          <div className="flex items-center justify-between text-[10px] text-gray-500 px-1">
            <span><span className="text-blue-400">@{replyTo.displayName}</span> に返信</span>
            <button onClick={() => setReplyTo(null)} className="text-gray-600 hover:text-gray-400">取消</button>
          </div>
        )}
        <div className="flex items-center space-x-2 bg-gray-100/5 rounded-lg px-3 py-2">
          <input
            type="text"
            placeholder={replyTo ? `@${replyTo.displayName} に返信...` : "返信を書き込む..."}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="bg-transparent flex-1 text-xs outline-none text-gray-100 placeholder:text-gray-600"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddReply(); }}
          />
          <button onClick={handleAddReply} className="text-blue-500 hover:text-blue-400 text-xs font-bold px-1">送信</button>
        </div>
      </div>
    </>
  );
}

function ReplyTreeItem({ post, replies, depth, onReply }: { post: Post; replies: Post[]; depth: number; onReply: (post: Post) => void }) {
  const children = replies.filter(r => r.parentPostId === post.id);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [localPost, setLocalPost] = useState<Post>(post);
  const userId = '名無しvFZ';

  const handleLike = useCallback(() => {
    const id = localPost.id;
    setLocalPost(p => ({
      ...p, liked: !p.liked,
      likes: Math.max(0, p.liked ? p.likes - 1 : p.likes + 1),
      disliked: p.liked ? p.disliked : false,
      dislikes: p.liked ? p.dislikes : (p.disliked ? Math.max(0, p.dislikes - 1) : p.dislikes),
    }));
    api.posts.like(id, userId).then(setLocalPost);
  }, [localPost.id, userId]);

  const handleDislike = useCallback(() => {
    const id = localPost.id;
    setLocalPost(p => ({
      ...p, disliked: !p.disliked,
      dislikes: Math.max(0, p.disliked ? p.dislikes - 1 : p.dislikes + 1),
      liked: p.disliked ? p.liked : false,
      likes: p.disliked ? p.likes : (p.liked ? Math.max(0, p.likes - 1) : p.likes),
    }));
    api.posts.dislike(id, userId).then(setLocalPost);
  }, [localPost.id, userId]);

  const handleRepost = useCallback(async () => {
    setLocalPost(p => ({
      ...p, reposted: !p.reposted,
      reposts: Math.max(0, p.reposted ? p.reposts - 1 : p.reposts + 1),
    }));
    const updated = await api.posts.repost(localPost.id);
    setLocalPost(updated);
  }, [localPost.id]);

  const handleHeart = useCallback(() => {
    const id = localPost.id;
    setLocalPost(p => ({ ...p, heartsTotal: (Number(p.heartsTotal) || 0) + 1 }));
    api.posts.heart(id, userId, 1).then(setLocalPost);
  }, [localPost.id, userId]);

  const mmlCode = extractMmlFromContent(localPost.content);
  const chordRes = extractChordsFromContent(localPost.content);

  return (
    <div style={{ marginLeft: depth * 12 }} className={depth > 0 ? 'pl-3 border-l-2 border-gray-800/40' : ''}>
      <div className="flex p-3 space-x-2.5">
        <Link
          href={`/user/${localPost.slug || localPost.displayName}`}
          className={`w-9 h-9 rounded-full bg-gradient-to-br ${localPost.avatarColor} shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white hover:opacity-80 transition-opacity`}
        >
          {localPost.displayName.substring(3, 5) || "名無"}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline space-x-1.5 mb-0.5">
            <span className="font-bold text-xs text-gray-200">{localPost.displayName}</span>
            <span className="text-gray-500 text-[10px] font-medium">{localPost.time}</span>
          </div>

          <p className="text-[13px] text-gray-200 whitespace-pre-wrap leading-relaxed mb-2.5">
            {(() => {
              const markers = ['#mml', '#chord',];
              const markerPos = markers.reduce((best, kw) => {
                const p = localPost.content.indexOf(kw);
                return p >= 0 ? Math.min(best, p) : best;
              }, Infinity);
              const displayText = markerPos < Infinity ? localPost.content.slice(0, markerPos).trimEnd() : localPost.content;
              const lines = displayText ? displayText.split('\n') : [];
              return lines.map((line, lIdx) => (
                <span key={lIdx} className="block">
                  {line.split(' ').map((word, wIdx) => (
                    word.startsWith('#')
                      ? <span key={wIdx} className="text-blue-400 mr-1">{word}</span>
                      : /^https?:\/\//.test(word)
                        ? <a key={wIdx} href={word} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline mr-1">{word}</a>
                        : <span key={wIdx}>{word} </span>
                  ))}
                </span>
              ));
            })()}
          </p>

          {localPost.hasImage && (
            <div className="rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] max-h-[220px]">
              <img src={localPost.imageSrc} alt={localPost.imageAlt || "ユーザーアート"} className="w-full h-auto object-cover max-h-[220px]" />
            </div>
          )}

          {(() => {
            if (mmlCode) return <MmlPlayer mml={mmlCode} />;
            if (chordRes) return <ChordPlayer chords={chordRes.chords} />;
            if (localPost.hasImage) return null;
            const embed = extractFirstEmbed(localPost.content);
            return embed ? <EmbedPart embed={embed} /> : null;
          })()}

          <div className="flex justify-between items-center text-gray-500 mt-2 max-w-[280px]">
            <button onClick={handleLike} className={`flex items-center space-x-1 hover:text-blue-400 transition-colors ${localPost.liked ? 'text-blue-400 font-bold' : ''}`}>
              <ThumbsUp size={14} /><span className="text-[11px]">{localPost.likes || ''}</span>
            </button>
            <button onClick={handleDislike} className={`flex items-center space-x-1 hover:text-red-500 transition-colors ${localPost.disliked ? 'text-red-500 font-bold' : ''}`}>
              <ThumbsDown size={14} /><span className="text-[11px]">{localPost.dislikes || ''}</span>
            </button>
            <button className="flex items-center space-x-1 hover:text-green-400 transition-colors">
              <MessageCircle size={14} /><span className="text-[11px]">{localPost.repliesCount || ''}</span>
            </button>
            <button onClick={handleRepost} className={`flex items-center space-x-1 hover:text-purple-400 transition-colors ${localPost.reposted ? 'text-purple-400' : ''}`}>
              <Repeat size={14} /><span className="text-[11px]">{localPost.reposts || ''}</span>
            </button>
            <button className="flex items-center hover:text-blue-400 transition-colors">
              <Mail size={14} />
            </button>
            <button onClick={handleHeart} className="flex items-center space-x-1 hover:text-pink-400 transition-colors">
              <Heart size={12} className="fill-current text-pink-600/65" />
              <span className="text-[10px]">{localPost.heartsTotal || '0'}</span>
            </button>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <button onClick={() => onReply(localPost)} className="text-[10px] text-gray-600 hover:text-blue-400 transition-colors">返信</button>
            {children.length > 0 && (
              <button onClick={() => setCollapsed(v => !v)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
                {collapsed ? `▸ ${children.length}件` : `▾ 折り畳む`}
              </button>
            )}
          </div>
        </div>
      </div>
      {!collapsed && children.length > 0 && (
        <div>
          {children.map(child => (
            <ReplyTreeItem key={child.id} post={child} replies={replies} depth={depth + 1} onReply={onReply} />
          ))}
        </div>
      )}
    </div>
  );
}
