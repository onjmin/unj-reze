'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { searchSpriteSheets, spriteUrl, type SpriteSheetItem, type SpriteSheetMember } from '@/lib/rpgen-assets';
import type { PickResult } from './ContentPicker';

interface SpriteSheetBrowserProps {
  onPick: (res: PickResult) => void;
}

const SHEETS_PER_PAGE = 24;
const SPRITES_PER_CHUNK = 120;

// 素材タブ: 人間がまとめた「スプライトシート（カテゴリ）」を2段階で辿る。
//  一覧（名前つきカテゴリ） → タップ → 中の素材を密なグリッドで選ぶ。
// 16pxドット絵は pixelated 拡大してセルいっぱいに表示し、余白を詰める。
export default function SpriteSheetBrowser({ onPick }: SpriteSheetBrowserProps) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [sheets, setSheets] = useState<SpriteSheetItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [open, setOpen] = useState<SpriteSheetItem | null>(null);
  const [shown, setShown] = useState(SPRITES_PER_CHUNK);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(false);
    searchSpriteSheets({ q: submitted, page, limit: SHEETS_PER_PAGE, signal: ctrl.signal })
      .then((res) => {
        setSheets((prev) => (page === 1 ? res.data : [...prev, ...res.data]));
        setPages(res.meta.pages);
        setTotal(res.meta.total);
      })
      .catch((e) => { if (e?.name !== 'AbortError') setError(true); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [submitted, page]);

  const runSearch = () => { setPage(1); setSubmitted(query.trim()); };

  const openSheet = (s: SpriteSheetItem) => { setOpen(s); setShown(SPRITES_PER_CHUNK); scrollRef.current?.scrollTo(0, 0); };

  const pick = (m: SpriteSheetMember, sheetName: string) =>
    onPick({ ref: `url:${spriteUrl(m.id)}`, url: spriteUrl(m.id), label: sheetName ? `${sheetName} #${m.no}` : `素材 #${m.no}` });

  // ── 詳細（シート内の素材グリッド） ──
  if (open) {
    const ids = open.sprite_ids;
    const visible = ids.slice(0, shown);
    return (
      <div className="flex flex-col gap-2" ref={scrollRef}>
        <div className="flex items-center gap-2 sticky top-0 bg-[#0b0e14] py-1 z-10">
          <button onClick={() => setOpen(null)} className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-bold shrink-0">
            <ChevronLeft size={13} />一覧
          </button>
          <div className="min-w-0">
            <p className="text-[12px] text-gray-100 font-bold truncate">{open.name || `シート #${open.no}`}</p>
            <p className="text-[9px] text-gray-600">{ids.length}個の素材{open.comment && open.comment !== 'なし' ? ` ・ ${open.comment}` : ''}</p>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {visible.map((m, i) => (
            <button
              key={`${m.id}-${i}`}
              onClick={() => pick(m, open.name)}
              className="aspect-square rounded border border-gray-800 hover:border-blue-500 bg-[#11131a] gimp-checkered-background relative group"
              title={`#${m.no}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={spriteUrl(m.id)} alt="" className="w-full h-full object-contain p-px" style={{ imageRendering: 'pixelated' }} loading="lazy" />
            </button>
          ))}
        </div>
        {shown < ids.length && (
          <button onClick={() => setShown((s) => s + SPRITES_PER_CHUNK)} className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold">
            もっと見る（{visible.length} / {ids.length}）
          </button>
        )}
      </div>
    );
  }

  // ── 一覧（カテゴリ） ──
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            placeholder="まとめ名で検索（例: モンスター, 主人公）"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
          />
        </div>
        <button onClick={runSearch} className="px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shrink-0">検索</button>
      </div>
      <p className="text-[10px] text-gray-600 px-0.5">
        人がまとめた素材集{total > 0 && <> ・{total}まとめ</>}<span className="text-gray-700">（提供: rpgen-search）</span>
      </p>

      {error ? (
        <p className="text-center text-[11px] text-red-400 py-8">読み込みに失敗しました。時間をおいて再検索してください。</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {sheets.map((s) => (
              <button
                key={s.no}
                onClick={() => openSheet(s)}
                className="w-full flex items-center gap-2 p-1.5 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900 text-left"
              >
                <div className="flex gap-0.5 shrink-0">
                  {s.sprite_ids.slice(0, 5).map((m, i) => (
                    <span key={`${m.id}-${i}`} className="w-7 h-7 rounded-sm bg-[#11131a] gimp-checkered-background overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={spriteUrl(m.id)} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} loading="lazy" />
                    </span>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-gray-100 font-bold truncate">{s.name || `シート #${s.no}`}</p>
                  <p className="text-[9px] text-gray-600">{s.sprite_ids.length}個</p>
                </div>
                <ChevronRight size={15} className="text-gray-600 shrink-0" />
              </button>
            ))}
          </div>
          {loading && <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-gray-500" /></div>}
          {!loading && sheets.length === 0 && <p className="text-center text-[11px] text-gray-600 py-8">該当するまとめがありません</p>}
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
