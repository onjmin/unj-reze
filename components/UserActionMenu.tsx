'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, User, UserPlus, UserMinus, MessageSquare, AtSign, Loader2, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { getAvatarInfo } from '@/lib/avatar';
import { Post } from '@/lib/types';

interface UserActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserDisplayName: string;
  targetUserSlug?: string;
  currentUserId?: string; // currentUserDisplayName
  currentUserSlug?: string;
  onMention: (username: string) => void;
}

export default function UserActionMenu({
  isOpen,
  onClose,
  targetUserDisplayName,
  targetUserSlug,
  currentUserId,
  currentUserSlug,
  onMention,
}: UserActionMenuProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [isFollowingTarget, setIsFollowingTarget] = useState(false);
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

  // DM states
  const [showDmInput, setShowDmInput] = useState(false);
  const [dmText, setDmText] = useState('');
  const [sendingDm, setSendingDm] = useState(false);
  const [dmSuccess, setDmSuccess] = useState(false);

  const targetIdOrSlug = targetUserSlug || targetUserDisplayName;
  const isSelf = currentUserId === targetUserDisplayName || currentUserSlug === targetUserSlug;

  const avatarInfo = getAvatarInfo(targetUserDisplayName);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setShowDmInput(false);
    setDmText('');
    setDmSuccess(false);

    // The profile card (bio + avatar) is the primary content — spinner clears
    // as soon as it arrives. Counts and follow status fire at the same time
    // but populate silently into the already-visible card.
    api.users.profile(targetIdOrSlug, currentUserId)
      .then(data => {
        setBio(data.bio || '');
        setAvatarUrl(data.avatarUrl || undefined);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Silent population — no spinner.
    api.follow.getCounts(targetUserDisplayName)
      .then(c => { setFollowers(c.followers); setFollowing(c.following); })
      .catch(() => {});

    if (currentUserId && !isSelf) {
      api.follow.isFollowing(currentUserId, targetUserDisplayName)
        .then(r => setIsFollowingTarget(r.isFollowing))
        .catch(() => {});
    }
  }, [isOpen, targetIdOrSlug, targetUserDisplayName, currentUserId, isSelf]);

  if (!isOpen) return null;

  const handleFollowToggle = async () => {
    if (!currentUserId || isSelf) return;
    try {
      if (isFollowingTarget) {
        await api.follow.unfollow(currentUserId, targetUserDisplayName);
        setIsFollowingTarget(false);
        setFollowers(prev => Math.max(0, prev - 1));
      } else {
        await api.follow.follow(currentUserId, targetUserDisplayName);
        setIsFollowingTarget(true);
        setFollowers(prev => prev + 1);
      }
    } catch {}
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
      setTimeout(() => setShowDmInput(false), 1500);
    } catch {} finally {
      setSendingDm(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gradient-to-r from-gray-900 via-gray-900/90 to-gray-850">
          <span className="font-bold text-sm text-gray-200">ユーザーメニュー</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* User Card Body */}
        <div className="p-5 flex flex-col items-center">
          {/* Avatar */}
          <div
            className="w-16 h-16 rounded-full border border-gray-700/50 flex items-center justify-center text-xl font-bold text-white relative overflow-hidden mb-3"
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

          <span className="font-bold text-sm text-gray-200 mb-1">{avatarInfo.username}</span>
          <span className="text-[10px] text-gray-500 mb-3">@{targetUserSlug || targetUserDisplayName}</span>

          {loading ? (
            <div className="py-6 flex items-center justify-center">
              <Loader2 className="animate-spin text-blue-500" size={20} />
            </div>
          ) : (
            <>
              {/* Followers / Following */}
              <div className="flex gap-4 text-xs text-gray-400 mb-3 select-none">
                <span>
                  <strong className="text-gray-200">{following}</strong> フォロー中
                </span>
                <span>
                  <strong className="text-gray-200">{followers}</strong> フォロワー
                </span>
              </div>

              {/* Bio */}
              {bio && (
                <p className="text-[11px] text-gray-400 bg-gray-950/40 border border-gray-800/50 rounded-xl px-3 py-2 text-center w-full max-h-20 overflow-y-auto mb-4 leading-relaxed">
                  {bio}
                </p>
              )}

              {/* Action Buttons */}
              <div className="w-full flex flex-col gap-2">
                {/* Profile Link */}
                <button
                  onClick={() => {
                    onClose();
                    router.push(`/user/${targetIdOrSlug}`);
                  }}
                  className="w-full py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <User size={13} />
                  プロフィールを表示
                </button>

                {/* Follow Button */}
                {!isSelf && currentUserId && (
                  <button
                    onClick={handleFollowToggle}
                    className={`w-full py-2 border rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
                      isFollowingTarget
                        ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                        : 'bg-[#a3e635]/10 border-[#a3e635]/30 text-[#a3e635] hover:bg-[#a3e635]/20'
                    }`}
                  >
                    {isFollowingTarget ? (
                      <>
                        <UserMinus size={13} />
                        フォロー解除
                      </>
                    ) : (
                      <>
                        <UserPlus size={13} />
                        フォローする
                      </>
                    )}
                  </button>
                )}

                {/* Mention Button */}
                <button
                  onClick={() => {
                    onClose();
                    onMention(avatarInfo.username);
                  }}
                  className="w-full py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <AtSign size={13} />
                  メンションする
                </button>

                {/* Send DM Button */}
                {!isSelf && currentUserId && (
                  <div className="w-full flex flex-col gap-1.5">
                    <button
                      onClick={() => setShowDmInput(!showDmInput)}
                      className={`w-full py-2 border rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
                        showDmInput
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20'
                          : 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700'
                      }`}
                    >
                      <MessageSquare size={13} />
                      DMを送信
                    </button>

                    {/* Expandable DM Composer */}
                    {showDmInput && (
                      <div className="border border-gray-800 rounded-xl p-2 bg-gray-950/60 mt-1 flex flex-col gap-2">
                        {dmSuccess ? (
                          <div className="text-[10px] text-green-400 font-bold text-center py-2 animate-pulse">
                            メッセージを送信しました！
                          </div>
                        ) : (
                          <>
                            <textarea
                              value={dmText}
                              onChange={(e) => setDmText(e.target.value)}
                              placeholder="メッセージを入力..."
                              rows={2}
                              maxLength={200}
                              className="w-full bg-transparent text-xs text-white placeholder-gray-600 outline-none resize-none"
                            />
                            <div className="flex justify-between items-center pt-1 border-t border-gray-900">
                              <span className="text-[9px] text-gray-600">{dmText.length}/200</span>
                              <button
                                onClick={handleSendDm}
                                disabled={sendingDm || !dmText.trim()}
                                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-full p-1.5 transition-colors"
                              >
                                {sendingDm ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <Send size={11} />
                                )}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
