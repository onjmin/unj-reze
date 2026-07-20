'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Music, ChevronDown, Gamepad2 } from 'lucide-react';
import { extractMmlFromContent, getDisplayContent, MML_MARKERS } from '@/lib/mml';
import dynamic from 'next/dynamic';

const MmlPlayer = dynamic(() => import('./MmlPlayer'), { ssr: false });

interface EditPostModalProps {
  initialContent: string;
  originalContent?: string;
  onClose: () => void;
  onSave: (content: string, imageSrc?: string | null) => void;
  imageSrc?: string | null;
  onEditImage?: () => void;
  onEditMml?: () => void;
  hasGame?: boolean;
  gameTitle?: string;
  onEditGame?: () => void;
  onRemoveGame?: () => void;
}

/** content からMML行を抽出し、{ mmlLine: "#mml ...", textOnly: "本文" } を返す */
function splitMml(content: string): { mmlLine: string | null; textOnly: string } {
  const lines = content.split('\n');
  const idx = lines.findIndex(line => {
    const t = line.trim().toLowerCase();
    return MML_MARKERS.some(m => t.startsWith(m.toLowerCase()));
  });
  if (idx === -1) return { mmlLine: null, textOnly: content };
  const mmlLine = lines[idx];
  lines.splice(idx, 1);
  return { mmlLine, textOnly: lines.join('\n').trimEnd() };
}

