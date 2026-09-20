// かけあい動画の音。@onjmin/dtm の共有 studio（lib/dtm.ts）で読み上げる。
//
// - 全行を先に計画して長さを得る（planTalkCues）→ 時間軸（lib/talk-timeline.ts）。
// - 再生は AudioContext の時計を基準に、各行を studio.speak の `at` で先にすべて置く。
//   先頭の行だけは合成の完了を待ってから置き（待たないと頭が欠ける・無音になる）、
//   後続は届いたチャンクから順に置かれて、先頭の行が鳴っている間に裏で追いつく。
// - 2 つ目の studio は作らない（サイト全体の音量は studio の masterGain に一本化されている）。

import type { SpeechHandle } from "@onjmin/dtm";
import { getStudio } from "./dtm";
import {
	collectTalkCustomVoices,
	cueEmotion,
	cueStyle,
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
		const emotion = cueEmotion(cue);
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
					style: cueStyle(cue, ch),
					emotion: cueEmotion(cue),
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
 * 頭出しの余裕（秒）。合成が間に合えばこの分だけ待ってから鳴り始める。
 * dtm は予定時刻を過ぎてから届いたチャンクを「遅れたぶんを飛ばして」置くので、余裕が
 * 足りないと行の頭が欠け、丸ごと過ぎていれば捨てられて無音の行になる。
 */
const DEFAULT_TALK_LEAD_SEC = 0.6;

/**
 * 時間軸の fromIndex 行目以降を、AudioContext クロック上に先にすべてスケジュールする。
 * 戻り値の t0 は「時間軸の 0 秒」に対応する絶対時刻（fromIndex 行の頭が startAt に来る）。
 * ユーザー操作のコールスタック内から呼ぶこと（自動再生ポリシー）。
 *
 * 先頭の行だけは合成の完了を待ってから置く（`awaitRender`）。残りの行は届いたチャンクから
 * 順に置く従来どおりの方式で、先頭の行が鳴っている間に裏で追いつく。待っている間に
 * 予定時刻を過ぎていたら、実際に鳴り出す時刻（`SpeechHandle.startTime`）へ時間軸を合わせ直す
 * ので、絵と声がずれない。
 */
export async function scheduleTalkSpeech(
	manifest: TalkManifest,
	timeline: TalkTimeline,
	fromIndex: number,
	leadSec = DEFAULT_TALK_LEAD_SEC,
): Promise<TalkSpeechSession> {
	await registerTalkVoicebanks(manifest);
	const studio = await getStudio();
	const ctx = studio.audioContext;
	if (ctx.state === "suspended") {
		try {
			await ctx.resume();
		} catch {}
	}
	const rest = timeline.cues.slice(fromIndex);
	const startOffset = rest[0]?.startSec ?? 0;
	const abort = new AbortController();
	const handles: SpeechHandle[] = [];
	let stopped = false;
	const keep = (h: SpeechHandle | null): void => {
		if (!h) return;
		if (stopped) {
			h.stop();
			return;
		}
		handles.push(h);
	};
	const speakOptions = (entry: (typeof rest)[number], at: number) => {
		const ch = talkCharacterOf(manifest, entry.cue.speaker);
		if (!ch) return null;
		return {
			model: ch.voice.model,
			pitchOffset: ch.voice.pitchOffset ?? 0,
			style: cueStyle(entry.cue, ch),
			emotion: cueEmotion(entry.cue),
			at,
			signal: abort.signal,
		};
	};

	let t0 = ctx.currentTime + leadSec - startOffset;
	const head = rest.find(
		(c) => c.voiced && !!talkCharacterOf(manifest, c.cue.speaker),
	);
	if (head) {
		const opts = speakOptions(head, t0 + head.startSec);
		if (opts) {
			const handle = await studio
				.speak(head.cue.text.trim(), { ...opts, awaitRender: true })
				.catch((e) => {
					console.warn("[talk] 先頭の行の合成に失敗しました", e);
					return null;
				});
			if (handle) {
				// 合成が余裕に間に合わなかったときは startTime が予定より後になる。
				t0 = handle.startTime - head.startSec;
				keep(handle);
			}
		}
	}
	for (const entry of rest) {
		if (entry === head || !entry.voiced) continue;
		const opts = speakOptions(entry, t0 + entry.startSec);
		if (!opts) continue;
		void studio.speak(entry.cue.text.trim(), opts).then(keep, (e) => {
			console.warn("[talk] 読み上げに失敗しました", entry.cue.id, e);
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
