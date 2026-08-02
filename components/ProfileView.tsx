'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Post, OshiItem, AnonymousUser, OriginType, ORIGIN_TYPE_OPTIONS } from '@/lib/types';
import { MessageCircle, Heart, ThumbsUp, ThumbsDown, Image, FileText, Repeat, Mail, PlaySquare, Clapperboard, Edit3, X, Loader2, Music2, Pencil, Play, Pause, MoreHorizontal, Copy, UserPlus, Ban, Flag, VolumeX, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ensureSessionId } from '@/lib/session';
import { getAvatarInfo } from '@/lib/avatar';
import { applyMasterVolume, subscribeMasterVolume, subscribeMuted } from '@/lib/master-volume';
import { extractMmlFromContent, getDisplayContent } from '@/lib/mml';
import { extractChordsFromContent } from '@/lib/chord';
import { extractFirstEmbed } from '@/lib/embed';
import dynamic from 'next/dynamic';
import ChordPlayer from './ChordPlayer';
import EmbedPart from './EmbedPart';
import UserActionMenu from './UserActionMenu';
import ImagePreview from './ImagePreview';
import FollowListSheet, { type FollowListTab } from './FollowListSheet';
import EditPostModal from './EditPostModal';
import DeletePostModal from './DeletePostModal';
import OriginTypeModal from './OriginTypeModal';
import { showToast } from '@/lib/toast';

const MmlPlayer = dynamic(() => import('./MmlPlayer'), { ssr: false });
const CropAvatarModal = dynamic(() => import('./CropAvatarModal'), { ssr: false });
const MusicShareModal = dynamic(() => import('./MusicShareModal'), { ssr: false });

import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { cachePost } from '@/lib/post-cache';
import { cacheProfileSeed, readProfileSeed } from '@/lib/profile-cache';

interface ProfileViewProps {
  userId: string;
  displayName?: string;
  currentUserId?: string;
  currentUserSlug?: string;
  onLike?: (id: string) => void;
  onDislike?: (id: string) => void;
  onHeart?: (id: string) => void;
  onAddReply?: (id: string, text: string) => void;
  onRepost?: (id: string) => void;
  openCollab?: (post: Post) => void;
  openGame?: (gameId?: string, postId?: string) => void;
  onProfileUpdate?: (displayName: string, avatarUrl?: string) => void;
  onEditImage?: (post: Post) => void;
  onEditMml?: (post: Post) => void;
  onEditMv?: (post: Post) => void;
  onEditPost?: (post: Post) => void;
  onModerationChange?: () => void;
}

