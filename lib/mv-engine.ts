// MVの描画エンジン。DOM非依存（Canvas2Dコンテキストだけ受け取る）純粋な描画関数群。
//
// 時間の出どころは1つだけ: @onjmin/dtm の再生ステップ。拍位相・ビジュアライザ・歌詞のすべてが
// ノートデータから導出されるので、音とズレる余地が無い。
//
// 画像の読み込み・コマ送りは lib/walk-sprite.ts の基盤をそのまま使う（2Dゲームエンジン側と
// 実装を二重化しない）。

import {
  MV_W,
  MV_H,
  MV_STEPS_PER_BAR,
  MV_STEPS_PER_BEAT,
  isLayerVisible,
  sectionAtBar,
  type MvAnchor,
  type MvImageLayer,
  type MvLayer,
  type MvLyricLine,
  type MvLyricsLayer,
  type MvManifest,
  type MvMotion,
  type MvTextLayer,
  type MvVisualizerLayer,
} from './mv-config';
import { imageRefToUrl } from './asset-ref';
import {
  animatedCellInRect,
  detectStandard,
  loadImage,
  peekImage,
  standardById,
  type SpriteRect,
  type WalkStandard,
} from './walk-sprite';

// ───────────────── 楽曲の解析 ─────────────────

export interface MvNote {
  /** MMLの @n（トラックID） */
  track: number;
  startStep: number;
  durationSteps: number;
  pitch: number;
  /** 0-127 */
  velocity: number;
}

export interface MvSong {
  bpm: number;
  /** 曲全体の長さ（ステップ） */
  totalSteps: number;
  totalBars: number;
  notes: MvNote[];
  /** 登場するトラックID（昇順） */
  tracks: number[];
  pitchMin: number;
  pitchMax: number;
  /** MMLの歌詞トラック(@@n)から導出した行。無ければ空。 */
  lyricLines: MvLyricLine[];
  /** 歌詞が乗っていたトラックID */
  lyricTrackIds: number[];
}

export const EMPTY_SONG: MvSong = {
  bpm: 120,
  totalSteps: 0,
  totalBars: 0,
  notes: [],
  tracks: [],
  pitchMin: 48,
  pitchMax: 72,
  lyricLines: [],
  lyricTrackIds: [],
};

const songCache = new Map<string, MvSong>();

/**
 * MML文字列を解析してMV描画用のノートデータへ変換する。
 * @onjmin/dtm は動的インポート必須（静的インポートはEdge/サーバー評価時にクラッシュする）。
 */
export async function parseMvSong(mml: string): Promise<MvSong> {
  const key = mml.trim();
  if (!key) return EMPTY_SONG;
  const cached = songCache.get(key);
  if (cached) return cached;

  let song: MvSong = EMPTY_SONG;
  try {
    const dtm = await import('@onjmin/dtm');
    const cleaned = dtm.stripCustomVocals(key);
    const parsed = dtm.parseMML(cleaned, { collectLyrics: true });

    const notes: MvNote[] = parsed.placements
      .map(p => ({
        track: p.trackIndex,
        startStep: p.startStep,
        durationSteps: Math.max(1, p.durationSteps),
        pitch: p.pitch,
        velocity: p.velocity ?? 100,
      }))
      .sort((a, b) => a.startStep - b.startStep);

    const tracks = [...new Set(notes.map(n => n.track))].sort((a, b) => a - b);
    let pitchMin = Infinity;
    let pitchMax = -Infinity;
    let totalSteps = 0;
    for (const n of notes) {
      if (n.pitch < pitchMin) pitchMin = n.pitch;
      if (n.pitch > pitchMax) pitchMax = n.pitch;
      const end = n.startStep + n.durationSteps;
      if (end > totalSteps) totalSteps = end;
    }
    if (!isFinite(pitchMin)) { pitchMin = 48; pitchMax = 72; }
    // 音域が狭すぎると帯が潰れるので最低1オクターブ確保する
    if (pitchMax - pitchMin < 12) {
      const mid = (pitchMax + pitchMin) / 2;
      pitchMin = Math.round(mid - 6);
      pitchMax = Math.round(mid + 6);
    }

    const lyricMap = parsed.lyrics && parsed.lyrics.size > 0 ? parsed.lyrics : dtm.parseLyrics(cleaned);
    const lyricLines: MvLyricLine[] = [];
    const lyricTrackIds: number[] = [];
    lyricMap?.forEach(track => {
      const lines = lyricLinesFromTrack(track.trackId, track.syllables, track.lineBreaks, notes);
      if (lines.length > 0) {
        lyricTrackIds.push(track.trackId);
        lyricLines.push(...lines);
      }
    });
    lyricLines.sort((a, b) => a.bar - b.bar);

    song = {
      bpm: parsed.bpm ?? 120,
      totalSteps,
      totalBars: Math.ceil(totalSteps / MV_STEPS_PER_BAR),
      notes,
      tracks,
      pitchMin,
      pitchMax,
      lyricLines,
      lyricTrackIds,
    };
  } catch (e) {
    console.error('[mv-engine] failed to parse mml', e);
  }

  songCache.set(key, song);
  return song;
}

