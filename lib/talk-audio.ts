// かけあい動画の音。@onjmin/dtm の共有 studio（lib/dtm.ts）で読み上げる。
//
// - 全行を先に計画して長さを得る（planTalkCues）→ 時間軸（lib/talk-timeline.ts）。
// - 再生は AudioContext の時計を基準に、各行を studio.speak の `at` で先にすべて置く。
//   合成は届いた順に置かれるので、頭の数行が出来た時点で鳴り始め、後続は裏で追いつく。
// - 2 つ目の studio は作らない（サイト全体の音量は studio の masterGain に一本化されている）。

import type { SpeechHandle } from "@onjmin/dtm";
import { getStudio } from "./dtm";
import {
	collectTalkCustomVoices,
	emotionForExpression,
	type TalkEmotion,
	type TalkManifest,
	talkCharacterOf,
} from "./talk-config";
import type { TalkCuePlan, TalkTimeline } from "./talk-timeline";

export interface TalkVoiceNeeds {
	models: string[];
	emotions: TalkEmotion[];
}

/** 台本が必要とする音源と感情モデル（先取り用）。 */
export const collectTalkVoiceNeeds = (manifest: TalkManifest): TalkVoiceNeeds => {
	const models = new Set<string>();
	const emotions = new Set<TalkEmotion>();
	for (const cue of manifest.cues) {
		const ch = talkCharacterOf(manifest, cue.speaker);
		if (!ch) continue;
		models.add(ch.voice.model);
		const emotion = cue.emotion ?? emotionForExpression(cue.expression);
		if (emotion !== "neutral") emotions.add(emotion);
	}
	return { models: [...models], emotions: [...emotions] };
};

/**
 * 台本のカスタム音源（持ち込みの .koe）を studio のカタログへ登録する。
 * 読み上げ・計画・先取りはどれもカタログを引くので、その前に必ず通すこと。
 * 内蔵音源しか使っていなければ何もしない。
 */
export async function registerTalkVoicebanks(
	manifest: TalkManifest,
): Promise<void> {
	const banks = collectTalkCustomVoices(manifest);
	if (Object.keys(banks).length === 0) return;
	try {
		const studio = await getStudio();
		studio.singingVoices.registerVoicebanks?.(banks);
	} catch (e) {
		console.warn("[talk] カスタム音源の登録に失敗しました", e);
	}
}

/** TTS アセット（初回約 43MB）・音源マニフェスト・感情モデルを先に取る。失敗しても投げない。 */
export async function prepareTalkVoice(
	manifest: TalkManifest,
	onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
	const needs = collectTalkVoiceNeeds(manifest);
	if (needs.models.length === 0) return;
	await registerTalkVoicebanks(manifest);
	try {
		const studio = await getStudio();
		await studio.prepareSpeech(needs.models, {
			emotions: needs.emotions,
			onProgress,
		});
	} catch (e) {
		console.warn("[talk] 読み上げの準備に失敗しました", e);
	}
}

/**
 * 全行の読み上げを計画して長さとモーラ列を得る。計画できない行は null。
 * 計画はメインスレッドで 1 行数十 ms なので順に回す（同時に投げても直列化されるだけ）。
 */
export async function planTalkCues(
	manifest: TalkManifest,
	onProgress?: (done: number, total: number) => void,
): Promise<Map<string, TalkCuePlan | null>> {
	const out = new Map<string, TalkCuePlan | null>();
	await registerTalkVoicebanks(manifest);
	let studio: Awaited<ReturnType<typeof getStudio>> | null = null;
	try {
		studio = await getStudio();
	} catch (e) {
		console.warn("[talk] studio の初期化に失敗しました", e);
	}
	let done = 0;
	for (const cue of manifest.cues) {
		const ch = talkCharacterOf(manifest, cue.speaker);
		const body = cue.text.trim();
		let plan: TalkCuePlan | null = null;
		if (studio && ch && body) {
			try {
				plan = await studio.planSpeech(body, {
					model: ch.voice.model,
					style: ch.voice.style ?? "neutral",
					emotion: cue.emotion ?? emotionForExpression(cue.expression),
				});
			} catch (e) {
				console.warn("[talk] 計画に失敗しました", cue.id, e);
			}
		}
		out.set(cue.id, plan);
		done++;
		onProgress?.(done, manifest.cues.length);
	}
	return out;
}

export interface TalkSpeechSession {
	/** 時間軸の 0 秒に対応する AudioContext クロック秒。 */
	t0: number;
	/** 進行中の発話をすべて止める。 */
	stop: () => void;
}

/**
 * 時間軸の fromIndex 行目以降を、AudioContext クロック上に先にすべてスケジュールする。
 * 戻り値の t0 は「時間軸の 0 秒」に対応する絶対時刻（fromIndex 行の頭が startAt に来る）。
 * ユーザー操作のコールスタック内から呼ぶこと（自動再生ポリシー）。
 */
export async function scheduleTalkSpeech(
	manifest: TalkManifest,
	timeline: TalkTimeline,
	fromIndex: number,
	leadSec = 0.3,
): Promise<TalkSpeechSession> {
	await registerTalkVoicebanks(manifest);
	const studio = await getStudio();
	const ctx = studio.audioContext;
	if (ctx.state === "suspended") {
		try {
			await ctx.resume();
		} catch {}
	}
	const first = timeline.cues[fromIndex];
	const startOffset = first ? first.startSec : 0;
	const t0 = ctx.currentTime + leadSec - startOffset;
	const abort = new AbortController();
	const handles: SpeechHandle[] = [];
	let stopped = false;
	for (const entry of timeline.cues.slice(fromIndex)) {
		if (!entry.voiced) continue;
		const ch = talkCharacterOf(manifest, entry.cue.speaker);
		if (!ch) continue;
		void studio
			.speak(entry.cue.text.trim(), {
				model: ch.voice.model,
				pitchOffset: ch.voice.pitchOffset ?? 0,
				style: ch.voice.style ?? "neutral",
				emotion: entry.cue.emotion ?? emotionForExpression(entry.cue.expression),
				at: t0 + entry.startSec,
				signal: abort.signal,
			})
			.then((h) => {
				if (!h) return;
				if (stopped) {
					h.stop();
					return;
				}
				handles.push(h);
			});
	}
	return {
		t0,
		stop: () => {
			if (stopped) return;
			stopped = true;
			abort.abort();
			for (const h of handles) h.stop();
			handles.length = 0;
		},
	};
}
