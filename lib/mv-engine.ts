// MVの描画エンジン。DOM非依存（Canvas2Dコンテキストだけ受け取る）純粋な描画関数群。
//
// 時間の出どころは1つだけ: @onjmin/dtm の再生ステップ。拍位相・ビジュアライザ・歌詞・
// 図形モジュレータのすべてがノートデータから導出されるので、音とズレる余地が無い。
//
// 画像の読み込み・コマ送りは lib/walk-sprite.ts の基盤をそのまま使う（2Dゲームエンジン側と
// 実装を二重化しない）。

import { imageRefToUrl } from "./asset-ref";
import {
	chordRootName,
	chordToneLabel,
	DEFAULT_MV_NOTE_LIGHT,
	DEFAULT_MV_NOTE_LIGHT_3D,
	DEFAULT_MV_RING,
	DEFAULT_MV_VIEW,
	getChordThemeColor,
	isLayerVisible,
	isMvEntranceInert,
	isMvExitInert,
	isMvTransitionInert,
	layerAppearBar,
	layerDisappearBar,
	MV_BLEND_COMPOSITE,
	MV_EFFECT_POST_STYLES,
	MV_H,
	MV_PARTICLE_COVER_FRAMES,
	MV_PARTICLE_COVER_URL,
	MV_PARTICLE_REVEAL_FRAMES,
	MV_PARTICLE_REVEAL_URL,
	MV_ROOT_TO_PITCH,
	MV_STEPS_PER_BAR,
	MV_STEPS_PER_BEAT,
	MV_W,
	type MvAnchor,
	type MvChordBarLayer,
	type MvChordStep,
	type MvDegreeLayer,
	type MvEffectCurve,
	type MvEffectLayer,
	type MvEffectStyle,
	type MvEnterFrom,
	type MvEntrance,
	type MvEntranceStyle,
	type MvExitStyle,
	type MvExitTo,
	type MvImageLayer,
	type MvLayer,
	type MvLyricLine,
	type MvLyricsLayer,
	type MvManifest,
	type MvModOp,
	type MvModTarget,
	type MvModulator,
	type MvMotion,
	type MvNoteLight,
	type MvRect,
	type MvRing,
	type MvSection,
	type MvShapeLayer,
	type MvStage,
	type MvTextLayer,
	type MvView,
	type MvVisualizerLayer,
	mvEntranceDistance,
	mvExitDistance,
	mvWalkSpeed,
	resolveLyricStack,
	resolveSceneStage,
	resolveShapeModulators,
	sectionAtBar,
} from "./mv-config";
import {
	animatedCellInRect,
	detectStandard,
	loadImage,
	peekImage,
	rowAnimCellInRect,
	type SpriteRect,
	standardById,
	type WalkStandard,
} from "./walk-sprite";

// ───────────────── 楽曲の解析 ─────────────────

export interface MvNote {
	/** MMLの @n（トラックID） */
	track: number;
	startStep: number;
	durationSteps: number;
	pitch: number;
	/** 0-127 */
	velocity: number;
}

export interface MvSong {
	bpm: number;
	/** 曲全体の長さ（ステップ） */
	totalSteps: number;
	totalBars: number;
	/** startStep 昇順 */
	notes: MvNote[];
	/** トラックID → そのトラックのノート（startStep 昇順） */
	byTrack: Map<number, MvNote[]>;
	/** 登場するトラックID（昇順） */
	tracks: number[];
	pitchMin: number;
	pitchMax: number;
	/** MMLの歌詞トラック(@@n)から導出した行。trackId 付き。 */
	lyricLines: MvLyricLine[];
	/** 歌詞が乗っていたトラックID（昇順） */
	lyricTrackIds: number[];
}

export const EMPTY_SONG: MvSong = {
	bpm: 120,
	totalSteps: 0,
	totalBars: 0,
	notes: [],
	byTrack: new Map(),
	tracks: [],
	pitchMin: 48,
	pitchMax: 72,
	lyricLines: [],
	lyricTrackIds: [],
};

const songCache = new Map<string, MvSong>();

/**
 * MML文字列を解析してMV描画用のノートデータへ変換する。
 * @onjmin/dtm は動的インポート必須（静的インポートはEdge/サーバー評価時にクラッシュする）。
 */
export async function parseMvSong(mml: string): Promise<MvSong> {
	const key = mml.trim();
	if (!key) return EMPTY_SONG;
	const cached = songCache.get(key);
	if (cached) return cached;

	let song: MvSong = EMPTY_SONG;
	try {
		const dtm = await import("@onjmin/dtm");
		const cleaned = dtm.stripCustomVocals(key);
		const parsed = dtm.parseMML(cleaned, { collectLyrics: true });

		const notes: MvNote[] = parsed.placements
			.map((p) => ({
				track: p.trackIndex,
				startStep: p.startStep,
				durationSteps: Math.max(1, p.durationSteps),
				pitch: p.pitch,
				velocity: p.velocity ?? 100,
			}))
			.sort((a, b) => a.startStep - b.startStep);

		const byTrack = new Map<number, MvNote[]>();
		for (const n of notes) {
			const list = byTrack.get(n.track);
			if (list) list.push(n);
			else byTrack.set(n.track, [n]);
		}

		const tracks = [...byTrack.keys()].sort((a, b) => a - b);
		let pitchMin = Infinity;
		let pitchMax = -Infinity;
		let totalSteps = 0;
		for (const n of notes) {
			if (n.pitch < pitchMin) pitchMin = n.pitch;
			if (n.pitch > pitchMax) pitchMax = n.pitch;
			const end = n.startStep + n.durationSteps;
			if (end > totalSteps) totalSteps = end;
		}
		if (!isFinite(pitchMin)) {
			pitchMin = 48;
			pitchMax = 72;
		}
		// 音域が狭すぎると帯が潰れるので最低1オクターブ確保する
		if (pitchMax - pitchMin < 12) {
			const mid = (pitchMax + pitchMin) / 2;
			pitchMin = Math.round(mid - 6);
			pitchMax = Math.round(mid + 6);
		}

		// 歌詞は parseLyrics と同じ Map<trackId, LyricTrack> を辿る。
		// どのトラックを画面に出すかはレイヤー側（MvLyricsLayer.trackId）で選ぶので、
		// ここでは全トラックぶんを trackId 付きで持っておく。
		const lyricMap =
			parsed.lyrics && parsed.lyrics.size > 0
				? parsed.lyrics
				: dtm.parseLyrics(cleaned);
		const lyricLines: MvLyricLine[] = [];
		const lyricTrackIds: number[] = [];
		lyricMap?.forEach((track) => {
			const lines = lyricLinesFromTrack(
				track.trackId,
				track.syllables,
				track.lineBreaks,
				byTrack.get(track.trackId) ?? [],
			);
			if (lines.length > 0) {
				lyricTrackIds.push(track.trackId);
				lyricLines.push(...lines);
			}
		});
		lyricTrackIds.sort((a, b) => a - b);
		lyricLines.sort((a, b) => a.bar - b.bar);

		song = {
			bpm: parsed.bpm ?? 120,
			totalSteps,
			totalBars: Math.ceil(totalSteps / MV_STEPS_PER_BAR),
			notes,
			byTrack,
			tracks,
			pitchMin,
			pitchMax,
			lyricLines,
			lyricTrackIds,
		};
	} catch (e) {
		console.error("[mv-engine] failed to parse mml", e);
	}

	songCache.set(key, song);
	return song;
}

/**
 * 歌詞トラックの音節列を「行」へまとめ、各行の開始小節を演奏ノートから求める。
 *
 * 音節と演奏ノートは同じトラックIDで1:1に対応する前提（@onjmin/dtm の歌唱合成と同じ割り当て）。
 * lineBreaks が無い＝1行で書かれた歌詞は、長いと画面に収まらないので一定文字数で折る。
 */
function lyricLinesFromTrack(
	trackId: number,
	syllables: { kana: string }[],
	lineBreaks: number[] | undefined,
	trackNotes: MvNote[],
): MvLyricLine[] {
	if (!syllables || syllables.length === 0 || trackNotes.length === 0)
		return [];

	const breaks = new Set(lineBreaks ?? []);
	const SOFT_WRAP = 12;
	const useSoftWrap = breaks.size === 0 && syllables.length > SOFT_WRAP * 1.5;

	const lines: MvLyricLine[] = [];
	let text = "";
	let startStep: number | null = null;

	const flush = () => {
		if (text && startStep !== null)
			lines.push({ bar: startStep / MV_STEPS_PER_BAR, text, trackId });
		text = "";
		startStep = null;
	};

	syllables.forEach((syl, i) => {
		if (i > 0 && (breaks.has(i) || (useSoftWrap && i % SOFT_WRAP === 0)))
			flush();
		if (startStep === null)
			startStep = trackNotes[Math.min(i, trackNotes.length - 1)].startStep;
		text += syl.kana;
	});
	flush();

	return lines;
}

// ───────────────── 画像の先読み ─────────────────

/** manifest が参照する画像URLを列挙する（未解決の post: 参照は除く）。 */
export function collectMvImageUrls(manifest: MvManifest): string[] {
	const urls: string[] = [];
	const push = (u?: string | null) => {
		if (u) urls.push(u);
	};
	push(stageBgUrl(manifest.stage));
	// 場面ごとに差し替わる背景も先に読んでおく。場面へ入ってから読み始めると
	// 切り替わった直後の数フレームだけ背景が抜ける。
	for (const section of manifest.sections) {
		if (section.stage) push(stageBgUrl(section.stage));
		// 粒子の転換はシート画像で描くので、こちらも先に読んでおく
		if (section.transition?.style === "dissolve") push(MV_PARTICLE_REVEAL_URL);
	}
	for (const layer of manifest.layers) {
		if (layer.kind === "image") push(layerImageUrl(layer));
		if (
			layer.entrance?.style === "particle" ||
			layer.exit?.style === "particle"
		) {
			push(MV_PARTICLE_REVEAL_URL);
			push(MV_PARTICLE_COVER_URL);
		}
	}
	return [...new Set(urls)];
}

/** 背景の表示URL。`bgRef: ''`（背景なしの明示）は null。 */
function stageBgUrl(stage: { bgUrl?: string; bgRef?: string }): string | null {
	return stage.bgUrl ?? (stage.bgRef ? imageRefToUrl(stage.bgRef) : null);
}

/** manifest の画像を全部読み込む。失敗した画像は無視して他を待つ。 */
export async function preloadMvImages(manifest: MvManifest): Promise<void> {
	await Promise.all(
		collectMvImageUrls(manifest).map((u) => loadImage(u).catch(() => null)),
	);
}

function layerImageUrl(layer: MvImageLayer): string | null {
	return layer.url ?? imageRefToUrl(layer.ref);
}

// ───────────────── フレーム状態 ─────────────────

export interface MvFrameState {
	/** 音声クロック由来の再生ステップ（小数可）。 */
	step: number;
	/** 再生開始からの経過秒。時間ベースの動き(drift/zoom)に使う。 */
	timeSec: number;
}

interface DrawCtx {
	ctx: CanvasRenderingContext2D;
	manifest: MvManifest;
	/** いまの場面ぶんの上書きを反映した背景設定。背景・パレットはこちらを見る。 */
	stage: MvStage;
	song: MvSong;
	step: number;
	timeSec: number;
	bar: number;
	/** 拍の頭で1、次の拍の直前で0になる減衰エンベロープ */
	beatEnv: number;
	/** 小節の頭で1、小節末で0 */
	barEnv: number;
	sectionId: string | null;
	section: MvSection | null;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const DEG = Math.PI / 180;

/** 音符の頭で立ち上がり減衰する、拍単位のエンベロープ。 */
function envelope(step: number, period: number, curve = 2): number {
	if (period <= 0) return 0;
	const phase = ((step % period) + period) % period;
	return clamp01(Math.pow(1 - phase / period, curve));
}

// ───────────────── トラックの鳴りを読む ─────────────────

/** 昇順配列で startStep <= step を満たす最後の要素の添字。無ければ -1。 */
function lastIndexAtOrBefore(list: MvNote[], step: number): number {
	let lo = 0;
	let hi = list.length - 1;
	let ans = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (list[mid].startStep <= step) {
			ans = mid;
			lo = mid + 1;
		} else hi = mid - 1;
	}
	return ans;
}

/** 対象トラックのノート列を返す。track 未指定なら全ノート。 */
function trackNotes(song: MvSong, track?: number): MvNote[] {
	if (track === undefined) return song.notes;
	return song.byTrack.get(track) ?? [];
}

/** 直近に鳴り始めた音からの減衰（0..1）。 */
function trackOnsetEnv(
	song: MvSong,
	step: number,
	track: number | undefined,
	decaySteps: number,
): number {
	const list = trackNotes(song, track);
	const idx = lastIndexAtOrBefore(list, step);
	if (idx < 0) return 0;
	const age = step - list[idx].startStep;
	if (age >= decaySteps) return 0;
	return clamp01(1 - age / decaySteps);
}

/** いま鳴っている音の強さの合計（0..1）。 */
function trackEnergy(
	song: MvSong,
	step: number,
	track: number | undefined,
): number {
	const list = trackNotes(song, track);
	const idx = lastIndexAtOrBefore(list, step);
	if (idx < 0) return 0;
	let sum = 0;
	// 長い音を取りこぼさないよう、直近64音ぶんだけ遡って重なりを見る
	for (let i = idx; i >= 0 && i > idx - 64; i--) {
		const n = list[i];
		const end = n.startStep + n.durationSteps;
		if (end <= step) continue;
		const life = clamp01(
			1 - (step - n.startStep) / Math.max(1, n.durationSteps),
		);
		sum += (n.velocity / 127) * (0.4 + 0.6 * life);
	}
	return clamp01(sum);
}

/** いま鳴っている音の高さを曲の音域内 0..1 で返す。鳴っていなければ 0.5。 */
function trackPitchNorm(
	song: MvSong,
	step: number,
	track: number | undefined,
): number {
	const list = trackNotes(song, track);
	const idx = lastIndexAtOrBefore(list, step);
	if (idx < 0) return 0.5;
	const range = Math.max(1, song.pitchMax - song.pitchMin);
	return clamp01((list[idx].pitch - song.pitchMin) / range);
}

// ───────────────── モジュレータ ─────────────────

function modSourceValue(d: DrawCtx, m: MvModulator): number {
	switch (m.source) {
		case "beat": {
			// periodBeats未指定/1なら従来どおり1拍周期。指定時は周期を伸縮する
			// （0.5で2倍速、2で半分の速さ、というように小さいほど速い）。
			const beatPeriod = Math.max(1, MV_STEPS_PER_BEAT * (m.periodBeats ?? 1));
			if (m.periodBeats === undefined || m.periodBeats === 1) {
				return m.curve === undefined
					? d.beatEnv
					: envelope(d.step, beatPeriod, m.curve);
			}
			return envelope(d.step, beatPeriod, m.curve ?? 2);
		}
		case "bar":
			return m.curve === undefined
				? d.barEnv
				: envelope(d.step, MV_STEPS_PER_BAR, m.curve);
		case "phrase": {
			// フレーズ(既定8小節)の頭で1、終わりへ向かってなめらかに0へ。
			// op:"sub" で使うと逆向き＝終わりに向かって育つカーブになる。
			const period = Math.max(1, m.bars ?? 8) * MV_STEPS_PER_BAR;
			const curve = m.curve ?? 2;
			if (!m.symmetric) return envelope(d.step, period, curve);
			// symmetric: いちばん近い境目からの距離で山を作る（境目=1、中央=0）。
			// 減衰のみだと境目の手前で0のままになり、実測にある「境目へ向かう
			// 立ち上がり」が出せずカクッと不連続になる。
			const phase = ((d.step % period) + period) % period;
			const dist = Math.min(phase, period - phase) / (period / 2);
			return clamp01(Math.pow(1 - dist, curve));
		}
		case "time":
			return d.timeSec % 1;
		case "spin":
			// 巻き戻らない経過秒数。rotationにop:"mul"で使うと途切れず回り続ける
			// （"time"は1秒ごとに0→1へ戻るので、回転に使うと毎秒ガクッと戻ってしまう）。
			return d.timeSec;
		case "trackEnergy":
			return trackEnergy(d.song, d.step, m.track);
		case "trackOnset":
			return trackOnsetEnv(d.song, d.step, m.track, MV_STEPS_PER_BEAT);
		case "trackPitch":
			return trackPitchNorm(d.song, d.step, m.track);
		case "constant":
			return 1;
		default:
			return 0;
	}
}

