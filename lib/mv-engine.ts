// MVの描画エンジン。DOM非依存（Canvas2Dコンテキストだけ受け取る）純粋な描画関数群。
//
// 時間の出どころは1つだけ: @onjmin/dtm の再生ステップ。拍位相・ビジュアライザ・歌詞・
// 図形モジュレータのすべてがノートデータから導出されるので、音とズレる余地が無い。
//
// 画像の読み込み・コマ送りは lib/walk-sprite.ts の基盤をそのまま使う（2Dゲームエンジン側と
// 実装を二重化しない）。

import {
  DEFAULT_MV_RING,
  DEFAULT_MV_VIEW,
  MV_BLEND_COMPOSITE,
  MV_DEGREE_HUE,
  MV_H,
  chordDegree,
  MV_STEPS_PER_BAR,
  MV_STEPS_PER_BEAT,
  MV_W,
  isLayerVisible,
  sectionAtBar,
  type MvAnchor,
  type MvChordBarLayer,
  type MvEffectLayer,
  type MvImageLayer,
  type MvLayer,
  type MvLyricLine,
  type MvLyricsLayer,
  type MvManifest,
  type MvModOp,
  type MvModTarget,
  type MvModulator,
  type MvMotion,
  type MvRect,
  type MvRing,
  type MvSection,
  type MvShapeLayer,
  type MvTextLayer,
  type MvView,
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
  /** startStep 昇順 */
  notes: MvNote[];
  /** トラックID → そのトラックのノート（startStep 昇順） */
  byTrack: Map<number, MvNote[]>;
  /** 登場するトラックID（昇順） */
  tracks: number[];
  pitchMin: number;
  pitchMax: number;
  /** MMLの歌詞トラック(@@n)から導出した行。trackId 付き。 */
  lyricLines: MvLyricLine[];
  /** 歌詞が乗っていたトラックID（昇順） */
  lyricTrackIds: number[];
}

