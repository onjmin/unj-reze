// MVの描画エンジン。DOM非依存（Canvas2Dコンテキストだけ受け取る）純粋な描画関数群。
//
// 時間の出どころは1つだけ: @onjmin/dtm の再生ステップ。拍位相・ビジュアライザ・歌詞・
// 図形モジュレータのすべてがノートデータから導出されるので、音とズレる余地が無い。
//
// 画像の読み込み・コマ送りは lib/walk-sprite.ts の基盤をそのまま使う（2Dゲームエンジン側と
// 実装を二重化しない）。

import {
  DEFAULT_MV_NOTE_LIGHT,
  DEFAULT_MV_NOTE_LIGHT_3D,
  DEFAULT_MV_RING,
  DEFAULT_MV_VIEW,
  MV_BLEND_COMPOSITE,
  MV_H,
  MV_PARTICLE_REVEAL_FRAMES,
  MV_PARTICLE_REVEAL_URL,
  MV_ROOT_TO_PITCH,
  chordRootName,
  chordToneLabel,
  getChordThemeColor,
  MV_STEPS_PER_BAR,
  MV_STEPS_PER_BEAT,
  MV_W,
  isLayerVisible,
  isMvEntranceInert,
  isMvTransitionInert,
  layerAppearBar,
  mvEntranceDistance,
  resolveSceneStage,
  sectionAtBar,
  type MvAnchor,
  type MvEntrance,
  type MvStage,
  type MvChordBarLayer,
  type MvChordStep,
  type MvDegreeLayer,
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
  type MvNoteLight,
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
  rowAnimCellInRect,
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
  push(stageBgUrl(manifest.stage));
  // 場面ごとに差し替わる背景も先に読んでおく。場面へ入ってから読み始めると
  // 切り替わった直後の数フレームだけ背景が抜ける。
  for (const section of manifest.sections) {
    if (section.stage) push(stageBgUrl(section.stage));
    // 粒子の転換はシート画像で描くので、こちらも先に読んでおく
    if (section.transition?.style === 'dissolve') push(MV_PARTICLE_REVEAL_URL);
  }
  for (const layer of manifest.layers) {
    if (layer.kind === 'image') push(layerImageUrl(layer));
  }
  return [...new Set(urls)];
}

