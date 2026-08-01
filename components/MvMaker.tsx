'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  BarChart3, ChevronDown, ChevronUp, Clapperboard, History, Image as ImageIcon,
  Layers, ListMusic, Music, Plus, Shapes, Sparkles, Trash2, Type, X,
} from 'lucide-react';
import ContentPicker, { type PickResult } from './ContentPicker';
import HistoryModal from './HistoryModal';
import MvPlayer from './MvPlayer';
import VolumeControl from './VolumeControl';
import { MV_PRESETS, buildMvPreset } from './mv-presets';
import { refLabel } from '@/lib/asset-ref';
import { clearAutosave, getAutosave, getStorageKey, saveAutosave, saveHistory } from '@/lib/history';
import {
  DEFAULT_MV_RING, DEFAULT_MV_VIEW,
  MV_AUDIO_MODE_HINTS, MV_AUDIO_MODE_LABELS, MV_BLEND_LABELS, MV_EFFECT_STYLE_LABELS,
  MV_H, MV_MOD_OP_LABELS, MV_MOD_SOURCE_LABELS, MV_MOD_TARGET_LABELS, MV_MOTION_LABELS,
  MV_PROJECTION_LABELS, MV_ROOT_TO_PITCH, MV_SHAPE_FORM_LABELS, MV_TRIGGER_LABELS,
  MV_VISUALIZER_LABELS, MV_W, mvAudioMode, mvUid,
  type MvAudioMode, type MvBlend, type MvChordBarLayer, type MvEffectLayer, type MvEffectStyle,
  type MvImageLayer, type MvLayer, type MvLyricsLayer, type MvManifest,
  type MvModOp, type MvModSource, type MvModTarget, type MvModulator,
  type MvMotion, type MvPresetKind, type MvProjection, type MvSection,
  type MvShapeForm, type MvShapeLayer, type MvTextLayer, type MvTrigger,
  type MvVisualizerLayer, type MvVisualizerStyle,
} from '@/lib/mv-config';
import { parseMvSong, resolveLyricLines, EMPTY_SONG, type MvSong } from '@/lib/mv-engine';

const MmlEditor = dynamic(() => import('./MmlEditor'), { ssr: false });

type Tab = 'preset' | 'song' | 'stage' | 'layers' | 'lyrics' | 'sections';

/**
 * 編集モード。
 * かんたん = 「見本を選ぶ → 曲を入れる → 絵を差し替える」だけで完成する3タブ。
 * くわしい = レイヤー・歌詞・場面まで自分で組む。
 * 既定はかんたん。MMLエディタの シンプル/上級者 切替と同じ考え方で、
 * はじめて触る人がいきなり全部の設定に出会わないようにする。
 */
type EditMode = 'easy' | 'detail';

const EASY_TABS: Tab[] = ['preset', 'song', 'stage'];

const TABS: { id: Tab; label: string }[] = [
  { id: 'preset', label: '見本' },
  { id: 'song', label: '曲' },
  { id: 'stage', label: '見た目' },
  { id: 'layers', label: 'レイヤー' },
  { id: 'lyrics', label: '歌詞' },
  { id: 'sections', label: '場面' },
];

const MODE_STORAGE_KEY = 'unj_mvmaker_mode';

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

// スマホでの押しやすさを優先し、ラベルは入力欄の上に置いて入力欄は全幅・高さ36px以上にする
// （狭い画面でラベルと入力欄を横に並べると、どちらも潰れて読めなくなるため）。
const FIELD_LABEL_CLASS = 'block text-[10px] text-gray-400';
const FIELD_INPUT_CLASS = 'w-full min-h-9 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-bold text-gray-200">{children}</p>;
}

/** 補足説明。専門用語を避けて「何が起きるか」を書くための共通スタイル。 */
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] leading-relaxed text-gray-500">{children}</p>;
}

function NumField({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <label className="block space-y-0.5">
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className={FIELD_INPUT_CLASS}
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-0.5">
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-700 bg-transparent"
        />
        <span className="text-[10px] text-gray-500">{value}</span>
      </div>
    </label>
  );
}

function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <label className="block space-y-0.5">
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className={FIELD_INPUT_CLASS}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-9 items-center gap-2 text-[12px] text-gray-300">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-blue-500" />
      {label}
    </label>
  );
}

/**
 * 詳しい設定のたたみ込み。
 * 既定は閉じておき、「触らなくても完成する」状態を保つ。
 */
function Details({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-gray-700/70 bg-gray-900/60">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex min-h-9 w-full items-center justify-between px-2 py-1.5 text-[11px] text-gray-300"
      >
        <span>{label}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="space-y-2 border-t border-gray-700/70 p-2">{children}</div>}
    </div>
  );
}

