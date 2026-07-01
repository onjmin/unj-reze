'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, Loader2, Play, Square, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  searchSAnimSheets, searchSoundSheets,
  sAnimUrl, soundUrl,
  type SAnimSheetItem, type SoundSheetItem,
  type SAnimSheetMember, type SoundSheetMember,
} from '@/lib/rpgen-assets';
import { buildWalkRef } from '@/lib/asset-ref';
import WalkSpritePreview from './WalkSpritePreview';
import type { PickResult } from './ContentPicker';

type Kind = 'walk' | 'sound';

interface RpgenAssetPanelProps {
  kind: Kind;
  onPick: (res: PickResult) => void;
}

const PER_PAGE = 48;

export default function RpgenAssetPanel({ kind, onPick }: RpgenAssetPanelProps) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [sheets, setSheets] = useState<(SAnimSheetItem | SoundSheetItem)[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [open, setOpen] = useState<SAnimSheetItem | SoundSheetItem | null>(null);
  const [previewNo, setPreviewNo] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchPage = useCallback((q: string, p: number, signal: AbortSignal) => {
    const params = { q, page: p, limit: PER_PAGE, signal };
    if (kind === 'walk') return searchSAnimSheets(params);
    return searchSoundSheets(params);
  }, [kind]);

  useEffect(() => {
    setOpen(null);
    setPage(1);
    setSheets([]);
  }, [kind]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(false);
    fetchPage(submitted, page, ctrl.signal)
      .then((res) => {
        setSheets((prev) => (page === 1 ? res.data : [...prev, ...res.data]));
        setPages(res.meta.pages);
        setTotal(res.meta.total);
      })
      .catch((e) => { if (e?.name !== 'AbortError') setError(true); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [fetchPage, submitted, page]);

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const runSearch = () => { setPage(1); setSubmitted(query.trim()); };

  const toggleSoundPreview = (id: string) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (previewNo === id) { setPreviewNo(null); return; }
    const a = new Audio(soundUrl(id));
    a.volume = 0.7;
    a.onended = () => setPreviewNo((cur) => (cur === id ? null : cur));
    a.play().catch(() => {});
    audioRef.current = a;
    setPreviewNo(id);
  };

  const pickWalk = (m: SAnimSheetMember, sheetName: string) => {
    const url = sAnimUrl(m.id);
    onPick({ ref: buildWalkRef('auto', { kind: 'url', url }), url, label: sheetName || `歩行グラ` });
  };

  const pickSound = (m: SoundSheetMember, sheetName: string) =>
    onPick({ ref: `direct:${soundUrl(m.id)}`, url: soundUrl(m.id), label: sheetName || 'SE' });

  const placeholder = kind === 'sound' ? '効果音セットを検索（例: 攻撃, ジャンプ）' : '歩行グラセットを検索（例: 主人公, 敵）';
  const kindLabel = kind === 'sound' ? '効果音セット' : '歩行グラセット';

  // ── セット内容ビュー ──
  if (open) {
    if (kind === 'walk') {
      const sheet = open as SAnimSheetItem;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 sticky top-0 bg-[#0b0e14] py-1 z-10">
            <button onClick={() => setOpen(null)} className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-bold shrink-0">
              <ChevronLeft size={13} />一覧
            </button>
            <div className="min-w-0">
              <p className="text-[12px] text-gray-100 font-bold truncate">{sheet.name || `セット #${sheet.no}`}</p>
              <p className="text-[9px] text-gray-600">{sheet.anim_ids.length}個の歩行グラ{sheet.comment && sheet.comment !== 'なし' ? ` ・ ${sheet.comment}` : ''}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {sheet.anim_ids.map((m) => (
              <button
                key={m.id}
                onClick={() => pickWalk(m, sheet.name)}
                className="aspect-square rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 bg-[#11131a] relative flex items-center justify-center gimp-checkered-background"
              >
                <WalkSpritePreview url={sAnimUrl(m.id)} size={64} />
              </button>
            ))}
          </div>
          {sheet.anim_ids.length === 0 && (
            <p className="text-center text-[11px] text-gray-600 py-8">素材がありません</p>
          )}
        </div>
      );
    } else {
      const sheet = open as SoundSheetItem;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 sticky top-0 bg-[#0b0e14] py-1 z-10">
            <button onClick={() => setOpen(null)} className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-bold shrink-0">
              <ChevronLeft size={13} />一覧
            </button>
            <div className="min-w-0">
              <p className="text-[12px] text-gray-100 font-bold truncate">{sheet.name || `セット #${sheet.no}`}</p>
              <p className="text-[9px] text-gray-600">{sheet.sound_ids.length}個の効果音{sheet.comment && sheet.comment !== 'なし' ? ` ・ ${sheet.comment}` : ''}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {sheet.sound_ids.map((m, i) => (
              <div key={`${m.id}-${i}`} className="flex items-center gap-2 p-2 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900">
                <button
                  onClick={() => toggleSoundPreview(m.id)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${previewNo === m.id ? 'bg-red-600/20 text-red-400' : 'bg-[#a3e635]/20 text-[#a3e635]'}`}
                  title={previewNo === m.id ? '停止' : '試聴'}
                >
                  {previewNo === m.id ? <Square size={11} /> : <Play size={11} className="ml-0.5" />}
                </button>
                <p className="flex-1 text-[11px] text-gray-200 font-mono truncate">{m.id}</p>
                <button onClick={() => pickSound(m, sheet.name)} className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shrink-0 flex items-center gap-1">
                  <Check size={11} />使う
                </button>
              </div>
            ))}
          </div>
          {sheet.sound_ids.length === 0 && (
            <p className="text-center text-[11px] text-gray-600 py-8">素材がありません</p>
          )}
        </div>
      );
    }
  }

  // ── セット一覧ビュー ──
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            placeholder={placeholder}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
          />
        </div>
        <button onClick={runSearch} className="px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shrink-0">検索</button>
      </div>

      <p className="text-[10px] text-gray-600 px-0.5">
        {kindLabel}{total > 0 && <> ・全{total.toLocaleString()}セット</>}
        <span className="text-gray-700">（提供: rpgen-search）</span>
      </p>

      {error ? (
        <p className="text-center text-[11px] text-red-400 py-8">読み込みに失敗しました。時間をおいて再検索してください。</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {kind === 'walk'
              ? (sheets as SAnimSheetItem[]).map((s) => (
                <button
                  key={s.no}
                  onClick={() => setOpen(s)}
                  className="w-full flex items-center gap-2 p-1.5 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900 text-left"
                >
                  <div className="flex gap-0.5 shrink-0">
                    {s.anim_ids.slice(0, 4).map((m, i) => (
                      <span key={`${m.id}-${i}`} className="w-8 h-8 rounded-sm bg-[#11131a] gimp-checkered-background overflow-hidden shrink-0 flex items-center justify-center">
                        <WalkSpritePreview url={sAnimUrl(m.id)} size={32} />
                      </span>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-gray-100 font-bold truncate">{s.name || `セット #${s.no}`}</p>
                    <p className="text-[9px] text-gray-600">{s.anim_ids.length}個</p>
                  </div>
                  <ChevronRight size={15} className="text-gray-600 shrink-0" />
                </button>
              ))
              : (sheets as SoundSheetItem[]).map((s) => (
                <button
                  key={s.no}
                  onClick={() => setOpen(s)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-gray-100 font-bold truncate">{s.name || `セット #${s.no}`}</p>
                    <p className="text-[9px] text-gray-600">{s.sound_ids.length}個の効果音{s.comment && s.comment !== 'なし' ? ` ・ ${s.comment}` : ''}</p>
                  </div>
                  <ChevronRight size={15} className="text-gray-600 shrink-0" />
                </button>
              ))
            }
          </div>
          {loading && <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-gray-500" /></div>}
          {!loading && sheets.length === 0 && <p className="text-center text-[11px] text-gray-600 py-8">該当するセットがありません</p>}
          {!loading && page < pages && (
            <button onClick={() => setPage((p) => p + 1)} className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold">
              もっと見る（{page} / {pages}）
            </button>
          )}
        </>
      )}
    </div>
  );
}
