#!/usr/bin/env node
// 音MAD の見本で使う内蔵素材（オリジナル合成音）を public/assets/otomad/*.wav に書き出す。
//
// 他者の映像・音声は同梱しない方針（docs/otomad-feature-design.md §0）なので、見本の「声」は
// フォルマント合成の母音、「打楽器」はノイズと正弦波の合成で作る。22050Hz / モノラル / 16bit PCM。
// 固定シードなので何度実行しても同じバイト列になる。
//
// 実行: node scripts/make-otomad-samples.mjs
// ファイル名と baseNote の対応は lib/otomad/otomad-presets.ts が持つ。ここで音を足したらそちらにも足すこと。

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 22050;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "otomad");

function makeRng(seed) {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** 2 次の共振フィルタ（フォルマント 1 本ぶん）。 */
function resonator(freq, bw) {
	const r = Math.exp(-Math.PI * bw / SR);
	const c = -2 * r * Math.cos((2 * Math.PI * freq) / SR);
	const a0 = 1 - r;
	let y1 = 0;
	let y2 = 0;
	return (x) => {
		const y = a0 * x - c * y1 - r * r * y2;
		y2 = y1;
		y1 = y;
		return y;
	};
}

/**
 * 母音っぽい声。声帯パルス（鋸歯波に近い）を 3 本のフォルマントに通す。
 * f0 は素材の音高（Hz）。dur 秒。頭に軽い子音（ノイズ）を付けられる。
 */
function vowel({ f0, formants, dur, consonantMs = 0, vibrato = 0.004, seed = 1 }) {
	const n = Math.floor(SR * dur);
	const out = new Float32Array(n);
	const rng = makeRng(seed);
	const res = formants.map(([f, bw]) => resonator(f, bw));
	let phase = 0;
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		const f = f0 * (1 + vibrato * Math.sin(2 * Math.PI * 5.5 * t)) * (t < 0.03 ? 0.97 + t : 1);
		phase += f / SR;
		if (phase >= 1) phase -= 1;
		// 声帯パルス: 立ち上がりの鋭い鋸歯波（倍音が豊か）
		const glottal = (1 - phase) ** 2 * 2 - 0.67;
		let x = glottal * 0.6;
		if (t * 1000 < consonantMs) x += (rng() * 2 - 1) * 0.5 * (1 - (t * 1000) / consonantMs);
		let y = 0;
		for (const r of res) y += r(x);
		// エンベロープ: 立ち上がり 10ms、減衰、尻尾 40ms
		let e = Math.min(1, t / 0.01);
		e *= Math.exp(-t * 1.2);
		const tail = dur - t;
		if (tail < 0.04) e *= Math.max(0, tail / 0.04);
		out[i] = y * e;
	}
	return normalize(out, 0.8);
}

function kick({ dur = 0.25, seed = 2 } = {}) {
	const n = Math.floor(SR * dur);
	const out = new Float32Array(n);
	let phase = 0;
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		const f = 160 * Math.exp(-t * 18) + 45;
		phase += f / SR;
		const e = Math.exp(-t * 9) * Math.min(1, t / 0.002);
		out[i] = Math.sin(2 * Math.PI * phase) * e;
	}
	void seed;
	return normalize(out, 0.9);
}

function snare({ dur = 0.2, seed = 3 } = {}) {
	const n = Math.floor(SR * dur);
	const out = new Float32Array(n);
	const rng = makeRng(seed);
	const hp = resonator(3200, 2600);
	let phase = 0;
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		phase += 190 / SR;
		const tone = Math.sin(2 * Math.PI * phase) * Math.exp(-t * 25);
		const noise = hp(rng() * 2 - 1) * Math.exp(-t * 14);
		out[i] = (tone * 0.5 + noise * 1.4) * Math.min(1, t / 0.001);
	}
	return normalize(out, 0.85);
}

function hat({ dur = 0.08, seed = 4 } = {}) {
	const n = Math.floor(SR * dur);
	const out = new Float32Array(n);
	const rng = makeRng(seed);
	const bp = resonator(7800, 3000);
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		out[i] = bp(rng() * 2 - 1) * Math.exp(-t * 60);
	}
	return normalize(out, 0.6);
}

function normalize(buf, peak) {
	let m = 0;
	for (const v of buf) m = Math.max(m, Math.abs(v));
	if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] / m) * peak;
	return buf;
}

function wav(samples) {
	const bytes = new ArrayBuffer(44 + samples.length * 2);
	const v = new DataView(bytes);
	const str = (o, s) => {
		for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
	};
	str(0, "RIFF");
	v.setUint32(4, 36 + samples.length * 2, true);
	str(8, "WAVE");
	str(12, "fmt ");
	v.setUint32(16, 16, true);
	v.setUint16(20, 1, true);
	v.setUint16(22, 1, true);
	v.setUint32(24, SR, true);
	v.setUint32(28, SR * 2, true);
	v.setUint16(32, 2, true);
	v.setUint16(34, 16, true);
	str(36, "data");
	v.setUint32(40, samples.length * 2, true);
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
	}
	return Buffer.from(bytes);
}

// 見本の baseNote と一致させること（lib/otomad/otomad-presets.ts）。
// 旋律用の「あ」「ぱ」は E4（MIDI 64、329.6Hz）、低音用の「お」は E2（MIDI 40、82.4Hz）。
// 再生速度方式の音程合わせは ±8 半音を超えると破綻するので、見本の旋律（o4）・低音（o2）の真ん中に置く。
const E4 = 440 * 2 ** ((64 - 69) / 12);
const E2 = 440 * 2 ** ((40 - 69) / 12);
// 音域の広い旋律用（鉱石風respect の主旋律は 61〜94）。1 オクターブずつ上と、低音の中間。
const E5 = 440 * 2 ** ((76 - 69) / 12);
const E6 = 440 * 2 ** ((88 - 69) / 12);
const E3 = 440 * 2 ** ((52 - 69) / 12);
const FILES = {
	// 高い「あ」: フォルマントは少し上げる（声が高いと共鳴も上がる）
	"voice-a5.wav": vowel({ f0: E5, formants: [[800, 120], [1350, 130], [2800, 170]], dur: 0.6, seed: 14 }),
	"voice-a6.wav": vowel({ f0: E6, formants: [[900, 140], [1500, 150], [3000, 180]], dur: 0.5, seed: 15 }),
	// 中くらいの「お」
	"voice-o3.wav": vowel({ f0: E3, formants: [[480, 95], [850, 105], [2450, 160]], dur: 0.7, seed: 16 }),
	// 「あ」: F1 700 / F2 1200 / F3 2600
	"voice-a.wav": vowel({ f0: E4, formants: [[700, 110], [1200, 120], [2600, 160]], dur: 0.6, seed: 11 }),
	// 「お」（低い声）: F1 450 / F2 800 / F3 2400
	"voice-o.wav": vowel({ f0: E2, formants: [[450, 90], [800, 100], [2400, 160]], dur: 0.8, seed: 12 }),
	// 「ぱ」: 頭に破裂のノイズ、母音は「あ」
	"voice-pa.wav": vowel({ f0: E4, formants: [[700, 110], [1200, 120], [2600, 160]], dur: 0.35, consonantMs: 18, seed: 13 }),
	"kick.wav": kick(),
	"snare.wav": snare(),
	"hat.wav": hat(),
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, samples] of Object.entries(FILES)) {
	writeFileSync(join(OUT_DIR, name), wav(samples));
	console.log(`${name}\t${(samples.length / SR).toFixed(2)}s`);
}
