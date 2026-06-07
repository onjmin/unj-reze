'use client';

import { Home, Search, Bell, Mail, User } from 'lucide-react';

interface BottomNavProps {
  current: string;
  set: (id: string) => void;
}

const items = [
  { id: 'home', icon: Home, label: 'ホーム' },
  { id: 'search', icon: Search, label: '検索' },
  { id: 'notifications', icon: Bell, label: '通知' },
  { id: 'messages', icon: Mail, label: 'メッセージ' },
  { id: 'profile', icon: User, label: 'マイ' },
];

export default function BottomNav({ current, set }: BottomNavProps) {
  return (
    <div className="flex justify-around items-center h-14 border-t border-gray-800 bg-[#0b0e14]/95 backdrop-blur pb-safe absolute bottom-0 w-full z-25">
      {items.map(item => {
        const isActive = current === item.id;
        return (
          <button
            key={item.id}
            className={`p-2 rounded-full flex flex-col items-center justify-center transition-all ${isActive ? 'text-[#a3e635]' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => set(item.id)}
            title={item.label}
          >
            <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
          </button>
        );
      })}
    </div>
  );
}
