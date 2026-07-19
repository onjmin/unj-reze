'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, Search, Bell, Mail, User } from 'lucide-react';

interface BottomNavProps {
  current: string;
  set: (id: string) => void;
  notifCount?: number;
  messageCount?: number;
  userAvatarUrl?: string;
  userSlug?: string;
}

const items = [
  { id: 'home', icon: Home, label: 'ホーム' },
  { id: 'search', icon: Search, label: '話題を検索' },
  { id: 'notifications', icon: Bell, label: '通知' },
  { id: 'messages', icon: Mail, label: 'メッセージ' },
  { id: 'profile', icon: User, label: 'マイページ' },
];

export default function BottomNav({ current, set, notifCount = 0, messageCount = 0, userAvatarUrl, userSlug }: BottomNavProps) {
  const router = useRouter();
  const badgeMap: Record<string, number> = {
    notifications: notifCount,
    messages: messageCount,
  };
  const [avatarBroken, setAvatarBroken] = useState(false);

  const handleItemClick = (id: string) => {
    if (id === 'search') {
      router.push('/search');
      return;
    }
    if (id === 'profile' && userSlug) {
      router.push(`/user/${userSlug}`);
      return;
    }
    if (id === 'notifications') {
      router.push('/notifications');
      return;
    }
    if (id === 'messages') {
      router.push('/messages');
      return;
    }
    set(id);
  };

  return (
    <div className="md:hidden flex justify-around items-center h-14 border-t border-gray-800 bg-[#0b0e14]/95 backdrop-blur pb-safe absolute bottom-0 w-full z-25">
      {items.map(item => {
        const isActive = current === item.id;
        const badge = badgeMap[item.id] || 0;
        const showAvatar = item.id === 'profile' && !!userAvatarUrl && !avatarBroken;
        return (
          <button
            key={item.id}
            className={`flex-1 min-w-0 px-1 py-2 rounded-full flex flex-col items-center justify-center gap-0.5 transition-all ${isActive ? 'text-[#a3e635]' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => handleItemClick(item.id)}
            title={item.label}
          >
            <span className="relative inline-flex">
              {showAvatar ? (
                <img
                  src={userAvatarUrl}
                  alt=""
                  className="w-[22px] h-[22px] rounded-full object-cover border border-gray-700/50"
                  onError={() => setAvatarBroken(true)}
                />
              ) : (
                <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              )}
              {badge > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none shadow-lg animate-pop">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
            <span className="text-[9px] leading-none truncate max-w-full">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