export const EMPTY_SONG: MvSong = {
  bpm: 120,
  totalSteps: 0,
  totalBars: 0,
  notes: [],
  byTrack: new Map(),
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

    const byTrack = new Map<number, MvNote[]>();
    for (const n of notes) {
      const list = byTrack.get(n.track);
      if (list) list.push(n);
      else byTrack.set(n.track, [n]);
    }

    const tracks = [...byTrack.keys()].sort((a, b) => a - b);
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

    // 歌詞は parseLyrics と同じ Map<trackId, LyricTrack> を辿る。
    // どのトラックを画面に出すかはレイヤー側（MvLyricsLayer.trackId）で選ぶので、
    // ここでは全トラックぶんを trackId 付きで持っておく。
    const lyricMap = parsed.lyrics && parsed.lyrics.size > 0 ? parsed.lyrics : dtm.parseLyrics(cleaned);
    const lyricLines: MvLyricLine[] = [];
    const lyricTrackIds: number[] = [];
    lyricMap?.forEach(track => {
      const lines = lyricLinesFromTrack(track.trackId, track.syllables, track.lineBreaks, byTrack.get(track.trackId) ?? []);
      if (lines.length > 0) {
        lyricTrackIds.push(track.trackId);
        lyricLines.push(...lines);
      }
    });
    lyricTrackIds.sort((a, b) => a - b);
    lyricLines.sort((a, b) => a.bar - b.bar);

    song = {
      bpm: parsed.bpm ?? 120,
      totalSteps,
      totalBars: Math.ceil(totalSteps / MV_STEPS_PER_BAR),
      notes,
      byTrack,
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
  trackNotes: MvNote[],
): MvLyricLine[] {
  if (!syllables || syllables.length === 0 || trackNotes.length === 0) return [];

  const breaks = new Set(lineBreaks ?? []);
  const SOFT_WRAP = 12;
  const useSoftWrap = breaks.size === 0 && syllables.length > SOFT_WRAP * 1.5;

  const lines: MvLyricLine[] = [];
  let text = '';
  let startStep: number | null = null;

  const flush = () => {
    if (text && startStep !== null) lines.push({ bar: startStep / MV_STEPS_PER_BAR, text, trackId });
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
  section: MvSection | null;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const DEG = Math.PI / 180;

/** 音符の頭で立ち上がり減衰する、拍単位のエンベロープ。 */
function envelope(step: number, period: number, curve = 2): number {
  if (period <= 0) return 0;
  const phase = ((step % period) + period) % period;
  return clamp01(Math.pow(1 - phase / period, curve));
}

// ───────────────── トラックの鳴りを読む ─────────────────

/** 昇順配列で startStep <= step を満たす最後の要素の添字。無ければ -1。 */
function lastIndexAtOrBefore(list: MvNote[], step: number): number {
  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].startStep <= step) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

/** 対象トラックのノート列を返す。track 未指定なら全ノート。 */
function trackNotes(song: MvSong, track?: number): MvNote[] {
  if (track === undefined) return song.notes;
  return song.byTrack.get(track) ?? [];
}

/** 直近に鳴り始めた音からの減衰（0..1）。 */
function trackOnsetEnv(song: MvSong, step: number, track: number | undefined, decaySteps: number): number {
  const list = trackNotes(song, track);
  const idx = lastIndexAtOrBefore(list, step);
  if (idx < 0) return 0;
  const age = step - list[idx].startStep;
  if (age >= decaySteps) return 0;
  return clamp01(1 - age / decaySteps);
}

/** いま鳴っている音の強さの合計（0..1）。 */
function trackEnergy(song: MvSong, step: number, track: number | undefined): number {
  const list = trackNotes(song, track);
  const idx = lastIndexAtOrBefore(list, step);
  if (idx < 0) return 0;
  let sum = 0;
  // 長い音を取りこぼさないよう、直近64音ぶんだけ遡って重なりを見る
  for (let i = idx; i >= 0 && i > idx - 64; i--) {
    const n = list[i];
    const end = n.startStep + n.durationSteps;
    if (end <= step) continue;
    const life = clamp01(1 - (step - n.startStep) / Math.max(1, n.durationSteps));
    sum += (n.velocity / 127) * (0.4 + 0.6 * life);
  }
  return clamp01(sum);
}

/** いま鳴っている音の高さを曲の音域内 0..1 で返す。鳴っていなければ 0.5。 */
function trackPitchNorm(song: MvSong, step: number, track: number | undefined): number {
  const list = trackNotes(song, track);
  const idx = lastIndexAtOrBefore(list, step);
  if (idx < 0) return 0.5;
  const range = Math.max(1, song.pitchMax - song.pitchMin);
  return clamp01((list[idx].pitch - song.pitchMin) / range);
}

// ───────────────── モジュレータ ─────────────────

function modSourceValue(d: DrawCtx, m: MvModulator): number {
  switch (m.source) {
    case 'beat': return d.beatEnv;
    case 'bar': return d.barEnv;
    case 'time': return (d.timeSec % 1);
    case 'trackEnergy': return trackEnergy(d.song, d.step, m.track);
    case 'trackOnset': return trackOnsetEnv(d.song, d.step, m.track, MV_STEPS_PER_BEAT);
    case 'trackPitch': return trackPitchNorm(d.song, d.step, m.track);
    case 'constant': return 1;
    default: return 0;
  }
}

/** 割り算の分母の下限。これ未満に潰れると図形が画面いっぱいに膨れ上がるので頭打ちにする。 */
const MIN_DIVISOR = 0.05;

function applyOp(base: number, delta: number, op: MvModOp): number {
  switch (op) {
    case 'add': return base + delta;
    case 'sub': return base - delta;
    case 'mul': return base * delta;
    case 'div': {
      // 拍エンベロープのように0へ近づく値で割ると発散するため、分母を下限でクランプする。
      // （上限20倍まで。これ以上は「画面が真っ白」になるだけで演出として意味がない）
      const d = Math.abs(delta) < MIN_DIVISOR ? (delta < 0 ? -MIN_DIVISOR : MIN_DIVISOR) : delta;
      return base / d;
    }
    default: return base;
  }
}

/**
 * 基準値にモジュレータを順に適用する。
 * 「足す→掛ける→引く」のように重ねがけできるのが肝で、これが複雑な動きの素になる。
 */
function modulate(
  d: DrawCtx,
  mods: MvModulator[] | undefined,
  target: MvModTarget,
  base: number,
  /** 評価時刻をこのステップぶん巻き戻す（図形グループを1個ずつ遅らせる用）。 */
  delaySteps = 0,
): number {
  if (!mods || mods.length === 0) return base;
  const dd = delaySteps > 0 ? shiftCtx(d, delaySteps) : d;
  let v = base;
  for (const m of mods) {
    if (m.target !== target) continue;
    v = applyOp(v, modSourceValue(dd, m) * m.amount, m.op);
  }
  return v;
}

/** 評価時刻だけずらした DrawCtx を作る（描画には使わない、モジュレータ評価専用）。 */
function shiftCtx(d: DrawCtx, delaySteps: number): DrawCtx {
  const step = Math.max(0, d.step - delaySteps);
  const secPerStep = 60 / (d.song.bpm || 120) / MV_STEPS_PER_BEAT;
  return {
    ...d,
    step,
    bar: step / MV_STEPS_PER_BAR,
    timeSec: Math.max(0, d.timeSec - delaySteps * secPerStep),
    beatEnv: envelope(step, MV_STEPS_PER_BEAT),
    barEnv: envelope(step, MV_STEPS_PER_BAR),
  };
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
    section,
  };

  const visible = manifest.layers.filter(l => isLayerVisible(l, d.sectionId));
  const effects = visible.filter((l): l is MvEffectLayer => l.kind === 'effect');
  const drawables = visible
    .filter(l => l.kind !== 'effect')
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  ctx.save();
  ctx.clearRect(0, 0, MV_W, MV_H);

  // 画面ゆれ・ズームパンチは「フレーム全体の変形」なので、中身を描く前に掛ける
  const transform = frameTransform(d, effects);
  if (transform) {
    ctx.translate(MV_W / 2 + transform.dx, MV_H / 2 + transform.dy);
    ctx.scale(transform.scale, transform.scale);
    ctx.translate(-MV_W / 2, -MV_H / 2);
  }

  drawStage(d);

  for (const layer of drawables) {
    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1;
    drawLayer(d, layer);
    ctx.restore();
  }

  ctx.restore();

  // フラッシュ・色反転などは全部の上に重ねる（変形の影響を受けない）
  drawOverlayEffects(d, effects);
}

// ───────────────── 画面エフェクト ─────────────────

/** エフェクトの発火量 0..1。 */
function effectEnv(d: DrawCtx, fx: MvEffectLayer): number {
  const decaySteps = Math.max(1, (fx.decayBeats ?? 1) * MV_STEPS_PER_BEAT);
  switch (fx.trigger) {
    case 'always':
      return 1;
    case 'beat':
      return envelope(d.step, MV_STEPS_PER_BEAT, MV_STEPS_PER_BEAT / decaySteps);
    case 'bar':
      return envelope(d.step, MV_STEPS_PER_BAR, MV_STEPS_PER_BAR / decaySteps);
    case 'note': {
      if (!fx.tracks || fx.tracks.length === 0) return trackOnsetEnv(d.song, d.step, undefined, decaySteps);
      let best = 0;
      for (const t of fx.tracks) best = Math.max(best, trackOnsetEnv(d.song, d.step, t, decaySteps));
      return best;
    }
    case 'section': {
      if (!d.section) return 0;
      const age = (d.bar - d.section.startBar) * MV_STEPS_PER_BAR;
      if (age < 0 || age >= decaySteps) return 0;
      return clamp01(1 - age / decaySteps);
    }
    default:
      return 0;
  }
}

/** 画面ゆれ／ズームパンチをまとめて1つの変形にする。 */
function frameTransform(d: DrawCtx, effects: MvEffectLayer[]): { dx: number; dy: number; scale: number } | null {
  let dx = 0;
  let dy = 0;
  let scale = 1;
  let any = false;

  for (const fx of effects) {
    const env = effectEnv(d, fx) * clamp01(fx.amount);
    if (env <= 0.001) continue;
    if (fx.style === 'shake') {
      // 決まった揺れ方にならないよう、時間で位相をずらす
      const amp = env * 14;
      dx += Math.sin(d.timeSec * 97) * amp;
      dy += Math.cos(d.timeSec * 113) * amp;
      any = true;
    } else if (fx.style === 'zoomPunch') {
      scale *= 1 + env * 0.18;
      any = true;
    }
  }

  return any ? { dx, dy, scale } : null;
}

/** フラッシュ・反転・ストロボ・周辺減光を全レイヤーの上に重ねる。 */
function drawOverlayEffects(d: DrawCtx, effects: MvEffectLayer[]): void {
  const { ctx } = d;
  for (const fx of effects) {
    if (fx.style === 'shake' || fx.style === 'zoomPunch') continue;
    const env = effectEnv(d, fx) * clamp01(fx.amount);
    if (env <= 0.004) continue;

    ctx.save();
    switch (fx.style) {
      case 'flash':
        ctx.fillStyle = withAlpha(fx.color ?? '#ffffff', env);
        ctx.fillRect(0, 0, MV_W, MV_H);
        break;
      case 'invert':
        // difference に白を重ねると色が反転する。env でその途中まで持っていく。
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = withAlpha('#ffffff', env);
        ctx.fillRect(0, 0, MV_W, MV_H);
        break;
      case 'strobe': {
        // 拍を刻んで点滅する。decayBeats を周期として使う。
        const period = Math.max(1, (fx.decayBeats ?? 0.5) * MV_STEPS_PER_BEAT);
        const on = Math.floor(d.step / period) % 2 === 0;
        if (on) {
          ctx.fillStyle = withAlpha(fx.color ?? '#ffffff', env * 0.8);
          ctx.fillRect(0, 0, MV_W, MV_H);
        }
        break;
      }
      case 'vignette': {
        const g = ctx.createRadialGradient(MV_W / 2, MV_H / 2, MV_H * 0.25, MV_W / 2, MV_H / 2, MV_H * 0.78);
        g.addColorStop(0, withAlpha(fx.color ?? '#000000', 0));
        g.addColorStop(1, withAlpha(fx.color ?? '#000000', env));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, MV_W, MV_H);
        break;
      }
    }
    ctx.restore();
  }
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
    case 'shape': drawShapeLayer(d, layer); break;
    case 'chordBar': drawChordBar(d, layer); break;
    case 'effect': break; // エフェクトは drawMvFrame 側で別扱い
  }
}