/** 背景の表示URL。`bgRef: ''`（背景なしの明示）は null。 */
function stageBgUrl(stage: { bgUrl?: string; bgRef?: string }): string | null {
  return stage.bgUrl ?? (stage.bgRef ? imageRefToUrl(stage.bgRef) : null);
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
  /** いまの場面ぶんの上書きを反映した背景設定。背景・パレットはこちらを見る。 */
  stage: MvStage;
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
    stage: resolveSceneStage(manifest.stage, section),
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
    .map((l, idx) => ({ l, idx }))
    .sort((a, b) => (a.l.z ?? a.idx * 10) - (b.l.z ?? b.idx * 10) || a.idx - b.idx)
    .map(item => item.l);

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

  // 場面の切り替わり。演出より上・曲頭/曲尾のフェードより下に重ねる
  drawTransition(d);

  // フェードイン/アウト
  if (manifest.stage.fadeIn || manifest.stage.fadeOut) {
    let fadeAlpha = 0;
    const fadeSteps = MV_STEPS_PER_BAR; // 1小節分をフェードにかける

    if (manifest.stage.fadeIn && d.step < fadeSteps) {
      fadeAlpha = 1 - d.step / fadeSteps;
    } else if (manifest.stage.fadeOut && song.totalSteps > 0 && d.step > song.totalSteps - fadeSteps) {
      fadeAlpha = (d.step - (song.totalSteps - fadeSteps)) / fadeSteps;
      if (fadeAlpha > 1) fadeAlpha = 1;
    }

    if (fadeAlpha > 0.001) {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
      ctx.fillRect(0, 0, MV_W, MV_H);
      ctx.restore();
    }
  }
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
    case 'bars': {
      // 指定した小節の頭だけで発火する。「毎回」ではなく狙った瞬間だけ光らせるためのトリガー。
      if (!fx.bars || fx.bars.length === 0) return 0;
      let best = 0;
      for (const b of fx.bars) {
        const age = d.step - b * MV_STEPS_PER_BAR;
        if (age < 0 || age >= decaySteps) continue;
        const v = 1 - age / decaySteps;
        if (v > best) best = v;
      }
      return clamp01(best);
    }
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
      case 'tint': {
        // 'color' 合成は「元の明るさを保ったまま色味だけ差し替える」。
        // 単色で塗りつぶすと絵が潰れるので、夕焼けへの切り替えはこちらで作る。
        ctx.globalCompositeOperation = 'color';
        ctx.globalAlpha = env;
        ctx.fillStyle = fx.color ?? '#f7b82c';
        ctx.fillRect(0, 0, MV_W, MV_H);
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

// ───────────────── 場面の切り替わり ─────────────────

/**
 * 場面へ入った瞬間から `beats` 拍かけて覆いが晴れていく演出。
 *
 * 2画面ぶんを合成するクロスフェードにはしていない。1フレームに2回描くコストを払わずに
 * 「画が入れ替わった」と分かればよく、参考動画の場面転換も実際は黒か白を1拍またぐだけ。
 */
function drawTransition(d: DrawCtx): void {
  const t = d.section?.transition;
  if (!d.section || isMvTransitionInert(t) || !t) return;

  const durSteps = t.beats * MV_STEPS_PER_BEAT;
  const age = d.step - d.section.startBar * MV_STEPS_PER_BAR;
  if (age < 0 || age >= durSteps) return;
  const rest = clamp01(1 - age / durSteps);

  const { ctx } = d;
  ctx.save();
  switch (t.style) {
    case 'flash':
      // 光は一瞬で落ちるほうが「切り替わった」に見える
      ctx.fillStyle = withAlpha(t.color ?? '#ffffff', rest * rest);
      ctx.fillRect(0, 0, MV_W, MV_H);
      break;
    case 'wipeLeft':
      ctx.fillStyle = t.color ?? '#000000';
      ctx.fillRect(0, 0, MV_W * rest, MV_H);
      break;
    case 'wipeRight':
      ctx.fillStyle = t.color ?? '#000000';
      ctx.fillRect(MV_W * (1 - rest), 0, MV_W * rest, MV_H);
      break;
    case 'wipeUp':
      ctx.fillStyle = t.color ?? '#000000';
      ctx.fillRect(0, 0, MV_W, MV_H * rest);
      break;
    case 'wipeDown':
      ctx.fillStyle = t.color ?? '#000000';
      ctx.fillRect(0, MV_H * (1 - rest), MV_W, MV_H * rest);
      break;
    case 'dissolve': {
      // 白い粒子が敷き詰まった状態からほどけていくシート。黒地に加算で重ねるので、
      // シートの黒い部分は何も足さない＝そのまま透ける。
      const img = peekImage(MV_PARTICLE_REVEAL_URL);
      if (img && img.naturalWidth > 0) {
        const cell = img.naturalHeight;
        const idx = Math.min(MV_PARTICLE_REVEAL_FRAMES - 1, Math.floor((1 - rest) * MV_PARTICLE_REVEAL_FRAMES));
        ctx.globalCompositeOperation = 'lighter';
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, idx * cell, 0, cell, cell, 0, 0, MV_W, MV_H);
      } else {
        // シートがまだ読めていないあいだは暗転で代用する（一瞬でも素通しにしない）
        ctx.fillStyle = withAlpha('#000000', rest);
        ctx.fillRect(0, 0, MV_W, MV_H);
      }
      break;
    }
    case 'fade':
    default:
      ctx.fillStyle = withAlpha(t.color ?? '#000000', Math.pow(rest, 1.6));
      ctx.fillRect(0, 0, MV_W, MV_H);
      break;
  }
  ctx.restore();
}

// ───────────────── 背景 ─────────────────

function drawStage(d: DrawCtx): void {
  const { ctx } = d;
  const stage = d.stage;

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

  const bgUrl = stageBgUrl(stage);
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
    case 'degree': drawDegree(d, layer); break;
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
  const windowBars = layer.windowBars ?? 2;
  const page = Math.floor(d.bar / windowBars);
  const pageStartBar = page * windowBars;
  const pageEndBar = pageStartBar + windowBars;

  const barToX = (b: number) => x + ((b - pageStartBar) / windowBars) * w;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // バーの下地
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);

  ctx.textBaseline = 'middle';
  ctx.font = `${layer.size}px ${getMvFontStack()}`;

  let lastThemeColor: string | undefined;

  for (let i = 0; i < chords.length; i++) {
    const c = chords[i];
    const nextBar = i + 1 < chords.length ? chords[i + 1].bar : endBar;
    
    if (nextBar <= pageStartBar || c.bar >= pageEndBar) continue;

    const bx = barToX(c.bar);
    const bw = Math.max(1, barToX(nextBar) - bx);
    const active = d.bar >= c.bar && d.bar < nextBar;

    let fill: string;
    if (layer.colorMode === 'fixed') {
      fill = active ? layer.activeColor : layer.color;
    } else {
      const themeColor = getChordThemeColor(c.label, layer.key, layer.colorMode, lastThemeColor);
      lastThemeColor = themeColor;
      if (active) {
        fill = layer.activeColor && layer.activeColor !== '#3b82f6'
          ? layer.activeColor
          : themeColor.replace(/(\d+)%\)/, (_, l) => `${Math.min(90, Number(l) + 20)}%)`);
      } else {
        fill = themeColor;
      }
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

  // ── 再生位置のインジケーター（動くバー） ──
  const playX = barToX(d.bar);
  if (playX >= x && playX <= x + w) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(playX - 1, y, 2, h);
  }

  ctx.restore();
}

