'use client';
import { useState } from 'react';
import { Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { uid, SPELL_PALETTE, type SpellBlock, type SpellBlockKind } from './game-presets/shared';

// ── メタデータ ────────────────────────────────────────────────────────
const META: Record<SpellBlockKind, { label: string; icon: string; clr: string; dim: string }> = {
  wait:   { label: '待つ',    icon: '⏱', clr: '#9ca3af', dim: '#1f2937' },
  nway:   { label: 'N方向',  icon: '✦', clr: '#f97316', dim: '#431407' },
  aimed:  { label: '狙い弾', icon: '🎯', clr: '#ef4444', dim: '#450a0a' },
  spiral: { label: '渦巻き', icon: '🌀', clr: '#a855f7', dim: '#2e1065' },
  repeat: { label: '繰返し', icon: '🔁', clr: '#f59e0b', dim: '#451a03' },
};
const PALETTE_KINDS: SpellBlockKind[] = ['wait', 'nway', 'aimed', 'spiral', 'repeat'];

export const defaultBlock = (kind: SpellBlockKind): SpellBlock => {
  const base: SpellBlock = {
    id: uid(), kind,
    frames: 30, ways: 6, speed: 2.5, color: 4, spread: 360,
    jitter: 10, rotSpeed: 5, angle: 90, times: 3, body: [],
  };
  if (kind === 'aimed')  return { ...base, color: 2, speed: 2.2, jitter: 10 };
  if (kind === 'nway')   return { ...base, ways: 8, spread: 360, color: 5 };
  if (kind === 'spiral') return { ...base, ways: 6, rotSpeed: 6, color: 3 };
  if (kind === 'repeat') return { ...base, times: 3, body: [] };
  return base;
};

// ── サブコンポーネント ────────────────────────────────────────────────
function NumSlider({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] py-0.5">
      <span className="text-gray-400 w-14 shrink-0 leading-none">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 accent-blue-400" />
      <span className="text-gray-200 w-9 text-right font-mono shrink-0">{value}</span>
    </label>
  );
}

function ColorRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span className="text-gray-400 text-[11px] w-14 shrink-0">色</span>
      <div className="flex gap-1 flex-wrap">
        {SPELL_PALETTE.map((col, i) => (
          <button key={i} onClick={() => onChange(i)}
            style={{ background: col, outline: i === value ? '2px solid #fff' : undefined, outlineOffset: '1px' }}
            className="w-5 h-5 rounded-full border border-black/30 shrink-0 touch-manipulation" />
        ))}
      </div>
    </div>
  );
}