// ───────────────── コード進行バー ─────────────────

/**
 * 画面下のコード進行バー。ブロックを小節位置で並べ、いま鳴っているコードを強調する。
 * 色は度数（キーからの音程）で決める。utau-kit の chord-progression-animation-tool と同じ考え方。
 */
function drawChordBar(d: DrawCtx, layer: MvChordBarLayer): void {
  const { ctx } = d;
  const { x, y, w, h } = layer.rect;
  const chords = [...layer.chords].sort((a, b) => a.bar - b.bar);
  if (chords.length === 0) return;

  const endBar = Math.max(d.song.totalBars, chords[chords.length - 1].bar + 1);
  const barToX = (b: number) => x + (b / endBar) * w;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // バーの下地
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);

  ctx.textBaseline = 'middle';
  ctx.font = `${layer.size}px ${FONT_STACK}`;

  for (let i = 0; i < chords.length; i++) {
    const c = chords[i];
    const nextBar = i + 1 < chords.length ? chords[i + 1].bar : endBar;
    const bx = barToX(c.bar);
    const bw = Math.max(1, barToX(nextBar) - bx);
    const active = d.bar >= c.bar && d.bar < nextBar;

    let fill: string;
    if (active) {
      fill = layer.activeColor;
    } else if (layer.colorMode === 'degree') {
      const deg = chordDegree(c.label, layer.key);
      // スケール外のコードは彩度を落として区別する
      fill = deg === null
        ? 'hsl(0, 0%, 22%)'
        : `hsl(${MV_DEGREE_HUE[deg]}, 45%, 24%)`;
    } else {
      fill = layer.color;
    }

    ctx.fillStyle = fill;
    ctx.fillRect(bx, y, bw - 1, h);

    ctx.fillStyle = layer.textColor;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, y, bw - 2, h);
    ctx.clip();
    ctx.fillText(c.label, bx + 3, y + h / 2);
    ctx.restore();
  }

  ctx.restore();
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
  const motion = applyMotion(d, layer.motion, layer.motionAmount ?? 0, src.sw * scale);
  const rep = layer.repeat;
  const copies = Math.max(1, Math.min(64, Math.round(rep?.count ?? 1)));
  const baseAlpha = ctx.globalAlpha;

  const prevSmoothing = ctx.imageSmoothingEnabled;
  if (layer.pixelated) ctx.imageSmoothingEnabled = false;

  for (let i = 0; i < copies; i++) {
    // 2体目以降は歩行アニメの位相をずらして、群れがそろって足踏みしないようにする
    let frameSrc = src;
    if (layer.walk && rep?.phase) {
      const crop = layer.walk.crop ?? [0, 0, img.naturalWidth, img.naturalHeight];
      const std = walkStandardFor(layer.walk, crop[2], crop[3]);
      frameSrc = animatedCellInRect(std, crop, {
        dir: layer.walk.dir ?? 's',
        moving: true,
        timeSec: d.timeSec + rep.phase * i,
        fps: layer.walk.fps ?? 6,
        row: layer.walk.row,
      });
    }

    const copyScale = scale + (rep?.scaleStep ?? 0) * i;
    if (copyScale <= 0) continue;
    const w = frameSrc.sw * copyScale * motion.scale;
    const h = frameSrc.sh * copyScale * motion.scale;
    const [ax, ay] = anchorOffset(layer.anchor, w, h);
    const x = layer.x + ax + motion.dx + (rep?.dx ?? 0) * i;
    const y = layer.y + ay + motion.dy + (rep?.dy ?? 0) * i;

    const alpha = baseAlpha + (rep?.alphaStep ?? 0) * i;
    if (alpha <= 0.004) continue;
    ctx.globalAlpha = clamp01(alpha);

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

    ctx.drawImage(img, frameSrc.sx, frameSrc.sy, frameSrc.sw, frameSrc.sh, x, y, w, h);
  }

  ctx.globalAlpha = baseAlpha;
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

