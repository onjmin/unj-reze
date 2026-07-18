'use client';

import { useEffect, useState } from 'react';
import { X, Trash2, RotateCcw, Plus, Calendar } from 'lucide-react';
import { getHistory, deleteHistoryItem, saveHistory, HistoryItem } from '@/lib/history';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  storageKey: string;
  type: 'mml' | 'drawing' | 'dotdrawing' | 'gamemaker' | 'gameplay';
  onRestore: (data: any) => void;
  // getCurrentData returns the current state of the editor to capture a manual snapshot
  getCurrentData?: () => any;
}

export default function HistoryModal({
  isOpen,
  onClose,
  storageKey,
  type,
  onRestore,
  getCurrentData,
}: HistoryModalProps) {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [message, setMessage] = useState<{ text: string; color: string } | null>(null);

  const loadHistory = () => {
    setHistoryItems(getHistory(storageKey));
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
      setMessage(null);
    }
  }, [isOpen, storageKey]);

  if (!isOpen) return null;

  const handleRestore = (item: HistoryItem) => {
    onRestore(item.data);
    setMessage({ text: '履歴データを復元しました。', color: 'text-green-400' });
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  const handleDelete = (id: string) => {
    deleteHistoryItem(storageKey, id);
    loadHistory();
    setMessage({ text: 'スナップショットを削除しました。', color: 'text-red-400' });
  };

  const handleClearAll = () => {
    if (confirm('すべての履歴を消去しますか？')) {
      localStorage.removeItem(storageKey);
      loadHistory();
      setMessage({ text: '履歴をすべて消去しました。', color: 'text-yellow-400' });
    }
  };

  const handleManualSave = () => {
    if (!getCurrentData) return;
    const currentData = getCurrentData();
    if (!currentData) {
      setMessage({ text: '保存するデータがありません。', color: 'text-yellow-400' });
      return;
    }

    const saved = saveHistory(storageKey, currentData, type, 50);
    if (saved) {
      loadHistory();
      setMessage({ text: '現在の状態をスナップショットとして保存しました。', color: 'text-green-400' });
    } else {
      setMessage({ text: '変更がないため保存をスキップしました。', color: 'text-yellow-400' });
    }
  };

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const getTypeName = () => {
    switch (type) {
      case 'mml': return 'MML';
      case 'drawing': return 'お絵描き';
      case 'dotdrawing': return 'ドット絵';
      case 'gamemaker': return 'ゲーム制作';
      case 'gameplay': return 'ゲームプレイ';
      default: return '編集';
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex flex-col items-center overflow-y-auto px-3 pt-12 md:pt-24" onClick={(e) => e.stopPropagation()}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0b0e14] rounded-xl border border-gray-800 shadow-2xl p-5 flex flex-col space-y-4 animate-fade-in-up">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-gray-300 flex items-center gap-1.5">
            <Calendar size={16} className="text-blue-400" />
            {getTypeName()}の作業履歴・スナップショット
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Info Message */}
        {message && (
          <div className={`text-xs text-center py-1.5 px-3 rounded bg-gray-900/50 border border-gray-800 ${message.color}`}>
            {message.text}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex justify-between items-center bg-gray-900/40 p-2 rounded-lg border border-gray-800/60">
          {getCurrentData ? (
            <button
              onClick={handleManualSave}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              <Plus size={13} />
              <span>手動スナップショット作成</span>
            </button>
          ) : <div />}
          {historyItems.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-red-400 hover:bg-red-950/20 hover:border-red-900/30 rounded-lg transition-colors border border-transparent"
            >
              <Trash2 size={13} />
              <span>すべてクリア</span>
            </button>
          )}
        </div>

        {/* History List */}
        <div className="max-h-64 md:max-h-80 overflow-y-auto scrollbar-thin flex flex-col gap-2">
          {historyItems.length === 0 ? (
            <div className="text-center text-gray-500 text-xs py-8">
              保存された履歴はありません。<br />30分ごとに自動的にスナップショットが作成されます。
            </div>
          ) : (
            historyItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2 bg-[#121620] hover:bg-[#161c2b] border border-gray-800 hover:border-gray-700 rounded-lg transition-all"
              >
                {/* Thumbnail Preview for Drawings */}
                {item.previewUrl && (
                  <div className="w-10 h-10 bg-[#1a1b26] border border-gray-700 rounded overflow-hidden shrink-0 flex items-center justify-center gimp-checkered-background">
                    <img
                      src={item.previewUrl}
                      alt="preview"
                      className="max-w-full max-h-full object-contain"
                      style={{ imageRendering: type === 'dotdrawing' ? 'pixelated' : 'auto' }}
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono text-gray-400">
                    {formatTime(item.timestamp)}
                  </div>
                  {item.previewText && (
                    <div className="text-[10px] text-gray-500 truncate font-mono">
                      {item.previewText}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleRestore(item)}
                    className="flex items-center gap-0.5 px-2.5 py-1 text-[10px] font-bold bg-[#1db854] text-gray-900 rounded hover:bg-[#1ed760] transition-colors"
                  >
                    <RotateCcw size={11} />
                    <span>復元</span>
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1 text-gray-500 hover:text-red-400 hover:bg-gray-800/30 rounded transition-colors"
                    title="削除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
