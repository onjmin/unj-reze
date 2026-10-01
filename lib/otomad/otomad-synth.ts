// MML を簡易シンセでオフライン合成して原曲（off vocal）の WAV にする。設計: docs/otomad-feature-design.md §4
//
// dtm の SoundFont 再生は実時間（録音には曲の長さぶん掛かり、裏タブでは止まる）なので、
// 「すぐ・無音で」原曲が欲しいときの代替。OfflineAudioContext に発振器＋エンベロープを置くだけの
// 素朴なシンセで、音は chiptune 寄り。音質が要るときは recordMmlBacking（SoundFont の実時間録音）を使う。
// MML の音符は parseMvSong（lib/mv/mv-engine.ts）の MvSong から取る。

import type { MvSong } from "@/lib/mv/mv-engine";
import { MV_STEPS_PER_BEAT } from "@/lib/mv/mv-config";

/** トラックの音域から波形を決める（低いほど丸い音）。 */
const waveFor = (medianPitch: number): OscillatorType =>
	medianPitch < 48 ? "triangle" : medianPitch < 66 ? "square" : "sawtooth";

const median = (xs: number[]): number => {
	if (xs.length === 0) return 60;
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
};

/**
 * excludeTracks 以外のトラックを合成する。戻り値は 44.1kHz ステレオの AudioBuffer。
 * 曲の 0 秒 = バッファの 0 秒（backing.offsetSec は 0 でよい）。
 */
export const renderSynthBacking = async (
	song: MvSong,
	excludeTracks: number[],
	options: { sampleRate?: number; tailSec?: number } = {},
): Promise<AudioBuffer> => {
	const sampleRate = options.sampleRate ?? 44100;
	const secPerStep = 60 / Math.max(1, song.bpm) / MV_STEPS_PER_BEAT;
	const totalSec = song.totalSteps * secPerStep + (options.tailSec ?? 1.5);
	const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(totalSec * sampleRate)), sampleRate);
	const master = ctx.createGain();
	master.gain.value = 0.5;
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -12;
	comp.ratio.value = 6;
	master.connect(comp);
	comp.connect(ctx.destination);
	// 軽いローパスで鋸歯波の耳障りさを取る
	const lp = ctx.createBiquadFilter();
	lp.type = "lowpass";
	lp.frequency.value = 6000;
	lp.connect(master);

	const drop = new Set(excludeTracks);
	for (const trackId of song.tracks) {
		if (drop.has(trackId)) continue;
		const notes = song.byTrack.get(trackId) ?? [];
		if (notes.length === 0) continue;
		const wave = waveFor(median(notes.map((n) => n.pitch)));
		// 同時発音数が多いトラック（和音・パッド）は 1 音を小さく
		const poly = Math.max(1, Math.round(notes.length / Math.max(1, new Set(notes.map((n) => n.startStep)).size)));
		const trackGain = ctx.createGain();
		trackGain.gain.value = (wave === "sawtooth" ? 0.18 : wave === "square" ? 0.16 : 0.25) / Math.sqrt(poly);
		trackGain.connect(lp);
		for (const n of notes) {
			const start = n.startStep * secPerStep;
			const dur = Math.max(0.03, n.durationSteps * secPerStep);
			const osc = ctx.createOscillator();
			osc.type = wave;
			osc.frequency.value = 440 * 2 ** ((n.pitch - 69) / 12);
			const g = ctx.createGain();
			const vel = Math.max(0.1, Math.min(1, n.velocity / 100));
			const attack = 0.005;
			const release = Math.min(0.08, dur * 0.4);
			g.gain.setValueAtTime(0, start);
			g.gain.linearRampToValueAtTime(vel, start + attack);
			g.gain.setValueAtTime(vel, start + Math.max(attack, dur - release));
			g.gain.linearRampToValueAtTime(0, start + dur);
			osc.connect(g);
			g.connect(trackGain);
			osc.start(start);
			osc.stop(start + dur + 0.01);
		}
	}
	return ctx.startRendering();
};

/** AudioBuffer → 16bit PCM WAV。 */
export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
	const ch = Math.min(2, buffer.numberOfChannels);
	const n = buffer.length;
	const bytes = new ArrayBuffer(44 + n * ch * 2);
	const v = new DataView(bytes);
	const str = (o: number, s: string) => {
		for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
	};
	str(0, "RIFF");
	v.setUint32(4, 36 + n * ch * 2, true);
	str(8, "WAVE");
	str(12, "fmt ");
	v.setUint32(16, 16, true);
	v.setUint16(20, 1, true);
	v.setUint16(22, ch, true);
	v.setUint32(24, buffer.sampleRate, true);
	v.setUint32(28, buffer.sampleRate * ch * 2, true);
	v.setUint16(32, ch * 2, true);
	v.setUint16(34, 16, true);
	str(36, "data");
	v.setUint32(40, n * ch * 2, true);
	const chans = Array.from({ length: ch }, (_, i) => buffer.getChannelData(i));
	let o = 44;
	for (let i = 0; i < n; i++) {
		for (let c = 0; c < ch; c++) {
			const s = Math.max(-1, Math.min(1, chans[c][i]));
			v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
			o += 2;
		}
	}
	return new Blob([bytes], { type: "audio/wav" });
};