/** 割り算の分母の下限。これ未満に潰れると図形が画面いっぱいに膨れ上がるので頭打ちにする。 */
const MIN_DIVISOR = 0.05;

function applyOp(base: number, delta: number, op: MvModOp): number {
	switch (op) {
		case "add":
			return base + delta;
		case "sub":
			return base - delta;
		case "mul":
			return base * delta;
		case "div": {
			// 拍エンベロープのように0へ近づく値で割ると発散するため、分母を下限でクランプする。
			// （上限20倍まで。これ以上は「画面が真っ白」になるだけで演出として意味がない）
			const d =
				Math.abs(delta) < MIN_DIVISOR
					? delta < 0
						? -MIN_DIVISOR
						: MIN_DIVISOR
					: delta;
			return base / d;
		}
		default:
			return base;
	}
}

/**
 * 基準値にモジュレータを順に適用する。
 * 「足す→掛ける→引く」のように重ねがけできるのが肝で、これが複雑な動きの素になる。
 */
function modulate(
	d: DrawCtx,
	mods: MvModulator[] | undefined,
	target: MvModTarget,
	base: number,
	/** 評価時刻をこのステップぶん巻き戻す（図形グループを1個ずつ遅らせる用）。 */
	delaySteps = 0,
): number {
	if (!mods || mods.length === 0) return base;
	const dd = delaySteps > 0 ? shiftCtx(d, delaySteps) : d;
	let v = base;
	for (const m of mods) {
		if (m.target !== target) continue;
		v = applyOp(v, modSourceValue(dd, m) * m.amount, modOp(m));
	}
	return v;
}

/**
 * 'spin' は「経過秒数」なので、掛けるのではなく足すのが唯一の正しい使い方。
 * 掛けると元の値が0の図形（追加した直後はすべてそう）で 0×経過=0 になって
 * 永久に動かず、0でなくても回転速度が元の角度に比例して際限なく加速してしまう。
 * 保存済みのデータに op:'mul' が焼き込まれているので、読む側でも直す。
 */
function modOp(m: MvModulator): MvModOp {
	if (m.source === "spin" && m.op === "mul") return "add";
	return m.op;
}

/** 評価時刻だけずらした DrawCtx を作る（描画には使わない、モジュレータ評価専用）。 */
function shiftCtx(d: DrawCtx, delaySteps: number): DrawCtx {
	const step = Math.max(0, d.step - delaySteps);
	const secPerStep = 60 / (d.song.bpm || 120) / MV_STEPS_PER_BEAT;
	return {
		...d,
		step,
		bar: step / MV_STEPS_PER_BAR,
		timeSec: Math.max(0, d.timeSec - delaySteps * secPerStep),
		beatEnv: envelope(step, MV_STEPS_PER_BEAT),
		barEnv: envelope(step, MV_STEPS_PER_BAR),
	};
}

// ───────────────── 1フレーム描画 ─────────────────

/**
 * MVの1フレームを描画する。ctx は論理解像度 MV_W×MV_H の座標系であること。
 * 画像は preloadMvImages 済み前提（未ロードのものは黙って飛ばす）。
 */
export function drawMvFrame(
	ctx: CanvasRenderingContext2D,
	manifest: MvManifest,
	song: MvSong,
	frame: MvFrameState,
	options?: {
		selectedLayerId?: string | null;
		hoveredLayerId?: string | null;
	},
): void {
	const step = Math.max(0, frame.step);
	const bar = step / MV_STEPS_PER_BAR;
	const section = sectionAtBar(manifest.sections, bar);

	const d: DrawCtx = {
		ctx,
		manifest,
		stage: resolveSceneStage(manifest.stage, section),
		song,
		step,
		timeSec: frame.timeSec,
		bar,
		beatEnv: envelope(step, MV_STEPS_PER_BEAT),
		barEnv: envelope(step, MV_STEPS_PER_BAR),
		sectionId: section?.id ?? null,
		section,
	};

	const visible = manifest.layers.filter((l) =>
		isLayerVisible(l, d.sectionId, d.bar),
	);
	const effects = visible.filter(
		(l): l is MvEffectLayer => l.kind === "effect",
	);
	const drawables = visible
		.filter((l) => l.kind !== "effect")
		.map((l, idx) => ({ l, idx }))
		.sort(
			(a, b) => (a.l.z ?? a.idx * 10) - (b.l.z ?? b.idx * 10) || a.idx - b.idx,
		)
		.map((item) => item.l);

	ctx.save();
	ctx.clearRect(0, 0, MV_W, MV_H);

	// 画面ゆれ・ズームパンチ・ロールは「フレーム全体の変形」なので、中身を描く前に掛ける
	const transform = frameTransform(d, effects);
	if (transform) {
		ctx.translate(MV_W / 2 + transform.dx, MV_H / 2 + transform.dy);
		ctx.rotate(transform.rot);
		ctx.scale(transform.scale, transform.scale);
		ctx.translate(-MV_W / 2, -MV_H / 2);
	}

	drawStage(d);

	for (const layer of drawables) {
		ctx.save();
		ctx.globalAlpha = layer.opacity ?? 1;
		drawLayerWithTransitions(d, layer);
		ctx.restore();
	}

	ctx.restore();

	// 色ズレ・グリッチ・残像などは「描き上がった画」を読み直して作るので、
	// レイヤーを全部描き終えてから、被せるだけの演出より先に掛ける
	drawPostEffects(d, effects);

	// フラッシュ・色反転などは全部の上に重ねる（変形の影響を受けない）
	drawOverlayEffects(d, effects);

	// 場面の切り替わり。演出より上・曲頭/曲尾のフェードより下に重ねる
	drawTransition(d);

	// フェードイン/アウト
	if (manifest.stage.fadeIn || manifest.stage.fadeOut) {
		let fadeAlpha = 0;
		const fadeSteps = MV_STEPS_PER_BAR; // 1小節分をフェードにかける

		if (manifest.stage.fadeIn && d.step < fadeSteps) {
			fadeAlpha = 1 - d.step / fadeSteps;
		} else if (
			manifest.stage.fadeOut &&
			song.totalSteps > 0 &&
			d.step > song.totalSteps - fadeSteps
		) {
			fadeAlpha = (d.step - (song.totalSteps - fadeSteps)) / fadeSteps;
			if (fadeAlpha > 1) fadeAlpha = 1;
		}

		if (fadeAlpha > 0.001) {
			ctx.save();
			ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
			ctx.fillRect(0, 0, MV_W, MV_H);
			ctx.restore();
		}
	}

	// 編集用：ホバー・選択レイヤーのアタリ枠表示
	if (
		options?.hoveredLayerId &&
		options.hoveredLayerId !== options.selectedLayerId
	) {
		const target = manifest.layers.find((l) => l.id === options.hoveredLayerId);
		if (target) {
			drawLayerHighlight(
				ctx,
				target,
				"#eab308",
				`[ホバー: ${target.name || target.kind}]`,
			);
		}
	}
	if (options?.selectedLayerId) {
		const target = manifest.layers.find(
			(l) => l.id === options.selectedLayerId,
		);
		if (target) {
			drawLayerHighlight(
				ctx,
				target,
				"#3b82f6",
				`[選択中: ${target.name || target.kind}]`,
			);
		}
	}
}

function drawLayerHighlight(
	ctx: CanvasRenderingContext2D,
	layer: MvLayer,
	color: string,
	label: string,
): void {
	let x = 0,
		y = 0,
		w = 60,
		h = 60;
	if (layer.kind === "visualizer") {
		x = layer.rect.x;
		y = layer.rect.y;
		w = layer.rect.w;
		h = layer.rect.h;
	} else if (layer.kind === "image") {
		const s = (layer.scale ?? 1) * 80;
		x = layer.x - s / 2;
		y = layer.y - s / 2;
		w = s;
		h = s;
	} else if (layer.kind === "text" || layer.kind === "lyrics") {
		const sz = layer.size ?? 16;
		x = layer.x - 10;
		y = layer.y - sz / 2 - 4;
		w = 160;
		h = sz + 12;
	} else if (layer.kind === "shape") {
		const sz = (layer.size ?? 1) * 60;
		x = layer.x - sz / 2;
		y = layer.y - sz / 2;
		w = sz;
		h = sz;
	} else {
		x = 10;
		y = 10;
		w = MV_W - 20;
		h = MV_H - 20;
	}

	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.setLineDash([5, 5]);
	ctx.strokeRect(x, y, w, h);

	// タグバッジ
	ctx.setLineDash([]);
	ctx.fillStyle = color;
	ctx.font = "bold 11px sans-serif";
	const textWidth = ctx.measureText(label).width;
	const tagY = Math.max(0, y - 20);
	ctx.fillRect(x, tagY, textWidth + 10, 20);
	ctx.fillStyle = "#ffffff";
	ctx.fillText(label, x + 5, tagY + 14);
	ctx.restore();
}

// ───────────────── 画面エフェクト ─────────────────

/**
 * 生の発火量（0..1、1が発火直後）にカーブを掛ける。
 * 直線減衰だけだと鋭いキックもじわっと来るサビも同じ顔になるので形を選べるようにしてある。
 */
function applyEffectCurve(v: number, curve: MvEffectCurve | undefined): number {
	if (v <= 0) return 0;
	switch (curve) {
		case "exp":
			return v * v * v;
		case "soft":
			return Math.sqrt(v);
		// ふくらんで消える：発火直後は0から立ち上がる。v は 1→0 なので山は v=0.5 のとき。
		case "swell":
			return Math.sin(Math.PI * (1 - v));
		case "hold":
			return 1;
		default:
			return v;
	}
}

/**
 * 周期発火（拍ごと／小節ごと）の生の量。
 * `every` で間引き、`offsetBeats` で位相をずらす。拍の頭に全部の演出が揃うと
 * 平坦になるので、演出ごとにタイミングをばらせるようにしてある。
 */
function periodicEnv(
	step: number,
	period: number,
	decaySteps: number,
	offsetSteps: number,
): number {
	if (period <= 0) return 0;
	const phase = (((step - offsetSteps) % period) + period) % period;
	if (phase >= decaySteps) return 0;
	return clamp01(1 - phase / decaySteps);
}

/** エフェクトの発火量 0..1。 */
function effectEnv(d: DrawCtx, fx: MvEffectLayer): number {
	const decaySteps = Math.max(1, (fx.decayBeats ?? 1) * MV_STEPS_PER_BEAT);
	const every = Math.max(1, Math.round(fx.every ?? 1));
	const offsetSteps = (fx.offsetBeats ?? 0) * MV_STEPS_PER_BEAT;
	const raw = ((): number => {
		switch (fx.trigger) {
			case "always":
				return 1;
			case "beat":
				return periodicEnv(
					d.step,
					MV_STEPS_PER_BEAT * every,
					decaySteps,
					offsetSteps,
				);
			case "bar":
				return periodicEnv(
					d.step,
					MV_STEPS_PER_BAR * every,
					decaySteps,
					offsetSteps,
				);
			default:
				return rareEffectEnv(d, fx, decaySteps, offsetSteps);
		}
	})();
	// 'always' はカーブを掛けても意味が無い（常に1）ので素通しする。
	return fx.trigger === "always" ? raw : applyEffectCurve(raw, fx.curve);
}

/** 小節指定・ノート・場面。周期発火ほど毎フレーム通らないので分けてある。 */
function rareEffectEnv(
	d: DrawCtx,
	fx: MvEffectLayer,
	decaySteps: number,
	offsetSteps: number,
): number {
	// offsetBeats は周期発火だけでなく「音より少し遅らせて効かせる」にも使いたいので、
	// どのトリガーでも読む時刻そのものをずらす形で効かせる。
	const step = d.step - offsetSteps;
	switch (fx.trigger) {
		case "bars": {
			// 指定した小節の頭だけで発火する。「毎回」ではなく狙った瞬間だけ光らせるためのトリガー。
			if (!fx.bars || fx.bars.length === 0) return 0;
			let best = 0;
			for (const b of fx.bars) {
				const age = step - b * MV_STEPS_PER_BAR;
				if (age < 0 || age >= decaySteps) continue;
				const v = 1 - age / decaySteps;
				if (v > best) best = v;
			}
			return clamp01(best);
		}
		case "note": {
			if (!fx.tracks || fx.tracks.length === 0)
				return trackOnsetEnv(d.song, step, undefined, decaySteps);
			let best = 0;
			for (const t of fx.tracks)
				best = Math.max(best, trackOnsetEnv(d.song, step, t, decaySteps));
			return best;
		}
		case "section": {
			if (!d.section) return 0;
			const age = step - d.section.startBar * MV_STEPS_PER_BAR;
			if (age < 0 || age >= decaySteps) return 0;
			return clamp01(1 - age / decaySteps);
		}
		default:
			return 0;
	}
}

/** フレーム全体の変形になる演出（描く前に掛かるもの）。 */
const FRAME_TRANSFORM_STYLES: ReadonlySet<MvEffectStyle> = new Set([
	"shake",
	"zoomPunch",
	"roll",
]);

/** 描き終わった画をもう一度読んで作る演出（一覧は mv-config と共有する）。 */
const POST_EFFECT_STYLES = MV_EFFECT_POST_STYLES;

/** 画面ゆれ／ズームパンチ／ロールをまとめて1つの変形にする。 */
function frameTransform(
	d: DrawCtx,
	effects: MvEffectLayer[],
): { dx: number; dy: number; scale: number; rot: number } | null {
	let dx = 0;
	let dy = 0;
	let scale = 1;
	let rot = 0;
	let any = false;

	for (const fx of effects) {
		if (!FRAME_TRANSFORM_STYLES.has(fx.style)) continue;
		const env = effectEnv(d, fx) * clamp01(fx.amount);
		if (env <= 0.001) continue;
		if (fx.style === "shake") {
			// 決まった揺れ方にならないよう、時間で位相をずらす
			const amp = env * 14;
			dx += Math.sin(d.timeSec * 97) * amp;
			dy += Math.cos(d.timeSec * 113) * amp;
			any = true;
		} else if (fx.style === "zoomPunch") {
			scale *= 1 + env * 0.18;
			any = true;
		} else if (fx.style === "roll") {
			// 揺れ(平行移動)とは違う軸の勢いが欲しいので、傾けるほうは回転で持つ。
			// 拡大を少し足すのは、回した四隅から下地が見えてしまうのを防ぐため。
			rot += Math.sin(d.timeSec * 6.1) * env * 0.11;
			scale *= 1 + env * 0.06;
			any = true;
		}
	}

	return any ? { dx, dy, scale, rot } : null;
}

// ───────────────── 後処理（描いた画を読み直す演出） ─────────────────

/**
 * 後処理は「描き終わった画をもう一度読む」ので、取り込み用の裏キャンバスが要る。
 * 毎フレーム作ると GC でカクつくため、モジュールに2枚だけ持って使い回す。
 * A＝フレームの取り込み、B＝チャンネル抽出やモザイクなどの中間結果。
 */
