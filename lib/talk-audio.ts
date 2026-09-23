// かけあい動画の音。@onjmin/dtm の共有 studio（lib/dtm.ts）で読み上げる。
//
// - 全行を先に計画して長さを得る（planTalkCues）→ 時間軸（lib/talk-timeline.ts）。
//   初回はその前に最初の行の合成を鳴らさずに始めておき（prerenderTalkHead）、計画と重ねる。
// - 再生は AudioContext の時計を基準に、各行を studio.speak の `at` で 1 行ずつ、鳴る少し前に
//   置く（scheduleTalkSpeech）。どの行も最初のチャンクが出来てから頭から鳴らし、合成が
//   追いつかなければ声を後ろへずらす。絵の時間軸（t0）は声に合わせて動かす。
// - 2 つ目の studio は作らない（サイト全体の音量は studio の masterGain に一本化されている）。

import type { SpeechHandle } from "@onjmin/dtm";
import { getStudio, speechMinBufferSec } from "./dtm";
import {
	collectTalkCustomVoices,
	cueEmotion,
	cueStyle,
	type TalkCharacter,
	type TalkCue,
	type TalkEmotion,
	type TalkManifest,
	talkCharacterOf,
} from "./talk-config";
import type {
	TalkCuePlan,
	TalkTimeline,
	TalkTimelineCue,
} from "./talk-timeline";

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
 * 行を読み上げるときの声・話し方・感情（`studio.speak` のオプション）。dtm は合成した音を
 * 本文・声の高さ・話し方・感情ごとに取っておくので、先合成（{@link prerenderTalkHead}）と
 * 本番（{@link scheduleTalkSpeech}）で必ずこれを使って同じにする。
 */
const cueVoiceOptions = (cue: TalkCue, ch: TalkCharacter) => ({
	model: ch.voice.model,
	pitchOffset: ch.voice.pitchOffset ?? 0,
	style: cueStyle(cue, ch),
	emotion: cueEmotion(cue),
});

/** 先合成の発話を置いておく先（秒）。すぐ止めるので鳴らない。 */
const PRERENDER_PARK_SEC = 3600;

/**
 * 最初の行の合成を、鳴らさずに先に始めておく。初回の再生で、全行の計画（メインスレッド）と
 * 最初の行の合成（voice worker）を重ねる。重ねないと、計画が終わってから最初のチャンク
 * （＋minBufferSec）の合成を待つ。それが頭出しの余裕（{@link DEFAULT_TALK_LEAD_SEC}）より長いとき
 * （遅い音源・重い端末）に鳴り出しが早まる。速いときは余裕のほうが長いので変わらない。
 *
 * dtm の合成は発話ハンドルとは別に最後まで進み、同じ行を後で読み上げるとその音から置く
 * （置き直しと同じ仕組み）。鳴らさないために遠い先へ置いて、計画が出来たらすぐ止める。
 * 計画（数十 ms）が済むまで待って返るので、このあと全行を計画すればこの行の合成が先に始まる。
 * 失敗しても投げない。
 */
