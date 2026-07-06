'use client';

import { useRef, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { X, Pen, Grid3x3, Music, Gamepad2 } from 'lucide-react';
import { OriginType, ORIGIN_TYPE_OPTIONS } from '@/lib/types';
import OriginTypeModal from './OriginTypeModal';

const MmlPlayer = dynamic(() => import('./MmlPlayer'), { ssr: false });

interface PostComposerProps {
  userId: string;
  text: string;
  setText: (v: string) => void;
  image: string | null;
  setImage: (v: string | null) => void;
  mml: string | null;
  setMml: (v: string | null) => void;
  originType?: OriginType;
  setOriginType: (v: OriginType | undefined) => void;
  onClose: () => void;
  onSubmit: () => void;
  onOpenDrawing: () => void;
  onOpenDotDrawing: () => void;
  onOpenMml: () => void;
  onOpenGameMaker: () => void;
}

export default function PostComposer({ userId, text, setText, image, setImage, mml, setMml, originType, setOriginType, onClose, onSubmit, onOpenDrawing, onOpenDotDrawing, onOpenMml, onOpenGameMaker }: PostComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showOriginModal, setShowOriginModal] = useState(false);
  const originOption = ORIGIN_TYPE_OPTIONS.find(o => o.value === originType);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto px-3 pt-12 pb-6 md:pt-24">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full md:max-w-2xl lg:max-w-3xl bg-[#0b0e14] rounded-xl border border-gray-800 shadow-2xl p-3 md:p-6 flex flex-col space-y-2 md:space-y-4 animate-fade-in-up">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs md:text-base font-bold text-gray-400">新規ポスト</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors">
            <X size={16} className="md:hidden" />
            <X size={22} className="hidden md:block" />
          </button>
        </div>
        <div className="flex items-start space-x-3 md:space-x-4">
          <div className="w-9 h-9 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shrink-0 border border-gray-700/50 flex items-center justify-center font-bold text-xs md:text-sm text-white">
            {userId.substring(3, 5) || "vF"}
          </div>
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full bg-gray-100/10 hover:bg-gray-100/15 focus:bg-gray-100/15 rounded-xl px-3 py-2.5 md:px-5 md:py-4 focus:outline-none transition-all placeholder:text-gray-500 text-sm md:text-lg resize-none h-24 md:h-48 text-gray-100"
              placeholder="いまどうしてる？ #お絵描き #ゲーム"
            />
            {image && (
              <div className="relative mt-2 rounded-lg overflow-hidden border border-gray-800 max-w-[180px] md:max-w-[260px]">
                <img src={image} alt="添付お絵描き" className="w-full h-auto" />
                <button
                  onClick={() => setImage(null)}
                  className="absolute top-1 right-1 bg-black/85 p-1 rounded-full text-white hover:bg-red-500"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {mml && (
              <div className="relative mt-2 rounded-lg border border-pink-700/50 bg-pink-500/10 px-3 py-2 md:px-4 md:py-3 max-w-[280px] md:max-w-[420px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] md:text-xs font-bold text-pink-300 flex items-center gap-1">
                    <Music size={12} />
                    MMLを添付中（試聴できます）
                  </span>
                  <button
                    onClick={() => setMml(null)}
                    className="text-pink-300/70 hover:text-red-400 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
                <MmlPlayer mml={mml} />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 pl-12 md:pl-16">
          <span className="text-[10px] md:text-xs text-gray-500">権利表記</span>
          <button
            type="button"
            onClick={() => setShowOriginModal(true)}
            className={`text-[10px] md:text-xs font-bold px-2 py-1 md:px-3 md:py-1.5 rounded-full border transition-colors ${originOption
              ? originOption.badgeClass
              : 'border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
          >
            {originOption ? originOption.label : '申告なし'}
          </button>
        </div>
        <div className="flex justify-between items-center pl-12 md:pl-16">
          <div className="flex space-x-2 md:space-x-3 text-gray-500">
            <button
              onClick={onOpenDrawing}
              className="p-2 hover:bg-gray-100/10 rounded-full hover:text-[#a3e635] transition-colors"
              title="お絵描き"
            >
              <Pen size={18} className="md:hidden" />
              <Pen size={22} className="hidden md:block" />
            </button>
            <button
              onClick={onOpenDotDrawing}
              className="p-2 hover:bg-gray-100/10 rounded-full hover:text-orange-400 transition-colors"
              title="ドット絵専用お絵描き"
            >
              <Grid3x3 size={18} className="md:hidden" />
              <Grid3x3 size={22} className="hidden md:block" />
            </button>
            <button
              onClick={onOpenMml}
              className="p-2 hover:bg-gray-100/10 rounded-full hover:text-pink-400 transition-colors"
              title="MML作曲"
            >
              <Music size={18} className="md:hidden" />
              <Music size={22} className="hidden md:block" />
            </button>
            <button
              onClick={onOpenGameMaker}
              className="p-2 hover:bg-gray-100/10 rounded-full hover:text-yellow-400 transition-colors"
              title="ゲーム作成"
            >
              <Gamepad2 size={18} className="md:hidden" />
              <Gamepad2 size={22} className="hidden md:block" />
            </button>
          </div>
          <button
            onClick={onSubmit}
            disabled={!text.trim() && !image && !mml}
            className="bg-blue-600 text-white font-bold px-4 py-1.5 md:px-6 md:py-2.5 rounded-full text-xs md:text-sm hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            投稿
          </button>
        </div>
      </div>
      {showOriginModal && (
        <OriginTypeModal
          value={originType}
          onClose={() => setShowOriginModal(false)}
          onSelect={(v) => { setOriginType(v); setShowOriginModal(false); }}
        />
      )}
    </div>
  );
}
