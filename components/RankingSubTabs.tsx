'use client';

interface RankingSubTabsProps {
  activeCategory: string;
  setActiveCategory: (cat: string) => void;
}

export default function RankingSubTabs({ activeCategory, setActiveCategory }: RankingSubTabsProps) {
  const categories = ['コメ', 'イイ', 'ダメ', 'フォロワー', '返信', 'スレ', 'グルチャ', '🥺'];

  return (
    <div className="flex items-center space-x-1 border-b border-gray-800 px-2 py-1 bg-gray-900/40 overflow-x-auto scrollbar-none shrink-0">
      {categories.map((cat) => {
        const isActive = activeCategory === cat;
        return (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 text-xs font-bold rounded-full whitespace-nowrap transition-all ${isActive
              ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40 shadow-[0_0_8px_rgba(59,130,246,0.15)]'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-100/5'
              }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
