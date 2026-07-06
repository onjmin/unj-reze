'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Music, Loader2 } from 'lucide-react';
import { getStudio } from '@/lib/dtm';

interface MmlEditorProps {
  onClose: () => void;
  onSave: (mml: string) => void;
}

// 編集UIは @onjmin/dtm の createDtmStudio().mountModeSwitch() に差し替え。
// mountModeSwitch はシンプル/アドバンスのモード切替UIを差し込み、編集UI（mountEditor）の
// マウント・再マウント（MML引き継ぎ）まで面倒を見る。ピアノロール・楽器プリセット・ドラム・
// MIDI読込・コード進行入力まで全部入り。アプリ側はオーバーレイの枠（キャンセル/投稿）を担当。
export default function MmlEditor({ onClose, onSave }: MmlEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const modeSwitchRef = useRef<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    getStudio().then((studio) => {
      if (disposed) return;
      if (mountRef.current) {
        modeSwitchRef.current = studio.mountModeSwitch(mountRef.current, {
          editorTarget: mountRef.current,
          mode: 'simple',
          position: 'prepend',
        });
      }
      setLoading(false);
    }).catch((e) => {
      console.error('[MmlEditor] getStudio failed', e);
      if (!disposed) {
        setError('音源の読み込みに失敗しました。通信環境をご確認ください。');
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
      try { modeSwitchRef.current?.destroy(); } catch {}
      modeSwitchRef.current = null;
    };
  }, []);

  const handleSave = useCallback(() => {
    // モード切替で daw が差し替わるため、現在の DawInstance を都度取得する。
    const daw = modeSwitchRef.current?.getDaw();
    if (!daw) return;
    const mml = daw.getMML().minified.trim();
    if (mml) onSave(mml);
  }, [onSave]);

  return (
    <div className="absolute inset-0 bg-[#0b0e14] z-50 flex flex-col select-none">
      <div className="flex items-center px-3.5 py-2.5 border-b border-gray-800 shrink-0 bg-[#0b0e14]">
        <button onClick={onClose} className="mr-2 text-gray-400 hover:bg-gray-100/10 p-1.5 rounded transition-colors">
          <X size={20} />
        </button>
        <span className="font-bold text-xs text-gray-300">キャンセル</span>
        <span className="text-gray-600 mx-1.5 text-[10px]">›</span>
        <span className="text-gray-400 text-xs">MML作曲エディタ</span>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={loading || !!error}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-3.5 rounded-lg text-[11px] disabled:opacity-50 flex items-center space-x-1.5 transition-colors"
        >
          <Music size={13} /> <span>投稿</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-[#0a0c12] relative">
        <div ref={mountRef} />
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400 pointer-events-none">
            <Loader2 size={28} className="animate-spin" />
            <span className="text-xs">音源を読み込み中…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-xs text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
