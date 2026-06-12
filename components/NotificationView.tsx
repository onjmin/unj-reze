'use client';

import { Heart, AtSign, Repeat2, UserPlus, MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const tabs = ['すべて', 'メンション'];

const typeIcons: Record<string, React.ElementType> = {
  like: Heart,
  repost: Repeat2,
  follow: UserPlus,
  reply: MessageCircle,
  mention: AtSign,
};

const typeColors: Record<string, string> = {
  like: 'text-pink-500',
  repost: 'text-green-500',
  follow: 'text-blue-500',
  reply: 'text-blue-400',
  mention: 'text-yellow-500',
};

export default function NotificationView() {
  const router = useRouter();
  const [tab, setTab] = useState('すべて');
  const [notifs, setNotifs] = useState<{ id: number; user: string; action: string; target: string; time: string; type?: string; postId?: number; targetUser?: string }[]>([]);

  useEffect(() => {
    api.notifications.list().then(setNotifs);
  }, []);

  const handleClick = (n: typeof notifs[0]) => {
    if (n.type === 'follow' && n.targetUser) {
      router.push(`/user/${encodeURIComponent(n.targetUser)}`);
    } else if ((n.type === 'like' || n.type === 'repost' || n.type === 'reply' || n.type === 'mention') && n.postId) {
      router.push(`/post/${n.postId}`);
    }
  };

  const filtered = tab === 'メンション' ? notifs.filter(n => (n.type || 'like') === 'mention') : notifs;

  return (
    <div>
      <div className="flex border-b border-gray-800">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors relative ${tab === t ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {t}
            {tab === t && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-[#a3e635] rounded-full" />}
          </button>
        ))}
      </div>
      <div className="divide-y divide-gray-800">
        {filtered.map(n => {
          const Icon = typeIcons[n.type || 'like'];
          const color = typeColors[n.type || 'like'];
          return (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className="p-3.5 flex items-start space-x-3 text-xs hover:bg-gray-100/5 transition-colors cursor-pointer"
            >
              <Icon size={16} className={`${color} shrink-0 mt-0.5 ${n.type === 'like' ? 'fill-current' : ''}`} />
              <div className="flex-1 min-w-0">
                <p className="text-gray-300">
                  <span className="font-bold text-white mr-1">{n.user}</span>
                  {n.action}
                  {n.target && <span className="text-gray-400">「{n.target}」</span>}
                </p>
                <span className="text-[10px] text-gray-600 block mt-1">{n.time}</span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-10 text-center text-xs text-gray-600">
            通知はまだありません
          </div>
        )}
      </div>
    </div>
  );
}
