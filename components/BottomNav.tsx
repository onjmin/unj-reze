'use client';

import { Home, Search, Bell, Mail, User } from 'lucide-react';

interface BottomNavProps {
  current: string;
  set: (id: string) => void;
  notifCount?: number;
  messageCount?: number;
}

const items = [
  { id: 'home', icon: Home, label: 'ホーム' },
  { id: 'search', icon: Search, label: '検索' },
  { id: 'notifications', icon: Bell, label: '通知' },
  { id: 'messages', icon: Mail, label: 'メッセージ' },
  { id: 'profile', icon: User, label: 'マイ' },
];

export default function BottomNav({ current, set, notifCount = 0, messageCount = 0 }: BottomNavProps) {
  const badgeMap: Record<string, number> = {
    notifications: notifCount,
    messages: messageCount,
  };

  return (
    <div className="flex justify-around items-center h-14 border-t border-gray-800 bg-[#0b0e14]/95 backdrop-blur pb-safe absolute bottom-0 w-full z-25">
      {items.map(item => {
        const isActive = current === item.id;
        const badge = badgeMap[item.id] || 0;
        return (
          <button
            key={item.id}
            className={`relative p-2 rounded-full flex flex-col items-center justify-center transition-all ${isActive ? 'text-[#a3e635]' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => set(item.id)}
            title={item.label}
          >
            <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            {badge > 0 && (
              <span className="absolute -top-0.5 right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none shadow-lg animate-pop">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
