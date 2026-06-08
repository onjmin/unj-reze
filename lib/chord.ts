export interface ChordEvent {
  key: string;
  chord: string;
  when: number;
  duration: number;
  section: string;
  label: string;
}

const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DEGREE_TO_PITCH = [0, 2, 4, 5, 7, 9, 11]; // degree-1 → pitch class

function pitchNameToClass(name: string): number | null {
  const map: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const base = map[name[0].toUpperCase()];
  if (base === undefined) return null;
  const sharp = name[1] === '#' || name[1] === '♯' ? 1 : name[1] === 'b' || name[1] === '♭' ? -1 : 0;
  return ((base + sharp) % 12 + 12) % 12;
}

export function parseChordSymbol(symbol: string): number[] {
  const m = symbol.match(/^([A-G][#b♯♭]?)(.*)$/);
  if (!m) return [];
  const rootName = m[1];
  const suffix = m[2].replace(/[\s・]/g, '');
  const root = pitchNameToClass(rootName);
  if (root === null) return [];

  const intervals = [0, 4, 7]; // major triad default

  const rest = suffix;

  // minor
  if (/^m(?!aj)/.test(rest)) {
    intervals[1] = 3;
    const after = rest.slice(1);
    applyExtensions(intervals, after);
  } else if (/^(min|Min|minor|Minor|-)/.test(rest)) {
    intervals[1] = 3;
    const after = rest.replace(/^(min|Min|minor|Minor|-)/, '');
    applyExtensions(intervals, after);
  } else if (/^dim|^〇/.test(rest)) {
    intervals[1] = 3;
    intervals[2] = 6;
    const after = rest.replace(/^(dim|〇)/, '');
    applyExtensions(intervals, after);
  } else if (/^\+/.test(rest)) {
    intervals[2] = 8;
    const after = rest.slice(1);
    applyExtensions(intervals, after);
  } else if (/^[Φφø]/.test(rest)) {
    // m7b5
    intervals[1] = 3;
    intervals[2] = 6;
    intervals.push(10);
    const after = rest.slice(1);
    applyExtensions(intervals, after);
  } else if (/^M(?!a)/.test(rest) || /^(maj|Maj|major|Major|△|Δ)/.test(rest)) {
    // major 7th
    intervals.push(11);
    const after = rest.replace(/^(M(?!a)|maj|Maj|major|Major|△|Δ)/, '');
    applyExtensions(intervals, after);
  } else {
    applyExtensions(intervals, rest);
  }

  return intervals.map(i => ((root + i) % 12 + 12) % 12);
}

function applyExtensions(intervals: number[], s: string) {
  if (!s) return;

  const numMatch = s.match(/^(\d+)/);
  if (!numMatch) return;

  const num = parseInt(numMatch[1]);
  const after = s.slice(numMatch[0].length);
  const hasSharp = after[0] === '#' || after[0] === '♯';
  const hasFlat = after[0] === 'b' || after[0] === '♭';
  const isDim = after[0] === 'd';
  const modAfter = after.slice(hasSharp || hasFlat || isDim ? 1 : 0);

  const half = hasSharp ? 1 : hasFlat ? -1 : 0;

  if (num >= 7 && !intervals.some(i => i % 12 === 11) && !intervals.some(i => i % 12 === 10)) {
    intervals.push(half === -1 ? 10 : 11);
  }
  if (num >= 9 && !intervals.some(i => i % 12 === 2)) intervals.push(2);
  if (num >= 11 && !intervals.some(i => i % 12 === 5)) intervals.push(5);
  if (num >= 13 && !intervals.some(i => i % 12 === 9)) intervals.push(9);

  if ((num === 5 || num === 7 || num === 9 || num === 11 || num === 13) && half !== 0) {
    const degreeIdx = num === 5 ? 2 : num === 7 ? 3 : num === 9 ? 4 : num === 11 ? 5 : num === 13 ? 6 : -1;
    if (degreeIdx >= 0 && degreeIdx < intervals.length) {
      intervals[degreeIdx] = ((intervals[degreeIdx] - intervals[0]) % 12 + 12 + half) % 12 + intervals[0];
    }
  }

  // sus4
  if (/^sus/.test(after) || /^sus/.test(modAfter)) {
    const susIdx = intervals.findIndex(i => ((i - intervals[0]) % 12 + 12) % 12 === 4);
    if (susIdx >= 0) intervals[susIdx] = intervals[0] + 5;
  }

  // add
  if (/^add/.test(after) || /^add/.test(modAfter)) {
    const addMatch = after.match(/add(\d+)/);
    if (addMatch) {
      const addNum = parseInt(addMatch[1]);
      const addPitch = DEGREE_TO_PITCH[(addNum - 1) % 7] + Math.floor((addNum - 1) / 7) * 12;
      if (!intervals.some(i => i % 12 === (intervals[0] + addPitch) % 12)) {
        intervals.push(intervals[0] + addPitch);
      }
    }
  }
}

export function parseChordProgression(text: string, bpm?: number): { events: ChordEvent[]; bpm: number } {
  const output: ChordEvent[] = [];
  let currentBpm = bpm ?? 120;
  let secBar = 60 / currentBpm * 4;
  let currentSection = '';
  let barIdx = 0;

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  for (const line of lines) {
    if (/^#\s*t\d+/i.test(line)) {
      const tm = line.match(/t(\d+)/i);
      if (tm) {
        currentBpm = parseInt(tm[1]);
        secBar = 60 / currentBpm * 4;
      }
      continue;
    }
    if (/^#/.test(line)) {
      currentSection = line.replace(/^#\s*/, '').trim();
      continue;
    }

    const bars = line.split(/[|ｌｌ→]/).filter(b => b.trim());
    if (bars.length === 0) continue;

    for (const bar of bars) {
      const when = barIdx * secBar;
      const changes: { idx: number; char: string }[] = [];
      for (let i = 0; i < bar.length; i++) {
        const c = bar[i];
        if (/^[A-G]$/.test(c)) {
          const prev = bar[i - 1];
          const prev2 = bar.slice(i - 2, i);
          if (prev === '/' || prev2 === 'on') continue;
          if (prev2 === 'N.' && c === 'C') continue;
          changes.push({ idx: i, char: c });
        }
      }

      if (changes.length === 0) {
        barIdx++;
        continue;
      }

      const divide = 2 ** Math.ceil(Math.log2(changes.length));
      const unitTime = secBar / divide;

      for (let i = 0; i < changes.length; i++) {
        const start = changes[i].idx;
        const end = i < changes.length - 1 ? changes[i + 1].idx : bar.length;
        const raw = bar.slice(start, end).replace(/\s+/g, '').replace(/[　・]/g, '');
        const chordWhen = when + i * unitTime;

        if (/^[=_%]/.test(raw[0])) {
          if (output.length > 0) {
            const last = { ...output[output.length - 1] };
            last.when = chordWhen;
            last.duration = unitTime;
            output.push(last);
          }
          continue;
        }

        const key = raw.slice(0, raw[1] === '#' || raw[1] === 'b' ? 2 : 1);
        const chordSuffix = raw.slice(key.length);

        output.push({
          key,
          chord: chordSuffix,
          when: chordWhen,
          duration: unitTime,
          section: currentSection,
          label: raw,
        });
      }

      if (divide > changes.length && output.length > 0) {
        output[output.length - 1].duration += unitTime * (divide - changes.length);
      }
      barIdx++;
    }
  }

  return { events: output, bpm: currentBpm };
}

export function playChordProgression(
  events: ChordEvent[],
  bpm: number,
  onTick?: (index: number) => void,
  onDone?: () => void,
): () => void {
  if (events.length === 0) {
    onDone?.();
    return () => {};
  }

  const ctx = new AudioContext();
  const totalDuration = events[events.length - 1].when + events[events.length - 1].duration + 0.5;
  let stopped = false;

  for (const ev of events) {
    const pitches = parseChordSymbol(ev.label);
    for (const pc of pitches) {
      // Choose octave: root in octave 4, others spread around
      const midi = 60 + pc; // C4-C6 range, +1 octave
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const t = ev.when;
      const dur = ev.duration;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + dur + 0.02);
    }
  }

  let rafId: number | null = null;
  let timerId: number | null = null;
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
    if (elapsed < totalDuration) {
      rafId = requestAnimationFrame(animate);
    }
  };
  rafId = requestAnimationFrame(animate);

  timerId = window.setTimeout(() => {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    ctx.close();
    onDone?.();
  }, totalDuration * 1000);

  return () => {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (timerId) clearTimeout(timerId);
    ctx.close();
  };
}

export function extractChordsFromContent(content: string): { chords: string; startLine: number } | null {
  const lines = content.split('\n');
  let startLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^#\s*chord/i.test(trimmed)) {
      startLine = i;
      break;
    }
  }

  if (startLine < 0) return null;

  const chordLines = lines.slice(startLine + 1).filter(l => l.trim()).map(l => l.trim());
  return { chords: chordLines.join('\n'), startLine };
}