/**
 * 歌詞トラックの音節列を「行」へまとめ、各行の開始小節を演奏ノートから求める。
 *
 * 音節と演奏ノートは同じトラックIDで1:1に対応する前提（@onjmin/dtm の歌唱合成と同じ割り当て）。
 * lineBreaks が無い＝1行で書かれた歌詞は、長いと画面に収まらないので一定文字数で折る。
 */
function lyricLinesFromTrack(
  trackId: number,
  syllables: { kana: string }[],
  lineBreaks: number[] | undefined,
  notes: MvNote[],
): MvLyricLine[] {
  if (!syllables || syllables.length === 0) return [];
  const trackNotes = notes.filter(n => n.track === trackId);
  if (trackNotes.length === 0) return [];

  const breaks = new Set(lineBreaks ?? []);
  const SOFT_WRAP = 12;
  const useSoftWrap = breaks.size === 0 && syllables.length > SOFT_WRAP * 1.5;

  const lines: MvLyricLine[] = [];
  let text = '';
  let startStep: number | null = null;

  const flush = () => {
    if (text && startStep !== null) lines.push({ bar: startStep / MV_STEPS_PER_BAR, text });
    text = '';
    startStep = null;
  };

  syllables.forEach((syl, i) => {
    if (i > 0 && (breaks.has(i) || (useSoftWrap && i % SOFT_WRAP === 0))) flush();
    if (startStep === null) startStep = trackNotes[Math.min(i, trackNotes.length - 1)].startStep;
    text += syl.kana;
  });
  flush();

  return lines;
}

// ───────────────── 画像の先読み ─────────────────

/** manifest が参照する画像URLを列挙する（未解決の post: 参照は除く）。 */
export function collectMvImageUrls(manifest: MvManifest): string[] {
  const urls: string[] = [];
  const push = (u?: string | null) => { if (u) urls.push(u); };
  push(manifest.stage.bgUrl ?? (manifest.stage.bgRef ? imageRefToUrl(manifest.stage.bgRef) : null));
  for (const layer of manifest.layers) {
    if (layer.kind === 'image') push(layerImageUrl(layer));
  }
  return [...new Set(urls)];
}

/** manifest の画像を全部読み込む。失敗した画像は無視して他を待つ。 */
export async function preloadMvImages(manifest: MvManifest): Promise<void> {
  await Promise.all(collectMvImageUrls(manifest).map(u => loadImage(u).catch(() => null)));
}

function layerImageUrl(layer: MvImageLayer): string | null {
  return layer.url ?? imageRefToUrl(layer.ref);
}

// ───────────────── フレーム状態 ─────────────────

export interface MvFrameState {
  /** 音声クロック由来の再生ステップ（小数可）。 */
  step: number;
  /** 再生開始からの経過秒。時間ベースの動き(drift/zoom)に使う。 */
  timeSec: number;
}

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  manifest: MvManifest;
  song: MvSong;
  step: number;
  timeSec: number;
  bar: number;
  /** 拍の頭で1、次の拍の直前で0になる減衰エンベロープ */
  beatEnv: number;
  /** 小節の頭で1、小節末で0 */
  barEnv: number;
  sectionId: string | null;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 音符の頭で立ち上がり減衰する、拍単位のエンベロープ。 */
