'use client';

import { Plus } from 'lucide-react';

export default function FAB({ openText }: { openText: () => void }) {
  return (
    <div className="fixed bottom-16 right-4 z-30 md:hidden flex flex-col items-end">
      <button
        onClick={openText}
        className="w-12 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(37,99,235,0.4)] transition-all duration-300 active:scale-95"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
