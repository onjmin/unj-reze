'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Plus, MoreHorizontal, ThumbsUp, ThumbsDown,
  MessageCircle, Repeat, Mail, Heart, Edit3, PlaySquare, Copy, UserPlus, Ban, Flag, VolumeX, Pencil, Trash2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Post, OriginType, ORIGIN_TYPE_OPTIONS, POST_BODY_COLLAPSE_LINES } from '@/lib/types';
import { api } from '@/lib/api';
import { getAvatarInfo } from '@/lib/avatar';
import { extractMmlFromContent, getDisplayContent } from '@/lib/mml';
import { extractChordsFromContent } from '@/lib/chord';
import { extractFirstEmbed } from '@/lib/embed';
import dynamic from 'next/dynamic';
import ChordPlayer from './ChordPlayer';
import EmbedPart from './EmbedPart';
import EditPostModal from './EditPostModal';
import DeletePostModal from './DeletePostModal';
import OriginTypeModal from './OriginTypeModal';
import UserActionMenu from './UserActionMenu';

const MmlPlayer = dynamic(() => import('./MmlPlayer'), { ssr: false });

interface PostContainerProps {
  post: Post;
  isRankingMode: boolean;
  rankIndex: number;
  rankCategory: string;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onRepost: (id: string) => void;
  onHeart: (id: string) => void;
  onAddReply: (id: string, text: string) => void;
  onQuickPost: (text?: string) => void;
  openGame: (gameId?: string, postId?: string) => void;
  openCollab: (post: Post) => void;
  openMml: () => void;
  currentUserSlug?: string;
  currentUserDisplayName?: string;
  onModerationChange?: () => void;
  onReplyClick?: (post: Post) => void;
  onEditImage?: (post: Post) => void;
  onEditMml?: (post: Post) => void;
  onEditPost?: (post: Post) => void;
}