// ───────────────── 度数（頭の上の数字） ─────────────────

/**
 * そのトラックでいま鳴っている音を、いまのコードの根音から数えて数字にする。
 *
 * 参考動画（運び屋さん）の数字は `9` `♭7` `5`。`2` ではなく `9` と書くので、
 * 調に対する音階度数ではなく **コードの根音からのコードトーン名**。
 * だから同じ音を伸ばしていてもコードが変わると数字が変わる。
 */
function drawDegree(d: DrawCtx, layer: MvDegreeLayer): void {
  const { ctx } = d;
  const list = trackNotes(d.song, layer.track);
  const idx = lastIndexAtOrBefore(list, d.step);
  if (idx < 0) return;
  const note = list[idx];
  const sounding = note.startStep + note.durationSteps > d.step;
  if (!sounding && !layer.hold) return;

  const rootPitch = degreeRootPitch(d, layer);
  if (rootPitch === null) return;

  const label = chordToneLabel(note.pitch - rootPitch);
  const size = layer.size;
  ctx.font = `${layer.bold ? 'bold ' : ''}${size}px ${getMvFontStack(d.manifest)}`;
  ctx.textBaseline = 'top';
  if (layer.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = Math.max(2, size * 0.3);
  }
  ctx.fillStyle = layer.color;
  const w = ctx.measureText(label).width;
  const [ax, ay] = anchorOffset(layer.anchor, w, size);
  ctx.fillText(label, layer.x + ax, layer.y + ay);
  ctx.shadowBlur = 0;
}

/** 度数を数える基準の音（0-11）。コード基準なら進行から、調基準なら主音から。 */
function degreeRootPitch(d: DrawCtx, layer: MvDegreeLayer): number | null {
  if (layer.basis === 'key') return MV_ROOT_TO_PITCH[layer.key] ?? 0;

  // 自前の進行があればそれを使う（コード進行バーを画面に出さない作りのため）
  if (layer.chords && layer.chords.length > 0) {
    const own = chordAtBar(layer.chords, d.bar);
    if (own) return MV_ROOT_TO_PITCH[chordRootName(own.label)] ?? 0;
  }

  const bar = d.manifest.layers.find(
    (l): l is MvChordBarLayer => l.kind === 'chordBar' && (!layer.chordLayerId || l.id === layer.chordLayerId),
  );
  const chord = bar ? chordAtBar(bar.chords, d.bar) : null;
  // コードが置かれていない区間は調の主音へ落とす（数字が消えるより読める）
  if (!chord) return MV_ROOT_TO_PITCH[layer.key] ?? 0;
  return MV_ROOT_TO_PITCH[chordRootName(chord.label)] ?? 0;
}

