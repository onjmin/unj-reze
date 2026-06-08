'use client';

import { useRef, useEffect } from 'react';
import { X, Pen, PlaySquare, Music } from 'lucide-react';

interface PostComposerProps {
  userId: string;
  text: string;
  setText: (v: string) => void;
  image: string | null;
  setImage: (v: string | null) => void;
  onClose: () => void;
  onSubmit: () => void;
  onOpenDrawing: () => void;
  onOpenGame: () => void;
  onOpenMml: () => void;
}

export default function PostComposer({ userId, text, setText, image, setImage, onClose, onSubmit, onOpenDrawing, onOpenGame, onOpenMml }: PostComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative mt-12 mx-3 bg-[#0b0e14] rounded-xl border border-gray-800 shadow-2xl p-3 flex flex-col space-y-2 animate-fade-in-up">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-gray-400">新規ポスト</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex items-start space-x-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shrink-0 border border-gray-700/50 flex items-center justify-center font-bold text-xs text-white">
            {userId.substring(3, 5) || "vF"}
          </div>
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full bg-gray-100/10 hover:bg-gray-100/15 focus:bg-gray-100/15 rounded-xl px-3 py-2.5 focus:outline-none transition-all placeholder:text-gray-500 text-sm resize-none h-24 text-gray-100"
              placeholder="いまどうしてる？ #お絵描き #ゲーム"
            />
            {image && (
              <div className="relative mt-2 rounded-lg overflow-hidden border border-gray-800 max-w-[180px]">
                <img src={image} alt="添付お絵描き" className="w-full h-auto" />
                <button
                  onClick={() => setImage(null)}
                  className="absolute top-1 right-1 bg-black/85 p-1 rounded-full text-white hover:bg-red-500"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center pl-12">
          <div className="flex space-x-2 text-gray-500">
            <button
              onClick={onOpenDrawing}
              className="p-2 hover:bg-gray-100/10 rounded-full hover:text-[#a3e635] transition-colors"
              title="イラストを描く"
            >
              <Pen size={18} />
            </button>
            <button
              onClick={onOpenGame}
              className="p-2 hover:bg-gray-100/10 rounded-full hover:text-purple-400 transition-colors"
              title="ゲームを起動"
            >
              <PlaySquare size={18} />
            </button>
            <button
              onClick={onOpenMml}
              className="p-2 hover:bg-gray-100/10 rounded-full hover:text-pink-400 transition-colors"
              title="MML作曲"
            >
              <Music size={18} />
            </button>
          </div>
          <button
            onClick={onSubmit}
            disabled={!text.trim() && !image}
            className="bg-blue-600 text-white font-bold px-4 py-1.5 rounded-full text-xs hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            投稿
          </button>
        </div>
      </div>
    </div>
  );
}
