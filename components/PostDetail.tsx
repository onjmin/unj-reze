'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import BbsThreadView from './BbsThreadView';
import { ArrowLeft, ThumbsUp, ThumbsDown, MessageCircle, Repeat, Mail, Heart, MoreHorizontal, Copy, UserPlus, Ban, Flag, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Post, ORIGIN_TYPE_OPTIONS, POST_BODY_COLLAPSE_LINES, OriginType } from '@/lib/types';
import { api } from '@/lib/api';
import { ensureSessionId } from '@/lib/session';
import { showToast } from '@/lib/toast';
import { getAvatarInfo } from '@/lib/avatar';
import { cachePost } from '@/lib/post-cache';
import { extractMmlFromContent, getDisplayContent, stripMmlLine } from '@/lib/mml';
import { extractChordsFromContent } from '@/lib/chord';
import { extractFirstEmbed } from '@/lib/embed';
import dynamic from 'next/dynamic';
import ChordPlayer from './ChordPlayer';
import EmbedPart from './EmbedPart';
import GameBox from './GameBox';

const MmlPlayer = dynamic(() => import('./MmlPlayer'), { ssr: false });
const DrawingEditor = dynamic(() => import('./DrawingEditor'), { ssr: false });
const DotDrawingEditor = dynamic(() => import('./DotDrawingEditor'), { ssr: false });
const MmlEditor = dynamic(() => import('./MmlEditor'), { ssr: false });
const GameMaker = dynamic(() => import('./GameMaker'), { ssr: false });
const PostComposer = dynamic(() => import('./PostComposer'), { ssr: false });
const EditPostModal = dynamic(() => import('./EditPostModal'), { ssr: false });
const DeletePostModal = dynamic(() => import('./DeletePostModal'), { ssr: false });
const OriginTypeModal = dynamic(() => import('./OriginTypeModal'), { ssr: false });
import CollabSelector from './CollabSelector';
import UserActionMenu from './UserActionMenu';

interface PostDetailProps {
  post: Post;
}

