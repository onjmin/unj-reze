// MVの音の出し方。@onjmin/dtm の3つの再生経路を1つのインターフェースへまとめる。
//
//   light        … playMML（内蔵の矩形波シンセ）。音源のダウンロードが無いので即鳴る。
//   soundfont    … studio.play（SoundFont の楽器音）。歌詞トラックも楽器として鳴る。
//   soundfontKoe … studio.play ＋ playSingingMML。楽器はSoundFont、歌詞トラックは歌声。既定。
//
// どのモードでも onTick（＝音声スケジューラのステップ）を返すので、描画側の同期方法は変わらない。

import type { MmlPlayback } from '@onjmin/dtm';
import { getStudio } from './dtm';
import { effectiveMmlVolume, withMmlVolume } from './mml';
import type { MvAudioMode } from './mv-config';

export interface MvPlaybackOptions {
  mode: MvAudioMode;
  /** サイトのマスター音量 0-100（applyMasterVolume(100) の値をそのまま渡す）。 */
  volume: number;
  startStep?: number;
  onTick: (step: number) => void;
  onStop: () => void;
}

export interface MvPlaybackHandle {
  stop: () => void;
  /** サイトのマスター音量 0-100 を渡す。MML側の #volume= との合成は内部で面倒を見る。 */
  setVolume: (v: number) => void;
}

/**
 * @onjmin/dtm の音量規約は再生経路ごとに違うので、ここで吸収する。
 *
 *   playMML / playPlacements / studio.play … `metaVolume ?? options.volume ?? 100`
 *       → MMLに `#volume=` があると **options.volume は完全に無視される**。
 *   playSingingMML                         … `metaVolume/100 * (options.volume ?? 100)`
 *       → こちらは掛け算。
 *
 * そのまま両方へ同じ値を渡すと、楽器はサイト音量が効かず、歌声だけ二重に絞られる
 * （＝歌が楽器より不自然に小さくなる）。そこで:
 *   - 楽器側は MML の `#volume=` 自体を「MML音量 × サイト音量」へ書き換えて渡す
 *   - 歌声側は MML をそのままにして options.volume にサイト音量を渡す
 * どちらも最終的に「MML音量 × サイト音量」に揃う。
 */

// 実効音量の計算は lib/mml.ts に集約（ContentPicker の試聴と同じ規則を使う）。

/**
 * MVの再生を開始する。呼び出し元はユーザー操作のコールスタック内から呼ぶこと
 * （ブラウザの自動再生ポリシーのため）。
 */
export async function startMvPlayback(
  mml: string,
  lyricTrackIds: number[],
  options: MvPlaybackOptions,
): Promise<MvPlaybackHandle> {
  const { mode, volume, startStep, onTick, onStop } = options;
  // 楽器側は `#volume=` が options.volume を上書きしてしまうので、MML自体を書き換えて渡す
  const scaled = withMmlVolume(mml, effectiveMmlVolume(mml, volume));

  if (mode === 'light') {
    const { playMML } = await import('@onjmin/dtm');
    const playback = playMML(scaled, { volume, startStep, synth: true, onTick, onStop });
    return handleOf([{ playback, scaleWithMml: true }], mml);
  }

  const studio = await getStudio();

  if (mode === 'soundfont') {
    const playback = studio.play(scaled, { volume, startStep, onTick, onStop });
    return handleOf([{ playback, scaleWithMml: true }], mml);
  }

  // soundfontKoe: 楽器（SoundFont）と歌声（koe）を同じ AudioContext 上で重ねる。
  // ライブラリ側の studio.playSingingMML に全て委譲し、同一スケジューラで再生します。
  try {
    const playback = await studio.playSingingMML(mml, { volume, startStep, onTick, onStop });
    return handleOf([{ playback, scaleWithMml: true }], mml);
  } catch (e) {
    // 歌声モデルの読み込み等に失敗した場合は、楽器のみでフォールバック再生する
    console.error('[mv-audio] singing playback failed; falling back to instruments only', e);
    const instruments = studio.play(scaled, { volume, startStep, onTick, onStop });
    return handleOf([{ playback: instruments, scaleWithMml: true }], mml);
  }
}

interface TrackedPlayback {
  playback: MmlPlayback;
  /**
   * true  … setVolume には「MML音量 × サイト音量」を渡す（絶対値で上書きされる経路）
   * false … setVolume にはサイト音量をそのまま渡す（内部で MML音量 と掛け算される経路）
   */
  scaleWithMml: boolean;
}

function handleOf(playbacks: TrackedPlayback[], sourceMml: string): MvPlaybackHandle {
  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      for (const { playback } of playbacks) {
        try { playback.destroy(); } catch { /* すでに閉じている場合は無視 */ }
      }
    },
    setVolume: (siteVolume: number) => {
      for (const { playback, scaleWithMml } of playbacks) {
        const v = scaleWithMml ? effectiveMmlVolume(sourceMml, siteVolume) : siteVolume;
        try { playback.setVolume(v); } catch { /* 停止済みなら無視 */ }
      }
    },
  };
}
