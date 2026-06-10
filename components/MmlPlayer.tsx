'use client';

import { useState, useRef, useEffect, useLayoutEffect, useId, useCallback } from 'react';
import { Play, Square } from 'lucide-react';
import { mmlToNotes, playMml, tokenizeMmlTrack, MmlToken } from '@/lib/mml';
import { useAudioFocus } from '@/lib/audio-focus-context';

interface MmlPlayerProps {
  mml: string;
}

interface TrackBody {
  id: number;
  body: string;
  tokens: MmlToken[];
}

const TRACK_COLORS = ['#a3e635', '#60a5fa', '#f472b6', '#fbbf24'];

function parseAll(mml: string) {
  const parsed = mmlToNotes(mml);
  const bodies: TrackBody[] = [];
  let totalCols = 0;
  const normalized = mml
    .replace(/\s*;\s*/g, ';')
    .replace(/\s+(?=@\d)/g, ';');
  const sectionRegex = /@(\d+)\s*(.*?)(?:;|$)/g;
  let m: RegExpExecArray | null;
  while ((m = sectionRegex.exec(normalized)) !== null) {
    const id = parseInt(m[1]);
    const body = m[2]
      .replace(/t\d+\s*/g, '')
      .replace(/v\d+\s*/g, '')
      .replace(/q\d+\s*/g, '')
      .trim();
    if (body) {
      const t = parsed.tracks.find(at => at.id === id);
      if (t && t.notes.length > 0) {
        const tokens = tokenizeMmlTrack(body);
        for (const tok of tokens) {
          const end = tok.col + tok.dur;
          if (end > totalCols) totalCols = end;
        }
        bodies.push({ id, body, tokens });
      }
    }
  }
  return { ...parsed, bodies, totalCols };
}

export default function MmlPlayer({ mml }: MmlPlayerProps) {
  const id = useId();
  const { requestFocus, releaseFocus } = useAudioFocus();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);
  const scrollRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const tokenRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const parsedRef = useRef<ReturnType<typeof parseAll> | null>(null);

  const handleExternalStop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setIsPlaying(false);
    setProgress(0);
  }, []);

  if (!parsedRef.current) {
    parsedRef.current = parseAll(mml);
  }

  useEffect(() => {
    parsedRef.current = null;
  }, [mml]);

  const { tracks, tempo, bodies, totalCols } = parsedRef.current;
  const activeTracks = tracks.filter(t => t.notes.length > 0);

  const getActiveTokenIds = (col: number) => {
    const set = new Set<string>();
    if (col < 0) return set;
    bodies.forEach(({ id, tokens }) => {
      for (const tok of tokens) {
        if (tok.dur > 0 && (tok.type === 'note' || tok.type === 'chord') && col >= tok.col && col < tok.col + tok.dur) {
          set.add(`${id}-${tok.col}`);
        }
      }
    });
    return set;
  };

  const activeIds = getActiveTokenIds(isPlaying ? progress : -1);

  const handlePlay = () => {
    if (activeTracks.length === 0) return;
    requestFocus(id, handleExternalStop);
    setIsPlaying(true);
    setProgress(0);

    const stop = playMml(tracks, tempo,
      (col) => setProgress(col),
      () => {
        setIsPlaying(false);
        setProgress(0);
        releaseFocus(id);
      },
      totalCols
    );
    stopRef.current = stop;
  };

  const handleStop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setIsPlaying(false);
    setProgress(0);
    releaseFocus(id);
  };

  useEffect(() => {
    return () => {
      stopRef.current?.();
      releaseFocus(id);
    };
  }, [id, releaseFocus]);

  useLayoutEffect(() => {
    if (!isPlaying) return;
    for (const { id, tokens } of bodies) {
      for (const tok of tokens) {
        if (tok.dur > 0 && progress >= tok.col && progress < tok.col + tok.dur) {
          const key = `${id}-${tok.col}`;
          const el = tokenRefs.current.get(key);
          const lane = scrollRefs.current.get(id);
          if (el && lane && el.offsetWidth > 0 && lane.clientWidth > 0) {
            // ハイライト要素の中央をコンテナの中央に持ってくる
            const elementCenter = el.offsetLeft + el.offsetWidth / 2;
            const containerCenter = lane.clientWidth / 2;
            const maxScroll = lane.scrollWidth - lane.clientWidth;
            const newScrollLeft = Math.max(0, Math.min(elementCenter - containerCenter, Math.max(0, maxScroll)));
            lane.scrollLeft = newScrollLeft;
          }
          break;
        }
      }
    }
  }, [progress, isPlaying, bodies]);

  if (activeTracks.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0f121a] mb-2.5 overflow-hidden">
      <div className="flex items-center px-3 pt-2.5 pb-1 space-x-2">
        <button
          onClick={isPlaying ? handleStop : handlePlay}
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${isPlaying
              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
              : 'bg-[#a3e635]/20 text-[#a3e635] hover:bg-[#a3e635]/30'
            }`}
        >
          {isPlaying ? <Square size={10} /> : <Play size={10} className="ml-0.5" />}
        </button>
        <span className="text-[10px] text-gray-500 font-mono">{tempo}</span>
        {(() => {
          const tickSec = 60 / tempo / 4;
          const elapsedSec = progress * tickSec;
          const m = Math.floor(elapsedSec / 60);
          const s = Math.floor(elapsedSec % 60);
          return <span className="text-[10px] text-gray-300 font-mono min-w-[2rem]">{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>;
        })()}
        <div className="flex items-center space-x-2 ml-auto">
          {activeTracks.map(t => (
            <span key={t.id} className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: TRACK_COLORS[t.id % TRACK_COLORS.length] }} />
              <span className="text-[10px] text-gray-500 font-mono">@{t.id}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="px-2.5 pb-2.5 space-y-1">
        {bodies.map(({ id, tokens }) => {
          const color = TRACK_COLORS[id % TRACK_COLORS.length];
          return (
            <div key={id} className="flex items-stretch gap-1.5">
              <div className="flex flex-col items-center justify-start pt-1 w-5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[9px] text-gray-600 font-mono mt-0.5">@{id}</span>
              </div>
              <div
                ref={el => { if (el) scrollRefs.current.set(id, el); }}
                className="flex-1 overflow-x-auto scrollbar-none rounded bg-[#07090f] p-2 text-nowrap relative"
              >
                {tokens.map((tok, i) => {
                  const key = `${id}-${tok.col}`;
                  const isActive = isPlaying && activeIds.has(key);
                  return (
                    <span
                      key={i}
                      ref={el => { if (el && (tok.type === 'note' || tok.type === 'chord')) tokenRefs.current.set(key, el); }}
                      className="font-mono text-xs leading-relaxed transition-all duration-75"
                      style={{
                        color: isActive ? '#000' : (tok.type === 'length' || tok.type === 'octave' || tok.type === 'shift' || tok.type === 'volume' ? '#374151' : tok.type === 'rest' ? '#6b7280' : undefined),
                        backgroundColor: isActive ? color : undefined,
                        fontWeight: isActive ? 700 : undefined,
                        borderRadius: isActive ? '0.25rem' : undefined,
                        paddingLeft: isActive ? '0.125rem' : undefined,
                        paddingRight: isActive ? '0.125rem' : undefined,
                        marginLeft: isActive ? '-0.125rem' : undefined,
                        marginRight: isActive ? '-0.125rem' : undefined,
                      }}
                    >
                      {tok.text}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
