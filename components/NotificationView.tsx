'use client';

import { Heart } from 'lucide-react';

export default function NotificationView() {
  const notifs = [
    { id: 1, user: "名無しyCK", action: "がいいねしました", target: "ねるネルねるね", time: "5分前" },
    { id: 2, user: "名無しrvf", action: "が改変リポストしました", target: "お絵かきツール", time: "12分前" }
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
