'use client';

import { X, Trash2 } from 'lucide-react';

interface DeletePostModalProps {
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeletePostModal({ onClose, onConfirm }: DeletePostModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative mt-24 mx-3 md:mx-auto md:max-w-sm bg-[#0b0e14] rounded-xl border border-gray-800 shadow-2xl p-4 flex flex-col space-y-3 animate-fade-in-up">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
            <Trash2 size={14} className="text-red-400" />
            ポストを削除
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-gray-300">このポストを削除しますか？この操作は取り消せません。</p>
        <div className="flex justify-end items-center space-x-2">
          <button
            onClick={onClose}
            className="text-gray-400 font-bold px-4 py-1.5 rounded-full text-xs hover:bg-gray-100/10 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="bg-red-600 text-white font-bold px-4 py-1.5 rounded-full text-xs hover:bg-red-500 transition-colors"
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  );
}
