// 音MAD の時間軸。MML の音符（MvSong、ステップ単位）を秒のイベントに落とす。
// 設計: docs/otomad-feature-design.md §2
//
// 1 イベント = 1 音符。鳴らす素材・区間・再生速度・窓（slot）・反転までここで決めてしまい、
// 音（otomad-audio.ts）と絵（otomad-engine.ts）は同じイベント列を読むだけにする。
// 実時間再生とオフライン書き出しが同じ結果になるのはこのため。

import { MV_STEPS_PER_BEAT } from "@/lib/mv/mv-config";
import type { MvNote, MvSong } from "@/lib/mv/mv-engine";
import {
	type OtomadManifest,
	type OtomadSource,
	type OtomadTrack,
	playbackRateFor,
	resolveNoteSource,
	sourceHasAudio,
	sourceHasVisual,
} from "./otomad-config";

export interface OtomadEvent {
	/** 時間軸全体での連番。 */
	index: number;
	/** manifest.tracks のインデックス。 */
	trackIdx: number;
	/** MML の @n。 */
	track: number;
	/** そのトラックで何番目の音か（反転・slot の巡回に使う）。 */
	noteIdx: number;
	startSec: number;
	/** 音符の終わり（音が切られる時刻。length: sample なら素材区間の終わり）。 */
	endSec: number;
	/** 表示を終える時刻（show に従う。hold なら Infinity）。 */
	visibleUntilSec: number;
	/** MIDI ノート番号（小数可）。 */
	pitch: number;
	velocity: number;
	source: OtomadSource;
	/** 素材の使い始め（秒）。 */
	inSec: number;
	/** 素材の使い終わり（秒）。無ければ素材末尾。 */
	outSec: number | undefined;
	/** 再生速度（音程合わせ）。 */
	rate: number;
	/** 使う slot のインデックス。 */
	slot: number;
	flip: boolean;
	/** 音を鳴らすか（素材に音があり、トラックがミュートでない）。 */
	hasAudio: boolean;
	/** 窓を出すか。 */
	hasVisual: boolean;
}

export interface OtomadTimeline {
	bpm: number;
	secPerStep: number;
	/** startSec 昇順。 */
	events: OtomadEvent[];
	/** トラックごと（manifest.tracks のインデックス → イベント、startSec 昇順）。 */
	byTrack: OtomadEvent[][];
	/** 曲の長さ（秒。lead-in と最後の音の余韻 0.5 秒を含む）。 */
	totalSec: number;
	/** 小節の頭（秒）。シークバーの目盛り用。 */
	barSec: number[];
	/** 各トラックの音高の中央値（pitchY の基準）。 */
	trackCenterPitch: number[];
}

export const EMPTY_OTOMAD_TIMELINE: OtomadTimeline = {
	bpm: 120,
	secPerStep: 60 / 120 / MV_STEPS_PER_BEAT,
	events: [],
	byTrack: [],
	totalSec: 0,
	barSec: [],
	trackCenterPitch: [],
};

/** 固定シードの疑似乱数（pick: random を再現可能にする）。 */
const hashRandom = (a: number, b: number): number => {
	let h = (a * 374761393 + b * 668265263) | 0;
	h = (h ^ (h >>> 13)) * 1274126177;
	h = h ^ (h >>> 16);
	return ((h >>> 0) % 10000) / 10000;
};

const median = (xs: number[]): number => {
	if (xs.length === 0) return 60;
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
};

/** トラック内で同時に鳴る音を「和音の中の何番目か」で分ける（slot の巡回に足す）。 */
const chordOffset = (notes: MvNote[], i: number): number => {
	let k = 0;
	for (let j = i - 1; j >= 0 && notes[j].startStep === notes[i].startStep; j--) k++;
	return k;
};

