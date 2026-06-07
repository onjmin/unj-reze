'use client';

import { Heart } from 'lucide-react';

export default function NotificationView() {
  const notifs = [
    { id: 1, user: "名無しXz9", action: "がいいねしました", target: "青空の写真", time: "3分前" },
    { id: 2, user: "名無しLm8", action: "がリポストしました", target: "ドット絵の練習中", time: "8分前" },
    { id: 3, user: "名無しBn5", action: "が返信しました", target: "作業用BGM何聴いてる？", time: "15分前" },
    { id: 4, user: "名無しVc1", action: "がフォローしました", target: "", time: "1時間前" }
  ];
  return (
    <div className="divide-y divide-gray-800">
      {notifs.map(n => (
        <div key={n.id} className="p-3.5 flex items-start space-x-3 text-xs hover:bg-gray-100/5">
          <Heart size={16} className="text-pink-500 shrink-0 mt-0.5 fill-current" />
          <div>
            <p className="text-gray-300">
              <span className="font-bold text-white mr-1">{n.user}</span>
              {n.action}「{n.target}」
            </p>
            <span className="text-[10px] text-gray-600 block mt-1">{n.time}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
