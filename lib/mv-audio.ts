// MVの音の出し方。@onjmin/dtm の3つの再生経路を1つのインターフェースへまとめる。
//
//   light        … playMML（内蔵の矩形波シンセ）。音源のダウンロードが無いので即鳴る。
//   soundfont    … studio.play（SoundFont の楽器音）。歌詞トラックも楽器として鳴る。
//   soundfontKoe … studio.play ＋ playSingingMML。楽器はSoundFont、歌詞トラックは歌声。既定。
//
// どのモードでも onTick（＝音声スケジューラのステップ）を返すので、描画側の同期方法は変わらない。
//
// 音量: 3経路とも getStudio() が返す共有 studio（同じ AudioContext / masterGain）上で鳴らす。
// サイト全体の音量（読者の好み）は getStudio() 内で studio.setMasterVolume() に一本化済みなので、
// ここでは MML の `#volume=` に一切触れない。曲データの音量は書き換えずそのまま渡す。

import type { MmlPlayback } from "@onjmin/dtm";
import { getStudio } from "./dtm";
import type { MvAudioMode } from "./mv-config";

export interface MvPlaybackOptions {
	mode: MvAudioMode;
	startStep?: number;
	onTick: (step: number) => void;
	onStop: () => void;
}

export interface MvPlaybackHandle {
	stop: () => void;
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
	const { mode, startStep, onTick, onStop } = options;

	if (mode === "light") {
		const { playMML } = await import("@onjmin/dtm");
		const studio = await getStudio();
		const playback = playMML(mml, {
			audioContext: studio.audioContext,
			destination: studio.masterGain,
			startStep,
			synth: true,
			onTick,
			onStop,
		});
		return handleOf([playback]);
	}

	const studio = await getStudio();

	if (mode === "soundfont") {
		const playback = studio.play(mml, { startStep, onTick, onStop });
		return handleOf([playback]);
	}

	// soundfontKoe: 楽器（SoundFont）と歌声（koe）を同じ AudioContext 上で重ねる。
	// ライブラリ側の studio.playSingingMML に全て委譲し、同一スケジューラで再生します。
	try {
		const playback = await studio.playSingingMML(mml, {
			startStep,
			onTick,
			onStop,
		});
		return handleOf([playback]);
	} catch (e) {
		// 歌声モデルの読み込み等に失敗した場合は、楽器のみでフォールバック再生する
		const instruments = studio.play(mml, { startStep, onTick, onStop });
		return handleOf([instruments]);
	}
}

function handleOf(playbacks: MmlPlayback[]): MvPlaybackHandle {
	let stopped = false;
	return {
		stop: () => {
			if (stopped) return;
			stopped = true;
			for (const playback of playbacks) {
				try {
					playback.destroy();
				} catch {}
			}
		},
	};
}
