'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { api } from '@/lib/api';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import BottomNav from './BottomNav';

interface AppShellProps {
  /** LeftSidebar / BottomNav のどの項目をハイライトするか（例: 'settings'） */
  current: string;
  children: React.ReactNode;
}

/** 設定/通知/メッセージ/検索/リンク/プロフィールなど、独立ルート化した各ページで
 * PC版の左右サイドメニューおよびモバイル版のボトムナビを共通描画するためのシェル。 */
export default function AppShell({ current, children }: AppShellProps) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [notifCount, setNotifCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    const displayName = currentUser?.displayName;
    if (!displayName) return;
    api.notifications.unreadCount(displayName).then(({ count }) => setNotifCount(count)).catch(() => {});
    api.messages.list(displayName).then(msgs => setMessageCount(msgs.length)).catch(() => {});
  }, [currentUser?.displayName]);

  return (
    <div className="bg-[#0b0e14] text-gray-100 h-dvh w-full flex justify-center overflow-hidden select-none font-sans">
      <LeftSidebar
        current={current}
        set={(id) => { if (id === 'home') router.push('/'); }}
        notifCount={notifCount}
        messageCount={messageCount}
        userAvatarUrl={currentUser?.avatarUrl}
        userSlug={currentUser?.slug}
        onPost={() => router.push('/')}
      />
      <div className="relative w-full max-w-2xl border-x border-gray-800 h-dvh flex flex-col shrink-0 overflow-hidden pb-14 md:pb-0">
        {children}
        <BottomNav
          current={current}
          set={(id) => { if (id === 'home') router.push('/'); }}
          notifCount={notifCount}
          messageCount={messageCount}
          userAvatarUrl={currentUser?.avatarUrl}
          userSlug={currentUser?.slug}
        />
      </div>
      <RightSidebar onSearch={(q) => router.push(`/search?q=${encodeURIComponent(q)}`)} />
    </div>
  );
}