export const buildOtomadTimeline = (manifest: OtomadManifest, song: MvSong): OtomadTimeline => {
	const bpm = song.bpm > 0 ? song.bpm : 120;
	const secPerStep = 60 / bpm / MV_STEPS_PER_BEAT;
	const lead = Math.max(0, manifest.leadInSec || 0);
	const events: OtomadEvent[] = [];
	const byTrack: OtomadEvent[][] = manifest.tracks.map(() => []);
	const trackCenterPitch: number[] = manifest.tracks.map((t) =>
		median((song.byTrack.get(t.track) ?? []).map((n) => n.pitch)),
	);

	manifest.tracks.forEach((track: OtomadTrack, trackIdx) => {
		const notes = song.byTrack.get(track.track) ?? [];
		const list = byTrack[trackIdx];
		notes.forEach((n, i) => {
			const resolved = resolveNoteSource(manifest, track, n.pitch);
			if (!resolved) return;
			const { source, inSec, outSec } = resolved;
			const rate = playbackRateFor(track, source, n.pitch);
			const startSec = lead + n.startStep * secPerStep;
			const noteLen = Math.max(0.02, n.durationSteps * secPerStep);
			let endSec = startSec + noteLen;
			if (track.audio.length === "sample") {
				const avail =
					outSec !== undefined
						? Math.max(0.02, outSec - inSec)
						: source.durationSec !== undefined
							? Math.max(0.02, source.durationSec - inSec)
							: noteLen;
				endSec = startSec + avail / rate;
			}
			const slots = track.visual.slots.length;
			let slot = 0;
			if (slots > 1) {
				const k = chordOffset(notes, i);
				switch (track.visual.pick) {
					case "cycle":
						slot = (i + k) % slots;
						break;
					case "pitch": {
						const lo = song.pitchMin;
						const hi = song.pitchMax;
						const r = hi > lo ? (n.pitch - lo) / (hi - lo) : 0.5;
						slot = Math.min(slots - 1, Math.floor(r * slots));
						break;
					}
					case "velocity":
						slot = Math.min(slots - 1, Math.floor((n.velocity / 128) * slots));
						break;
					case "random":
						slot = (Math.floor(hashRandom(track.track, i) * slots) + k) % slots;
						break;
				}
			}
			list.push({
				index: 0,
				trackIdx,
				track: track.track,
				noteIdx: i,
				startSec,
				endSec,
				visibleUntilSec: endSec,
				pitch: n.pitch,
				velocity: n.velocity,
				source,
				inSec,
				outSec,
				rate,
				slot,
				flip: track.visual.flipAlternate && i % 2 === 1,
				hasAudio: !track.muted && sourceHasAudio(source),
				hasVisual: track.visual.kind === "window" && sourceHasVisual(source),
			});
		});
		// 表示の終わり
		for (let i = 0; i < list.length; i++) {
			const ev = list[i];
			switch (track.visual.show) {
				case "note":
					ev.visibleUntilSec = ev.endSec;
					break;
				case "untilNext": {
					// 次に始まる（同時でない）音の頭まで
					let next: OtomadEvent | undefined;
					for (let j = i + 1; j < list.length; j++) {
						if (list[j].startSec > ev.startSec + 1e-6) {
							next = list[j];
							break;
						}
					}
					ev.visibleUntilSec = next ? Math.max(ev.endSec, next.startSec) : ev.endSec + 2;
					break;
				}
				case "hold":
					ev.visibleUntilSec = Number.POSITIVE_INFINITY;
					break;
			}
		}
		events.push(...list);
	});

	events.sort((a, b) => a.startSec - b.startSec || a.trackIdx - b.trackIdx);
	events.forEach((e, i) => {
		e.index = i;
	});

	const songEnd = lead + song.totalSteps * secPerStep;
	const lastAudio = events.reduce((m, e) => Math.max(m, e.endSec), 0);
	const totalSec = Math.max(songEnd, lastAudio) + 0.5;
	const secPerBar = secPerStep * MV_STEPS_PER_BEAT * 4;
	const barSec: number[] = [];
	for (let b = 0; b <= song.totalBars; b++) barSec.push(lead + b * secPerBar);

	return { bpm, secPerStep, events, byTrack, totalSec, barSec, trackCenterPitch };
};

/** 時刻 t に見えているイベント（トラック順 → 開始順）。 */
export const visibleEventsAt = (tl: OtomadTimeline, t: number): OtomadEvent[] => {
	const out: OtomadEvent[] = [];
	for (const list of tl.byTrack) {
		for (const ev of list) {
			if (ev.startSec > t) break;
			if (!ev.hasVisual) continue;
			if (t < ev.visibleUntilSec) out.push(ev);
		}
	}
	return out;
};

/** 素材ごとに、映像で必要になる区間（秒）の和集合。コマ取りの範囲。 */
export const requiredVideoRanges = (
	tl: OtomadTimeline,
	manifest: OtomadManifest,
): Map<string, Array<[number, number]>> => {
	const ranges = new Map<string, Array<[number, number]>>();
	for (const ev of tl.events) {
		if (!ev.hasVisual || ev.source.kind !== "video") continue;
		const track = manifest.tracks[ev.trackIdx];
		const shownSec = Math.min(ev.visibleUntilSec, ev.startSec + 30) - ev.startSec;
		const speed = track.visual.stretch ? ev.rate : 1;
		const from = ev.inSec;
		let to = ev.inSec + shownSec * speed;
		if (ev.outSec !== undefined) to = Math.min(to, ev.outSec);
		if (ev.source.durationSec !== undefined) to = Math.min(to, ev.source.durationSec);
		if (to <= from) continue;
		const list = ranges.get(ev.source.id) ?? [];
		list.push([from, to]);
		ranges.set(ev.source.id, list);
	}
	for (const [id, list] of ranges) {
		list.sort((a, b) => a[0] - b[0]);
		const merged: Array<[number, number]> = [];
		for (const r of list) {
			const last = merged[merged.length - 1];
			if (last && r[0] <= last[1] + 1 / 30) last[1] = Math.max(last[1], r[1]);
			else merged.push([r[0], r[1]]);
		}
		ranges.set(id, merged);
	}
	return ranges;
};

/** 素材の映像位置（秒）。stretch なら音符の経過 × 再生速度。 */
export const mediaTimeOf = (ev: OtomadEvent, track: OtomadTrack, t: number): number => {
	const elapsed = Math.max(0, t - ev.startSec);
	const pos = ev.inSec + elapsed * (track.visual.stretch ? ev.rate : 1);
	return ev.outSec !== undefined ? Math.min(pos, ev.outSec - 1e-3) : pos;
};
