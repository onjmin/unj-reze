'use client';

import { useState, useRef, useEffect, useId, useCallback } from 'react';
import { Play, Square } from 'lucide-react';
import { parseChordProgression, playChordProgression } from '@/lib/chord';
import { useAudioFocus } from '@/lib/audio-focus-context';

interface ChordPlayerProps {
  chords: string;
}

const SECTION_COLORS = ['#60a5fa', '#f472b6', '#fbbf24', '#a3e635', '#818cf8', '#fb923c'];

interface DisplayPart {
  text: string;
  isChord: boolean;
  eventIdx: number;
}

interface DisplayLine {
  type: 'section' | 'bar';
  section?: string;
  colorIdx: number;
  parts?: DisplayPart[];
}

export default function ChordPlayer({ chords }: ChordPlayerProps) {
  const id = useId();
  const { requestFocus, releaseFocus } = useAudioFocus();
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const stopRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { events, bpm } = parseChordProgression(chords);

  // Build display lines from raw text
  const rawLines = chords.split('\n').map(l => l.trim()).filter(l => l);
  const displayLines: DisplayLine[] = [];
  let eventCounter = 0;
  let colorIdx = -1;

  for (const line of rawLines) {
    if (/^#/.test(line)) {
      const label = line.replace(/^#\s*/, '').trim();
      if (/^t\d+$/i.test(label)) continue;
      colorIdx++;
      displayLines.push({ type: 'section', section: label, colorIdx: Math.max(0, colorIdx) });
      continue;
    }

    const segments = line.split('|');
    if (segments.length <= 1) continue;

    const parts: DisplayPart[] = [];
    for (let i = 0; i < segments.length; i++) {
      if (i > 0) parts.push({ text: '|', isChord: false, eventIdx: -1 });
      const bar = segments[i].trim();
      if (!bar) continue;

      // Split bar into individual chord changes
      const splitAt: number[] = [];
      for (let j = 0; j < bar.length; j++) {
        const c = bar[j];
        if (/^[A-G]$/.test(c)) {
          const prev = bar[j - 1];
          const prev2 = bar.slice(j - 2, j);
          if (prev === '/' || prev2 === 'on') continue;
          splitAt.push(j);
        }
      }

      if (splitAt.length === 0) {
        parts.push({ text: bar, isChord: true, eventIdx: eventCounter < events.length ? eventCounter : -1 });
        eventCounter++;
        continue;
      }

      for (let ci = 0; ci < splitAt.length; ci++) {
        if (ci > 0) parts.push({ text: '', isChord: false, eventIdx: -1 });
        const start = splitAt[ci];
        const end = ci < splitAt.length - 1 ? splitAt[ci + 1] : bar.length;
        const symbol = bar.slice(start, end).trim();
        if (symbol) {
          parts.push({ text: symbol, isChord: true, eventIdx: eventCounter < events.length ? eventCounter : -1 });
          eventCounter++;
        }
      }
    }

    if (parts.length > 0) {
      displayLines.push({ type: 'bar', colorIdx: Math.max(0, colorIdx), parts });
    }
  }

  const handleExternalStop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setIsPlaying(false);
    setActiveIndex(-1);
  }, []);

  const handlePlay = () => {
    if (events.length === 0) return;
    requestFocus(id, handleExternalStop);
    setIsPlaying(true);
    setActiveIndex(0);

    const stop = playChordProgression(events, bpm,
      (idx) => setActiveIndex(idx),
      () => {
        setIsPlaying(false);
        setActiveIndex(-1);
        releaseFocus(id);
      },
    );
    stopRef.current = stop;
  };

  const handleStop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setIsPlaying(false);
    setActiveIndex(-1);
    releaseFocus(id);
  };

  useEffect(() => {
    return () => {
      stopRef.current?.();
      releaseFocus(id);
    };
  }, [id, releaseFocus]);

  useEffect(() => {
    if (!isPlaying || activeIndex < 0 || !scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector(`[data-eidx="${activeIndex}"]`) as HTMLElement | null;
    const lane = scrollRef.current;
    if (activeEl && lane) {
      const elCenter = activeEl.offsetLeft + activeEl.offsetWidth / 2;
      const containerCenter = lane.clientWidth / 2;
      const maxScroll = lane.scrollWidth - lane.clientWidth;
      lane.scrollLeft = Math.max(0, Math.min(elCenter - containerCenter, Math.max(0, maxScroll)));
    }
  }, [activeIndex, isPlaying]);

  if (events.length === 0) return null;

  const totalSec = events[events.length - 1].when + events[events.length - 1].duration;
  const currentSec = activeIndex >= 0 ? events[activeIndex].when : 0;

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0f121a] mb-2.5 overflow-hidden">
      <div className="flex items-center px-3 pt-2.5 pb-1 space-x-2">
        <button
          onClick={isPlaying ? handleStop : handlePlay}
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            isPlaying
              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
              : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
          }`}
        >
          {isPlaying ? <Square size={10} /> : <Play size={10} className="ml-0.5" />}
        </button>
        <span className="text-[10px] text-gray-500 font-mono">{bpm}</span>
        <span className="text-[10px] text-gray-300 font-mono min-w-[2rem]">
          {String(Math.floor(currentSec / 60)).padStart(2, '0')}:{String(Math.floor(currentSec % 60)).padStart(2, '0')} / {String(Math.floor(totalSec / 60)).padStart(2, '0')}:{String(Math.floor(totalSec % 60)).padStart(2, '0')}
        </span>
      </div>

      <div ref={scrollRef} className="px-2.5 pb-2.5 overflow-x-auto scrollbar-none relative">
        {displayLines.map((dl, li) => {
          const color = SECTION_COLORS[dl.colorIdx % SECTION_COLORS.length];
          if (dl.type === 'section') {
            return (
              <div key={li} className="mt-2 first:mt-0">
                <span className="text-[10px]" style={{ color }}>{dl.section}</span>
              </div>
            );
          }
          return (
            <div key={li} className="flex flex-wrap items-center gap-0.5 mt-1 first:mt-0">
              {dl.parts!.map((p, pi) => {
                if (!p.isChord) {
                  return <span key={pi} className="text-gray-600 font-mono text-xs">{p.text}</span>;
                }
                const isActive = isPlaying && p.eventIdx >= 0 && activeIndex === p.eventIdx;
                return (
                  <span
                    key={pi}
                    data-eidx={p.eventIdx}
                    className="font-mono text-xs leading-relaxed rounded px-0.5 py-0.5 whitespace-nowrap transition-all duration-75"
                    style={{
                      color: isActive ? '#000' : color,
                      backgroundColor: isActive ? color : undefined,
                      fontWeight: isActive ? 700 : undefined,
                    }}
                  >
                    {p.text}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
