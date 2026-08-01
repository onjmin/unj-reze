'use client';

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { useAudioFocus } from '@/lib/audio-focus-context';
import { applyMasterVolume, subscribeMasterVolume } from '@/lib/master-volume';
import { startMvPlayback, type MvPlaybackHandle } from '@/lib/mv-audio';
import { MV_H, MV_STEPS_PER_BAR, MV_STEPS_PER_BEAT, MV_W, mvAudioMode, type MvManifest } from '@/lib/mv-config';
import { collectMvImageUrls, drawMvFrame, EMPTY_SONG, parseMvSong, preloadMvImages, type MvSong } from '@/lib/mv-engine';

export interface MvPlayerHandle {
  play: () => void;
  stop: () => void;
  isPlaying: () => boolean;
}

interface MvPlayerProps {
  manifest: MvManifest;
  /** 再生/停止ボタンを画面内に出す。 */
  controls?: boolean;
  /** 素材の準備ができ次第、自動で再生する（親がユーザー操作を受けてから使うこと）。 */
  autoPlay?: boolean;
  className?: string;
  onEnded?: () => void;
}

/**
 * MVの再生ビュー。編集プレビューとフィード埋め込みで共有する。
 *
 * 時間の出どころは @onjmin/dtm の onTick（＝音声スケジューラのステップ）だけ。
 * rAF はティックとティックの間を線形に補間するだけなので、描画が重くても音とはズレない。
 *
 * 音の出し方（軽量 / 外部音源 / 外部音源＋歌声）は manifest.audio.mode で切り替わる。
 * 実際の再生経路と音量の合成は lib/mv-audio.ts が面倒を見る。
 */
