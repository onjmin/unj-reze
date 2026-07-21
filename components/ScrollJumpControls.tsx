'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';
import { useScrollNav } from '@/lib/hooks/useScrollNav';

/** 一定距離スクロールしたときだけ出る「先頭へ／末尾へ」ジャンプボタン。
 *  モバイルは右下のFAB・ボトムナビと重ならないよう左下に置く。 */
export default function ScrollJumpControls() {
  const { scrolled, footerHidden, scrollToTop, scrollToBottom } = useScrollNav();

  return (
    <div
      className={`absolute left-3 z-30 flex flex-col gap-1.5 transition-all duration-200 md:bottom-6 ${
        footerHidden ? 'bottom-4' : 'bottom-16'
      } ${scrolled ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
    >
      <button
        onClick={scrollToTop}
        aria-label="先頭へ移動"
        title="先頭へ"
        className="w-9 h-9 rounded-full bg-[#0b0e14]/90 backdrop-blur border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 shadow-lg flex items-center justify-center transition-colors active:scale-95"
      >
        <ChevronUp size={18} />
      </button>
      <button
        onClick={scrollToBottom}
        aria-label="末尾へ移動"
        title="末尾へ"
        className="w-9 h-9 rounded-full bg-[#0b0e14]/90 backdrop-blur border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 shadow-lg flex items-center justify-center transition-colors active:scale-95"
      >
        <ChevronDown size={18} />
      </button>
    </div>
  );
}
