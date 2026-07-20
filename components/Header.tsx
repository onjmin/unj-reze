'use client';

import { useState, useEffect } from 'react';
import { Menu, Hourglass } from 'lucide-react';
import VolumeControl from './VolumeControl';

interface HeaderProps {
  userId: string;
  server: string;
  bbsMode: string;
  onOpenSettings: () => void;
  onToggleBbsMode: () => void;
}

export default function Header({
  userId, server, bbsMode, onOpenSettings, onToggleBbsMode,
}: HeaderProps) {
  const [currentTime, setCurrentTime] = useState('00:00:00');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const diffMs = tomorrow.getTime() - now.getTime();
      const totalSecs = Math.max(0, Math.floor(diffMs / 1000));

      const hours = Math.floor(totalSecs / 3600);
      const minutes = Math.floor((totalSecs % 3600) / 60);
      const seconds = totalSecs % 60;

      const pad = (n: number) => String(n).padStart(2, '0');
      setCurrentTime(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex flex-col border-b border-gray-800 px-3 py-2 shrink-0 bg-[#0b0e14]/90 backdrop-blur z-20">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <span className="text-[#a3e635] font-bold text-xl tracking-tight">うんｊレゼ</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleBbsMode}
            className={`px-3 py-0.5 rounded-full text-[11px] font-bold border transition-colors ${
              bbsMode === '掲示板モード'
                ? 'bg-[#a3e635]/15 text-[#a3e635] border-[#a3e635]/55 hover:bg-[#a3e635]/25'
                : 'bg-blue-500/10 text-blue-400 border-blue-500/35 hover:bg-blue-500/20'
            }`}
          >
            {bbsMode}
          </button>
          <VolumeControl />
          <button
            onClick={onOpenSettings}
            className="p-1.5 hover:bg-gray-100/10 rounded-full transition-colors text-gray-500 hover:text-gray-300"
            aria-label="メニューを開く"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>
      <div className="flex justify-between items-center text-[10px] mt-1.5 px-0.5">
        <div className="flex items-center space-x-1.5">
          <span className="text-gray-600">ID:</span>
          <span className="bg-blue-600/20 text-blue-400 border border-blue-500/35 px-2 py-0.5 rounded-full font-bold leading-none">
            {userId ? userId.slice(0, 3) : ''}
          </span>
          <span className="text-gray-600 ml-0.5">サーバ:</span>
          <span className="text-[#a3e635] font-bold">{server}</span>
        </div>
        <div className="flex items-center space-x-1 bg-gray-100/10 rounded-full px-2 py-0.5">
          <Hourglass size={10} className="text-orange-400 animate-pulse" />
          <span className="font-mono text-gray-400">{currentTime}</span>
        </div>
      </div>
    </header>
  );
}