const scratchA = {
	canvas: null as HTMLCanvasElement | null,
	ctx: null as CanvasRenderingContext2D | null,
};
const scratchB = {
	canvas: null as HTMLCanvasElement | null,
	ctx: null as CanvasRenderingContext2D | null,
};

function scratchCtx(
	slot: typeof scratchA,
	w: number,
	h: number,
): CanvasRenderingContext2D | null {
	if (typeof document === "undefined") return null;
	if (!slot.canvas) {
		slot.canvas = document.createElement("canvas");
		slot.ctx = slot.canvas.getContext("2d");
	}
	const ctx = slot.ctx;
	const canvas = slot.canvas;
	if (!ctx || !canvas) return null;
	if (canvas.width !== w || canvas.height !== h) {
		// サイズ代入は中身も消えるので、ここでは clearRect を重ねない
		canvas.width = w;
		canvas.height = h;
	} else {
		ctx.clearRect(0, 0, w, h);
	}
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = "source-over";
	ctx.filter = "none";
	ctx.imageSmoothingEnabled = true;
	return ctx;
}

/** 取り込んだ1フレーム。デバイスpxとMV論理pxの対応も持つ。 */
interface FrameSnap {
	src: HTMLCanvasElement;
	/** デバイスpx */
	dw: number;
	dh: number;
	/** 論理1pxあたりのデバイスpx */
	sx: number;
	sy: number;
}

/**
 * いまの ctx に描かれている MV_W×MV_H の範囲を裏キャンバスへ取り込む。
 * ctx には呼び出し側（MvPlayer）の dpr 拡大が掛かっているので、変換行列から
 * デバイス座標を割り出す。キャンバス全体を前提にすると dpr 以外の使われ方で崩れる。
 */
function snapFrame(ctx: CanvasRenderingContext2D): FrameSnap | null {
	const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
	const sx = m && Math.abs(m.a) > 1e-6 ? Math.abs(m.a) : 1;
	const sy = m && Math.abs(m.d) > 1e-6 ? Math.abs(m.d) : 1;
	const ox = m ? m.e : 0;
	const oy = m ? m.f : 0;
	const dw = Math.max(1, Math.round(MV_W * sx));
	const dh = Math.max(1, Math.round(MV_H * sy));
	const sctx = scratchCtx(scratchA, dw, dh);
	if (!sctx) return null;
	try {
		sctx.drawImage(
			ctx.canvas,
			Math.round(ox),
			Math.round(oy),
			dw,
			dh,
			0,
			0,
			dw,
			dh,
		);
	} catch {
		// 汚染キャンバス等。後処理を諦めるだけで、素の画はそのまま残る。
		return null;
	}
	return { src: sctx.canvas, dw, dh, sx, sy };
}

/**
 * 残像の履歴。キャンバスごとに1枚持つ（プレビューと書き出しで混ざらないように）。
 * シークで時間が飛んだら古い尾が残ってしまうので step も覚えておいて捨てる。
 */
const trailBuffers = new WeakMap<
	HTMLCanvasElement,
	{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; step: number }
>();

/** step から決まる疑似乱数。同じ小節へシークしたら同じ画になるように時計は使わない。 */
function hash01(n: number): number {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return s - Math.floor(s);
}

/**
 * フィルムノイズ用のタイル。毎フレーム ImageData を作ると 23万画素を触ることになるので、
 * 起動時に数枚だけ焼いておいて位置をずらして貼る。
 */
const GRAIN_TILE_SIZE = 128;
const GRAIN_TILE_COUNT = 4;
let grainTiles: HTMLCanvasElement[] | null = null;

function getGrainTiles(): HTMLCanvasElement[] | null {
	if (grainTiles) return grainTiles;
	if (typeof document === "undefined") return null;
	const tiles: HTMLCanvasElement[] = [];
	for (let t = 0; t < GRAIN_TILE_COUNT; t++) {
		const c = document.createElement("canvas");
		c.width = GRAIN_TILE_SIZE;
		c.height = GRAIN_TILE_SIZE;
		const cx = c.getContext("2d");
		if (!cx) return null;
		const img = cx.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
		for (let i = 0; i < img.data.length; i += 4) {
			const v = 90 + Math.floor(Math.random() * 76);
			img.data[i] = v;
			img.data[i + 1] = v;
			img.data[i + 2] = v;
			img.data[i + 3] = 255;
		}
		cx.putImageData(img, 0, 0);
		tiles.push(c);
	}
	grainTiles = tiles;
	return grainTiles;
}

/** 取り込んだ画から1チャンネルだけ抜いた版を作る（色ズレ用）。 */
function channelCopy(snap: FrameSnap, rgb: string): HTMLCanvasElement | null {
	const b = scratchCtx(scratchB, snap.dw, snap.dh);
	if (!b) return null;
	b.drawImage(snap.src, 0, 0);
	// multiply で純色を掛けると、その色の成分以外が0になる＝チャンネル抽出になる
	b.globalCompositeOperation = "multiply";
	b.fillStyle = rgb;
	b.fillRect(0, 0, snap.dw, snap.dh);
	b.globalCompositeOperation = "source-over";
	return b.canvas;
}

/**
 * 描き終わった画を読み直して掛ける演出。
 * レイヤーの上・フラッシュ等のオーバーレイの下に入る（オーバーレイは"画"ではなく
 * "画に被せる光"なので、歪みの対象にはしない）。
 */
function drawPostEffects(d: DrawCtx, effects: MvEffectLayer[]): void {
	const { ctx } = d;
	for (const fx of effects) {
		if (!POST_EFFECT_STYLES.has(fx.style)) continue;
		const env = effectEnv(d, fx) * clamp01(fx.amount);
		if (env <= 0.004) continue;
		const snap = snapFrame(ctx);
		if (!snap) return;

		ctx.save();
		switch (fx.style) {
			case "rgbShift": {
				const off = env * 7;
				// 一度消してから R/G/B を別々の位置で足し戻す。ずれ幅0なら元通りになる。
				ctx.clearRect(0, 0, MV_W, MV_H);
				ctx.globalCompositeOperation = "lighter";
				// ずらすと画面端にその色が届かない帯ができるので、ずれ幅ぶん広げて描く。
				// 拡大率は 640px に対して数%——ズームとしては見えず、端の欠けだけが消える。
				const grow = 1 + (2 * off) / MV_W;
				const w = MV_W * grow;
				const h = MV_H * grow;
				const parts: [string, number][] = [
					["#ff0000", -off],
					["#00ff00", 0],
					["#0000ff", off],
				];
				for (const [rgb, dx] of parts) {
					const layerCanvas = channelCopy(snap, rgb);
					if (!layerCanvas) break;
					ctx.drawImage(layerCanvas, dx + (MV_W - w) / 2, (MV_H - h) / 2, w, h);
				}
				break;
			}
			case "glitch": {
				// 横に裂けてズレる。下地は消さない——ずれた隙間から元の画が覗くほうが
				// 「破綻した」に見える（黒帯が出ると単に欠けたように見えてしまう）。
				const slices = 6 + Math.round(env * 12);
				const sliceH = MV_H / slices;
				const seed = Math.floor(d.step);
				for (let i = 0; i < slices; i++) {
					const r = hash01(seed * 31 + i * 7.3);
					if (r > 0.55) continue;
					const shift = (hash01(seed * 17 + i * 3.1) * 2 - 1) * env * 46;
					const y = i * sliceH;
					ctx.drawImage(
						snap.src,
						0,
						Math.round(y * snap.sy),
						snap.dw,
						Math.max(1, Math.round(sliceH * snap.sy)),
						shift,
						y,
						MV_W,
						sliceH,
					);
				}
				break;
			}
			case "pixelate": {
				const block = 1 + env * 24;
				const tw = Math.max(1, Math.round(MV_W / block));
				const th = Math.max(1, Math.round(MV_H / block));
				const b = scratchCtx(scratchB, tw, th);
				if (!b) break;
				b.drawImage(snap.src, 0, 0, tw, th);
				ctx.imageSmoothingEnabled = false;
				ctx.clearRect(0, 0, MV_W, MV_H);
				ctx.drawImage(b.canvas, 0, 0, MV_W, MV_H);
				ctx.imageSmoothingEnabled = true;
				break;
			}
			case "zoomBlur": {
				// 中心から外へ広がるコピーを重ねて流れを作る。段数は6で足りる
				// （増やしても見た目は変わらないのに読み戻しの回数だけ増える）。
				const passes = 6;
				const maxZoom = env * 0.18;
				ctx.globalAlpha = 0.85 / passes;
				for (let i = 1; i <= passes; i++) {
					const s = 1 + (maxZoom * i) / passes;
					const w = MV_W * s;
					const h = MV_H * s;
					ctx.drawImage(snap.src, (MV_W - w) / 2, (MV_H - h) / 2, w, h);
				}
				break;
			}
			case "shockwave": {
				// env は 1→0 と落ちるので、輪は (1-env) に比例して外へ広がる。
				const cx = fx.x ?? MV_W / 2;
				const cy = fx.y ?? MV_H / 2;
				const maxR = Math.hypot(MV_W, MV_H) * 0.6;
				const r = (1 - env) * maxR;
				const thickness = 26 + env * 34;
				ctx.beginPath();
				ctx.arc(cx, cy, r + thickness / 2, 0, Math.PI * 2);
				ctx.arc(cx, cy, Math.max(0, r - thickness / 2), 0, Math.PI * 2, true);
				ctx.clip();
				// 輪の内側だけ拡大して描き直す＝押しのけられたように見える
				const s = 1 + env * 0.09;
				ctx.drawImage(
					snap.src,
					cx - (cx - 0) * s,
					cy - (cy - 0) * s,
					MV_W * s,
					MV_H * s,
				);
				ctx.globalCompositeOperation = "lighter";
				ctx.globalAlpha = env * 0.35;
				ctx.fillStyle = fx.color ?? "#ffffff";
				ctx.fillRect(0, 0, MV_W, MV_H);
				break;
			}
			case "mirror": {
				// 左半分を反転して右半分へ折り返す。env で元の右半分とクロスフェードする。
				ctx.globalAlpha = env;
				ctx.translate(MV_W, 0);
				ctx.scale(-1, 1);
				ctx.drawImage(
					snap.src,
					0,
					0,
					Math.max(1, Math.floor(snap.dw / 2)),
					snap.dh,
					0,
					0,
					MV_W / 2,
					MV_H,
				);
				break;
			}
			case "bloom": {
				// 元の画を2回 multiply して明るいところだけを残し、ぼかして足す。
				// 全体をぼかして足すと単に霞むので、光っている所だけが滲むようにしている。
				const b = scratchCtx(scratchB, snap.dw, snap.dh);
				if (!b) break;
				b.drawImage(snap.src, 0, 0);
				b.globalCompositeOperation = "multiply";
				b.drawImage(snap.src, 0, 0);
				b.globalCompositeOperation = "source-over";
				ctx.filter = `blur(${(2 + env * 7).toFixed(1)}px)`;
				ctx.globalCompositeOperation = "lighter";
				ctx.globalAlpha = clamp01(env * 0.85);
				ctx.drawImage(b.canvas, 0, 0, MV_W, MV_H);
				ctx.filter = "none";
				break;
			}
			case "hueShift": {
				// 上限は180度。360度まで回せるようにすると強さ1が「一周して元通り＝無変化」に
				// なってしまう。180度＝補色で、色相の振れ幅としてはここが最大。
				ctx.filter = `hue-rotate(${Math.round(env * 180)}deg)`;
				ctx.clearRect(0, 0, MV_W, MV_H);
				ctx.drawImage(snap.src, 0, 0, MV_W, MV_H);
				ctx.filter = "none";
				break;
			}
			case "trail": {
				drawTrail(d, fx, snap, env);
				break;
			}
		}
		ctx.restore();
	}
}

/**
 * 前のコマを足し戻して尾を引かせる。
 *
 * 加算合成なので、貯めこむ係数が1に近いと止まっている明るい所が白く飛ぶ。
 * ゲインと保存時の減衰を掛けた値（＝1コマあたりの残り率）が必ず1未満になるよう抑え、
 * さらに履歴をわずかに拡大して貯めることで、同じ画素に延々と足し続けないようにしてある。
 */
function drawTrail(
	d: DrawCtx,
	fx: MvEffectLayer,
	snap: FrameSnap,
	env: number,
): void {
	const { ctx } = d;
	if (typeof document === "undefined") return;
	const dest = ctx.canvas;
	let rec = trailBuffers.get(dest);
	if (!rec || rec.canvas.width !== snap.dw || rec.canvas.height !== snap.dh) {
		const c = document.createElement("canvas");
		c.width = snap.dw;
		c.height = snap.dh;
		const cx = c.getContext("2d");
		if (!cx) return;
		rec = { canvas: c, ctx: cx, step: Number.NEGATIVE_INFINITY };
		trailBuffers.set(dest, rec);
	}

	// シーク・巻き戻し・停止からの再開で、無関係な時刻の尾が残らないようにする
	const delta = d.step - rec.step;
	const continuous = delta > 0 && delta <= 24;

	if (continuous) {
		ctx.globalCompositeOperation = "lighter";
		ctx.globalAlpha = clamp01(env * 0.8);
		ctx.drawImage(rec.canvas, 0, 0, MV_W, MV_H);
		ctx.globalCompositeOperation = "source-over";
		ctx.globalAlpha = 1;
	}

	// いま画面にある（＝尾を足した後の）画を、少し縮めて次コマ用に貯める
	const after = snapFrame(ctx);
	rec.ctx.setTransform(1, 0, 0, 1, 0, 0);
	rec.ctx.globalCompositeOperation = "source-over";
	rec.ctx.clearRect(0, 0, snap.dw, snap.dh);
	if (after) {
		const grow = 1.015;
		const w = snap.dw * grow;
		const h = snap.dh * grow;
		rec.ctx.globalAlpha = 0.9;
		rec.ctx.drawImage(after.src, (snap.dw - w) / 2, (snap.dh - h) / 2, w, h);
		rec.ctx.globalAlpha = 1;
	}
	rec.step = d.step;
}

