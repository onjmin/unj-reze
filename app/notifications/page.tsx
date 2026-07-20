'use client';

import Link from 'next/link';
import { ArrowLeft, Bell } from 'lucide-react';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import AppShell from '@/components/AppShell';
import NotificationView from '@/components/NotificationView';

export default function NotificationsPage() {
  const currentUser = useCurrentUser();

  return (
    <AppShell current="notifications">
      <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center px-3 h-11 gap-1.5">
          <Link href="/" className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors">
            <ArrowLeft size={18} className="text-gray-300" />
          </Link>
          <Bell size={15} className="text-[#a3e635]" />
          <span className="font-bold text-sm text-gray-200">通知</span>
        </div>
      </div>
      <div className="flex-1">
        <NotificationView userId={currentUser?.displayName} />
      </div>
    </AppShell>
  );
}