/**
 * 画面に出す歌詞行を決める。
 *
 * MML由来のときは trackId で1本に絞るのが既定。曲によっては歌詞トラックが複数あり、
 * 全部出すと画面が文字で埋まってしまうため（'all' を明示したときだけ全部出す）。
 */
export function resolveLyricLines(layer: MvLyricsLayer, song: MvSong): MvLyricLine[] {
  if (layer.source === 'manual') return [...(layer.lines ?? [])].sort((a, b) => a.bar - b.bar);
  if (layer.trackId === 'all') return song.lyricLines;
  const target = typeof layer.trackId === 'number' ? layer.trackId : song.lyricTrackIds[0];
  if (target === undefined) return [];
  return song.lyricLines.filter(l => l.trackId === target);
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

// ───────────────── 図形レイヤー ─────────────────

function tracePolygon(ctx: CanvasRenderingContext2D, sides: number, radius: number): void {
  const n = Math.max(3, Math.round(sides));
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * radius;
    const py = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function traceForm(ctx: CanvasRenderingContext2D, layer: MvShapeLayer, radius: number, sides: number): void {
  switch (layer.form) {
    case 'circle':
    case 'ring':
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.5, radius), 0, Math.PI * 2);
      break;
    case 'square':
      ctx.beginPath();
      ctx.rect(-radius, -radius, radius * 2, radius * 2);
      break;
    case 'diamond':
      tracePolygon(ctx, 4, radius);
      break;
    case 'triangle':
      tracePolygon(ctx, 3, radius);
      break;
    case 'polygon':
      tracePolygon(ctx, sides, radius);
      break;
    case 'cross':
      ctx.beginPath();
      ctx.moveTo(-radius, 0);
      ctx.lineTo(radius, 0);
      ctx.moveTo(0, -radius);
      ctx.lineTo(0, radius);
      break;
    case 'bar': {
      // size は半径なので幅は size*2。高さは barAspect（幅に対する比）で決める。
      const aspect = layer.barAspect ?? 0.32;
      const h = radius * 2 * aspect;
      ctx.beginPath();
      ctx.rect(-radius, -h / 2, radius * 2, h);
      break;
    }
  }
}

