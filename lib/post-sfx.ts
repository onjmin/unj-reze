"use client";

/**
 * 自分の投稿がタイムラインに挿入された瞬間に鳴らす短いポップ音。
 * kusa.open2ch.net の投稿演出を計測して再現した波形（sine 440Hz起動 → 1000→1500Hz
 * のピッチスライド、gainは10msアタック→90msで指数減衰）。音声ファイルは使わず
 * Web Audio APIでその場合成するので、アセット追加や再生権限の煩わしさが無い。
 * 本家のpeak gainは0.25だが「耳障りにならない」よう更に絞って0.12にしている。
 */
let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
	if (typeof window === "undefined") return null;
	const Ctor =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!Ctor) return null;
	if (!sharedCtx) sharedCtx = new Ctor();
	return sharedCtx;
}

export function playPostSfx() {
	try {
		const ctx = getCtx();
		if (!ctx) return;
		if (ctx.state === "suspended") ctx.resume().catch(() => {});

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "sine";
		osc.connect(gain);
		gain.connect(ctx.destination);

		const t0 = ctx.currentTime;
		osc.frequency.setValueAtTime(1000, t0);
		osc.frequency.linearRampToValueAtTime(1500, t0 + 0.036);

		gain.gain.setValueAtTime(0, t0);
		gain.gain.linearRampToValueAtTime(0.12, t0 + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);

		osc.start(t0);
		osc.stop(t0 + 0.09);
		osc.onended = () => {
			osc.disconnect();
			gain.disconnect();
		};
	} catch {
		// 効果音は演出の付加要素にすぎないので、鳴らせなくても投稿処理自体は止めない
	}
}
