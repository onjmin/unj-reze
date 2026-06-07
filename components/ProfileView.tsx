'use client';

import { Post } from '@/lib/types';

interface ProfileViewProps {
  userId: string;
  posts: Post[];
}

export default function ProfileView({ userId, posts }: ProfileViewProps) {
  const myPosts = posts.filter(p => p.name === userId || p.name.includes("あなた"));
  return (
    <div className="flex flex-col">
      <div className="p-4 border-b border-gray-800 bg-gradient-to-b from-gray-100/5 to-transparent">
        <div className="flex items-center space-x-3.5 mb-2.5">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-base text-white border border-gray-700">
            {userId.substring(3, 5) || "vF"}
          </div>
          <div>
            <h2 className="font-bold text-sm text-white">{userId}</h2>
            <span className="text-[10px] text-gray-500">登録: たった今 (うんｊレゼポートフォリオ)</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          自作イラストやお絵描き・改変ゲーム履歴がここにポートフォリオとして保存されます。🌱
        </p>
      </div>
      <div className="p-3 bg-gray-100/5 text-xs font-bold text-gray-400 border-b border-gray-800">
        作成・改変した作品一覧 ({myPosts.length})
      </div>
      <div className="divide-y divide-gray-800">
        {myPosts.length > 0 ? (
          myPosts.map(p => (
            <div key={p.id} className="p-3 text-xs hover:bg-gray-100/5">
              <div className="flex justify-between text-gray-500 mb-1">
                <span>{p.time}</span>
                <span>👍 {p.likes}いいね</span>
              </div>
              <p className="text-gray-300 line-clamp-2">{p.content}</p>
            </div>
          ))
        ) : (
          <div className="p-10 text-center text-xs text-gray-600">
            投稿した作品はまだありません 🍃<br />
            お絵描きやつぶやきを作成してみましょう！
          </div>
        )}
      </div>
    </div>
  );
}
