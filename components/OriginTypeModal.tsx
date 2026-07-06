'use client';

import { X, Check } from 'lucide-react';
import { OriginType, ORIGIN_TYPE_OPTIONS } from '@/lib/types';

interface OriginTypeModalProps {
  value?: OriginType;
  onClose: () => void;
  onSelect: (value: OriginType | undefined) => void;
}

export default function OriginTypeModal({ value, onClose, onSelect }: OriginTypeModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto px-3 pt-16" onClick={(e) => e.stopPropagation()}>
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-[#0b0e14] rounded-xl border border-gray-800 shadow-2xl p-3 flex flex-col space-y-2 animate-fade-in-up">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-gray-400">権利表記を設定</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col divide-y divide-gray-800/70 border border-gray-800 rounded-lg overflow-hidden">
          <button
            onClick={() => onSelect(undefined)}
            className="flex items-center justify-between px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-100/10 transition-colors text-left"
          >
            <span>申告なし（デフォルト）</span>
            {value === undefined && <Check size={16} className="text-blue-400 shrink-0" />}
          </button>
          {ORIGIN_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className="flex items-center justify-between px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-100/10 transition-colors text-left"
            >
              <span className="flex items-center gap-2">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${opt.badgeClass}`}>{opt.label}</span>
              </span>
              {value === opt.value && <Check size={16} className="text-blue-400 shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
