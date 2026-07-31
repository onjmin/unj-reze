'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { User, UserPlus, UserMinus, AtSign, Mail, VolumeX, Volume2, Ban, CircleSlash, Flag } from 'lucide-react';
import { api } from '@/lib/api';
import { getAvatarInfo } from '@/lib/avatar';
import { showToast } from '@/lib/toast';

interface UserActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserDisplayName: string;
  targetUserSlug?: string;
  currentUserId?: string; // currentUserDisplayName
  currentUserSlug?: string;
  onMention: (username: string) => void;
  position?: { x: number; y: number } | null;
  /** ミュート/ブロックの変更後に一覧を作り直したいとき用。 */
  onModerationChange?: () => void;
}

export default function UserActionMenu({
  isOpen,
  onClose,
  targetUserDisplayName,
  targetUserSlug,
  currentUserId,
  currentUserSlug,
  onMention,
  position,
  onModerationChange,
}: UserActionMenuProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isFollowingTarget, setIsFollowingTarget] = useState(false);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [moderating, setModerating] = useState(false);

  // DM states
  const [showDmInput, setShowDmInput] = useState(false);
  const [dmText, setDmText] = useState('');
  const [sendingDm, setSendingDm] = useState(false);
  const [dmSuccess, setDmSuccess] = useState(false);
  const [reported, setReported] = useState(false);

  const targetIdOrSlug = targetUserSlug || targetUserDisplayName;
  const isSelf = currentUserId === targetUserDisplayName || currentUserSlug === targetUserSlug;
  const avatarInfo = getAvatarInfo(targetUserDisplayName);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Cache update helper that merges updates with existing cache data
  const updateCache = (updates: Partial<{ followers: number; following: number }>) => {
    if (typeof localStorage === 'undefined') return;
    const key = `unj_cached_profile_${targetIdOrSlug}`;
    const existingStr = localStorage.getItem(key);
    let existing: any = {};
    if (existingStr) {
      try {
        existing = JSON.parse(existingStr) || {};
      } catch {}
    }
    const updated = { ...existing, ...updates };
    localStorage.setItem(key, JSON.stringify(updated));
  };

  useEffect(() => {
    if (!isOpen) return;

    setIsFollowingTarget(false);
    setShowDmInput(false);
    setDmText('');
    setDmSuccess(false);

    setMuted(false);
    setBlocked(false);
    setReported(false);

    if (currentUserId && !isSelf) {
      api.follow.isFollowing(currentUserId, targetUserDisplayName)
        .then(r => setIsFollowingTarget(r.isFollowing))
        .catch(() => {});
    }
    // 現在のミュート/ブロック状態を取り出して「解除」表示にできるようにする
    if (currentUserSlug && !isSelf) {
      api.mute.list(currentUserSlug).then(r => setMuted(r.muted.includes(targetIdOrSlug))).catch(() => {});
      api.block.list(currentUserSlug).then(r => setBlocked(r.blocked.includes(targetIdOrSlug))).catch(() => {});
    }
  }, [isOpen, targetUserDisplayName, currentUserId, currentUserSlug, targetIdOrSlug, isSelf]);

  if (!isOpen || !mounted) return null;

  const handleFollowToggle = async () => {
    if (!currentUserId || isSelf) return;
    const wasFollowing = isFollowingTarget;
    setIsFollowingTarget(!wasFollowing);
    try {
      if (wasFollowing) {
        await api.follow.unfollow(currentUserId, targetUserDisplayName);
      } else {
        await api.follow.follow(currentUserId, targetUserDisplayName);
      }
      api.follow.getCounts(targetUserDisplayName).then(c => {
        updateCache({ followers: c.followers, following: c.following });
      }).catch(() => {});
    } catch {
      setIsFollowingTarget(wasFollowing);
    }
  };

  const handleMuteToggle = async () => {
    if (!currentUserSlug || isSelf || moderating) return;
    const was = muted;
    setModerating(true);
    setMuted(!was);
    try {
      if (was) await api.mute.unmute(currentUserSlug, targetIdOrSlug);
      else await api.mute.mute(currentUserSlug, targetIdOrSlug);
      onModerationChange?.();
    } catch {
      setMuted(was);
    } finally {
      setModerating(false);
    }
  };

  const handleBlockToggle = async () => {
    if (!currentUserSlug || isSelf || moderating) return;
    const was = blocked;
    setModerating(true);
    setBlocked(!was);
    try {
      if (was) await api.block.unblock(currentUserSlug, targetIdOrSlug);
      else await api.block.block(currentUserSlug, targetIdOrSlug);
      onModerationChange?.();
    } catch {
      setBlocked(was);
    } finally {
      setModerating(false);
    }
  };

  const handleReportUser = async () => {
    if (!currentUserSlug || isSelf || reported) return;
    try {
      await api.report.create({
        reporterSlug: currentUserSlug,
        targetType: 'user',
        targetId: targetIdOrSlug,
        reason: '不適切なユーザー行為の通報',
      });
      setReported(true);
      showToast('info', 'ユーザーを通報しました');
      setTimeout(() => onClose(), 800);
    } catch {
      showToast('error', '通報に失敗しました');
    }
  };

  const handleSendDm = async () => {
    if (!dmText.trim() || !currentUserId || isSelf) return;
    setSendingDm(true);
    try {
      await api.messages.send({
        sender: currentUserId,
        text: dmText.trim(),
        recipient: targetUserDisplayName,
      });
      setDmSuccess(true);
      setDmText('');
      setTimeout(() => {
        setShowDmInput(false);
        onClose();
      }, 1200);
    } catch {} finally {
      setSendingDm(false);
    }
  };

  let menuX = position ? position.x : 0;
  let menuY = position ? position.y + 4 : 0;

  if (position && typeof window !== 'undefined') {
    const menuWidth = 176;
    const menuHeight = 320;

    if (menuX + menuWidth > window.innerWidth - 12) {
      menuX = Math.max(12, window.innerWidth - menuWidth - 12);
    }
    if (menuX < 12) {
      menuX = 12;
    }

    if (menuY + menuHeight > window.innerHeight - 12) {
      menuY = Math.max(12, position.y - menuHeight - 8);
    }
  }

  return createPortal(
    <>
      {/* Transparent overlay backdrop to close dropdown on outside clicks */}
      <div className="fixed inset-0 z-50 cursor-default" onClick={onClose} />

      <div
        style={{
          position: 'fixed',
          left: position ? `${menuX}px` : '50%',
          top: position ? `${menuY}px` : '50%',
          transform: position ? 'none' : 'translate(-50%, -50%)',
        }}
        className="z-50 w-44 rounded-lg border border-gray-800 bg-[#161922] shadow-2xl py-1 text-xs text-gray-300 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            onClose();
            router.push(`/user/${targetIdOrSlug}`);
          }}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors font-semibold"
        >
          <User size={14} className="shrink-0 text-gray-400" />
          <span>プロフページ</span>
        </button>

        {!isSelf && currentUserId && (
          <button
            onClick={handleFollowToggle}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors font-semibold"
          >
            {isFollowingTarget ? (
              <>
                <UserMinus size={14} className="shrink-0 text-gray-400" />
                <span>フォロー解除</span>
              </>
            ) : (
              <>
                <UserPlus size={14} className="shrink-0 text-gray-400" />
                <span>フォローする</span>
              </>
            )}
          </button>
        )}

        {!isSelf && currentUserId && (
          <>
            {showDmInput ? (
              <div className="px-3 py-2 border-t border-gray-800/80 bg-gray-950/20 flex flex-col gap-1.5">
                {dmSuccess ? (
                  <div className="text-[10px] text-green-400 font-bold text-center py-1 animate-pulse">
                    送信しました！
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={dmText}
                      onChange={(e) => setDmText(e.target.value)}
                      placeholder="メッセージを入力"
                      className="w-full bg-gray-900/50 hover:bg-gray-900/80 border border-gray-800 rounded px-2 py-1 text-[11px] outline-none text-white focus:border-blue-600 transition-colors"
                      autoFocus
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setShowDmInput(false)}
                        className="text-gray-400 text-[10px] px-1.5 py-0.5 hover:bg-gray-100/10 rounded transition-colors"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={handleSendDm}
                        disabled={sendingDm || !dmText.trim()}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] px-2 py-0.5 rounded font-bold transition-all active:scale-95"
                      >
                        {sendingDm ? '送信中...' : '送信'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowDmInput(true)}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors font-semibold"
              >
                <Mail size={14} className="shrink-0 text-gray-400" />
                <span>DMする</span>
              </button>
            )}
          </>
        )}

        <button
          onClick={() => {
            onClose();
            onMention(avatarInfo.username);
          }}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors font-semibold"
        >
          <AtSign size={14} className="shrink-0 text-gray-400" />
          <span>@メンションする</span>
        </button>

        {!isSelf && currentUserSlug && (
          <>
            <div className="border-t border-gray-800 my-1" />
            <button
              onClick={handleMuteToggle}
              disabled={moderating}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors font-semibold disabled:opacity-50"
            >
              {muted ? <Volume2 size={14} className="shrink-0 text-gray-400" /> : <VolumeX size={14} className="shrink-0 text-gray-400" />}
              <span>{muted ? 'ミュート解除' : 'ミュートする'}</span>
            </button>
            <button
              onClick={handleBlockToggle}
              disabled={moderating}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-red-400 hover:bg-gray-100/10 text-left transition-colors font-semibold disabled:opacity-50"
            >
              {blocked ? <CircleSlash size={14} className="shrink-0 text-red-400" /> : <Ban size={14} className="shrink-0 text-red-400" />}
              <span>{blocked ? 'ブロック解除' : 'ブロックする'}</span>
            </button>
            <button
              onClick={handleReportUser}
              disabled={reported}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-yellow-400 hover:bg-gray-100/10 text-left transition-colors font-semibold disabled:opacity-50"
            >
              <Flag size={14} className="shrink-0 text-yellow-400" />
              <span>{reported ? '通報済み' : 'ユーザーを通報'}</span>
            </button>
          </>
        )}
      </div>
    </>,
    document.body
  );
}
