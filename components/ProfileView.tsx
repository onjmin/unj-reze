'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Post } from '@/lib/types';
import { MessageCircle, Heart, ThumbsUp, ThumbsDown, Image, FileText, Repeat, Mail, PlaySquare, Edit3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { extractMmlFromContent, getDisplayContent } from '@/lib/mml';
import { extractChordsFromContent } from '@/lib/chord';
import { extractFirstEmbed } from '@/lib/embed';
import dynamic from 'next/dynamic';
import ChordPlayer from './ChordPlayer';
import EmbedPart from './EmbedPart';

const MmlPlayer = dynamic(() => import('./MmlPlayer'), { ssr: false });

interface ProfileViewProps {
  userId: string;
  displayName?: string;
  currentUserId?: string;
  onLike?: (id: number) => void;
  onDislike?: (id: number) => void;
  onHeart?: (id: number) => void;
  onAddReply?: (id: number, text: string) => void;
  onRepost?: (id: number) => void;
  openCollab?: (post: Post) => void;
}

function nameToInitials(name: string): string {
  return name.substring(3, 5) || name.substring(0, 2) || "--";
}

const tabs = [
  { id: 'threads', label: 'スレ', icon: FileText },
  { id: 'replies', label: '返信', icon: MessageCircle },
  { id: 'hearts', label: 'ハート', icon: Heart },
  { id: 'likes', label: 'いいね', icon: ThumbsUp },
  { id: 'dislikes', label: 'だめね', icon: ThumbsDown },
  { id: 'media', label: 'メディア', icon: Image },
];

export default function ProfileView({ userId, displayName, currentUserId, onLike, onDislike, onHeart, onAddReply, onRepost, openCollab }: ProfileViewProps) {
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

  const slug = userId.match(/[a-zA-Z0-9]+$/)?.[0] || userId;
  const isSelf = currentUserId === userId;

  useEffect(() => {
    setLoading(true);
    const promises: Promise<any>[] = [
      api.users.profile(slug, userId).then(data => setMyPosts(data.posts)).catch(() => setMyPosts([])),
      api.follow.getCounts(userId).then(c => { setFollowers(c.followers); setFollowing(c.following); }).catch(() => {}),
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

  const resolvedName = displayName || myPosts[0]?.displayName || userId;

  const handlePostClick = (postId: number) => {
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
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-lg text-white border border-gray-700 shrink-0">
            {nameToInitials(resolvedName)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base text-white truncate">{resolvedName}</h2>
            <span className="text-[11px] text-gray-500 block mt-0.5">登録: 2026-06-13</span>
            <p className="text-xs text-gray-400 leading-relaxed mt-2">
              {resolvedName === '名無しvFZ' ? 'お絵描きとゲーム制作が趣味です。たまに作曲も。' : '自己紹介を追加してみましょう'}
            </p>
            <p className="text-xs text-gray-500 mt-1.5 flex items-center space-x-1.5">
              <span className="text-yellow-500">♪</span>
              <span>推し: Lofi Beats / 東方アレンジ / ドット絵</span>
            </p>
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
          filteredPosts.map(p => (
            <div key={p.id} className="flex relative transition-all hover:bg-gray-100/5">
              <div className="flex-1 p-3 flex space-x-2.5 min-w-0 pr-4">
                <div
                  onClick={(e) => { e.stopPropagation(); router.push(`/user/${p.slug || p.displayName}`); }}
                  className={`w-9 h-9 rounded-full bg-gradient-to-br ${p.avatarColor} shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white relative cursor-pointer hover:opacity-80 transition-opacity`}
                >
                  {nameToInitials(p.displayName)}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handlePostClick(p.id)}>
                  <div className="flex justify-between items-baseline mb-0.5">
                    <div className="flex items-baseline space-x-1.5">
                      <span className="font-bold text-xs text-gray-200">{p.displayName}</span>
                      <span className="text-gray-500 text-[10px] font-medium">{p.time}</span>
                    </div>
                  </div>

                  <p className="text-[13px] text-gray-200 whitespace-pre-wrap leading-relaxed mb-2.5">
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
                    <div className="relative rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26]">
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
                    <div className="w-full aspect-[16/9] bg-gray-900 rounded-xl mb-3 flex items-center justify-center overflow-hidden border border-gray-800 relative group cursor-pointer transition-all shadow-inner">
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
          ))
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
    </div>
  );
}
