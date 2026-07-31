'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  BarChart3, Clapperboard, History, Image as ImageIcon, Layers, Music,
  Plus, Trash2, Type, X,
} from 'lucide-react';
import ContentPicker, { type PickResult } from './ContentPicker';
import HistoryModal from './HistoryModal';
import MvPlayer from './MvPlayer';
import VolumeControl from './VolumeControl';
import { MV_PRESETS, buildMvPreset } from './mv-presets';
import { refLabel } from '@/lib/asset-ref';
import { clearAutosave, getAutosave, getStorageKey, saveAutosave, saveHistory } from '@/lib/history';
import {
  MV_H, MV_MOTION_LABELS, MV_VISUALIZER_LABELS, MV_W, mvUid,
  type MvImageLayer, type MvLayer, type MvLyricsLayer, type MvManifest,
  type MvMotion, type MvPresetKind, type MvSection, type MvTextLayer,
  type MvVisualizerLayer, type MvVisualizerStyle,
} from '@/lib/mv-config';
import { parseMvSong, EMPTY_SONG, type MvSong } from '@/lib/mv-engine';

const MmlEditor = dynamic(() => import('./MmlEditor'), { ssr: false });

type Tab = 'preset' | 'song' | 'stage' | 'layers' | 'lyrics' | 'sections';

const TABS: { id: Tab; label: string }[] = [
  { id: 'preset', label: 'プリセット' },
  { id: 'song', label: '楽曲' },
  { id: 'stage', label: '背景' },
  { id: 'layers', label: 'レイヤー' },
  { id: 'lyrics', label: '歌詞' },
  { id: 'sections', label: '場面' },
];

interface MvMakerProps {
  onClose: () => void;
  onSave: (data: { manifest: MvManifest; title: string; preset: MvPresetKind }) => void;
  userId: string;
  initialManifest?: MvManifest;
  isEditing?: boolean;
}

// ───────────────── 共通の小物 ─────────────────

const SECTION_CLASS = 'rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2';
const INPUT_CLASS = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none';
const REF_BTN_CLASS = 'w-full flex items-center justify-center gap-1 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300';
const ADD_BTN_CLASS = 'w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-gray-600 text-[11px] text-gray-400 hover:bg-gray-100/5';
const DEL_BTN_CLASS = 'shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-bold text-gray-200">{children}</p>;
}

function NumField({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <label className="flex items-center gap-2 text-[10px] text-gray-400">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-100 outline-none"
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[10px] text-gray-400">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-9 h-9 rounded-lg border border-gray-700 bg-transparent cursor-pointer"
      />
      <span className="text-[10px] text-gray-500">{value}</span>
    </label>
  );
}

function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[10px] text-gray-400">
      <span className="w-16 shrink-0">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-100 outline-none"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-gray-300">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-blue-500" />
      {label}
    </label>
  );
}

const MOTION_OPTIONS = (Object.keys(MV_MOTION_LABELS) as MvMotion[]).map(m => ({ value: m, label: MV_MOTION_LABELS[m] }));
const VISUALIZER_OPTIONS = (Object.keys(MV_VISUALIZER_LABELS) as MvVisualizerStyle[]).map(s => ({ value: s, label: MV_VISUALIZER_LABELS[s] }));

const LAYER_ICON = {
  image: ImageIcon,
  text: Type,
  visualizer: BarChart3,
  lyrics: Music,
} as const;

function layerLabel(layer: MvLayer): string {
  switch (layer.kind) {
    case 'image': return refLabel(layer.ref);
    case 'text': return layer.text.split('\n')[0] || 'テキスト';
    case 'visualizer': return MV_VISUALIZER_LABELS[layer.style];
    case 'lyrics': return '歌詞';
  }
}

// ───────────────── 本体 ─────────────────

/**
 * MV作成エディタ。
 *
 * ゲーム作成と同じ「プリセットを選んで中身を差し替える」体験に寄せてある。
 * 自由なタイムラインは持たず、レイヤー種別は4つ・動きは選択肢・時間軸は場面（小節）だけ。
 */