export default function PostContainer({ post, isRankingMode, rankIndex, rankCategory, onLike, onDislike, onRepost, onHeart, onAddReply, onQuickPost, openGame, openCollab, openMml, currentUserSlug, currentUserDisplayName, onModerationChange, onReplyClick, onEditImage, onEditMml, onEditPost }: PostContainerProps) {
  const router = useRouter();
  const avatarInfo = getAvatarInfo(post.displayName);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showOriginModal, setShowOriginModal] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [avatarMenuPos, setAvatarMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const targetSlug = post.slug || post.displayName;
  const isSelf = !!currentUserSlug && currentUserSlug === targetSlug;

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

  const handleMenuBlock = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!currentUserSlug) return;
    try {
      if (blocked) {
        await api.block.unblock(currentUserSlug, targetSlug);
        setBlocked(false);
      } else {
        await api.block.block(currentUserSlug, targetSlug);
        setBlocked(true);
      }
      onModerationChange?.();
    } catch { /* レートリミット等は無視 */ }
  }, [currentUserSlug, targetSlug, blocked, onModerationChange]);

  const handleMenuMute = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!currentUserSlug) return;
    try {
      if (muted) {
        await api.mute.unmute(currentUserSlug, targetSlug);
        setMuted(false);
      } else {
        await api.mute.mute(currentUserSlug, targetSlug);
        setMuted(true);
      }
      onModerationChange?.();
    } catch { /* noop */ }
  }, [currentUserSlug, targetSlug, muted, onModerationChange]);

  const handleMenuReport = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    const reason = typeof window !== 'undefined' ? (window.prompt('通報理由を入力してください（任意）') ?? '') : '';
    try {
      await api.report.create({
        reporterSlug: currentUserSlug || '名無し',
        targetType: 'post',
        targetId: String(post.id),
        reason,
      });
      if (typeof window !== 'undefined') window.alert('通報を受け付けました。');
    } catch { /* noop */ }
  }, [currentUserSlug, post.id]);

  const handleMenuEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!currentUserSlug) return;
    if (onEditPost) {
      onEditPost(post);
    } else {
      setShowEditModal(true);
    }
  }, [currentUserSlug, onEditPost, post]);

  const handleSaveEdit = useCallback(async (next: string, nextImageSrc?: string | null) => {
    setShowEditModal(false);
    if (!currentUserDisplayName) return;
    try {
      await api.posts.edit(post.id, currentUserDisplayName, next, post.originType, nextImageSrc === null ? '' : nextImageSrc);
      onModerationChange?.();
      // /post/[id] はサーバーコンポーネントでDBから直接取得するため、
      // 編集直後に開いても本文が古いまま残らないようRouterキャッシュを破棄する
      router.refresh();
    } catch { /* noop */ }
  }, [currentUserDisplayName, post.id, post.originType, onModerationChange, router]);

  const handleMenuOriginType = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!currentUserSlug) return;
    setShowOriginModal(true);
  }, [currentUserSlug]);

  const handleSelectOriginType = useCallback(async (value: OriginType | undefined) => {
    setShowOriginModal(false);
    if (!currentUserDisplayName) return;
    try {
      await api.posts.edit(post.id, currentUserDisplayName, post.content, value ?? null);
      onModerationChange?.();
    } catch { /* noop */ }
  }, [currentUserDisplayName, post.id, post.content, onModerationChange]);

  const handleMenuDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!currentUserSlug) return;
    setShowDeleteModal(true);
  }, [currentUserSlug]);

  const handleConfirmDelete = useCallback(async () => {
    setShowDeleteModal(false);
    if (!currentUserSlug) return;
    try {
      await api.posts.remove(post.id, currentUserSlug);
      onModerationChange?.();
    } catch { /* noop */ }
  }, [currentUserSlug, post.id, onModerationChange]);

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
    try { sessionStorage.setItem(`unj_post_${post.id}`, JSON.stringify(post)); } catch {}
    router.push(`/post/${post.id}`);
  }, [router, post.id, post]);

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
          onClick={(e) => {
            e.stopPropagation();
            if (isSelf) {
              router.push(`/user/${post.slug || post.displayName}`);
            } else {
              const rect = e.currentTarget.getBoundingClientRect();
              setAvatarMenuPos({ x: rect.left + window.scrollX, y: rect.bottom + window.scrollY });
              setUserMenuOpen(true);
            }
          }}
          className="w-9 h-9 rounded-full shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white relative cursor-pointer hover:opacity-80 transition-opacity"
          style={post.avatarUrl ? undefined : avatarInfo.style}
        >
          {post.avatarUrl ? (
            <img src={post.avatarUrl} alt={avatarInfo.username} className="w-full h-full object-cover rounded-full" />
          ) : (
            (() => {
              const AvatarIcon = avatarInfo.Icon;
              return <AvatarIcon className="w-5 h-5 text-white/40 leading-none" />;
            })()
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onQuickPost(); }}
            className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5 border border-gray-800 hover:bg-blue-600 transition-colors cursor-pointer"
          >
            <Plus size={8} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-0.5">
            <div className="flex items-baseline space-x-1.5">
              <span className="font-bold text-xs text-gray-200">{avatarInfo.username}</span>
              {isSelf && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40">自分</span>
              )}
              {(() => {
                const opt = ORIGIN_TYPE_OPTIONS.find(o => o.value === post.originType);
                return opt ? (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${opt.badgeClass}`}>{opt.label}</span>
                ) : null;
              })()}
              {post.isFalseDeclaration && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40">虚偽申告</span>
              )}
              <span className="text-gray-500 text-[10px] font-medium">
                {post.time}
                {post.isEdited && <span className="ml-1 text-[9px] text-gray-500/70">(編集済み)</span>}
              </span>
            </div>
            <div ref={menuRef} className="relative">
              <button onClick={toggleMenu} className="p-2 -mr-2 -mt-1 rounded hover:bg-gray-100/10 transition-colors">
                <MoreHorizontal size={16} className="text-gray-500 hover:text-gray-300" />
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
                  {isSelf && (
                    <button role="menuitem" onClick={handleMenuEdit} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                      <Pencil size={12} className="shrink-0" />
                      <span>ポストを編集</span>
                    </button>
                  )}
                  {isSelf && (
                    <button role="menuitem" onClick={handleMenuOriginType} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                      <Pencil size={12} className="shrink-0" />
                      <span>権利表記を設定</span>
                    </button>
                  )}
                  {isSelf && (
                    <button role="menuitem" onClick={handleMenuDelete} className="flex items-center gap-2.5 w-full px-3 py-2 text-red-400 hover:bg-gray-100/10 text-left transition-colors">
                      <Trash2 size={12} className="shrink-0" />
                      <span>ポストを削除</span>
                    </button>
                  )}
                  {!isSelf && (
                    <button role="menuitem" onClick={handleMenuFollow} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                      <UserPlus size={12} className="shrink-0" />
                      <span>{following ? 'フォロー中' : `${post.displayName}さんをフォロー`}</span>
                    </button>
                  )}
                  {!isSelf && (
                    <button role="menuitem" onClick={handleMenuMute} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                      <VolumeX size={12} className="shrink-0" />
                      <span>{muted ? 'ミュート中' : `${post.displayName}さんをミュート`}</span>
                    </button>
                  )}
                  {!isSelf && (
                    <button role="menuitem" onClick={handleMenuBlock} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                      <Ban size={12} className="shrink-0" />
                      <span>{blocked ? 'ブロック中' : `${post.displayName}さんをブロック`}</span>
                    </button>
                  )}
                  {!isSelf && <div className="border-t border-gray-800 my-1" />}
                  {!isSelf && (
                    <button role="menuitem" onClick={handleMenuReport} className="flex items-center gap-2.5 w-full px-3 py-2 text-red-400 hover:bg-gray-100/10 text-left transition-colors">
                      <Flag size={12} className="shrink-0" />
                      <span>ポストを通報</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <p
            onClick={handlePostClick}
            className="text-[13px] text-gray-200 whitespace-pre-wrap leading-relaxed mb-2.5 cursor-pointer hover:text-white transition-colors"
          >
            {(() => {
              const displayText = getDisplayContent(post.content);
              const allLines = displayText ? displayText.split('\n') : [];
              const isOverflowing = allLines.length > POST_BODY_COLLAPSE_LINES;
              const lines = isOverflowing && !bodyExpanded ? allLines.slice(0, POST_BODY_COLLAPSE_LINES) : allLines;
              return lines.map((line, lIdx) => (
                <span key={lIdx} className="block">
                  {line.split(' ').map((word, wIdx) => {
                    if (word.startsWith('#') && word.length > 1) {
                      return (
                        <span
                          key={wIdx}
                          className="text-blue-400 mr-1 cursor-pointer hover:underline"
                          onClick={(e) => { e.stopPropagation(); router.push(`/hashtag/${encodeURIComponent(word.slice(1))}`); }}
                        >
                          {word}
                        </span>
                      );
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

          {(() => {
            const displayText = getDisplayContent(post.content);
            const allLines = displayText ? displayText.split('\n') : [];
            if (allLines.length <= POST_BODY_COLLAPSE_LINES) return null;
            return (
              <button
                onClick={(e) => { e.stopPropagation(); setBodyExpanded(v => !v); }}
                className="text-[11px] text-blue-400 hover:underline mb-2.5 -mt-1.5 block"
              >
                {bodyExpanded ? '折りたたむ' : '続きを読む'}
              </button>
            );
          })()}

          {post.hasImage && (
            <div
              onClick={handlePostClick}
              className="relative rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] cursor-pointer"
            >
              <img
                src={post.imageSrc}
                alt={post.imageAlt || "ユーザーアート"}
                className="max-w-full h-auto max-h-[220px] block mx-auto"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="100%" height="100%" fill="%231a1b26"/><circle cx="160" cy="90" r="50" fill="orange" opacity="0.8"/><text x="160" y="95" fill="white" font-weight="bold" text-anchor="middle" font-size="14">うんｊレゼ</text></svg>`;
                }}
              />
              {post.hasCollabButton && (
                <button
                  onClick={() => openCollab(post)}
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
              onClick={() => openGame(post.gameId, post.id)}
              className="w-full aspect-[16/9] bg-gray-900 rounded-xl mb-3 flex items-center justify-center overflow-hidden border border-gray-800 relative group cursor-pointer transition-all shadow-inner"
            >
              {post.gameThumbnail && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-30 group-hover:opacity-40 transition-opacity"
                  style={{ backgroundImage: `url('${post.gameThumbnail}')` }}
                ></div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
              <div className="z-10 flex flex-col items-center space-y-1">
                <div className="bg-red-600 p-3 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)] group-hover:scale-110 transition-transform">
                  <PlaySquare size={28} className="text-white ml-0.5" />
                </div>
                <span className="text-[9px] tracking-widest text-gray-400 font-bold bg-black/60 px-2 py-0.5 rounded backdrop-blur mt-1.5">TAP TO PLAY GAME</span>
              </div>
              <div className="absolute bottom-2 left-2.5 z-10 flex items-center space-x-1.5">
                <span className="font-bold text-xs bg-red-600/90 text-white px-2 py-0.5 rounded">{post.gameTitle || 'ゲーム'}</span>
              </div>
            </div>
          )}

          {(() => {
            const mmlCode = extractMmlFromContent(post.content);
            if (mmlCode) return <div onClick={e => e.stopPropagation()}><MmlPlayer mml={mmlCode} /></div>;
            const chordRes = extractChordsFromContent(post.content);
            if (chordRes) return <div onClick={e => e.stopPropagation()}><ChordPlayer chords={chordRes.chords} /></div>;
            if (post.hasImage || post.hasGame) return null;
            const embed = extractFirstEmbed(post.content);
            return embed ? <div onClick={e => e.stopPropagation()}><EmbedPart embed={embed} /></div> : null;
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
              onClick={() => {
                if (onReplyClick) {
                  onReplyClick(post);
                } else {
                  setShowReplyInput(!showReplyInput);
                }
              }}
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

      {showEditModal && (
        <EditPostModal
          initialContent={post.content}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveEdit}
          imageSrc={post.imageSrc}
          onEditImage={() => {
            onEditImage?.(post);
            setShowEditModal(false);
          }}
          onEditMml={() => {
            onEditMml?.(post);
            setShowEditModal(false);
          }}
          hasGame={post.hasGame}
          gameTitle={post.gameTitle}
          onEditGame={() => {
            openGame(post.gameId, post.id);
            setShowEditModal(false);
          }}
        />
      )}
      {showDeleteModal && (
        <DeletePostModal
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
      {showOriginModal && (
        <OriginTypeModal
          value={post.originType}
          onClose={() => setShowOriginModal(false)}
          onSelect={handleSelectOriginType}
        />
      )}
      <UserActionMenu
        isOpen={userMenuOpen}
        onClose={() => setUserMenuOpen(false)}
        targetUserDisplayName={post.displayName}
        targetUserSlug={post.slug || undefined}
        currentUserId={currentUserDisplayName}
        currentUserSlug={currentUserSlug}
        onMention={(username) => {
          onQuickPost(`@${username}`);
        }}
        position={avatarMenuPos}
      />
    </div>
  );
}

function ReplyPreview({ replies, postId }: { replies: Post[]; postId: string }) {
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

  const uniqueReplies = Array.from(
    replies.reduce((map, r) => {
      map.set(r.slug || r.displayName, r);
      return map;
    }, new Map<string, Post>()).values()
  );
  const maxAvatars = Math.min(uniqueReplies.length, 5);
  const extraCount = replies.length - maxAvatars;

  const activeAvatarInfo = getAvatarInfo(reply?.displayName);

  return (
    <div
      onClick={() => router.push(`/post/${postId}`)}
      className="mt-2 pl-2.5 cursor-pointer hover:opacity-80 transition-opacity"
    >
      <div className="flex items-center gap-1.5 py-1">
        <div className="flex items-center shrink-0 -space-x-1.5">
          {replies.slice(0, maxAvatars).map((r, i) => {
            const isActive = r.id === reply?.id;
            const rAvatarInfo = getAvatarInfo(r.displayName);
            return (
              <div
                key={r.id}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0 transition-colors duration-300 relative overflow-hidden ${isActive
                  ? 'border-2 border-[#a3e635] ring-2 ring-[#a3e635]/40 ' + (pop ? 'animate-pop' : '')
                  : 'border border-gray-900'
                  }`}
                style={{ zIndex: isActive ? maxAvatars + 1 : maxAvatars - i, ...(r.avatarUrl ? {} : rAvatarInfo.style) }}
              >
                {r.avatarUrl ? (
                  <img src={r.avatarUrl} alt={rAvatarInfo.username} className="w-full h-full object-cover rounded-full" />
                ) : (
                  (() => {
                    const RAvatarIcon = rAvatarInfo.Icon;
                    return <RAvatarIcon className="w-3 h-3 text-white/40 leading-none" />;
                  })()
                )}
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
            <span className="text-gray-300 font-bold">{activeAvatarInfo.username}</span>
            <span className="text-gray-500 ml-1">{reply?.content}</span>
          </span>
          <span className="text-[11px] text-gray-600 shrink-0 ml-1.5">{reply?.time}</span>
        </span>
      </div>
    </div>
  );
}