const MvPlayer = forwardRef<MvPlayerHandle, MvPlayerProps>(function MvPlayer(
  { manifest, controls = true, autoPlay = false, className, onEnded },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seekBarRef = useRef<HTMLInputElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const playbackRef = useRef<MvPlaybackHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  /** 直近の onTick。{ step, atMs } からフレーム時刻を補間する。 */
  const tickRef = useRef<{ step: number; atMs: number }>({ step: 0, atMs: 0 });
  const startMsRef = useRef(0);
  const songRef = useRef<MvSong>(EMPTY_SONG);
  const manifestRef = useRef(manifest);
  const onEndedRef = useRef(onEnded);
  /**
   * 再生の世代番号。getStudio() の解決を待っている間に stop() されたら、
   * 遅れて返ってきた studio で鳴らし始めないようにする。
   */
  const playTokenRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const autoPlayedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  const instanceId = useId();
  const { requestFocus, releaseFocus } = useAudioFocus();
  const focusRef = useRef({ requestFocus, releaseFocus });

  useEffect(() => { manifestRef.current = manifest; }, [manifest]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { focusRef.current = { requestFocus, releaseFocus }; }, [requestFocus, releaseFocus]);

  // ── 描画 ────────────────────────────────────────────────
  const paint = useCallback((step: number, timeSec: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = canvas.width / MV_W;
    ctx.save();
    ctx.scale(dpr, dpr);
    drawMvFrame(ctx, manifestRef.current, songRef.current, { step, timeSec });
    ctx.restore();
  }, []);

  /** 停止中の静止画（1コマ目）を描く。 */
  const paintPoster = useCallback(() => paint(0, 0), [paint]);

  // ── 楽曲の解析と画像の先読み ─────────────────────────────
  // 編集中は manifest の参照が毎キーストロークで変わるので、
  // 「MMLが変わったか」「読むべき画像が増えたか」だけを依存にする。
  // 見た目の変更は manifestRef 経由で次のフレームに反映される。
  const imageSig = collectMvImageUrls(manifest).join('|');
  useEffect(() => {
    let disposed = false;
    setReady(false);
    (async () => {
      const song = await parseMvSong(manifestRef.current.mml);
      await preloadMvImages(manifestRef.current);
      if (disposed) return;
      songRef.current = song;
      setReady(true);
      if (!playbackRef.current) paintPoster();
    })();
    return () => { disposed = true; };
  }, [manifest.mml, imageSig, paintPoster]);

  // 停止中は manifest の編集をそのまま静止画へ反映する
  useEffect(() => {
    if (!playbackRef.current) paintPoster();
  }, [manifest, paintPoster]);

  // ── キャンバスの実サイズ合わせ ───────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(MV_W * dpr);
      const h = Math.round(MV_H * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        if (!playbackRef.current) paintPoster();
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [paintPoster]);

  // ── 停止 ────────────────────────────────────────────────
  const stop = useCallback((reset = true) => {
    playTokenRef.current += 1;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    playbackRef.current?.stop();
    playbackRef.current = null;
    
    setPlaying(false);
    setLoading(false);
    focusRef.current.releaseFocus(instanceId);
    
    if (reset === true) {
      tickRef.current = { step: 0, atMs: 0 };
      if (seekBarRef.current) seekBarRef.current.value = "0";
      if (timeDisplayRef.current) timeDisplayRef.current.textContent = "0:00";
      paintPoster();
    }
  }, [instanceId, paintPoster]);

  // ── 再生 ────────────────────────────────────────────────
  const play = useCallback((startStep?: number) => {
    if (playbackRef.current) return;
    const mml = manifestRef.current.mml?.trim();
    if (!mml) return;

    const token = playTokenRef.current + 1;
    playTokenRef.current = token;
    setLoading(true);
    focusRef.current.requestFocus(instanceId, () => stop());

    startMvPlayback(mml, songRef.current.lyricTrackIds, {
      mode: mvAudioMode(manifestRef.current),
      // サイトのマスター音量をそのまま渡す。MML自身の #volume= との合成は mv-audio 側で行う。
      // ここで 50 のような係数を掛けると、ContentPicker の試聴より小さく鳴ってしまう。
      volume: applyMasterVolume(100),
      startStep,
      onTick: (step: number) => {
        tickRef.current = { step, atMs: performance.now() };
      },
      onStop: () => {
        onEndedRef.current?.();
        stop(true);
      },
    }).then(playback => {
      // 準備中に停止されていたら、遅れて出来た再生をすぐ捨てる
      if (playTokenRef.current !== token) {
        playback.stop();
        return;
      }
      playbackRef.current = playback;
      startMsRef.current = performance.now();
      tickRef.current = { step: 0, atMs: startMsRef.current };
      setLoading(false);
      setPlaying(true);

      const stepsPerMs = ((songRef.current.bpm || 120) / 60) * MV_STEPS_PER_BEAT / 1000;
      const loop = () => {
        const now = performance.now();
        const tick = tickRef.current;
        // onTick は毎フレーム来るとは限らないので、直近ティックからの経過分を足して補間する
        const step = tick.step + Math.max(0, now - tick.atMs) * stepsPerMs;
        const timeSec = (now - startMsRef.current) / 1000;
        paint(step, timeSec);
        
        if (seekBarRef.current) {
          seekBarRef.current.value = String(step);
        }
        if (timeDisplayRef.current) {
          const mm = Math.floor(timeSec / 60);
          const ss = Math.floor(timeSec % 60).toString().padStart(2, '0');
          timeDisplayRef.current.textContent = `${mm}:${ss}`;
        }
        
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }).catch(e => {
      console.error('[MvPlayer] failed to start playback', e);
      if (playTokenRef.current !== token) return;
      setLoading(false);
      focusRef.current.releaseFocus(instanceId);
    });
  }, [instanceId, paint, stop]);

  useImperativeHandle(ref, () => ({
    play,
    stop,
    isPlaying: () => !!playbackRef.current,
  }), [play, stop]);

  // 検証用デバッグハンドル（yume25d の __yume25d と同じ位置づけ）。
  // 任意のステップのコマを描かせられるので、再生を待たずに
  // 「歌詞は何小節目で出るか」「拍で何が動くか」をピクセルで確かめられる。
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as unknown as { __mvPlayer?: unknown };
    w.__mvPlayer = {
      paintAt: (step: number, timeSec = 0) => paint(step, timeSec),
      getSong: () => songRef.current,
      getManifest: () => manifestRef.current,
      isPlaying: () => !!playbackRef.current,
    };
    return () => { delete w.__mvPlayer; };
  }, [paint]);

  // マスター音量の変更を再生中の音へ反映
  useEffect(() => subscribeMasterVolume(() => playbackRef.current?.setVolume(applyMasterVolume(100))), []);

  // autoPlay は「素材が揃った最初の1回」だけ。以後の再解析では再発火しない。
  useEffect(() => {
    if (!autoPlay || !ready || autoPlayedRef.current) return;
    autoPlayedRef.current = true;
    play();
  }, [autoPlay, ready, play]);

  // アンマウント時に必ず音を止める
  useEffect(() => () => {
    playTokenRef.current += 1;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    playbackRef.current?.stop();
    playbackRef.current = null;
    focusRef.current.releaseFocus(instanceId);
  }, [instanceId]);

  const toggle = () => {
    if (playing) {
      stop(false); // Pause instead of fully resetting
    } else {
      const currentStep = seekBarRef.current ? Number(seekBarRef.current.value) : 0;
      play(currentStep > 0 ? currentStep : undefined);
    }
  };
  const hasMml = !!manifest.mml?.trim();

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const step = Number(e.target.value);
    const stepsPerSec = ((songRef.current.bpm || 120) / 60) * MV_STEPS_PER_BEAT;
    const timeSec = step / stepsPerSec;
    
    tickRef.current = { step, atMs: performance.now() }; 
    paint(step, timeSec);
    
    if (timeDisplayRef.current) {
      const mm = Math.floor(timeSec / 60);
      const ss = Math.floor(timeSec % 60).toString().padStart(2, '0');
      timeDisplayRef.current.textContent = `${mm}:${ss}`;
    }
  }, [paint]);

  return (
    <div className={`flex flex-col w-full overflow-hidden rounded-lg bg-black ${className ?? ''}`}>
      <div className="relative w-full">
        <canvas
          ref={canvasRef}
          className="block h-auto w-full"
          style={{ aspectRatio: `${MV_W} / ${MV_H}` }}
        />

        {!hasMml && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-gray-500">
            MMLを設定するとプレビューできます
          </div>
        )}
      </div>

      {controls && hasMml && (
        <div className="flex shrink-0 items-center gap-3 border-t border-gray-800/80 bg-gray-950/90 px-3 py-2">
          <button
            type="button"
            onClick={toggle}
            disabled={!ready && !playing}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30 active:scale-95 disabled:opacity-50"
            title={playing ? '停止' : '最初から再生'}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          
          <input
            ref={seekBarRef}
            type="range"
            min="0"
            max={Math.max(1, (songRef.current.totalBars || 1) * MV_STEPS_PER_BAR)}
            step="1"
            disabled={!ready}
            defaultValue="0"
            onPointerDown={() => {
              wasPlayingRef.current = playing;
              if (playing) stop(false);
            }}
            onPointerUp={(e) => {
              if (wasPlayingRef.current) {
                const step = Number(e.currentTarget.value);
                play(step);
              }
            }}
            onChange={handleSeek}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/30 accent-blue-500 hover:h-2 transition-all focus:outline-none"
          />
          
          <span ref={timeDisplayRef} className="w-9 shrink-0 text-right font-mono text-[11px] text-gray-200">
            0:00
          </span>
        </div>
      )}
    </div>
  );
});

export default MvPlayer;
