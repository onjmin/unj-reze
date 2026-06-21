'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, Loader2, Play, Square, Check } from 'lucide-react';
import {
  searchSprites, searchSpriteAnims, searchSounds,
  spriteUrl, sAnimUrl, soundUrl,
  type SpriteItem, type SpriteAnimItem, type SoundItem,
} from '@/lib/rpgen-assets';
import { buildWalkRef } from '@/lib/asset-ref';
import WalkSpritePreview from './WalkSpritePreview';
import type { PickResult } from './ContentPicker';

type Kind = 'sprite' | 'walk' | 'sound';

interface RpgenAssetPanelProps {
  kind: Kind;
  onPick: (res: PickResult) => void;
}

const PER_PAGE = 48;

// RPGen Search のアセット（ドット絵スプライト / 歩行グラ / 効果音）をブラウズして選ぶパネル。
// ContentPicker のタブ内に埋め込んで使う。モバイルファースト・ドット絵想定。
export default function RpgenAssetPanel({ kind, onPick }: RpgenAssetPanelProps) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [items, setItems] = useState<(SpriteItem | SpriteAnimItem | SoundItem)[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [previewNo, setPreviewNo] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchPage = useCallback((q: string, p: number, signal: AbortSignal) => {
    const params = { q, page: p, limit: PER_PAGE, signal };
    if (kind === 'sprite') return searchSprites(params);
    if (kind === 'walk') return searchSpriteAnims(params);
    return searchSounds(params);
  }, [kind]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(false);
    fetchPage(submitted, page, ctrl.signal)
      .then((res) => {
        setItems((prev) => (page === 1 ? res.data : [...prev, ...res.data]));
        setPages(res.meta.pages);
        setTotal(res.meta.total);
      })
      .catch((e) => { if (e?.name !== 'AbortError') setError(true); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [fetchPage, submitted, page]);

  // クリーンアップ: プレビュー音声を止める
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const runSearch = () => { setPage(1); setSubmitted(query.trim()); };

  const toggleSoundPreview = (no: number) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (previewNo === no) { setPreviewNo(null); return; }
    const a = new Audio(soundUrl(no));
    a.volume = 0.7;
    a.onended = () => setPreviewNo((cur) => (cur === no ? null : cur));
    a.play().catch(() => {});
    audioRef.current = a;
    setPreviewNo(no);
  };

  const pickSprite = (it: SpriteItem) =>
    onPick({ ref: `url:${spriteUrl(it.no)}`, url: spriteUrl(it.no), label: `素材 #${it.no}` });

  const pickWalk = (it: SpriteAnimItem) => {
    const url = sAnimUrl(it.no);
    onPick({ ref: buildWalkRef('auto', { kind: 'url', url }), url, label: `歩行グラ #${it.no}` });
  };

  const pickSound = (it: SoundItem) =>
    onPick({ ref: `direct:${soundUrl(it.no)}`, url: soundUrl(it.no), label: it.title || `SE #${it.no}` });

  const placeholder = kind === 'sound' ? '効果音を検索（例: 攻撃, ジャンプ）' : 'ドット絵を検索（例: 魔王, スライム）';

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
        RPGen素材ライブラリ{total > 0 && <> ・全{total.toLocaleString()}件</>}
        <span className="text-gray-700"> （提供: rpgen-search）</span>
      </p>

      {error ? (
        <p className="text-center text-[11px] text-red-400 py-8">読み込みに失敗しました。時間をおいて再検索してください。</p>
      ) : (
        <>
          {kind === 'sound' ? (
            <div className="space-y-1.5">
              {(items as SoundItem[]).map((it) => (
                <div key={it.no} className="flex items-center gap-2 p-2 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900">
                  <button
                    onClick={() => toggleSoundPreview(it.no)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${previewNo === it.no ? 'bg-red-600/20 text-red-400' : 'bg-[#a3e635]/20 text-[#a3e635]'}`}
                    title={previewNo === it.no ? '停止' : '試聴'}
                  >
                    {previewNo === it.no ? <Square size={11} /> : <Play size={11} className="ml-0.5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-200 font-bold truncate">{it.title || `SE #${it.no}`}</p>
                    <p className="text-[9px] text-gray-600">#{it.no} ・ {(it.file_size / 1024).toFixed(0)}KB</p>
                  </div>
                  <button onClick={() => pickSound(it)} className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shrink-0 flex items-center gap-1">
                    <Check size={11} />使う
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className={kind === 'walk' ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-4 gap-2'}>
              {kind === 'walk'
                ? (items as SpriteAnimItem[]).map((it) => (
                    <button
                      key={it.no}
                      onClick={() => pickWalk(it)}
                      className="aspect-square rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 bg-[#11131a] relative flex items-center justify-center gimp-checkered-background"
                      title={`#${it.no} ${it.comment || ''}`}
                    >
                      <WalkSpritePreview url={sAnimUrl(it.no)} size={56} />
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-gray-300 px-1 truncate">#{it.no}</span>
                    </button>
                  ))
                : (items as SpriteItem[]).map((it) => (
                    <button
                      key={it.no}
                      onClick={() => pickSprite(it)}
                      className="aspect-square rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 bg-[#11131a] relative flex items-center justify-center p-1"
                      title={`#${it.no} ${it.comment || ''}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={spriteUrl(it.no)} alt="" className="max-w-full max-h-full" style={{ imageRendering: 'pixelated' }} loading="lazy" />
                    </button>
                  ))}
            </div>
          )}

          {loading && <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-gray-500" /></div>}
          {!loading && items.length === 0 && <p className="text-center text-[11px] text-gray-600 py-8">該当する素材がありません</p>}
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