/** フラッシュ・反転・ストロボ・周辺減光など、画に被せるだけの演出を上へ重ねる。 */
function drawOverlayEffects(d: DrawCtx, effects: MvEffectLayer[]): void {
	const { ctx } = d;
	for (const fx of effects) {
		if (FRAME_TRANSFORM_STYLES.has(fx.style)) continue;
		if (POST_EFFECT_STYLES.has(fx.style)) continue;
		const env = effectEnv(d, fx) * clamp01(fx.amount);
		if (env <= 0.004) continue;

		ctx.save();
		switch (fx.style) {
			case "flash":
				ctx.fillStyle = withAlpha(fx.color ?? "#ffffff", env);
				ctx.fillRect(0, 0, MV_W, MV_H);
				break;
			case "invert":
				// difference に白を重ねると色が反転する。env でその途中まで持っていく。
				ctx.globalCompositeOperation = "difference";
				ctx.fillStyle = withAlpha("#ffffff", env);
				ctx.fillRect(0, 0, MV_W, MV_H);
				break;
			case "strobe": {
				// 拍を刻んで点滅する。decayBeats を周期として使う。
				const period = Math.max(1, (fx.decayBeats ?? 0.5) * MV_STEPS_PER_BEAT);
				const on = Math.floor(d.step / period) % 2 === 0;
				if (on) {
					ctx.fillStyle = withAlpha(fx.color ?? "#ffffff", env * 0.8);
					ctx.fillRect(0, 0, MV_W, MV_H);
				}
				break;
			}
			case "tint": {
				// 'color' 合成は「元の明るさを保ったまま色味だけ差し替える」。
				// 単色で塗りつぶすと絵が潰れるので、夕焼けへの切り替えはこちらで作る。
				ctx.globalCompositeOperation = "color";
				ctx.globalAlpha = env;
				ctx.fillStyle = fx.color ?? "#f7b82c";
				ctx.fillRect(0, 0, MV_W, MV_H);
				break;
			}
			case "vignette": {
				const g = ctx.createRadialGradient(
					MV_W / 2,
					MV_H / 2,
					MV_H * 0.25,
					MV_W / 2,
					MV_H / 2,
					MV_H * 0.78,
				);
				g.addColorStop(0, withAlpha(fx.color ?? "#000000", 0));
				g.addColorStop(1, withAlpha(fx.color ?? "#000000", env));
				ctx.fillStyle = g;
				ctx.fillRect(0, 0, MV_W, MV_H);
				break;
			}
			case "scanlines": {
				// 2pxおきに1px落とす。ブラウン管は「線が見える」ことが本体なので、
				// 間隔は強さで変えず固定にして、濃さだけを env に任せる。
				ctx.fillStyle = withAlpha(fx.color ?? "#000000", env * 0.55);
				for (let y = 0; y < MV_H; y += 3) ctx.fillRect(0, y, MV_W, 1);
				// ゆっくり降りてくる明るい帯。これが無いと「ただの縞」で止まってしまう。
				const bandY = ((d.timeSec * 42) % (MV_H + 90)) - 90;
				const band = ctx.createLinearGradient(0, bandY, 0, bandY + 90);
				band.addColorStop(0, withAlpha("#ffffff", 0));
				band.addColorStop(0.5, withAlpha("#ffffff", env * 0.07));
				band.addColorStop(1, withAlpha("#ffffff", 0));
				ctx.fillStyle = band;
				ctx.fillRect(0, bandY, MV_W, 90);
				break;
			}
			case "filmGrain": {
				const tiles = getGrainTiles();
				if (!tiles) break;
				// overlay 合成なので、明るい所は明るいまま粒だけが乗る（全体が灰色に濁らない）
				ctx.globalCompositeOperation = "overlay";
				ctx.globalAlpha = clamp01(env * 0.5);
				const t = Math.floor(d.step * 1.7) % tiles.length;
				const tile = tiles[t];
				// 貼り位置も毎コマずらさないと、粒が止まって「汚れ」に見えてしまう
				const ox = -Math.floor(hash01(d.step) * GRAIN_TILE_SIZE);
				const oy = -Math.floor(hash01(d.step + 99) * GRAIN_TILE_SIZE);
				for (let x = ox; x < MV_W; x += GRAIN_TILE_SIZE)
					for (let y = oy; y < MV_H; y += GRAIN_TILE_SIZE)
						ctx.drawImage(tile, x, y);
				break;
			}
			case "letterbox": {
				const h = env * MV_H * 0.15;
				ctx.fillStyle = fx.color ?? "#000000";
				ctx.fillRect(0, 0, MV_W, h);
				ctx.fillRect(0, MV_H - h, MV_W, h);
				break;
			}
		}
		ctx.restore();
	}
}

// ───────────────── 場面の切り替わり ─────────────────

/**
 * 場面へ入った瞬間から `beats` 拍かけて覆いが晴れていく演出。
 *
 * 2画面ぶんを合成するクロスフェードにはしていない。1フレームに2回描くコストを払わずに
 * 「画が入れ替わった」と分かればよく、参考動画の場面転換も実際は黒か白を1拍またぐだけ。
 */
function drawTransition(d: DrawCtx): void {
	const t = d.section?.transition;
	if (!d.section || isMvTransitionInert(t) || !t) return;

	const durSteps = t.beats * MV_STEPS_PER_BEAT;
	const age = d.step - d.section.startBar * MV_STEPS_PER_BAR;
	if (age < 0 || age >= durSteps) return;
	const rest = clamp01(1 - age / durSteps);

	const { ctx } = d;
	ctx.save();
	switch (t.style) {
		case "flash":
			// 光は一瞬で落ちるほうが「切り替わった」に見える
			ctx.fillStyle = withAlpha(t.color ?? "#ffffff", rest * rest);
			ctx.fillRect(0, 0, MV_W, MV_H);
			break;
		case "wipeLeft":
			ctx.fillStyle = t.color ?? "#000000";
			ctx.fillRect(0, 0, MV_W * rest, MV_H);
			break;
		case "wipeRight":
			ctx.fillStyle = t.color ?? "#000000";
			ctx.fillRect(MV_W * (1 - rest), 0, MV_W * rest, MV_H);
			break;
		case "wipeUp":
			ctx.fillStyle = t.color ?? "#000000";
			ctx.fillRect(0, 0, MV_W, MV_H * rest);
			break;
		case "wipeDown":
			ctx.fillStyle = t.color ?? "#000000";
			ctx.fillRect(0, MV_H * (1 - rest), MV_W, MV_H * rest);
			break;
		case "dissolve": {
			// 白い粒子が敷き詰まった状態からほどけていくシート。黒地に加算で重ねるので、
			// シートの黒い部分は何も足さない＝そのまま透ける。
			const img = peekImage(MV_PARTICLE_REVEAL_URL);
			if (img && img.naturalWidth > 0) {
				const cell = img.naturalHeight;
				const idx = Math.min(
					MV_PARTICLE_REVEAL_FRAMES - 1,
					Math.floor((1 - rest) * MV_PARTICLE_REVEAL_FRAMES),
				);
				ctx.globalCompositeOperation = "lighter";
				ctx.imageSmoothingEnabled = false;
				ctx.drawImage(img, idx * cell, 0, cell, cell, 0, 0, MV_W, MV_H);
			} else {
				// シートがまだ読めていないあいだは暗転で代用する（一瞬でも素通しにしない）
				ctx.fillStyle = withAlpha("#000000", rest);
				ctx.fillRect(0, 0, MV_W, MV_H);
			}
			break;
		}
		case "fade":
		default:
			ctx.fillStyle = withAlpha(t.color ?? "#000000", Math.pow(rest, 1.6));
			ctx.fillRect(0, 0, MV_W, MV_H);
			break;
	}
	ctx.restore();
}

// ───────────────── 背景 ─────────────────

function drawStage(d: DrawCtx): void {
	const { ctx } = d;
	const stage = d.stage;

	ctx.fillStyle = stage.bgColor || "#000000";
	ctx.fillRect(0, 0, MV_W, MV_H);

	// 呼吸するラジアルグラデ（C.mp4 の骨格）。拍で中心が明るくなる。
	if (stage.pulse === "breathe") {
		const glow = 0.55 + 0.45 * d.beatEnv;
		const r = MV_H * (0.45 + 0.25 * d.beatEnv);
		const g = ctx.createRadialGradient(
			MV_W / 2,
			MV_H / 2,
			0,
			MV_W / 2,
			MV_H / 2,
			r,
		);
		const tint = stage.palette[0] ?? "#7dd3fc";
		g.addColorStop(0, withAlpha(tint, 0.28 * glow));
		g.addColorStop(0.6, withAlpha(tint, 0.1 * glow));
		g.addColorStop(1, withAlpha(tint, 0));
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, MV_W, MV_H);
	}

	const bgUrl = stageBgUrl(stage);
	const img = bgUrl ? peekImage(bgUrl) : undefined;
	if (img && img.naturalWidth > 0) {
		drawFitted(ctx, img, stage.bgFit);
	}

	if (stage.bgDim && stage.bgDim > 0) {
		ctx.fillStyle = `rgba(0,0,0,${clamp01(stage.bgDim)})`;
		ctx.fillRect(0, 0, MV_W, MV_H);
	}

	// 小節頭のフラッシュ（反転の代わりに白を薄く重ねる）
	if (stage.pulse === "flash") {
		const a = 0.35 * Math.pow(d.barEnv, 3);
		if (a > 0.004) {
			ctx.fillStyle = `rgba(255,255,255,${a})`;
			ctx.fillRect(0, 0, MV_W, MV_H);
		}
	}
}

function drawFitted(
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	fit: string,
): void {
	const iw = img.naturalWidth;
	const ih = img.naturalHeight;
	if (fit === "tile") {
		const pattern = ctx.createPattern(img, "repeat");
		if (pattern) {
			ctx.fillStyle = pattern;
			ctx.fillRect(0, 0, MV_W, MV_H);
		}
		return;
	}
	const scale =
		fit === "contain"
			? Math.min(MV_W / iw, MV_H / ih)
			: Math.max(MV_W / iw, MV_H / ih);
	const w = iw * scale;
	const h = ih * scale;
	ctx.drawImage(img, (MV_W - w) / 2, (MV_H - h) / 2, w, h);
}

// ───────────────── レイヤー分岐 ─────────────────

function drawLayer(d: DrawCtx, layer: MvLayer): void {
	switch (layer.kind) {
		case "image":
			drawImageLayer(d, layer);
			break;
		case "text":
			drawTextLayer(d, layer);
			break;
		case "visualizer":
			drawVisualizer(d, layer);
			break;
		case "lyrics":
			drawLyrics(d, layer);
			break;
		case "shape":
			drawShapeLayer(d, layer);
			break;
		case "chordBar":
			drawChordBar(d, layer);
			break;
		case "degree":
			drawDegree(d, layer);
			break;
		case "effect":
			break; // エフェクトは drawMvFrame 側で別扱い
	}
}

// ───────────────── コード進行バー ─────────────────

/**
 * 画面下のコード進行バー。ブロックを小節位置で並べ、いま鳴っているコードを強調する。
 * 色は度数（キーからの音程）で決める。utau-kit の chord-progression-animation-tool と同じ考え方。
 */
function drawChordBar(d: DrawCtx, layer: MvChordBarLayer): void {
	const { ctx } = d;
	const { x, y, w, h } = layer.rect;
	const chords = [...layer.chords].sort((a, b) => a.bar - b.bar);
	if (chords.length === 0) return;

	const endBar = Math.max(d.song.totalBars, chords[chords.length - 1].bar + 1);
	const windowBars = layer.windowBars ?? 2;
	const page = Math.floor(d.bar / windowBars);
	const pageStartBar = page * windowBars;
	const pageEndBar = pageStartBar + windowBars;

	const barToX = (b: number) => x + ((b - pageStartBar) / windowBars) * w;

	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();

	// バーの下地
	ctx.fillStyle = "rgba(0,0,0,0.55)";
	ctx.fillRect(x, y, w, h);

	ctx.textBaseline = "middle";
	ctx.font = `${layer.size}px ${getMvFontStack()}`;

	let lastThemeColor: string | undefined;

	for (let i = 0; i < chords.length; i++) {
		const c = chords[i];
		const nextBar = i + 1 < chords.length ? chords[i + 1].bar : endBar;

		if (nextBar <= pageStartBar || c.bar >= pageEndBar) continue;

		const bx = barToX(c.bar);
		const bw = Math.max(1, barToX(nextBar) - bx);
		const active = d.bar >= c.bar && d.bar < nextBar;

		let fill: string;
		if (layer.colorMode === "fixed") {
			fill = active ? layer.activeColor : layer.color;
		} else {
			const themeColor = getChordThemeColor(
				c.label,
				layer.key,
				layer.colorMode,
				lastThemeColor,
			);
			lastThemeColor = themeColor;
			if (active) {
				fill =
					layer.activeColor && layer.activeColor !== "#3b82f6"
						? layer.activeColor
						: themeColor.replace(
								/(\d+)%\)/,
								(_, l) => `${Math.min(90, Number(l) + 20)}%)`,
							);
			} else {
				fill = themeColor;
			}
		}

		ctx.fillStyle = fill;
		ctx.fillRect(bx, y, bw - 1, h);

		ctx.fillStyle = layer.textColor;
		ctx.save();
		ctx.beginPath();
		ctx.rect(bx, y, bw - 2, h);
		ctx.clip();
		ctx.fillText(c.label, bx + 3, y + h / 2);
		ctx.restore();
	}

	// ── 再生位置のインジケーター（動くバー） ──
	const playX = barToX(d.bar);
	if (playX >= x && playX <= x + w) {
		ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
		ctx.fillRect(playX - 1, y, 2, h);
	}

	ctx.restore();
}

// ───────────────── 度数（頭の上の数字） ─────────────────

/**
 * そのトラックでいま鳴っている音を、いまのコードの根音から数えて数字にする。
 *
 * 参考動画（運び屋さん）の数字は `9` `♭7` `5`。`2` ではなく `9` と書くので、
 * 調に対する音階度数ではなく **コードの根音からのコードトーン名**。
 * だから同じ音を伸ばしていてもコードが変わると数字が変わる。
 */
function drawDegree(d: DrawCtx, layer: MvDegreeLayer): void {
	const { ctx } = d;
	const list = trackNotes(d.song, layer.track);
	const idx = lastIndexAtOrBefore(list, d.step);
	if (idx < 0) return;
	const note = list[idx];
	const sounding = note.startStep + note.durationSteps > d.step;
	if (!sounding && !layer.hold) return;

	const rootPitch = degreeRootPitch(d, layer);
	if (rootPitch === null) return;

	const label = chordToneLabel(note.pitch - rootPitch);
	const size = layer.size;
	ctx.font = `${layer.bold ? "bold " : ""}${size}px ${getMvFontStack(d.manifest)}`;
	ctx.textBaseline = "top";
	if (layer.shadow) {
		ctx.shadowColor = "rgba(0,0,0,0.9)";
		ctx.shadowBlur = Math.max(2, size * 0.3);
	}
	ctx.fillStyle = layer.color;
	const w = ctx.measureText(label).width;
	const [ax, ay] = anchorOffset(layer.anchor, w, size);
	ctx.fillText(label, layer.x + ax, layer.y + ay);
	ctx.shadowBlur = 0;
}

/** 度数を数える基準の音（0-11）。コード基準なら進行から、調基準なら主音から。 */
function degreeRootPitch(d: DrawCtx, layer: MvDegreeLayer): number | null {
	if (layer.basis === "key") return MV_ROOT_TO_PITCH[layer.key] ?? 0;

	// 自前の進行があればそれを使う（コード進行バーを画面に出さない作りのため）
	if (layer.chords && layer.chords.length > 0) {
		const own = chordAtBar(layer.chords, d.bar);
		if (own) return MV_ROOT_TO_PITCH[chordRootName(own.label)] ?? 0;
	}

	const bar = d.manifest.layers.find(
		(l): l is MvChordBarLayer =>
			l.kind === "chordBar" &&
			(!layer.chordLayerId || l.id === layer.chordLayerId),
	);
	const chord = bar ? chordAtBar(bar.chords, d.bar) : null;
	// コードが置かれていない区間は調の主音へ落とす（数字が消えるより読める）
	if (!chord) return MV_ROOT_TO_PITCH[layer.key] ?? 0;
	return MV_ROOT_TO_PITCH[chordRootName(chord.label)] ?? 0;
}

/** その小節で鳴っているコード。 */
function chordAtBar(chords: MvChordStep[], bar: number): MvChordStep | null {
	let found: MvChordStep | null = null;
	for (const c of chords) {
		if (c.bar <= bar && (!found || c.bar >= found.bar)) found = c;
	}
	return found;
}

// ───────────────── 動き ─────────────────

interface MotionResult {
	dx: number;
	dy: number;
	scale: number;
}

