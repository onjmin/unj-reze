'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Music, Loader2, History } from 'lucide-react';
import { parseMML, parseMmlMeta, TRACKS_SIMPLE, type DawMode } from '@onjmin/dtm';
import { getStudio } from '@/lib/dtm';
import { applyMasterVolume, subscribeMasterVolume } from '@/lib/master-volume';
import HistoryModal from '@/components/HistoryModal';
import { getStorageKey, getAutosave, saveAutosave, clearAutosave, saveHistory } from '@/lib/history';

interface MmlEditorProps {
  onClose: () => void;
  onSave: (mml: string) => void;
  initialMml?: string;
}

// 再編集時: アドバンスモードで作られたMMLを開いたら自動的にアドバンスモードへ切り替える。
// 判定基準は @onjmin/dtm 側の「シンプルモードで読み込むと上級者モードへの切替を提案する」
// 条件（mergedTrackCount > 0 || meta.mode === 'advanced'）に合わせる。
function detectMode(mml?: string): DawMode {
  if (!mml) return 'simple';
  try {
    if (parseMmlMeta(mml).mode === 'advanced') return 'advanced';
    const { mergedTrackCount } = parseMML(mml, { clampTrackCount: TRACKS_SIMPLE.length });
    return mergedTrackCount > 0 ? 'advanced' : 'simple';
  } catch (e) {
    return 'simple';
  }
}

// 編集UIは @onjmin/dtm の createDtmStudio().mountModeSwitch() に差し替え。
// mountModeSwitch はシンプル/アドバンスのモード切替UIを差し込み、編集UI（mountEditor）の
// マウント・再マウント（MML引き継ぎ）まで面倒を見る。ピアノロール・楽器プリセット・ドラム・
// MIDI読込・コード進行入力まで全部入り。アプリ側はオーバーレイの枠（キャンセル/投稿）を担当。
export default function MmlEditor({ onClose, onSave, initialMml }: MmlEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const modeSwitchRef = useRef<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // History / Autosave state
  const [showHistory, setShowHistory] = useState(false);
  const [hasAutosave, setHasAutosave] = useState(false);
  const [autosaveData, setAutosaveData] = useState<string | null>(null);
  const storageKey = getStorageKey('mml');

  useEffect(() => {
    let disposed = false;

    getStudio().then((studio) => {
      if (disposed) return;
      if (mountRef.current) {
        modeSwitchRef.current = studio.mountModeSwitch(mountRef.current, {
          editorTarget: mountRef.current,
          mode: detectMode(initialMml),
          position: 'prepend',
          editorOptions: {
            ...(initialMml ? { initialMML: initialMml } : undefined),
            masterVolume: applyMasterVolume(100),
          },
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

  useEffect(() => subscribeMasterVolume(() => {
    modeSwitchRef.current?.getDaw()?.setMasterVolume(applyMasterVolume(100));
  }), []);

  // Check autosave on mount
  useEffect(() => {
    const autosave = getAutosave(storageKey);
    if (autosave && autosave.data && autosave.data !== initialMml) {
      setAutosaveData(autosave.data);
      setHasAutosave(true);
    }
  }, [initialMml, storageKey]);

  // Periodic autosave (every 10s) and history snapshot (every 30m)
  useEffect(() => {
    const autosaveInterval = setInterval(() => {
      const daw = modeSwitchRef.current?.getDaw();
      if (!daw) return;
      try {
        const currentMml = daw.getMML()?.minified?.trim();
        if (currentMml) {
          saveAutosave(storageKey, currentMml);
        }
      } catch (e) {
        // ignore if getMML fails during mode switch
      }
    }, 10000);

    const historyInterval = setInterval(() => {
      const daw = modeSwitchRef.current?.getDaw();
      if (!daw) return;
      try {
        const currentMml = daw.getMML()?.minified?.trim();
        if (currentMml) {
          saveHistory(storageKey, currentMml, 'mml', 50);
        }
      } catch (e) {
        // ignore
      }
    }, 1800000);

    return () => {
      clearInterval(autosaveInterval);
      clearInterval(historyInterval);
    };
  }, [storageKey]);

  const handleRestoreAutosave = () => {
    if (!autosaveData) return;
    const daw = modeSwitchRef.current?.getDaw();
    if (daw) {
      try {
        daw.loadMML(autosaveData);
      } catch (e) {
        console.error('Failed to load autosaved MML', e);
      }
    }
    setHasAutosave(false);
    clearAutosave(storageKey);
  };

  const handleIgnoreAutosave = () => {
    setHasAutosave(false);
    clearAutosave(storageKey);
  };

  const handleRestoreHistory = (restoredMml: string) => {
    const daw = modeSwitchRef.current?.getDaw();
    if (daw) {
      try {
        daw.loadMML(restoredMml);
      } catch (e) {
        console.error('Failed to load MML history', e);
      }
    }
  };

  const getCurrentMml = () => {
    const daw = modeSwitchRef.current?.getDaw();
    if (!daw) return null;
    try {
      return daw.getMML()?.minified?.trim() || null;
    } catch (e) {
      return null;
    }
  };

  const handleSave = useCallback(() => {
    // モード切替で daw が差し替わるため、現在の DawInstance を都度取得する。
    const daw = modeSwitchRef.current?.getDaw();
    if (!daw) return;
    const mml = daw.getMML().minified.trim();
    if (mml) {
      // Clear autosave on manual save/post
      clearAutosave(storageKey);
      onSave(mml);
    }
  }, [onSave, storageKey]);

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
          onClick={() => setShowHistory(true)}
          disabled={loading || !!error}
          className="mr-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-1.5 px-3 rounded-lg text-[11px] disabled:opacity-50 flex items-center space-x-1 transition-colors"
        >
          <History size={13} /> <span>履歴</span>
        </button>

        <button
          onClick={handleSave}
          disabled={loading || !!error}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-3.5 rounded-lg text-[11px] disabled:opacity-50 flex items-center space-x-1.5 transition-colors"
        >
          <Music size={13} /> <span>投稿</span>
        </button>
      </div>

      {hasAutosave && (
        <div className="bg-yellow-600/20 border-b border-yellow-800/30 px-4 py-2 flex items-center justify-between text-xs text-yellow-200 shrink-0">
          <span className="flex items-center gap-1.5">
            ⚠️ 未保存のデータ（自動保存）があります。復元しますか？
          </span>
          <div className="flex gap-2">
            <button onClick={handleRestoreAutosave} className="bg-yellow-600 hover:bg-yellow-500 text-gray-900 font-bold px-3 py-1 rounded text-[10px] active:scale-95 transition-transform">
              復元する
            </button>
            <button onClick={handleIgnoreAutosave} className="text-gray-400 hover:text-gray-200 px-2 py-1 rounded text-[10px]">
              無視
            </button>
          </div>
        </div>
      )}

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

      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        storageKey={storageKey}
        type="mml"
        onRestore={handleRestoreHistory}
        getCurrentData={getCurrentMml}
      />
    </div>
  );
}
