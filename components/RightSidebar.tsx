'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface RightSidebarProps {
  onSearch: (query: string) => void;
}

export default function RightSidebar({ onSearch }: RightSidebarProps) {
  const router = useRouter();
  const [trends, setTrends] = useState<{ keyword: string; count: number }[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.search.trends().then(setTrends);
  }, []);

  const handleTrendClick = (keyword: string) => {
    if (keyword.startsWith('#')) {
      router.push(`/hashtag/${encodeURIComponent(keyword.slice(1))}`);
      return;
    }
    setQuery(keyword);
    onSearch(keyword);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query);
  };

  return (
    <div className="hidden lg:flex flex-col w-80 shrink-0 h-dvh sticky top-0 overflow-y-auto scrollbar-none px-4 py-4 gap-4 border-l border-gray-800">
      <form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-3.5 top-2.5 text-gray-500" size={16} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="掲示板内スレッド・素材を検索"
          className="w-full bg-[#161b22] border border-gray-800 rounded-full pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none"
        />
      </form>

      {trends.length > 0 && (
        <div className="bg-[#0f1420] border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 font-bold text-base border-b border-gray-800">「いま」を見つけよう</div>
          {trends.slice(0, 6).map((t, i) => (
            <button
              key={i}
              onClick={() => handleTrendClick(t.keyword)}
              className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-gray-800 last:border-b-0"
            >
              <div className="text-xs text-gray-500">トレンド</div>
              <div className="text-sm font-semibold text-gray-100 truncate">{t.keyword}</div>
              <div className="text-xs text-gray-500">{t.count}件の投稿</div>
            </button>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1.5 px-2 pb-4">
        <Link href="/terms" className="hover:text-gray-300 hover:underline transition-colors">利用規約</Link>
        <Link href="/privacy" className="hover:text-gray-300 hover:underline transition-colors">プライバシーポリシー</Link>
        <Link href="/cookies" className="hover:text-gray-300 hover:underline transition-colors">Cookie</Link>
        <Link href="/accessibility" className="hover:text-gray-300 hover:underline transition-colors">アクセシビリティ</Link>
        <Link href="/settings" className="hover:text-gray-300 hover:underline transition-colors">設定とプライバシー</Link>
        <span className="text-gray-600">© {new Date().getFullYear()} unj-reze</span>
      </div>
    </div>
  );
}