function applyMotion(
	d: DrawCtx,
	motion: MvMotion,
	amount: number,
	width: number,
): MotionResult {
	switch (motion) {
		case "bob":
			return { dx: 0, dy: Math.sin(d.timeSec * 1.6) * amount, scale: 1 };
		case "drift": {
			// 画面幅＋自分の幅を1周期として横へ流す（端で反対側から出てくる）
			const span = MV_W + width;
			const travel = (((d.timeSec * amount) % span) + span) % span;
			return {
				dx: travel - (MV_W + width) / 2,
				dy: Math.sin(d.timeSec * 0.7) * amount * 0.04,
				scale: 1,
			};
		}
		case "parallax":
			return { dx: Math.sin(d.bar * Math.PI) * amount, dy: 0, scale: 1 };
		case "zoom":
			return { dx: 0, dy: 0, scale: 1 + (d.timeSec / 60) * amount };
		case "beatScale":
			return { dx: 0, dy: 0, scale: 1 + amount * d.beatEnv };
		default:
			return { dx: 0, dy: 0, scale: 1 };
	}
}

// ───────────────── 登場演出 ─────────────────

interface EntranceResult {
	dx: number;
	dy: number;
	alpha: number;
}

interface LayerTransitionResult {
	dx: number;
	dy: number;
	scale: number;
	alpha: number;
	particle?: {
		type: "cover" | "reveal";
		progress: number;
	};
	afterimages?: Array<{ dx: number; dy: number; alpha: number }>;
	pixelateSize?: number;
	flashAlpha?: number;
	wipe?: {
		from: MvEnterFrom | MvExitTo;
		progress: number;
	};
}

function easeOutBack(x: number): number {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function easeInBack(x: number): number {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return c3 * x * x * x - c1 * x * x;
}

export function layerTransitionState(
	d: DrawCtx,
	layer: MvLayer,
): LayerTransitionResult {
	let dx = 0;
	let dy = 0;
	let scale = 1;
	let alpha = 1;
	let particle: LayerTransitionResult["particle"] = undefined;
	let afterimages: LayerTransitionResult["afterimages"] = undefined;
	let pixelateSize: number | undefined = undefined;
	let flashAlpha: number | undefined = undefined;
	let wipe: LayerTransitionResult["wipe"] = undefined;

	// 登場演出 (Entrance)
	if (layer.entrance && !isMvEntranceInert(layer.entrance)) {
		const startStep =
			layerAppearBar(layer, d.manifest.sections, d.sectionId) *
			MV_STEPS_PER_BAR;
		const durSteps = layer.entrance.beats * MV_STEPS_PER_BEAT;
		const age = d.step - startStep;
		if (age >= 0 && age < durSteps && durSteps > 0) {
			const t = clamp01(age / durSteps);
			const style: MvEntranceStyle =
				layer.entrance.style ??
				(layer.entrance.from !== "none"
					? "slide"
					: layer.entrance.fade
						? "fade"
						: "none");

			const eased = 1 - Math.pow(1 - t, 3);

			switch (style) {
				case "fade":
					if (layer.entrance.fade) alpha *= eased;
					break;
				case "slide": {
					const dist = mvEntranceDistance(layer.entrance) * (1 - eased);
					if (layer.entrance.from === "left") dx -= dist;
					else if (layer.entrance.from === "right") dx += dist;
					else if (layer.entrance.from === "top") dy -= dist;
					else if (layer.entrance.from === "bottom") dy += dist;
					if (layer.entrance.fade) alpha *= eased;
					break;
				}
				case "zoom":
					scale *= Math.max(0.01, eased);
					if (layer.entrance.fade) alpha *= eased;
					break;
				case "zoomBounce": {
					const p = easeOutBack(t);
					scale *= Math.max(0.01, p);
					if (layer.entrance.fade) alpha *= clamp01(t * 1.5);
					break;
				}
				case "particle":
					if (layer.entrance.fade) alpha *= eased;
					particle = { type: "cover", progress: t };
					break;
				case "afterimage":
					if (layer.entrance.fade) alpha *= eased;
					afterimages = [
						{ dx: (1 - eased) * -40, dy: 0, alpha: 0.35 * eased },
						{ dx: (1 - eased) * -80, dy: 0, alpha: 0.18 * eased },
					];
					break;
				case "pixelate":
					if (layer.entrance.fade) alpha *= eased;
					pixelateSize = Math.round(1 + (1 - t) * 15);
					break;
				case "flash":
					if (layer.entrance.fade) alpha *= eased;
					flashAlpha = clamp01((1 - t) * 1.5);
					break;
				case "wipe":
					wipe = {
						from: layer.entrance.from !== "none" ? layer.entrance.from : "left",
						progress: t,
					};
					break;
			}
		}
	}

	// 退場演出 (Exit)
	if (layer.exit && !isMvExitInert(layer.exit)) {
		const totalBars = d.song.totalBars || 64;
		const endBar = layerDisappearBar(
			layer,
			d.manifest.sections,
			d.sectionId,
			totalBars,
		);
		const endStep = endBar * MV_STEPS_PER_BAR;
		const durSteps = layer.exit.beats * MV_STEPS_PER_BEAT;
		const remainingSteps = endStep - d.step;

		if (remainingSteps >= 0 && remainingSteps < durSteps && durSteps > 0) {
			const t = clamp01(1 - remainingSteps / durSteps);
			const style: MvExitStyle =
				layer.exit.style ??
				(layer.exit.to !== "none"
					? "slide"
					: layer.exit.fade
						? "fade"
						: "none");

			const eased = Math.pow(t, 3);

			switch (style) {
				case "fade":
					if (layer.exit.fade) alpha *= 1 - eased;
					break;
				case "slide": {
					const dist = mvExitDistance(layer.exit) * eased;
					if (layer.exit.to === "left") dx -= dist;
					else if (layer.exit.to === "right") dx += dist;
					else if (layer.exit.to === "top") dy -= dist;
					else if (layer.exit.to === "bottom") dy += dist;
					if (layer.exit.fade) alpha *= 1 - eased;
					break;
				}
				case "zoom":
					scale *= Math.max(0.01, 1 - eased);
					if (layer.exit.fade) alpha *= 1 - eased;
					break;
				case "zoomBounce": {
					const p = easeInBack(t);
					scale *= Math.max(0.01, 1 - p);
					if (layer.exit.fade) alpha *= clamp01(1 - t);
					break;
				}
				case "particle":
					if (layer.exit.fade) alpha *= 1 - eased;
					particle = { type: "reveal", progress: t };
					break;
				case "afterimage":
					if (layer.exit.fade) alpha *= 1 - eased;
					afterimages = [
						{ dx: eased * 40, dy: 0, alpha: 0.35 * (1 - eased) },
						{ dx: eased * 80, dy: 0, alpha: 0.18 * (1 - eased) },
					];
					break;
				case "pixelate":
					if (layer.exit.fade) alpha *= 1 - eased;
					pixelateSize = Math.round(1 + t * 15);
					break;
				case "flash":
					if (layer.exit.fade) alpha *= 1 - eased;
					flashAlpha = clamp01(t * 1.5);
					break;
				case "wipe":
					wipe = {
						from: layer.exit.to !== "none" ? layer.exit.to : "right",
						progress: 1 - t,
					};
					break;
			}
		}
	}

	return {
		dx,
		dy,
		scale,
		alpha,
		particle,
		afterimages,
		pixelateSize,
		flashAlpha,
		wipe,
	};
}

function drawParticleOverlay(
	ctx: CanvasRenderingContext2D,
	type: "cover" | "reveal",
	progress: number,
) {
	const url = type === "cover" ? MV_PARTICLE_COVER_URL : MV_PARTICLE_REVEAL_URL;
	const totalFrames =
		type === "cover" ? MV_PARTICLE_COVER_FRAMES : MV_PARTICLE_REVEAL_FRAMES;
	const img = peekImage(url);
	if (!img || img.naturalWidth <= 0) return;
	const cellH = img.naturalHeight;
	const idx = Math.min(totalFrames - 1, Math.floor(progress * totalFrames));
	ctx.save();
	ctx.globalCompositeOperation = "lighter";
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(img, idx * cellH, 0, cellH, cellH, 0, 0, MV_W, MV_H);
	ctx.restore();
}

function drawLayerWithTransitions(d: DrawCtx, layer: MvLayer): void {
	const trans = layerTransitionState(d, layer);
	if (trans.alpha <= 0.002) return;

	const { ctx } = d;
	ctx.save();
	ctx.globalAlpha *= trans.alpha;

	if (trans.dx !== 0 || trans.dy !== 0 || trans.scale !== 1) {
		ctx.translate(MV_W / 2 + trans.dx, MV_H / 2 + trans.dy);
		ctx.scale(trans.scale, trans.scale);
		ctx.translate(-MV_W / 2, -MV_H / 2);
	}

	if (trans.wipe) {
		const p = trans.wipe.progress;
		ctx.beginPath();
		switch (trans.wipe.from) {
			case "left":
				ctx.rect(0, 0, MV_W * p, MV_H);
				break;
			case "right":
				ctx.rect(MV_W * (1 - p), 0, MV_W * p, MV_H);
				break;
			case "top":
				ctx.rect(0, 0, MV_W, MV_H * p);
				break;
			case "bottom":
				ctx.rect(0, MV_H * (1 - p), MV_W, MV_H * p);
				break;
			default:
				ctx.rect(0, 0, MV_W * p, MV_H);
				break;
		}
		ctx.clip();
	}

	if (trans.afterimages && trans.afterimages.length > 0) {
		for (const ghost of trans.afterimages) {
			ctx.save();
			ctx.globalAlpha *= ghost.alpha;
			ctx.translate(ghost.dx, ghost.dy);
			drawLayer(d, layer);
			ctx.restore();
		}
	}

	drawLayer(d, layer);

	if (trans.flashAlpha && trans.flashAlpha > 0.01) {
		ctx.save();
		ctx.globalCompositeOperation = "lighter";
		ctx.fillStyle = `rgba(255, 255, 255, ${trans.flashAlpha * 0.8})`;
		ctx.fillRect(0, 0, MV_W, MV_H);
		ctx.restore();
	}

	if (trans.particle) {
		drawParticleOverlay(ctx, trans.particle.type, trans.particle.progress);
	}

	ctx.restore();
}

const ENTRANCE_DONE: EntranceResult = { dx: 0, dy: 0, alpha: 1 };

function entranceState(
	d: DrawCtx,
	layer: MvLayer,
	entrance: MvEntrance | undefined,
): EntranceResult {
	if (isMvEntranceInert(entrance) || !entrance) return ENTRANCE_DONE;
	const trans = layerTransitionState(d, layer);
	return { dx: trans.dx, dy: trans.dy, alpha: trans.alpha };
}

function anchorOffset(
	anchor: MvAnchor,
	w: number,
	h: number,
): [number, number] {
	const map: Record<MvAnchor, [number, number]> = {
		topLeft: [0, 0],
		top: [-w / 2, 0],
		topRight: [-w, 0],
		left: [0, -h / 2],
		center: [-w / 2, -h / 2],
		right: [-w, -h / 2],
		bottomLeft: [0, -h],
		bottom: [-w / 2, -h],
		bottomRight: [-w, -h],
	};
	return map[anchor] ?? [0, 0];
}

// ───────────────── 画像レイヤー ─────────────────

function walkStandardFor(
	walk: NonNullable<MvImageLayer["walk"]>,
	w: number,
	h: number,
): WalkStandard {
	let std =
		walk.stdId === "auto" ? detectStandard(w, h) : standardById(walk.stdId);
	if (walk.stdId === "auto" && walk.frames && walk.frames > 0)
		std = { ...std, frames: walk.frames };
	return std;
}

/**
 * スプライト1コマの切り出し矩形。
 *
 * `row_anim` は「1行＝1つのアニメーション」のシート用で、向きの概念が無い。
 * 歩行グラ規格（行＝方向）と同じ経路に通すと `ways.length` ぶん行がずれて別のコマが出る。
 */
function spriteFrameRect(
	walk: NonNullable<MvImageLayer["walk"]>,
	crop: [number, number, number, number],
	timeSec: number,
	bpm: number,
	speedMultiplier: number,
): SpriteRect {
	const fps = spriteFps(walk, bpm, speedMultiplier);
	const safeCrop: [number, number, number, number] = [
		crop[0] || 0,
		crop[1] || 0,
		Math.max(1, crop[2] || 1),
		Math.max(1, crop[3] || 1),
	];
	if (walk.stdId === "row_anim") {
		return rowAnimCellInRect(safeCrop, {
			frames: Math.max(1, walk.frames ?? 4),
			row: walk.row ?? 0,
			playMode: walk.playMode ?? "loop",
			fps,
			timeSec,
		});
	}
	const std = walkStandardFor(walk, safeCrop[2], safeCrop[3]);
	return animatedCellInRect(std, safeCrop, {
		dir: walk.dir ?? "s",
		moving: true,
		timeSec,
		fps,
		row: walk.row,
	});
}

/**
 * コマ送りの速さ。`loopBeats` があれば曲のテンポから逆算する。
 * `walk.speed` が指定されていればレイヤーごとの倍率を適用する。
 */
function spriteFps(
	walk: NonNullable<MvImageLayer["walk"]>,
	bpm: number,
	speedMultiplier: number,
): number {
	const mult = walk.speed ?? speedMultiplier ?? 1;
	if (walk.loopBeats && walk.loopBeats > 0) {
		const frames = Math.max(1, walk.frames ?? 4);
		const secPerBeat = 60 / (bpm || 120);
		return (frames / (walk.loopBeats * secPerBeat)) * mult;
	}
	return (walk.fps ?? 6) * mult;
}

function drawImageLayer(d: DrawCtx, layer: MvImageLayer): void {
	const url = layerImageUrl(layer);
	if (!url) return;
	const img = peekImage(url);
	if (!img || img.naturalWidth === 0) return;

	const { ctx } = d;

	// 切り出し矩形（歩行グラならコマ送り、それ以外は画像全体）
	let src: SpriteRect = {
		sx: 0,
		sy: 0,
		sw: img.naturalWidth,
		sh: img.naturalHeight,
	};
	const walkSpeed = mvWalkSpeed(d.manifest);
	if (layer.walk) {
		const crop = layer.walk.crop ?? [0, 0, img.naturalWidth, img.naturalHeight];
		src = spriteFrameRect(layer.walk, crop, d.timeSec, d.song.bpm, walkSpeed);
	}

	const scale = layer.scale || 1;
	const motion = applyMotion(
		d,
		layer.motion,
		layer.motionAmount ?? 0,
		src.sw * scale,
	);
	const enter = entranceState(d, layer, layer.entrance);
	if (enter.alpha <= 0.004) return;
	const rep = layer.repeat;
	const copies = Math.max(1, Math.min(64, Math.round(rep?.count ?? 1)));
	const baseAlpha = ctx.globalAlpha;

	const prevSmoothing = ctx.imageSmoothingEnabled;
	if (layer.pixelated) ctx.imageSmoothingEnabled = false;

	for (let i = 0; i < copies; i++) {
		// 2体目以降は歩行アニメの位相をずらして、群れがそろって足踏みしないようにする
		let frameSrc = src;
		if (layer.walk && rep?.phase) {
			const crop = layer.walk.crop ?? [
				0,
				0,
				img.naturalWidth,
				img.naturalHeight,
			];
			frameSrc = spriteFrameRect(
				layer.walk,
				crop,
				d.timeSec + rep.phase * i,
				d.song.bpm,
				walkSpeed,
			);
		}

		const copyScale = scale + (rep?.scaleStep ?? 0) * i;
		if (copyScale <= 0) continue;
		const w = frameSrc.sw * copyScale * motion.scale;
		const h = frameSrc.sh * copyScale * motion.scale;
		const [ax, ay] = anchorOffset(layer.anchor, w, h);
		const x = layer.x + ax + motion.dx + enter.dx + (rep?.dx ?? 0) * i;
		const y = layer.y + ay + motion.dy + enter.dy + (rep?.dy ?? 0) * i;

		const alpha = (baseAlpha + (rep?.alphaStep ?? 0) * i) * enter.alpha;
		if (alpha <= 0.004) continue;
		ctx.globalAlpha = clamp01(alpha);

		if (layer.frame) {
			const p = layer.frame.padding;
			ctx.strokeStyle = layer.frame.color;
			ctx.lineWidth = layer.frame.width;
			ctx.strokeRect(
				Math.round(x - p) + 0.5,
				Math.round(y - p) + 0.5,
				Math.round(w + p * 2),
				Math.round(h + p * 2),
			);
		}

		if (layer.flipH || layer.flipV) {
			// 反転しても占める場所は変えたくないので、描画矩形の中心で鏡にする（枠は反転しない）
			ctx.save();
			ctx.translate(x + w / 2, y + h / 2);
			ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
			ctx.drawImage(
				img,
				frameSrc.sx,
				frameSrc.sy,
				frameSrc.sw,
				frameSrc.sh,
				-w / 2,
				-h / 2,
				w,
				h,
			);
			ctx.restore();
		} else {
			ctx.drawImage(
				img,
				frameSrc.sx,
				frameSrc.sy,
				frameSrc.sw,
				frameSrc.sh,
				x,
				y,
				w,
				h,
			);
		}
	}

	ctx.globalAlpha = baseAlpha;
	ctx.imageSmoothingEnabled = prevSmoothing;
}

// ───────────────── テキストレイヤー ─────────────────

export function getMvFontStack(manifest?: MvManifest): string {
	if (manifest?.stage?.fontFamily) return manifest.stage.fontFamily;
	if (typeof document !== "undefined") {
		const raw = getComputedStyle(document.documentElement)
			.getPropertyValue("--font-pixel")
			.trim();
		if (raw)
			return `${raw}, "DotGothic16", "美咲ゴシック", "Misaki Gothic", monospace, sans-serif`;
	}
	return '"DotGothic16", "美咲ゴシック", "Misaki Gothic", monospace, sans-serif';
}

function drawTextLayer(d: DrawCtx, layer: MvTextLayer): void {
	const { ctx } = d;
	const motion = applyMotion(
		d,
		layer.motion,
		layer.motionAmount ?? 0,
		layer.size,
	);
	const size = layer.size * motion.scale;
	ctx.font = `${layer.bold ? "bold " : ""}${size}px ${getMvFontStack(d.manifest)}`;
	ctx.fillStyle = layer.color;
	ctx.textBaseline = "top";

	if (layer.shadow) {
		ctx.shadowColor = "rgba(0,0,0,0.8)";
		ctx.shadowBlur = Math.max(2, size * 0.25);
	}

	const lines = layer.text.split("\n");
	if (layer.vertical) {
		lines.forEach((line, li) => {
			const h = line.length * size * 1.05;
			const [ax, ay] = anchorOffset(layer.anchor, size, h);
			const x = layer.x + ax + motion.dx - li * size * 1.6;
			let y = layer.y + ay + motion.dy;
			for (const ch of line) {
				ctx.fillText(ch, x, y);
				y += size * 1.05;
			}
		});
	} else {
		const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
		const h = lines.length * size * 1.25;
		const [ax, ay] = anchorOffset(layer.anchor, w, h);
		lines.forEach((line, li) => {
			ctx.fillText(
				line,
				layer.x + ax + motion.dx,
				layer.y + ay + motion.dy + li * size * 1.25,
			);
		});
	}
	ctx.shadowBlur = 0;
}

// ───────────────── 歌詞 ─────────────────

/**
 * 画面に出す歌詞行を決める。
 *
 * MML由来のときは trackId で1本に絞るのが既定。曲によっては歌詞トラックが複数あり、
 * 全部出すと画面が文字で埋まってしまうため（'all' を明示したときだけ全部出す）。
 */
export function resolveLyricLines(
	layer: MvLyricsLayer,
	song: MvSong,
): MvLyricLine[] {
	const lines = ((): MvLyricLine[] => {
		if (layer.source === "manual") {
			const manual = [...(layer.lines ?? [])].sort((a, b) => a.bar - b.bar);
			// 手入力に1行も無いのに曲へ歌詞が乗っているなら、曲の歌詞を出す。
			// レイヤーを足した時点の曲に歌詞トラックが無いと source は 'manual' で
			// 固定されるので、あとから歌詞つきの曲へ差し替えても永久に空のままだった。
			// 消える手入力は無い（0行なので）ため、拾うほうが常に正しい。
			if (manual.length > 0) return manual;
			return song.lyricLines;
		}
		if (layer.trackId === "all") return song.lyricLines;
		// 曲を差し替えると、前の曲のトラック番号が残って「どの行にも当たらない」状態になる。
		// 指定が今の曲に無いなら指定が古いということなので、先頭の歌詞トラックへ寄せる。
		const target =
			typeof layer.trackId === "number" &&
			song.lyricTrackIds.includes(layer.trackId)
				? layer.trackId
				: song.lyricTrackIds[0];
		if (target === undefined) return [];
		return song.lyricLines.filter((l) => l.trackId === target);
	})();
	return applyLyricResetBars(lines, layer.resetBars);
}

/**
 * `layer.resetBars` に挙げた小節「以降で最初に出る行」へ resetBefore を立てる。
 * MML由来の行は自動生成で1行ごとの編集ができないので、行を直接いじれない
 * source==='mml' でも積み上げのリセット位置を指定できるようにするための後付け。
 * 手入力の行が既に resetBefore=true を持っていればそのまま尊重する（上書きしない）。
 */
function applyLyricResetBars(
	lines: MvLyricLine[],
	resetBars: number[] | undefined,
): MvLyricLine[] {
	if (!resetBars || resetBars.length === 0) return lines;
	const marks = new Set<number>();
	for (const rb of resetBars) {
		const idx = lines.findIndex((l) => l.bar >= rb);
		if (idx >= 0) marks.add(idx);
	}
	if (marks.size === 0) return lines;
	return lines.map((l, i) => (marks.has(i) ? { ...l, resetBefore: true } : l));
}

function drawLyrics(d: DrawCtx, layer: MvLyricsLayer): void {
	const { ctx } = d;
	const lines = resolveLyricLines(layer, d.song);
	if (lines.length === 0) return;

	const hold = layer.holdBars ?? 2;

	// いま何行目まで来ているか（開始小節を過ぎた最後の行）
	let curIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].bar <= d.bar) curIdx = i;
		else break;
	}
	if (curIdx < 0) return;

	// `resetBefore` の行は「積み上げを全部消してからここで出し直す」区切り。
	// 4行なら4行まで積んだあと、次の区切りが来たらまとめて消えて1行目から始まる
	// ——という積み方をしたいので、直近の区切りから今の行までを1つのまとまりとして扱う。
	let groupStart = 0;
	for (let i = curIdx; i >= 0; i--) {
		if (lines[i].resetBefore) {
			groupStart = i;
			break;
		}
	}
	let groupEnd = lines.length;
	for (let i = curIdx + 1; i < lines.length; i++) {
		if (lines[i].resetBefore) {
			groupEnd = i;
			break;
		}
	}

	// まとまり全体が消えるタイミング＝次の区切りの開始小節（次が無ければ最後の行のhold明け）。
	const groupEndBar =
		groupEnd < lines.length
			? lines[groupEnd].bar
			: lines[groupEnd - 1].bar + hold;
	const groupFadeOut = clamp01((groupEndBar - d.bar) / 0.5);
	if (groupFadeOut <= 0.01) return;

	// 「同時に表示する行数」(afterimage+1) は積み上げの最大段数。まとまりがそれより長い
	// ときにスライドさせる（古い行を1つずつ追い出す）と行の位置が毎行ずれてしまうので、
	// 代わりにmaxLines行ごとにサイクルを区切り、区切りごとに位置をリセットして1行目から
	// 出し直す（1→2→3→4→リセット→1→2→3→4…）。
	const maxLines = layer.afterimage + 1;
	const cycleStart =
		groupStart + Math.floor((curIdx - groupStart) / maxLines) * maxLines;

	// サイクルの中で今出ている行ぜんぶ。最新を先頭に、古いほど後ろ（残像段数の深さに使う）。
	const activeIdx: number[] = [];
	for (let i = cycleStart; i <= curIdx; i++) activeIdx.push(i);
	if (activeIdx.length === 0) return;
	const shown = activeIdx.reverse();
	const size = layer.size;
	const stack = resolveLyricStack(layer);

	ctx.textBaseline = "middle";
	ctx.font = `bold ${size}px ${getMvFontStack(d.manifest)}`;

	shown.forEach((idx, depth) => {
		const line = lines[idx];
		const age = d.bar - line.bar;
		// 出だしは 1/8 小節でフェードイン。終わりぎわは行ごとではなく、
		// まとまり全体が次の区切りで一斉に消える(groupFadeOut)。
		const fadeIn = clamp01(age / 0.125);
		// 古い列は「読めないが確かにある」濃さで残す。1/depth だと3列目で消えてしまい、
		// 参考動画のように10列ぶん積み上がった壁にならないので、等比で緩やかに落とす。
		const depthFade = depth === 0 ? 1 : 0.42 * Math.pow(0.84, depth - 1);
		const alpha = fadeIn * groupFadeOut * depthFade;
		if (alpha <= 0.01) return;

		ctx.globalAlpha = alpha;
		ctx.fillStyle = layer.color;
		ctx.shadowColor = "rgba(0,0,0,0.85)";
		ctx.shadowBlur = size * 0.4;

		// このサイクルの何行目か（0＝1行目）。行が増えても depth と shown.length が
		// 一緒に増えるので、いちど置いた行はその場から動かない。
		const order = shown.length - 1 - depth;

		if (layer.vertical) {
			const textToDraw =
				layer.typing && depth === 0
					? line.text.slice(0, Math.floor(Math.max(0, age) / 0.04) + 1)
					: line.text;
			const h = textToDraw.length * size * 1.08;
			const [ax, ay] = anchorOffset(layer.anchor, size, h);
			const step = size * 1.7;
			// 1行目を開始位置(layer.x)に置き、2行目以降を指定の向きへ足していく。
			// 参考動画（次日朝夢 / x0o0x_ / _）はどれも左へ伸ばす積み方。
			// 画面の左寄りに置くなら 'right' にしないと画面外へ出ていく。
			const x = layer.x + ax + (stack === "left" ? -order : order) * step;
			let y = layer.y + ay;
			for (const ch of textToDraw) {
				ctx.fillText(ch, x, y);
				y += size * 1.08;
			}
		} else {
			const textToDraw =
				layer.typing && depth === 0
					? line.text.slice(0, Math.floor(Math.max(0, age) / 0.04) + 1)
					: line.text;
			const w = ctx.measureText(textToDraw).width;
			const [ax, ay] = anchorOffset(layer.anchor, w, size);
			const lineH = size * 1.35;
			const lx = layer.x + ax;
			// 横書きも同じ考え方。上へ積むと画面上端から出るので、
			// 上寄りに置くなら 'down' を選べるようにしてある。
			const ly = layer.y + ay + (stack === "up" ? -order : order) * lineH;
			drawLyricMarks(d, line, textToDraw, lx, ly, size, alpha);
			ctx.fillStyle = layer.color;
			ctx.fillText(textToDraw, lx, ly);
		}
	});

	ctx.globalAlpha = 1;
	ctx.shadowBlur = 0;
}

