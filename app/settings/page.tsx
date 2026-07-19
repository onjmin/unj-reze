'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings } from 'lucide-react';
import { AnonymousUser } from '@/lib/types';
import { api } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import SettingsPanel from '@/components/SettingsPanel';

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(`(?:^|;\\s*)${name}=([^;]*)`);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export default function SettingsPage() {
  const [userId, setUserId] = useState('');
  const [currentUser, setCurrentUser] = useState<AnonymousUser | null>(null);
  const [bbsMode, setBbsModeRaw] = useState('SNSモード');
  const inited = useRef(false);

  const setBbsMode = (m: string) => {
    setBbsModeRaw(m);
    if (typeof localStorage !== 'undefined') localStorage.setItem('unj_bbs_mode', m);
  };

  useEffect(() => {
    if (inited.current) return;
    inited.current = true;

    const savedMode = typeof localStorage !== 'undefined' ? localStorage.getItem('unj_bbs_mode') : null;
    if (savedMode) setBbsModeRaw(savedMode);

    try {
      const cached = typeof localStorage !== 'undefined' ? localStorage.getItem('unj_current_user') : null;
      if (cached) {
        const user = JSON.parse(cached);
        setUserId(user.displayName);
        setCurrentUser(user);
      }
    } catch {}

    const sessionId = getCookie('unj_reze_session');
    if (sessionId) {
      api.auth.anonymous(sessionId).then(user => {
        setUserId(user.displayName);
        setCurrentUser(user);
        localStorage.setItem('unj_current_user', JSON.stringify(user));
      }).catch(() => {});
    }
  }, []);

  return (
    <div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col">
      <div className="w-full max-w-2xl mx-auto border-x border-gray-800 flex-1 flex flex-col">
        <PageHeader title="設定とプライバシー" icon={<Settings size={15} className="text-[#a3e635]" />} />
        <div className="flex-1 overflow-y-auto">
          <SettingsPanel userId={userId} bbsMode={bbsMode} setBbsMode={setBbsMode} currentUser={currentUser} />
        </div>
      </div>
    </div>
  );
}
