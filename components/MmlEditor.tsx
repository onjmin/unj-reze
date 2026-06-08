'use client';

import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { X, Music, Play, Square, Trash2, FileUp } from 'lucide-react';
import { GridNote, mmlToNotes, playMml, generateMmlLine, TrackData, PIANO_START, TOTAL_KEYS, NOTE_NAMES, COLS } from '@/lib/mml';
import { useAudioFocus } from '@/lib/audio-focus-context';

interface MmlEditorProps {
  onClose: () => void;
  onSave: (mml: string) => void;
}

const CELL_W = 22;
const CELL_H = 14;
const KEY_W = 48;
const GRID_W = KEY_W + COLS * CELL_W;
const GRID_H = TOTAL_KEYS * CELL_H;

const TRACK_COLORS = ['#a3e635', '#60a5fa', '#f472b6', '#fbbf24'];
const TRACK_NAMES = ['メロディ', '伴奏', 'ベース', 'リズム'];

const DEFAULT_TRACK_VOLS = [100, 80, 70, 60];

export default function MmlEditor({ onClose, onSave }: MmlEditorProps) {
  const id = useId();
  const { requestFocus, releaseFocus } = useAudioFocus();
  const [trackNotes, setTrackNotes] = useState<GridNote[][]>([[], [], [], []]);
  const [activeTrack, setActiveTrack] = useState(0);
  const [trackVols, setTrackVols] = useState(DEFAULT_TRACK_VOLS);
  const [tempo, setTempo] = useState(135);
  const [noteLen, setNoteLen] = useState(4);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playCol, setPlayCol] = useState(-1);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const handleExternalStop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    audioCtxRef.current = null;
    setPlayCol(-1);
    setIsPlaying(false);
  }, []);

  const activeNotes = trackNotes[activeTrack];

  const setActiveNotes = useCallback((fn: (prev: GridNote[]) => GridNote[]) => {
    setTrackNotes(prev => {
      const next = [...prev];
      next[activeTrack] = fn(prev[activeTrack]);
      return next;
    });
  }, [activeTrack]);

  const toggleNote = useCallback((row: number, col: number) => {
    setActiveNotes(prev => {
      const idx = prev.findIndex(n => n.row === row && n.col === col);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, { row, col, dur: noteLen }];
    });
  }, [setActiveNotes, noteLen]);

  const clearTrack = useCallback(() => {
    setActiveNotes(() => []);
  }, [setActiveNotes]);

  const clearAllTracks = useCallback(() => {
    setTrackNotes([[], [], [], []]);
  }, []);

  const generateMml = useCallback((): string => {
    const lines: string[] = [];
    let hasAny = false;
    trackNotes.forEach((notes, i) => {
      const mmlLine = generateMmlLine(notes);
      if (mmlLine) {
        lines.push(`@${i} t${tempo} v${trackVols[i]} ${mmlLine}`);
        hasAny = true;
      } else {
        lines.push(`@${i} t${tempo} v${trackVols[i]}`);
      }
    });
    return hasAny ? lines.join(';\n') : '';
  }, [trackNotes, tempo, trackVols]);

  const playAll = useCallback(() => {
    const tracks: TrackData[] = trackNotes.map((notes, i) => ({
      id: i,
      notes,
      volume: trackVols[i],
    }));
    if (tracks.every(t => t.notes.length === 0)) return;
    requestFocus(id, handleExternalStop);
    setIsPlaying(true);
    setPlayCol(0);
    const stop = playMml(tracks, tempo,
      (col) => setPlayCol(col),
      () => {
        setIsPlaying(false);
        setPlayCol(-1);
        releaseFocus(id);
      }
    );
    stopRef.current = stop;
    audioCtxRef.current = { close: stop } as unknown as AudioContext;
  }, [trackNotes, tempo, trackVols, id, requestFocus, handleExternalStop, releaseFocus]);

  const stopPlayback = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    audioCtxRef.current = null;
    setPlayCol(-1);
    setIsPlaying(false);
    releaseFocus(id);
  }, [id, releaseFocus]);

  useEffect(() => {
    return () => {
      stopRef.current?.();
      releaseFocus(id);
    };
  }, [id, releaseFocus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = GRID_W;
    const h = GRID_H;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0f121a';
    ctx.fillRect(0, 0, w, h);

    for (let r = 0; r < TOTAL_KEYS; r++) {
      const semitone = PIANO_START + r;
      const isBlack = [1, 3, 6, 8, 10].includes(semitone % 12);
      const isC = semitone % 12 === 0;
      const y = r * CELL_H;

      ctx.fillStyle = isBlack ? '#181b24' : '#0f121a';
      ctx.fillRect(KEY_W, y, COLS * CELL_W, CELL_H);
      if (isC) {
        ctx.fillStyle = '#1a1f2e';
        ctx.fillRect(KEY_W, y, COLS * CELL_W, CELL_H);
      }
      ctx.fillStyle = '#1e2433';
      ctx.fillRect(0, y, KEY_W, CELL_H);
      ctx.fillStyle = isBlack ? '#666' : '#aaa';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(NOTE_NAMES[semitone % 12] + (Math.floor(semitone / 12) - 1), KEY_W / 2, y + CELL_H / 2);
      ctx.strokeStyle = '#1a1f2e';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + CELL_H);
      ctx.lineTo(w, y + CELL_H);
      ctx.stroke();
    }

    for (let c = 0; c <= COLS; c++) {
      const x = KEY_W + c * CELL_W;
      const isBeat = c % 4 === 0;
      const isMeasure = c % 16 === 0;
      ctx.strokeStyle = isMeasure ? '#2a3450' : isBeat ? '#1e2740' : '#151a28';
      ctx.lineWidth = isMeasure ? 1.5 : isBeat ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const allTracks = trackNotes;
    allTracks.forEach((notes, tIdx) => {
      const color = TRACK_COLORS[tIdx];
      notes.forEach(n => {
        if (tIdx !== activeTrack) {
          ctx.globalAlpha = 0.2;
        } else {
          ctx.globalAlpha = 1;
        }
        const x = KEY_W + n.col * CELL_W + 1;
        const y = n.row * CELL_H + 1;
        const nw = n.dur * CELL_W - 2;
        const nh = CELL_H - 2;
        ctx.fillStyle = color;
        const semitone = PIANO_START + n.row;
        const hue = (semitone * 30) % 360;
        ctx.fillStyle = tIdx === activeTrack ? `hsla(${hue}, 70%, 55%, 0.85)` : color;
        ctx.fillRect(x, y, nw, nh);
        ctx.strokeStyle = tIdx === activeTrack ? `hsla(${hue}, 80%, 70%, 0.6)` : color;
        ctx.lineWidth = tIdx === activeTrack ? 1 : 0.5;
        ctx.strokeRect(x, y, nw, nh);
        ctx.globalAlpha = 1;
      });
    });

    if (playCol >= 0) {
      const px = KEY_W + playCol * CELL_W;
      ctx.fillStyle = 'rgba(163, 230, 53, 0.15)';
      ctx.fillRect(px, 0, CELL_W, h);
      ctx.fillStyle = '#a3e635';
      ctx.fillRect(px, 0, 2, h);
    }
  }, [trackNotes, activeTrack, playCol]);

  useEffect(() => {
    if (playCol < 0 || !wrapRef.current) return;
    const targetX = KEY_W + playCol * CELL_W;
    const halfW = wrapRef.current.clientWidth / 2;
    const scrollTo = Math.max(0, targetX - halfW);
    wrapRef.current.scrollLeft = scrollTo;
  }, [playCol]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / CELL_W);
    const row = Math.floor((e.clientY - rect.top) / CELL_H);
    if (col >= 0 && col < COLS && row >= 0 && row < TOTAL_KEYS) {
      toggleNote(row, col);
    }
  }, [toggleNote]);

  const handleRightClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left - KEY_W) / CELL_W);
    const row = Math.floor((e.clientY - rect.top) / CELL_H);
    if (col >= 0 && col < COLS && row >= 0 && row < TOTAL_KEYS) {
      setActiveNotes(prev => prev.filter(n => !(n.row === row && n.col >= col && n.col < col + n.dur)));
    }
  }, [setActiveNotes]);

  const handleImport = useCallback(() => {
    const parsed = mmlToNotes(importText);
    if (parsed.tracks.length === 0) return;
    const next = [...Array(4)].map((_, i) => {
      const found = parsed.tracks.find(t => t.id === i);
      return found ? found.notes : [];
    });
    setTrackNotes(next);
    setTempo(parsed.tempo);
    parsed.tracks.forEach(t => {
      if (t.id >= 0 && t.id < 4) {
        setTrackVols(prev => {
          const v = [...prev];
          v[t.id] = t.volume;
          return v;
        });
      }
    });
    setShowImport(false);
    setImportText('');
  }, [importText]);

  const insertDemo = useCallback(() => {
    const OFFSET = 12;
    const melody = [
      [24 + OFFSET, 0, 4], [26 + OFFSET, 4, 4], [28 + OFFSET, 8, 4], [29 + OFFSET, 12, 4],
      [31 + OFFSET, 16, 4], [33 + OFFSET, 20, 4], [35 + OFFSET, 24, 4], [36 + OFFSET, 28, 4],
      [38 + OFFSET, 32, 8], [36 + OFFSET, 40, 4], [35 + OFFSET, 44, 4],
      [33 + OFFSET, 48, 8], [31 + OFFSET, 56, 4], [29 + OFFSET, 60, 4],
    ];
    const chords = [
      [0 + OFFSET, 0, 8], [2 + OFFSET, 0, 8], [4 + OFFSET, 0, 8],
      [7 + OFFSET, 8, 8], [9 + OFFSET, 8, 8], [11 + OFFSET, 8, 8],
      [4 + OFFSET, 16, 8], [5 + OFFSET, 16, 8], [7 + OFFSET, 16, 8],
      [0 + OFFSET, 24, 8], [9 + OFFSET, 24, 8], [11 + OFFSET, 24, 8],
      [2 + OFFSET, 32, 16], [4 + OFFSET, 32, 16], [7 + OFFSET, 32, 16],
      [0 + OFFSET, 48, 16], [5 + OFFSET, 48, 16], [9 + OFFSET, 48, 16],
    ];
    const bass = [
      [4 + OFFSET, 0, 16], [0 + OFFSET, 16, 16], [7 + OFFSET, 32, 16], [5 + OFFSET, 48, 16],
    ];
    setTrackNotes([
      melody.map(([r, c, d]) => ({ row: r, col: c, dur: d })),
      chords.map(([o, c, d]) => ({ row: o, col: c, dur: d })),
      bass.map(([o, c, d]) => ({ row: o, col: c, dur: d })),
      [],
    ]);
  }, []);

  const anyNotes = trackNotes.some(t => t.length > 0);

  return (
    <div className="absolute inset-0 bg-[#0b0e14] z-50 flex flex-col select-none">
      <div className="flex items-center px-3.5 py-2.5 border-b border-gray-800 shrink-0 bg-[#0b0e14]">
        <button onClick={onClose} className="mr-2 text-gray-400 hover:bg-gray-100/10 p-1.5 rounded transition-colors">
          <X size={20} />
        </button>
        <span className="font-bold text-xs text-gray-300">キャンセル</span>
        <span className="text-gray-600 mx-1.5 text-[10px]">›</span>
        <span className="text-gray-400 text-xs">MML作曲エディタ (マルチトラック)</span>
      </div>

      <div className="flex border-b border-gray-800 shrink-0 bg-[#0b0e14]">
        {[0, 1, 2, 3].map(i => (
          <button
            key={i}
            onClick={() => setActiveTrack(i)}
            className={`flex-1 py-2 text-[10px] font-bold border-b-2 transition-all flex items-center justify-center space-x-1 ${
              activeTrack === i
                ? `text-gray-100 border-b-2`
                : 'text-gray-500 border-b-transparent hover:text-gray-300'
            }`}
            style={{ borderBottomColor: activeTrack === i ? TRACK_COLORS[i] : 'transparent' }}
          >
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: TRACK_COLORS[i] }}
            />
            <span>{i}: {TRACK_NAMES[i]}</span>
            <span className="text-[9px] text-gray-600">({trackNotes[i].length})</span>
          </button>
        ))}
      </div>

      <div className="px-3 py-1.5 border-b border-gray-800 shrink-0 bg-[#0b0e14] flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          onClick={() => setShowImport(!showImport)}
          className={`px-2 py-1 rounded text-[10px] font-bold border flex items-center space-x-1 transition-all ${
            showImport
              ? 'bg-blue-600/20 text-blue-400 border-blue-500/55'
              : 'bg-[#0f121a] text-gray-400 border-gray-800 hover:bg-gray-100/5'
          }`}
        >
          <FileUp size={10} /> <span>MML読込</span>
        </button>
        <div className="flex items-center space-x-1.5">
          <label className="text-[10px] font-bold text-gray-500">BPM</label>
          <input
            type="number"
            value={tempo}
            onChange={(e) => setTempo(Math.max(30, Math.min(300, parseInt(e.target.value) || 135)))}
            className="w-14 bg-[#0f121a] text-white text-xs text-center py-0.5 rounded border border-gray-800 outline-none focus:border-blue-500/55"
          />
        </div>
        <div className="flex items-center space-x-1">
          <label className="text-[10px] font-bold text-gray-500 mr-0.5">音長</label>
          {[1, 2, 4, 8, 16].map(l => (
            <button
              key={l}
              onClick={() => setNoteLen(l)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${
                noteLen === l
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/55'
                  : 'bg-[#0f121a] text-gray-400 border-gray-800 hover:bg-gray-100/5'
              }`}
            >{l === 1 ? '全' : l === 2 ? '2分' : `${l}分`}</button>
          ))}
        </div>
        <div className="flex items-center space-x-1.5">
          <label className="text-[10px] font-bold text-gray-500">Vol</label>
          {[0, 1, 2, 3].map(i => (
            <input
              key={i}
              type="range"
              min={0}
              max={127}
              value={trackVols[i]}
              onChange={(e) => setTrackVols(prev => {
                const v = [...prev];
                v[i] = parseInt(e.target.value);
                return v;
              })}
              className="w-10 h-1 accent-current"
              style={{ accentColor: TRACK_COLORS[i] }}
              title={`${TRACK_NAMES[i]} vol`}
            />
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center space-x-1">
          <button onClick={insertDemo} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0f121a] text-gray-400 border border-gray-800 hover:bg-gray-100/5">
            サンプル
          </button>
          <button onClick={clearTrack} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0f121a] text-red-400 border border-gray-800 hover:bg-gray-100/5">
            トラック消去
          </button>
          <button onClick={clearAllTracks} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0f121a] text-red-400 border border-gray-800 hover:bg-gray-100/5">
            全消去
          </button>
        </div>
      </div>

      {showImport && (
        <div className="px-3 py-1.5 border-b border-gray-800 shrink-0 bg-[#0f121a]">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            className="w-full h-16 bg-[#0b0e14] text-[#a3e635] font-mono text-[10px] rounded-lg p-2 border border-gray-700 outline-none resize-none placeholder:text-gray-600"
            placeholder="@0 t135 v100 r4 [o4c+o4e]4;@1 t135 v80 r4 [o3a]4"
            spellCheck={false}
          />
          <button
            onClick={handleImport}
            disabled={!importText.trim()}
            className="mt-1 px-3 py-0.5 rounded text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
          >
            読み込み
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto scrollbar-none bg-[#0a0c12]" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onContextMenu={handleRightClick}
          className="block cursor-crosshair"
        />
      </div>

      <div className="px-3 pt-1 pb-2 shrink-0 bg-[#0b0e14] border-t border-gray-900 flex items-center justify-between">
        <div className="flex items-center space-x-3 text-[9px] text-gray-600">
          <span>左クリック: 追加/削除</span>
          <span>右クリック: 範囲削除</span>
          <span className="flex items-center space-x-1">
            {[0, 1, 2, 3].map(i => (
              <span key={i} className="flex items-center space-x-0.5">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: TRACK_COLORS[i] }} />
                <span className={i === activeTrack ? 'text-gray-400' : 'text-gray-700'}>{i}</span>
              </span>
            ))}
          </span>
        </div>
        <div className="flex space-x-2">
          {isPlaying ? (
            <button onClick={stopPlayback} className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-red-600 hover:bg-red-500 text-white flex items-center space-x-1">
              <Square size={12} /> <span>停止</span>
            </button>
          ) : (
            <button onClick={playAll} disabled={!anyNotes} className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[#a3e635] hover:bg-[#8bc34a] text-black flex items-center space-x-1 disabled:opacity-50">
              <Play size={12} /> <span>再生</span>
            </button>
          )}
          <button
            onClick={() => { const mml = generateMml(); if (mml) onSave(mml); }}
            disabled={!anyNotes}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] disabled:opacity-50 flex items-center space-x-1.5 transition-colors"
          >
            <Music size={12} /> <span>投稿</span>
          </button>
        </div>
      </div>
    </div>
  );
}
