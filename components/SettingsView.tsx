'use client';

import { Settings } from 'lucide-react';
import { AnonymousUser } from '@/lib/types';
import SettingsPanel from './SettingsPanel';

interface SettingsViewProps {
  userId: string;
  bbsMode: string;
  setBbsMode: (m: string) => void;
  currentUser?: AnonymousUser | null;
}

export default function SettingsView({ userId, bbsMode, setBbsMode, currentUser }: SettingsViewProps) {
  return (
    <div>
      <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800 px-4 py-3 font-bold text-sm text-gray-200 flex items-center gap-1.5">
        <Settings size={15} className="text-[#a3e635]" />
        設定とプライバシー
      </div>
      <SettingsPanel userId={userId} bbsMode={bbsMode} setBbsMode={setBbsMode} currentUser={currentUser} />
    </div>
  );
}
