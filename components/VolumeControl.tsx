'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { getMasterVolume, setMasterVolume, subscribeMasterVolume } from '@/lib/master-volume';

/** ヘッダー用マスター音量コントロール。スピーカーアイコン→クリックでスライダーをポップアップ表示する。
 *  MML投稿・YouTube埋め込み・ゲーム画面のBGM/SFXへ一律で掛かる音量倍率をここで操作する。 */
export default function VolumeControl() {
  const [volume, setVolume] = useState(50);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVolume(getMasterVolume());
    return subscribeMasterVolume(setVolume);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`p-1.5 rounded-full transition-colors ${open ? 'bg-gray-100/10 text-gray-300' : 'text-gray-500 hover:bg-gray-100/10 hover:text-gray-300'}`}
        aria-label="音量"
        title={`音量 ${volume}`}
      >
        {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-[#1a1a2e] border border-gray-700 rounded-lg shadow-2xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-gray-400 font-bold">音量</span>
            <span className="text-[10px] text-gray-300 font-mono">{volume}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setMasterVolume(Number(e.target.value))}
            className="w-full accent-[#a3e635]"
          />
        </div>
      )}
    </div>
  );
}
