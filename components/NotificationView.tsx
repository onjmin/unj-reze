'use client';

import { Heart, AtSign, Repeat2, UserPlus, MessageCircle, X, CheckCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getAvatarInfo } from '@/lib/avatar';

const tabs = ['すべて', 'メンション'];

const typeIcons: Record<string, React.ElementType> = {
  like: Heart,
  heart: Heart,
  repost: Repeat2,
  follow: UserPlus,
  reply: MessageCircle,
  mention: AtSign,
};

const typeColors: Record<string, string> = {
  like: 'text-pink-500',
  heart: 'text-pink-400',
  repost: 'text-green-500',
  follow: 'text-blue-500',
  reply: 'text-blue-400',
  mention: 'text-yellow-500',
};

interface NotificationViewProps {
  userId?: string;
}

type Notif = { id: string; user: string; action: string; target: string; time: string; type?: string; postId?: string; targetUser?: string; read?: boolean };

export default function NotificationView({ userId }: NotificationViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState('すべて');
  const [notifs, setNotifs] = useState<Notif[]>([]);

  useEffect(() => {
    api.notifications.list(userId).then(setNotifs);
  }, [userId]);

  const handleClick = (n: Notif) => {
    if (userId && !n.read) {
      api.notifications.markRead(n.id, userId).catch(() => {});
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
    if (n.type === 'follow' && n.targetUser) {
      router.push(`/user/${encodeURIComponent(n.targetUser)}`);
    } else if ((n.type === 'like' || n.type === 'heart' || n.type === 'repost' || n.type === 'reply' || n.type === 'mention') && n.postId) {
      router.push(`/post/${n.postId}`);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (userId) api.notifications.remove(id, userId).catch(() => {});
    setNotifs(prev => prev.filter(n => n.id !== id));
  };

  const handleMarkAllRead = () => {
    if (userId) api.notifications.markAllRead(userId).catch(() => {});
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  };

  const filtered = tab === 'メンション' ? notifs.filter(n => (n.type || 'like') === 'mention') : notifs;

  return (
    <div>
      <div className="flex items-center border-b border-gray-800">
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
        <button
          onClick={handleMarkAllRead}
          className="flex items-center gap-1 px-3 py-2.5 text-[10px] text-gray-500 hover:text-[#a3e635] transition-colors shrink-0"
          title="すべて既読にする"
        >
          <CheckCheck size={13} />
          <span>既読</span>
        </button>
      </div>
      <div className="divide-y divide-gray-800">
        {filtered.map(n => {
          const Icon = typeIcons[n.type || 'like'];
          const color = typeColors[n.type || 'like'];
          return (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className={`p-3.5 flex items-start space-x-3 text-xs hover:bg-gray-100/5 transition-colors cursor-pointer group ${n.read ? '' : 'bg-blue-500/5'}`}
            >
              {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
              <Icon size={16} className={`${color} shrink-0 mt-0.5 ${n.type === 'like' || n.type === 'heart' ? 'fill-current' : ''}`} />
              <div className="flex-1 min-w-0">
                <p className={n.read ? 'text-gray-400' : 'text-gray-200'}>
                  <span className="font-bold text-white mr-1">{getAvatarInfo(n.user).username}</span>
                  {n.action}
                  {n.target && <span className="text-gray-400">「{n.target}」</span>}
                </p>
                <span className="text-[10px] text-gray-600 block mt-1">{n.time}</span>
              </div>
              <button
                onClick={(e) => handleDelete(e, n.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400 p-1 shrink-0"
                title="削除"
              >
                <X size={13} />
              </button>
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
