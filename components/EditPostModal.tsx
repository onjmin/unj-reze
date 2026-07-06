'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface EditPostModalProps {
  initialContent: string;
  onClose: () => void;
  onSave: (content: string) => void;
}

export default function EditPostModal({ initialContent, onClose, onSave }: EditPostModalProps) {
  const [content, setContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(initialContent.length, initialContent.length);
  }, [initialContent]);

  const handleSave = () => {
    if (!content.trim() || content === initialContent) return;
    onSave(content);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto px-3 pt-12 pb-6 md:pt-24" onClick={(e) => e.stopPropagation()}>
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full md:max-w-2xl lg:max-w-3xl bg-[#0b0e14] rounded-xl border border-gray-800 shadow-2xl p-3 md:p-6 flex flex-col space-y-2 md:space-y-4 animate-fade-in-up">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs md:text-base font-bold text-gray-400">ポストを編集</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors">
            <X size={16} className="md:hidden" />
            <X size={22} className="hidden md:block" />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full bg-gray-100/10 hover:bg-gray-100/15 focus:bg-gray-100/15 rounded-xl px-3 py-2.5 md:px-5 md:py-4 focus:outline-none transition-all placeholder:text-gray-500 text-sm md:text-lg resize-none h-28 md:h-56 text-gray-100"
          placeholder="ポストの内容"
        />
        <div className="flex justify-end items-center space-x-2 md:space-x-3">
          <button
            onClick={onClose}
            className="text-gray-400 font-bold px-4 py-1.5 md:px-6 md:py-2.5 rounded-full text-xs md:text-sm hover:bg-gray-100/10 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim() || content === initialContent}
            className="bg-blue-600 text-white font-bold px-4 py-1.5 md:px-6 md:py-2.5 rounded-full text-xs md:text-sm hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
