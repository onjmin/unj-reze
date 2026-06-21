'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Music, Loader2 } from 'lucide-react';
import { createDtmStudio, type DtmStudio, type DawInstance } from '@onjmin/dtm';

interface MmlEditorProps {
  onClose: () => void;
  onSave: (mml: string) => void;
}

// SoundFont エンジンのCDN（@onjmin/dtm 既定値と同じ）。
const SOUNDFONT_CDN = {
  soundFont: 'https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont.mjs',
  soundFontDrum: 'https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_drum.mjs',
  soundFontList: 'https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_list.mjs',
};

// Turbopack/Webpack は import(変数) を静的解析しようとして
// 「Cannot find module as expression is too dynamic」で失敗する。
// バンドラから不可視な動的 import を使い、外部CDNのエンジンを実行時に読み込む。
const runtimeImport = new Function('url', 'return import(url)') as (
  url: string,
) => Promise<Record<string, unknown>>;

async function loadEngine(url: string, name: string): Promise<unknown> {
  const mod = await runtimeImport(url);
  return mod[name] ?? mod.default;
}

// 編集UIは @onjmin/dtm の createDtmStudio().mountEditor() に差し替え。
// ピアノロール・楽器プリセット・ドラム・MIDI読込・コード進行入力まで全部入りのDAWを使う。
// アプリ側はオーバーレイの枠（キャンセル / 投稿ボタン）だけを担当する。
export default function MmlEditor({ onClose, onSave }: MmlEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const studioRef = useRef<DtmStudio | null>(null);
  const dawRef = useRef<DawInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        // バンドラ非対応の動的 import を避けるため、エンジンは自前で読み込んで注入する。
        const [SoundFont, SoundFont_drum, SoundFont_list] = await Promise.all([
          loadEngine(SOUNDFONT_CDN.soundFont, 'SoundFont'),
          loadEngine(SOUNDFONT_CDN.soundFontDrum, 'SoundFont_drum'),
          loadEngine(SOUNDFONT_CDN.soundFontList, 'SoundFont_list'),
        ]);
        const studio = await createDtmStudio({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          engines: { SoundFont, SoundFont_drum, SoundFont_list } as any,
        });
        // アンマウント済みなら即破棄して何もしない。
        if (disposed) {
          studio.dispose();
          return;
        }
        studioRef.current = studio;
        if (mountRef.current) {
          dawRef.current = studio.mountEditor(mountRef.current);
        }
        setLoading(false);
      } catch (e) {
        console.error('[MmlEditor] createDtmStudio failed', e);
        if (!disposed) {
          setError('音源の読み込みに失敗しました。通信環境をご確認ください。');
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      try { dawRef.current?.destroy(); } catch {}
      try { studioRef.current?.dispose(); } catch {}
      dawRef.current = null;
      studioRef.current = null;
    };
  }, []);

  const handleSave = useCallback(() => {
    const daw = dawRef.current;
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
