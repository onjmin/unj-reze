import { parseChords, parseChord } from '@onjmin/chord-parser';

export interface ChordEvent {
  key: string;
  chord: string;
  when: number;
  duration: number;
  section: string;
  label: string;
}

export function parseChordSymbol(symbol: string): number[] {
  try {
    const parsed = parseChord(symbol);
    return parsed.pitchClasses;
  } catch {
    return [];
  }
}

// 全角英数字などの正規化関数
function toHan(str: string): string {
  return str.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248)).replace(/　/g, ' ');
}

export function parseChordProgression(text: string, bpm?: number): { events: ChordEvent[]; bpm: number } {
  // 1. BPMの抽出
  let currentBpm = bpm ?? 120;
  const lines = text.split('\n').map(l => l.trim());
  for (const line of lines) {
    if (/^#\s*t\d+/i.test(line)) {
      const tm = line.match(/t(\d+)/i);
      if (tm) {
        currentBpm = parseInt(tm[1], 10);
        break;
      }
    }
  }

  // 2. parseChords によるパース
  const parserEvents = parseChords(text, currentBpm);

  // 3. 互換性のための変換（label と section を付与）
  const secBar = 60 / currentBpm * 4;
  let currentSection = '';
  let barGlobalIdx = 0;
  const barToSection: Record<number, string> = {};

  const linesList = text.split('\n').map(l => toHan(l).trim());
  for (const line of linesList) {
    if (!line.length) continue;
    if (/^#/.test(line)) {
      const label = line.replace(/^#\s*/, '').trim();
      if (!/^t\d+$/i.test(label)) {
        currentSection = label;
      }
      continue;
    }
    const bars = line.split(/[|lｌ→]/).filter(b => b.trim());
    if (bars.length === 0) continue;
    
    for (let i = 0; i < bars.length; i++) {
      barToSection[barGlobalIdx] = currentSection;
      barGlobalIdx++;
    }
  }

  const events: ChordEvent[] = parserEvents.map(e => {
    const barIdx = Math.floor(e.when / secBar);
    const section = barToSection[barIdx] || '';
    return {
      key: e.key,
      chord: e.chord,
      when: e.when,
      duration: e.duration,
      section,
      label: e.key + e.chord
    };
  });

  return { events, bpm: currentBpm };
}

// ステップ数を MML の音長（"4", "2." など）に変換
function stepsToMmlLength(steps: number): string {
  const lengths = [
    { step: 192, mml: '1' },
    { step: 144, mml: '2.' },
    { step: 96, mml: '2' },
    { step: 72, mml: '4.' },
    { step: 48, mml: '4' },
    { step: 36, mml: '8.' },
    { step: 24, mml: '8' },
    { step: 12, mml: '16' },
    { step: 6, mml: '32' },
  ];

  let remaining = steps;
  let result = '';
  while (remaining > 0) {
    let found = false;
    for (const l of lengths) {
      if (remaining >= l.step) {
        result += (result ? '&' : '') + l.mml;
        remaining -= l.step;
        found = true;
        break;
      }
    }
    if (!found) {
      break;
    }
  }
  return result || '32';
}

const PITCH_NAMES = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];

function noteToMml(midi: number, steps: number): string {
  const pc = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const lenStr = stepsToMmlLength(steps);
  return `o${octave}${PITCH_NAMES[pc]}${lenStr}`;
}

function restToMml(steps: number): string {
  const lenStr = stepsToMmlLength(steps);
  return `r${lenStr}`;
}

export function eventsToMml(events: ChordEvent[], bpm: number): string {
  const stepsPerBeat = 48;
  const secPerBeat = 60 / bpm;
  const maxTracks = 4;
  
  const trackMmls = Array.from({ length: maxTracks }, () => `@0 `);
  const currentSteps = Array.from({ length: maxTracks }, () => 0);

  for (const ev of events) {
    const startStep = Math.round(ev.when / secPerBeat * stepsPerBeat);
    const durationSteps = Math.round(ev.duration / secPerBeat * stepsPerBeat);
    
    const symbol = ev.key + ev.chord;
    let midiNotes: number[] = [];
    try {
      const parsed = parseChord(symbol);
      midiNotes = parsed.notes.map(n => parsed.root + n + 60);
    } catch {
      // ignore
    }

    for (let t = 0; t < maxTracks; t++) {
      const cStep = currentSteps[t];
      if (startStep > cStep) {
        trackMmls[t] += restToMml(startStep - cStep) + ' ';
      }
      
      if (t < midiNotes.length) {
        trackMmls[t] += noteToMml(midiNotes[t], durationSteps) + ' ';
      } else {
        trackMmls[t] += restToMml(durationSteps) + ' ';
      }
      
      currentSteps[t] = startStep + durationSteps;
    }
  }

  const finalMml = trackMmls
    .map(mml => `t${bpm} v60 ` + mml.trim())
    .join('; ');
    
  return finalMml;
}

export async function playChordProgression(
  events: ChordEvent[],
  bpm: number,
  onTick?: (index: number) => void,
  onDone?: () => void,
): Promise<() => void> {
  if (events.length === 0) {
    onDone?.();
    return () => {};
  }

  const mml = eventsToMml(events, bpm);
  
  if (typeof window === 'undefined') {
    onDone?.();
    return () => {};
  }

  const { playMML } = await import('@onjmin/dtm');

  const playback = playMML(mml, {
    loop: false,
    defaultBpm: bpm,
    volume: 50,
    onStop: () => {
      onDone?.();
    }
  });

  let stopped = false;
  let rafId: number | null = null;
  const startTime = performance.now();

  const animate = () => {
    if (stopped) return;
    const elapsed = (performance.now() - startTime) / 1000;
    let idx = events.length - 1;
    for (let i = 0; i < events.length; i++) {
      if (elapsed < events[i].when) {
        idx = i - 1;
        break;
      }
    }
    onTick?.(idx);
    
    const totalDuration = events[events.length - 1].when + events[events.length - 1].duration;
    if (elapsed < totalDuration) {
      rafId = requestAnimationFrame(animate);
    }
  };
  rafId = requestAnimationFrame(animate);

  return () => {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    playback.destroy();
  };
}

export function extractChordsFromContent(content: string): { chords: string; startLine: number } | null {
  const idx = content.indexOf('#コード進行');
  if (idx === -1) return null;
  const before = content.slice(0, idx);
  const startLine = before.split('\n').length - 1;
  const after = content.slice(idx + '#コード進行'.length).trim();
  return { chords: after, startLine };
}
