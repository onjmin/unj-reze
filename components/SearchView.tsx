'use client';

import { Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function SearchView() {
  const [trends, setTrends] = useState<{ keyword: string; count: number }[]>([]);

  useEffect(() => {
    api.search.trends().then(setTrends);
  }, []);
  return (
    <div className="p-4 space-y-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-2.5 text-gray-500" size={16} />
        <input
          type="text"
          placeholder="掲示板内スレッド・素材を検索"
          className="w-full bg-gray-100/10 hover:bg-gray-100/15 rounded-full py-2 pl-10 pr-4 text-xs outline-none text-white transition-colors border border-gray-800"
        />
      </div>
      <div>
        <h3 className="font-bold text-xs text-gray-400 mb-2 pl-1">急上昇キーワード</h3>
        <div className="bg-gray-100/5 border border-gray-800 rounded-xl divide-y divide-gray-800/65">
          {trends.map((trend, idx) => (
            <div key={trend.keyword} className="p-3 flex justify-between items-center hover:bg-gray-100/5 transition-colors cursor-pointer text-xs">
              <div>
                <span className="text-gray-500 mr-2.5 font-bold">{idx + 1}</span>
                <span className="font-bold text-gray-200">{trend.keyword}</span>
              </div>
              <span className="text-[10px] text-gray-600">{trend.count}k スレッド</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