export default function EditPostModal({
  initialContent,
  originalContent,
  onClose,
  onSave,
  imageSrc,
  onEditImage,
  onEditMml,
  hasGame,
  gameTitle,
  onEditGame,
  onRemoveGame
}: EditPostModalProps) {
  const { mmlLine: initialMml, textOnly: initialText } = splitMml(initialContent);

  const [text, setText] = useState(initialText);
  const [mmlLine, setMmlLine] = useState<string | null>(initialMml);
  const [currentImageSrc, setCurrentImageSrc] = useState<string | null | undefined>(imageSrc);
  const [currentHasGame, setCurrentHasGame] = useState(hasGame);
  const [expanded, setExpanded] = useState(false); // プレビュー展開
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const len = initialText.length;
    textareaRef.current?.setSelectionRange(len, len);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** MMLバッジを×で削除 */
  const handleRemoveMml = () => setMmlLine(null);

  /** MML文字列をテキストエリアへ展開 */
  const handleExpandMml = () => {
    if (!mmlLine) return;
    setText(prev => {
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed}\n${mmlLine}` : mmlLine;
    });
    setMmlLine(null);
    setExpanded(false);
  };

  const handleSave = () => {
    const parts: string[] = [];
    if (text.trim()) parts.push(text.trim());
    if (mmlLine) parts.push(mmlLine);
    const final = parts.join('\n');
    onSave(final, currentImageSrc);
  };

  const mmlCode = mmlLine ? (() => {
    const marker = MML_MARKERS.find(m => mmlLine.trim().toLowerCase().startsWith(m.toLowerCase()));
    return marker ? mmlLine.trim().slice(marker.length).trim() : null;
  })() : null;

  const isDirty = (() => {
    const parts: string[] = [];
    if (text.trim()) parts.push(text.trim());
    if (mmlLine) parts.push(mmlLine);
    const compareBase = originalContent ?? initialContent;
    const textOrMmlChanged = parts.join('\n') !== compareBase;
    const imageChanged = currentImageSrc !== imageSrc;
    const gameChanged = currentHasGame !== hasGame;
    return textOrMmlChanged || imageChanged || gameChanged;
  })();

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

        {/* テキスト本文 */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full bg-gray-100/10 hover:bg-gray-100/15 focus:bg-gray-100/15 rounded-xl px-3 py-2.5 md:px-5 md:py-4 focus:outline-none transition-all placeholder:text-gray-500 text-sm md:text-lg resize-none h-28 md:h-56 text-gray-100"
          placeholder="ポストの内容"
        />

        {/* 添付画像 */}
        {currentImageSrc && (
          <div className="gimp-checkered-background-white relative rounded-lg overflow-hidden border border-gray-800 max-w-[180px] md:max-w-[260px] self-start group">
            <img src={currentImageSrc} alt="添付画像" className="w-full h-auto" />
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
              {onEditImage && (
                <button
                  onClick={onEditImage}
                  className="bg-black/85 px-2 py-0.5 rounded-full text-blue-400 hover:bg-blue-600 hover:text-white text-[10px] font-bold active:scale-95 transition-all shadow-md"
                  title="画像を編集"
                >
                  編集
                </button>
              )}
              <button
                onClick={() => setCurrentImageSrc(null)}
                className="bg-black/85 p-1 rounded-full text-white hover:bg-red-500 active:scale-95 transition-all shadow-md"
                title="画像を削除"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* MMLバッジ */}
        {mmlLine && (
          <div className="rounded-lg border border-pink-700/50 bg-pink-500/10 px-3 py-2 md:px-4 md:py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] md:text-xs font-bold text-pink-300 flex items-center gap-1.5">
                <Music size={12} />
                MML添付
              </span>
              <div className="flex items-center gap-1">
                {onEditMml && (
                  <button
                    onClick={onEditMml}
                    className="text-[10px] text-pink-400/70 hover:text-pink-300 px-2 py-0.5 rounded border border-pink-700/40 hover:bg-pink-500/25 transition-all active:scale-95 font-bold"
                  >
                    編集
                  </button>
                )}
                {/* 展開ボタン（テキストに戻す） */}
                <button
                  onClick={handleExpandMml}
                  title="テキストに展開"
                  className="text-[10px] text-pink-400/70 hover:text-pink-300 px-2 py-0.5 rounded border border-pink-700/40 hover:border-pink-600/60 transition-colors flex items-center gap-1"
                >
                  <ChevronDown size={11} />
                  展開
                </button>
                {/* プレビュー切替 */}
                <button
                  onClick={() => setExpanded(v => !v)}
                  title={expanded ? 'プレビューを閉じる' : 'プレビュー'}
                  className="text-[10px] text-pink-400/70 hover:text-pink-300 px-2 py-0.5 rounded border border-pink-700/40 hover:border-pink-600/60 transition-colors"
                >
                  {expanded ? '閉じる' : '試聴'}
                </button>
                {/* 削除ボタン */}
                <button
                  onClick={handleRemoveMml}
                  title="MMLを削除"
                  className="text-pink-400/70 hover:text-red-400 transition-colors p-0.5"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            {expanded && mmlCode && (
              <MmlPlayer mml={mmlCode} />
            )}
            {!expanded && (
              <p className="text-[10px] text-pink-400/50 font-mono truncate">{mmlLine}</p>
            )}
          </div>
        )}

        {/* ゲーム添付 */}
        {currentHasGame && (
          <div className="relative flex items-center gap-2.5 rounded-lg border border-yellow-700/50 bg-yellow-500/10 px-3 py-2 max-w-[280px] self-start w-full">
            <Gamepad2 size={16} className="text-yellow-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-yellow-200 truncate">{gameTitle || 'ゲーム'}</p>
              <p className="text-[10px] text-yellow-400/70">ゲームを添付中</p>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              {onEditGame && (
                <button
                  onClick={onEditGame}
                  className="text-yellow-300 hover:text-yellow-100 text-[10px] font-bold px-1.5 py-0.5 rounded border border-yellow-700/40 hover:bg-yellow-500/25 active:scale-95 transition-all"
                >
                  編集
                </button>
              )}
              <button
                onClick={() => {
                  setCurrentHasGame(false);
                  onRemoveGame?.();
                }}
                className="text-yellow-300/75 hover:text-red-400 shrink-0"
                title="ゲームを外す"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end items-center space-x-2 md:space-x-3 pt-2 border-t border-gray-800/40">
          <button
            onClick={onClose}
            className="text-gray-400 font-bold px-4 py-1.5 md:px-6 md:py-2.5 rounded-full text-xs md:text-sm hover:bg-gray-100/10 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={(!text.trim() && !mmlLine && !currentImageSrc && !currentHasGame) || !isDirty}
            className="bg-blue-600 text-white font-bold px-4 py-1.5 md:px-6 md:py-2.5 rounded-full text-xs md:text-sm hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
