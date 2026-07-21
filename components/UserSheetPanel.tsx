'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { loadImage } from '@/lib/walk-sprite';
import {
  addUserSheet, removeUserSheet, subscribeUserSheets,
  userSheetsSnapshot, userSheetsServerSnapshot,
  userSheetCellRef, userSheetCellUrl, type UserSheet,
} from '@/lib/user-sheets';
import type { PickResult } from './ContentPicker';

interface UserSheetPanelProps {
  /** マスを選んだときの通知。管理だけしたい場合は省略できる（選択不可になる）。 */
  onPick?: (res: PickResult) => void;
}

const CELLS_PER_CHUNK = 240;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** マイシート：直リンクやアップロード画像を「マス目サイズ」で切り出して素材として使う。
 *  内蔵素材タブ（LocalAssetPanel）と同じ url:#crop 参照を作るので、
 *  タイル・オブジェクト・歩行グラなど既存の参照先すべてにそのまま使える。 */
export default function UserSheetPanel({ onPick }: UserSheetPanelProps) {
  const sheets = useSyncExternalStore(subscribeUserSheets, userSheetsSnapshot, userSheetsServerSnapshot);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const open = sheets.find(s => s.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {sheets.map(s => (
          <button
            key={s.id}
            onClick={() => setOpenId(openId === s.id ? null : s.id)}
            className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${openId === s.id ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800'}`}
          >
            {s.name}
          </button>
        ))}
        <button
          onClick={() => setAdding(v => !v)}
          className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${adding ? 'bg-gray-700 text-white border-gray-600' : 'bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800'}`}
        >
          <Plus size={11} className="inline -mt-0.5 mr-0.5" />シートを追加
        </button>
      </div>

      {adding && <AddSheetForm onDone={id => { setAdding(false); setOpenId(id); }} />}

      {sheets.length === 0 && !adding && (
        <p className="text-[10px] text-gray-500 px-0.5 leading-relaxed">
          スプライトシートの画像URL（または手持ちの画像）とマス目サイズを登録すると、
          1マスずつ切り出してタイルやキャラの素材として使えます。
        </p>
      )}

      {open && (
        <SheetGrid
          key={open.id}
          sheet={open}
          onPick={onPick}
          onDelete={() => { removeUserSheet(open.id); setOpenId(null); }}
        />
      )}
    </div>
  );
}

/** URL直リンク or 画像アップロードでシートを登録するフォーム。 */
function AddSheetForm({ onDone }: { onDone: (id: string) => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [cellW, setCellW] = useState(16);
  const [cellH, setCellH] = useState(16);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) { setError('画像ファイルを選択してください'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError('5MB以下の画像を選択してください'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      try {
        // アップロードしてURL化する。参照は絶対URLになるので、他の人の画面でも表示される。
        const res = await api.upload.image({ image: reader.result as string });
        setUrl(res.url);
        if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
      } catch {
        setError('アップロードに失敗しました');
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    setError(null);
    if (!url.trim()) { setError('画像URLを入力するか、画像を選んでください'); return; }
    if (cellW <= 0 || cellH <= 0) { setError('マス目サイズは1以上にしてください'); return; }
    setBusy(true);
    try {
      // 読めない画像／マス目より小さい画像はここで弾く（登録後に空グリッドになるのを防ぐ）
      const img = await loadImage(url.trim());
      if (img.naturalWidth < cellW || img.naturalHeight < cellH) {
        setError('画像がマス目サイズより小さいです');
        return;
      }
      const created = addUserSheet({ name: name.trim() || 'マイシート', url: url.trim(), cellW, cellH });
      onDone(created.id);
    } catch {
      setError('画像を読み込めませんでした（URLとCORSを確認してください）');
    } finally {
      setBusy(false);
    }
  };

  const numInput = 'w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none';

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2">
      <input
        value={name} onChange={e => setName(e.target.value)} placeholder="シート名（任意）"
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none"
      />
      <div className="flex items-center gap-1.5">
        <input
          value={url} onChange={e => setUrl(e.target.value)} placeholder="画像の直リンクURL"
          className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none"
        />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300 disabled:opacity-50"
        >
          <Upload size={12} />画像から
        </button>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-gray-400">
        <label className="flex items-center gap-1">マス目
          <input type="number" min={1} value={cellW} onChange={e => setCellW(Number(e.target.value))} className={numInput} />
        </label>
        <span>×</span>
        <input type="number" min={1} value={cellH} onChange={e => setCellH(Number(e.target.value))} className={numInput} />
        <span>px</span>
        <div className="flex gap-1 ml-auto">
          {[16, 32, 48].map(n => (
            <button key={n} onClick={() => { setCellW(n); setCellH(n); }}
              className="px-1.5 py-1 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-300 hover:bg-gray-700">{n}</button>
          ))}
        </div>
      </div>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <button
        onClick={submit} disabled={busy}
        className="w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-[11px] text-white font-bold"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}登録する
      </button>
    </div>
  );
}

interface Cell { col: number; row: number; opaque: boolean }

/** 登録シートをマス目で走査し、中身のあるマスだけ選べるグリッドにする。 */
function SheetGrid({ sheet, onPick, onDelete }: { sheet: UserSheet; onPick?: (res: PickResult) => void; onDelete: () => void }) {
  const [cells, setCells] = useState<Cell[] | null>(null);
  const [size, setSize] = useState<{ cols: number; rows: number } | null>(null);
  const [shown, setShown] = useState(CELLS_PER_CHUNK);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadImage(sheet.url).then(img => {
      if (cancelled) return;
      const cols = Math.floor(img.naturalWidth / sheet.cellW);
      const rows = Math.floor(img.naturalHeight / sheet.cellH);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { setError(true); return; }
      ctx.drawImage(img, 0, 0);
      let data: Uint8ClampedArray | null = null;
      try {
        data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      } catch {
        // 他オリジンの画像は getImageData が使えない（CORS）。その場合は全マスを選択可能にする。
        data = null;
      }
      const list: Cell[] = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          let opaque = true;
          if (data) {
            opaque = false;
            for (let y = row * sheet.cellH; y < (row + 1) * sheet.cellH && !opaque; y++) {
              const base = (y * canvas.width + col * sheet.cellW) * 4;
              for (let x = 0; x < sheet.cellW; x++) {
                if (data[base + x * 4 + 3] > 0) { opaque = true; break; }
              }
            }
          }
          list.push({ col, row, opaque });
        }
      }
      setSize({ cols, rows });
      setCells(list);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [sheet.url, sheet.cellW, sheet.cellH]);

  const header = (
    <div className="flex items-center gap-2 px-0.5">
      <p className="text-[10px] text-gray-500 flex-1 truncate">
        {sheet.name} ・ {sheet.cellW}×{sheet.cellH}px
        {size ? ` ・ ${size.cols}×${size.rows}マス` : ''}
      </p>
      <button onClick={onDelete} title="このシートを削除"
        className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10">
        <Trash2 size={14} />
      </button>
    </div>
  );

  if (error) return <>{header}<p className="text-center text-[11px] text-red-400 py-6">画像を読み込めませんでした</p></>;
  if (!cells || !size) return <>{header}<div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-gray-500" /></div></>;

  const usable = cells.filter(c => c.opaque);
  const visible = usable.slice(0, shown);
  const cols = Math.min(8, Math.max(4, size.cols));

  return (
    <>
      {header}
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {visible.map(c => (
          <button
            key={`${c.col},${c.row}`}
            onClick={() => onPick?.({
              ref: userSheetCellRef(sheet, c.col, c.row),
              url: userSheetCellUrl(sheet, c.col, c.row),
              label: `${sheet.name} (${c.col},${c.row})`,
            })}
            disabled={!onPick}
            title={`(${c.col},${c.row})`}
            className="pixel-select-hover aspect-square rounded border border-gray-800 hover:border-blue-500 bg-[#11131a] gimp-checkered-background disabled:hover:border-gray-800"
          >
            <div
              className="w-full h-full overflow-hidden"
              style={{
                backgroundImage: `url(${sheet.url})`,
                backgroundSize: `${size.cols * 100}% ${size.rows * 100}%`,
                backgroundPosition: `${size.cols > 1 ? (c.col / (size.cols - 1)) * 100 : 0}% ${size.rows > 1 ? (c.row / (size.rows - 1)) * 100 : 0}%`,
                imageRendering: 'pixelated',
              }}
            />
          </button>
        ))}
      </div>
      {shown < usable.length && (
        <button onClick={() => setShown(s => s + CELLS_PER_CHUNK)}
          className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold">
          もっと見る（{visible.length} / {usable.length}）
        </button>
      )}
    </>
  );
}