/**
 * 行の一部に敷く色つきの下地（マーカー）。
 * 参考動画（運び屋さん）は「つき」「かぜ」「はな」の**背後だけ**が塗られていて、
 * 文字そのものは白のまま。だから文字色を変えるのではなく矩形を先に塗る。
 */
function drawLyricMarks(
	d: DrawCtx,
	line: MvLyricLine,
	shownText: string,
	x: number,
	y: number,
	size: number,
	alpha: number,
): void {
	if (!line.marks || line.marks.length === 0) return;
	const { ctx } = d;
	const prevShadow = ctx.shadowBlur;
	ctx.shadowBlur = 0;
	const pad = size * 0.12;
	for (const m of line.marks) {
		const from = Math.max(0, Math.min(shownText.length, m.from));
		const to = Math.max(from, Math.min(shownText.length, m.to));
		if (to <= from) continue;
		const x0 = ctx.measureText(shownText.slice(0, from)).width;
		const x1 = ctx.measureText(shownText.slice(0, to)).width;
		ctx.globalAlpha = alpha;
		ctx.fillStyle = m.color;
		ctx.fillRect(x + x0 - pad, y - size * 0.62, x1 - x0 + pad * 2, size * 1.24);
	}
	ctx.shadowBlur = prevShadow;
}

// ───────────────── 図形レイヤー ─────────────────

function tracePolygon(
	ctx: CanvasRenderingContext2D,
	sides: number,
	radius: number,
): void {
	const n = Math.max(3, Math.round(sides));
	ctx.beginPath();
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2 - Math.PI / 2;
		const px = Math.cos(a) * radius;
		const py = Math.sin(a) * radius;
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
	ctx.closePath();
}

function traceForm(
	ctx: CanvasRenderingContext2D,
	layer: MvShapeLayer,
	radius: number,
	sides: number,
): void {
	switch (layer.form) {
		case "circle":
		case "ring":
			ctx.beginPath();
			ctx.arc(0, 0, Math.max(0.5, radius), 0, Math.PI * 2);
			break;
		case "square":
			ctx.beginPath();
			ctx.rect(-radius, -radius, radius * 2, radius * 2);
			break;
		case "diamond":
			tracePolygon(ctx, 4, radius);
			break;
		case "triangle":
			tracePolygon(ctx, 3, radius);
			break;
		case "polygon":
			tracePolygon(ctx, sides, radius);
			break;
		case "cross":
			ctx.beginPath();
			ctx.moveTo(-radius, 0);
			ctx.lineTo(radius, 0);
			ctx.moveTo(0, -radius);
			ctx.lineTo(0, radius);
			break;
		case "bar": {
			// size は半径なので幅は size*2。高さは barAspect（幅に対する比）で決める。
			const aspect = layer.barAspect ?? 0.32;
			const h = radius * 2 * aspect;
			ctx.beginPath();
			ctx.rect(-radius, -h / 2, radius * 2, h);
			break;
		}
	}
}

/** SVGパス文字列 → Path2D のキャッシュ。編集中は同じ文字列で毎フレーム呼ばれる。 */
const path2dCache = new Map<string, Path2D>();

function getPath2D(dstr: string): Path2D {
	let p = path2dCache.get(dstr);
	if (!p) {
		if (path2dCache.size > 64) path2dCache.clear();
		p = new Path2D(dstr);
		path2dCache.set(dstr, p);
	}
	return p;
}

/**
 * `iconCycle` の今フレームでのコマ番号。
 * `advance:"onset"` は指定トラックの発音回数ぶん進む。
 * `beats` は拍ロック(一定間隔)。`resetEveryBars` があれば、その小節数の境目で
 * 1コマ目(小節の頭)に戻り、残りの小節でコマ2以降を順にめぐる
 * （目視確認: 8小節ごとに単純な形へ戻り、残りの小節でループする構造だったため）。
 */
function iconCycleIndex(
	d: DrawCtx,
	cycle: NonNullable<MvShapeLayer["iconCycle"]>,
): number {
	const n = cycle.paths.length;
	if ("advance" in cycle) {
		const list = trackNotes(d.song, cycle.track);
		const idx = lastIndexAtOrBefore(list, d.step);
		return (((idx + 1) % n) + n) % n;
	}
	if (cycle.resetEveryBars) {
		const windowSteps = cycle.resetEveryBars * MV_STEPS_PER_BAR;
		const windowStart = Math.floor(d.step / windowSteps) * windowSteps;
		const localStep = d.step - windowStart;
		return Math.min(n - 1, Math.floor((localStep / windowSteps) * n));
	}
	return Math.min(
		n - 1,
		Math.floor(((d.step / (cycle.beats * MV_STEPS_PER_BEAT)) % 1) * n),
	);
}