// ── BlockCard ────────────────────────────────────────────────────────
interface BlockCardProps {
  block: SpellBlock;
  depth?: number;
  onUpdate: (b: SpellBlock) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function BlockCard({ block, depth = 0, onUpdate, onDelete, onMoveUp, onMoveDown }: BlockCardProps) {
  const [open, setOpen] = useState(false);
  const m = META[block.kind];
  const upd = (patch: Partial<SpellBlock>) => onUpdate({ ...block, ...patch });

  const summary = (() => {
    switch (block.kind) {
      case 'wait':   return `${block.frames}f`;
      case 'nway':   return `${block.ways}方向 spd${block.speed} ±${block.spread}°`;
      case 'aimed':  return `spd${block.speed} ブレ±${block.jitter}°`;
      case 'spiral': return `${block.ways}腕 rot${block.rotSpeed}°/f`;
      case 'repeat': return `×${block.times}  (${block.body.length}ブロック)`;
    }
  })();

  return (
    <div style={{ marginLeft: depth * 10 }} className="mb-1.5">
      {/* カード */}
      <div style={{ background: m.dim, borderLeft: `3px solid ${m.clr}` }}
        className="rounded-r-lg overflow-hidden select-none">
        {/* ヘッダ行（タップで展開） */}
        <div className="flex items-center gap-2 px-2 py-2 cursor-pointer active:brightness-125 touch-manipulation"
          onClick={() => setOpen(o => !o)}>
          <span className="text-base leading-none">{m.icon}</span>
          <span style={{ color: m.clr }} className="text-xs font-bold w-14 shrink-0">{m.label}</span>
          <span className="text-gray-400 text-[10px] flex-1 truncate">{summary}</span>
          {/* 並べ替え + 削除ボタン */}
          <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
            {onMoveUp && (
              <button onPointerDown={e => { e.stopPropagation(); onMoveUp(); }}
                className="p-1 text-gray-500 active:text-white touch-manipulation"><ChevronUp size={13} /></button>
            )}
            {onMoveDown && (
              <button onPointerDown={e => { e.stopPropagation(); onMoveDown(); }}
                className="p-1 text-gray-500 active:text-white touch-manipulation"><ChevronDown size={13} /></button>
            )}
            <button onPointerDown={e => { e.stopPropagation(); onDelete(); }}
              className="p-1 text-red-500 active:text-red-300 touch-manipulation"><Trash2 size={13} /></button>
          </div>
        </div>

        {/* パラメータ展開 */}
        {open && (
          <div className="px-3 pb-3 pt-1 space-y-1 border-t border-white/10">
            {block.kind === 'wait' && (
              <NumSlider label="フレーム" value={block.frames} min={1} max={300} onChange={v => upd({ frames: v })} />
            )}
            {(block.kind === 'nway' || block.kind === 'spiral' || block.kind === 'aimed') && (
              <>
                <NumSlider label="速度" value={block.speed} min={0.5} max={8} step={0.1} onChange={v => upd({ speed: +v.toFixed(1) })} />
                <ColorRow value={block.color} onChange={v => upd({ color: v })} />
              </>
            )}
            {block.kind === 'nway' && (
              <>
                <NumSlider label="方向数" value={block.ways} min={1} max={24} onChange={v => upd({ ways: v })} />
                <NumSlider label="拡散角°" value={block.spread} min={10} max={360} onChange={v => upd({ spread: v })} />
                <NumSlider label="基準角°" value={block.angle} min={0} max={359} onChange={v => upd({ angle: v })} />
              </>
            )}
            {block.kind === 'aimed' && (
              <NumSlider label="ブレ°" value={block.jitter} min={0} max={60} onChange={v => upd({ jitter: v })} />
            )}
            {block.kind === 'spiral' && (
              <>
                <NumSlider label="腕数" value={block.ways} min={1} max={16} onChange={v => upd({ ways: v })} />
                <NumSlider label="回転速度" value={block.rotSpeed} min={1} max={30} onChange={v => upd({ rotSpeed: v })} />
              </>
            )}
            {block.kind === 'repeat' && (
              <NumSlider label="繰返し回数" value={block.times} min={1} max={99} onChange={v => upd({ times: v })} />
            )}
          </div>
        )}
      </div>

      {/* repeat の子ブロック */}
      {block.kind === 'repeat' && (
        <div className="mt-1">
          {block.body.map((child, i) => (
            <BlockCard key={child.id} block={child} depth={depth + 1}
              onUpdate={nb => upd({ body: block.body.map((b, j) => j === i ? nb : b) })}
              onDelete={() => upd({ body: block.body.filter((_, j) => j !== i) })}
              onMoveUp={i > 0 ? () => {
                const b = [...block.body]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; upd({ body: b });
              } : undefined}
              onMoveDown={i < block.body.length - 1 ? () => {
                const b = [...block.body]; [b[i], b[i + 1]] = [b[i + 1], b[i]]; upd({ body: b });
              } : undefined}
            />
          ))}
          {/* repeat 内へのブロック追加 */}
          <div style={{ marginLeft: (depth + 1) * 10 }} className="flex gap-1 flex-wrap mt-1 mb-2">
            {(['wait', 'nway', 'aimed', 'spiral'] as SpellBlockKind[]).map(k => (
              <button key={k} onClick={() => upd({ body: [...block.body, defaultBlock(k)] })}
                style={{ borderColor: META[k].clr, color: META[k].clr }}
                className="text-[10px] border rounded px-1.5 py-1 active:opacity-60 touch-manipulation">
                + {META[k].icon} {META[k].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SpellEditor（メインコンポーネント） ────────────────────────────────
interface Props {
  blocks: SpellBlock[];
  onChange: (blocks: SpellBlock[]) => void;
}

export default function SpellEditor({ blocks, onChange }: Props) {
  const upd = (i: number, nb: SpellBlock) => onChange(blocks.map((b, j) => j === i ? nb : b));
  const del = (i: number) => onChange(blocks.filter((_, j) => j !== i));
  const add = (kind: SpellBlockKind) => onChange([...blocks, defaultBlock(kind)]);
  const moveUp = (i: number) => {
    if (i === 0) return;
    const b = [...blocks]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; onChange(b);
  };
  const moveDown = (i: number) => {
    if (i >= blocks.length - 1) return;
    const b = [...blocks]; [b[i], b[i + 1]] = [b[i + 1], b[i]]; onChange(b);
  };

  return (
    <div className="flex flex-col gap-0">
      {/* ブロック列 */}
      {blocks.length === 0 && (
        <p className="text-gray-600 text-xs text-center py-6">
          下のパレットからブロックを追加してください
        </p>
      )}
      {blocks.map((b, i) => (
        <BlockCard key={b.id} block={b}
          onUpdate={nb => upd(i, nb)}
          onDelete={() => del(i)}
          onMoveUp={i > 0 ? () => moveUp(i) : undefined}
          onMoveDown={i < blocks.length - 1 ? () => moveDown(i) : undefined}
        />
      ))}

      {/* パレット（Scratch 風ブロックパレット） */}
      <div className="mt-3 pt-2.5 border-t border-gray-700/60">
        <p className="text-[10px] text-gray-500 mb-2">ブロックを追加</p>
        <div className="flex gap-1.5 flex-wrap">
          {PALETTE_KINDS.map(k => {
            const m = META[k];
            return (
              <button key={k} onClick={() => add(k)}
                style={{ background: m.dim, borderColor: m.clr, color: m.clr }}
                className="flex items-center gap-1 text-[11px] font-bold border rounded-lg px-2.5 py-2 active:brightness-125 touch-manipulation">
                <span>{m.icon}</span> {m.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