export default function PostDetail({ post: initial }: PostDetailProps) {
  const router = useRouter();
  const [bbsMode, setBbsMode] = useState('SNSモード');
  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('unj_bbs_mode') : null;
    if (saved) setBbsMode(saved);
  }, []);

  const [post, setPost] = useState<Post>(initial);
  const [replyText, setReplyText] = useState('');
  const [replyTo, setReplyTo] = useState<Post | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [userId, setUserId] = useState('名無しvFZ');
  const [userSlug, setUserSlug] = useState<string | undefined>(undefined);

  const [composerOpen, setComposerOpen] = useState(false);
  const [replyImage, setReplyImage] = useState<string | null>(null);
  const [replyMml, setReplyMml] = useState<string | null>(null);
  const [replyGameDraft, setReplyGameDraft] = useState<any>(null);
  const [replyOriginType, setReplyOriginType] = useState<OriginType | undefined>(undefined);
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [collabImageUrl, setCollabImageUrl] = useState<string | undefined>(undefined);
  const [collabMml, setCollabMml] = useState<string | undefined>(undefined);
  const [showCollabSelector, setShowCollabSelector] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showOriginModal, setShowOriginModal] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [avatarColor, setAvatarColor] = useState('from-blue-500 to-indigo-600');
  const [selectedUser, setSelectedUser] = useState<{ displayName: string; slug?: string } | null>(null);
  const [avatarMenuPos, setAvatarMenuPos] = useState<{ x: number; y: number } | null>(null);

  const handleAvatarClick = useCallback((user: { displayName: string; slug?: string }, pos: { x: number; y: number }) => {
    setSelectedUser(user);
    setAvatarMenuPos(pos);
  }, []);

  // サーバーから届いた正規データでキャッシュを更新しておく。
  // 一覧へ戻ってから開き直したときも、最新のスナップショットで即描画できる。
  useEffect(() => {
    cachePost(initial);
  }, [initial]);

  useEffect(() => {
    const sessionId = ensureSessionId();
    api.auth.anonymous(sessionId).then(user => {
      setUserId(user.displayName);
      setUserSlug(user.slug);
      setAvatarUrl(user.avatarUrl);
      if (user.avatarColor) setAvatarColor(user.avatarColor);
    }).catch(() => { });
  }, []);

  useEffect(() => {
    if (replyTo) {
      setComposerOpen(true);
    }
  }, [replyTo]);

  /** 返信送信とコンポーザ/エディタ起動の排他制御用。
   *  コンポーザやエディタを開くたびに世代番号を進め、送信完了後の後片付け
   *  （返信先クリア等）は「送信時と同じ世代のときだけ」実行する。
   *  こうしないと 返信→エディタ起動 の順で操作したとき、遅れて返ってきた
   *  返信処理がエディタ側の状態を巻き戻してしまう。 */
  const uiSessionRef = useRef(0);
  const replySubmittingRef = useRef(false);
  const beginUiSession = useCallback(() => {
    uiSessionRef.current += 1;
    return uiSessionRef.current;
  }, []);
  /** 返信コンポーザを開く（target=null で通常のスレ返信）。 */
  const openComposer = useCallback((target: Post | null) => {
    beginUiSession();
    setReplyTo(target);
    setComposerOpen(true);
  }, [beginUiSession]);
  /** 全画面エディタ（お絵描き/MML/ゲーム）を開く。 */
  const openScreen = useCallback((screen: string) => {
    beginUiSession();
    setActiveScreen(screen);
  }, [beginUiSession]);

  const handleComposerClose = () => {
    beginUiSession();
    setComposerOpen(false);
    setReplyTo(null);
  };
  const heartQueue = useRef(0);
  const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const likeParity = useRef(0);
  const likeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dislikeParity = useRef(0);
  const dislikeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bodyExpanded, setBodyExpanded] = useState(false);

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

  const handleCreateReplyFromComposer = async () => {
    // 二重送信防止（送信ボタン連打・Enter連打）
    if (replySubmittingRef.current) return;
    replySubmittingRef.current = true;
    const session = beginUiSession();
    const targetParent = replyTo ?? post;
    const parts: string[] = [];
    if (replyText.trim()) parts.push(replyText.trim());
    if (replyMml) parts.push(`#mml ${replyMml}`);
    const content = parts.join('\n');

    const tempId = `temp-${Date.now()}`;
    const optimisticReply: Post = {
      id: tempId, displayName: userId, createdAt: new Date().toISOString(), time: "たった今", content,
      likes: 0, dislikes: 0, liked: false, disliked: false,
      repliesCount: 0, reposts: 0, reposted: false,
      avatarColor: avatarColor,
      avatarUrl: avatarUrl,
      heartsTotal: 0, replies: [],
      threadId: post.id, parentPostId: targetParent.id,
      hasImage: !!replyImage,
      imageSrc: replyImage ?? undefined,
      originType: replyOriginType,
    };
    setPost(p => ({ ...p, replies: [...p.replies, optimisticReply], repliesCount: p.repliesCount + 1 }));

    setReplyText('');
    setReplyImage(null);
    setReplyMml(null);
    setReplyGameDraft(null);
    setReplyOriginType(undefined);
    setComposerOpen(false);

    try {
      let imageSrc: string | undefined;
      if (replyImage) {
        const result = await api.upload.image({ image: replyImage });
        imageSrc = result.url;
      }
      let gameId: number | undefined;
      if (replyGameDraft) {
        const res = await fetch('/api/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preset: replyGameDraft.preset, title: replyGameDraft.title, manifest: replyGameDraft.manifest, creatorSlug: userSlug }),
        });
        if (res.ok) {
          const savedGame = await res.json();
          gameId = savedGame.id;
        }
      }

      const reply = await api.posts.replies.create(post.id, {
        displayName: userId,
        content,
        parentPostId: targetParent.id,
        hasImage: !!replyImage,
        imageSrc,
        gameId,
        originType: replyOriginType,
      });

      setPost(p => ({
        ...p,
        replies: p.replies.map(r => r.id === tempId ? reply : r)
      }));
    } catch {
      setPost(p => ({
        ...p,
        replies: p.replies.filter(r => r.id !== tempId),
        repliesCount: Math.max(0, p.repliesCount - 1),
      }));
      showToast('error', '返信の送信に失敗しました');
    } finally {
      replySubmittingRef.current = false;
    }
    // 送信中にコンポーザ/エディタを開き直していたら、その状態を壊さない
    if (uiSessionRef.current === session) setReplyTo(null);
  };

  const handleEditReply = async (replyId: string, content: string, originType?: OriginType) => {
    const prevReply = post.replies.find(r => r.id === replyId);
    setPost(p => ({
      ...p,
      replies: p.replies.map(r => r.id === replyId ? { ...r, content, originType, isEdited: true } : r)
    }));
    try {
      const updated = await api.posts.edit(replyId, userId, content, originType);
      setPost(p => ({
        ...p,
        replies: p.replies.map(r => r.id === replyId ? { ...r, content: updated.content, originType: updated.originType, isEdited: true } : r)
      }));
    } catch {
      if (prevReply) {
        setPost(p => ({
          ...p,
          replies: p.replies.map(r => r.id === replyId ? prevReply : r)
        }));
      }
      showToast('error', '返信の編集に失敗しました');
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    const prevReplies = post.replies;
    setPost(p => ({
      ...p,
      replies: p.replies.filter(r => r.id !== replyId),
      repliesCount: Math.max(0, p.repliesCount - 1)
    }));
    try {
      await api.posts.remove(replyId, userId);
    } catch {
      setPost(p => ({ ...p, replies: prevReplies, repliesCount: prevReplies.length }));
      showToast('error', '返信の削除に失敗しました');
    }
  };

  const handleOpenCollab = useCallback((p: Post) => {
    const pMml = extractMmlFromContent(p.content);
    if (!p.hasImage && pMml) {
      setCollabMml(pMml);
      setActiveScreen('mml');
      return;
    }
    setCollabImageUrl(p.imageSrc);
    setShowCollabSelector(true);
  }, []);

  const handleCollabSelectDrawing = useCallback(() => {
    setShowCollabSelector(false);
    setActiveScreen('drawing');
  }, []);

  const handleCollabSelectDotDrawing = useCallback(() => {
    setShowCollabSelector(false);
    setActiveScreen('dotdrawing');
  }, []);

  const handleCloseCollabSelector = useCallback(() => {
    setShowCollabSelector(false);
    setCollabImageUrl(undefined);
  }, []);

  const handleSaveDrawing = (canvasData: string) => {
    setReplyImage(canvasData);
    setActiveScreen(null);
    setCollabImageUrl(undefined);
    setReplyText("#お絵描き 自作イラスト完成！");
  };

  const handleSaveDotDrawing = (canvasData: string) => {
    setReplyImage(canvasData);
    setActiveScreen(null);
    setCollabImageUrl(undefined);
    setReplyText("#ドット絵 自作ドット絵完成！");
  };

  const handleSaveMml = (mml: string) => {
    setActiveScreen(null);
    setCollabMml(undefined);
    setReplyMml(mml);
  };

  const handleSaveGame = (manifest: any, meta: { title: string; preset: string }) => {
    setReplyGameDraft({ manifest, title: meta.title, preset: meta.preset });
    setActiveScreen(null);
    setReplyText((prev) => prev.trim() ? prev : `#ゲーム 「${meta.title}」を作ったよ！`);
  };

  const handleSaveEdit = async (newContent: string, nextImageSrc?: string | null) => {
    const prevPost = post;
    setShowEditModal(false);
    setPost(p => ({
      ...p,
      content: newContent,
      imageSrc: nextImageSrc === null ? undefined : (nextImageSrc ?? p.imageSrc),
      hasImage: nextImageSrc === null ? false : (nextImageSrc ? true : p.hasImage),
      isEdited: true,
    }));
    try {
      const updated = await api.posts.edit(post.id, userId, newContent, post.originType, nextImageSrc === null ? '' : nextImageSrc);
      setPost(updated);
      router.refresh();
    } catch {
      setPost(prevPost);
      showToast('error', '投稿の編集に失敗しました');
    }
  };

  const handleEditArt = () => {
    setMenuOpen(false);
    setCollabImageUrl(post.imageSrc);
    if (post.content.includes('#ドット絵')) {
      setActiveScreen('edit-dotdrawing');
    } else {
      setActiveScreen('edit-drawing');
    }
  };

  const handleSaveEditedArt = async (canvasData: string) => {
    const prevPost = post;
    setActiveScreen(null);
    setCollabImageUrl(undefined);
    setPost(p => ({ ...p, imageSrc: canvasData, hasImage: true, isEdited: true }));
    try {
      const updated = await api.posts.edit(post.id, userId, post.content, post.originType, canvasData);
      setPost(updated);
      router.refresh();
    } catch {
      setPost(prevPost);
      showToast('error', '画像の編集に失敗しました');
    }
  };

  const handleEditMusic = () => {
    setMenuOpen(false);
    setActiveScreen('edit-mml');
  };

  const handleSaveEditedMusic = async (mml: string) => {
    const prevPost = post;
    const newContent = `${stripMmlLine(post.content)}\n#mml ${mml}`.trim();
    setActiveScreen(null);
    setPost(p => ({ ...p, content: newContent, isEdited: true }));
    try {
      const updated = await api.posts.edit(post.id, userId, newContent, post.originType);
      setPost(updated);
      router.refresh();
    } catch {
      setPost(prevPost);
      showToast('error', '楽曲の編集に失敗しました');
    }
  };

  const handleSelectOriginType = async (ot: OriginType | undefined) => {
    const prevPost = post;
    setShowOriginModal(false);
    setPost(p => ({ ...p, originType: ot }));
    try {
      const updated = await api.posts.edit(post.id, userId, post.content, ot);
      setPost(updated);
      router.refresh();
    } catch {
      setPost(prevPost);
      showToast('error', '権利表記の更新に失敗しました');
    }
  };

  const handleConfirmDelete = async () => {
    setShowDeleteModal(false);
    try {
      await api.posts.remove(post.id, userId);
      router.push('/');
      router.refresh();
    } catch {
      showToast('error', '投稿の削除に失敗しました');
    }
  };

  const handleMenuEdit = () => {
    setShowEditModal(true);
    setMenuOpen(false);
  };

  const handleMenuOriginType = () => {
    setShowOriginModal(true);
    setMenuOpen(false);
  };

  const handleMenuDelete = () => {
    setShowDeleteModal(true);
    setMenuOpen(false);
  };

  const isSelf = !!userSlug && (post.slug || post.displayName) === userSlug;

  const mmlCode = extractMmlFromContent(post.content);
  const chordRes = extractChordsFromContent(post.content);

  if (bbsMode === '掲示板モード') {
    return <BbsThreadView post={initial} />;
  }

  return (
    <>
      <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center px-3 h-11">
          <Link href="/" className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors">
            <ArrowLeft size={18} className="text-gray-300" />
          </Link>
          <span className="ml-3 font-bold text-sm text-gray-200">投稿</span>
          <div ref={menuRef} className="relative ml-auto">
            <button onClick={toggleMenu} className="p-2.5 -mr-1 rounded hover:bg-gray-100/10 transition-colors">
              <MoreHorizontal size={18} className="text-gray-400" />
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
                {isSelf && post.hasImage && (
                  <button role="menuitem" onClick={handleEditArt} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                    <Pencil size={12} className="shrink-0" />
                    <span>作品を編集</span>
                  </button>
                )}
                {isSelf && mmlCode && (
                  <button role="menuitem" onClick={handleEditMusic} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                    <Pencil size={12} className="shrink-0" />
                    <span>曲を編集</span>
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
                    <span>{following ? 'フォロー中' : `${getAvatarInfo(post.displayName).username}さんをフォロー`}</span>
                  </button>
                )}
                {!isSelf && (
                  <button role="menuitem" onClick={handleMenuBlock} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                    <Ban size={12} className="shrink-0" />
                    <span>{blocked ? 'ブロック中' : `${getAvatarInfo(post.displayName).username}さんをブロック`}</span>
                  </button>
                )}
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
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (isSelf) {
              router.push(`/user/${post.slug || post.displayName}`);
            } else {
              const rect = e.currentTarget.getBoundingClientRect();
              handleAvatarClick(
                { displayName: post.displayName, slug: post.slug || undefined },
                { x: rect.left, y: rect.bottom }
              );
            }
          }}
          className="w-9 h-9 rounded-full shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white hover:opacity-80 transition-opacity relative overflow-hidden cursor-pointer"
          style={post.avatarUrl ? undefined : getAvatarInfo(post.displayName).style}
        >
          {post.avatarUrl ? (
            <img src={post.avatarUrl} alt={getAvatarInfo(post.displayName).username} className="w-full h-full object-cover rounded-full" />
          ) : (
            (() => {
              const AvatarIcon = getAvatarInfo(post.displayName).Icon;
              return <AvatarIcon className="w-5 h-5 text-white/40 leading-none" />;
            })()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline space-x-1.5 mb-0.5">
            <span className="font-bold text-xs text-gray-200">{getAvatarInfo(post.displayName).username}</span>
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

          <p className="text-[13px] text-gray-200 whitespace-pre-wrap leading-relaxed mb-2.5">
            {(() => {
              const displayText = getDisplayContent(post.content);
              const allLines = displayText ? displayText.split('\n') : [];
              const isOverflowing = allLines.length > POST_BODY_COLLAPSE_LINES;
              const lines = isOverflowing && !bodyExpanded ? allLines.slice(0, POST_BODY_COLLAPSE_LINES) : allLines;
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

          {(() => {
            const displayText = getDisplayContent(post.content);
            const allLines = displayText ? displayText.split('\n') : [];
            if (allLines.length <= POST_BODY_COLLAPSE_LINES) return null;
            return (
              <button
                onClick={() => setBodyExpanded(v => !v)}
                className="text-[11px] text-blue-400 hover:underline mb-2.5 -mt-1.5 block"
              >
                {bodyExpanded ? '折りたたむ' : '続きを読む'}
              </button>
            );
          })()}

          {post.hasImage && (
            <div className="rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] gimp-checkered-background-white">
              <img src={post.imageSrc} alt={post.imageAlt || "ユーザーアート"} className="max-w-full h-auto max-h-[220px] block mx-auto" />
            </div>
          )}

          {post.hasGame && userId && (
            <GameBox
              gameId={post.gameId || ''}
              postId={post.id}
              gameTitle={post.gameTitle || 'ゲーム'}
              gameThumbnail={post.gameThumbnail}
              userId={userId}
              className="mb-2.5"
            />
          )}

          {(() => {
            if (mmlCode) {
              return (
                <div className="relative">
                  <MmlPlayer mml={mmlCode} />
                  {post.hasCollabButton && (
                    <button
                      onClick={() => handleOpenCollab(post)}
                      className="absolute bottom-2.5 right-2.5 bg-black/75 hover:bg-black/90 px-2.5 py-1 rounded-full text-[10px] text-pink-400 flex items-center space-x-1 border border-gray-800 font-bold active:scale-95 transition-all z-10"
                    >
                      <Pencil size={11} />
                      <span>コラボ</span>
                    </button>
                  )}
                </div>
              );
            }
            if (chordRes) return <ChordPlayer chords={chordRes.chords} />;
            if (post.hasImage || post.hasGame) return null;
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
            <button onClick={() => openComposer(null)} className="flex items-center space-x-1 hover:text-green-400 transition-colors">
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

      {post.replies.length > 0 && (() => {
        // 親返信が削除済み／別スレッド由来などで親を辿れない返信は、
        // 単純な parentPostId 一致だけだとツリーのどこにも現れず消えてしまう。
        // 親が見つからないものはルート扱いにして必ず描画する。
        const ids = new Set(post.replies.map(r => r.id));
        const roots = post.replies.filter(r =>
          !r.parentPostId || r.parentPostId === post.id || !ids.has(r.parentPostId)
        );
        return (
          <div className="border-t border-gray-800 px-3 py-3 space-y-2">
            <span className="text-[11px] text-gray-500 font-bold">返信</span>
            {roots.map(reply => (
              <ReplyTreeItem key={reply.id} post={reply} replies={post.replies} depth={0} onReply={openComposer} userId={userId} userSlug={userSlug} onEdit={handleEditReply} onDelete={handleDeleteReply} onAvatarClick={handleAvatarClick} />
            ))}
          </div>
        );
      })()}

      <div className="border-t border-gray-800 px-3 pt-1 pb-3 space-y-1 mx-3 mb-4 mt-2">
        <div
          onClick={() => openComposer(null)}
          className="flex items-center space-x-2 bg-gray-100/5 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-100/10 transition-colors"
        >
          <span className="text-xs text-gray-500 flex-1">返信を書き込む...</span>
          <button className="text-blue-500 text-xs font-bold px-1">送信</button>
        </div>
      </div>

      {composerOpen && (
        <PostComposer
          userId={userId}
          avatarUrl={avatarUrl}
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
          onClose={handleComposerClose}
          onSubmit={handleCreateReplyFromComposer}
          onOpenDrawing={() => { setCollabImageUrl(undefined); handleOpenCollab(post); }}
          onOpenDotDrawing={() => { setCollabImageUrl(undefined); handleCollabSelectDotDrawing(); }}
          onOpenMml={() => openScreen('mml')}
          onOpenGameMaker={() => openScreen('gamemaker')}
          replyToDisplayName={replyTo ? replyTo.displayName : post.displayName}
        />
      )}

      {activeScreen === 'drawing' && (
        <DrawingEditor
          onClose={() => { setActiveScreen(null); setCollabImageUrl(undefined); }}
          onSave={handleSaveDrawing}
          collabImageUrl={collabImageUrl}
        />
      )}
      {activeScreen === 'dotdrawing' && (
        <DotDrawingEditor
          onClose={() => { setActiveScreen(null); setCollabImageUrl(undefined); }}
          onSave={handleSaveDotDrawing}
          collabImageUrl={collabImageUrl}
        />
      )}
      {activeScreen === 'gamemaker' && (
        <GameMaker onClose={() => setActiveScreen(null)} userId={userId} onSave={handleSaveGame} />
      )}
      {activeScreen === 'mml' && (
        <MmlEditor
          onClose={() => { setActiveScreen(null); setCollabMml(undefined); }}
          onSave={handleSaveMml}
          initialMml={collabMml}
        />
      )}
      {activeScreen === 'edit-drawing' && (
        <DrawingEditor
          onClose={() => { setActiveScreen(null); setCollabImageUrl(undefined); }}
          onSave={handleSaveEditedArt}
          collabImageUrl={collabImageUrl}
        />
      )}
      {activeScreen === 'edit-dotdrawing' && (
        <DotDrawingEditor
          onClose={() => { setActiveScreen(null); setCollabImageUrl(undefined); }}
          onSave={handleSaveEditedArt}
          collabImageUrl={collabImageUrl}
        />
      )}
      {activeScreen === 'edit-mml' && (
        <MmlEditor
          onClose={() => setActiveScreen(null)}
          onSave={handleSaveEditedMusic}
          initialMml={mmlCode ?? undefined}
          isEditing
        />
      )}

      {showCollabSelector && collabImageUrl && (
        <CollabSelector
          imageUrl={collabImageUrl}
          onSelectDrawing={handleCollabSelectDrawing}
          onSelectDotDrawing={handleCollabSelectDotDrawing}
          onClose={handleCloseCollabSelector}
        />
      )}

      {showEditModal && (
        <EditPostModal
          initialContent={post.content}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveEdit}
          imageSrc={post.imageSrc}
          onEditImage={() => {
            handleEditArt();
            setShowEditModal(false);
          }}
          onEditMml={() => {
            handleEditMusic();
            setShowEditModal(false);
          }}
          hasGame={post.hasGame}
          gameTitle={post.gameTitle}
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
      {selectedUser && (
        <UserActionMenu
          isOpen={true}
          onClose={() => setSelectedUser(null)}
          targetUserDisplayName={selectedUser.displayName}
          targetUserSlug={selectedUser.slug}
          currentUserId={userId}
          currentUserSlug={userSlug}
          onMention={(username) => {
            setReplyText(prev => prev ? `${prev} @${username} ` : `@${username} `);
          }}
          position={avatarMenuPos}
        />
      )}
    </>
  );
}

function ReplyTreeItem({ post, replies, depth, onReply, userId, userSlug, onEdit, onDelete, onAvatarClick }: { post: Post; replies: Post[]; depth: number; onReply: (post: Post) => void; userId: string; userSlug?: string; onEdit: (replyId: string, content: string, originType?: OriginType) => Promise<void>; onDelete: (replyId: string) => Promise<void>; onAvatarClick: (user: { displayName: string; slug?: string }, pos: { x: number; y: number }) => void }) {
  const router = useRouter();
  const children = replies.filter(r => r.parentPostId === post.id);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [localPost, setLocalPost] = useState<Post>(post);

  useEffect(() => {
    setLocalPost(post);
  }, [post]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showOriginModal, setShowOriginModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(v => !v);
  };

  const handleMenuCopy = () => {
    navigator.clipboard.writeText(localPost.content);
    setMenuOpen(false);
  };

  const handleMenuEdit = () => {
    setShowEditModal(true);
    setMenuOpen(false);
  };

  const handleMenuOriginType = () => {
    setShowOriginModal(true);
    setMenuOpen(false);
  };

  const handleMenuDelete = () => {
    setShowDeleteModal(true);
    setMenuOpen(false);
  };

  // 編集結果は親（post prop）を単一の情報源とする。
  // ここで localPost を直に書き換えると、API失敗でロールバックされたときに
  // ローカルだけ新しい内容のまま残り、編集内容が反映されない／戻らない状態になる。
  const handleSaveEdit = async (newContent: string, nextImageSrc?: string | null) => {
    setShowEditModal(false);
    await onEdit(localPost.id, newContent, localPost.originType);
  };

  const handleSelectOriginType = async (ot: OriginType | undefined) => {
    setShowOriginModal(false);
    await onEdit(localPost.id, localPost.content, ot);
  };

  const handleConfirmDelete = async () => {
    await onDelete(localPost.id);
    setShowDeleteModal(false);
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
  const avatarInfo = getAvatarInfo(localPost.displayName);
  const isSelf = !!userSlug && (localPost.slug || localPost.displayName) === userSlug;

  return (
    <div style={{ marginLeft: depth * 12 }} className={depth > 0 ? 'pl-3 border-l-2 border-gray-800/40' : ''}>
      <div className="flex p-3 space-x-2.5">
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (isSelf) {
              router.push(`/user/${localPost.slug || localPost.displayName}`);
            } else {
              const rect = e.currentTarget.getBoundingClientRect();
              onAvatarClick(
                { displayName: localPost.displayName, slug: localPost.slug || undefined },
                { x: rect.left, y: rect.bottom }
              );
            }
          }}
          className="w-9 h-9 rounded-full shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white hover:opacity-80 transition-opacity relative overflow-hidden cursor-pointer"
          style={localPost.avatarUrl ? undefined : avatarInfo.style}
        >
          {localPost.avatarUrl ? (
            <img src={localPost.avatarUrl} alt={avatarInfo.username} className="w-full h-full object-cover rounded-full" />
          ) : (
            (() => {
              const AvatarIcon = avatarInfo.Icon;
              return <AvatarIcon className="w-5 h-5 text-white/40 leading-none" />;
            })()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-0.5">
            <div className="flex items-baseline space-x-1.5">
              <span className="font-bold text-xs text-gray-200">{avatarInfo.username}</span>
              {isSelf && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40">自分</span>
              )}
              {(() => {
                const opt = ORIGIN_TYPE_OPTIONS.find(o => o.value === localPost.originType);
                return opt ? (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${opt.badgeClass}`}>{opt.label}</span>
                ) : null;
              })()}
              {localPost.isFalseDeclaration && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40">虚偽申告</span>
              )}
              <span className="text-gray-500 text-[10px] font-medium">
                {localPost.time}
                {localPost.isEdited && <span className="ml-1 text-[9px] text-gray-500/70">(編集済み)</span>}
              </span>
            </div>
            <div ref={menuRef} className="relative">
              <button onClick={toggleMenu} className="p-2 -mr-2 -mt-1 rounded hover:bg-gray-100/10 transition-colors">
                <MoreHorizontal size={14} className="text-gray-500 hover:text-gray-300" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-5 z-50 w-40 rounded-lg border border-gray-700 bg-[#131720] shadow-xl py-1 text-[10px]"
                  onClick={e => e.stopPropagation()}
                >
                  <button role="menuitem" onClick={handleMenuCopy} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                    <Copy size={11} className="shrink-0" />
                    <span>コピー</span>
                  </button>
                  {isSelf && (
                    <button role="menuitem" onClick={handleMenuEdit} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                      <Pencil size={11} className="shrink-0" />
                      <span>編集</span>
                    </button>
                  )}
                  {isSelf && (
                    <button role="menuitem" onClick={handleMenuOriginType} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                      <Pencil size={11} className="shrink-0" />
                      <span>権利表記</span>
                    </button>
                  )}
                  {isSelf && (
                    <button role="menuitem" onClick={handleMenuDelete} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-red-400 hover:bg-gray-100/10 text-left transition-colors">
                      <Trash2 size={11} className="shrink-0" />
                      <span>削除</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <p className="text-[13px] text-gray-200 whitespace-pre-wrap leading-relaxed mb-2.5">
            {(() => {
              const displayText = getDisplayContent(localPost.content);
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
            <div className="rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] gimp-checkered-background-white">
              <img src={localPost.imageSrc} alt={localPost.imageAlt || "ユーザーアート"} className="max-w-full h-auto max-h-[220px] block mx-auto" />
            </div>
          )}

          {(() => {
            if (mmlCode) return <MmlPlayer mml={mmlCode} />;
            if (chordRes) return <ChordPlayer chords={chordRes.chords} />;
            if (localPost.hasImage || localPost.hasGame) return null;
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
            <button onClick={() => onReply(localPost)} className="flex items-center space-x-1 hover:text-green-400 transition-colors">
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
            <ReplyTreeItem key={child.id} post={child} replies={replies} depth={depth + 1} onReply={onReply} userId={userId} userSlug={userSlug} onEdit={onEdit} onDelete={onDelete} onAvatarClick={onAvatarClick} />
          ))}
        </div>
      )}

      {showEditModal && (
        <EditPostModal
          initialContent={localPost.content}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveEdit}
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
          value={localPost.originType}
          onClose={() => setShowOriginModal(false)}
          onSelect={handleSelectOriginType}
        />
      )}
    </div>
  );
}
