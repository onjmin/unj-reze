'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Post, OshiItem } from '@/lib/types';
import { MessageCircle, Heart, ThumbsUp, ThumbsDown, Image, FileText, Repeat, Mail, PlaySquare, Edit3, X, Loader2, Music2, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getAvatarInfo } from '@/lib/avatar';
import { extractMmlFromContent, getDisplayContent } from '@/lib/mml';
import { extractChordsFromContent } from '@/lib/chord';
import { extractFirstEmbed } from '@/lib/embed';
import dynamic from 'next/dynamic';
import ChordPlayer from './ChordPlayer';
import EmbedPart from './EmbedPart';

const MmlPlayer = dynamic(() => import('./MmlPlayer'), { ssr: false });
const CropAvatarModal = dynamic(() => import('./CropAvatarModal'), { ssr: false });
const MusicShareModal = dynamic(() => import('./MusicShareModal'), { ssr: false });

interface ProfileViewProps {
  userId: string;
  displayName?: string;
  currentUserId?: string;
  onLike?: (id: string) => void;
  onDislike?: (id: string) => void;
  onHeart?: (id: string) => void;
  onAddReply?: (id: string, text: string) => void;
  onRepost?: (id: string) => void;
  openCollab?: (post: Post) => void;
  onProfileUpdate?: (displayName: string, avatarUrl?: string) => void;
}

const tabs = [
  { id: 'threads', label: 'スレ', icon: FileText },
  { id: 'replies', label: '返信', icon: MessageCircle },
  { id: 'hearts', label: 'ハート', icon: Heart },
  { id: 'likes', label: 'いいね', icon: ThumbsUp },
  { id: 'dislikes', label: 'だめね', icon: ThumbsDown },
  { id: 'media', label: 'メディア', icon: Image },
];

