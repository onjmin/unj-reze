'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { loadImage } from '@/lib/walk-sprite';
import { buildWalkRef } from '@/lib/asset-ref';
import {
  LOCAL_TILE_SHEETS, localTileUrl, DQ_CHARACTERS,
  type LocalTileSheet,
} from '@/lib/local-assets';
import WalkSpritePreview from './WalkSpritePreview';
import type { PickResult } from './ContentPicker';

interface LocalAssetPanelProps {
  onPick: (res: PickResult) => void;
}

const TILES_PER_CHUNK = 160;

// 内蔵素材タブ: リポジトリ同梱のスプライトシート（DQ風キャラ + 16pxタイルセット）。
// キャラは RPGEN 歩行規格へスライス済みシートを walk: 参照、タイルは url:#crop 参照で選ぶ。
export default function LocalAssetPanel({ onPick }: LocalAssetPanelProps) {
  const [section, setSection] = useState<string>('chars');

  const secBtn = (active: boolean) =>
    `shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${active ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800'}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        <button className={secBtn(section === 'chars')} onClick={() => setSection('chars')}>🚶 キャラ</button>
        {LOCAL_TILE_SHEETS.map((s) => (
          <button key={s.id} className={secBtn(section === s.id)} onClick={() => setSection(s.id)}>{s.name}</button>
        ))}
      </div>

      {section === 'chars' ? (
        <>
          <p className="text-[10px] text-gray-600 px-0.5">DQ風キャラ（RPGEN 16px・2フレーム×4方向）</p>
          <div className="grid grid-cols-4 gap-1.5">
            {DQ_CHARACTERS.map((c) => (
              <button
                key={c.surface}
                onClick={() => onPick({ ref: buildWalkRef('rpgen', { kind: 'url', url: c.url }), url: c.url, label: c.name })}
                className="flex flex-col items-center gap-1 p-1.5 rounded-lg border border-gray-800 hover:border-blue-500 bg-[#11131a] gimp-checkered-background group"
              >
                <WalkSpritePreview url={c.url} stdId="rpgen" size={44} />
                <span className="text-[9px] font-bold text-gray-400 group-hover:text-blue-400 truncate w-full text-center">{c.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <LocalTileGrid
          key={section}
          sheet={LOCAL_TILE_SHEETS.find((s) => s.id === section)!}
          onPick={onPick}
        />
      )}
    </div>
  );
}

// シートごとの「空でないマス」インデックスをキャッシュ（パネル開閉で再スキャンしない）
const nonEmptyCache = new Map<string, number[]>();

/** シートを16pxグリッドで走査し、非透明ピクセルを含むマスだけをタップ選択できるグリッドで出す。
 *  シート切り替えは親が key で作り直すため、状態リセットは初期値だけで済む。 */
function LocalTileGrid({ sheet, onPick }: { sheet: LocalTileSheet; onPick: (res: PickResult) => void }) {
  const [cells, setCells] = useState<number[] | null>(() => nonEmptyCache.get(sheet.id) ?? null);
  const [shown, setShown] = useState(TILES_PER_CHUNK);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (nonEmptyCache.has(sheet.id)) return;
    let cancelled = false;
    loadImage(sheet.url)
      .then((img) => {
        if (cancelled) return;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const t = sheet.tile;
        const found: number[] = [];
        for (let row = 0; row < sheet.rows; row++) {
          for (let col = 0; col < sheet.cols; col++) {
            let opaque = false;
            for (let y = row * t; y < (row + 1) * t && !opaque; y++) {
              const base = (y * canvas.width + col * t) * 4;
              for (let x = 0; x < t; x++) {
                if (data[base + x * 4 + 3] > 0) { opaque = true; break; }
              }
            }
            if (opaque) found.push(row * sheet.cols + col);
          }
        }
        nonEmptyCache.set(sheet.id, found);
        if (!cancelled) setCells(found);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [sheet]);

  if (error) return <p className="text-center text-[11px] text-red-400 py-8">シートの読み込みに失敗しました</p>;
  if (!cells) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-gray-500" /></div>;

  const visible = cells.slice(0, shown);
  const pick = (idx: number) => {
    const col = idx % sheet.cols;
    const row = (idx / sheet.cols) | 0;
    const url = localTileUrl(sheet, col, row);
    onPick({ ref: `url:${url}`, url, label: `${sheet.name} (${col},${row})` });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-gray-600 px-0.5">{sheet.name} ・ 全{cells.length}マス（16px）</p>
      <div className="grid grid-cols-8 gap-1">
        {visible.map((idx) => {
          const col = idx % sheet.cols;
          const row = (idx / sheet.cols) | 0;
          return (
            <button
              key={idx}
              onClick={() => pick(idx)}
              title={`(${col},${row})`}
              className="aspect-square rounded border border-gray-800 hover:border-blue-500 bg-[#11131a] gimp-checkered-background overflow-hidden"
            >
              <div
                className="w-full h-full"
                style={{
                  backgroundImage: `url(${sheet.url})`,
                  backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
                  backgroundPosition: `${sheet.cols > 1 ? (col / (sheet.cols - 1)) * 100 : 0}% ${sheet.rows > 1 ? (row / (sheet.rows - 1)) * 100 : 0}%`,
                  imageRendering: 'pixelated',
                }}
              />
            </button>
          );
        })}
      </div>
      {shown < cells.length && (
        <button onClick={() => setShown((s) => s + TILES_PER_CHUNK)} className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold">
          もっと見る（{visible.length} / {cells.length}）
        </button>
      )}
    </div>
  );
}
