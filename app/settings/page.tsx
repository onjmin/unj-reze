'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import SettingsView from '@/components/SettingsView';

export default function SettingsPage() {
  const currentUser = useCurrentUser();
  const [bbsMode, setBbsModeRaw] = useState('SNSモード');

  const setBbsMode = (m: string) => {
    setBbsModeRaw(m);
    if (typeof localStorage !== 'undefined') localStorage.setItem('unj_bbs_mode', m);
  };

  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('unj_bbs_mode') : null;
    if (saved) setBbsModeRaw(saved);
  }, []);

  return (
    <div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col">
      <div className="w-full max-w-2xl mx-auto border-x border-gray-800 flex-1 flex flex-col">
        <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
          <div className="flex items-center px-3 h-11">
            <Link href="/" className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors">
              <ArrowLeft size={18} className="text-gray-300" />
            </Link>
          </div>
        </div>
        <SettingsView
          userId={currentUser?.displayName || ''}
          bbsMode={bbsMode}
          setBbsMode={setBbsMode}
          currentUser={currentUser}
        />
      </div>
    </div>
  );
}