const MOTION_OPTIONS = (Object.keys(MV_MOTION_LABELS) as MvMotion[]).map(m => ({ value: m, label: MV_MOTION_LABELS[m] }));
const VISUALIZER_OPTIONS = (Object.keys(MV_VISUALIZER_LABELS) as MvVisualizerStyle[]).map(s => ({ value: s, label: MV_VISUALIZER_LABELS[s] }));

const PROJECTION_OPTIONS = (Object.keys(MV_PROJECTION_LABELS) as MvProjection[]).map(p => ({ value: p, label: MV_PROJECTION_LABELS[p] }));
const SHAPE_FORM_OPTIONS = (Object.keys(MV_SHAPE_FORM_LABELS) as MvShapeForm[]).map(f => ({ value: f, label: MV_SHAPE_FORM_LABELS[f] }));
const BLEND_OPTIONS = (Object.keys(MV_BLEND_LABELS) as MvBlend[]).map(b => ({ value: b, label: MV_BLEND_LABELS[b] }));
const EFFECT_STYLE_OPTIONS = (Object.keys(MV_EFFECT_STYLE_LABELS) as MvEffectStyle[]).map(s => ({ value: s, label: MV_EFFECT_STYLE_LABELS[s] }));
const TRIGGER_OPTIONS = (Object.keys(MV_TRIGGER_LABELS) as MvTrigger[]).map(t => ({ value: t, label: MV_TRIGGER_LABELS[t] }));
const MOD_SOURCE_OPTIONS = (Object.keys(MV_MOD_SOURCE_LABELS) as MvModSource[]).map(s => ({ value: s, label: MV_MOD_SOURCE_LABELS[s] }));
const MOD_TARGET_OPTIONS = (Object.keys(MV_MOD_TARGET_LABELS) as MvModTarget[]).map(t => ({ value: t, label: MV_MOD_TARGET_LABELS[t] }));
const MOD_OP_OPTIONS = (Object.keys(MV_MOD_OP_LABELS) as MvModOp[]).map(o => ({ value: o, label: MV_MOD_OP_LABELS[o] }));
const AUDIO_MODE_OPTIONS = (Object.keys(MV_AUDIO_MODE_LABELS) as MvAudioMode[]).map(m => ({ value: m, label: MV_AUDIO_MODE_LABELS[m] }));

const LAYER_ICON = {
  image: ImageIcon,
  text: Type,
  visualizer: BarChart3,
  lyrics: Music,
  shape: Shapes,
  effect: Sparkles,
  chordBar: ListMusic,
} as const;

