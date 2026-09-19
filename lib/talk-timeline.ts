// かけあい動画の時間軸。台本の各行の長さ（読み上げの計画から得た秒数）を順に並べるだけ。
// 計画は lib/talk-audio.ts の planTalkCues() が行い、ここは純粋な組み立てと検索。

import type { SpeechMora } from "@onjmin/dtm";
import {
	DEFAULT_TALK_GAP_SEC,
	estimateCueSec,
	type TalkCue,
	type TalkManifest,
} from "./talk-config";

/** 1 行ぶんの計画結果（dtm の SpeechPlanInfo と同じ形。null は読み上げ不能）。 */
export interface TalkCuePlan {
	durationSec: number;
	morae: SpeechMora[];
}

export interface TalkTimelineCue {
	cue: TalkCue;
	index: number;
	/** 行の頭（秒）。 */
	startSec: number;
	/** 読み上げが音を占める長さ（秒）。 */
	durationSec: number;
	/** 行の後の間（秒）。 */
	gapSec: number;
	/** 次の行の頭（= startSec + durationSec + gapSec）。 */
	endSec: number;
	/** 読み上げの計画があるか（無ければ字幕だけ出す）。 */
	voiced: boolean;
	morae: SpeechMora[];
}

export interface TalkTimeline {
	cues: TalkTimelineCue[];
	totalSec: number;
}

/**
 * 台本と各行の計画から時間軸を組む。計画が無い行は文字数からの推定長で代用する。
 */
export function buildTalkTimeline(
	manifest: TalkManifest,
	plans: ReadonlyMap<string, TalkCuePlan | null>,
): TalkTimeline {
	const cues: TalkTimelineCue[] = [];
	let t = 0;
	manifest.cues.forEach((cue, index) => {
		const plan = plans.get(cue.id) ?? null;
		const durationSec = plan
			? Math.max(0.2, plan.durationSec)
			: estimateCueSec(cue.text);
		const gapSec = Math.max(0, cue.gapSec ?? DEFAULT_TALK_GAP_SEC);
		const entry: TalkTimelineCue = {
			cue,
			index,
			startSec: t,
			durationSec,
			gapSec,
			endSec: t + durationSec + gapSec,
			voiced: !!plan,
			morae: plan?.morae ?? [],
		};
		cues.push(entry);
		t = entry.endSec;
	});
	return { cues, totalSec: t };
}

/** 時刻 t にある行（間の区間は直前の行に属する）。範囲外は null。 */
export function cueAt(
	timeline: TalkTimeline,
	t: number,
): TalkTimelineCue | null {
	if (t < 0) return null;
	let lo = 0;
	let hi = timeline.cues.length - 1;
	let found: TalkTimelineCue | null = null;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const c = timeline.cues[mid];
		if (c.startSec <= t) {
			found = c;
			lo = mid + 1;
		} else hi = mid - 1;
	}
	if (!found || t >= found.endSec) return null;
	return found;
}

/** 行の中で今鳴っているモーラ（無ければ null）。t は行の頭からの秒。 */
export function moraAt(
	morae: readonly SpeechMora[],
	tInCue: number,
): SpeechMora | null {
	for (const m of morae) {
		if (tInCue >= m.startSec && tInCue < m.endSec) return m;
		if (m.startSec > tInCue) break;
	}
	return null;
}