function drawShapeLayer(d: DrawCtx, layer: MvShapeLayer): void {
	const { ctx } = d;
	// 動きはレイヤーの持ち物＝曲全体で1つ。場面ごとに差し替える仕組みは廃止した
	// （古い保存データの救済だけ resolveShapeModulators が面倒を見る）。
	const mods = resolveShapeModulators(layer);
	const stagger = layer.stagger ?? 0;

	// 個数だけは先に確定させる（1個ごとの遅延を掛ける前の値で数える）
	const count = Math.max(
		1,
		Math.min(64, Math.round(modulate(d, mods, "count", layer.count ?? 1))),
	);
	const baseAlpha = ctx.globalAlpha;

	ctx.save();
	ctx.globalCompositeOperation = MV_BLEND_COMPOSITE[layer.blend ?? "normal"];
	ctx.strokeStyle = layer.color;
	ctx.fillStyle = layer.color;

	const spread = layer.spread ?? 0;
	const spin = layer.spin ?? 0;
	const offsetX = layer.offsetX ?? 0;
	const offsetY = layer.offsetY ?? 0;

	for (let i = 0; i < count; i++) {
		// stagger>0 のとき、i個目は i*stagger ステップぶん過去の音で反応する
		const delay = stagger * i;
		const size = modulate(d, mods, "size", layer.size, delay);
		const rotation = modulate(d, mods, "rotation", layer.rotation, delay);
		const opacity = clamp01(modulate(d, mods, "opacity", 1, delay));
		const x = modulate(d, mods, "x", layer.x, delay);
		const y = modulate(d, mods, "y", layer.y, delay);
		const thickness = Math.max(
			0.2,
			modulate(d, mods, "thickness", layer.thickness, delay),
		);
		const sides = modulate(d, mods, "sides", layer.sides ?? 6, delay);

		// 連動を重ねすぎても画面を覆い尽くさないよう、描画半径は画面サイズの2倍で頭打ちにする
		const radius = Math.min(size + spread * i, MV_W * 2);
		if (radius <= 0.2 || opacity <= 0.004) continue;

		ctx.globalAlpha = baseAlpha * opacity;
		ctx.lineWidth = thickness;
		ctx.save();
		ctx.translate(x + offsetX * i, y + offsetY * i);
		ctx.rotate((rotation + spin * i) * DEG);
		const aspect = layer.aspect ?? 1;
		if (aspect !== 1) ctx.scale(1, aspect);
		const cyclePath = layer.iconCycle
			? layer.iconCycle.paths[iconCycleIndex(d, layer.iconCycle)]
			: undefined;
		const activePath = cyclePath ?? layer.path;
		if (layer.form === "path" && activePath) {
			// 設計座標系（pathBox）の中心を原点に、長辺が size×2 になるよう拡縮して描く
			const box = layer.pathBox ?? [0, 0, 100, 100];
			const bw = Math.max(1e-3, box[2]);
			const bh = Math.max(1e-3, box[3]);
			const s = (radius * 2) / Math.max(bw, bh);
			ctx.scale(s, s);
			ctx.translate(-(box[0] + bw / 2), -(box[1] + bh / 2));
			try {
				const p = getPath2D(activePath);
				// evenodd にしておくと、重なったサブパスが穴として抜ける（ドーナツ形などが作れる）
				if (layer.filled) ctx.fill(p, "evenodd");
				else {
					ctx.lineWidth = thickness / s;
					ctx.stroke(p);
				}
			} catch {
				// 入力途中の壊れたパスは黙って飛ばす
			}
		} else if (layer.form === "doubleFrame") {
			// 内外2本の正方形の枠が小節ごとに軽く息をする（0〜1周期でふわっと拡がって戻る）
			const barPhase = d.bar - Math.floor(d.bar);
			const breathe = 1 + 0.06 * Math.sin(barPhase * Math.PI);
			const outer = radius * breathe;
			const inner = outer * 0.8;
			ctx.beginPath();
			ctx.rect(-outer, -outer, outer * 2, outer * 2);
			ctx.stroke();
			ctx.beginPath();
			ctx.rect(-inner, -inner, inner * 2, inner * 2);
			ctx.stroke();
		} else if (layer.form === "ripple") {
			// 輪が小節の頭から外へ広がって消える。1小節でぴったりループする。
			const barPhase = d.bar - Math.floor(d.bar);
			const rippleAlpha = clamp01(1 - barPhase);
			if (rippleAlpha > 0.004) {
				ctx.globalAlpha = baseAlpha * opacity * rippleAlpha;
				ctx.beginPath();
				ctx.arc(0, 0, Math.max(0.5, radius * barPhase), 0, Math.PI * 2);
				ctx.stroke();
			}
		} else {
			traceForm(ctx, layer, radius, sides);
			// cross は線でしか成立しないので、塗り指定でも stroke する
			if (layer.filled && layer.form !== "cross" && layer.form !== "ring")
				ctx.fill();
			else ctx.stroke();
		}
		ctx.restore();
	}

	ctx.globalAlpha = baseAlpha;
	ctx.restore();
}

// ───────────────── ビジュアライザ ─────────────────

function trackColor(d: DrawCtx, track: number): string {
	const palette = d.stage.palette;
	if (palette.length === 0) return "#ffffff";
	const idx = d.song.tracks.indexOf(track);
	return palette[(idx >= 0 ? idx : track) % palette.length];
}

function notesForLayer(d: DrawCtx, layer: MvVisualizerLayer): MvNote[] {
	if (!layer.tracks || layer.tracks.length === 0) return d.song.notes;
	const set = new Set(layer.tracks);
	return d.song.notes.filter((n) => set.has(n.track));
}

function drawVisualizer(d: DrawCtx, layer: MvVisualizerLayer): void {
	switch (layer.style) {
		case "pianoRoll": {
			const projection = layer.projection ?? "flat";
			if (projection === "perspective") drawPianoRoll3D(d, layer);
			else if (projection === "circular") drawPianoRollCircular(d, layer);
			else drawPianoRoll(d, layer);
			break;
		}
		case "stepGrid":
			drawStepGrid(d, layer);
			break;
		case "rings":
			drawRings(d, layer);
			break;
		case "bars":
			drawBars(d, layer);
			break;
	}
}

/**
 * 平面のピアノロール。`flow` で2通り。
 *
 * - scroll : 再生位置を帯の左から25%に固定し、譜面が右から左へ流れる
 * - page   : 譜面は動かず、`amount` 小節ぶんを固定位置に並べる。小節窓が進むとページごと差し替わる
 *
 * ノートの見え方は `MvNoteLight`:
 *   まだ鳴っていない音は `dim` の薄さ → 音の頭で満点の白 → `echo` の輪郭が外へ広がって消える。
 * 「鳴っていない音も濃く塗る」と、どれが今の音なのか画から読めなくなる。
 */
function drawPianoRoll(d: DrawCtx, layer: MvVisualizerLayer): void {
	const { ctx, song } = d;
	const { x, y, w, h } = layer.rect;
	const light = layer.light ?? DEFAULT_MV_NOTE_LIGHT;
	const paged = (layer.flow ?? "scroll") === "page";
	const windowBars = Math.max(0.25, layer.amount ?? 4);
	const windowSteps = windowBars * MV_STEPS_PER_BAR;

	// page はいま居るページの頭を原点にする。scroll は再生位置基準で毎フレーム動く。
	const from = paged
		? Math.floor(d.step / windowSteps) * windowSteps
		: d.step - windowSteps * 0.25;
	const to = from + windowSteps;

	// 音域はレイヤー指定があればそれを使う。曲全体を1枚に収めるとノートが数pxに潰れるので、
	// 拡大したいレイヤーは狭い窓を持たせる。
	const pitchLo = layer.pitchRange ? layer.pitchRange[0] : song.pitchMin;
	const pitchHi = layer.pitchRange ? layer.pitchRange[1] : song.pitchMax;
	const pitchRange = Math.max(1, pitchHi - pitchLo);
	const noteH = Math.max(1.5, h / (pitchRange + 1));
	const notes = notesForLayer(d, layer);
	const echo = light.echo && light.echo.beats > 0 ? light.echo : null;
	const echoSteps = echo ? echo.beats * MV_STEPS_PER_BEAT : 0;
	// echo は音符の外へ echo.spread ぶん輪郭が広がる。クリップをノート矩形ぴったりにすると
	// 広がった分がまるごと切り取られて「枠の外に何も出ない」ことになる（zoomレイヤーで顕著）。
	const clipMargin = echo ? echo.spread : 0;

	ctx.save();
	ctx.beginPath();
	ctx.rect(
		x - clipMargin,
		y - clipMargin,
		w + clipMargin * 2,
		h + clipMargin * 2,
	);
	ctx.clip();

	const baseAlpha = ctx.globalAlpha;

	for (const n of notes) {
		const end = n.startStep + n.durationSteps;
		// page は「この小節窓に頭がある音」だけを載せる（またぐ音は切らずに窓の端で止める）
		if (
			paged
				? n.startStep < from || n.startStep >= to
				: end < from || n.startStep > to
		)
			continue;

		const nx = x + ((n.startStep - from) / windowSteps) * w;
		const nw = Math.max(
			2,
			((Math.min(end, to) - n.startStep) / windowSteps) * w,
		);
		// 窓の外の音は折り返さず、そのオクターブぶんだけ寄せて窓の中に入れる
		// （切り捨てると、狭い窓では画面がほとんど空になる）
		let pitch = n.pitch;
		while (pitch < pitchLo) pitch += 12;
		while (pitch > pitchHi) pitch -= 12;
		const ny = y + h - ((pitch - pitchLo) / pitchRange) * (h - noteH) - noteH;

		const sounding = n.startStep <= d.step && end > d.step;
		const color = trackColor(d, n.track);
		const level = noteLevel(d, n, light);

		if (level > 0.004) {
			ctx.globalAlpha = baseAlpha * level;
			ctx.fillStyle = color;
			if (sounding && layer.glow) {
				ctx.shadowColor = color;
				ctx.shadowBlur = 8;
			}
			ctx.fillRect(nx, ny, nw, noteH);
			ctx.shadowBlur = 0;
		}

		// ── 余韻。音の頭から外へ広がる輪郭が、中身が暗くなったあとも残って薄れる ──
		if (echo) {
			const age = d.step - n.startStep;
			if (age >= 0 && age < echoSteps) {
				const t = age / echoSteps;
				const grow = echo.spread * t;
				ctx.globalAlpha = baseAlpha * (1 - t);
				ctx.strokeStyle = color;
				ctx.lineWidth = echo.thickness;
				ctx.strokeRect(nx - grow, ny - grow, nw + grow * 2, noteH + grow * 2);
			}
		}
	}

	ctx.globalAlpha = baseAlpha;
	ctx.restore();
}

/**
 * ノート1つの濃さ 0..1。
 * まだ鳴っていない＝`dim` / 鳴っている＝1 / 鳴り終わった＝`fadeOut` なら消す、でなければ `dim`。
 */
function noteLevel(d: DrawCtx, n: MvNote, light: MvNoteLight): number {
	if (d.step < n.startStep) return light.dim;
	if (d.step < n.startStep + n.durationSteps) return 1;
	return light.fadeOut ? 0 : light.dim;
}

// ── 立体ピアノロール（MIDITrail 風） ─────────────────────

interface Vec3 {
	x: number;
	y: number;
	z: number;
}
interface Projected {
	x: number;
	y: number;
	z: number;
}

/**
 * ノート板を任意の視点から見た画面座標へ落とす。
 *
 * 世界座標の取り方（MIDITrail と同じ向き）:
 *   x = 時間（右が未来。再生に合わせて右から左へ流れる）
 *   y = 音の高さ（上が高音）
 *   z = トラックの奥行きレーン（正が奥）
 * 視点は原点から -z 側へ camDist だけ引いた位置に置き、yaw→pitch→(画面内)roll の順で回す。
 */
function project3d(
	p: Vec3,
	view: MvView,
	rect: MvRect,
	camDist: number,
): Projected | null {
	const ry = view.yaw * DEG;
	// 「正で上から見る」に合わせる。正の回転で奥(z+)が画面の上へ逃げる向き。
	const rx = -view.pitch * DEG;
	const rz = view.roll * DEG;

	// yaw（Y軸まわり）
	const x1 = p.x * Math.cos(ry) + p.z * Math.sin(ry);
	const z1 = -p.x * Math.sin(ry) + p.z * Math.cos(ry);
	// pitch（X軸まわり）
	const y2 = p.y * Math.cos(rx) - z1 * Math.sin(rx);
	const z2 = p.y * Math.sin(rx) + z1 * Math.cos(rx);

	const zc = z2 + camDist;
	if (zc <= 1) return null;

	const f = rect.h / 2 / Math.tan(Math.max(5, view.fov) * 0.5 * DEG);
	const sx = (f * x1) / zc;
	const sy = (-f * y2) / zc;

	// roll は画面内で回す
	const cx = sx * Math.cos(rz) - sy * Math.sin(rz);
	const cy = sx * Math.sin(rz) + sy * Math.cos(rz);

	return { x: rect.x + rect.w / 2 + cx, y: rect.y + rect.h / 2 + cy, z: zc };
}

/**
 * 立体ピアノロール（MIDITrail 準拠）。
 * x = 時間（右が未来、再生位置は左寄り25%に固定）、y = 音の高さ、z = トラックのレーン。
 * ノートは厚み（view.thickness）を持つ板として描き、鳴った瞬間に明るく光る。
 * 旧トンネル型（時間を奥行きに取る）はレーン概念が消えて画面の大半が空いてしまうので使わない。
 */
