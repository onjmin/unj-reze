'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, ThumbsUp, ThumbsDown, MessageCircle, Repeat, Mail, Heart, MoreHorizontal, Copy, UserPlus, Ban, Flag } from 'lucide-react';
import Link from 'next/link';
import { Post } from '@/lib/types';
import { extractMmlFromContent } from '@/lib/mml';
import { extractChordsFromContent } from '@/lib/chord';
import { extractFirstEmbed } from '@/lib/embed';
import MmlPlayer from './MmlPlayer';
import ChordPlayer from './ChordPlayer';
import EmbedPart from './EmbedPart';

interface PostDetailProps {
  post: Post;
  allPosts: Post[];
}

export default function PostDetail({ post: initial, allPosts: allInitial }: PostDetailProps) {
  const [post, setPost] = useState<Post>(initial);
  const [allPosts, setAllPosts] = useState<Post[]>(allInitial);
  const [replyText, setReplyText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const userId = '名無しvFZ';

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

  const setPostField = (fn: (p: Post) => Post) => setPost(fn(post));

  const handleLike = () => setPostField(p => {
    const liked = !p.liked;
    return { ...p, liked, likes: liked ? p.likes + 1 : p.likes - 1, disliked: liked ? false : p.disliked, dislikes: (liked && p.disliked) ? p.dislikes - 1 : p.dislikes };
  });

  const handleDislike = () => setPostField(p => {
    const disliked = !p.disliked;
    return { ...p, disliked, dislikes: disliked ? p.dislikes + 1 : p.dislikes - 1, liked: disliked ? false : p.liked, likes: (disliked && p.liked) ? p.likes - 1 : p.likes };
  });

  const handleRepost = () => setPostField(p => {
    const reposted = !p.reposted;
    return { ...p, reposted, reposts: reposted ? p.reposts + 1 : p.reposts - 1 };
  });

  const handleAddReply = () => {
    if (!replyText.trim()) return;
    const now = Date.now();
    setPostField(p => ({ ...p, repliesCount: p.repliesCount + 1, replies: [...p.replies, { id: now, displayName: userId, content: replyText, time: "たった今" }] }));
    setAllPosts(prev => [...prev, {
      id: now, displayName: userId, time: "たった今", content: replyText,
      likes: 0, dislikes: 0, liked: false, disliked: false,
      repliesCount: 0, reposts: 0, reposted: false,
      avatarColor: "from-blue-500 to-indigo-600",
      heartsTotal: 0, replies: [],
      replyTo: post.id,
    }]);
    setReplyText('');
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
            <div className="flex items-center space-x-1 text-gray-600">
              <Heart size={12} className="fill-current text-pink-600/65" />
              <span className="text-[10px]">{post.heartsTotal || '0'}</span>
            </div>
          </div>
        </div>
      </div>

      {(() => {
        const directReplies = allPosts.filter(p => p.replyTo === post.id);
        const hasReplies = post.replies.length > 0 || directReplies.length > 0;
        if (!hasReplies) return null;
        return (
          <div className="border-t border-gray-800 px-3 py-3 space-y-2">
            <span className="text-[11px] text-gray-500 font-bold">返信</span>
            {post.replies.map(reply => (
              <div key={reply.id} className="text-[12px] bg-gray-100/5 p-2.5 rounded-lg border border-gray-800/40">
                <div className="flex justify-between text-gray-500 mb-0.5 font-bold">
                  <span>{reply.displayName}</span>
                  <span>{reply.time}</span>
                </div>
                <p className="text-gray-300">{reply.content}</p>
              </div>
            ))}
            {directReplies.map(rp => (
              <ReplyTreeItem key={rp.id} post={rp} allPosts={allPosts} depth={0} />
            ))}
          </div>
        );
      })()}

      <div className="border-t border-gray-800 px-3 py-3 flex items-center space-x-2 bg-gray-100/5 rounded-lg mx-3 mb-4 mt-2">
        <input
          type="text"
          placeholder="返信を書き込む..."
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          className="bg-transparent flex-1 text-xs outline-none text-gray-100 placeholder:text-gray-600"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddReply(); }}
        />
        <button onClick={handleAddReply} className="text-blue-500 hover:text-blue-400 text-xs font-bold px-1">送信</button>
      </div>
    </>
  );
}

function ReplyTreeItem({ post, allPosts, depth }: { post: Post; allPosts: Post[]; depth: number }) {
  const children = allPosts.filter(p => p.replyTo === post.id);

  return (
    <div className={`text-[12px] ${depth > 0 ? 'ml-4 pl-3 border-l-2 border-gray-800/60' : ''}`}>
      <div className="bg-gray-100/5 p-2.5 rounded-lg border border-gray-800/40">
        <div className="flex justify-between text-gray-500 mb-0.5 font-bold">
          <span>{post.displayName}</span>
          <span>{post.time}</span>
        </div>
        <p className="text-gray-300 whitespace-pre-wrap">{post.content.length > 120 ? post.content.slice(0, 120) + '…' : post.content}</p>
      </div>
      {children.length > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {children.map(child => (
            <ReplyTreeItem key={child.id} post={child} allPosts={allPosts} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
