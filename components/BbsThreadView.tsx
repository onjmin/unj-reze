'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowLeft, Share2, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Post } from '@/lib/types';
import { api } from '@/lib/api';
import { ensureSessionId } from '@/lib/session';
import { getUserIdLabel } from '@/lib/avatar';
import UserActionMenu from './UserActionMenu';
import EmbedPart from './EmbedPart';
import MmlPlayer from './MmlPlayer';
import ChordPlayer from './ChordPlayer';
import { extractFirstEmbed } from '@/lib/embed';
import { extractMmlFromContent, getDisplayContent } from '@/lib/mml';
import { extractChordsFromContent } from '@/lib/chord';
import PostComposer from './PostComposer';
import GameBox from './GameBox';
import { OriginType } from '@/lib/types';

interface BbsThreadViewProps {
  post: Post;
}

function parseContent(text: string, replyMap: Map<string, number>) {
  const displayText = getDisplayContent(text);
  const lines = displayText.split('\n');
  return lines.map((line, li) => {
    const parts = line.split(/(>>[\d]+)/g);
    return (
      <span key={li} className="block">
        {parts.map((part, pi) => {
          if (/^>>\d+$/.test(part)) {
            const n = parseInt(part.slice(2));
            return (
              <a
                key={pi}
                href={`#res-${n}`}
                className="text-green-400 hover:underline"
                onClick={e => {
                  e.preventDefault();
                  document.getElementById(`res-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                {part}
              </a>
            );
          }
          if (/^https?:\/\//.test(part)) {
            return <a key={pi} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{part}</a>;
          }
          return <span key={pi}>{part}</span>;
        })}
      </span>
    );
  });
}

export default function BbsThreadView({ post: initial }: BbsThreadViewProps) {
  const router = useRouter();
  const [post, setPost] = useState<Post>(initial);
  const [replyText, setReplyText] = useState('');
  const [replyImage, setReplyImage] = useState<string | null>(null);
  const [replyMml, setReplyMml] = useState<string | null>(null);
  const [replyGameDraft, setReplyGameDraft] = useState<{ title: string } | null>(null);
  const [replyOriginType, setReplyOriginType] = useState<OriginType | undefined>(undefined);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState('名無しvFZ');
  const [userSlug, setUserSlug] = useState<string | undefined>(undefined);
  /** IDタップで開くユーザーメニュー（プロフ/ミュート/ブロック/DM/メンション）。 */
  const [selectedUser, setSelectedUser] = useState<{ displayName: string; slug?: string } | null>(null);
  const [userMenuPos, setUserMenuPos] = useState<{ x: number; y: number } | null>(null);
  const heartQueue = useRef(0);
  const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sessionId = ensureSessionId();
    api.auth.anonymous(sessionId).then(user => {
      setUserId(user.displayName);
      setUserSlug(user.slug);
    }).catch(() => {});
  }, []);

  // Build ordered list: OP as #1, then replies in order
  const allPosts: Post[] = [post, ...post.replies];
  const indexMap = new Map<string, number>(allPosts.map((p, i) => [p.id, i + 1]));

  const handleAddReply = async () => {
    if (!replyText.trim() && !replyImage && !replyMml && !replyGameDraft) return;
    if (submitting) return;
    setSubmitting(true);
    const replyNum = replyTo !== null ? `>>${replyTo}\n` : '';
    const tempId = `temp-${Date.now()}`;
    const optimisticReply: Post = {
      id: tempId,
      displayName: userId,
      createdAt: new Date().toISOString(),
      time: 'たった今',
      content: replyNum + replyText,
      likes: 0, dislikes: 0, liked: false, disliked: false,
      repliesCount: 0, reposts: 0, reposted: false,
      avatarColor: 'from-blue-500 to-indigo-600',
      heartsTotal: 0, replies: [],
      threadId: post.id,
      parentPostId: post.id,
      hasImage: !!replyImage,
      imageSrc: replyImage ?? undefined,
    };
    setPost(p => ({ ...p, replies: [...p.replies, optimisticReply], repliesCount: p.repliesCount + 1 }));
    const capturedText = replyText;
    const capturedImage = replyImage;
    setReplyText('');
    setReplyImage(null);
    setReplyMml(null);
    setReplyGameDraft(null);
    setReplyOriginType(undefined);
    setReplyTo(null);

    try {
      const reply = await api.posts.replies.create(post.id, {
        displayName: userId,
        content: replyNum + capturedText,
        parentPostId: post.id,
        hasImage: !!capturedImage,
        imageSrc: capturedImage ?? undefined,
      });
      setPost(p => ({
        ...p,
        replies: p.replies.map(r => r.id === tempId ? reply : r),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleHeart = useCallback((targetPost: Post) => {
    setPost(p => {
      if (p.id === targetPost.id) return { ...p, heartsTotal: (Number(p.heartsTotal) || 0) + 1 };
      return { ...p, replies: p.replies.map(r => r.id === targetPost.id ? { ...r, heartsTotal: (Number(r.heartsTotal) || 0) + 1 } : r) };
    });
    heartQueue.current += 1;
    if (heartTimer.current) clearTimeout(heartTimer.current);
    heartTimer.current = setTimeout(async () => {
      const count = heartQueue.current;
      heartQueue.current = 0;
      await api.posts.heart(targetPost.id, userId, count);
    }, 2000);
  }, [userId]);

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}:${sec}`;
  };

  const viewCount = 78 + post.repliesCount * 3;

  return (
    <>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800 shrink-0">
        <div className="flex items-center px-3 h-11 gap-2">
          <Link href="/" className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors flex items-center gap-1">
            <ArrowLeft size={16} className="text-gray-300" />
            <span className="text-xs text-gray-400">板トップ</span>
          </Link>
          <button className="ml-auto p-1.5 hover:bg-gray-100/10 rounded-full transition-colors text-gray-500">
            <Share2 size={15} />
          </button>
        </div>
      </div>

      {/* Thread stats bar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800/60 text-[10px] text-gray-500 shrink-0">
        <span>全 <span className="text-gray-300 font-bold">{allPosts.length}</span> レス</span>
        <span>👁 {viewCount}</span>
        <span>⏱ {post.time}{post.isEdited && ' (編集済み)'}</span>
        <span>💬 {post.repliesCount}件</span>
      </div>

      {/* Replies */}
      <div className="divide-y divide-gray-800/40">
        {allPosts.map((p, idx) => {
          const num = idx + 1;
          return (
            <div key={p.id} id={`res-${num}`} className="px-3 py-3">
              {/* Header line */}
              <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5 mb-1.5 text-[10px]">
                <span className="text-gray-500 font-bold tabular-nums w-5 text-right shrink-0">{num}</span>
                <span className="text-gray-200 font-bold">名無し</span>
                <span className="text-gray-600">：{formatDateTime(p.createdAt)}</span>
                <span className="text-gray-600">({p.time}){p.isEdited && ' (編集済み)'}</span>
                <button
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setSelectedUser({ displayName: p.displayName, slug: p.slug || undefined });
                    setUserMenuPos({ x: rect.left, y: rect.bottom });
                  }}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                  title="このIDの操作"
                >
                  ID: <span className="text-green-400 font-bold underline decoration-dotted underline-offset-2">{getUserIdLabel(p.displayName, p.slug)}</span>
                </button>
                <button
                  onClick={() => setReplyTo(num)}
                  className="ml-auto text-gray-600 hover:text-blue-400 transition-colors tabular-nums"
                  title={`>>${num} に返信`}
                >
                  返信
                </button>
              </div>

              {/* Content */}
              {replyTo === num && (
                <div className="text-[10px] text-green-400 mb-1 pl-6">&gt;&gt;{num} に返信中</div>
              )}
              <div className="pl-6 text-[13px] text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
                {parseContent(p.content, indexMap)}
              </div>

              {/* Embeds (MML / Chord / URL埋め込み) */}
              {(() => {
                const mmlCode = extractMmlFromContent(p.content);
                if (mmlCode) return <div className="pl-6 mt-2" onClick={e => e.stopPropagation()}><MmlPlayer mml={mmlCode} /></div>;
                const chordRes = extractChordsFromContent(p.content);
                if (chordRes) return <div className="pl-6 mt-2" onClick={e => e.stopPropagation()}><ChordPlayer chords={chordRes.chords} /></div>;
                const embed = extractFirstEmbed(p.content);
                return embed ? <div className="pl-6 mt-2" onClick={e => e.stopPropagation()}><EmbedPart embed={embed} /></div> : null;
              })()}

              {/* Image */}
              {p.hasImage && p.imageSrc && (
                <div className="pl-6 mt-2">
                  <div className="rounded-lg overflow-hidden border border-gray-800 inline-block max-w-full">
                    <img src={p.imageSrc} alt="" className="max-h-[200px] w-auto" />
                  </div>
                </div>
              )}

              {/* Game */}
              {p.hasGame && (
                <div className="pl-6 mt-2">
                  <GameBox
                    gameId={p.gameId || ''}
                    postId={p.id}
                    gameTitle={p.gameTitle || 'ゲーム'}
                    gameThumbnail={p.gameThumbnail}
                    userId={userId}
                  />
                </div>
              )}

              {/* Like count */}
              {(Number(p.likes) > 0 || Number(p.heartsTotal) > 0) && (
                <div className="pl-6 mt-1.5 flex items-center gap-3 text-[10px] text-gray-600">
                  {Number(p.likes) > 0 && (
                    <button
                      onClick={() => handleHeart(p)}
                      className="flex items-center gap-1 hover:text-pink-400 transition-colors"
                    >
                      <ThumbsUp size={11} />
                      <span>{p.likes}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reply composer */}
      <div className="border-t border-gray-800 mt-2">
        {replyTo !== null && (
          <div className="flex items-center justify-between px-3 pt-2 text-[10px] text-gray-500">
            <span className="text-green-400">&gt;&gt;{replyTo} に返信中</span>
            <button
              onClick={() => setReplyTo(null)}
              className="text-gray-600 hover:text-gray-400 transition-colors"
            >
              取消
            </button>
          </div>
        )}
        <PostComposer
          inline
          userId={userId}
          bbsMode="掲示板モード"
          text={replyText}
          setText={setReplyText}
          image={replyImage}
          setImage={setReplyImage}
          mml={replyMml}
          setMml={setReplyMml}
          gameDraft={replyGameDraft}
          setGameDraft={setReplyGameDraft}
          originType={replyOriginType}
          setOriginType={setReplyOriginType}
          onClose={() => {}}
          onSubmit={handleAddReply}
          onOpenDrawing={() => {}}
          onOpenDotDrawing={() => {}}
          onOpenMml={() => {}}
          onOpenGameMaker={() => {}}
        />
      </div>

      {selectedUser && (
        <UserActionMenu
          isOpen={true}
          onClose={() => setSelectedUser(null)}
          targetUserDisplayName={selectedUser.displayName}
          targetUserSlug={selectedUser.slug}
          currentUserId={userId}
          currentUserSlug={userSlug}
          onMention={(username) => setReplyText(prev => prev ? `${prev} @${username} ` : `@${username} `)}
          position={userMenuPos}
        />
      )}
    </>
  );
}