function envelope(step: number, period: number, curve = 2): number {
  if (period <= 0) return 0;
  const phase = ((step % period) + period) % period;
  return clamp01(Math.pow(1 - phase / period, curve));
}

// ───────────────── 1フレーム描画 ─────────────────

/**
 * MVの1フレームを描画する。ctx は論理解像度 MV_W×MV_H の座標系であること。
 * 画像は preloadMvImages 済み前提（未ロードのものは黙って飛ばす）。
 */
export function drawMvFrame(
  ctx: CanvasRenderingContext2D,
  manifest: MvManifest,
  song: MvSong,
  frame: MvFrameState,
): void {
  const step = Math.max(0, frame.step);
  const bar = step / MV_STEPS_PER_BAR;
  const section = sectionAtBar(manifest.sections, bar);

  const d: DrawCtx = {
    ctx,
    manifest,
    song,
    step,
    timeSec: frame.timeSec,
    bar,
    beatEnv: envelope(step, MV_STEPS_PER_BEAT),
    barEnv: envelope(step, MV_STEPS_PER_BAR),
    sectionId: section?.id ?? null,
  };

  ctx.save();
  ctx.clearRect(0, 0, MV_W, MV_H);
  drawStage(d);

  const layers = [...manifest.layers]
    .filter(l => isLayerVisible(l, d.sectionId))
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  for (const layer of layers) {
    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1;
    drawLayer(d, layer);
    ctx.restore();
  }
  ctx.restore();
}

// ───────────────── 背景 ─────────────────

