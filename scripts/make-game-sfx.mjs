#!/usr/bin/env node
// ゲームエンジン内蔵の効果音（オリジナル合成音）を public/assets/game-sfx/*.wav に書き出す。
//
// 外部の音源・サンプルは一切使わず、矩形波・三角波・サイン波・ノイズとエンベロープだけで
// その場で合成する（22050Hz / モノラル / 16bit PCM）。ノイズは固定シードの疑似乱数なので、
// 何度実行しても同じバイト列になる（差分が出たら音を作り直したということ）。
//
// 実行: node scripts/make-game-sfx.mjs
// 役割（キー）とファイル名の対応は lib/game-sfx.ts が持つ。ここで音を足したらそちらにも足すこと。

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 22050;
const OUT_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"public",
	"assets",
	"game-sfx",
);

// ── 道具 ────────────────────────────────────────────────────────────────

/** 固定シードの疑似乱数（mulberry32）。0〜1。 */
function makeRng(seed) {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** 1音ぶんの音量エンベロープ。attack で立ち上げ、decay（時定数・秒）で指数減衰、
 *  末尾 release 秒で 0 へ落とす（プチノイズ防止）。decay 未指定なら減衰しない。 */
function envelope(t, dur, { attack = 0.002, decay, release = 0.01, swell } = {}) {
	let e = attack > 0 ? Math.min(1, t / attack) : 1;
	if (decay) e *= Math.exp(-t / decay);
	if (swell) e *= Math.sin(Math.PI * Math.min(1, t / dur)); // ふくらんで消える（風など）
	const tail = dur - t;
	if (release > 0 && tail < release) e *= Math.max(0, tail / release);
	return e;
}

/** 周波数の推移。freqEnd があれば dur かけて指数（exp）または直線（lin）で移る。 */
function freqAt(t, dur, { freq, freqEnd, sweep = "exp", vibrato = 0, vibratoRate = 6 }) {
	let f = freq;
	if (freqEnd !== undefined) {
		const k = Math.min(1, t / dur);
		f = sweep === "lin" ? freq + (freqEnd - freq) * k : freq * (freqEnd / freq) ** k;
	}
	if (vibrato) f *= 1 + vibrato * Math.sin(2 * Math.PI * vibratoRate * t);
	return f;
}

function oscillator(wave, phase, duty) {
	const p = phase - Math.floor(phase);
	switch (wave) {
		case "square":
			return p < duty ? 1 : -1;
		case "triangle":
			return 1 - 4 * Math.abs(p - 0.5);
		case "saw":
			return 2 * p - 1;
		default:
			return Math.sin(2 * Math.PI * p);
	}
}

/** 1秒あたりのサンプル数から、指定秒ぶんの空バッファを作る。 */
const makeBuffer = (sec) => new Float32Array(Math.ceil(sec * SR));

/** 音程のある声（矩形波/三角波/サイン/ノコギリ）を out に足し込む。 */
function tone(out, opts) {
	const { start = 0, dur, wave = "square", duty = 0.5, vol = 0.5 } = opts;
	const s0 = Math.floor(start * SR);
	const n = Math.floor(dur * SR);
	let phase = 0;
	for (let i = 0; i < n && s0 + i < out.length; i++) {
		const t = i / SR;
		phase += freqAt(t, dur, opts) / SR;
		out[s0 + i] += oscillator(wave, phase, duty) * vol * envelope(t, dur, opts);
	}
}

/** ノイズを out に足し込む。rate（Hz）でサンプル＆ホールドするとファミコン風の「音程のあるノイズ」になる。
 *  lp / hp はワンポールのローパス／ハイパスのカットオフ（Hz）。lpEnd で掃引できる。
 *  crackle（0〜1）を指定すると、ランダムに短い破裂を混ぜる（焚き火のパチパチ）。 */
function noise(out, opts) {
	const {
		start = 0,
		dur,
		vol = 0.5,
		rate,
		rateEnd,
		lp,
		lpEnd,
		hp,
		seed = 1,
		crackle = 0,
		flicker = 0,
	} = opts;
	const rnd = makeRng(seed);
	const s0 = Math.floor(start * SR);
	const n = Math.floor(dur * SR);
	let held = 0;
	let holdPhase = 1;
	let lpY = 0;
	let hpY = 0;
	let crackLeft = 0;
	let flick = 1;
	for (let i = 0; i < n && s0 + i < out.length; i++) {
		const t = i / SR;
		const k = Math.min(1, t / dur);
		let x;
		if (rate) {
			const r = rateEnd ? rate * (rateEnd / rate) ** k : rate;
			holdPhase += r / SR;
			if (holdPhase >= 1) {
				holdPhase -= Math.floor(holdPhase);
				held = rnd() * 2 - 1;
			}
			x = held;
		} else {
			x = rnd() * 2 - 1;
		}
		if (lp) {
			const fc = lpEnd ? lp * (lpEnd / lp) ** k : lp;
			const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
			lpY += a * (x - lpY);
			x = lpY;
		}
		if (hp) {
			const a = 1 - Math.exp((-2 * Math.PI * hp) / SR);
			hpY += a * (x - hpY);
			x -= hpY;
		}
		if (crackle > 0) {
			if (crackLeft <= 0 && rnd() < crackle / 400) crackLeft = Math.floor(SR * (0.002 + rnd() * 0.004));
			if (crackLeft > 0) {
				x += (rnd() * 2 - 1) * 1.6;
				crackLeft--;
			}
		}
		if (flicker > 0 && i % 256 === 0) flick = 1 - flicker * rnd();
		out[s0 + i] += x * vol * flick * envelope(t, dur, opts);
	}
}

/** 1音ずつ時間差で鳴らすアルペジオ。 */
function arpeggio(out, notes, { start = 0, step, ...opts }) {
	notes.forEach((freq, i) => tone(out, { ...opts, start: start + i * step, freq }));
}

/** 全体をワンポールのローパスに通す（矩形波の耳障りな高域を丸める）。 */
function smooth(buf, fc) {
	const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
	let y = 0;
	for (let i = 0; i < buf.length; i++) {
		y += a * (buf[i] - y);
		buf[i] = y;
	}
	return buf;
}

/** ピークを peak に揃え、末尾 5ms をフェードアウトする。 */
function finalize(buf, peak) {
	let max = 0;
	for (const v of buf) max = Math.max(max, Math.abs(v));
	const g = max > 0 ? peak / max : 0;
	const fade = Math.floor(0.005 * SR);
	for (let i = 0; i < buf.length; i++) {
		const tail = buf.length - i;
		buf[i] = Math.tanh(buf[i] * g * 1.1) / Math.tanh(1.1) * (tail < fade ? tail / fade : 1);
	}
	return buf;
}

function toWav(samples) {
	const data = Buffer.alloc(samples.length * 2);
	for (let i = 0; i < samples.length; i++) {
		const v = Math.max(-1, Math.min(1, samples[i]));
		data.writeInt16LE(Math.round(v * 32767), i * 2);
	}
	const header = Buffer.alloc(44);
	header.write("RIFF", 0);
	header.writeUInt32LE(36 + data.length, 4);
	header.write("WAVE", 8);
	header.write("fmt ", 12);
	header.writeUInt32LE(16, 16); // fmt チャンク長
	header.writeUInt16LE(1, 20); // PCM
	header.writeUInt16LE(1, 22); // モノラル
	header.writeUInt32LE(SR, 24);
	header.writeUInt32LE(SR * 2, 28); // バイトレート
	header.writeUInt16LE(2, 32); // ブロック長
	header.writeUInt16LE(16, 34); // ビット深度
	header.write("data", 36);
	header.writeUInt32LE(data.length, 40);
	return Buffer.concat([header, data]);
}

// ── 音の定義 ────────────────────────────────────────────────────────────
// 各関数は { sec, peak, build(buf) }。peak は書き出し時の最大振幅（小さいほど控えめな音）。

const SOUNDS = {
	// メニューのカーソル移動：短く軽いクリック
	menu_move: {
		sec: 0.06,
		peak: 0.35,
		build: (b) => tone(b, { dur: 0.05, freq: 1320, wave: "square", duty: 0.25, decay: 0.018 }),
	},
	// 決定：上がる2音
	menu_confirm: {
		sec: 0.14,
		peak: 0.42,
		build: (b) => {
			tone(b, { dur: 0.045, freq: 988, wave: "square", duty: 0.25, decay: 0.04 });
			tone(b, { start: 0.04, dur: 0.09, freq: 1480, wave: "square", duty: 0.25, decay: 0.045 });
		},
	},
	// キャンセル：下がる2音
	menu_cancel: {
		sec: 0.14,
		peak: 0.4,
		build: (b) => {
			tone(b, { dur: 0.045, freq: 784, wave: "square", duty: 0.25, decay: 0.04 });
			tone(b, { start: 0.04, dur: 0.09, freq: 523, wave: "square", duty: 0.25, decay: 0.045 });
		},
	},
	// 戦闘ログの1文字ごとのタイプ音
	text_typer: {
		sec: 0.03,
		peak: 0.25,
		build: (b) => {
			tone(b, { dur: 0.022, freq: 1100, wave: "square", duty: 0.5, decay: 0.008 });
			noise(b, { dur: 0.012, vol: 0.2, hp: 3000, decay: 0.004, seed: 11 });
		},
	},
	// セリフの1文字ごとの声（ピポ）
	text_voice: {
		sec: 0.06,
		peak: 0.3,
		build: (b) => tone(b, { dur: 0.055, freq: 360, freqEnd: 330, wave: "square", duty: 0.25, decay: 0.03 }),
	},
	// エンカウントの「！」
	encounter: {
		sec: 0.24,
		peak: 0.5,
		build: (b) => {
			tone(b, { dur: 0.06, freq: 700, freqEnd: 1400, wave: "square", duty: 0.5, release: 0.005 });
			tone(b, { start: 0.06, dur: 0.17, freq: 1760, wave: "square", duty: 0.25, decay: 0.06 });
		},
	},
	// ハートがコマンド位置へ飛ぶ／戦闘開始
	battle_start: {
		sec: 0.45,
		peak: 0.65,
		build: (b) => {
			tone(b, { dur: 0.4, freq: 220, freqEnd: 880, wave: "triangle", vibrato: 0.03, vibratoRate: 18, attack: 0.02, decay: 0.3 });
			tone(b, { dur: 0.4, freq: 440, freqEnd: 1760, wave: "square", duty: 0.125, vol: 0.18, attack: 0.02, decay: 0.2 });
			noise(b, { dur: 0.42, vol: 0.35, lp: 400, lpEnd: 4000, attack: 0.05, decay: 0.2, seed: 21 });
		},
	},
	// パーティ戦のエンカウント：ノイズが吸い込むようにふくらみ、そこから上がる3音（A→D→E）で構える。
	// 既存作品の合図（同じ和音を2回鳴らして得物を抜く、など）に寄らない形にしてある。
	encounter_party: {
		sec: 1.0,
		peak: 0.75,
		build: (b) => {
			noise(b, { dur: 0.34, vol: 0.45, lp: 300, lpEnd: 3500, attack: 0.25, release: 0.04, seed: 31 });
			const motif = [
				[0.3, 440, 0.09],
				[0.4, 587, 0.09],
				[0.5, 659, 0.45],
			];
			for (const [start, freq, dur] of motif) {
				tone(b, { start, dur, freq, wave: "square", duty: 0.25, vol: 0.3, decay: dur > 0.3 ? 0.3 : 0.08, vibrato: dur > 0.3 ? 0.008 : 0, vibratoRate: 7 });
				tone(b, { start, dur, freq: freq / 2, wave: "triangle", vol: 0.3, decay: dur > 0.3 ? 0.3 : 0.08 });
			}
			tone(b, { start: 0.3, dur: 0.6, freq: 110, wave: "triangle", vol: 0.45, decay: 0.25 });
		},
	},
	// 敵に攻撃が当たった
	enemy_damage: {
		sec: 0.22,
		peak: 0.8,
		build: (b) => {
			noise(b, { dur: 0.2, vol: 0.7, lp: 4000, lpEnd: 500, decay: 0.06, seed: 41 });
			tone(b, { dur: 0.16, freq: 200, freqEnd: 55, wave: "square", duty: 0.5, vol: 0.5, decay: 0.07 });
		},
	},
	// 敵が崩れて消える
	enemy_vanish: {
		sec: 0.7,
		peak: 0.6,
		build: (b) => {
			noise(b, { dur: 0.68, vol: 0.6, rate: 9000, rateEnd: 400, decay: 0.3, seed: 51 });
			tone(b, { dur: 0.6, freq: 900, freqEnd: 90, wave: "triangle", vol: 0.35, decay: 0.25 });
		},
	},
	// 得物を構える（シャキン）
	weapon_draw: {
		sec: 0.3,
		peak: 0.55,
		build: (b) => {
			noise(b, { dur: 0.28, vol: 0.5, hp: 3500, decay: 0.08, seed: 61 });
			tone(b, { start: 0.01, dur: 0.22, freq: 2637, freqEnd: 3520, wave: "square", duty: 0.125, vol: 0.3, decay: 0.06 });
		},
	},
	// 通常攻撃（斬撃）
	slash: {
		sec: 0.18,
		peak: 0.7,
		build: (b) => {
			noise(b, { dur: 0.16, vol: 0.8, lp: 7000, lpEnd: 700, attack: 0.01, decay: 0.045, seed: 71 });
			tone(b, { dur: 0.09, freq: 500, freqEnd: 160, wave: "square", duty: 0.25, vol: 0.25, decay: 0.04 });
		},
	},
	// 会心の一撃：斬撃＋澄んだ余韻
	slash_critical: {
		sec: 0.45,
		peak: 0.8,
		build: (b) => {
			noise(b, { dur: 0.16, vol: 0.8, lp: 8000, lpEnd: 800, attack: 0.01, decay: 0.045, seed: 72 });
			tone(b, { start: 0.04, dur: 0.4, freq: 1568, wave: "triangle", vol: 0.4, decay: 0.13 });
			tone(b, { start: 0.04, dur: 0.4, freq: 2093, wave: "triangle", vol: 0.3, decay: 0.12 });
			tone(b, { start: 0.04, dur: 0.3, freq: 3136, wave: "square", duty: 0.125, vol: 0.08, decay: 0.08 });
		},
	},
	// 弾をかすめた（グレイズ）
	graze: {
		sec: 0.08,
		peak: 0.4,
		build: (b) => {
			tone(b, { dur: 0.07, freq: 2349, freqEnd: 2794, wave: "triangle", decay: 0.025 });
			noise(b, { dur: 0.05, vol: 0.2, hp: 5000, decay: 0.015, seed: 81 });
		},
	},
	// 呪文をとなえる
	spell_cast: {
		sec: 0.45,
		peak: 0.6,
		build: (b) => {
			arpeggio(b, [523, 659, 784, 1047, 1319], { step: 0.05, dur: 0.18, wave: "triangle", vol: 0.5, decay: 0.07, vibrato: 0.01, vibratoRate: 9 });
			noise(b, { dur: 0.42, vol: 0.12, hp: 4000, attack: 0.1, decay: 0.15, seed: 91 });
		},
	},
	// 回復
	heal: {
		sec: 0.6,
		peak: 0.6,
		build: (b) => {
			arpeggio(b, [784, 988, 1175, 1568], { step: 0.07, dur: 0.32, wave: "triangle", vol: 0.5, decay: 0.13, vibrato: 0.012, vibratoRate: 8 });
			arpeggio(b, [1568, 1976, 2349, 3136], { step: 0.07, dur: 0.25, wave: "sine", vol: 0.12, decay: 0.1 });
		},
	},
	// みのがした（ほっとする2音）
	spare: {
		sec: 0.6,
		peak: 0.55,
		build: (b) => {
			tone(b, { dur: 0.25, freq: 1047, wave: "square", duty: 0.25, vol: 0.35, decay: 0.1 });
			tone(b, { start: 0.12, dur: 0.45, freq: 1568, wave: "triangle", vol: 0.5, decay: 0.18 });
			noise(b, { start: 0.05, dur: 0.4, vol: 0.12, lp: 1200, lpEnd: 300, attack: 0.05, decay: 0.15, seed: 101 });
		},
	},
	// みのがしゲージが上がった
	mercy_up: {
		sec: 0.16,
		peak: 0.4,
		build: (b) => arpeggio(b, [880, 1175, 1760], { step: 0.035, dur: 0.06, wave: "square", duty: 0.25, decay: 0.025 }),
	},
	// ハートの射撃（イエロー）
	shoot: {
		sec: 0.08,
		peak: 0.35,
		build: (b) => tone(b, { dur: 0.07, freq: 1500, freqEnd: 700, wave: "square", duty: 0.25, decay: 0.03 }),
	},
	// レベルアップのファンファーレ
	level_up: {
		sec: 0.75,
		peak: 0.7,
		build: (b) => {
			arpeggio(b, [523, 659, 784], { step: 0.085, dur: 0.1, wave: "square", duty: 0.5, vol: 0.4, decay: 0.08 });
			tone(b, { start: 0.255, dur: 0.45, freq: 1047, wave: "square", duty: 0.5, vol: 0.4, decay: 0.25, vibrato: 0.008, vibratoRate: 7 });
			tone(b, { start: 0.255, dur: 0.45, freq: 262, wave: "triangle", vol: 0.5, decay: 0.3 });
		},
	},
	// セーブ（きらめく和音）
	save: {
		sec: 0.7,
		peak: 0.55,
		build: (b) => {
			arpeggio(b, [1319, 1661, 1976], { step: 0.05, dur: 0.6, wave: "triangle", vol: 0.4, decay: 0.2, vibrato: 0.006, vibratoRate: 6 });
			noise(b, { dur: 0.5, vol: 0.08, hp: 6000, attack: 0.05, decay: 0.2, seed: 111 });
		},
	},
	// 自分が被弾した
	hurt: {
		sec: 0.2,
		peak: 0.75,
		build: (b) => {
			tone(b, { dur: 0.17, freq: 420, freqEnd: 110, wave: "square", duty: 0.5, vol: 0.5, decay: 0.08 });
			noise(b, { dur: 0.1, vol: 0.4, lp: 2500, decay: 0.035, seed: 121 });
		},
	},
	// ステージクリア／エンディングの短いジングル
	clear: {
		sec: 1.2,
		peak: 0.65,
		build: (b) => {
			const melody = [
				[0, 784, 0.12],
				[0.12, 988, 0.12],
				[0.24, 1175, 0.12],
				[0.36, 1568, 0.7],
			];
			for (const [start, freq, dur] of melody) {
				tone(b, { start, dur, freq, wave: "square", duty: 0.25, vol: 0.35, decay: dur > 0.3 ? 0.35 : 0.1 });
			}
			for (const [start, freq, dur] of [
				[0, 392, 0.36],
				[0.36, 523, 0.8],
			]) {
				tone(b, { start, dur, freq, wave: "triangle", vol: 0.45, decay: 0.4 });
			}
		},
	},

	// ── フィールドの既定音（メッセージ送り・システム床・宝箱・2.5D の食事と着地）──
	// メッセージ送り：丸い「ポッ」
	msg_advance: {
		sec: 0.08,
		peak: 0.32,
		build: (b) => {
			tone(b, { dur: 0.07, freq: 880, freqEnd: 660, wave: "triangle", decay: 0.03 });
			tone(b, { dur: 0.03, freq: 1760, wave: "square", duty: 0.125, vol: 0.12, decay: 0.01 });
		},
	},
	// ワープ床：上へ巻き上がるきらめき
	warp: {
		sec: 0.8,
		peak: 0.55,
		build: (b) => {
			tone(b, { dur: 0.7, freq: 300, freqEnd: 1800, wave: "triangle", vibrato: 0.04, vibratoRate: 22, attack: 0.02, decay: 0.45 });
			arpeggio(b, [1047, 1319, 1568, 2093, 2637], { start: 0.1, step: 0.09, dur: 0.25, wave: "sine", vol: 0.25, decay: 0.1 });
			noise(b, { dur: 0.75, vol: 0.15, hp: 5000, attack: 0.1, swell: true, seed: 301 });
		},
	},
	// ダメージ床：ビリッと短いしびれ
	floor_damage: {
		sec: 0.25,
		peak: 0.6,
		build: (b) => {
			tone(b, { dur: 0.22, freq: 180, freqEnd: 120, wave: "square", duty: 0.5, vol: 0.35, vibrato: 0.3, vibratoRate: 60, decay: 0.1 });
			noise(b, { dur: 0.2, vol: 0.4, rate: 6000, hp: 1500, decay: 0.06, seed: 311 });
		},
	},
	// 扉：きしみ＋低い「ゴトッ」
	door: {
		sec: 0.45,
		peak: 0.6,
		build: (b) => {
			noise(b, { dur: 0.3, vol: 0.4, lp: 1500, lpEnd: 400, attack: 0.02, decay: 0.12, seed: 321 });
			tone(b, { start: 0.02, dur: 0.3, freq: 420, freqEnd: 520, wave: "saw", vol: 0.12, vibrato: 0.03, vibratoRate: 30, attack: 0.03, decay: 0.12 });
			tone(b, { start: 0.25, dur: 0.18, freq: 110, freqEnd: 70, wave: "triangle", vol: 0.6, decay: 0.06 });
			noise(b, { start: 0.25, dur: 0.12, vol: 0.4, lp: 900, decay: 0.03, seed: 322 });
		},
	},
	// 宝箱を開けた：カチャッ＋きらめく上昇3音
	chest_open: {
		sec: 0.6,
		peak: 0.55,
		build: (b) => {
			noise(b, { dur: 0.05, vol: 0.5, hp: 2500, decay: 0.012, seed: 331 });
			noise(b, { start: 0.06, dur: 0.05, vol: 0.35, hp: 2000, decay: 0.012, seed: 332 });
			arpeggio(b, [1175, 1568, 2349], { start: 0.12, step: 0.07, dur: 0.35, wave: "triangle", vol: 0.4, decay: 0.12 });
		},
	},
	// 食べる：「もぐっ」2回
	eat: {
		sec: 0.35,
		peak: 0.5,
		build: (b) => {
			for (const [start, seed] of [
				[0, 341],
				[0.16, 342],
			]) {
				noise(b, { start, dur: 0.1, vol: 0.5, lp: 1200, lpEnd: 500, attack: 0.005, decay: 0.035, seed });
				tone(b, { start, dur: 0.08, freq: 260, freqEnd: 190, wave: "triangle", vol: 0.35, decay: 0.03 });
			}
		},
	},
	// 高いところから着地した：低い「ドスッ」
	land: {
		sec: 0.25,
		peak: 0.6,
		build: (b) => {
			tone(b, { dur: 0.2, freq: 120, freqEnd: 50, wave: "sine", vol: 0.8, decay: 0.07 });
			noise(b, { dur: 0.12, vol: 0.4, lp: 700, decay: 0.03, seed: 351 });
		},
	},

	// ── エフェクト（魔法アニメ）用 ──
	effect_fire: {
		sec: 0.9,
		peak: 0.7,
		build: (b) => {
			noise(b, { dur: 0.88, vol: 0.55, lp: 900, attack: 0.04, decay: 0.45, flicker: 0.6, seed: 201 });
			noise(b, { dur: 0.85, vol: 0.25, hp: 2500, crackle: 1, attack: 0.02, decay: 0.4, seed: 202 });
			tone(b, { dur: 0.5, freq: 110, freqEnd: 220, wave: "triangle", vol: 0.3, attack: 0.03, decay: 0.2 });
		},
	},
	effect_explosion: {
		sec: 1.1,
		peak: 0.9,
		build: (b) => {
			noise(b, { dur: 1.05, vol: 0.8, rate: 5000, rateEnd: 250, lp: 5000, lpEnd: 250, decay: 0.3, seed: 211 });
			noise(b, { dur: 0.3, vol: 0.5, hp: 1500, decay: 0.06, seed: 212 });
			tone(b, { dur: 0.45, freq: 90, freqEnd: 38, wave: "sine", vol: 0.8, decay: 0.2 });
		},
	},
	effect_wind: {
		sec: 1.2,
		peak: 0.6,
		build: (b) => {
			noise(b, { dur: 1.2, vol: 0.7, lp: 500, lpEnd: 1800, hp: 250, swell: true, release: 0.05, seed: 221 });
			noise(b, { dur: 1.1, vol: 0.25, lp: 2500, lpEnd: 900, hp: 1200, swell: true, release: 0.05, seed: 222 });
		},
	},
	effect_ice: {
		sec: 0.9,
		peak: 0.6,
		build: (b) => {
			arpeggio(b, [2637, 3136, 3951, 3520, 4186], { step: 0.045, dur: 0.35, wave: "triangle", vol: 0.35, decay: 0.12 });
			arpeggio(b, [1319, 1568], { step: 0.09, dur: 0.5, wave: "sine", vol: 0.3, decay: 0.2 });
			noise(b, { dur: 0.8, vol: 0.18, hp: 6000, crackle: 0.6, decay: 0.3, seed: 231 });
		},
	},
	effect_heal: {
		sec: 1.1,
		peak: 0.6,
		build: (b) => {
			arpeggio(b, [523, 659, 784, 1047, 1319, 1568], { step: 0.07, dur: 0.5, wave: "triangle", vol: 0.4, decay: 0.2, vibrato: 0.01, vibratoRate: 7 });
			arpeggio(b, [1047, 1319, 1568, 2093, 2637, 3136], { step: 0.07, dur: 0.35, wave: "sine", vol: 0.12, decay: 0.15 });
			noise(b, { dur: 1.0, vol: 0.06, hp: 7000, attack: 0.2, swell: true, seed: 241 });
		},
	},
};

mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const [name, def] of Object.entries(SOUNDS)) {
	const buf = makeBuffer(def.sec);
	def.build(buf);
	smooth(buf, 7000);
	finalize(buf, def.peak);
	const wav = toWav(buf);
	writeFileSync(join(OUT_DIR, `${name}.wav`), wav);
	total += wav.length;
	console.log(`${name}.wav  ${(wav.length / 1024).toFixed(1)} KB`);
}
console.log(`${Object.keys(SOUNDS).length} files, ${(total / 1024).toFixed(1)} KB → ${OUT_DIR}`);
