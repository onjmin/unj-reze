'use client';

import { useRef, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { X, Pen, Grid3x3, Music, Gamepad2, Image } from 'lucide-react';
import { OriginType, ORIGIN_TYPE_OPTIONS } from '@/lib/types';
import OriginTypeModal from './OriginTypeModal';
import { getAvatarInfo } from '@/lib/avatar';

const MmlPlayer = dynamic(() => import('./MmlPlayer'), { ssr: false });

interface PostComposerProps {
  userId: string;
  avatarUrl?: string;
  text: string;
  setText: (v: string) => void;
  image: string | null;
  setImage: (v: string | null) => void;
  mml: string | null;
  setMml: (v: string | null) => void;
  gameDraft: { title: string } | null;
  setGameDraft: (v: any) => void;
  originType?: OriginType;
  setOriginType: (v: OriginType | undefined) => void;
  onClose: () => void;
  onSubmit: () => void;
  onOpenDrawing: () => void;
  onOpenDotDrawing: () => void;
  onOpenMml: () => void;
  onOpenGameMaker: () => void;
  replyToDisplayName?: string;
  inline?: boolean;
  bbsMode?: string;
}

function ToolbarButton({ onClick, title, hoverColor, children }: {
  onClick: () => void;
  title: string;
  hoverColor: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-2 hover:bg-gray-100/10 rounded-full transition-colors ${hoverColor}`}
      title={title}
    >
      {children}
    </button>
  );
}

export default function PostComposer({ userId, avatarUrl, text, setText, image, setImage, mml, setMml, gameDraft, setGameDraft, originType, setOriginType, onClose, onSubmit, onOpenDrawing, onOpenDotDrawing, onOpenMml, onOpenGameMaker, replyToDisplayName, inline, bbsMode }: PostComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showOriginModal, setShowOriginModal] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('5MB以下の画像を選択してください');
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      setUploadError('画像ファイルを選択してください');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
    };
    reader.onerror = () => {
      setUploadError('ファイルの読み込みに失敗しました');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  const originOption = ORIGIN_TYPE_OPTIONS.find(o => o.value === originType);

  const avatarInfo = getAvatarInfo(userId);
  const replyAvatarInfo = replyToDisplayName ? getAvatarInfo(replyToDisplayName) : null;

  useEffect(() => {
    if (!inline) textareaRef.current?.focus();
  }, [inline]);

  const md = !inline;

  const attachmentPreviews = (
    <>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${image ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden min-h-0">
          {image && (
            <div className={`gimp-checkered-background-white relative mt-2 rounded-lg overflow-hidden border border-gray-800 ${md ? 'max-w-[180px] md:max-w-[260px]' : 'max-w-[180px]'}`}>
              <img src={image} alt="添付画像" className="w-full h-auto" />
              <div className="absolute top-1 right-1 flex items-center gap-1.5">
                <button
                  onClick={() => {
                    if (text.includes('#ドット絵')) {
                      onOpenDotDrawing();
                    } else {
                      onOpenDrawing();
                    }
                  }}
                  className="bg-black/85 px-2 py-0.5 rounded-full text-blue-400 hover:bg-blue-600 hover:text-white text-[10px] font-bold active:scale-95 transition-all"
                  title="編集"
                >
                  編集
                </button>
                <button
                  onClick={() => setImage(null)}
                  className="bg-black/85 p-1 rounded-full text-white hover:bg-red-500 active:scale-95 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {mml && (
        <div className={`relative mt-2 rounded-lg border border-pink-700/50 bg-pink-500/10 px-3 py-2 max-w-[280px] ${md ? 'md:px-4 md:py-3 md:max-w-[420px]' : ''}`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`font-bold text-pink-300 flex items-center gap-1 ${md ? 'text-[10px] md:text-xs' : 'text-[10px]'}`}>
              <Music size={12} />
              MMLを添付中（試聴できます）
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenMml}
                className="text-pink-300 hover:text-pink-100 text-[10px] font-bold px-1.5 py-0.5 rounded border border-pink-700/40 hover:bg-pink-500/25 active:scale-95 transition-all"
              >
                編集
              </button>
              <button
                onClick={() => setMml(null)}
                className="text-pink-300/70 hover:text-red-400 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <MmlPlayer mml={mml} />
        </div>
      )}
      {gameDraft && (
        <div className={`relative mt-2 flex items-center gap-2 rounded-lg border border-yellow-700/50 bg-yellow-500/10 px-3 py-2 max-w-[280px] ${md ? 'md:px-4 md:py-3 md:max-w-[420px]' : ''}`}>
          <Gamepad2 size={16} className="text-yellow-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-yellow-200 truncate">{gameDraft.title}</p>
            <p className="text-[10px] text-yellow-400/70">ゲームを添付中</p>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              onClick={onOpenGameMaker}
              className="text-yellow-300 hover:text-yellow-100 text-[10px] font-bold px-1.5 py-0.5 rounded border border-yellow-700/40 hover:bg-yellow-500/25 active:scale-95 transition-all"
            >
              編集
            </button>
            <button
              onClick={() => setGameDraft(null)}
              className="text-yellow-300/70 hover:text-red-400 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );

  const toolbar = (
    <div className={`flex ${md ? 'space-x-2 md:space-x-3' : 'space-x-2'} text-gray-500`}>
      <ToolbarButton onClick={() => fileInputRef.current?.click()} title="画像をアップロード" hoverColor="hover:text-blue-400">
        <Image size={18} className={md ? 'md:hidden' : undefined} />
        {md && <Image size={22} className="hidden md:block" />}
      </ToolbarButton>
      <ToolbarButton onClick={onOpenDrawing} title="お絵描き" hoverColor="hover:text-[#a3e635]">
        <Pen size={18} className={md ? 'md:hidden' : undefined} />
        {md && <Pen size={22} className="hidden md:block" />}
      </ToolbarButton>
      <ToolbarButton onClick={onOpenDotDrawing} title="ドット絵ット絵専用お絵描き" hoverColor="hover:text-orange-400">
        <Grid3x3 size={18} className={md ? 'md:hidden' : undefined} />
        {md && <Grid3x3 size={22} className="hidden md:block" />}
      </ToolbarButton>
      <ToolbarButton onClick={onOpenMml} title="MML作曲" hoverColor="hover:text-pink-400">
        <Music size={18} className={md ? 'md:hidden' : undefined} />
        {md && <Music size={22} className="hidden md:block" />}
      </ToolbarButton>
      <ToolbarButton onClick={onOpenGameMaker} title="ゲーム作成" hoverColor="hover:text-yellow-400">
        <Gamepad2 size={18} className={md ? 'md:hidden' : undefined} />
        {md && <Gamepad2 size={22} className="hidden md:block" />}
      </ToolbarButton>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );

  const originRow = (
    <div className={`flex items-center gap-1.5 pl-12 ${md ? 'md:gap-2 md:pl-16 mb-0' : 'mb-1.5'}`}>
      <span className={`text-gray-500 font-medium ${md ? 'text-[10px] md:text-xs' : 'text-[10px]'}`}>権利表記</span>
      <button
        type="button"
        onClick={() => setShowOriginModal(true)}
        className={`font-bold rounded-full border transition-colors ${md ? 'text-[10px] md:text-xs px-2 py-1 md:px-3 md:py-1.5' : 'text-[10px] px-2 py-0.5'} ${originOption
          ? originOption.badgeClass
          : 'border-gray-700 text-gray-500 hover:text-gray-300'
          }`}
      >
        {originOption ? originOption.label : '申告なし'}
      </button>
    </div>
  );

  const submitButton = (
    <button
      onClick={onSubmit}
      disabled={!text.trim() && !image && !mml && !gameDraft}
      className={`bg-blue-600 text-white font-bold rounded-full transition-colors hover:bg-blue-500 disabled:opacity-50 ${md ? 'px-4 py-1.5 md:px-6 md:py-2.5 text-xs md:text-sm' : 'px-4 py-1.5 text-xs'}`}
    >
      投稿
    </button>
  );

  const isBbs = bbsMode === '掲示板モード';
  const avatar = isBbs ? null : (
    <div
      className={`rounded-full shrink-0 border border-gray-700/50 flex items-center justify-center font-bold text-white relative overflow-hidden ${md ? 'w-9 h-9 md:w-12 md:h-12 text-xs md:text-sm' : 'w-9 h-9 text-xs'}`}
      style={avatarUrl ? undefined : avatarInfo.style}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={avatarInfo.username} className="w-full h-full object-cover rounded-full" />
      ) : (
        (() => {
          const AvatarIcon = avatarInfo.Icon;
          return <AvatarIcon className={`text-white/40 leading-none ${md ? 'w-5 h-5 md:w-7 md:h-7' : 'w-5 h-5'}`} />;
        })()
      )}
    </div>
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey)) {
      e.preventDefault();
      const canSubmit = text.trim() || image || mml || gameDraft;
      if (canSubmit) {
        onSubmit();
      }
    }
  };

  const textarea = (
    <textarea
      ref={textareaRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      className={`w-full bg-gray-100/10 hover:bg-gray-100/15 focus:bg-gray-100/15 rounded-xl px-3 py-2.5 focus:outline-none transition-all placeholder:text-gray-500 text-sm resize-none text-gray-100 ${md ? 'md:px-5 md:py-4 md:text-lg h-24 md:h-48' : 'h-20'}`}
      placeholder={replyAvatarInfo ? '返信を書き込む...' : isBbs ? 'スレタイ + 本文を入力' : 'いまどうしてる？ #お絵描き #ゲーム'}
    />
  );

  const composerBody = (
    <>
      <div className={`flex items-start ${avatar ? (md ? 'space-x-3 md:space-x-4' : 'space-x-3') : ''}`}>
        {avatar}
        <div className="flex-1">
          {textarea}
          {attachmentPreviews}
          {uploadError && (
            <p className={`text-red-400 mt-1 ${md ? 'text-[10px] md:text-xs' : 'text-[10px]'}`}>{uploadError}</p>
          )}
        </div>
      </div>
      {originRow}
      <div className={`flex justify-between items-center ${avatar ? (md ? 'pl-12 md:pl-16' : 'pl-12') : ''}`}>
        {toolbar}
        {submitButton}
      </div>
    </>
  );

  const originModal = showOriginModal && (
    <OriginTypeModal
      value={originType}
      onClose={() => setShowOriginModal(false)}
      onSelect={(v) => { setOriginType(v); setShowOriginModal(false); }}
    />
  );

  if (inline) {
    return (
      <div className="p-3 border-b border-gray-800/80 flex flex-col space-y-2">
        {composerBody}
        {originModal}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto px-3 pt-12 pb-6 md:pt-24">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full md:max-w-2xl lg:max-w-3xl bg-[#0b0e14] rounded-xl border border-gray-800 shadow-2xl p-3 md:p-6 flex flex-col space-y-2 md:space-y-4 animate-fade-in-up">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs md:text-base font-bold text-gray-400">
            {replyAvatarInfo ? `@${replyAvatarInfo.username} への返信` : isBbs ? '新規スレ作成' : '新規ポスト'}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors">
            <X size={16} className="md:hidden" />
            <X size={22} className="hidden md:block" />
          </button>
        </div>
        {composerBody}
      </div>
      {originModal}
    </div>
  );
}
