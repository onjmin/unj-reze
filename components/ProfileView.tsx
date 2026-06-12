'use client';

import { useState, useMemo } from 'react';
import { Post } from '@/lib/types';
import { MessageCircle, Heart, ThumbsUp, ThumbsDown, Image, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ProfileViewProps {
  userId: string;
  displayName?: string;
  posts: Post[];
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

export default function ProfileView({ userId, displayName, posts }: ProfileViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('threads');

  const myPosts = useMemo(() =>
    posts.filter(p =>
      p.slug === userId || p.displayName === userId
    ), [posts, userId]);

  const threads = useMemo(() => myPosts.filter(p => p.id === p.threadId), [myPosts]);
  const replies = useMemo(() => myPosts.filter(p => p.id !== p.threadId), [myPosts]);
  const mediaPosts = useMemo(() => myPosts.filter(p => p.hasImage), [myPosts]);

  const totalHearts = useMemo(() => myPosts.reduce((s, p) => s + p.heartsTotal, 0), [myPosts]);
  const totalLikes = useMemo(() => myPosts.reduce((s, p) => s + p.likes, 0), [myPosts]);
  const totalDislikes = useMemo(() => myPosts.reduce((s, p) => s + p.dislikes, 0), [myPosts]);

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
      case 'hearts': return [...myPosts].sort((a, b) => b.heartsTotal - a.heartsTotal);
      case 'likes': return [...myPosts].sort((a, b) => b.likes - a.likes);
      case 'dislikes': return [...myPosts].sort((a, b) => b.dislikes - a.dislikes);
      case 'media': return mediaPosts;
      default: return threads;
    }
  }, [activeTab, myPosts, threads, replies, mediaPosts]);

  const resolvedName = displayName || myPosts[0]?.displayName || userId;

  const handlePostClick = (postId: number) => {
    router.push(`/post/${postId}`);
  };

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
            <span className="font-bold text-white">12</span>{' '}フォロー
          </button>
          <button className="text-gray-400 hover:text-white transition-colors">
            <span className="font-bold text-white">8</span>{' '}フォロワー
          </button>
        </div>
      </div>

      <div className="flex border-b border-gray-800 overflow-x-auto scrollbar-none">
        {stats.map(s => {
          const isActive = activeTab === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveTab(s.id)}
              className={`flex flex-col items-center justify-center flex-1 min-w-0 py-2.5 px-1 transition-colors relative ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <span className="text-[15px] font-extrabold leading-none">{s.value}</span>
              <span className="text-[10px] mt-0.5 whitespace-nowrap">{s.label}</span>
              {isActive && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-[#a3e635] rounded-full" />}
            </button>
          );
        })}
      </div>

      <div className="flex border-b border-gray-800 overflow-x-auto scrollbar-none bg-gray-100/[0.02]">
        {tabs.map(t => {
          const isActive = activeTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center justify-center gap-1.5 flex-1 min-w-0 py-2.5 px-2 text-xs font-bold transition-colors ${isActive ? 'text-[#a3e635] border-b-2 border-[#a3e635]' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
              <span className="whitespace-nowrap">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
        {filteredPosts.length > 0 ? (
          filteredPosts.map(p => (
            <div
              key={p.id}
              onClick={() => handlePostClick(p.id)}
              className="p-3 text-xs hover:bg-gray-100/5 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between text-gray-500 mb-1">
                <div className="flex items-center space-x-2">
                  {p.id === p.threadId ? (
                    <FileText size={12} className="shrink-0 text-blue-400" />
                  ) : (
                    <MessageCircle size={12} className="shrink-0 text-green-400" />
                  )}
                  <span>{p.time}</span>
                  {p.hasImage && <Image size={12} className="text-orange-400" />}
                </div>
                <div className="flex items-center space-x-2.5">
                  <span className="flex items-center gap-0.5"><ThumbsUp size={10} />{p.likes}</span>
                  <span className="flex items-center gap-0.5"><ThumbsDown size={10} />{p.dislikes}</span>
                  <span className="flex items-center gap-0.5"><Heart size={10} className="text-pink-500" />{p.heartsTotal}</span>
                  <span className="flex items-center gap-0.5"><MessageCircle size={10} />{p.repliesCount}</span>
                </div>
              </div>
              <p className="text-gray-300 line-clamp-2 leading-relaxed">{p.content}</p>
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
