'use client';

import { Heart } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function NotificationView() {
  const [notifs, setNotifs] = useState<{ id: number; user: string; action: string; target: string; time: string }[]>([]);

  useEffect(() => {
    api.notifications.list().then(setNotifs);
  }, []);
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