/** その小節で鳴っているコード。 */
function chordAtBar(chords: MvChordStep[], bar: number): MvChordStep | null {
  let found: MvChordStep | null = null;
  for (const c of chords) {
    if (c.bar <= bar && (!found || c.bar >= found.bar)) found = c;
  }
  return found;
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

// ───────────────── 登場演出 ─────────────────

interface EntranceResult { dx: number; dy: number; alpha: number; }

const ENTRANCE_DONE: EntranceResult = { dx: 0, dy: 0, alpha: 1 };

/**
 * 登場演出のずらし量と濃さ。
 * 起点は layerAppearBar（＝そのレイヤーが出てきた場面の頭）で、そこから beats 拍かけて
 * 定位置・不透明へ寄せる。演出が終わったあとは毎フレーム ENTRANCE_DONE を返すだけなので、
 * 通常再生中のコストはほぼ無い。
 */
function entranceState(d: DrawCtx, layer: MvLayer, entrance: MvEntrance | undefined): EntranceResult {
  if (isMvEntranceInert(entrance) || !entrance) return ENTRANCE_DONE;

  const startStep = layerAppearBar(layer, d.manifest.sections, d.sectionId) * MV_STEPS_PER_BAR;
  const durSteps = entrance.beats * MV_STEPS_PER_BEAT;
  const age = d.step - startStep;
  if (age >= durSteps) return ENTRANCE_DONE;

  // easeOutCubic: 勢いよく入ってきて静かに止まる（等速だと機械的に見える）
  const t = clamp01(age / durSteps);
  const eased = 1 - (1 - t) ** 3;
  const rest = 1 - eased;
  const dist = mvEntranceDistance(entrance) * rest;

  let dx = 0;
  let dy = 0;
  switch (entrance.from) {
    case 'left': dx = -dist; break;
    case 'right': dx = dist; break;
    case 'top': dy = -dist; break;
    case 'bottom': dy = dist; break;
    default: break;
  }

  return { dx, dy, alpha: entrance.fade ? eased : 1 };
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

/**
 * スプライト1コマの切り出し矩形。
 *
 * `row_anim` は「1行＝1つのアニメーション」のシート用で、向きの概念が無い。
 * 歩行グラ規格（行＝方向）と同じ経路に通すと `ways.length` ぶん行がずれて別のコマが出る。
 */
function spriteFrameRect(
  walk: NonNullable<MvImageLayer['walk']>,
  crop: [number, number, number, number],
  timeSec: number,
  bpm: number,
): SpriteRect {
  const fps = spriteFps(walk, bpm);
  if (walk.stdId === 'row_anim') {
    return rowAnimCellInRect(crop, {
      frames: walk.frames ?? 4,
      row: walk.row ?? 0,
      playMode: walk.playMode ?? 'loop',
      fps,
      timeSec,
    });
  }
  const std = walkStandardFor(walk, crop[2], crop[3]);
  return animatedCellInRect(std, crop, {
    dir: walk.dir ?? 's',
    moving: true,
    timeSec,
    fps,
    row: walk.row,
  });
}

/**
 * コマ送りの速さ。`loopBeats` があれば曲のテンポから逆算する。
 * `timeSec` は再生ステップ由来なので、これで絵が拍にロックされる。
 */
function spriteFps(walk: NonNullable<MvImageLayer['walk']>, bpm: number): number {
  if (walk.loopBeats && walk.loopBeats > 0) {
    const frames = Math.max(1, walk.frames ?? 4);
    const secPerBeat = 60 / (bpm || 120);
    return frames / (walk.loopBeats * secPerBeat);
  }
  return walk.fps ?? 6;
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
    src = spriteFrameRect(layer.walk, crop, d.timeSec, d.song.bpm);
  }

  const scale = layer.scale || 1;
  const motion = applyMotion(d, layer.motion, layer.motionAmount ?? 0, src.sw * scale);
  const enter = entranceState(d, layer, layer.entrance);
  if (enter.alpha <= 0.004) return;
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
      frameSrc = spriteFrameRect(layer.walk, crop, d.timeSec + rep.phase * i, d.song.bpm);
    }

    const copyScale = scale + (rep?.scaleStep ?? 0) * i;
    if (copyScale <= 0) continue;
    const w = frameSrc.sw * copyScale * motion.scale;
    const h = frameSrc.sh * copyScale * motion.scale;
    const [ax, ay] = anchorOffset(layer.anchor, w, h);
    const x = layer.x + ax + motion.dx + enter.dx + (rep?.dx ?? 0) * i;
    const y = layer.y + ay + motion.dy + enter.dy + (rep?.dy ?? 0) * i;

    const alpha = (baseAlpha + (rep?.alphaStep ?? 0) * i) * enter.alpha;
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

    if (layer.flipH || layer.flipV) {
      // 反転しても占める場所は変えたくないので、描画矩形の中心で鏡にする（枠は反転しない）
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
      ctx.drawImage(img, frameSrc.sx, frameSrc.sy, frameSrc.sw, frameSrc.sh, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, frameSrc.sx, frameSrc.sy, frameSrc.sw, frameSrc.sh, x, y, w, h);
    }
  }

  ctx.globalAlpha = baseAlpha;
  ctx.imageSmoothingEnabled = prevSmoothing;
}

// ───────────────── テキストレイヤー ─────────────────

export function getMvFontStack(manifest?: MvManifest): string {
  if (manifest?.stage?.fontFamily) return manifest.stage.fontFamily;
  if (typeof document !== 'undefined') {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--font-pixel').trim();
    if (raw) return `${raw}, "DotGothic16", "美咲ゴシック", "Misaki Gothic", monospace, sans-serif`;
  }
  return '"DotGothic16", "美咲ゴシック", "Misaki Gothic", monospace, sans-serif';
}