function drawShapeLayer(d: DrawCtx, layer: MvShapeLayer): void {
  const { ctx } = d;
  const mods = layer.modulators;
  const stagger = layer.stagger ?? 0;

  // 個数だけは先に確定させる（1個ごとの遅延を掛ける前の値で数える）
  const count = Math.max(1, Math.min(64, Math.round(modulate(d, mods, 'count', layer.count ?? 1))));
  const baseAlpha = ctx.globalAlpha;

  ctx.save();
  ctx.globalCompositeOperation = MV_BLEND_COMPOSITE[layer.blend ?? 'normal'];
  ctx.strokeStyle = layer.color;
  ctx.fillStyle = layer.color;

  const spread = layer.spread ?? 0;
  const spin = layer.spin ?? 0;
  const offsetX = layer.offsetX ?? 0;
  const offsetY = layer.offsetY ?? 0;

  for (let i = 0; i < count; i++) {
    // stagger>0 のとき、i個目は i*stagger ステップぶん過去の音で反応する
    const delay = stagger * i;
    const size = modulate(d, mods, 'size', layer.size, delay);
    const rotation = modulate(d, mods, 'rotation', layer.rotation, delay);
    const opacity = clamp01(modulate(d, mods, 'opacity', 1, delay));
    const x = modulate(d, mods, 'x', layer.x, delay);
    const y = modulate(d, mods, 'y', layer.y, delay);
    const thickness = Math.max(0.2, modulate(d, mods, 'thickness', layer.thickness, delay));
    const sides = modulate(d, mods, 'sides', layer.sides ?? 6, delay);

    // 連動を重ねすぎても画面を覆い尽くさないよう、描画半径は画面サイズの2倍で頭打ちにする
    const radius = Math.min(size + spread * i, MV_W * 2);
    if (radius <= 0.2 || opacity <= 0.004) continue;

    ctx.globalAlpha = baseAlpha * opacity;
    ctx.lineWidth = thickness;
    ctx.save();
    ctx.translate(x + offsetX * i, y + offsetY * i);
    ctx.rotate((rotation + spin * i) * DEG);
    traceForm(ctx, layer, radius, sides);
    // cross は線でしか成立しないので、塗り指定でも stroke する
    if (layer.filled && layer.form !== 'cross' && layer.form !== 'ring') ctx.fill();
    else ctx.stroke();
    ctx.restore();
  }

  ctx.globalAlpha = baseAlpha;
  ctx.restore();
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
    case 'pianoRoll': {
      const projection = layer.projection ?? 'flat';
      if (projection === 'perspective') drawPianoRoll3D(d, layer);
      else if (projection === 'circular') drawPianoRollCircular(d, layer);
      else drawPianoRoll(d, layer);
      break;
    }
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

// ── 立体ピアノロール（MIDITrail 風） ─────────────────────

interface Vec3 { x: number; y: number; z: number }
interface Projected { x: number; y: number; z: number }

/**
 * ノート板を任意の視点から見た画面座標へ落とす。
 *
 * 世界座標の取り方:
 *   x = 音の高さ（低音が左、高音が右）
 *   y = ノートの厚み方向（上が正）
 *   z = 時間（0 が「いま」、正が未来。奥へ伸びる）
 * 視点は原点から -z 側へ camDist だけ引いた位置に置き、yaw→pitch→(画面内)roll の順で回す。
 */
function project3d(p: Vec3, view: MvView, rect: MvRect, camDist: number): Projected | null {
  const ry = view.yaw * DEG;
  const rx = view.pitch * DEG;
  const rz = view.roll * DEG;

  // yaw（Y軸まわり）
  const x1 = p.x * Math.cos(ry) + p.z * Math.sin(ry);
  const z1 = -p.x * Math.sin(ry) + p.z * Math.cos(ry);
  // pitch（X軸まわり）
  const y2 = p.y * Math.cos(rx) - z1 * Math.sin(rx);
  const z2 = p.y * Math.sin(rx) + z1 * Math.cos(rx);

  const zc = z2 + camDist;
  if (zc <= 1) return null;

  const f = (rect.h / 2) / Math.tan(Math.max(5, view.fov) * 0.5 * DEG);
  const sx = (f * x1) / zc;
  const sy = (-f * y2) / zc;

  // roll は画面内で回す
  const cx = sx * Math.cos(rz) - sy * Math.sin(rz);
  const cy = sx * Math.sin(rz) + sy * Math.cos(rz);

  return { x: rect.x + rect.w / 2 + cx, y: rect.y + rect.h / 2 + cy, z: zc };
}

function drawPianoRoll3D(d: DrawCtx, layer: MvVisualizerLayer): void {
  const { ctx, song } = d;
  const rect = layer.rect;
  const view = { ...DEFAULT_MV_VIEW, ...(layer.view ?? {}) };
  const windowBars = layer.amount ?? 4;
  const windowSteps = windowBars * MV_STEPS_PER_BAR;
  // 手前にも少し見せて、通り過ぎた音が奥から手前へ抜けていくようにする
  const behindSteps = windowSteps * 0.25;
  const from = d.step - behindSteps;
  const to = d.step + windowSteps;

  const pitchRange = Math.max(1, song.pitchMax - song.pitchMin);
  const laneW = rect.w / (pitchRange + 1);
  const halfW = rect.w / 2;
  const camDist = view.depth * 0.30 + 220;

  const notes = notesForLayer(d, layer).filter(n => {
    const end = n.startStep + n.durationSteps;
    return end >= from && n.startStep <= to;
  });

  // 画家のアルゴリズム: 奥（未来）から手前（過去）へ描く
  notes.sort((a, b) => (b.startStep + b.durationSteps) - (a.startStep + a.durationSteps));

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const stepToZ = (s: number) => ((s - d.step) / windowSteps) * view.depth;

  for (const n of notes) {
    const x0 = -halfW + (n.pitch - song.pitchMin) * laneW;
    const x1 = x0 + Math.max(2, laneW * 0.86);
    const z0 = stepToZ(n.startStep);
    const z1 = stepToZ(n.startStep + n.durationSteps);
    const hy = view.thickness;

    const top = [
      project3d({ x: x0, y: hy, z: z0 }, view, rect, camDist),
      project3d({ x: x1, y: hy, z: z0 }, view, rect, camDist),
      project3d({ x: x1, y: hy, z: z1 }, view, rect, camDist),
      project3d({ x: x0, y: hy, z: z1 }, view, rect, camDist),
    ];
    if (top.some(p => p === null)) continue;

    const sounding = n.startStep <= d.step && n.startStep + n.durationSteps > d.step;
    const color = trackColor(d, n.track);
    // 遠いほど薄くして奥行きを出す
    const depthFade = clamp01(1 - Math.max(0, z0) / (view.depth * 1.15));
    ctx.globalAlpha = (sounding ? 1 : 0.42 + 0.45 * depthFade);

    // 手前の側面（厚み）を先に描くと立体に見える
    const side = [
      top[0]!,
      top[1]!,
      project3d({ x: x1, y: 0, z: z0 }, view, rect, camDist),
      project3d({ x: x0, y: 0, z: z0 }, view, rect, camDist),
    ];
    if (!side.some(p => p === null)) {
      ctx.fillStyle = shade(color, 0.55);
      ctx.beginPath();
      ctx.moveTo(side[0]!.x, side[0]!.y);
      for (let i = 1; i < side.length; i++) ctx.lineTo(side[i]!.x, side[i]!.y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = sounding ? shade(color, 1.35) : color;
    if (sounding && layer.glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.moveTo(top[0]!.x, top[0]!.y);
    for (let i = 1; i < top.length; i++) ctx.lineTo(top[i]!.x, top[i]!.y);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 「いま」の線（z=0 の横棒）
  const nowL = project3d({ x: -halfW, y: 0, z: 0 }, view, rect, camDist);
  const nowR = project3d({ x: halfW, y: 0, z: 0 }, view, rect, camDist);
  if (nowL && nowR) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = layer.thickness ?? 1.5;
    ctx.beginPath();
    ctx.moveTo(nowL.x, nowL.y);
    ctx.lineTo(nowR.x, nowR.y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/** 円形ピアノロール。音域を円周へ、時間を半径方向へ巻きつける。 */
function drawPianoRollCircular(d: DrawCtx, layer: MvVisualizerLayer): void {
  const { ctx, song } = d;
  const rect = layer.rect;
  const ring: MvRing = { ...DEFAULT_MV_RING, ...(layer.ring ?? {}) };
  const windowBars = layer.amount ?? 4;
  const windowSteps = windowBars * MV_STEPS_PER_BAR;
  const from = d.step;
  const to = d.step + windowSteps;

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const maxR = Math.min(rect.w, rect.h) / 2;
  const innerR = Math.min(ring.innerRadius, maxR - 4);
  const span = Math.max(4, maxR - innerR);

  const pitchRange = Math.max(1, song.pitchMax - song.pitchMin);
  const sweep = ring.sweep * DEG;
  const rot = ring.rotate * DEG;
  const laneAngle = sweep / (pitchRange + 1);

  const notes = notesForLayer(d, layer).filter(n => {
    const end = n.startStep + n.durationSteps;
    return end >= from && n.startStep <= to;
  });

  ctx.save();
  for (const n of notes) {
    const a0 = rot + (n.pitch - song.pitchMin) * laneAngle;
    const a1 = a0 + laneAngle * 0.88;
    const r0 = innerR + (Math.max(from, n.startStep) - d.step) / windowSteps * span;
    const r1 = innerR + (Math.min(to, n.startStep + n.durationSteps) - d.step) / windowSteps * span;
    if (r1 <= r0) continue;

    const sounding = n.startStep <= d.step && n.startStep + n.durationSteps > d.step;
    ctx.globalAlpha = sounding ? 1 : 0.65;
    ctx.fillStyle = sounding ? shade(trackColor(d, n.track), 1.3) : trackColor(d, n.track);
    if (sounding && layer.glow) {
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r0, a0, a1);
    ctx.arc(cx, cy, r1, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 「いま」の円
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = layer.thickness ?? 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, rot, rot + sweep);
  ctx.stroke();

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
    const list = song.byTrack.get(track) ?? [];
    for (let c = 0; c < cols; c++) {
      const cx = x + c * cellW;
      const cy = y + r * cellH;
      const colStart = barStart + c * stepsPerCol;
      const idx = lastIndexAtOrBefore(list, colStart + stepsPerCol - 0.001);
      const hit = idx >= 0 && list[idx].startStep >= colStart;

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

function parseHex(color: string): [number, number, number] | null {
  if (!color || !color.startsWith('#')) return null;
  const hex = color.slice(1);
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  if (full.length < 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return isNaN(r) || isNaN(g) || isNaN(b) ? null : [r, g, b];
}

/** #rgb / #rrggbb / rgb() を alpha 付き rgba() へ。解釈できなければそのまま返す。 */
export function withAlpha(color: string, alpha: number): string {
  const a = clamp01(alpha);
  if (!color) return `rgba(255,255,255,${a})`;
  const rgb = parseHex(color);
  if (rgb) return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  return color;
}

/** 明度を factor 倍する（1未満で暗く、1超で明るく）。立体表示の陰影に使う。 */
export function shade(color: string, factor: number): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${f(rgb[0])},${f(rgb[1])},${f(rgb[2])})`;
}