export default function MvMaker({ onClose, onSave, userId, initialManifest, isEditing }: MvMakerProps) {
  const [manifest, setManifest] = useState<MvManifest>(() => initialManifest ?? buildMvPreset('geometric'));
  const [tab, setTab] = useState<Tab>(initialManifest ? 'song' : 'preset');
  const [picker, setPicker] = useState<{ mode: 'image' | 'bgm'; target: 'stageBg' | { layerId: string } } | null>(null);
  const [showMmlEditor, setShowMmlEditor] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [song, setSong] = useState<MvSong>(EMPTY_SONG);
  const [hasAutosave, setHasAutosave] = useState(false);
  const autosaveDataRef = useRef<MvManifest | null>(null);

  const storageKey = getStorageKey('mv');
  const manifestRef = useRef(manifest);
  useEffect(() => { manifestRef.current = manifest; }, [manifest]);

  const update = useCallback((patch: (m: MvManifest) => MvManifest) => {
    setManifest(prev => patch(prev));
  }, []);

  const updateLayer = useCallback((id: string, patch: (l: MvLayer) => MvLayer) => {
    update(m => ({ ...m, layers: m.layers.map(l => (l.id === id ? patch(l) : l)) }));
  }, [update]);

  // ── 楽曲情報（表示用） ─────────────────────────────────
  useEffect(() => {
    let disposed = false;
    parseMvSong(manifest.mml).then(s => { if (!disposed) setSong(s); });
    return () => { disposed = true; };
  }, [manifest.mml]);

  // ── オートセーブ / 履歴 ────────────────────────────────
  useEffect(() => {
    const saved = getAutosave<MvManifest>(storageKey);
    if (saved?.data && !initialManifest) {
      autosaveDataRef.current = saved.data;
      Promise.resolve().then(() => setHasAutosave(true));
    }
  }, [storageKey, initialManifest]);

  useEffect(() => {
    const autosave = setInterval(() => saveAutosave(storageKey, manifestRef.current), 10000);
    const history = setInterval(() => {
      saveHistory(storageKey, manifestRef.current, 'mv', 30);
    }, 1800000);
    return () => { clearInterval(autosave); clearInterval(history); };
  }, [storageKey]);

  // ── 素材の選択 ─────────────────────────────────────────
  const handlePick = (result: PickResult) => {
    if (!picker) return;
    if (picker.mode === 'bgm') {
      // MML専用ピッカーなので rawMml が必ず入る
      if (result.rawMml) update(m => ({ ...m, mml: result.rawMml! }));
    } else if (picker.target === 'stageBg') {
      update(m => ({ ...m, stage: { ...m.stage, bgRef: result.ref, bgUrl: result.url } }));
    } else {
      const layerId = picker.target.layerId;
      updateLayer(layerId, l => (l.kind === 'image' ? { ...l, ref: result.ref, url: result.url } : l));
    }
    setPicker(null);
  };

  // ── 保存 ──────────────────────────────────────────────
  const handleSave = () => {
    const title = manifest.title.trim() || '無題のMV';
    clearAutosave(storageKey);
    onSave({ manifest: { ...manifest, title }, title, preset: manifest.preset });
  };

  const canSave = !!manifest.mml.trim();

  // ── レイヤー追加 ───────────────────────────────────────
  const addImageLayer = () => {
    const layer: MvImageLayer = {
      kind: 'image', id: mvUid('img'), ref: '', x: MV_W / 2, y: MV_H / 2,
      scale: 4, anchor: 'center', motion: 'none', pixelated: true, z: 20,
    };
    update(m => ({ ...m, layers: [...m.layers, layer] }));
    setSelectedLayerId(layer.id);
    setPicker({ mode: 'image', target: { layerId: layer.id } });
  };

  const addTextLayer = () => {
    const layer: MvTextLayer = {
      kind: 'text', id: mvUid('txt'), text: 'テキスト', x: 24, y: 24, size: 18,
      color: '#f8fafc', anchor: 'topLeft', vertical: false, motion: 'none', shadow: true, z: 30,
    };
    update(m => ({ ...m, layers: [...m.layers, layer] }));
    setSelectedLayerId(layer.id);
  };

  const addVisualizerLayer = () => {
    const layer: MvVisualizerLayer = {
      kind: 'visualizer', id: mvUid('vis'), style: 'bars',
      rect: { x: 0, y: MV_H - 90, w: MV_W, h: 90 }, amount: 16, thickness: 2, z: 10,
    };
    update(m => ({ ...m, layers: [...m.layers, layer] }));
    setSelectedLayerId(layer.id);
  };

  const removeLayer = (id: string) => {
    update(m => ({ ...m, layers: m.layers.filter(l => l.id !== id) }));
    setSelectedLayerId(prev => (prev === id ? null : prev));
  };

  const lyricsLayer = manifest.layers.find((l): l is MvLyricsLayer => l.kind === 'lyrics') ?? null;

  const sectionOptions = useMemo(
    () => manifest.sections.map(s => ({ id: s.id, label: `${s.label}（${s.startBar}小節〜）` })),
    [manifest.sections],
  );

  // ───────────────── 各タブ ─────────────────

  const presetTab = (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-400">
        プリセットを選ぶと、その形にまるごと作り替わります（いまの編集内容は失われます）。
      </p>
      {MV_PRESETS.map(p => {
        const active = manifest.preset === p.kind;
        return (
          <button
            key={p.kind}
            onClick={() => {
              if (!active && !confirm(`「${p.name}」に作り替えます。いまの編集内容は失われますが、よろしいですか？`)) return;
              setManifest(buildMvPreset(p.kind));
              setSelectedLayerId(null);
              setTab('song');
            }}
            className={`w-full text-left rounded-lg border p-2.5 transition-colors ${active
              ? 'border-blue-500/70 bg-blue-500/10'
              : 'border-gray-700 bg-gray-900/60 hover:bg-gray-100/5'}`}
          >
            <p className="text-[12px] font-bold text-gray-100">{p.name}{active && ' ✓'}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-gray-400">{p.description}</p>
            {p.swapHint && <p className="mt-1 text-[10px] leading-relaxed text-blue-300/80">{p.swapHint}</p>}
          </button>
        );
      })}
    </div>
  );

  const songTab = (
    <div className="space-y-2">
      <div className={SECTION_CLASS}>
        <SectionTitle>🎵 楽曲（MML）</SectionTitle>
        <p className="text-[10px] leading-relaxed text-gray-400">
          MVの時間軸はこのMMLだけで決まります。拍・ビジュアライザ・歌詞の出るタイミングは、
          すべてここのノートから計算されるのでズレません。
        </p>
        <button onClick={() => setPicker({ mode: 'bgm', target: 'stageBg' })} className={REF_BTN_CLASS}>
          <Music size={12} />投稿からMMLを参照
        </button>
        <button onClick={() => setShowMmlEditor(true)} className={REF_BTN_CLASS}>
          <Music size={12} />MMLエディタで作る / 編集する
        </button>
        {manifest.mml ? (
          <div className="rounded border border-gray-700 bg-gray-800 p-2">
            <p className="text-[10px] text-gray-400">
              BPM {song.bpm} ／ {song.totalBars} 小節 ／ {song.tracks.length} トラック
              {song.lyricLines.length > 0 && ` ／ 歌詞 ${song.lyricLines.length} 行`}
            </p>
            <p className="mt-1 max-h-16 overflow-hidden break-all font-mono text-[9px] leading-tight text-gray-500">
              {manifest.mml.slice(0, 220)}{manifest.mml.length > 220 && '…'}
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-amber-400">MMLが未設定です。投稿するには曲が要ります。</p>
        )}
        {song.lyricTrackIds.length > 0 && (
          <p className="text-[10px] leading-relaxed text-gray-500">
            歌詞トラック（@@）を見つけました。歌詞タブで画面に出せます。
            なお歌声としては鳴らず、MVでは「画面に出す文字」として使われます。
          </p>
        )}
      </div>

      <div className={SECTION_CLASS}>
        <SectionTitle>📝 タイトル</SectionTitle>
        <input
          value={manifest.title}
          onChange={e => update(m => ({ ...m, title: e.target.value }))}
          placeholder="MVのタイトル"
          className={INPUT_CLASS}
        />
        <input
          value={manifest.credit ?? ''}
          onChange={e => update(m => ({ ...m, credit: e.target.value }))}
          placeholder="クレジット（任意）"
          className={INPUT_CLASS}
        />
        <p className="text-[10px] text-gray-500">
          画面に出す文字はレイヤータブのテキストで別に持ちます。ここはフィードに出る名前です。
        </p>
      </div>
    </div>
  );

  const stageTab = (
    <div className="space-y-2">
      <div className={SECTION_CLASS}>
        <SectionTitle>🖼 背景</SectionTitle>
        <ColorField label="背景色" value={manifest.stage.bgColor} onChange={v => update(m => ({ ...m, stage: { ...m.stage, bgColor: v } }))} />
        <button onClick={() => setPicker({ mode: 'image', target: 'stageBg' })} className={REF_BTN_CLASS}>
          <ImageIcon size={12} />背景画像を参照
        </button>
        {manifest.stage.bgRef && (
          <div className="flex items-center gap-2 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[9px] text-gray-400">
            {manifest.stage.bgUrl && <img src={manifest.stage.bgUrl} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />}
            <span className="flex-1 truncate">{refLabel(manifest.stage.bgRef)}</span>
            <button onClick={() => update(m => ({ ...m, stage: { ...m.stage, bgRef: undefined, bgUrl: undefined } }))} className={DEL_BTN_CLASS}>
              <Trash2 size={16} />
            </button>
          </div>
        )}
        <SelectField
          label="合わせ方"
          value={manifest.stage.bgFit}
          options={[
            { value: 'cover' as const, label: '画面いっぱい（はみ出す）' },
            { value: 'contain' as const, label: '全体を収める' },
            { value: 'tile' as const, label: 'タイル状に敷き詰め' },
          ]}
          onChange={v => update(m => ({ ...m, stage: { ...m.stage, bgFit: v } }))}
        />
        <NumField label="暗くする" value={manifest.stage.bgDim ?? 0} min={0} max={1} step={0.05}
          onChange={v => update(m => ({ ...m, stage: { ...m.stage, bgDim: v } }))} />
      </div>

      <div className={SECTION_CLASS}>
        <SectionTitle>💓 拍の演出</SectionTitle>
        <SelectField
          label="演出"
          value={manifest.stage.pulse}
          options={[
            { value: 'none' as const, label: 'なし' },
            { value: 'breathe' as const, label: '呼吸（中央がふくらむ）' },
            { value: 'flash' as const, label: '小節頭で光る' },
          ]}
          onChange={v => update(m => ({ ...m, stage: { ...m.stage, pulse: v } }))}
        />
      </div>

      <div className={SECTION_CLASS}>
        <SectionTitle>🎨 トラックの色</SectionTitle>
        <p className="text-[10px] text-gray-400">ピアノロール・波紋・スペアナが、この並び順で色を使います。</p>
        <div className="flex flex-wrap gap-1.5">
          {manifest.stage.palette.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="color"
                value={c}
                onChange={e => update(m => ({ ...m, stage: { ...m.stage, palette: m.stage.palette.map((p, j) => (j === i ? e.target.value : p)) } }))}
                className="h-9 w-9 cursor-pointer rounded-lg border border-gray-700 bg-transparent"
              />
              <button
                onClick={() => update(m => ({ ...m, stage: { ...m.stage, palette: m.stage.palette.filter((_, j) => j !== i) } }))}
                className="grid h-6 w-6 place-items-center rounded text-gray-500 hover:text-red-400"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            onClick={() => update(m => ({ ...m, stage: { ...m.stage, palette: [...m.stage.palette, '#ffffff'] } }))}
            className="grid h-9 w-9 shrink-0 place-items-center rounded border-2 border-dashed border-gray-600 text-gray-400 hover:bg-gray-100/5"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  const selectedLayer = manifest.layers.find(l => l.id === selectedLayerId) ?? null;

  const layersTab = (
    <div className="space-y-2">
      <div className={SECTION_CLASS}>
        <SectionTitle><Layers size={12} className="mr-1 inline" />レイヤー</SectionTitle>
        {manifest.layers.length === 0 && <p className="text-[10px] text-gray-500">レイヤーがありません。</p>}
        {manifest.layers.map(layer => {
          const Icon = LAYER_ICON[layer.kind];
          const active = layer.id === selectedLayerId;
          return (
            <div key={layer.id} className={`flex items-center gap-2 rounded border px-2 py-1.5 ${active ? 'border-blue-500/70 bg-blue-500/10' : 'border-gray-700 bg-gray-800'}`}>
              <Icon size={13} className="shrink-0 text-gray-400" />
              <button onClick={() => setSelectedLayerId(active ? null : layer.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[11px] text-gray-200">{layerLabel(layer)}</span>
                {layer.sections && layer.sections.length > 0 && (
                  <span className="block truncate text-[9px] text-gray-500">
                    {layer.sections.map(id => manifest.sections.find(s => s.id === id)?.label ?? id).join(' / ')} のみ
                  </span>
                )}
              </button>
              <button onClick={() => removeLayer(layer.id)} className={DEL_BTN_CLASS}><Trash2 size={16} /></button>
            </div>
          );
        })}
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={addImageLayer} className={ADD_BTN_CLASS}><Plus size={12} />画像</button>
          <button onClick={addTextLayer} className={ADD_BTN_CLASS}><Plus size={12} />文字</button>
          <button onClick={addVisualizerLayer} className={ADD_BTN_CLASS}><Plus size={12} />ビジュアライザ</button>
        </div>
      </div>

      {selectedLayer && (
        <div className={SECTION_CLASS}>
          <SectionTitle>⚙️ {layerLabel(selectedLayer)} の設定</SectionTitle>

          {selectedLayer.kind === 'image' && (
            <>
              <button onClick={() => setPicker({ mode: 'image', target: { layerId: selectedLayer.id } })} className={REF_BTN_CLASS}>
                <ImageIcon size={12} />画像を参照
              </button>
              {selectedLayer.url && <img src={selectedLayer.url} alt="" className="h-12 w-12 rounded border border-gray-700 object-contain" />}
              <NumField label="X" value={selectedLayer.x} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, x: v } as MvLayer))} />
              <NumField label="Y" value={selectedLayer.y} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, y: v } as MvLayer))} />
              <NumField label="拡大率" value={selectedLayer.scale} min={0.1} step={0.5} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, scale: v } as MvLayer))} />
              <CheckField label="ドット絵として粗く表示" checked={!!selectedLayer.pixelated}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, pixelated: v } as MvLayer))} />
              <CheckField label="歩行グラとしてアニメさせる" checked={!!selectedLayer.walk}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, walk: v ? { stdId: 'auto', dir: 's', fps: 4 } : undefined } as MvLayer))} />
            </>
          )}

          {selectedLayer.kind === 'text' && (
            <>
              <textarea
                value={selectedLayer.text}
                onChange={e => updateLayer(selectedLayer.id, l => ({ ...l, text: e.target.value } as MvLayer))}
                className={`${INPUT_CLASS} h-16 resize-none`}
              />
              <NumField label="X" value={selectedLayer.x} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, x: v } as MvLayer))} />
              <NumField label="Y" value={selectedLayer.y} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, y: v } as MvLayer))} />
              <NumField label="文字サイズ" value={selectedLayer.size} min={6} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, size: v } as MvLayer))} />
              <ColorField label="文字色" value={selectedLayer.color} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, color: v } as MvLayer))} />
              <CheckField label="縦書き" checked={selectedLayer.vertical} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, vertical: v } as MvLayer))} />
              <CheckField label="太字" checked={!!selectedLayer.bold} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, bold: v } as MvLayer))} />
            </>
          )}

          {selectedLayer.kind === 'visualizer' && (
            <>
              <SelectField label="種類" value={selectedLayer.style} options={VISUALIZER_OPTIONS}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, style: v } as MvLayer))} />
              <NumField label="X" value={selectedLayer.rect.x} onChange={v => updateLayer(selectedLayer.id, l => (l.kind === 'visualizer' ? { ...l, rect: { ...l.rect, x: v } } : l))} />
              <NumField label="Y" value={selectedLayer.rect.y} onChange={v => updateLayer(selectedLayer.id, l => (l.kind === 'visualizer' ? { ...l, rect: { ...l.rect, y: v } } : l))} />
              <NumField label="幅" value={selectedLayer.rect.w} min={8} onChange={v => updateLayer(selectedLayer.id, l => (l.kind === 'visualizer' ? { ...l, rect: { ...l.rect, w: v } } : l))} />
              <NumField label="高さ" value={selectedLayer.rect.h} min={8} onChange={v => updateLayer(selectedLayer.id, l => (l.kind === 'visualizer' ? { ...l, rect: { ...l.rect, h: v } } : l))} />
              <NumField label="細かさ" value={selectedLayer.amount ?? 16} min={1} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, amount: v } as MvLayer))} />
              <p className="text-[10px] leading-relaxed text-gray-500">
                「細かさ」はピアノロールなら画面に映る小節数、ステップ格子なら1小節の分割数、
                波紋なら同時に出る輪の数、スペアナなら棒の本数です。
              </p>
              <CheckField label="光らせる" checked={!!selectedLayer.glow} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, glow: v } as MvLayer))} />
            </>
          )}

          {selectedLayer.kind !== 'lyrics' && (
            <>
              <SelectField label="動き" value={selectedLayer.kind === 'visualizer' ? 'none' : selectedLayer.motion}
                options={MOTION_OPTIONS}
                onChange={v => updateLayer(selectedLayer.id, l => (l.kind === 'visualizer' ? l : ({ ...l, motion: v } as MvLayer)))} />
              {selectedLayer.kind !== 'visualizer' && (
                <NumField label="動きの強さ" value={selectedLayer.motionAmount ?? 0} step={1}
                  onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, motionAmount: v } as MvLayer))} />
              )}
            </>
          )}

          <NumField label="重なり順" value={selectedLayer.z ?? 0} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, z: v } as MvLayer))} />
          <NumField label="不透明度" value={selectedLayer.opacity ?? 1} min={0} max={1} step={0.05}
            onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, opacity: v } as MvLayer))} />

          <p className="pt-1 text-[10px] font-bold text-gray-400">出す場面</p>
          <p className="text-[10px] text-gray-500">どれも選ばなければ、全部の場面で出ます。</p>
          {sectionOptions.map(s => (
            <CheckField
              key={s.id}
              label={s.label}
              checked={!!selectedLayer.sections?.includes(s.id)}
              onChange={v => updateLayer(selectedLayer.id, l => {
                const cur = l.sections ?? [];
                const next = v ? [...cur, s.id] : cur.filter(x => x !== s.id);
                return { ...l, sections: next.length > 0 ? next : undefined };
              })}
            />
          ))}
        </div>
      )}
    </div>
  );

  const lyricsTab = (
    <div className="space-y-2">
      <div className={SECTION_CLASS}>
        <SectionTitle>🎤 歌詞</SectionTitle>
        {!lyricsLayer ? (
          <>
            <p className="text-[10px] leading-relaxed text-gray-400">
              歌詞レイヤーがありません。追加すると、画面に歌詞を出せます。
            </p>
            <button
              onClick={() => {
                const layer: MvLyricsLayer = {
                  kind: 'lyrics', id: mvUid('lyr'),
                  source: song.lyricLines.length > 0 ? 'mml' : 'manual',
                  lines: [], x: MV_W - 48, y: 44, anchor: 'topLeft', size: 16,
                  color: '#f3f4f6', vertical: true, afterimage: 2, holdBars: 2, z: 40,
                };
                update(m => ({ ...m, layers: [...m.layers, layer] }));
              }}
              className={ADD_BTN_CLASS}
            >
              <Plus size={13} />歌詞レイヤーを追加
            </button>
          </>
        ) : (
          <>
            <SelectField
              label="出どころ"
              value={lyricsLayer.source}
              options={[
                { value: 'mml' as const, label: 'MMLの歌詞トラックから自動' },
                { value: 'manual' as const, label: '小節を指定して手入力' },
              ]}
              onChange={v => updateLayer(lyricsLayer.id, l => ({ ...l, source: v } as MvLayer))}
            />
            {lyricsLayer.source === 'mml' && (
              song.lyricLines.length > 0 ? (
                <div className="rounded border border-gray-700 bg-gray-800 p-2 text-[10px] text-gray-400">
                  <p className="mb-1">MMLから {song.lyricLines.length} 行を読み取りました。</p>
                  <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                    {song.lyricLines.map((line, i) => (
                      <li key={i} className="truncate text-gray-300">
                        <span className="mr-1.5 text-gray-500">{line.bar.toFixed(2)}小節</span>{line.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-[10px] text-amber-400">
                  MMLに歌詞トラック（@@0 klatt …）がありません。MMLエディタで歌詞を付けるか、手入力に切り替えてください。
                </p>
              )
            )}
            {lyricsLayer.source === 'manual' && (
              <>
                {(lyricsLayer.lines ?? []).map((line, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={line.bar}
                      step={0.25}
                      min={0}
                      onChange={e => updateLayer(lyricsLayer.id, l => (l.kind === 'lyrics'
                        ? { ...l, lines: (l.lines ?? []).map((x, j) => (j === i ? { ...x, bar: Number(e.target.value) || 0 } : x)) }
                        : l))}
                      className="w-16 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
                    />
                    <input
                      value={line.text}
                      onChange={e => updateLayer(lyricsLayer.id, l => (l.kind === 'lyrics'
                        ? { ...l, lines: (l.lines ?? []).map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }
                        : l))}
                      className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-100 outline-none"
                    />
                    <button
                      onClick={() => updateLayer(lyricsLayer.id, l => (l.kind === 'lyrics'
                        ? { ...l, lines: (l.lines ?? []).filter((_, j) => j !== i) }
                        : l))}
                      className={DEL_BTN_CLASS}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => updateLayer(lyricsLayer.id, l => (l.kind === 'lyrics'
                    ? { ...l, lines: [...(l.lines ?? []), { bar: (l.lines?.length ?? 0) * 2, text: '' }] }
                    : l))}
                  className={ADD_BTN_CLASS}
                >
                  <Plus size={13} />行を追加
                </button>
              </>
            )}

            <p className="pt-1 text-[10px] font-bold text-gray-400">見た目</p>
            <NumField label="X" value={lyricsLayer.x} onChange={v => updateLayer(lyricsLayer.id, l => ({ ...l, x: v } as MvLayer))} />
            <NumField label="Y" value={lyricsLayer.y} onChange={v => updateLayer(lyricsLayer.id, l => ({ ...l, y: v } as MvLayer))} />
            <NumField label="文字サイズ" value={lyricsLayer.size} min={8} onChange={v => updateLayer(lyricsLayer.id, l => ({ ...l, size: v } as MvLayer))} />
            <ColorField label="文字色" value={lyricsLayer.color} onChange={v => updateLayer(lyricsLayer.id, l => ({ ...l, color: v } as MvLayer))} />
            <CheckField label="縦書き" checked={lyricsLayer.vertical} onChange={v => updateLayer(lyricsLayer.id, l => ({ ...l, vertical: v } as MvLayer))} />
            <NumField label="残像の数" value={lyricsLayer.afterimage} min={0} max={5} onChange={v => updateLayer(lyricsLayer.id, l => ({ ...l, afterimage: v } as MvLayer))} />
            <NumField label="表示の長さ" value={lyricsLayer.holdBars ?? 2} min={0.25} step={0.25} onChange={v => updateLayer(lyricsLayer.id, l => ({ ...l, holdBars: v } as MvLayer))} />
            <button onClick={() => removeLayer(lyricsLayer.id)} className="w-full rounded border border-gray-700 py-1.5 text-[10px] text-gray-400 hover:text-red-400">
              歌詞レイヤーを削除
            </button>
          </>
        )}
      </div>
    </div>
  );

  const sectionsTab = (
    <div className="space-y-2">
      <div className={SECTION_CLASS}>
        <SectionTitle>🎬 場面</SectionTitle>
        <p className="text-[10px] leading-relaxed text-gray-400">
          小節番号で場面を区切ります。レイヤータブで「出す場面」を選ぶと、イントロとサビで絵を切り替えられます。
        </p>
        {manifest.sections.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <input
              value={s.label}
              onChange={e => update(m => ({ ...m, sections: m.sections.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-100 outline-none"
            />
            <input
              type="number"
              value={s.startBar}
              min={0}
              onChange={e => update(m => ({ ...m, sections: m.sections.map((x, j) => (j === i ? { ...x, startBar: Math.max(0, Number(e.target.value) || 0) } : x)) }))}
              className="w-16 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
            />
            <span className="shrink-0 text-[10px] text-gray-500">小節</span>
            {manifest.sections.length > 1 && (
              <button
                onClick={() => update(m => ({
                  ...m,
                  sections: m.sections.filter((_, j) => j !== i),
                  layers: m.layers.map(l => (l.sections ? { ...l, sections: l.sections.filter(x => x !== s.id) } : l)),
                }))}
                className={DEL_BTN_CLASS}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => {
            const next: MvSection = {
              id: mvUid('sec'),
              label: `場面${manifest.sections.length + 1}`,
              startBar: Math.max(0, ...manifest.sections.map(s => s.startBar)) + 8,
            };
            update(m => ({ ...m, sections: [...m.sections, next] }));
          }}
          className={ADD_BTN_CLASS}
        >
          <Plus size={13} />場面を追加
        </button>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 flex select-none flex-col bg-[#0b0e14]">
      {/* ヘッダー */}
      <div className="flex shrink-0 items-center border-b border-gray-800 bg-[#0b0e14] px-3.5 py-2.5">
        <button onClick={onClose} className="mr-2 rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100/10">
          <X size={20} />
        </button>
        <span className="text-xs font-bold text-gray-300">キャンセル</span>
        <span className="mx-1.5 text-[10px] text-gray-600">›</span>
        <span className="text-xs text-gray-400">MV作成</span>
        <div className="flex-1" />
        <div className="mr-2"><VolumeControl /></div>
        <button
          onClick={() => setShowHistory(true)}
          className="mr-2 flex items-center space-x-1 rounded-lg bg-gray-800 px-3 py-1.5 text-[11px] font-bold text-gray-300 transition-colors hover:bg-gray-700"
        >
          <History size={13} /> <span>履歴</span>
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          <Clapperboard size={13} /> <span>{isEditing ? '再編集' : '投稿'}</span>
        </button>
      </div>

      {hasAutosave && (
        <div className="flex shrink-0 items-center justify-between border-b border-yellow-800/30 bg-yellow-600/20 px-4 py-2 text-xs text-yellow-200">
          <span>⚠️ 未保存のデータ（自動保存）があります。復元しますか？</span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (autosaveDataRef.current) setManifest(autosaveDataRef.current);
                setHasAutosave(false);
                clearAutosave(storageKey);
              }}
              className="rounded bg-yellow-600 px-3 py-1 text-[10px] font-bold text-gray-900 transition-transform active:scale-95"
            >
              復元する
            </button>
            <button onClick={() => { setHasAutosave(false); clearAutosave(storageKey); }} className="rounded px-2 py-1 text-[10px] text-gray-400 hover:text-gray-200">
              無視
            </button>
          </div>
        </div>
      )}

      {/* プレビュー */}
      <div className="shrink-0 border-b border-gray-800 bg-[#0a0c12] p-3">
        <div className="mx-auto" style={{ maxWidth: MV_W }}>
          <MvPlayer manifest={manifest} />
        </div>
      </div>

      {/* タブ */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-800 px-2 py-1.5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 本体 */}
      <div className="flex-1 overflow-y-auto p-2.5">
        {tab === 'preset' && presetTab}
        {tab === 'song' && songTab}
        {tab === 'stage' && stageTab}
        {tab === 'layers' && layersTab}
        {tab === 'lyrics' && lyricsTab}
        {tab === 'sections' && sectionsTab}
      </div>

      {picker && (
        <ContentPicker
          mode={picker.mode}
          bgmKind={picker.mode === 'bgm' ? 'mml' : undefined}
          userId={userId}
          currentRef={picker.mode === 'bgm' ? `mml:${manifest.mml}` : undefined}
          onPick={handlePick}
          onClose={() => setPicker(null)}
        />
      )}

      {showMmlEditor && (
        <MmlEditor
          initialMml={manifest.mml || undefined}
          isEditing
          onClose={() => setShowMmlEditor(false)}
          onSave={mml => {
            update(m => ({ ...m, mml }));
            setShowMmlEditor(false);
          }}
        />
      )}

      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        storageKey={storageKey}
        type="mv"
        onRestore={(restored: MvManifest) => setManifest(restored)}
        getCurrentData={() => manifestRef.current}
      />
    </div>
  );
}