/* ─── Per-post three-dot menu (self-contained to isolate state per item) ─── */
function ProfilePostMenu({
  post,
  currentUserSlug,
  currentUserDisplayName,
  onModerationChange,
  onEditPost,
  onEditImage,
  onEditMml,
  onEditMv,
  openGame,
  onOptimisticDelete,
  onUndoDelete,
}: {
  post: Post;
  currentUserSlug?: string;
  currentUserDisplayName?: string;
  onModerationChange?: () => void;
  onEditPost?: (post: Post) => void;
  onEditImage?: (post: Post) => void;
  onEditMml?: (post: Post) => void;
  onEditMv?: (post: Post) => void;
  openGame?: (gameId?: string, postId?: string) => void;
  onOptimisticDelete?: (postId: string) => void;
  onUndoDelete?: (postId: string) => void;
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showOriginModal, setShowOriginModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const pAvatarInfo = getAvatarInfo(post.displayName);
  const targetSlug = post.slug || post.displayName;
  const isSelfPost = !!currentUserSlug && currentUserSlug === targetSlug;

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

  const handleMenuCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(post.content);
    setMenuOpen(false);
  }, [post.content]);

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
      router.refresh();
    } catch {
      showToast('error', '投稿の編集に失敗しました');
    }
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
    } catch {
      showToast('error', '権利表記の更新に失敗しました');
    }
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
    onOptimisticDelete?.(post.id);
    try {
      await api.posts.remove(post.id, currentUserSlug);
      onModerationChange?.();
    } catch {
      onUndoDelete?.(post.id);
      showToast('error', '投稿の削除に失敗しました');
    }
  }, [currentUserSlug, post.id, onModerationChange]);

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
    } catch { /* noop */ }
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

  const handleMenuReport = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setShowReportModal(true);
  }, []);

  const submitReport = useCallback(async () => {
    try {
      await api.report.create({
        reporterSlug: currentUserSlug || '名無し',
        targetType: 'post',
        targetId: String(post.id),
        reason: reportReason,
      });
      setShowReportModal(false);
      setReportReason('');
      showToast('success', '通報を受け付けました');
    } catch { /* noop */ }
  }, [currentUserSlug, post.id, reportReason]);

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setMenuOpen(v => !v); }}
          className="p-2 -mr-2 -mt-1 rounded hover:bg-gray-100/10 transition-colors"
        >
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
            {isSelfPost && (
              <button role="menuitem" onClick={handleMenuEdit} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                <Pencil size={12} className="shrink-0" />
                <span>ポストを編集</span>
              </button>
            )}
            {isSelfPost && (
              <button role="menuitem" onClick={handleMenuOriginType} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                <Pencil size={12} className="shrink-0" />
                <span>権利表記を設定</span>
              </button>
            )}
            {isSelfPost && (
              <button role="menuitem" onClick={handleMenuDelete} className="flex items-center gap-2.5 w-full px-3 py-2 text-red-400 hover:bg-gray-100/10 text-left transition-colors">
                <Trash2 size={12} className="shrink-0" />
                <span>ポストを削除</span>
              </button>
            )}
            {!isSelfPost && (
              <button role="menuitem" onClick={handleMenuFollow} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                <UserPlus size={12} className="shrink-0" />
                <span>{following ? 'フォロー中' : `${pAvatarInfo.username}さんをフォロー`}</span>
              </button>
            )}
            {!isSelfPost && (
              <button role="menuitem" onClick={handleMenuMute} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                <VolumeX size={12} className="shrink-0" />
                <span>{muted ? 'ミュート中' : `${pAvatarInfo.username}さんをミュート`}</span>
              </button>
            )}
            {!isSelfPost && (
              <button role="menuitem" onClick={handleMenuBlock} className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors">
                <Ban size={12} className="shrink-0" />
                <span>{blocked ? 'ブロック中' : `${pAvatarInfo.username}さんをブロック`}</span>
              </button>
            )}
            {!isSelfPost && <div className="border-t border-gray-800 my-1" />}
            {!isSelfPost && (
              <button role="menuitem" onClick={handleMenuReport} className="flex items-center gap-2.5 w-full px-3 py-2 text-red-400 hover:bg-gray-100/10 text-left transition-colors">
                <Flag size={12} className="shrink-0" />
                <span>ポストを通報</span>
              </button>
            )}
          </div>
        )}
      </div>

      {showEditModal && (
        <EditPostModal
          initialContent={post.content}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveEdit}
          imageSrc={post.imageSrc}
          onEditImage={onEditImage ? () => {
            onEditImage(post);
            setShowEditModal(false);
          } : undefined}
          onEditMml={onEditMml ? () => {
            onEditMml(post);
            setShowEditModal(false);
          } : undefined}
          hasGame={post.hasGame}
          gameTitle={post.gameTitle}
          onEditGame={openGame ? () => {
            openGame(post.gameId, post.id);
            setShowEditModal(false);
          } : undefined}
          hasMv={post.hasMv}
          mvTitle={post.mvTitle}
          onEditMv={onEditMv ? () => {
            onEditMv(post);
            setShowEditModal(false);
          } : undefined}
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
      {showReportModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 font-sans text-gray-200 shadow-2xl">
            <h4 className="text-sm font-bold text-gray-100 flex items-center gap-1.5">
              <span>🚨</span> 投稿の通報
            </h4>
            <p className="text-xs text-gray-400">通報理由を入力してください（任意）</p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="理由の詳細…"
              rows={3}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-gray-200 outline-none focus:border-red-500 resize-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setShowReportModal(false); setReportReason(''); }}
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 rounded-lg transition"
              >
                キャンセル
              </button>
              <button
                onClick={submitReport}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg transition"
              >
                送信
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const tabs = [
  { id: 'threads', label: 'スレ', icon: FileText },
  { id: 'replies', label: '返信', icon: MessageCircle },
  { id: 'hearts', label: 'ハート', icon: Heart },
  { id: 'likes', label: 'いいね', icon: ThumbsUp },
  { id: 'dislikes', label: 'だめね', icon: ThumbsDown },
  { id: 'media', label: 'メディア', icon: Image },
];

