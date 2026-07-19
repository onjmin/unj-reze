'use client';

export type FeedSubMode = 'threads' | 'replies' | 'media';

interface TopTabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  feedSubMode: FeedSubMode;
  setFeedSubMode: (mode: FeedSubMode) => void;
  latestThreadCount?: number;
  latestReplyCount?: number;
  mediaCount?: number;
}

function formatCount(n: number) {
  return n > 99 ? '99+' : String(n);
}

export default function TopTabs({ activeTab, setActiveTab, feedSubMode, setFeedSubMode, latestThreadCount = 0, latestReplyCount = 0, mediaCount = 0 }: TopTabsProps) {
  return (
    <div className="flex flex-col border-b border-gray-800 shrink-0 bg-[#0b0e14] z-10">
      <div className="flex px-2 py-2.5 font-bold text-sm text-gray-500">
        <button
          onClick={() => setActiveTab('everyone')}
          className={`flex-1 pb-1 transition-colors ${activeTab === 'everyone' ? 'text-gray-100 border-b-2 border-blue-500' : 'hover:text-gray-300'}`}
        >
          みんな
        </button>
        <button
          onClick={() => setActiveTab('following')}
          className={`flex-1 pb-1 transition-colors ${activeTab === 'following' ? 'text-gray-100 border-b-2 border-blue-500' : 'hover:text-gray-300'}`}
        >
          フォロー中
        </button>
        <button
          onClick={() => setActiveTab('ranking')}
          className={`flex-1 pb-1 transition-colors ${activeTab === 'ranking' ? 'text-gray-100 border-b-2 border-blue-500' : 'hover:text-gray-300'}`}
        >
          ランキング
        </button>
        <button
          onClick={() => setActiveTab('game')}
          className={`flex-1 pb-1 transition-colors ${activeTab === 'game' ? 'text-gray-100 border-b-2 border-blue-500' : 'hover:text-gray-300'}`}
        >
          ゲーム
        </button>
      </div>
      <div className="flex px-2 py-1.5 text-xs bg-gray-100/5 text-gray-400 border-t border-gray-800/40">
        <button
          onClick={() => setFeedSubMode('threads')}
          className={`flex-1 flex items-center justify-center transition-colors ${feedSubMode === 'threads' ? 'font-bold text-gray-100' : 'hover:text-gray-300'}`}
        >
          最新スレ <span className={`text-white text-[9px] rounded-full px-1.5 ml-1 font-bold ${feedSubMode === 'threads' ? 'bg-blue-600' : 'bg-blue-600/50'}`}>{formatCount(latestThreadCount)}</span>
        </button>
        <button
          onClick={() => setFeedSubMode('replies')}
          className={`flex-1 flex items-center justify-center transition-colors ${feedSubMode === 'replies' ? 'font-bold text-gray-100' : 'hover:text-gray-300'}`}
        >
          最新レス <span className={`text-white text-[9px] rounded-full px-1.5 ml-1 font-bold ${feedSubMode === 'replies' ? 'bg-blue-600' : 'bg-blue-600/50'}`}>{formatCount(latestReplyCount)}</span>
        </button>
        <button
          onClick={() => setFeedSubMode('media')}
          className={`flex-1 flex items-center justify-center transition-colors ${feedSubMode === 'media' ? 'font-bold text-gray-100' : 'hover:text-gray-300'}`}
        >
          メディア <span className={`text-white text-[9px] rounded-full px-1.5 ml-1 font-bold ${feedSubMode === 'media' ? 'bg-blue-600' : 'bg-blue-600/50'}`}>{formatCount(mediaCount)}</span>
        </button>
      </div>
    </div>
  );
}
