'use client';

import { useState, useEffect } from 'react';
import { Menu, Search, Timer } from 'lucide-react';

interface HeaderProps {
  userId: string;
  server: string;
  bbsMode: string;
  onOpenDrawer: () => void;
}

export default function Header({ userId, server, bbsMode, onOpenDrawer }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState('02:03:04');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setCurrentTime(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex flex-col border-b border-gray-800 px-3 py-2 shrink-0 bg-[#0b0e14]/90 backdrop-blur z-20">
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center space-x-2">
          <span className="text-[#a3e635] font-bold text-xl tracking-tight">うんｊレゼ</span>
        </div>
        <div className="flex items-center space-x-2.5 text-xs">
          <span className="text-[#a3e635] border border-[#a3e635]/30 rounded px-2 py-0.5 font-bold bg-[#a3e635]/5">
            {bbsMode}
          </span>
          <div className="flex items-center space-x-1 bg-gray-100/10 rounded-full px-2 py-0.5">
            <Timer size={12} className="text-orange-400" />
            <span className="font-mono">{currentTime}</span>
          </div>
          <button
            onClick={onOpenDrawer}
            className="p-1 hover:bg-gray-100/10 rounded transition-colors"
            aria-label="メニューを開く"
          >
            <Menu size={22} className="text-gray-200" />
          </button>
        </div>
      </div>
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center space-x-2">
          <span className="text-gray-500">今日のID :</span>
          <span className="bg-blue-600/20 text-blue-400 border border-blue-500/35 px-2.5 py-0.5 rounded-full font-bold">
            {userId}
          </span>
          <span className="text-gray-500 ml-1">サーバ :</span>
          <span className="text-[#a3e635] font-bold">{server}</span>
        </div>
        <Search size={18} className="text-gray-500 cursor-pointer hover:text-white transition-colors" />
      </div>
    </header>
  );
}