function drawTextLayer(d: DrawCtx, layer: MvTextLayer): void {
  const { ctx } = d;
  const motion = applyMotion(d, layer.motion, layer.motionAmount ?? 0, layer.size);
  const size = layer.size * motion.scale;
  ctx.font = `${layer.bold ? 'bold ' : ''}${size}px ${getMvFontStack(d.manifest)}`;
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

  ctx.textBaseline = 'middle';
  ctx.font = `bold ${size}px ${getMvFontStack(d.manifest)}`;

  shown.forEach((idx, depth) => {
    const line = lines[idx];
    const age = d.bar - line.bar;
    // 出だしは 1/8 小節でフェードイン、終わりぎわは 1/2 小節でフェードアウト
    const fadeIn = clamp01(age / 0.125);
    const fadeOut = clamp01((hold - age) / 0.5);
    // 古い列は「読めないが確かにある」濃さで残す。1/depth だと3列目で消えてしまい、
    // 参考動画のように10列ぶん積み上がった壁にならないので、等比で緩やかに落とす。
    const depthFade = depth === 0 ? 1 : 0.42 * Math.pow(0.84, depth - 1);
    const alpha = fadeIn * fadeOut * depthFade;
    if (alpha <= 0.01) return;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = layer.color;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = size * 0.4;

    if (layer.vertical) {
      const textToDraw = layer.typing && depth === 0
        ? line.text.slice(0, Math.floor(Math.max(0, age) / 0.04) + 1)
        : line.text;
      const h = textToDraw.length * size * 1.08;
      const [ax, ay] = anchorOffset(layer.anchor, size, h);
      const step = size * 1.7;
      // rightToLeft: 右端(layer.x)を固定して、新しい行ほど左へ置く。
      // 参考動画（次日朝夢 / x0o0x_ / _）はどれもこの積み方で、
      // 行が増えても既に出ている列は動かない。
      const x = (layer.stack ?? 'rightToLeft') === 'rightToLeft'
        ? layer.x + ax - (shown.length - 1 - depth) * step
        : layer.x + ax + depth * step;
      let y = layer.y + ay;
      for (const ch of textToDraw) {
        ctx.fillText(ch, x, y);
        y += size * 1.08;
      }
    } else {
      const textToDraw = layer.typing && depth === 0
        ? line.text.slice(0, Math.floor(Math.max(0, age) / 0.04) + 1)
        : line.text;
      const w = ctx.measureText(textToDraw).width;
      const [ax, ay] = anchorOffset(layer.anchor, w, size);
      const lx = layer.x + ax;
      const ly = layer.y + ay - depth * size * 1.35;
      drawLyricMarks(d, line, textToDraw, lx, ly, size, alpha);
      ctx.fillStyle = layer.color;
      ctx.fillText(textToDraw, lx, ly);
    }
  });

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

/**
 * 行の一部に敷く色つきの下地（マーカー）。
 * 参考動画（運び屋さん）は「つき」「かぜ」「はな」の**背後だけ**が塗られていて、
 * 文字そのものは白のまま。だから文字色を変えるのではなく矩形を先に塗る。
 */
function drawLyricMarks(
  d: DrawCtx,
  line: MvLyricLine,
  shownText: string,
  x: number,
  y: number,
  size: number,
  alpha: number,
): void {
  if (!line.marks || line.marks.length === 0) return;
  const { ctx } = d;
  const prevShadow = ctx.shadowBlur;
  ctx.shadowBlur = 0;
  const pad = size * 0.12;
  for (const m of line.marks) {
    const from = Math.max(0, Math.min(shownText.length, m.from));
    const to = Math.max(from, Math.min(shownText.length, m.to));
    if (to <= from) continue;
    const x0 = ctx.measureText(shownText.slice(0, from)).width;
    const x1 = ctx.measureText(shownText.slice(0, to)).width;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = m.color;
    ctx.fillRect(x + x0 - pad, y - size * 0.62, x1 - x0 + pad * 2, size * 1.24);
  }
  ctx.shadowBlur = prevShadow;
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

/** SVGパス文字列 → Path2D のキャッシュ。編集中は同じ文字列で毎フレーム呼ばれる。 */
const path2dCache = new Map<string, Path2D>();

function getPath2D(dstr: string): Path2D {
  let p = path2dCache.get(dstr);
  if (!p) {
    if (path2dCache.size > 64) path2dCache.clear();
    p = new Path2D(dstr);
    path2dCache.set(dstr, p);
  }
  return p;
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
    if (layer.form === 'path' && layer.path) {
      // 設計座標系（pathBox）の中心を原点に、長辺が size×2 になるよう拡縮して描く
      const box = layer.pathBox ?? [0, 0, 100, 100];
      const bw = Math.max(1e-3, box[2]);
      const bh = Math.max(1e-3, box[3]);
      const s = (radius * 2) / Math.max(bw, bh);
      ctx.scale(s, s);
      ctx.translate(-(box[0] + bw / 2), -(box[1] + bh / 2));
      try {
        const p = getPath2D(layer.path);
        // evenodd にしておくと、重なったサブパスが穴として抜ける（ドーナツ形などが作れる）
        if (layer.filled) ctx.fill(p, 'evenodd');
        else {
          ctx.lineWidth = thickness / s;
          ctx.stroke(p);
        }
      } catch {
        // 入力途中の壊れたパスは黙って飛ばす
      }
    } else {
      traceForm(ctx, layer, radius, sides);
      // cross は線でしか成立しないので、塗り指定でも stroke する
      if (layer.filled && layer.form !== 'cross' && layer.form !== 'ring') ctx.fill();
      else ctx.stroke();
    }
    ctx.restore();
  }

  ctx.globalAlpha = baseAlpha;
  ctx.restore();
}

// ───────────────── ビジュアライザ ─────────────────

function trackColor(d: DrawCtx, track: number): string {
  const palette = d.stage.palette;
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

/**
 * 平面のピアノロール。`flow` で2通り。
 *
 * - scroll : 再生位置を帯の左から25%に固定し、譜面が右から左へ流れる
 * - page   : 譜面は動かず、`amount` 小節ぶんを固定位置に並べる。小節窓が進むとページごと差し替わる
 *
 * ノートの見え方は `MvNoteLight`:
 *   まだ鳴っていない音は `dim` の薄さ → 音の頭で満点の白 → `echo` の輪郭が外へ広がって消える。
 * 「鳴っていない音も濃く塗る」と、どれが今の音なのか画から読めなくなる。
 */
function drawPianoRoll(d: DrawCtx, layer: MvVisualizerLayer): void {
  const { ctx, song } = d;
  const { x, y, w, h } = layer.rect;
  const light = layer.light ?? DEFAULT_MV_NOTE_LIGHT;
  const paged = (layer.flow ?? 'scroll') === 'page';
  const windowBars = Math.max(0.25, layer.amount ?? 4);
  const windowSteps = windowBars * MV_STEPS_PER_BAR;

  // page はいま居るページの頭を原点にする。scroll は再生位置基準で毎フレーム動く。
  const from = paged
    ? Math.floor(d.step / windowSteps) * windowSteps
    : d.step - windowSteps * 0.25;
  const to = from + windowSteps;

  // 音域はレイヤー指定があればそれを使う。曲全体を1枚に収めるとノートが数pxに潰れるので、
  // 拡大したいレイヤーは狭い窓を持たせる。
  const pitchLo = layer.pitchRange ? layer.pitchRange[0] : song.pitchMin;
  const pitchHi = layer.pitchRange ? layer.pitchRange[1] : song.pitchMax;
  const pitchRange = Math.max(1, pitchHi - pitchLo);
  const noteH = Math.max(1.5, h / (pitchRange + 1));
  const notes = notesForLayer(d, layer);
  const echo = light.echo && light.echo.beats > 0 ? light.echo : null;
  const echoSteps = echo ? echo.beats * MV_STEPS_PER_BEAT : 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const baseAlpha = ctx.globalAlpha;

  for (const n of notes) {
    const end = n.startStep + n.durationSteps;
    // page は「この小節窓に頭がある音」だけを載せる（またぐ音は切らずに窓の端で止める）
    if (paged ? n.startStep < from || n.startStep >= to : end < from || n.startStep > to) continue;

    const nx = x + ((n.startStep - from) / windowSteps) * w;
    const nw = Math.max(2, ((Math.min(end, to) - n.startStep) / windowSteps) * w);
    // 窓の外の音は折り返さず、そのオクターブぶんだけ寄せて窓の中に入れる
    // （切り捨てると、狭い窓では画面がほとんど空になる）
    let pitch = n.pitch;
    while (pitch < pitchLo) pitch += 12;
    while (pitch > pitchHi) pitch -= 12;
    const ny = y + h - ((pitch - pitchLo) / pitchRange) * (h - noteH) - noteH;

    const sounding = n.startStep <= d.step && end > d.step;
    const color = trackColor(d, n.track);
    const level = noteLevel(d, n, light);

    if (level > 0.004) {
      ctx.globalAlpha = baseAlpha * level;
      ctx.fillStyle = color;
      if (sounding && layer.glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      }
      ctx.fillRect(nx, ny, nw, noteH);
      ctx.shadowBlur = 0;
    }

    // ── 余韻。音の頭から外へ広がる輪郭が、中身が暗くなったあとも残って薄れる ──
    if (echo) {
      const age = d.step - n.startStep;
      if (age >= 0 && age < echoSteps) {
        const t = age / echoSteps;
        const grow = echo.spread * t;
        ctx.globalAlpha = baseAlpha * (1 - t);
        ctx.strokeStyle = color;
        ctx.lineWidth = echo.thickness;
        ctx.strokeRect(nx - grow, ny - grow, nw + grow * 2, noteH + grow * 2);
      }
    }
  }

  ctx.globalAlpha = baseAlpha;
  ctx.restore();
}

/**
 * ノート1つの濃さ 0..1。
 * まだ鳴っていない＝`dim` / 鳴っている＝1 / 鳴り終わった＝`fadeOut` なら消す、でなければ `dim`。
 */
function noteLevel(d: DrawCtx, n: MvNote, light: MvNoteLight): number {
  if (d.step < n.startStep) return light.dim;
  if (d.step < n.startStep + n.durationSteps) return 1;
  return light.fadeOut ? 0 : light.dim;
}

// ── 立体ピアノロール（MIDITrail 風） ─────────────────────

interface Vec3 { x: number; y: number; z: number }
interface Projected { x: number; y: number; z: number }

/**
 * ノート板を任意の視点から見た画面座標へ落とす。
 *
 * 世界座標の取り方（MIDITrail と同じ向き）:
 *   x = 時間（右が未来。再生に合わせて右から左へ流れる）
 *   y = 音の高さ（上が高音）
 *   z = トラックの奥行きレーン（正が奥）
 * 視点は原点から -z 側へ camDist だけ引いた位置に置き、yaw→pitch→(画面内)roll の順で回す。
 */
function project3d(p: Vec3, view: MvView, rect: MvRect, camDist: number): Projected | null {
  const ry = view.yaw * DEG;
  // 「正で上から見る」に合わせる。正の回転で奥(z+)が画面の上へ逃げる向き。
  const rx = -view.pitch * DEG;
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

/**
 * 立体ピアノロール（MIDITrail 準拠）。
 * x = 時間（右が未来、再生位置は左寄り25%に固定）、y = 音の高さ、z = トラックのレーン。
 * ノートは厚み（view.thickness）を持つ板として描き、鳴った瞬間に明るく光る。
 * 旧トンネル型（時間を奥行きに取る）はレーン概念が消えて画面の大半が空いてしまうので使わない。
 */
function drawPianoRoll3D(d: DrawCtx, layer: MvVisualizerLayer): void {
  const { ctx, song } = d;
  const rect = layer.rect;
  const view = { ...DEFAULT_MV_VIEW, ...(layer.view ?? {}) };
  const light = layer.light ?? DEFAULT_MV_NOTE_LIGHT_3D;
  const windowBars = layer.amount ?? 4;
  const windowSteps = windowBars * MV_STEPS_PER_BAR;

  // 論理x幅。rectより広めに取って、画面端までノートが流れ続けて見えるようにする
  const spanX = rect.w * 1.7;
  const playheadX = -spanX * 0.25; // 再生位置を左寄りに置く（未来が右に長く見える）
  const stepToX = (s: number) => playheadX + ((s - d.step) / windowSteps) * spanX;
  const from = d.step - windowSteps * 0.35;
  const to = d.step + windowSteps * 0.85;

  const pitchRange = Math.max(1, song.pitchMax - song.pitchMin);
  const rollH = rect.h * 1.1;
  const noteH = Math.max(2.5, (rollH / (pitchRange + 1)) * 0.85);
  const pitchToY = (pitch: number) => ((pitch - song.pitchMin) / pitchRange - 0.5) * rollH;

  // トラック → 奥行きレーン。手前(負z)ほどパレット先頭のトラック
  const laneTracks = layer.tracks && layer.tracks.length > 0 ? layer.tracks : song.tracks;
  const laneCount = Math.max(1, laneTracks.length);
  const laneZ = (track: number) => {
    const idx = laneTracks.indexOf(track);
    if (idx < 0 || laneCount === 1) return 0;
    return (idx / (laneCount - 1) - 0.5) * view.depth;
  };
  const half = Math.max(0, view.thickness) / 2;

  const f = (rect.h / 2) / Math.tan(Math.max(5, view.fov) * 0.5 * DEG);
  // 回転後もすべての頂点がカメラの前(zc>1)に残るよう、視距離は広めに取る
  const camDist = f * 1.15 + view.depth * 0.6 + spanX * 0.35 * Math.abs(Math.sin(view.yaw * DEG));

  const notes = notesForLayer(d, layer).filter(n => {
    const end = n.startStep + n.durationSteps;
    return end >= from && n.startStep <= to;
  });

  // 画家のアルゴリズム: 奥のレーンから描く
  notes.sort((a, b) => laneZ(b.track) - laneZ(a.track) || a.startStep - b.startStep);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  // 「いま」の判定ライン（音域の上下いっぱいの縦線）
  const nowT = project3d({ x: playheadX, y: rollH * 0.52, z: 0 }, view, rect, camDist);
  const nowB = project3d({ x: playheadX, y: -rollH * 0.52, z: 0 }, view, rect, camDist);
  if (nowT && nowB) {
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = layer.thickness ?? 1.5;
    ctx.beginPath();
    ctx.moveTo(nowT.x, nowT.y);
    ctx.lineTo(nowB.x, nowB.y);
    ctx.stroke();
  }

  for (const n of notes) {
    const x0 = stepToX(Math.max(n.startStep, from));
    const x1 = stepToX(Math.min(n.startStep + n.durationSteps, to));
    if (x1 - x0 < 1) continue;
    const yC = pitchToY(n.pitch);
    const y0 = yC - noteH / 2;
    const y1 = yC + noteH / 2;
    const zC = laneZ(n.track);

    const sounding = n.startStep <= d.step && n.startStep + n.durationSteps > d.step;
    const color = trackColor(d, n.track);

    // 通り過ぎた音は左端に向かってフェードアウト
    let alpha = sounding ? 1 : light.dim;
    const endX = stepToX(n.startStep + n.durationSteps);
    if (!sounding && endX < playheadX) {
      alpha *= clamp01(1 - (playheadX - endX) / (spanX * 0.24));
    }
    if (alpha <= 0.02) continue;

    // 手前面（z-）の四隅
    const pTL = project3d({ x: x0, y: y1, z: zC - half }, view, rect, camDist);
    const pTR = project3d({ x: x1, y: y1, z: zC - half }, view, rect, camDist);
    const pBL = project3d({ x: x0, y: y0, z: zC - half }, view, rect, camDist);
    const pBR = project3d({ x: x1, y: y0, z: zC - half }, view, rect, camDist);
    if (!pTL || !pTR || !pBL || !pBR) continue;

    ctx.globalAlpha = alpha;

    // 厚みの見える上面。奥側の辺（z+）とつないだ平行四辺形で箱らしさを出す
    if (half > 0) {
      const qTL = project3d({ x: x0, y: y1, z: zC + half }, view, rect, camDist);
      const qTR = project3d({ x: x1, y: y1, z: zC + half }, view, rect, camDist);
      if (qTL && qTR) {
        ctx.fillStyle = shade(color, sounding ? 1.1 : 0.7);
        ctx.beginPath();
        ctx.moveTo(pTL.x, pTL.y);
        ctx.lineTo(pTR.x, pTR.y);
        ctx.lineTo(qTR.x, qTR.y);
        ctx.lineTo(qTL.x, qTL.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (sounding && layer.glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }
    ctx.fillStyle = sounding ? shade(color, 1.45) : color;
    ctx.beginPath();
    ctx.moveTo(pTL.x, pTL.y);
    ctx.lineTo(pTR.x, pTR.y);
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBL.x, pBL.y);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/** 円形ピアノロール。音域を円周へ、時間を半径方向へ巻きつける。 */
function drawPianoRollCircular(d: DrawCtx, layer: MvVisualizerLayer): void {
  const { ctx, song } = d;
  const rect = layer.rect;
  const ring: MvRing = { ...DEFAULT_MV_RING, ...(layer.ring ?? {}) };
  const light = layer.light ?? DEFAULT_MV_NOTE_LIGHT_3D;
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
    ctx.globalAlpha = sounding ? 1 : light.dim * 0.82;
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

      // 空きマスの罫線。二重線にして、参考動画の装飾枠つきタイルの気配を出す
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(cx) + 0.5, Math.round(cy) + 0.5, Math.round(cellW - gap), Math.round(cellH - gap));
      const inner = Math.max(2, Math.min(cellW, cellH) * 0.1);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.strokeRect(
        Math.round(cx + inner) + 0.5,
        Math.round(cy + inner) + 0.5,
        Math.round(cellW - gap - inner * 2),
        Math.round(cellH - gap - inner * 2),
      );

      if (hit) {
        const active = c === currentCol;
        // 参考動画は点灯マスがほぼ真っ白のまま並ぶ。通過中の列だけ満点にする
        ctx.globalAlpha = active ? 1 : 0.78;
        ctx.fillStyle = color;
        ctx.fillRect(cx + gap, cy + gap, cellW - gap * 2, cellH - gap * 2);
        // 点灯マスの中心に小さな抜き模様を入れ子で入れる（白い面が主役、模様は控えめ）
        ctx.globalAlpha = active ? 0.9 : 0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        const inset = Math.min(cellW, cellH) * 0.32;
        ctx.fillRect(cx + inset, cy + inset, cellW - inset * 2, cellH - inset * 2);
        ctx.fillStyle = color;
        const inset2 = Math.min(cellW, cellH) * 0.42;
        ctx.fillRect(cx + inset2, cy + inset2, cellW - inset2 * 2, cellH - inset2 * 2);
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
  const maxR = Math.max(w, h) * 0.7;
  const lifeSteps = MV_STEPS_PER_BAR * 2.0;
  const maxRings = layer.amount ?? 12;
  const notes = notesForLayer(d, layer);

  // 直近に鳴ったノートの波紋を描画
  const recent: MvNote[] = [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    if (n.startStep > d.step) continue;
    if (d.step - n.startStep > lifeSteps) break;
    recent.push(n);
    if (recent.length >= maxRings) break;
  }

  ctx.save();
  for (const n of recent) {
    const age = (d.step - n.startStep) / lifeSteps;
    // 初速が速く、だんだんゆっくり広がるイージング
    const r = maxR * (1 - Math.pow(1 - age, 3));
    const alpha = (1 - age) * (1 - age);
    if (r <= 2 || alpha <= 0.01) continue;

    const color = trackColor(d, n.track);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = (layer.thickness ?? 2) * (1 - age * 0.5);

    if (layer.glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 15 * alpha;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // 中心で拍に合わせて脈打つコア
  // 曲全体のエネルギー（beatEnv）で基本サイズが決まり、ノート発音の瞬間に強く光る
  let activeLevel = 0;
  for (const n of recent) {
    if (n.startStep <= d.step && n.startStep + n.durationSteps > d.step) {
      activeLevel = 1;
      break;
    }
  }
  
  const coreBase = 12 + 18 * d.beatEnv;
  const corePulse = coreBase + activeLevel * 8;
  
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  if (layer.glow) {
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 20 * d.beatEnv + activeLevel * 15;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, corePulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
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
    ctx.fillStyle = d.stage.palette[i % Math.max(1, d.stage.palette.length)] ?? '#ffffff';
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
