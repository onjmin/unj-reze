export interface GridNote {
  row: number;
  col: number;
  dur: number;
}

export interface TrackData {
  id: number;
  notes: GridNote[];
  volume: number;
}

export interface ParsedMml {
  tracks: TrackData[];
  tempo: number;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const PIANO_START = 36;
export const TOTAL_KEYS = 48;
export const COLS = 64;
const FREQ_C4 = 261.63;

export interface MmlToken {
  text: string;
  col: number;
  dur: number;
  type: 'note' | 'chord' | 'rest' | 'octave' | 'shift' | 'length' | 'volume';
}

export function tokenizeMmlTrack(body: string): MmlToken[] {
  const tokens: MmlToken[] = [];
  let curOct = 4;
  let curLen = 4;
  let col = 0;

  const raw = body.match(/l\d+\.?|o\d+|[<>]|v\d+|\[[^\]]*\]\d*\.?\d*|r\d*\.?\d*|[a-g][+#]?\d*\.?\d*/gi) || [];

  raw.forEach(tok => {
    const lower = tok.toLowerCase();
    if (lower.startsWith('l')) {
      tokens.push({ text: tok, col, dur: 0, type: 'length' });
      curLen = mmlDivToCount(lower.slice(1));
      return;
    }
    if (lower.startsWith('o')) {
      tokens.push({ text: tok, col, dur: 0, type: 'octave' });
      curOct = parseInt(lower.slice(1)) || 4;
      return;
    }
    if (lower.startsWith('v')) {
      tokens.push({ text: tok, col, dur: 0, type: 'volume' });
      return;
    }
    if (tok === '>') {
      tokens.push({ text: tok, col, dur: 0, type: 'shift' });
      curOct = Math.min(9, curOct + 1);
      return;
    }
    if (tok === '<') {
      tokens.push({ text: tok, col, dur: 0, type: 'shift' });
      curOct = Math.max(0, curOct - 1);
      return;
    }

    if (lower.startsWith('r')) {
      const dur = lower.length > 1 ? mmlDivToCount(lower.slice(1)) : curLen;
      tokens.push({ text: tok, col, dur, type: 'rest' });
      col += dur;
      return;
    }

    if (lower.startsWith('[')) {
      const closeIdx = tok.indexOf(']');
      const durStr = tok.slice(closeIdx + 1);
      const dur = durStr ? mmlDivToCount(durStr) : curLen;
      tokens.push({ text: tok, col, dur, type: 'chord' });
      col += dur;
      return;
    }

    const noteMatch = lower.match(/([a-g])(\+)?(\d*\.?\d*)?/);
    if (noteMatch) {
      const explicitLenStr = noteMatch[3];
      const dur = explicitLenStr ? mmlDivToCount(explicitLenStr) : curLen;
      tokens.push({ text: tok, col, dur, type: 'note' });
      col += dur;
    }
  });

  return tokens;
}

function freqFromSemitone(s: number): number {
  return FREQ_C4 * Math.pow(2, (s - 60) / 12);
}

const DURATION_MAP = [
  { count: 16, div: '1' },
  { count: 12, div: '2.' },
  { count: 8, div: '2' },
  { count: 6, div: '4.' },
  { count: 4, div: '4' },
  { count: 3, div: '8.' },
  { count: 2, div: '8' },
  { count: 1, div: '16' },
];

function mmlDivToCount(s: string): number {
  const isDotted = s.endsWith('.');
  const numPart = isDotted ? s.slice(0, -1) : s;
  const num = parseInt(numPart, 10);
  if (isNaN(num) || num <= 0) return 4;
  const base = 16 / num;
  return isDotted ? Math.round(base * 1.5) : base;
}

function countToMmlDiv(count: number): string {
  let best = DURATION_MAP[0];
  let bestDiff = Math.abs(count - DURATION_MAP[0].count);
  for (const entry of DURATION_MAP) {
    const diff = Math.abs(count - entry.count);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = entry;
    }
  }
  return best.div;
}

// MML本文の開始マーカー。投稿コンポーザは `#MML作曲 <mml>`、旧seedは `#mml <mml>` を使う。
// 抽出・本文表示の双方でこの定義を共有し、マーカー不一致による埋め込み未認識を防ぐ。
export const MML_MARKERS = ['#mml', '#MML作曲'];
// 投稿本文から「埋め込みに置き換える」ために隠すマーカー（MML + コード）。
export const EMBED_TEXT_MARKERS = [...MML_MARKERS, '#chord'];

/** contentの中から「行頭がMMLマーカーの行」を探し、その行番号を返す(なければ-1)。 */
function findMmlLineIndex(lines: string[]): number {
  return lines.findIndex(line => {
    const trimmed = line.trim();
    return MML_MARKERS.some(m => trimmed.startsWith(m));
  });
}

// MML行は他の行と混在しうる（1行下に自由コメントが入る等）ため、
// マーカーが現れた行だけを対象に抽出・除去する。マーカー以降を全部飲み込まない。
export function extractMmlFromContent(content: string): string | null {
  const lines = content.split('\n');
  const idx = findMmlLineIndex(lines);
  if (idx === -1) return null;
  const line = lines[idx].trim();
  const marker = MML_MARKERS.find(m => line.startsWith(m))!;
  return line.slice(marker.length).trim();
}

/** MMLマーカー行だけを取り除いたcontentを返す。前後の自由コメント行は維持する。 */
export function stripMmlLine(content: string): string {
  const lines = content.split('\n');
  const idx = findMmlLineIndex(lines);
  if (idx === -1) return content;
  lines.splice(idx, 1);
  return lines.join('\n');
}

/**
 * 投稿本文の表示用テキストを生成する。
 * MML行は(前後の自由コメントを残したまま)行単位で除去し、
 * #chordは従来通りマーカー以降を丸ごと埋め込みに譲る。
 */
export function getDisplayContent(content: string): string {
  const withoutMml = stripMmlLine(content);
  const chordIdx = withoutMml.indexOf('#chord');
  const sliced = chordIdx >= 0 ? withoutMml.slice(0, chordIdx) : withoutMml;
  return sliced.trimEnd();
}

function parseSingleTrack(body: string): GridNote[] {
  const result: GridNote[] = [];
  let curOct = 4;
  let curLen = 4;
  let col = 0;

  const tokens = body.match(/l\d+\.?|o\d+|[<>]|\[[^\]]*\]\d+\.?\d*|r\d*\.?\d*|[a-g][+#]?\d*\.?\d*/gi) || [];

  const parseNote = (note: string): { semitone: number } | null => {
    const m = note.match(/o(\d+)([a-g])(\+)?/);
    if (!m) return null;
    const oct = parseInt(m[1]);
    const name = m[2].toUpperCase();
    const sharp = m[3] === '+';
    const idx = NOTE_NAMES.findIndex(n => n[0] === name);
    if (idx < 0) return null;
    return { semitone: (oct + 1) * 12 + idx + (sharp ? 1 : 0) };
  };

  tokens.forEach(tok => {
    const lower = tok.toLowerCase();
    if (lower.startsWith('l')) {
      curLen = mmlDivToCount(lower.slice(1));
      return;
    }
    if (lower.startsWith('o')) {
      curOct = parseInt(lower.slice(1)) || 4;
      return;
    }
    if (tok === '>') { curOct = Math.min(9, curOct + 1); return; }
    if (tok === '<') { curOct = Math.max(0, curOct - 1); return; }

    if (lower.startsWith('r')) {
      const dur = lower.length > 1 ? mmlDivToCount(lower.slice(1)) : curLen;
      col += dur;
      return;
    }

    if (lower.startsWith('[')) {
      const closeIdx = tok.indexOf(']');
      const inner = tok.slice(1, closeIdx);
      const durStr = tok.slice(closeIdx + 1);
      const dur = durStr ? mmlDivToCount(durStr) : curLen;
      const chordNotes = inner.match(/o\d+[a-g][+#]?/gi) || [];
      chordNotes.forEach(n => {
        const p = parseNote(n);
        if (p) {
          result.push({ row: p.semitone - PIANO_START, col, dur });
        }
      });
      col += dur;
      return;
    }

    const noteMatch = lower.match(/([a-g])(\+)?(\d+\.?\d*)?/);
    if (noteMatch) {
      const noteChar = noteMatch[1];
      const isSharp = noteMatch[2] === '+';
      const explicitLenStr = noteMatch[3];
      const dur = explicitLenStr ? mmlDivToCount(explicitLenStr) : curLen;
      const idx = NOTE_NAMES.findIndex(n => n[0].toLowerCase() === noteChar);
      if (idx >= 0) {
        const semitone = (curOct + 1) * 12 + idx + (isSharp ? 1 : 0);
        result.push({ row: semitone - PIANO_START, col, dur });
      }
      col += dur;
    }
  });

  return result;
}

export function generateMmlLine(notes: GridNote[]): string {
  const sorted = [...notes].sort((a, b) => a.col - b.col || a.row - b.row);
  const groups: { [col: number]: GridNote[] } = {};
  sorted.forEach(n => {
    if (!groups[n.col]) groups[n.col] = [];
    groups[n.col].push(n);
  });

  const cols = Object.keys(groups).map(Number).sort((a, b) => a - b);
  if (cols.length === 0) return '';

  const parts: string[] = [];
  let prevCol = 0;

  cols.forEach(col => {
    if (col > prevCol) {
      parts.push(`r${countToMmlDiv(col - prevCol)}`);
    }
    const group = groups[col].sort((a, b) => a.row - b.row);
    const noteStr = group.map(n => {
      const semitone = PIANO_START + n.row;
      const oct = Math.floor(semitone / 12) - 1;
      const idx = semitone % 12;
      const name = NOTE_NAMES[idx].toLowerCase().replace('#', '+');
      return `o${oct}${name}`;
    }).join('');
    const dur = group[0].dur;
    parts.push(`[${noteStr}]${countToMmlDiv(dur)}`);
    prevCol = col + dur;
  });

  return parts.join(' ');
}

export function mmlToNotes(mml: string): ParsedMml {
  const trimmed = mml.trim();
  if (!trimmed) return { tracks: [], tempo: 135 };

  if (trimmed.startsWith('@')) {
    const tracks: TrackData[] = [];
    let globalTempo = 135;
    const normalized = trimmed
      .replace(/\s*;\s*/g, ';')
      .replace(/\s+(?=@\d)/g, ';');
    const sections = normalized.match(/@\d+\s*(?:t\d+)?(?:\s*q\d+)?(?:\s*v\d+)?(?:[^;]*?)(?:;|$)/gi) || [];

    sections.forEach(section => {
      const idMatch = section.match(/@(\d+)/);
      if (!idMatch) return;
      const id = parseInt(idMatch[1]);
      const tempoMatch = section.match(/t(\d+)/);
      if (tempoMatch) {
        const parsedTempo = parseInt(tempoMatch[1], 10);
        if (parsedTempo > 0) globalTempo = parsedTempo;
      }
      const volMatch = section.match(/v(\d+)/);
      const vol = volMatch ? parseInt(volMatch[1]) : 100;

      const body = section
        .replace(/^@\d+\s*/, '')
        .replace(/t\d+\s*/g, '')
        .replace(/v\d+\s*/g, '')
        .replace(/q\d+\s*/g, '')
        .replace(/;$/, '')
        .trim();

      if (body) {
        const notes = parseSingleTrack(body);
        tracks.push({ id, notes, volume: vol });
      } else {
        tracks.push({ id, notes: [], volume: vol });
      }
    });

    return { tracks, tempo: globalTempo };
  }

  const tempM = mml.match(/t(\d+)/);
  let tempoVal = tempM ? parseInt(tempM[1], 10) : 135;
  if (isNaN(tempoVal) || tempoVal <= 0) tempoVal = 135;
  const cleanMml = mml.replace(/t\d+\s*/, '').trim();
  const notes = parseSingleTrack(cleanMml);
  return { tracks: [{ id: 0, notes, volume: 100 }], tempo: tempoVal };
}

export function playMml(
  tracks: TrackData[],
  tempo: number,
  onTick?: (col: number) => void,
  onDone?: () => void,
  totalCols?: number
): () => void {
  const ctx = new AudioContext();
  const safeTempo = (typeof tempo === 'number' && isFinite(tempo) && tempo > 0) ? tempo : 135;
  const beatSec = 60 / safeTempo;
  const tickSec = beatSec / 4;

  let allNotes: { col: number; dur: number; freq: number; vol: number }[] = [];
  let maxTicks = 0;

  tracks.forEach(t => {
    const trackVol = (typeof t.volume === 'number' && isFinite(t.volume)) ? t.volume : 100;
    t.notes.forEach(n => {
      const freq = freqFromSemitone(PIANO_START + n.row);
      const vol = trackVol / 100;
      allNotes.push({ col: n.col, dur: n.dur, freq, vol });
      const end = n.col + n.dur;
      if (end > maxTicks) maxTicks = end;
    });
  });

  if (allNotes.length === 0) {
    onDone?.();
    return () => {};
  }

  const totalDuration = (totalCols ?? maxTicks) * tickSec + 0.2;

  allNotes.forEach(n => {
    const t = n.col * tickSec;
    const dur = n.dur * tickSec;
    if (!isFinite(t) || !isFinite(dur) || isNaN(t) || isNaN(dur)) {
      return;
    }
    const safeFreq = (typeof n.freq === 'number' && isFinite(n.freq)) ? n.freq : 440;
    const safeVol = (typeof n.vol === 'number' && isFinite(n.vol)) ? n.vol : 1;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = safeFreq;
    gain.gain.setValueAtTime(0.06 * safeVol * 1.5, ctx.currentTime + t);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
    osc.start(ctx.currentTime + t);
    osc.stop(ctx.currentTime + t + dur + 0.02);
  });

  let stopped = false;
  let rafId: number | null = null;
  let timerId: number | null = null;
  const startTime = performance.now();

  const animate = () => {
    if (stopped) return;
    const elapsed = (performance.now() - startTime) / 1000;
    const currentCol = Math.floor(elapsed / tickSec);
    onTick?.(currentCol);
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
