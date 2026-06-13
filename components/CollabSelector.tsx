'use client';

import { X, Pen, Grid3x3 } from 'lucide-react';

interface CollabSelectorProps {
  imageUrl: string;
  onSelectDrawing: () => void;
  onSelectDotDrawing: () => void;
  onClose: () => void;
}

export default function CollabSelector({ imageUrl, onSelectDrawing, onSelectDotDrawing, onClose }: CollabSelectorProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#131720] border border-gray-700 rounded-2xl shadow-2xl w-[90vw] max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="font-bold text-sm text-gray-200">コラボ方法を選択</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          <div className="relative rounded-xl overflow-hidden border border-gray-700 mb-4 bg-[#1a1b26]">
            <img
              src={imageUrl}
              alt="コラボ元画像"
              className="max-w-full h-auto max-h-[160px] block mx-auto"
            />
          </div>

          <div className="space-y-2.5">
            <button
              onClick={onSelectDrawing}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#1a1b26] border border-gray-700 hover:border-[#a3e635]/50 hover:bg-[#1e2030] transition-all active:scale-[0.98] text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-[#a3e635]/10 flex items-center justify-center shrink-0 group-hover:bg-[#a3e635]/20 transition-colors">
                <Pen size={20} className="text-[#a3e635]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-gray-200">お絵描きコラボ</div>
                <div className="text-[10px] text-gray-500 mt-0.5">自由な線画・着色でコラボ</div>
              </div>
            </button>

            <button
              onClick={onSelectDotDrawing}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#1a1b26] border border-gray-700 hover:border-orange-400/50 hover:bg-[#1e2030] transition-all active:scale-[0.98] text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-orange-400/10 flex items-center justify-center shrink-0 group-hover:bg-orange-400/20 transition-colors">
                <Grid3x3 size={20} className="text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-gray-200">ドット絵コラボ</div>
                <div className="text-[10px] text-gray-500 mt-0.5">ドット絵風にピクセル単位でコラボ</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