export default function ProfileView({ userId, displayName, currentUserId, onLike, onDislike, onHeart, onAddReply, onRepost, openCollab, onProfileUpdate }: ProfileViewProps) {
  const router = useRouter();
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
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const slug = userId.match(/[a-zA-Z0-9]+$/)?.[0] || userId;
  const isSelf = currentUserId === userId;

  const resolvedName = displayName || myPosts[0]?.displayName || userId;
  const avatarInfo = getAvatarInfo(resolvedName);

  useEffect(() => {
    if (isEditModalOpen) {
      setEditBio(bio);
      setEditError(null);
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
      await api.auth.updateDisplayName(currentUserId || userId, avatarInfo.username, res.url);
      setAvatarUrl(res.url);
      onProfileUpdate?.(avatarInfo.username, res.url);
    } catch (err: any) {
      setAvatarUrl(previousAvatarUrl);
      setAvatarError(err.message || 'アイコンの保存に失敗しました');
    } finally {
      setIsAvatarSaving(false);
    }
  };

  const handleSaveBio = async () => {
    setIsSaving(true);
    setEditError(null);
    try {
      await api.auth.updateDisplayName(currentUserId || userId, avatarInfo.username, undefined, editBio.trim());
      setBio(editBio.trim());
      setIsEditModalOpen(false);
    } catch (err: any) {
      setEditError(err.message || '保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const promises: Promise<any>[] = [
      api.users.profile(slug, userId).then(data => {
        setMyPosts(data.posts);
        setAvatarUrl(data.avatarUrl || undefined);
        setBio(data.bio || '');
      }).catch(() => setMyPosts([])),
      api.follow.getCounts(userId).then(c => { setFollowers(c.followers); setFollowing(c.following); }).catch(() => {}),
      api.oshi.list(slug).then(setOshiItems).catch(() => setOshiItems([])),
    ];
    if (currentUserId && !isSelf) {
      promises.push(
        api.follow.isFollowing(currentUserId, userId).then(r => setIsFollow(r.isFollowing)).catch(() => {})
      );
    }
    Promise.all(promises).finally(() => setLoading(false));
  }, [userId, slug, currentUserId, isSelf]);

  const handleFollow = async () => {
    if (!currentUserId) return;
    if (isFollow) {
      await api.follow.unfollow(currentUserId, userId);
      setIsFollow(false);
      setFollowers(f => Math.max(0, f - 1));
    } else {
      await api.follow.follow(currentUserId, userId);
      setIsFollow(true);
      setFollowers(f => f + 1);
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
  const mediaPosts = useMemo(() => myPosts.filter(p => p.hasImage), [myPosts]);

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

  const handlePostClick = (postId: string) => {
    router.push(`/post/${postId}`);
  };

  if (loading && myPosts.length === 0 && likedPosts.length === 0 && dislikedPosts.length === 0 && heartedPosts.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="text-xs text-gray-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800 bg-gradient-to-b from-gray-100/[0.03] to-transparent">
        <div className="flex items-start space-x-3.5 mb-3">
          <div className="relative shrink-0">
            <div
              onClick={isSelf ? () => avatarFileInputRef.current?.click() : undefined}
              className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg text-white border border-gray-700 overflow-hidden ${isSelf ? 'cursor-pointer' : ''} ${isAvatarSaving ? 'opacity-50' : ''}`}
              style={avatarUrl ? undefined : avatarInfo.style}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={avatarInfo.username} className="w-full h-full object-cover" />
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
            <p className="text-xs text-gray-400 leading-relaxed mt-2 whitespace-pre-wrap">
              {bio || (isSelf ? '自己紹介を追加してみましょう' : '')}
            </p>
            {avatarError && (
              <p className="text-[10px] text-red-400 mt-1">{avatarError}</p>
            )}
          </div>
        </div>
        <div className="flex space-x-4 text-xs mt-0.5">
          <button className="text-gray-400 hover:text-white transition-colors">
            <span className="font-bold text-white">{myPosts.length}</span>{' '}投稿
          </button>
          <button className="text-gray-400 hover:text-white transition-colors">
            <span className="font-bold text-white">{following}</span>{' '}フォロー
          </button>
          <button className="text-gray-400 hover:text-white transition-colors">
            <span className="font-bold text-white">{followers}</span>{' '}フォロワー
          </button>
          {isSelf && (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="ml-auto px-3 py-1 rounded-full text-[11px] font-bold border border-gray-600 text-gray-300 hover:border-white hover:text-white transition-colors cursor-pointer"
            >
              プロフィールを編集
            </button>
          )}
          {currentUserId && !isSelf && (
            <button
              onClick={handleFollow}
              className={`ml-auto px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                isFollow
                  ? 'border-gray-600 text-gray-400 hover:border-red-500 hover:text-red-400'
                  : 'border-[#a3e635] text-[#a3e635] hover:bg-[#a3e635]/10'
              }`}
            >
              {isFollow ? 'フォロー中' : 'フォロー'}
            </button>
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
                  <a
                    key={item.id}
                    href={item.viewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 w-24"
                  >
                    <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-800 border border-gray-800 flex items-center justify-center">
                      {item.artworkUrl ? (
                        <img src={item.artworkUrl} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <Music2 size={20} className="text-gray-600" />
                      )}
                    </div>
                    <div className="text-[10px] text-gray-300 font-bold truncate mt-1">{item.title}</div>
                    {item.subtitle && <div className="text-[9px] text-gray-500 truncate">{item.subtitle}</div>}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-600">好きな曲やアーティストを追加してみましょう</p>
            )}
          </div>
        )}
      </div>

      <div className="flex border-b border-gray-800 overflow-x-auto scrollbar-none">
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

      <div className="flex-1 overflow-y-auto divide-y divide-gray-800/80">
        {loading ? (
          <div className="p-8 text-center text-xs text-gray-600">読み込み中...</div>
        ) : filteredPosts.length > 0 ? (
          filteredPosts.map(p => {
            const pAvatarInfo = getAvatarInfo(p.displayName);
            return (
              <div key={p.id} className="flex relative transition-all hover:bg-gray-100/5">
                <div className="flex-1 p-3 flex space-x-2.5 min-w-0 pr-4">
                  <div
                    onClick={(e) => { e.stopPropagation(); router.push(`/user/${p.slug || p.displayName}`); }}
                    className="w-9 h-9 rounded-full shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white relative cursor-pointer hover:opacity-80 transition-opacity overflow-hidden"
                    style={pAvatarInfo.style}
                  >
                    {(() => {
                      const AvatarIcon = pAvatarInfo.Icon;
                      return <AvatarIcon className="w-5 h-5 text-white/40 leading-none" />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <div className="flex items-baseline space-x-1.5">
                        <span className="font-bold text-xs text-gray-200">{pAvatarInfo.username}</span>
                        <span className="text-gray-500 text-[10px] font-medium">{p.time}</span>
                      </div>
                    </div>

                  <p
                    className="text-[13px] text-gray-200 whitespace-pre-wrap leading-relaxed mb-2.5 cursor-pointer hover:text-white transition-colors"
                    onClick={() => handlePostClick(p.id)}
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
                  </p>

                  {p.hasImage && (
                    <div
                      onClick={() => handlePostClick(p.id)}
                      className="relative rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] cursor-pointer"
                    >
                      <img
                        src={p.imageSrc}
                        alt={p.imageAlt || "ユーザーアート"}
                        className="max-w-full h-auto max-h-[220px] block mx-auto"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="100%" height="100%" fill="%231a1b26"/><circle cx="160" cy="90" r="50" fill="orange" opacity="0.8"/><text x="160" y="95" fill="white" font-weight="bold" text-anchor="middle" font-size="14">うんｊレゼ</text></svg>`;
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

                  {p.hasGame && (
                    <div
                      onClick={() => handlePostClick(p.id)}
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
                    if (p.hasImage || p.hasGame) return null;
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
                    <button onClick={(e) => e.stopPropagation()} className="flex items-center hover:text-blue-400 transition-colors">
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
    </div>
  );
}
