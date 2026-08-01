// MVの音の出し方。@onjmin/dtm の3つの再生経路を1つのインターフェースへまとめる。
//
//   light        … playMML（内蔵の矩形波シンセ）。音源のダウンロードが無いので即鳴る。
//   soundfont    … studio.play（SoundFont の楽器音）。歌詞トラックも楽器として鳴る。
//   soundfontKoe … studio.play ＋ playSingingMML。楽器はSoundFont、歌詞トラックは歌声。既定。
//
// どのモードでも onTick（＝音声スケジューラのステップ）を返すので、描画側の同期方法は変わらない。

import type { MmlPlayback } from '@onjmin/dtm';
import { getStudio } from './dtm';
import type { MvAudioMode } from './mv-config';

export interface MvPlaybackOptions {
  mode: MvAudioMode;
  /** 0-100 */
  volume: number;
  onTick: (step: number) => void;
  onStop: () => void;
}

export interface MvPlaybackHandle {
  stop: () => void;
  setVolume: (v: number) => void;
}

/**
 * MMLから歌詞トラック(@@n)が担当する演奏トラック(@n)を取り除く。
 *
 * soundfontKoe では「楽器＝SoundFont」「歌＝koe」を別々の再生で重ねるが、
 * 歌詞トラックの音符まで SoundFont で鳴らすと歌と楽器が二重に鳴ってしまう。
 * @onjmin/dtm の正典（mountMmlPlayer）も歌詞トラックの楽器発音はスキップするので、
 * それに合わせて楽器側の入力から当該トラックを落とす。
 */
export function stripLyricPerformanceTracks(mml: string, lyricTrackIds: number[]): string {
  if (lyricTrackIds.length === 0) return mml;
  const drop = new Set(lyricTrackIds);
  return mml
    .split(';')
    .filter(seg => {
      // 先頭の空白・改行を無視して "@<数字>" を見る。@@ で始まる歌詞行は対象外。
      const m = seg.match(/^\s*@(\d+)\b/);
      if (!m) return true;
      return !drop.has(Number(m[1]));
    })
    .join(';');
}

/**
 * MVの再生を開始する。呼び出し元はユーザー操作のコールスタック内から呼ぶこと
 * （ブラウザの自動再生ポリシーのため）。
 */
export async function startMvPlayback(
  mml: string,
  lyricTrackIds: number[],
  options: MvPlaybackOptions,
): Promise<MvPlaybackHandle> {
  const { mode, volume, onTick, onStop } = options;

  if (mode === 'light') {
    const { playMML } = await import('@onjmin/dtm');
    const playback = playMML(mml, { volume, synth: true, onTick, onStop });
    return handleOf([playback]);
  }

  const studio = await getStudio();

  if (mode === 'soundfont') {
    const playback = studio.play(mml, { volume, onTick, onStop });
    return handleOf([playback]);
  }

  // soundfontKoe: 楽器（SoundFont）と歌声（koe）を同じ AudioContext 上で重ねる。
  // 同じ tick で start するので、両者のスケジューラは同一クロックの同じ地点から走る。
  const { playSingingMML } = await import('@onjmin/dtm');
  const instrumentMml = stripLyricPerformanceTracks(mml, lyricTrackIds);

  // 進行のクロックは楽器側から取る（歌声側は onTick を出さない設定で走らせる）
  const instruments = studio.play(instrumentMml, { volume, onTick, onStop });

  let vocals: MmlPlayback | null = null;
  try {
    vocals = await playSingingMML(mml, {
      audioContext: studio.audioContext,
      singingVoices: studio.singingVoices,
      volume,
      // 楽器は上の studio.play が担当するので、こちらは歌だけ鳴らす
      synth: false,
    });
  } catch (e) {
    // 歌声の準備に失敗しても楽器だけで再生を続ける（無音になるより良い）
    console.error('[mv-audio] singing playback failed; continuing with instruments only', e);
  }

  return handleOf(vocals ? [instruments, vocals] : [instruments]);
}

function handleOf(playbacks: MmlPlayback[]): MvPlaybackHandle {
  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      for (const p of playbacks) {
        try { p.destroy(); } catch { /* すでに閉じている場合は無視 */ }
      }
    },
    setVolume: (v: number) => {
      for (const p of playbacks) {
        try { p.setVolume(v); } catch { /* 停止済みなら無視 */ }
      }
    },
  };
}