function drawPianoRoll3D(d: DrawCtx, layer: MvVisualizerLayer): void {
	const { ctx, song } = d;
	const rect = layer.rect;
	const view = { ...DEFAULT_MV_VIEW, ...(layer.view ?? {}) };
	const light = layer.light ?? DEFAULT_MV_NOTE_LIGHT_3D;
	const windowBars = layer.amount ?? 4;
	const windowSteps = windowBars * MV_STEPS_PER_BAR;

	// 論理x幅。rectより広めに取って、画面端までノートが流れ続けて見えるようにする
	const spanX = rect.w * 1.7;
	const playheadX = -spanX * 0.25; // 再生位置を左寄りに置く（未来が右に長く見える）
	const stepToX = (s: number) =>
		playheadX + ((s - d.step) / windowSteps) * spanX;
	const from = d.step - windowSteps * 0.35;
	const to = d.step + windowSteps * 0.85;

	const pitchRange = Math.max(1, song.pitchMax - song.pitchMin);
	const rollH = rect.h * 1.1;
	const noteH = Math.max(2.5, (rollH / (pitchRange + 1)) * 0.85);
	const pitchToY = (pitch: number) =>
		((pitch - song.pitchMin) / pitchRange - 0.5) * rollH;

	// トラック → 奥行きレーン。手前(負z)ほどパレット先頭のトラック
	const laneTracks =
		layer.tracks && layer.tracks.length > 0 ? layer.tracks : song.tracks;
	const laneCount = Math.max(1, laneTracks.length);
	const laneZ = (track: number) => {
		const idx = laneTracks.indexOf(track);
		if (idx < 0 || laneCount === 1) return 0;
		return (idx / (laneCount - 1) - 0.5) * view.depth;
	};
	const half = Math.max(0, view.thickness) / 2;

	const f = rect.h / 2 / Math.tan(Math.max(5, view.fov) * 0.5 * DEG);
	// 回転後もすべての頂点がカメラの前(zc>1)に残るよう、視距離は広めに取る
	const camDist =
		f * 1.15 +
		view.depth * 0.6 +
		spanX * 0.35 * Math.abs(Math.sin(view.yaw * DEG));

	const notes = notesForLayer(d, layer).filter((n) => {
		const end = n.startStep + n.durationSteps;
		return end >= from && n.startStep <= to;
	});

	// 画家のアルゴリズム: 奥のレーンから描く
	notes.sort(
		(a, b) => laneZ(b.track) - laneZ(a.track) || a.startStep - b.startStep,
	);

	ctx.save();
	ctx.beginPath();
	ctx.rect(rect.x, rect.y, rect.w, rect.h);
	ctx.clip();

	// 「いま」の判定ライン（音域の上下いっぱいの縦線）
	const nowT = project3d(
		{ x: playheadX, y: rollH * 0.52, z: 0 },
		view,
		rect,
		camDist,
	);
	const nowB = project3d(
		{ x: playheadX, y: -rollH * 0.52, z: 0 },
		view,
		rect,
		camDist,
	);
	if (nowT && nowB) {
		ctx.globalAlpha = 0.3;
		ctx.strokeStyle = "#ffffff";
		ctx.lineWidth = layer.thickness ?? 1.5;
		ctx.beginPath();
		ctx.moveTo(nowT.x, nowT.y);
		ctx.lineTo(nowB.x, nowB.y);
		ctx.stroke();
	}

	for (const n of notes) {
		const x0 = stepToX(Math.max(n.startStep, from));
		const x1 = stepToX(Math.min(n.startStep + n.durationSteps, to));
		if (x1 - x0 < 1) continue;
		const yC = pitchToY(n.pitch);
		const y0 = yC - noteH / 2;
		const y1 = yC + noteH / 2;
		const zC = laneZ(n.track);

		const sounding =
			n.startStep <= d.step && n.startStep + n.durationSteps > d.step;
		const color = trackColor(d, n.track);

		// 通り過ぎた音は左端に向かってフェードアウト
		let alpha = sounding ? 1 : light.dim;
		const endX = stepToX(n.startStep + n.durationSteps);
		if (!sounding && endX < playheadX) {
			alpha *= clamp01(1 - (playheadX - endX) / (spanX * 0.24));
		}
		if (alpha <= 0.02) continue;

		// 手前面（z-）の四隅
		const pTL = project3d({ x: x0, y: y1, z: zC - half }, view, rect, camDist);
		const pTR = project3d({ x: x1, y: y1, z: zC - half }, view, rect, camDist);
		const pBL = project3d({ x: x0, y: y0, z: zC - half }, view, rect, camDist);
		const pBR = project3d({ x: x1, y: y0, z: zC - half }, view, rect, camDist);
		if (!pTL || !pTR || !pBL || !pBR) continue;

		ctx.globalAlpha = alpha;

		// 厚みの見える上面。奥側の辺（z+）とつないだ平行四辺形で箱らしさを出す
		if (half > 0) {
			const qTL = project3d(
				{ x: x0, y: y1, z: zC + half },
				view,
				rect,
				camDist,
			);
			const qTR = project3d(
				{ x: x1, y: y1, z: zC + half },
				view,
				rect,
				camDist,
			);
			if (qTL && qTR) {
				ctx.fillStyle = shade(color, sounding ? 1.1 : 0.7);
				ctx.beginPath();
				ctx.moveTo(pTL.x, pTL.y);
				ctx.lineTo(pTR.x, pTR.y);
				ctx.lineTo(qTR.x, qTR.y);
				ctx.lineTo(qTL.x, qTL.y);
				ctx.closePath();
				ctx.fill();
			}
		}

		if (sounding && layer.glow) {
			ctx.shadowColor = color;
			ctx.shadowBlur = 12;
		}
		ctx.fillStyle = sounding ? shade(color, 1.45) : color;
		ctx.beginPath();
		ctx.moveTo(pTL.x, pTL.y);
		ctx.lineTo(pTR.x, pTR.y);
		ctx.lineTo(pBR.x, pBR.y);
		ctx.lineTo(pBL.x, pBL.y);
		ctx.closePath();
		ctx.fill();
		ctx.shadowBlur = 0;
	}

	ctx.globalAlpha = 1;
	ctx.restore();
}

/** 円形ピアノロール。音域を円周へ、時間を半径方向へ巻きつける。 */
function drawPianoRollCircular(d: DrawCtx, layer: MvVisualizerLayer): void {
	const { ctx, song } = d;
	const rect = layer.rect;
	const ring: MvRing = { ...DEFAULT_MV_RING, ...(layer.ring ?? {}) };
	const light = layer.light ?? DEFAULT_MV_NOTE_LIGHT_3D;
	const windowBars = layer.amount ?? 4;
	const windowSteps = windowBars * MV_STEPS_PER_BAR;
	const from = d.step;
	const to = d.step + windowSteps;

	const cx = rect.x + rect.w / 2;
	const cy = rect.y + rect.h / 2;
	const maxR = Math.min(rect.w, rect.h) / 2;
	const innerR = Math.min(ring.innerRadius, maxR - 4);
	const span = Math.max(4, maxR - innerR);

	const pitchRange = Math.max(1, song.pitchMax - song.pitchMin);
	const sweep = ring.sweep * DEG;
	const rot = ring.rotate * DEG;
	const laneAngle = sweep / (pitchRange + 1);

	const notes = notesForLayer(d, layer).filter((n) => {
		const end = n.startStep + n.durationSteps;
		return end >= from && n.startStep <= to;
	});

	ctx.save();
	for (const n of notes) {
		const a0 = rot + (n.pitch - song.pitchMin) * laneAngle;
		const a1 = a0 + laneAngle * 0.88;
		const r0 =
			innerR + ((Math.max(from, n.startStep) - d.step) / windowSteps) * span;
		const r1 =
			innerR +
			((Math.min(to, n.startStep + n.durationSteps) - d.step) / windowSteps) *
				span;
		if (r1 <= r0) continue;

		const sounding =
			n.startStep <= d.step && n.startStep + n.durationSteps > d.step;
		ctx.globalAlpha = sounding ? 1 : light.dim * 0.82;
		ctx.fillStyle = sounding
			? shade(trackColor(d, n.track), 1.3)
			: trackColor(d, n.track);
		if (sounding && layer.glow) {
			ctx.shadowColor = ctx.fillStyle;
			ctx.shadowBlur = 10;
		}

		ctx.beginPath();
		ctx.arc(cx, cy, r0, a0, a1);
		ctx.arc(cx, cy, r1, a1, a0, true);
		ctx.closePath();
		ctx.fill();
		ctx.shadowBlur = 0;
	}

	// 「いま」の円
	ctx.globalAlpha = 0.5;
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = layer.thickness ?? 1.2;
	ctx.beginPath();
	ctx.arc(cx, cy, innerR, rot, rot + sweep);
	ctx.stroke();

	ctx.globalAlpha = 1;
	ctx.restore();
}

/**
 * ステップシーケンサ格子。1小節を amount 分割し、トラックごとに1行のマスを並べる。
 * ノートの頭があるマスが点灯し、いま通過中の列は枠が光る。
 */
function drawStepGrid(d: DrawCtx, layer: MvVisualizerLayer): void {
	const { ctx, song } = d;
	const { x, y, w, h } = layer.rect;
	const cols = layer.amount ?? 16;
	const tracks =
		layer.tracks && layer.tracks.length > 0
			? layer.tracks
			: song.tracks.slice(0, 2);
	const rows = Math.max(1, tracks.length);
	const cellW = w / cols;
	const cellH = h / rows;
	const stepsPerCol = MV_STEPS_PER_BAR / cols;
	const barIndex = Math.floor(d.bar);
	const barStart = barIndex * MV_STEPS_PER_BAR;
	const currentCol = Math.floor((d.step - barStart) / stepsPerCol);
	const gap = layer.thickness ?? 1;

	for (let r = 0; r < rows; r++) {
		const track = tracks[r];
		const color = trackColor(d, track);
		const list = song.byTrack.get(track) ?? [];
		for (let c = 0; c < cols; c++) {
			const cx = x + c * cellW;
			const cy = y + r * cellH;
			const colStart = barStart + c * stepsPerCol;
			const idx = lastIndexAtOrBefore(list, colStart + stepsPerCol - 0.001);
			const hit = idx >= 0 && list[idx].startStep >= colStart;

			// 空きマスの罫線。二重線にして、参考動画の装飾枠つきタイルの気配を出す
			ctx.strokeStyle = "rgba(255,255,255,0.16)";
			ctx.lineWidth = 1;
			ctx.strokeRect(
				Math.round(cx) + 0.5,
				Math.round(cy) + 0.5,
				Math.round(cellW - gap),
				Math.round(cellH - gap),
			);
			const inner = Math.max(2, Math.min(cellW, cellH) * 0.1);
			ctx.strokeStyle = "rgba(255,255,255,0.08)";
			ctx.strokeRect(
				Math.round(cx + inner) + 0.5,
				Math.round(cy + inner) + 0.5,
				Math.round(cellW - gap - inner * 2),
				Math.round(cellH - gap - inner * 2),
			);

			if (hit) {
				const active = c === currentCol;
				// 参考動画は点灯マスがほぼ真っ白のまま並ぶ。通過中の列だけ満点にする
				ctx.globalAlpha = active ? 1 : 0.78;
				ctx.fillStyle = color;
				ctx.fillRect(cx + gap, cy + gap, cellW - gap * 2, cellH - gap * 2);
				// 点灯マスの中心に小さな抜き模様を入れ子で入れる（白い面が主役、模様は控えめ）
				ctx.globalAlpha = active ? 0.9 : 0.5;
				ctx.fillStyle = "rgba(0,0,0,0.7)";
				const inset = Math.min(cellW, cellH) * 0.32;
				ctx.fillRect(
					cx + inset,
					cy + inset,
					cellW - inset * 2,
					cellH - inset * 2,
				);
				ctx.fillStyle = color;
				const inset2 = Math.min(cellW, cellH) * 0.42;
				ctx.fillRect(
					cx + inset2,
					cy + inset2,
					cellW - inset2 * 2,
					cellH - inset2 * 2,
				);
				ctx.globalAlpha = 1;
			}
		}
	}

	// 現在の列
	if (currentCol >= 0 && currentCol < cols) {
		ctx.strokeStyle = "rgba(255,255,255,0.85)";
		ctx.lineWidth = 1.5;
		ctx.strokeRect(
			Math.round(x + currentCol * cellW) + 0.5,
			Math.round(y) + 0.5,
			Math.round(cellW),
			Math.round(h),
		);
	}
}

/** ノートの頭ごとに同心円を放出する。C.mp4 の波紋。 */
function drawRings(d: DrawCtx, layer: MvVisualizerLayer): void {
	const { ctx } = d;
	const { x, y, w, h } = layer.rect;
	const cx = x + w / 2;
	const cy = y + h / 2;
	const maxR = Math.max(w, h) * 0.7;
	const lifeSteps = MV_STEPS_PER_BAR * 2.0;
	const maxRings = layer.amount ?? 12;
	const notes = notesForLayer(d, layer);

	// 直近に鳴ったノートの波紋を描画
	const recent: MvNote[] = [];
	for (let i = notes.length - 1; i >= 0; i--) {
		const n = notes[i];
		if (n.startStep > d.step) continue;
		if (d.step - n.startStep > lifeSteps) break;
		recent.push(n);
		if (recent.length >= maxRings) break;
	}

	ctx.save();
	for (const n of recent) {
		const age = (d.step - n.startStep) / lifeSteps;
		// 初速が速く、だんだんゆっくり広がるイージング
		const r = maxR * (1 - Math.pow(1 - age, 3));
		const alpha = (1 - age) * (1 - age);
		if (r <= 2 || alpha <= 0.01) continue;

		const color = trackColor(d, n.track);
		ctx.strokeStyle = color;
		ctx.globalAlpha = alpha;
		ctx.lineWidth = (layer.thickness ?? 2) * (1 - age * 0.5);

		if (layer.glow) {
			ctx.shadowColor = color;
			ctx.shadowBlur = 15 * alpha;
		}

		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.stroke();
		ctx.shadowBlur = 0;
	}

	// 中心で拍に合わせて脈打つコア
	// 曲全体のエネルギー（beatEnv）で基本サイズが決まり、ノート発音の瞬間に強く光る
	let activeLevel = 0;
	for (const n of recent) {
		if (n.startStep <= d.step && n.startStep + n.durationSteps > d.step) {
			activeLevel = 1;
			break;
		}
	}

	const coreBase = 12 + 18 * d.beatEnv;
	const corePulse = coreBase + activeLevel * 8;

	ctx.globalAlpha = 1;
	ctx.fillStyle = "#ffffff";
	if (layer.glow) {
		ctx.shadowColor = "#ffffff";
		ctx.shadowBlur = 20 * d.beatEnv + activeLevel * 15;
	}
	ctx.beginPath();
	ctx.arc(cx, cy, corePulse, 0, Math.PI * 2);
	ctx.fill();

	ctx.restore();
}

/** 音域を amount 本の帯に割り、鳴っているノートの強さを高さにする。 */
function drawBars(d: DrawCtx, layer: MvVisualizerLayer): void {
	const { ctx, song } = d;
	const { x, y, w, h } = layer.rect;
	const count = layer.amount ?? 16;
	const notes = notesForLayer(d, layer);
	const levels = new Array<number>(count).fill(0);
	const range = Math.max(1, song.pitchMax - song.pitchMin);

	for (const n of notes) {
		if (n.startStep > d.step || n.startStep + n.durationSteps <= d.step)
			continue;
		const band = Math.min(
			count - 1,
			Math.max(0, Math.floor(((n.pitch - song.pitchMin) / range) * count)),
		);
		const decay = clamp01(
			1 - (d.step - n.startStep) / Math.max(1, n.durationSteps),
		);
		levels[band] = Math.max(
			levels[band],
			(n.velocity / 127) * (0.45 + 0.55 * decay),
		);
	}

	const barW = w / count;
	const gap = layer.thickness ?? 2;
	for (let i = 0; i < count; i++) {
		const level = levels[i];
		if (level <= 0.01) continue;
		const bh = h * level;
		ctx.fillStyle =
			d.stage.palette[i % Math.max(1, d.stage.palette.length)] ?? "#ffffff";
		ctx.fillRect(x + i * barW + gap / 2, y + h - bh, barW - gap, bh);
	}
}

// ───────────────── 色ユーティリティ ─────────────────

function parseHex(color: string): [number, number, number] | null {
	if (!color || !color.startsWith("#")) return null;
	const hex = color.slice(1);
	const full =
		hex.length === 3
			? hex
					.split("")
					.map((c) => c + c)
					.join("")
			: hex;
	if (full.length < 6) return null;
	const r = parseInt(full.slice(0, 2), 16);
	const g = parseInt(full.slice(2, 4), 16);
	const b = parseInt(full.slice(4, 6), 16);
	return isNaN(r) || isNaN(g) || isNaN(b) ? null : [r, g, b];
}

/** #rgb / #rrggbb / rgb() を alpha 付き rgba() へ。解釈できなければそのまま返す。 */
export function withAlpha(color: string, alpha: number): string {
	const a = clamp01(alpha);
	if (!color) return `rgba(255,255,255,${a})`;
	const rgb = parseHex(color);
	if (rgb) return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
	if (color.startsWith("rgb("))
		return color.replace("rgb(", "rgba(").replace(")", `,${a})`);
	return color;
}

/** 明度を factor 倍する（1未満で暗く、1超で明るく）。立体表示の陰影に使う。 */
export function shade(color: string, factor: number): string {
	const rgb = parseHex(color);
	if (!rgb) return color;
	const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
	return `rgb(${f(rgb[0])},${f(rgb[1])},${f(rgb[2])})`;
}
