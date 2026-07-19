'use client';

import { useState } from 'react';
import { Home, Search, Bell, Mail, User, PenSquare } from 'lucide-react';

interface LeftSidebarProps {
  current: string;
  set: (id: string) => void;
  notifCount?: number;
  messageCount?: number;
  userAvatarUrl?: string;
  onPost: () => void;
}

const items = [
  { id: 'home', icon: Home, label: 'ホーム' },
  { id: 'search', icon: Search, label: '話題を検索' },
  { id: 'notifications', icon: Bell, label: '通知' },
  { id: 'messages', icon: Mail, label: 'メッセージ' },
  { id: 'profile', icon: User, label: 'マイページ' },
];

export default function LeftSidebar({ current, set, notifCount = 0, messageCount = 0, userAvatarUrl, onPost }: LeftSidebarProps) {
  const badgeMap: Record<string, number> = {
    notifications: notifCount,
    messages: messageCount,
  };
  const [avatarBroken, setAvatarBroken] = useState(false);

  return (
    <div className="hidden md:flex flex-col justify-between w-[68px] xl:w-64 h-dvh shrink-0 px-2 xl:px-3 py-4 border-r border-gray-800">
      <div className="flex flex-col gap-1">
        {items.map(item => {
          const isActive = current === item.id;
          const badge = badgeMap[item.id] || 0;
          const showAvatar = item.id === 'profile' && !!userAvatarUrl && !avatarBroken;
          return (
            <button
              key={item.id}
              className={`flex items-center gap-4 px-3 py-3 rounded-full transition-all w-fit xl:w-full ${isActive ? 'text-[#a3e635]' : 'text-gray-300 hover:text-white'} hover:bg-white/10`}
              onClick={() => set(item.id)}
              title={item.label}
            >
              <span className="relative inline-flex shrink-0">
                {showAvatar ? (
                  <img
                    src={userAvatarUrl}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover border border-gray-700/50"
                    onError={() => setAvatarBroken(true)}
                  />
                ) : (
                  <item.icon size={26} strokeWidth={isActive ? 2.5 : 2} />
                )}
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none shadow-lg">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className="hidden xl:inline text-lg truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onPost}
        className="flex items-center justify-center gap-2 bg-[#a3e635] hover:bg-[#bef264] text-black font-bold rounded-full h-12 w-12 xl:w-full transition-colors"
        title="ポストする"
      >
        <PenSquare size={20} className="xl:hidden" />
        <span className="hidden xl:inline">ポストする</span>
      </button>
    </div>
  );
}