export async function prerenderTalkHead(manifest: TalkManifest): Promise<void> {
	for (const cue of manifest.cues) {
		const ch = talkCharacterOf(manifest, cue.speaker);
		const text = cue.text.trim();
		if (!ch || !text) continue;
		try {
			await registerTalkVoicebanks(manifest);
			const studio = await getStudio();
			const h = await studio.speak(text, {
				...cueVoiceOptions(cue, ch),
				at: studio.audioContext.currentTime + PRERENDER_PARK_SEC,
			});
			h?.stop();
		} catch (e) {
			console.warn("[talk] 最初の行の先合成に失敗しました", cue.id, e);
		}
		return;
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
	/**
	 * 時間軸の 0 秒に対応する AudioContext クロック秒（読むたびに今の値）。声が予定より遅れて
	 * 鳴り出したり、合成待ちで行の途中に間が空いたりすると後ろへ動く（絵を声に合わせる）。
	 */
	readonly t0: number;
	/**
	 * 今の時間軸上の秒（絵・字幕・口パクはこれで引く）。鳴っている行では声の再生位置
	 * （`SpeechHandle.position()`）に合わせて進み、次の行の声がまだ鳴っていなければ
	 * その行の頭で待つ。単調非減少。
	 */
	timeSec: () => number;
	/** 進行中の発話をすべて止める。 */
	stop: () => void;
}

/**
 * 頭出しの余裕（秒）。先頭の行はこれより早くは鳴らさない（プレイヤーが描画を始める猶予）。
 * 最初のチャンクの合成がこれに間に合わなければ、出来た時点から頭を欠かさずに鳴らし、
 * 時間軸をそこへ合わせる（`awaitRender: "first-chunk"`）。
 */
const DEFAULT_TALK_LEAD_SEC = 0.2;

/**
 * 次の行を投げる（合成を始める）のは、その行の予定時刻のこの秒数前から。voice worker は
 * 同時に投げた発話の合成を分け合うので、全行を先に投げると全部が再生に追いつかない
 * （追いつかなかった分は飛ばされて声が欠けていた）。1 行ずつ、鳴る少し前に投げる。
 * 最初のチャンク（＋minBufferSec）の合成が間に合う長さにしておく。
 */
const DISPATCH_AHEAD_SEC = 1.5;
/** 投げた行の鳴り出しが、今の時間軸での予定よりこれ以上早ければ置き直す。 */
const RESCHEDULE_EPS_SEC = 0.03;
/**
 * 置き直しの判断は鳴り出しのこの秒数前まで待つ（前の行はまだ後ろへずれるかもしれないので、
 * 決めるのは遅いほど置き直しが 1 回で済む）。
 */
const RESCHEDULE_HORIZON_SEC = 0.3;
/** 次の行を投げる判定の間隔（ms）。描画ループとは別に回す（rAF が止まっても声は進むので）。 */
const PUMP_INTERVAL_MS = 50;

/** 読み上げる行 1 つぶんの発話の状態。 */
interface TalkLineSlot {
	entry: TalkTimelineCue;
	ch: TalkCharacter;
	/** 鳴らし始めた（鳴り出しの時刻が決まった）発話。 */
	handle: SpeechHandle | null;
	/** 投げて、鳴り出しが決まるのを待っている。 */
	pending: boolean;
	/** 読み上げられなかった（null・失敗）。字幕だけの行として扱い、声を待たない。 */
	failed: boolean;
	/** 投げた世代（置き直したら古い結果を捨てる）。 */
	gen: number;
}

/**
 * 時間軸の fromIndex 行目以降を読み上げる。先頭の行の鳴り出しが決まったら返り、残りの行は
 * 鳴らしながら 1 行ずつ投げていく。時刻は戻り値の `timeSec()` で引く。
 * ユーザー操作のコールスタック内から呼ぶこと（自動再生ポリシー）。
 *
 * - どの行も `awaitRender: "first-chunk"` + `lateChunks: "shift"` で鳴らす。頭は欠けず、
 *   合成が追いつかなければ声は後ろへずれる（言葉は欠けない）。
 * - 絵は声に合わせる: 行が予定より遅れて鳴り出す・行の途中で後ろへずれると時間軸（t0）を
 *   後ろへ動かし、次の行の声がまだ鳴っていなければ絵はその行の頭で待つ。
 * - 次の行は、前の行の鳴り出しが決まってから、予定の {@link DISPATCH_AHEAD_SEC} 秒前に投げる。
 *   投げたあとで前の行がずれ込んだら、鳴り出す前に今の時間軸で置き直す（合成済みの音は
 *   dtm のキャッシュにあるので、置き直しは置くだけで済む）。
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
	let stopped = false;

	const slots: TalkLineSlot[] = [];
	for (const entry of rest) {
		if (!entry.voiced) continue;
		const ch = talkCharacterOf(manifest, entry.cue.speaker);
		if (!ch) continue;
		slots.push({
			entry,
			ch,
			handle: null,
			pending: false,
			failed: false,
			gen: 0,
		});
	}

	/** 時間軸の 0 秒に当たる AudioContext 秒（声に合わせて後ろへ動く）。 */
	let t0 = ctx.currentTime + leadSec - startOffset;
	/** timeSec() がこれまでに返した最大値（絵を後戻りさせない）。 */
	let shownSec = startOffset;

	/**
	 * 時間軸を声に合わせて、今の秒を返す。
	 * - 鳴り出したいちばん後ろの行: その声の再生位置（合成待ちで空いた間は進まない）に t0 を
	 *   合わせる。鳴り終えたらそのまま時計で進む。
	 * - その次の行: まだ鳴り出していなければ、絵はその行の頭で待つ（t0 を後ろへ）。
	 */
	const sync = (now: number): number => {
		let active: TalkLineSlot | null = null;
		let gate: TalkLineSlot | null = null;
		for (const s of slots) {
			if (s.failed) continue;
			if (s.handle && s.handle.position() >= 0) {
				active = s;
				continue;
			}
			gate = s;
			break;
		}
		if (active?.handle) {
			const pos = active.handle.position();
			if (pos <= active.handle.durationSec) {
				t0 = now - (active.entry.startSec + pos);
			}
		}
		let sec = now - t0;
		if (gate && sec > gate.entry.startSec) {
			t0 = now - gate.entry.startSec;
			sec = gate.entry.startSec;
		}
		shownSec = Math.max(shownSec, sec);
		return shownSec;
	};

	/** 行 s を鳴らしたい時刻。今の時間軸と、前の行の声の実際の位置（遅れ・ずれ込み）の遅いほう。 */
	const desiredAt = (s: TalkLineSlot, prev: TalkLineSlot | null): number => {
		let base = t0;
		if (prev?.handle) {
			const h = prev.handle;
			base = Math.max(base, h.startTime + h.shiftSec - prev.entry.startSec);
		}
		return base + s.entry.startSec;
	};

	const dispatch = (s: TalkLineSlot, at: number): Promise<void> => {
		const gen = ++s.gen;
		s.pending = true;
		s.handle = null;
		const { ch, entry } = s;
		return studio
			.speak(entry.cue.text.trim(), {
				...cueVoiceOptions(entry.cue, ch),
				at,
				awaitRender: "first-chunk",
				lateChunks: "shift",
				minBufferSec: speechMinBufferSec(ch.voice.model, !!ch.voice.custom),
				signal: abort.signal,
			})
			.catch((e: unknown) => {
				console.warn("[talk] 読み上げに失敗しました", entry.cue.id, e);
				return null;
			})
			.then((h) => {
				if (stopped || gen !== s.gen) {
					h?.stop();
					return;
				}
				s.pending = false;
				if (h) s.handle = h;
				else s.failed = true;
				pump();
			});
	};

	/** 次の行を投げる・投げた行を置き直す。 */
	const pump = (): void => {
		if (stopped) return;
		const now = ctx.currentTime;
		sync(now);
		let prev: TalkLineSlot | null = null;
		for (const s of slots) {
			if (s.failed) continue;
			// 1 行ずつ: 前の行の鳴り出しが決まるまで次を投げない。
			if (s.pending) return;
			const at = desiredAt(s, prev);
			const h = s.handle;
			if (!h) {
				if (at - now <= DISPATCH_AHEAD_SEC) void dispatch(s, at);
				return;
			}
			if (
				h.position() < 0 &&
				h.startTime < at - RESCHEDULE_EPS_SEC &&
				h.startTime - now < RESCHEDULE_HORIZON_SEC
			) {
				// 投げたあとで前の行がずれ込んだ。このままだと前の行に重なり、絵とも合わない。
				h.stop();
				void dispatch(s, at);
				return;
			}
			prev = s;
		}
	};

	// 先頭の行は鳴り出しが決まるまで待ってから返す（待つのは最初のチャンクの合成だけ）。
	const head = slots[0];
	if (head) await dispatch(head, desiredAt(head, null));
	const timer = setInterval(pump, PUMP_INTERVAL_MS);
	pump();

	return {
		get t0() {
			return t0;
		},
		timeSec: () => (stopped ? shownSec : sync(ctx.currentTime)),
		stop: () => {
			if (stopped) return;
			stopped = true;
			clearInterval(timer);
			abort.abort();
			for (const s of slots) s.handle?.stop();
		},
	};
}