function drawStage(d: DrawCtx): void {
  const { ctx, manifest } = d;
  const stage = manifest.stage;

  ctx.fillStyle = stage.bgColor || '#000000';
  ctx.fillRect(0, 0, MV_W, MV_H);

  // 呼吸するラジアルグラデ（C.mp4 の骨格）。拍で中心が明るくなる。
  if (stage.pulse === 'breathe') {
    const glow = 0.55 + 0.45 * d.beatEnv;
    const r = MV_H * (0.45 + 0.25 * d.beatEnv);
    const g = ctx.createRadialGradient(MV_W / 2, MV_H / 2, 0, MV_W / 2, MV_H / 2, r);
    const tint = stage.palette[0] ?? '#7dd3fc';
    g.addColorStop(0, withAlpha(tint, 0.28 * glow));
    g.addColorStop(0.6, withAlpha(tint, 0.1 * glow));
    g.addColorStop(1, withAlpha(tint, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, MV_W, MV_H);
  }

  const bgUrl = stage.bgUrl ?? (stage.bgRef ? imageRefToUrl(stage.bgRef) : null);
  const img = bgUrl ? peekImage(bgUrl) : undefined;
  if (img && img.naturalWidth > 0) {
    drawFitted(ctx, img, stage.bgFit);
  }

  if (stage.bgDim && stage.bgDim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${clamp01(stage.bgDim)})`;
    ctx.fillRect(0, 0, MV_W, MV_H);
  }

  // 小節頭のフラッシュ（反転の代わりに白を薄く重ねる）
  if (stage.pulse === 'flash') {
    const a = 0.35 * Math.pow(d.barEnv, 3);
    if (a > 0.004) {
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, MV_W, MV_H);
    }
  }
}

function drawFitted(ctx: CanvasRenderingContext2D, img: HTMLImageElement, fit: string): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (fit === 'tile') {
    const pattern = ctx.createPattern(img, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, MV_W, MV_H);
    }
    return;
  }
  const scale = fit === 'contain'
    ? Math.min(MV_W / iw, MV_H / ih)
    : Math.max(MV_W / iw, MV_H / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, (MV_W - w) / 2, (MV_H - h) / 2, w, h);
}

// ───────────────── レイヤー分岐 ─────────────────

function drawLayer(d: DrawCtx, layer: MvLayer): void {
  switch (layer.kind) {
    case 'image': drawImageLayer(d, layer); break;
    case 'text': drawTextLayer(d, layer); break;
    case 'visualizer': drawVisualizer(d, layer); break;
    case 'lyrics': drawLyrics(d, layer); break;
  }
}

// ───────────────── 動き ─────────────────

interface MotionResult { dx: number; dy: number; scale: number; }

function applyMotion(d: DrawCtx, motion: MvMotion, amount: number, width: number): MotionResult {
  switch (motion) {
    case 'bob':
      return { dx: 0, dy: Math.sin(d.timeSec * 1.6) * amount, scale: 1 };
    case 'drift': {
      // 画面幅＋自分の幅を1周期として横へ流す（端で反対側から出てくる）
      const span = MV_W + width;
      const travel = ((d.timeSec * amount) % span + span) % span;
      return { dx: travel - (MV_W + width) / 2, dy: Math.sin(d.timeSec * 0.7) * amount * 0.04, scale: 1 };
    }
    case 'parallax':
      return { dx: Math.sin(d.bar * Math.PI) * amount, dy: 0, scale: 1 };
    case 'zoom':
      return { dx: 0, dy: 0, scale: 1 + (d.timeSec / 60) * amount };
    case 'beatScale':
      return { dx: 0, dy: 0, scale: 1 + amount * d.beatEnv };
    default:
      return { dx: 0, dy: 0, scale: 1 };
  }
}

function anchorOffset(anchor: MvAnchor, w: number, h: number): [number, number] {
  const map: Record<MvAnchor, [number, number]> = {
    topLeft: [0, 0],
    top: [-w / 2, 0],
    topRight: [-w, 0],
    left: [0, -h / 2],
    center: [-w / 2, -h / 2],
    right: [-w, -h / 2],
    bottomLeft: [0, -h],
    bottom: [-w / 2, -h],
    bottomRight: [-w, -h],
  };
  return map[anchor] ?? [0, 0];
}

// ───────────────── 画像レイヤー ─────────────────

function walkStandardFor(walk: NonNullable<MvImageLayer['walk']>, w: number, h: number): WalkStandard {
  let std = walk.stdId === 'auto' ? detectStandard(w, h) : standardById(walk.stdId);
  if (walk.stdId === 'auto' && walk.frames && walk.frames > 0) std = { ...std, frames: walk.frames };
  return std;
}

function drawImageLayer(d: DrawCtx, layer: MvImageLayer): void {
  const url = layerImageUrl(layer);
  if (!url) return;
  const img = peekImage(url);
  if (!img || img.naturalWidth === 0) return;

  const { ctx } = d;

  // 切り出し矩形（歩行グラならコマ送り、それ以外は画像全体）
  let src: SpriteRect = { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
  if (layer.walk) {
    const crop = layer.walk.crop ?? [0, 0, img.naturalWidth, img.naturalHeight];
    const std = walkStandardFor(layer.walk, crop[2], crop[3]);
    src = animatedCellInRect(std, crop, {
      dir: layer.walk.dir ?? 's',
      moving: true,
      timeSec: d.timeSec,
      fps: layer.walk.fps ?? 6,
      row: layer.walk.row,
    });
  }

  const scale = layer.scale || 1;
  const baseW = src.sw * scale;
  const baseH = src.sh * scale;
  const motion = applyMotion(d, layer.motion, layer.motionAmount ?? 0, baseW);
  const w = baseW * motion.scale;
  const h = baseH * motion.scale;
  const [ax, ay] = anchorOffset(layer.anchor, w, h);
  const x = layer.x + ax + motion.dx;
  const y = layer.y + ay + motion.dy;

  if (layer.frame) {
    const p = layer.frame.padding;
    ctx.strokeStyle = layer.frame.color;
    ctx.lineWidth = layer.frame.width;
    ctx.strokeRect(
      Math.round(x - p) + 0.5,
      Math.round(y - p) + 0.5,
      Math.round(w + p * 2),
      Math.round(h + p * 2),
    );
  }

  const prevSmoothing = ctx.imageSmoothingEnabled;
  if (layer.pixelated) ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, src.sx, src.sy, src.sw, src.sh, x, y, w, h);
  ctx.imageSmoothingEnabled = prevSmoothing;
}

// ───────────────── テキストレイヤー ─────────────────

const FONT_STACK = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';

function drawTextLayer(d: DrawCtx, layer: MvTextLayer): void {
  const { ctx } = d;
  const motion = applyMotion(d, layer.motion, layer.motionAmount ?? 0, layer.size);
  const size = layer.size * motion.scale;
  ctx.font = `${layer.bold ? 'bold ' : ''}${size}px ${FONT_STACK}`;
  ctx.fillStyle = layer.color;
  ctx.textBaseline = 'top';

  if (layer.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = Math.max(2, size * 0.25);
  }

  const lines = layer.text.split('\n');
  if (layer.vertical) {
    lines.forEach((line, li) => {
      const h = line.length * size * 1.05;
      const [ax, ay] = anchorOffset(layer.anchor, size, h);
      const x = layer.x + ax + motion.dx - li * size * 1.6;
      let y = layer.y + ay + motion.dy;
      for (const ch of line) {
        ctx.fillText(ch, x, y);
        y += size * 1.05;
      }
    });
  } else {
    const w = Math.max(...lines.map(l => ctx.measureText(l).width));
    const h = lines.length * size * 1.25;
    const [ax, ay] = anchorOffset(layer.anchor, w, h);
    lines.forEach((line, li) => {
      ctx.fillText(line, layer.x + ax + motion.dx, layer.y + ay + motion.dy + li * size * 1.25);
    });
  }
  ctx.shadowBlur = 0;
}

// ───────────────── 歌詞 ─────────────────

export function resolveLyricLines(layer: MvLyricsLayer, song: MvSong): MvLyricLine[] {
  if (layer.source === 'manual') return [...(layer.lines ?? [])].sort((a, b) => a.bar - b.bar);
  if (layer.trackId === undefined) return song.lyricLines;
  // 対象トラックが指定されていても、行データ自体はトラック混在で持っているため
  // ここでは絞り込まず全行を使う（歌詞トラックが複数ある曲は稀）。
  return song.lyricLines;
}

function drawLyrics(d: DrawCtx, layer: MvLyricsLayer): void {
  const { ctx } = d;
  const lines = resolveLyricLines(layer, d.song);
  if (lines.length === 0) return;

  const hold = layer.holdBars ?? 2;
  // いま表示中の行 = 開始小節を過ぎていて、まだ hold 小節以内のもの
  const activeIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].bar <= d.bar && d.bar - lines[i].bar < hold) activeIdx.push(i);
  }
  if (activeIdx.length === 0) return;

  // 最新の行を先頭に、残像段数ぶんだけ古い行を薄く残す
  const shown = activeIdx.slice(-(layer.afterimage + 1)).reverse();
  const size = layer.size;

  ctx.textBaseline = 'top';
  ctx.font = `bold ${size}px ${FONT_STACK}`;

  shown.forEach((idx, depth) => {
    const line = lines[idx];
    const age = d.bar - line.bar;
    // 出だしは 1/8 小節でフェードイン、終わりぎわは 1/2 小節でフェードアウト
    const fadeIn = clamp01(age / 0.125);
    const fadeOut = clamp01((hold - age) / 0.5);
    const depthFade = depth === 0 ? 1 : 0.28 / depth;
    const alpha = fadeIn * fadeOut * depthFade;
    if (alpha <= 0.01) return;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = layer.color;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = size * 0.4;

    if (layer.vertical) {
      const h = line.text.length * size * 1.08;
      const [ax, ay] = anchorOffset(layer.anchor, size, h);
      // 新しい行が左、古い行が右へ流れていく（日本語縦書きの並び）
      const x = layer.x + ax + depth * size * 1.7;
      let y = layer.y + ay;
      for (const ch of line.text) {
        ctx.fillText(ch, x, y);
        y += size * 1.08;
      }
    } else {
      const w = ctx.measureText(line.text).width;
      const [ax, ay] = anchorOffset(layer.anchor, w, size);
      ctx.fillText(line.text, layer.x + ax, layer.y + ay - depth * size * 1.35);
    }
  });

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// ───────────────── ビジュアライザ ─────────────────

function trackColor(d: DrawCtx, track: number): string {
  const palette = d.manifest.stage.palette;
  if (palette.length === 0) return '#ffffff';
  const idx = d.song.tracks.indexOf(track);
  return palette[(idx >= 0 ? idx : track) % palette.length];
}

function notesForLayer(d: DrawCtx, layer: MvVisualizerLayer): MvNote[] {
  if (!layer.tracks || layer.tracks.length === 0) return d.song.notes;
  const set = new Set(layer.tracks);
  return d.song.notes.filter(n => set.has(n.track));
}

function drawVisualizer(d: DrawCtx, layer: MvVisualizerLayer): void {
  switch (layer.style) {
    case 'pianoRoll': drawPianoRoll(d, layer); break;
    case 'stepGrid': drawStepGrid(d, layer); break;
    case 'rings': drawRings(d, layer); break;
    case 'bars': drawBars(d, layer); break;
  }
}

/** 横スクロールのピアノロール。再生位置は帯の左から25%に固定し、右から左へ流れる。 */
function drawPianoRoll(d: DrawCtx, layer: MvVisualizerLayer): void {
  const { ctx, song } = d;
  const { x, y, w, h } = layer.rect;
  const windowBars = layer.amount ?? 4;
  const windowSteps = windowBars * MV_STEPS_PER_BAR;
  const playheadRatio = 0.25;
  const from = d.step - windowSteps * playheadRatio;
  const to = from + windowSteps;

  const pitchRange = Math.max(1, song.pitchMax - song.pitchMin);
  const noteH = Math.max(1.5, h / (pitchRange + 1));
  const notes = notesForLayer(d, layer);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  for (const n of notes) {
    const end = n.startStep + n.durationSteps;
    if (end < from || n.startStep > to) continue;
    const nx = x + ((n.startStep - from) / windowSteps) * w;
    const nw = Math.max(2, (n.durationSteps / windowSteps) * w);
    const ny = y + h - ((n.pitch - song.pitchMin) / pitchRange) * (h - noteH) - noteH;
    const sounding = n.startStep <= d.step && end > d.step;
    ctx.globalAlpha = sounding ? 1 : 0.72;
    ctx.fillStyle = trackColor(d, n.track);
    if (sounding && layer.glow) {
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
    }
    ctx.fillRect(nx, ny, nw, noteH);
    ctx.shadowBlur = 0;
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * ステップシーケンサ格子。1小節を amount 分割し、トラックごとに1行のマスを並べる。
 * ノートの頭があるマスが点灯し、いま通過中の列は枠が光る。
 */
function drawStepGrid(d: DrawCtx, layer: MvVisualizerLayer): void {
  const { ctx, song } = d;
  const { x, y, w, h } = layer.rect;
  const cols = layer.amount ?? 16;
  const tracks = layer.tracks && layer.tracks.length > 0 ? layer.tracks : song.tracks.slice(0, 2);
  const rows = Math.max(1, tracks.length);
  const cellW = w / cols;
  const cellH = h / rows;
  const stepsPerCol = MV_STEPS_PER_BAR / cols;
  const barIndex = Math.floor(d.bar);
  const barStart = barIndex * MV_STEPS_PER_BAR;
  const currentCol = Math.floor((d.step - barStart) / stepsPerCol);
  const gap = layer.thickness ?? 1;

  for (let r = 0; r < rows; r++) {
    const track = tracks[r];
    const color = trackColor(d, track);
    for (let c = 0; c < cols; c++) {
      const cx = x + c * cellW;
      const cy = y + r * cellH;
      const colStart = barStart + c * stepsPerCol;
      const hit = song.notes.some(
        n => n.track === track && n.startStep >= colStart && n.startStep < colStart + stepsPerCol,
      );

      // 空きマスの罫線
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(cx) + 0.5, Math.round(cy) + 0.5, Math.round(cellW - gap), Math.round(cellH - gap));

      if (hit) {
        const active = c === currentCol;
        ctx.globalAlpha = active ? 1 : 0.55;
        ctx.fillStyle = color;
        ctx.fillRect(cx + gap, cy + gap, cellW - gap * 2, cellH - gap * 2);
        // 点灯マスの中に抜きの四角を入れて、サンプル動画のアイコン感を出す
        ctx.globalAlpha = active ? 0.9 : 0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        const inset = Math.min(cellW, cellH) * 0.28;
        ctx.fillRect(cx + inset, cy + inset, cellW - inset * 2, cellH - inset * 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  // 現在の列
  if (currentCol >= 0 && currentCol < cols) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(Math.round(x + currentCol * cellW) + 0.5, Math.round(y) + 0.5, Math.round(cellW), Math.round(h));
  }
}

/** ノートの頭ごとに同心円を放出する。C.mp4 の波紋。 */
function drawRings(d: DrawCtx, layer: MvVisualizerLayer): void {
  const { ctx } = d;
  const { x, y, w, h } = layer.rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const maxR = Math.max(w, h) * 0.62;
  const lifeSteps = MV_STEPS_PER_BAR * 1.5;
  const maxRings = layer.amount ?? 6;
  const notes = notesForLayer(d, layer);

  // 直近に鳴ったノートだけを見る（曲頭から全部走査しない）
  const recent: MvNote[] = [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    if (n.startStep > d.step) continue;
    if (d.step - n.startStep > lifeSteps) break;
    recent.push(n);
    if (recent.length >= maxRings) break;
  }

  ctx.lineWidth = layer.thickness ?? 1.5;
  for (const n of recent) {
    const age = (d.step - n.startStep) / lifeSteps;
    const r = maxR * Math.pow(age, 0.65);
    const alpha = (1 - age) * 0.75;
    if (r <= 0.5 || alpha <= 0.01) continue;
    ctx.strokeStyle = withAlpha(trackColor(d, n.track), alpha);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 中心の芯（鳴っている間だけ膨らむ）
  const core = 4 + 10 * d.beatEnv;
  ctx.fillStyle = withAlpha('#ffffff', 0.25 + 0.6 * d.beatEnv);
  ctx.beginPath();
  ctx.arc(cx, cy, core, 0, Math.PI * 2);
  ctx.fill();
}

/** 音域を amount 本の帯に割り、鳴っているノートの強さを高さにする。 */
function drawBars(d: DrawCtx, layer: MvVisualizerLayer): void {
  const { ctx, song } = d;
  const { x, y, w, h } = layer.rect;
  const count = layer.amount ?? 16;
  const notes = notesForLayer(d, layer);
  const levels = new Array<number>(count).fill(0);
  const range = Math.max(1, song.pitchMax - song.pitchMin);

  for (const n of notes) {
    if (n.startStep > d.step || n.startStep + n.durationSteps <= d.step) continue;
    const band = Math.min(count - 1, Math.max(0, Math.floor(((n.pitch - song.pitchMin) / range) * count)));
    const decay = clamp01(1 - (d.step - n.startStep) / Math.max(1, n.durationSteps));
    levels[band] = Math.max(levels[band], (n.velocity / 127) * (0.45 + 0.55 * decay));
  }

  const barW = w / count;
  const gap = layer.thickness ?? 2;
  for (let i = 0; i < count; i++) {
    const level = levels[i];
    if (level <= 0.01) continue;
    const bh = h * level;
    ctx.fillStyle = d.manifest.stage.palette[i % Math.max(1, d.manifest.stage.palette.length)] ?? '#ffffff';
    ctx.fillRect(x + i * barW + gap / 2, y + h - bh, barW - gap, bh);
  }
}

// ───────────────── 色ユーティリティ ─────────────────

/** #rgb / #rrggbb / rgb() を alpha 付き rgba() へ。解釈できなければそのまま返す。 */
export function withAlpha(color: string, alpha: number): string {
  const a = clamp01(alpha);
  if (!color) return `rgba(255,255,255,${a})`;
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    if (full.length >= 6) {
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return `rgba(${r},${g},${b},${a})`;
    }
  }
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  return color;
}