export default function ProfileView({ userId, displayName, currentUserId, currentUserSlug, onLike, onDislike, onHeart, onAddReply, onRepost, openCollab, openGame, onProfileUpdate, onEditImage, onEditMml, onEditMv, onEditPost, onModerationChange }: ProfileViewProps) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const cleanUserId = useMemo(() => {
    try {
      return decodeURIComponent(userId || '');
    } catch {
      return userId || '';
    }
  }, [userId]);
  const slug = useMemo(() => cleanUserId.match(/[a-zA-Z0-9]+$/)?.[0] || cleanUserId, [cleanUserId]);

  const [profileDisplayName, setProfileDisplayName] = useState<string | undefined>(displayName);
  const [activeTab, setActiveTab] = useState('threads');
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [dislikedPosts, setDislikedPosts] = useState<Post[]>([]);
  const [heartedPosts, setHeartedPosts] = useState<Post[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [isFollow, setIsFollow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [bio, setBio] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [oshiItems, setOshiItems] = useState<OshiItem[]>([]);
  const [isMusicModalOpen, setIsMusicModalOpen] = useState(false);
  const [playingOshiId, setPlayingOshiId] = useState<string | null>(null);
  const [removingOshiId, setRemovingOshiId] = useState<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const oshiAudioRef = useRef<HTMLAudioElement | null>(null);

  const [selectedUser, setSelectedUser] = useState<{ displayName: string; slug?: string } | null>(null);
  const [avatarMenuPos, setAvatarMenuPos] = useState<{ x: number; y: number } | null>(null);
  /** フォロワー/フォロー一覧シート。カウントのタップで開く。 */
  const [followListTab, setFollowListTab] = useState<FollowListTab | null>(null);
  /** 投稿画像のタップで開く拡大表示（フィードと同じ ImagePreview を共用） */
  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null);
  /** ポスト三点メニューからの楽観的削除 */
  const [deletedPostIds, setDeletedPostIds] = useState<Set<string>>(new Set());
  const handleOptimisticDelete = useCallback((postId: string) => {
    setDeletedPostIds(prev => { const next = new Set(prev); next.add(postId); return next; });
  }, []);
  const handleUndoDelete = useCallback((postId: string) => {
    setDeletedPostIds(prev => { const next = new Set(prev); next.delete(postId); return next; });
  }, []);

  const isSelf = useMemo(() => {
    if (!userId) return false;
    if (currentUser) {
      return currentUser.slug === userId || currentUser.displayName === userId || currentUser.id === userId;
    }
    return currentUserId === userId;
  }, [currentUserId, userId, currentUser]);

  const resolvedName = profileDisplayName || displayName || myPosts[0]?.displayName || userId;
  const avatarInfo = getAvatarInfo(resolvedName);

  // /user/[id] は currentUserId を渡さないため、セッションから解決した自分の表示名で補う。
  // これが無いとフォロー/メッセージの導線がプロフィールページに一切出ない。
  const viewerId = currentUserId || currentUser?.displayName;
  const viewerSlug = currentUserSlug || currentUser?.slug;

  useEffect(() => {
    if (isEditModalOpen) {
      Promise.resolve().then(() => {
        setEditBio(bio);
        setEditError(null);
      });
    }
  }, [isEditModalOpen, bio]);

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('画像ファイルを選択してください');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarError(null);
      setCropSrc(event.target?.result as string);
    };
    reader.onerror = () => {
      setAvatarError('画像の読み込みに失敗しました');
    };
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = async (dataUrl: string) => {
    setCropSrc(null);
    setIsAvatarSaving(true);
    setAvatarError(null);
    const previousAvatarUrl = avatarUrl;
    setAvatarUrl(dataUrl);
    try {
      const res = await api.upload.image({ image: dataUrl });
      const targetUserId = currentUser?.id || currentUserId || userId;
      await api.auth.updateDisplayName(targetUserId, avatarInfo.username, res.url);
      setAvatarUrl(res.url);
      onProfileUpdate?.(avatarInfo.username, res.url);

      const updatePost = (p: Post): Post => {
        const isUserPost = p.slug === currentUser?.slug || p.displayName === currentUser?.displayName || p.displayName === avatarInfo.username;
        return {
          ...p,
          avatarUrl: isUserPost ? res.url : p.avatarUrl,
          replies: p.replies?.map(r => {
            const isUserReply = r.slug === currentUser?.slug || r.displayName === currentUser?.displayName || r.displayName === avatarInfo.username;
            return {
              ...r,
              avatarUrl: isUserReply ? res.url : r.avatarUrl,
            };
          }) || [],
        };
      };
      setMyPosts(prev => prev.map(updatePost));
      setLikedPosts(prev => prev.map(updatePost));
      setDislikedPosts(prev => prev.map(updatePost));
      setHeartedPosts(prev => prev.map(updatePost));
    } catch (err) {
      setAvatarUrl(previousAvatarUrl);
      setAvatarError((err as Error)?.message || 'アイコンの保存に失敗しました');
    } finally {
      setIsAvatarSaving(false);
    }
  };

  const handleSaveBio = async () => {
    setIsSaving(true);
    setEditError(null);
    try {
      const targetUserId = currentUser?.id || currentUserId || userId;
      await api.auth.updateDisplayName(targetUserId, avatarInfo.username, undefined, editBio.trim());
      setBio(editBio.trim());
      setIsEditModalOpen(false);
    } catch (err) {
      setEditError((err as Error)?.message || '保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  // Load cached profile data from localStorage immediately when slug changes
  useEffect(() => {
    if (!slug || typeof localStorage === 'undefined') return;
    const cached = localStorage.getItem(`unj_cached_profile_${slug}`);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        if (data) {
          Promise.resolve().then(() => {
            if (Array.isArray(data.posts)) setMyPosts(data.posts);
            if (data.avatarUrl) setAvatarUrl(data.avatarUrl);
            if (data.bio) setBio(data.bio || '');
            if (data.displayName) setProfileDisplayName(data.displayName);
            if (typeof data.followers === 'number') setFollowers(data.followers);
            if (typeof data.following === 'number') setFollowing(data.following);
            if (Array.isArray(data.oshiItems)) setOshiItems(data.oshiItems);
            setLoading(false);
          });
        }
      } catch {}
    } else {
      // 全体キャッシュが無い＝初訪問。一覧側が積んだ種（名前・アイコン）だけでも先に描く。
      // loading は落とさないので、投稿一覧は従来どおり読み込み表示のままになる。
      const seed = readProfileSeed(slug) || readProfileSeed(cleanUserId);
      Promise.resolve().then(() => {
        setMyPosts([]);
        setAvatarUrl(seed?.avatarUrl);
        setBio('');
        setProfileDisplayName(seed?.displayName || displayName);
        setFollowers(0);
        setFollowing(0);
        setOshiItems([]);
        setLoading(true);
      });
    }
  }, [slug, cleanUserId, displayName]);

  // Update localStorage cache whenever profile data is updated
  useEffect(() => {
    if (!slug || typeof localStorage === 'undefined') return;
    if (myPosts.length > 0 || bio || avatarUrl || profileDisplayName || followers > 0 || following > 0 || oshiItems.length > 0) {
      const dataToCache = {
        posts: myPosts,
        avatarUrl,
        bio,
        displayName: profileDisplayName,
        followers,
        following,
        oshiItems,
      };
      localStorage.setItem(`unj_cached_profile_${slug}`, JSON.stringify(dataToCache));
    }
  }, [slug, myPosts, avatarUrl, bio, profileDisplayName, followers, following, oshiItems]);

  useEffect(() => {
    api.users.profile(slug, userId)
      .then(data => {
        setMyPosts(data.posts);
        setAvatarUrl(data.avatarUrl || undefined);
        setBio(data.bio || '');
        if (data.displayName) setProfileDisplayName(data.displayName);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    api.follow.getCounts(userId)
      .then(c => { setFollowers(c.followers); setFollowing(c.following); })
      .catch(() => {});
    api.oshi.list(slug)
      .then(setOshiItems)
      .catch(() => setOshiItems([]));
  }, [userId, slug]);

  // Separate effect: only checks follow status, and only when we know isSelf.
  // Runs independently so it never triggers a reload of the main data.
  useEffect(() => {
    if (!viewerId || isSelf) return;
    api.follow.isFollowing(viewerId, userId).then(r => setIsFollow(r.isFollowing)).catch(() => {});
  }, [viewerId, userId, isSelf]);

  useEffect(() => () => { oshiAudioRef.current?.pause(); }, []);

  // マスター音量/ミュートの変更を再生中の推しリストプレビューへ即時反映する。
  useEffect(() => {
    const applyVolume = () => {
      if (oshiAudioRef.current) oshiAudioRef.current.volume = applyMasterVolume(100) / 100;
    };
    const unsubVolume = subscribeMasterVolume(applyVolume);
    const unsubMuted = subscribeMuted(applyVolume);
    return () => { unsubVolume(); unsubMuted(); };
  }, []);

  const handleToggleOshiPreview = (e: React.MouseEvent, item: OshiItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (!item.previewUrl) return;
    if (playingOshiId === item.id) {
      oshiAudioRef.current?.pause();
      setPlayingOshiId(null);
      return;
    }
    oshiAudioRef.current?.pause();
    const audio = new Audio(item.previewUrl);
    audio.volume = applyMasterVolume(100) / 100;
    audio.play().catch(() => {});
    audio.onended = () => setPlayingOshiId(null);
    oshiAudioRef.current = audio;
    setPlayingOshiId(item.id);
  };

  const handleRemoveOshi = async (e: React.MouseEvent, item: OshiItem) => {
    e.preventDefault();
    e.stopPropagation();
    setRemovingOshiId(item.id);
    try {
      await api.oshi.remove(slug, item.id);
      setOshiItems(prev => prev.filter(o => o.id !== item.id));
      if (playingOshiId === item.id) {
        oshiAudioRef.current?.pause();
        setPlayingOshiId(null);
      }
    } catch {} finally {
      setRemovingOshiId(null);
    }
  };

  const handleFollow = async () => {
    if (!viewerId) return;
    const wasFollowing = isFollow;
    if (wasFollowing) {
      setIsFollow(false);
      setFollowers((f: number) => Math.max(0, f - 1));
      try {
        await api.follow.unfollow(viewerId, userId);
        const counts = await api.follow.getCounts(userId);
        setFollowers(counts.followers);
        setFollowing(counts.following);
      } catch {
        setIsFollow(true);
        setFollowers((f: number) => f + 1);
      }
    } else {
      setIsFollow(true);
      setFollowers((f: number) => f + 1);
      try {
        await api.follow.follow(viewerId, userId);
        const counts = await api.follow.getCounts(userId);
        setFollowers(counts.followers);
        setFollowing(counts.following);
      } catch {
        setIsFollow(false);
        setFollowers((f: number) => Math.max(0, f - 1));
      }
    }
  };

  /** DMスレッドへ。相手は slug で指定する（表示名は変わりうるため）。 */
  const handleOpenDm = () => {
    router.push(`/messages/${encodeURIComponent(slug)}`);
  };

  /**
   * 一覧シート内でのフォロー操作を、このプロフィールのカウントにも反映する。
   * 自分のプロフィールを見ているなら「フォロー」数、
   * 表示中ユーザー本人を一覧からフォローしたなら「フォロワー」数が動く。
   */
  const handleListFollowChange = (targetSlug: string, nowFollowing: boolean) => {
    const delta = nowFollowing ? 1 : -1;
    if (isSelf) setFollowing((f: number) => Math.max(0, f + delta));
    if (targetSlug === slug) {
      setIsFollow(nowFollowing);
      setFollowers((f: number) => Math.max(0, f + delta));
    }
  };

  const fetchTabData = useCallback((tab: string) => {
    setLoading(true);
    api.users.profile(slug, userId, tab).then(data => {
      if (tab === 'likes') setLikedPosts(data.posts);
      else if (tab === 'dislikes') setDislikedPosts(data.posts);
      else if (tab === 'hearts') setHeartedPosts(data.posts);
    }).catch(() => {
      if (tab === 'likes') setLikedPosts([]);
      else if (tab === 'dislikes') setDislikedPosts([]);
      else if (tab === 'hearts') setHeartedPosts([]);
    }).finally(() => {
      setLoading(false);
    });
  }, [slug, userId]);

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    if ((id === 'likes' || id === 'dislikes' || id === 'hearts') && userId) {
      fetchTabData(id);
    }
  };

  const threads = useMemo(() => myPosts.filter(p => p.id === p.threadId), [myPosts]);
  const replies = useMemo(() => myPosts.filter(p => p.id !== p.threadId), [myPosts]);
  const mediaPosts = useMemo(() => myPosts.filter(p => p.hasImage || p.hasGame || p.hasMv || !!extractMmlFromContent(p.content) || !!extractChordsFromContent(p.content)), [myPosts]);

  const totalHearts = useMemo(() => myPosts.reduce((s, p) => s + Number(p.heartsTotal), 0), [myPosts]);
  const totalLikes = useMemo(() => myPosts.reduce((s, p) => s + Number(p.likes), 0), [myPosts]);
  const totalDislikes = useMemo(() => myPosts.reduce((s, p) => s + Number(p.dislikes), 0), [myPosts]);

  const stats = [
    { id: 'threads', label: 'スレ', value: threads.length },
    { id: 'replies', label: '返信', value: replies.length },
    { id: 'hearts', label: 'ハート', value: totalHearts },
    { id: 'likes', label: 'いいね', value: totalLikes },
    { id: 'dislikes', label: 'だめね', value: totalDislikes },
    { id: 'media', label: 'メディア', value: mediaPosts.length },
  ];

  const filteredPosts = useMemo(() => {
    switch (activeTab) {
      case 'threads': return threads;
      case 'replies': return replies;
      case 'hearts': return heartedPosts;
      case 'likes': return likedPosts;
      case 'dislikes': return dislikedPosts;
      case 'media': return mediaPosts;
      default: return threads;
    }
  }, [activeTab, threads, replies, heartedPosts, likedPosts, dislikedPosts, mediaPosts]);

  const handlePostClick = (post: Post) => {
    // 一覧で取得済みのデータを詳細ページへ渡し、API応答を待たずに描画させる
    cachePost(post);
    router.push(`/post/${post.id}`);
  };

  // 名前かアイコンだけでも判っていればヘッダーを先に出す（投稿一覧だけが読み込み表示になる）。
  // 何も判らないときだけ、従来どおり全面の読み込み表示にする。
  const hasHeaderData = !!(profileDisplayName || avatarUrl || bio);

  if (loading && !hasHeaderData && myPosts.length === 0 && likedPosts.length === 0 && dislikedPosts.length === 0 && heartedPosts.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="text-xs text-gray-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="p-4 border-b border-gray-800 bg-gradient-to-b from-gray-100/[0.03] to-transparent shrink-0">
        <div className="flex items-start space-x-3.5 mb-3">
          <div className="relative shrink-0">
            <div
              onClick={isSelf ? () => avatarFileInputRef.current?.click() : undefined}
              className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg text-white border border-gray-700 overflow-hidden ${isSelf ? 'cursor-pointer' : ''} ${isAvatarSaving ? 'opacity-50' : ''}`}
              style={avatarUrl ? undefined : avatarInfo.style}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={avatarInfo.username} className="w-full h-full object-cover rounded-full" />
              ) : (
                (() => {
                  const AvatarIcon = avatarInfo.Icon;
                  return <AvatarIcon className="w-8 h-8 text-white/40 leading-none" />;
                })()
              )}
            </div>
            {isSelf && (
              <>
                <button
                  onClick={() => avatarFileInputRef.current?.click()}
                  disabled={isAvatarSaving}
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-blue-600 border-2 border-[#0b0e14] flex items-center justify-center text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                  aria-label="プロフィール画像を編集"
                >
                  {isAvatarSaving ? <Loader2 size={10} className="animate-spin" /> : <Pencil size={10} />}
                </button>
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base text-white truncate">{avatarInfo.username}</h2>
            <span className="text-[10px] text-gray-500 block truncate">@{resolvedName}</span>
            <span className="text-[11px] text-gray-500 block mt-0.5">登録: 2026-06-13</span>
            <p className="text-xs text-gray-400 leading-relaxed mt-2 whitespace-pre-wrap break-words">
              {bio || (isSelf ? '自己紹介を追加してみましょう' : '')}
            </p>
            {avatarError && (
              <p className="text-[10px] text-red-400 mt-1">{avatarError}</p>
            )}
          </div>
          {!isSelf && (
            <button
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setAvatarMenuPos({ x: rect.right - 176, y: rect.bottom });
                setSelectedUser({ displayName: resolvedName, slug });
              }}
              className="shrink-0 w-8 h-8 rounded-full border border-gray-700 text-gray-400 flex items-center justify-center hover:bg-gray-100/10 hover:text-white transition-colors"
              aria-label="このユーザーの操作"
            >
              <MoreHorizontal size={16} />
            </button>
          )}
        </div>
        <div className="flex space-x-4 text-xs mt-0.5">
          <span className="text-gray-400">
            <span className="font-bold text-white">{myPosts.length}</span>{' '}投稿
          </span>
          <button
            onClick={() => setFollowListTab('followers')}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <span className="font-bold text-white">{followers}</span>{' '}フォロワー
          </button>
          <button
            onClick={() => setFollowListTab('following')}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <span className="font-bold text-white">{following}</span>{' '}フォロー
          </button>
        </div>

        {/* フォロー / メッセージ。プロフィールから次の行動へ最短で行けるよう主導線として並べる。 */}
        <div className="flex gap-2 mt-3">
          {isSelf ? (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="flex-1 py-2 rounded-full text-xs font-bold border border-gray-700 text-gray-200 hover:border-white hover:text-white transition-colors"
            >
              プロフィールを編集
            </button>
          ) : (
            <>
              <button
                onClick={handleFollow}
                disabled={!viewerId}
                className={`flex-1 py-2 rounded-full text-xs font-bold transition-colors disabled:opacity-50 ${
                  isFollow
                    ? 'border border-gray-700 text-gray-200 hover:border-red-500 hover:text-red-400'
                    : 'bg-white text-black hover:bg-gray-200'
                }`}
              >
                {isFollow ? 'フォロー中' : 'フォロー'}
              </button>
              <button
                onClick={handleOpenDm}
                disabled={!viewerId}
                className="flex-1 py-2 rounded-full text-xs font-bold border border-gray-700 text-gray-200 hover:border-white hover:text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Mail size={13} />
                メッセージ
              </button>
            </>
          )}
        </div>

        {(oshiItems.length > 0 || isSelf) && (
          <div className="mt-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-gray-400 font-bold flex items-center gap-1">
                <span className="text-yellow-500">☆</span> 推しリスト
              </span>
              {isSelf && (
                <button
                  onClick={() => setIsMusicModalOpen(true)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-pink-600 text-white hover:bg-pink-500 transition-colors flex items-center gap-1"
                >
                  <Pencil size={10} />
                  編集
                </button>
              )}
            </div>
            {oshiItems.length > 0 ? (
              <div className="flex space-x-2.5 overflow-x-auto scrollbar-none pb-1">
                {oshiItems.map(item => (
                  <div
                    key={item.id}
                    className="shrink-0 w-24 select-none"
                  >
                    <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-800 border border-gray-800 flex items-center justify-center">
                      {item.artworkUrl ? (
                        <img src={item.artworkUrl} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <Music2 size={20} className="text-gray-600" />
                      )}
                      {playingOshiId === item.id && (
                        <div className="absolute inset-0 bg-black/20" />
                      )}
                      {item.previewUrl && (
                        <button
                          onClick={(e) => handleToggleOshiPreview(e, item)}
                          className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-black/90 transition-colors"
                          aria-label={playingOshiId === item.id ? '一時停止' : '試聴する'}
                        >
                          {playingOshiId === item.id ? <Pause size={12} /> : <Play size={12} />}
                        </button>
                      )}
                      {isSelf && (
                        <button
                          onClick={(e) => handleRemoveOshi(e, item)}
                          disabled={removingOshiId === item.id}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                          aria-label="推しリストから削除"
                        >
                          {removingOshiId === item.id ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-300 font-bold truncate mt-1">{item.title}</div>
                    {item.subtitle && <div className="text-[9px] text-gray-500 truncate">{item.subtitle}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-600">好きな曲やアーティストを追加してみましょう</p>
            )}
          </div>
        )}
      </div>

      <div className="flex border-b border-gray-800 overflow-x-auto scrollbar-none shrink-0">
        {stats.map(s => {
          const isActive = activeTab === s.id;
          return (
            <button
              key={s.id}
              onClick={() => handleTabChange(s.id)}
              className={`flex flex-col items-center justify-center flex-1 min-w-0 py-2.5 px-1 transition-colors relative ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <span className="text-[15px] font-extrabold leading-none">{s.value}</span>
              <span className="text-[10px] mt-0.5 whitespace-nowrap">{s.label}</span>
              {isActive && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-[#a3e635] rounded-full" />}
            </button>
          );
        })}
      </div>

      <div className="flex-1 divide-y divide-gray-800/80 pb-20">
        {loading ? (
          <div className="p-8 text-center text-xs text-gray-600">読み込み中...</div>
        ) : filteredPosts.length > 0 ? (
          filteredPosts.filter(p => !deletedPostIds.has(p.id)).map(p => {
            const pAvatarInfo = getAvatarInfo(p.displayName);
            return (
              <div key={p.id} className="flex relative transition-all hover:bg-gray-100/5">
                <div className="flex-1 p-3 flex space-x-2.5 min-w-0 pr-4">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      cacheProfileSeed({ slug: p.slug || undefined, displayName: p.displayName, avatarUrl: p.avatarUrl });
                      const isSelfPost = currentUser && (p.slug === currentUser.slug || p.displayName === currentUser.displayName);
                      if (isSelfPost) {
                        router.push(`/user/${p.slug || p.displayName}`);
                      } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setAvatarMenuPos({ x: rect.left, y: rect.bottom });
                        setSelectedUser({ displayName: p.displayName, slug: p.slug || undefined });
                      }
                    }}
                    className="w-9 h-9 rounded-full shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white relative cursor-pointer hover:opacity-80 transition-opacity overflow-hidden"
                    style={p.avatarUrl ? undefined : pAvatarInfo.style}
                  >
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt={pAvatarInfo.username} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      (() => {
                        const AvatarIcon = pAvatarInfo.Icon;
                        return <AvatarIcon className="w-5 h-5 text-white/40 leading-none" />;
                      })()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <div className="flex items-baseline space-x-1.5">
                        <span className="font-bold text-xs text-gray-200">{pAvatarInfo.username}</span>
                        {(() => {
                          const opt = ORIGIN_TYPE_OPTIONS.find(o => o.value === p.originType);
                          return opt ? (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${opt.badgeClass}`}>{opt.label}</span>
                          ) : null;
                        })()}
                        <span className="text-gray-500 text-[10px] font-medium">
                          {p.time}
                          {p.isEdited && <span className="ml-1 text-[9px] text-gray-500/70">(編集済み)</span>}
                        </span>
                      </div>
                      <ProfilePostMenu
                        post={p}
                        currentUserSlug={viewerSlug}
                        currentUserDisplayName={viewerId}
                        onModerationChange={onModerationChange}
                        onEditPost={onEditPost}
                        onEditImage={onEditImage}
                        onEditMml={onEditMml}
                        onEditMv={onEditMv}
                        openGame={openGame}
                        onOptimisticDelete={handleOptimisticDelete}
                        onUndoDelete={handleUndoDelete}
                      />
                    </div>

                  {/* break-words が無いと長いURLが折り返せず、プロフィールが横に伸びて
                      中央寄せのレイアウトごと左へずれる（＝左端の要素が画面外に隠れる） */}
                  <div
                    className="text-[13px] text-gray-200 whitespace-pre-wrap break-words leading-relaxed mb-2.5 cursor-pointer hover:text-white transition-colors"
                    onClick={() => handlePostClick(p)}
                  >
                    {(() => {
                      const displayText = getDisplayContent(p.content);
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
                  </div>

                  {p.hasImage && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (p.imageSrc) setPreviewImage({ src: p.imageSrc, alt: p.imageAlt || 'ユーザーアート' });
                      }}
                      className="relative rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] cursor-pointer gimp-checkered-background-white"
                    >
                      <img
                        src={p.imageSrc}
                        alt={p.imageAlt || "ユーザーアート"}
                        className="max-w-full h-auto max-h-[220px] block mx-auto"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="100%" height="100%" fill="%231a1b26"/><rect x="12" y="12" width="296" height="156" rx="8" fill="none" stroke="%23374151" stroke-width="1.5" stroke-dasharray="6,6"/><text x="160" y="85" fill="%23ef4444" font-weight="900" text-anchor="middle" font-size="28" font-family="sans-serif">404</text><text x="160" y="115" fill="%239ca3af" font-weight="bold" text-anchor="middle" font-size="14" font-family="sans-serif">NOT FOUND</text></svg>`;
                        }}
                      />
                      {p.hasCollabButton && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openCollab?.(p); }}
                          className="absolute bottom-2.5 right-2.5 bg-black/75 hover:bg-black/90 px-2.5 py-1 rounded-full text-[10px] text-[#a3e635] flex items-center space-x-1 border border-gray-800 font-bold active:scale-95 transition-all"
                        >
                          <Edit3 size={11} />
                          <span>コラボ</span>
                        </button>
                      )}
                    </div>
                  )}

                  {p.hasMv && (
                    <div
                      onClick={() => handlePostClick(p)}
                      className="w-full aspect-video bg-gray-900 rounded-xl mb-3 flex items-center justify-center overflow-hidden border border-gray-800 relative group cursor-pointer transition-all shadow-inner"
                    >
                      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800')] bg-cover bg-center opacity-30 group-hover:opacity-40 transition-opacity"></div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
                      <div className="z-10 flex flex-col items-center space-y-1">
                        <div className="bg-purple-600 p-3 rounded-full shadow-[0_0_15px_rgba(147,51,234,0.5)] group-hover:scale-110 transition-transform">
                          <Clapperboard size={28} className="text-white ml-0.5" />
                        </div>
                        <span className="text-[9px] tracking-widest text-gray-400 font-bold bg-black/60 px-2 py-0.5 rounded backdrop-blur mt-1.5">TAP TO WATCH MV</span>
                      </div>
                      <div className="absolute bottom-2 left-2.5 z-10 flex items-center space-x-1.5">
                        <span className="font-bold text-xs bg-purple-600/90 text-white px-2 py-0.5 rounded">Music Video</span>
                      </div>
                    </div>
                  )}

                  {p.hasGame && (
                    <div
                      onClick={() => handlePostClick(p)}
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
                    const mmlCode = extractMmlFromContent(p.content);
                    if (mmlCode) return <MmlPlayer mml={mmlCode} />;
                    const chordRes = extractChordsFromContent(p.content);
                    if (chordRes) return <ChordPlayer chords={chordRes.chords} />;
                    if (p.hasImage || p.hasGame || p.hasMv) return null;
                    const embed = extractFirstEmbed(p.content);
                    return embed ? <EmbedPart embed={embed} /> : null;
                  })()}

                  <div className="flex justify-between items-center text-gray-500 mt-1 max-w-[280px]">
                    <button
                      onClick={(e) => { e.stopPropagation(); onLike?.(p.id); }}
                      className={`flex items-center space-x-1 hover:text-blue-400 transition-colors ${p.liked ? 'text-blue-400 font-bold' : ''}`}
                    >
                      <ThumbsUp size={14} />
                      <span className="text-[11px]">{p.likes || ''}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDislike?.(p.id); }}
                      className={`flex items-center space-x-1 hover:text-red-500 transition-colors ${p.disliked ? 'text-red-500 font-bold' : ''}`}
                    >
                      <ThumbsDown size={14} />
                      <span className="text-[11px]">{p.dislikes || ''}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); }}
                      className="flex items-center space-x-1 hover:text-green-400 transition-colors"
                    >
                      <MessageCircle size={14} />
                      <span className="text-[11px]">{p.repliesCount || ''}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRepost?.(p.id); }}
                      className={`flex items-center space-x-1 hover:text-purple-400 transition-colors ${p.reposted ? 'text-purple-400' : ''}`}
                    >
                      <Repeat size={14} />
                      <span className="text-[11px]">{p.reposts || ''}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const targetSlug = p.slug || p.displayName;
                        if (targetSlug) {
                          router.push(`/messages/${encodeURIComponent(targetSlug)}`);
                        }
                      }}
                      className="flex items-center hover:text-blue-400 transition-colors"
                      title="DMを送る"
                    >
                      <Mail size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onHeart?.(p.id); }}
                      className="flex items-center space-x-1 hover:text-pink-400 transition-colors"
                    >
                      <Heart size={12} className="fill-current text-pink-600/65" />
                      <span className="text-[10px]">{p.heartsTotal || '0'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })
        ) : (
          <div className="p-12 text-center text-xs text-gray-600 flex flex-col items-center gap-2">
            {activeTab === 'threads' && <><FileText size={24} className="text-gray-700" /><span>作成したスレッドはまだありません</span></>}
            {activeTab === 'replies' && <><MessageCircle size={24} className="text-gray-700" /><span>返信はまだありません</span></>}
            {activeTab === 'hearts' && <><Heart size={24} className="text-gray-700" /><span>ハートを受け取った投稿はまだありません</span></>}
            {activeTab === 'likes' && <><ThumbsUp size={24} className="text-gray-700" /><span>いいねはまだありません</span></>}
            {activeTab === 'dislikes' && <><ThumbsDown size={24} className="text-gray-700" /><span>だめねはまだありません</span></>}
            {activeTab === 'media' && <><Image size={24} className="text-gray-700" /><span>メディア付き投稿はまだありません</span></>}
          </div>
        )}
      </div>

      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-scale-in">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gradient-to-r from-gray-900 via-gray-900/90 to-gray-850">
              <span className="font-bold text-sm text-gray-200">プロフィール編集</span>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 flex flex-col items-center space-y-4">
              {/* Bio Textarea */}
              <div className="w-full flex flex-col space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">自己紹介</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  maxLength={140}
                  rows={3}
                  autoFocus
                  className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-600 outline-none transition-all resize-none"
                  placeholder="自己紹介を入力（140文字まで）"
                />
                <span className="text-[10px] text-gray-600 self-end">{editBio.length}/140</span>
              </div>

              {editError && (
                <div className="text-[11px] text-red-400 text-center bg-red-950/20 border border-red-900/30 rounded-xl py-1.5 px-3 w-full">
                  {editError}
                </div>
              )}
            </div>

            <div className="p-3 bg-gray-950/40 border-t border-gray-800 flex justify-end space-x-2">
              <button
                onClick={() => setIsEditModalOpen(false)}
                disabled={isSaving}
                className="px-4 py-2 hover:bg-gray-100/5 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveBio}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-900/10 flex items-center space-x-1.5 disabled:opacity-50"
              >
                {isSaving && <Loader2 size={12} className="animate-spin" />}
                <span>{isSaving ? '保存中...' : '保存する'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {cropSrc && (
        <CropAvatarModal
          imageSrc={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={handleCropConfirm}
        />
      )}

      {isMusicModalOpen && (
        <MusicShareModal
          userSlug={slug}
          oshiItems={oshiItems}
          onAdd={(item) => setOshiItems(prev => [...prev, item])}
          onRemove={(id) => setOshiItems(prev => prev.filter(o => o.id !== id))}
          onClose={() => setIsMusicModalOpen(false)}
        />
      )}

      {selectedUser && (
        <UserActionMenu
          isOpen={true}
          onClose={() => setSelectedUser(null)}
          targetUserDisplayName={selectedUser.displayName}
          targetUserSlug={selectedUser.slug}
          currentUserId={viewerId}
          currentUserSlug={viewerSlug}
          onMention={(username) => {
            router.push(`/?mention=${encodeURIComponent(username)}`);
          }}
          position={avatarMenuPos}
        />
      )}

      {followListTab && (
        <FollowListSheet
          userId={userId}
          initialTab={followListTab}
          followersCount={followers}
          followingCount={following}
          viewerId={viewerId}
          onClose={() => setFollowListTab(null)}
          onFollowChange={handleListFollowChange}
        />
      )}

      {previewImage && (
        <ImagePreview
          src={previewImage.src}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