/** 図形の「音との連動」1行ぶんの編集UI。 */
function ModulatorRow({ mod, tracks, onChange, onRemove }: {
  mod: MvModulator;
  tracks: number[];
  onChange: (patch: Partial<MvModulator>) => void;
  onRemove: () => void;
}) {
  const needsTrack = mod.source === 'trackEnergy' || mod.source === 'trackOnset' || mod.source === 'trackPitch';
  const selectClass = 'min-h-9 min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none';
  return (
    <div className="space-y-1 rounded border border-gray-700/70 bg-gray-900/60 p-2">
      <div className="flex items-center gap-1">
        <select value={mod.source} onChange={e => onChange({ source: e.target.value as MvModSource })} className={selectClass}>
          {MOD_SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {needsTrack && (
          <select
            value={mod.track ?? ''}
            onChange={e => onChange({ track: e.target.value === '' ? undefined : Number(e.target.value) })}
            className="min-h-9 w-20 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
          >
            <option value="">全部</option>
            {tracks.map(t => <option key={t} value={t}>@{t}</option>)}
          </select>
        )}
        <button onClick={onRemove} className="shrink-0 grid h-7 w-7 place-items-center rounded text-gray-500 hover:text-red-400">
          <X size={13} />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <select value={mod.target} onChange={e => onChange({ target: e.target.value as MvModTarget })} className={selectClass}>
          {MOD_TARGET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={mod.op} onChange={e => onChange({ op: e.target.value as MvModOp })} className="min-h-9 w-24 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none">
          {MOD_OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          type="number"
          value={mod.amount}
          step={0.5}
          onChange={e => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange({ amount: n });
          }}
          className="min-h-9 w-16 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
        />
      </div>
    </div>
  );
}

function layerLabel(layer: MvLayer): string {
  switch (layer.kind) {
    case 'image': return refLabel(layer.ref);
    case 'text': return layer.text.split('\n')[0] || 'テキスト';
    case 'visualizer': return MV_VISUALIZER_LABELS[layer.style];
    case 'lyrics': return '歌詞';
    case 'shape': return MV_SHAPE_FORM_LABELS[layer.form];
    case 'effect': return MV_EFFECT_STYLE_LABELS[layer.style];
    case 'chordBar': return 'コード進行バー';
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
  const [editMode, setEditMode] = useState<EditMode>('easy');
  const [presetName, setPresetName] = useState<string | null>(null);
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

  // 前回選んだ編集モードを覚えておく（毎回切り替え直させない）
  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(MODE_STORAGE_KEY) : null;
    if (saved === 'detail') Promise.resolve().then(() => setEditMode('detail'));
  }, []);

  const changeEditMode = (next: EditMode) => {
    setEditMode(next);
    if (typeof localStorage !== 'undefined') localStorage.setItem(MODE_STORAGE_KEY, next);
    // かんたんへ戻したとき、詳しい側のタブに居たら見た目タブへ寄せる
    if (next === 'easy' && !EASY_TABS.includes(tab)) setTab('stage');
  };

  const visibleTabs = editMode === 'easy' ? TABS.filter(t => EASY_TABS.includes(t.id)) : TABS;

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

  const updateRepeat = (id: string, patch: Partial<NonNullable<MvImageLayer['repeat']>>) => {
    updateLayer(id, l => (l.kind === 'image' && l.repeat ? { ...l, repeat: { ...l.repeat, ...patch } } : l));
  };

  const updateView = (id: string, patch: Partial<MvVisualizerLayer['view'] & object>) => {
    updateLayer(id, l => (l.kind === 'visualizer' ? { ...l, view: { ...DEFAULT_MV_VIEW, ...l.view, ...patch } } : l));
  };

  const updateRing = (id: string, patch: Partial<MvVisualizerLayer['ring'] & object>) => {
    updateLayer(id, l => (l.kind === 'visualizer' ? { ...l, ring: { ...DEFAULT_MV_RING, ...l.ring, ...patch } } : l));
  };

  const addMod = (id: string) => {
    updateLayer(id, l => (l.kind === 'shape'
      ? { ...l, modulators: [...l.modulators, { source: 'trackEnergy', target: 'size', op: 'add', amount: 20 } as MvModulator] }
      : l));
  };

  const updateMod = (id: string, index: number, patch: Partial<MvModulator>) => {
    updateLayer(id, l => (l.kind === 'shape'
      ? { ...l, modulators: l.modulators.map((m, i) => (i === index ? { ...m, ...patch } : m)) }
      : l));
  };

  const removeMod = (id: string, index: number) => {
    updateLayer(id, l => (l.kind === 'shape'
      ? { ...l, modulators: l.modulators.filter((_, i) => i !== index) }
      : l));
  };

  const addShapeLayer = () => {
    const layer: MvShapeLayer = {
      kind: 'shape', id: mvUid('shp'), form: 'ring',
      x: MV_W / 2, y: MV_H / 2, size: 48, rotation: 0,
      color: manifest.stage.palette[0] ?? '#ffffff',
      filled: false, thickness: 2, count: 1, spread: 0, spin: 0,
      blend: 'normal', z: 15,
      // 最初から音に反応させる。ここへ演算を足していくのが図形レイヤーの使い方。
      modulators: [{ source: 'beat', target: 'size', op: 'add', amount: 20 }],
    };
    update(m => ({ ...m, layers: [...m.layers, layer] }));
    setSelectedLayerId(layer.id);
  };

  const addChordBarLayer = () => {
    const layer: MvChordBarLayer = {
      kind: 'chordBar', id: mvUid('chd'),
      rect: { x: 0, y: MV_H - 22, w: MV_W, h: 22 },
      chords: [{ bar: 0, label: 'C' }, { bar: 1, label: 'Am7' }, { bar: 2, label: 'F' }, { bar: 3, label: 'G7' }],
      key: 'C', colorMode: 'degree', color: '#1f2937',
      activeColor: '#3f6212', textColor: '#e5e7eb', size: 9, z: 60,
    };
    update(m => ({ ...m, layers: [...m.layers, layer] }));
    setSelectedLayerId(layer.id);
  };

  const addEffectLayer = () => {
    const layer: MvEffectLayer = {
      kind: 'effect', id: mvUid('fx'), style: 'flash', trigger: 'bar',
      amount: 0.5, decayBeats: 0.5, color: '#ffffff', z: 100,
    };
    update(m => ({ ...m, layers: [...m.layers, layer] }));
    setSelectedLayerId(layer.id);
  };

  const removeLayer = (id: string) => {
    update(m => ({ ...m, layers: m.layers.filter(l => l.id !== id) }));
    setSelectedLayerId(prev => (prev === id ? null : prev));
  };

  const imageLayers = manifest.layers.filter((l): l is MvImageLayer => l.kind === 'image');
  const lyricsLayer = manifest.layers.find((l): l is MvLyricsLayer => l.kind === 'lyrics') ?? null;
  const shownLyricLines = lyricsLayer ? resolveLyricLines(lyricsLayer, song) : [];

  const sectionOptions = useMemo(
    () => manifest.sections.map(s => ({ id: s.id, label: `${s.label}（${s.startBar}小節〜）` })),
    [manifest.sections],
  );

  // ───────────────── 各タブ ─────────────────

  const presetTab = (
    <div className="space-y-2">
      <Hint>
        まず見本をひとつ選びます。あとは「曲」タブで音楽を入れて、「見た目」タブで絵を差し替えれば完成です。
      </Hint>
      {MV_PRESETS.map(p => {
        const active = presetName === p.name;
        return (
          <button
            key={p.name}
            onClick={() => {
              if (!active && presetName && !confirm(`「${p.name}」に作り替えます。いまの編集内容は失われますが、よろしいですか？`)) return;
              setManifest(p.build());
              setPresetName(p.name);
              setSelectedLayerId(null);
              setTab('song');
            }}
            className={`w-full rounded-lg border p-3 text-left transition-colors ${active
              ? 'border-blue-500/70 bg-blue-500/10'
              : 'border-gray-700 bg-gray-900/60 hover:bg-gray-100/5'}`}
          >
            <p className="text-[13px] font-bold text-gray-100">{p.name}{active && ' ✓'}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{p.description}</p>
            {p.swapHint && <p className="mt-1 text-[10px] leading-relaxed text-blue-300/80">{p.swapHint}</p>}
          </button>
        );
      })}
    </div>
  );

  const songTab = (
    <div className="space-y-2">
      <div className={SECTION_CLASS}>
        <SectionTitle>🎵 曲をえらぶ</SectionTitle>
        <Hint>
          映像は曲に合わせて自動で動きます。拍・光り方・歌詞の出るタイミングは全部この曲から計算されるので、
          あなたがタイミングを合わせる必要はありません。
        </Hint>
        <button onClick={() => setPicker({ mode: 'bgm', target: 'stageBg' })} className={REF_BTN_CLASS}>
          <Music size={12} />投稿された曲から選ぶ
        </button>
        <button onClick={() => setShowMmlEditor(true)} className={REF_BTN_CLASS}>
          <Music size={12} />自分で作る・編集する
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
          <Hint>この曲には歌詞が入っています。そのまま画面にも出ます。</Hint>
        )}
      </div>

      <div className={SECTION_CLASS}>
        <SectionTitle>🔊 音の出し方</SectionTitle>
        {AUDIO_MODE_OPTIONS.map(opt => {
          const active = mvAudioMode(manifest) === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => update(m => ({ ...m, audio: { mode: opt.value } }))}
              className={`w-full rounded-lg border p-2 text-left transition-colors ${active
                ? 'border-blue-500/70 bg-blue-500/10'
                : 'border-gray-700 bg-gray-800 hover:bg-gray-100/5'}`}
            >
              <p className="text-[11px] font-bold text-gray-100">{opt.label}{active && ' ✓'}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-gray-400">{MV_AUDIO_MODE_HINTS[opt.value]}</p>
            </button>
          );
        })}
        {song.lyricTrackIds.length === 0 && mvAudioMode(manifest) === 'soundfontKoe' && (
          <p className="text-[10px] text-gray-500">この曲には歌詞トラックが無いので、歌声は鳴りません。</p>
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
        <Hint>タイムラインに出る名前です。画面の中に出る文字とは別物です。</Hint>
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
        <Details label="背景の細かい設定">
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
          <SelectField
            label="拍の演出"
            value={manifest.stage.pulse}
            options={[
              { value: 'none' as const, label: 'なし' },
              { value: 'breathe' as const, label: '呼吸（中央がふくらむ）' },
              { value: 'flash' as const, label: '小節頭で光る' },
            ]}
            onChange={v => update(m => ({ ...m, stage: { ...m.stage, pulse: v } }))}
          />
        </Details>
      </div>

      {/* かんたんモードでも絵を差し替えられるように、画像レイヤーだけここに出す */}
      {imageLayers.length > 0 && (
        <div className={SECTION_CLASS}>
          <SectionTitle>🎭 出てくる絵</SectionTitle>
          <Hint>タップすると、あなたの描いたドット絵や画像に差し替えられます。</Hint>
          {imageLayers.map(l => (
            <button
              key={l.id}
              onClick={() => setPicker({ mode: 'image', target: { layerId: l.id } })}
              className="flex min-h-11 w-full items-center gap-2 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-left hover:bg-gray-100/5"
            >
              {l.url
                ? <img src={l.url} alt="" className="h-8 w-8 shrink-0 rounded border border-gray-700 object-contain" />
                : <div className="grid h-8 w-8 shrink-0 place-items-center rounded border border-dashed border-gray-600"><ImageIcon size={13} className="text-gray-500" /></div>}
              <span className="min-w-0 flex-1 truncate text-[11px] text-gray-200">{refLabel(l.ref) || '画像を選ぶ'}</span>
              <span className="shrink-0 text-[10px] text-blue-300">差し替え</span>
            </button>
          ))}
        </div>
      )}

      <div className={SECTION_CLASS}>
        <SectionTitle>🎨 色</SectionTitle>
        <Hint>曲のパートごとに、この順番で色が使われます。</Hint>
        <div className="flex flex-wrap gap-1.5">
          {manifest.stage.palette.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="color"
                value={c}
                onChange={e => update(m => ({ ...m, stage: { ...m.stage, palette: m.stage.palette.map((p, j) => (j === i ? e.target.value : p)) } }))}
                className="h-10 w-10 cursor-pointer rounded-lg border border-gray-700 bg-transparent"
              />
              <button
                onClick={() => update(m => ({ ...m, stage: { ...m.stage, palette: m.stage.palette.filter((_, j) => j !== i) } }))}
                className="grid h-8 w-8 place-items-center rounded text-gray-500 hover:text-red-400"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            onClick={() => update(m => ({ ...m, stage: { ...m.stage, palette: [...m.stage.palette, '#ffffff'] } }))}
            className="grid h-10 w-10 shrink-0 place-items-center rounded border-2 border-dashed border-gray-600 text-gray-400 hover:bg-gray-100/5"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {editMode === 'easy' && (
        <Hint>
          もっと細かく作り込みたいときは、右上の「くわしい」を押すとレイヤー・歌詞・場面のタブが増えます。
        </Hint>
      )}
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
              <button onClick={() => setSelectedLayerId(active ? null : layer.id)} className="min-h-10 min-w-0 flex-1 py-1 text-left">
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
          <button onClick={addShapeLayer} className={ADD_BTN_CLASS}><Plus size={12} />図形</button>
          <button onClick={addEffectLayer} className={ADD_BTN_CLASS}><Plus size={12} />演出</button>
          <button onClick={addChordBarLayer} className={ADD_BTN_CLASS}><Plus size={12} />コード進行</button>
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
              <CheckField
                label="同じ画像を並べる"
                checked={!!selectedLayer.repeat}
                onChange={v => updateLayer(selectedLayer.id, l => ({
                  ...l,
                  repeat: v ? { count: 5, dx: 42, dy: 0, scaleStep: 0, alphaStep: -0.12, phase: 0.25 } : undefined,
                } as MvLayer))}
              />
              {selectedLayer.repeat && (
                <Details label="並べ方を調整する">
                  <NumField label="個数" value={selectedLayer.repeat.count} min={1} max={64}
                    onChange={v => updateRepeat(selectedLayer.id, { count: v })} />
                  <NumField label="横のずれ" value={selectedLayer.repeat.dx}
                    onChange={v => updateRepeat(selectedLayer.id, { dx: v })} />
                  <NumField label="縦のずれ" value={selectedLayer.repeat.dy}
                    onChange={v => updateRepeat(selectedLayer.id, { dy: v })} />
                  <NumField label="拡大の変化" value={selectedLayer.repeat.scaleStep ?? 0} step={0.1}
                    onChange={v => updateRepeat(selectedLayer.id, { scaleStep: v })} />
                  <NumField label="濃さの変化" value={selectedLayer.repeat.alphaStep ?? 0} step={0.05}
                    onChange={v => updateRepeat(selectedLayer.id, { alphaStep: v })} />
                  <NumField label="足踏みのずれ" value={selectedLayer.repeat.phase ?? 0} step={0.05}
                    onChange={v => updateRepeat(selectedLayer.id, { phase: v })} />
                </Details>
              )}
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

              {selectedLayer.style === 'pianoRoll' && (
                <>
                  <SelectField label="見せ方" value={selectedLayer.projection ?? 'flat'} options={PROJECTION_OPTIONS}
                    onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, projection: v } as MvLayer))} />
                  {(selectedLayer.projection ?? 'flat') === 'perspective' && (
                    <Details label="見る角度を調整する">
                      <Hint>MIDITrail のように、ノートの板を好きな角度から見られます。</Hint>
                      <NumField label="見下ろし" value={(selectedLayer.view ?? DEFAULT_MV_VIEW).pitch} min={-89} max={89}
                        onChange={v => updateView(selectedLayer.id, { pitch: v })} />
                      <NumField label="回り込み" value={(selectedLayer.view ?? DEFAULT_MV_VIEW).yaw} min={-89} max={89}
                        onChange={v => updateView(selectedLayer.id, { yaw: v })} />
                      <NumField label="傾き" value={(selectedLayer.view ?? DEFAULT_MV_VIEW).roll} min={-180} max={180}
                        onChange={v => updateView(selectedLayer.id, { roll: v })} />
                      <NumField label="画角" value={(selectedLayer.view ?? DEFAULT_MV_VIEW).fov} min={10} max={120}
                        onChange={v => updateView(selectedLayer.id, { fov: v })} />
                      <NumField label="奥行き" value={(selectedLayer.view ?? DEFAULT_MV_VIEW).depth} min={100} step={50}
                        onChange={v => updateView(selectedLayer.id, { depth: v })} />
                      <NumField label="ノートの厚み" value={(selectedLayer.view ?? DEFAULT_MV_VIEW).thickness} min={0} step={1}
                        onChange={v => updateView(selectedLayer.id, { thickness: v })} />
                    </Details>
                  )}
                  {selectedLayer.projection === 'circular' && (
                    <Details label="円の形を調整する">
                      <Hint>音の高さを円周に、時間を外側へ向かって並べます。</Hint>
                      <NumField label="内側の半径" value={(selectedLayer.ring ?? DEFAULT_MV_RING).innerRadius} min={0}
                        onChange={v => updateRing(selectedLayer.id, { innerRadius: v })} />
                      <NumField label="円弧の角度" value={(selectedLayer.ring ?? DEFAULT_MV_RING).sweep} min={30} max={360}
                        onChange={v => updateRing(selectedLayer.id, { sweep: v })} />
                      <NumField label="回転" value={(selectedLayer.ring ?? DEFAULT_MV_RING).rotate} min={-360} max={360}
                        onChange={v => updateRing(selectedLayer.id, { rotate: v })} />
                    </Details>
                  )}
                </>
              )}
            </>
          )}

          {selectedLayer.kind === 'shape' && (
            <>
              <SelectField label="形" value={selectedLayer.form} options={SHAPE_FORM_OPTIONS}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, form: v } as MvLayer))} />
              <NumField label="X" value={selectedLayer.x} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, x: v } as MvLayer))} />
              <NumField label="Y" value={selectedLayer.y} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, y: v } as MvLayer))} />
              <NumField label="大きさ" value={selectedLayer.size} min={1} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, size: v } as MvLayer))} />
              <NumField label="回転" value={selectedLayer.rotation} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, rotation: v } as MvLayer))} />
              <ColorField label="色" value={selectedLayer.color} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, color: v } as MvLayer))} />
              <CheckField label="塗りつぶす" checked={selectedLayer.filled} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, filled: v } as MvLayer))} />
              <NumField label="線の太さ" value={selectedLayer.thickness} min={0.2} step={0.5} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, thickness: v } as MvLayer))} />
              {selectedLayer.form === 'polygon' && (
                <NumField label="角の数" value={selectedLayer.sides ?? 6} min={3} max={24} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, sides: v } as MvLayer))} />
              )}
              <NumField label="個数" value={selectedLayer.count ?? 1} min={1} max={64} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, count: v } as MvLayer))} />
              {(selectedLayer.count ?? 1) > 1 && (
                <Details label="1個ごとのずらし方">
                  <NumField label="大きさの差" value={selectedLayer.spread ?? 0} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, spread: v } as MvLayer))} />
                  <NumField label="回転の差" value={selectedLayer.spin ?? 0} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, spin: v } as MvLayer))} />
                  <NumField label="横のずれ" value={selectedLayer.offsetX ?? 0} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, offsetX: v } as MvLayer))} />
                  <NumField label="縦のずれ" value={selectedLayer.offsetY ?? 0} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, offsetY: v } as MvLayer))} />
                  <NumField label="反応の遅れ" value={selectedLayer.stagger ?? 0} min={0} step={4} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, stagger: v } as MvLayer))} />
                  <Hint>「反応の遅れ」を入れると、端から順に反応が伝わる波のような動きになります。</Hint>
                </Details>
              )}
              <SelectField label="重ね方" value={selectedLayer.blend ?? 'normal'} options={BLEND_OPTIONS}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, blend: v } as MvLayer))} />

              <Details label={`音との連動（${selectedLayer.modulators.length}件）`}>
                <Hint>
                  「曲のどこが」「形のどこに」「どう効くか」を1行ずつ足していきます。
                  上から順に計算するので、足し算のあとに掛け算を重ねる…といった組み方ができます。
                  むずかしければ触らなくて大丈夫です。
                </Hint>
                {selectedLayer.modulators.map((mod, i) => (
                  <ModulatorRow
                    key={i}
                    mod={mod}
                    tracks={song.tracks}
                    onChange={next => updateMod(selectedLayer.id, i, next)}
                    onRemove={() => removeMod(selectedLayer.id, i)}
                  />
                ))}
                <button onClick={() => addMod(selectedLayer.id)} className={ADD_BTN_CLASS}>
                  <Plus size={13} />連動を追加
                </button>
              </Details>
            </>
          )}

          {selectedLayer.kind === 'effect' && (
            <>
              <SelectField label="演出" value={selectedLayer.style} options={EFFECT_STYLE_OPTIONS}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, style: v } as MvLayer))} />
              <SelectField label="タイミング" value={selectedLayer.trigger} options={TRIGGER_OPTIONS}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, trigger: v } as MvLayer))} />
              {selectedLayer.trigger === 'note' && (
                <div className="space-y-1 rounded border border-gray-700/70 bg-gray-900/60 p-2">
                  <p className="text-[10px] text-gray-400">どのトラックの音で光らせるか（未選択なら全部）</p>
                  {song.tracks.map(t => (
                    <CheckField
                      key={t}
                      label={`トラック @${t}`}
                      checked={!!selectedLayer.tracks?.includes(t)}
                      onChange={v => updateLayer(selectedLayer.id, l => {
                        if (l.kind !== 'effect') return l;
                        const cur = l.tracks ?? [];
                        const next = v ? [...cur, t] : cur.filter(x => x !== t);
                        return { ...l, tracks: next.length > 0 ? next : undefined };
                      })}
                    />
                  ))}
                </div>
              )}
              <NumField label="強さ" value={selectedLayer.amount} min={0} max={1} step={0.05}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, amount: v } as MvLayer))} />
              <NumField label="長さ（拍）" value={selectedLayer.decayBeats ?? 1} min={0.05} step={0.05}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, decayBeats: v } as MvLayer))} />
              {selectedLayer.style !== 'invert' && (
                <ColorField label="色" value={selectedLayer.color ?? '#ffffff'}
                  onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, color: v } as MvLayer))} />
              )}
            </>
          )}

          {selectedLayer.kind === 'chordBar' && (
            <>
              <NumField label="X" value={selectedLayer.rect.x} onChange={v => updateLayer(selectedLayer.id, l => (l.kind === 'chordBar' ? { ...l, rect: { ...l.rect, x: v } } : l))} />
              <NumField label="Y" value={selectedLayer.rect.y} onChange={v => updateLayer(selectedLayer.id, l => (l.kind === 'chordBar' ? { ...l, rect: { ...l.rect, y: v } } : l))} />
              <NumField label="幅" value={selectedLayer.rect.w} min={8} onChange={v => updateLayer(selectedLayer.id, l => (l.kind === 'chordBar' ? { ...l, rect: { ...l.rect, w: v } } : l))} />
              <NumField label="高さ" value={selectedLayer.rect.h} min={8} onChange={v => updateLayer(selectedLayer.id, l => (l.kind === 'chordBar' ? { ...l, rect: { ...l.rect, h: v } } : l))} />
              <NumField label="文字サイズ" value={selectedLayer.size} min={5} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, size: v } as MvLayer))} />
              <SelectField label="キー" value={selectedLayer.key}
                options={Object.keys(MV_ROOT_TO_PITCH).map(k => ({ value: k, label: k }))}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, key: v } as MvLayer))} />
              <SelectField label="色分け" value={selectedLayer.colorMode}
                options={[
                  { value: 'degree' as const, label: '度数で色分け' },
                  { value: 'fixed' as const, label: '全部同じ色' },
                ]}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, colorMode: v } as MvLayer))} />
              {selectedLayer.colorMode === 'fixed' && (
                <ColorField label="ブロック色" value={selectedLayer.color} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, color: v } as MvLayer))} />
              )}
              <ColorField label="いまの色" value={selectedLayer.activeColor} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, activeColor: v } as MvLayer))} />
              <ColorField label="文字色" value={selectedLayer.textColor} onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, textColor: v } as MvLayer))} />

              <p className="pt-1 text-[10px] font-bold text-gray-400">コード進行</p>
              <p className="text-[10px] leading-relaxed text-gray-500">
                小節番号とコード名を並べます。次のコードが始まるまでが1ブロックの長さです。
              </p>
              {selectedLayer.chords.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={c.bar}
                    step={0.25}
                    min={0}
                    onChange={e => updateLayer(selectedLayer.id, l => (l.kind === 'chordBar'
                      ? { ...l, chords: l.chords.map((x, j) => (j === i ? { ...x, bar: Number(e.target.value) || 0 } : x)) }
                      : l))}
                    className="min-h-9 w-16 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
                  />
                  <input
                    value={c.label}
                    placeholder="F#m7"
                    onChange={e => updateLayer(selectedLayer.id, l => (l.kind === 'chordBar'
                      ? { ...l, chords: l.chords.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }
                      : l))}
                    className="min-h-9 min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-100 outline-none"
                  />
                  <button
                    onClick={() => updateLayer(selectedLayer.id, l => (l.kind === 'chordBar'
                      ? { ...l, chords: l.chords.filter((_, j) => j !== i) }
                      : l))}
                    className={DEL_BTN_CLASS}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => updateLayer(selectedLayer.id, l => (l.kind === 'chordBar'
                  ? { ...l, chords: [...l.chords, { bar: l.chords.length, label: 'C' }] }
                  : l))}
                className={ADD_BTN_CLASS}
              >
                <Plus size={13} />コードを追加
              </button>
            </>
          )}

          {(selectedLayer.kind === 'image' || selectedLayer.kind === 'text') && (
            <>
              <SelectField label="動き" value={selectedLayer.motion} options={MOTION_OPTIONS}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, motion: v } as MvLayer))} />
              <NumField label="動きの強さ" value={selectedLayer.motionAmount ?? 0} step={1}
                onChange={v => updateLayer(selectedLayer.id, l => ({ ...l, motionAmount: v } as MvLayer))} />
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
              song.lyricTrackIds.length > 0 ? (
                <>
                  <SelectField
                    label="トラック"
                    value={String(lyricsLayer.trackId ?? song.lyricTrackIds[0])}
                    options={[
                      ...song.lyricTrackIds.map(t => ({ value: String(t), label: `@@${t} のみ` })),
                      { value: 'all', label: '全部（画面が埋まりがち）' },
                    ]}
                    onChange={v => updateLayer(lyricsLayer.id, l => ({
                      ...l,
                      trackId: v === 'all' ? 'all' : Number(v),
                    } as MvLayer))}
                  />
                  <p className="text-[10px] leading-relaxed text-gray-500">
                    歌詞トラックが複数あっても、画面に出すのはふつう1本だけです。
                  </p>
                  <div className="rounded border border-gray-700 bg-gray-800 p-2 text-[10px] text-gray-400">
                    <p className="mb-1">このレイヤーが出す歌詞：{shownLyricLines.length} 行</p>
                    <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                      {shownLyricLines.map((line, i) => (
                        <li key={i} className="truncate text-gray-300">
                          <span className="mr-1.5 text-gray-500">{line.bar.toFixed(2)}小節</span>{line.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
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
                      className="min-h-9 w-16 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
                    />
                    <input
                      value={line.text}
                      onChange={e => updateLayer(lyricsLayer.id, l => (l.kind === 'lyrics'
                        ? { ...l, lines: (l.lines ?? []).map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }
                        : l))}
                      className="min-h-9 min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-100 outline-none"
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
              className="min-h-9 min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-100 outline-none"
            />
            <input
              type="number"
              value={s.startBar}
              min={0}
              onChange={e => update(m => ({ ...m, sections: m.sections.map((x, j) => (j === i ? { ...x, startBar: Math.max(0, Number(e.target.value) || 0) } : x)) }))}
              className="min-h-9 w-16 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
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
        {/* 編集モードは常に見える位置に置く（タブ行に入れると狭い画面で流れて押せなくなる） */}
        <div className="mr-2 flex shrink-0 items-center rounded-full bg-gray-800 p-0.5">
          <button
            onClick={() => changeEditMode('easy')}
            className={`min-h-8 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${editMode === 'easy' ? 'bg-gray-200 text-gray-900' : 'text-gray-400'}`}
          >
            かんたん
          </button>
          <button
            onClick={() => changeEditMode('detail')}
            className={`min-h-8 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${editMode === 'detail' ? 'bg-gray-200 text-gray-900' : 'text-gray-400'}`}
          >
            くわしい
          </button>
        </div>
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

      {/* タブ＋編集モード切替 */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-gray-800 px-2 py-1.5">
        {visibleTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
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
