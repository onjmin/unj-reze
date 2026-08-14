// MVの描画エンジン。DOM非依存（Canvas2Dコンテキストだけ受け取る）純粋な描画関数群。
//
// 時間の出どころは1つだけ: @onjmin/dtm の再生ステップ。拍位相・ビジュアライザ・歌詞・
// 図形モジュレータのすべてがノートデータから導出されるので、音とズレる余地が無い。
//
// 画像の読み込み・コマ送りは lib/walk-sprite.ts の基盤をそのまま使う（2Dゲームエンジン側と
// 実装を二重化しない）。

import { detectProgression } from "@onjmin/chord-parser";
import { imageRefToUrl, isPsdRef } from "./asset-ref";
import { resolveBlinkState } from "./mv-blink";
import { peekPsdImage, preloadPsdRef } from "./mv-psd";
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
	parseHighlightedText,
	sliceSegments,
	toVerticalFormChar,
	MV_BEATS_PER_BAR,
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
	type MvAssetRef,
	type MvBeatChordLabelLayer,
	type MvBeatCounterLayer,
	type MvBeatDigitLayer,
	type MvBeatPipsLayer,
	type MvCharacterLayer,
	type MvChordBarLayer,
	type MvChordStep,
	type MvDegreeLayer,
	type MvEffectCurve,
	type MvEffectLayer,
	type MvEffectStyle,
	type MvEnterFrom,
	type MvEntrance,
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
	type MvWidgetLayer,
	mvEntranceDistance,
	mvExitDistance,
	mvWalkSpeed,
	resolveEntranceStyle,
	resolveExitStyle,
	resolveLyricStack,
	resolveSceneStage,
	resolveShapeModulators,
	sectionAtBar,
} from "./mv-config";
import { estimateVowelAtProgress } from "./mv-vowel";
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
	/**
	 * MMLから `@onjmin/chord-parser` の `detectProgression` で自動検出したコード進行
	 * （bar昇順）。手入力・レイヤーごとの個別指定は無い——`parseMvSong` は mml文字列を
	 * キーにキャッシュされるので、MMLが変わらない限り再計算されない
	 * （MML編集時のみ計算し直し、それ以外はキャッシュを使う、という要求はここで満たす）。
	 */
	chords: MvChordStep[];
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
	chords: [],
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

		const bpm = parsed.bpm ?? 120;
		const chords = detectChordProgression(notes, bpm);

		song = {
			bpm,
			totalSteps,
			totalBars: Math.ceil(totalSteps / MV_STEPS_PER_BAR),
			notes,
			byTrack,
			tracks,
			pitchMin,
			pitchMax,
			lyricLines,
			lyricTrackIds,
			chords,
		};
	} catch (e) {
		console.error("[mv-engine] failed to parse mml", e);
	}

	songCache.set(key, song);
	return song;
}

/**
 * ノート列から `@onjmin/chord-parser` の `detectProgression` でコード進行を自動検出する。
 * 手入力欄は無い——`parseMvSong` の中でだけ呼ばれ、その結果は `songCache` に乗るので、
 * MMLが変わらない限り計算し直さない。
 */
function detectChordProgression(notes: MvNote[], bpm: number): MvChordStep[] {
	if (notes.length === 0) return [];
	try {
		const secPerBar = (4 * 60) / bpm;
		const timedNotes = notes.map((n) => ({
			pitch: n.pitch,
			when: (n.startStep / MV_STEPS_PER_BAR) * secPerBar,
			duration: (n.durationSteps / MV_STEPS_PER_BAR) * secPerBar,
		}));
		const analysis = detectProgression(timedNotes, { bpm });
		if (!analysis || analysis.chords.length === 0) return [];
		return analysis.chords
			.map((c) => ({
				bar: Math.round((c.when / secPerBar) * 100) / 100,
				label: c.symbol,
			}))
			.sort((a, b) => a.bar - b.bar);
	} catch (e) {
		console.error("[mv-engine] failed to detect chord progression", e);
		return [];
	}
}

/**
 * 間奏かどうかの判定に使う「行と行の間の空き」しきい値（小節）。`holdBars`（積み上げの
 * 表示保持時間）とは別物として固定値で持つ。同じ値を使い回すと、holdBars を長めに
 * 設定した曲では実際の間奏（数小節の空き）を検出できずに歌詞が消えず、逆に holdBars
 * を短くした曲では普通の息継ぎの間まで間奏扱いされてしまう——という事故が起きる。
 *
 * `lyricLinesFromTrack`（行の切り出し）と `applyLyricGapResets`（行間の間奏検出）の
 * 両方が同じ値を見る。切り出し側だけ別の基準にすると「行としては割れているのに
 * 間奏扱いされない/されすぎる」というズレが起きるので、必ず1箇所にまとめておくこと。
 *
 * 1.5小節にしていたところ、フレーズの合間の長めの息継ぎ・伸ばし音（実測でも2小節弱
 * 空くことがある）まで間奏として拾ってしまい、本物の間奏（8小節）の2行くらい手前で
 * 誤って歌詞が消えるバグが出た。息継ぎでは開かない・本物の間奏（数小節〜）は
 * 確実に拾える値として3小節へ引き上げてある。
 */
const INTERLUDE_GAP_BARS = 3;

/**
 * 歌詞トラックの音節列を「行」へまとめ、各行の開始小節を演奏ノートから求める。
 *
 * 音節と演奏ノートは同じトラックIDで1:1に対応する前提（@onjmin/dtm の歌唱合成と同じ割り当て）。
 * lineBreaks が無い＝1行で書かれた歌詞は、長いと画面に収まらないので一定文字数で折る。
 *
 * **明示的な改行が無くても、音符どうしの間が `INTERLUDE_GAP_BARS` より大きく空いたら
 * 強制的に行を割る。** これが無いと、間奏をまたいで書かれた歌詞（間奏の前後にわざわざ
 * 改行を入れていない、よくある書き方）が「間奏をまたいだ1本の長い行」になってしまい、
 * その1行の中では `bar`〜`endBar` が間奏の前後をまるごと覆ってしまう。行と行の間の
 * 空きを見て間奏を検出する `applyLyricGapResets` は行がそもそも2本に割れていないと
 * 判定のしようが無いので、間奏中も歌詞が表示され続けるバグになっていた
 * （ユーザー指摘: 8小節の間奏をまたいでも歌詞が消えなかった）。
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
	const gapSplitSteps = INTERLUDE_GAP_BARS * MV_STEPS_PER_BAR;

	const lines: MvLyricLine[] = [];
	let text = "";
	let startStep: number | null = null;
	let endStep: number | null = null;

	const flush = () => {
		if (text && startStep !== null)
			lines.push({
				bar: startStep / MV_STEPS_PER_BAR,
				endBar: (endStep ?? startStep) / MV_STEPS_PER_BAR,
				text,
				trackId,
			});
		text = "";
		startStep = null;
		endStep = null;
	};

	syllables.forEach((syl, i) => {
		const note = trackNotes[Math.min(i, trackNotes.length - 1)];
		const bigTimeGap =
			i > 0 && endStep !== null && note.startStep - endStep > gapSplitSteps;
		if (
			i > 0 &&
			(bigTimeGap || breaks.has(i) || (useSoftWrap && i % SOFT_WRAP === 0))
		)
			flush();
		if (startStep === null) startStep = note.startStep;
		endStep = note.startStep + note.durationSteps;
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
		if (layer.kind === "character") {
			push(assetRefUrl(layer.base));
			if (layer.eyes) {
				push(assetRefUrl(layer.eyes.open));
				push(assetRefUrl(layer.eyes.closed));
			}
			if (layer.mouth) {
				push(assetRefUrl(layer.mouth.closed));
				push(assetRefUrl(layer.mouth.open));
				for (const v of Object.values(layer.mouth.vowels ?? {})) {
					push(assetRefUrl(v));
				}
			}
		}
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

/** manifest が参照する psd: レイヤー参照(ref文字列そのもの)を列挙する。character レイヤーのみ。 */
export function collectMvPsdRefs(manifest: MvManifest): string[] {
	const refs: string[] = [];
	const push = (ref?: MvAssetRef) => {
		if (ref && isPsdRef(ref.ref)) refs.push(ref.ref);
	};
	for (const layer of manifest.layers) {
		if (layer.kind !== "character") continue;
		push(layer.base);
		if (layer.eyes) {
			push(layer.eyes.open);
			push(layer.eyes.closed);
		}
		if (layer.mouth) {
			push(layer.mouth.closed);
			push(layer.mouth.open);
			for (const v of Object.values(layer.mouth.vowels ?? {})) push(v);
		}
	}
	return [...new Set(refs)];
}

/** manifest の画像を全部読み込む。失敗した画像は無視して他を待つ。 */
export async function preloadMvImages(manifest: MvManifest): Promise<void> {
	await Promise.all([
		...collectMvImageUrls(manifest).map((u) => loadImage(u).catch(() => null)),
		...collectMvPsdRefs(manifest).map((ref) =>
			preloadPsdRef(ref).catch((err) => {
				console.warn("[mv] psdレイヤーの読み込みに失敗しました", ref, err);
			}),
		),
	]);
}

function layerImageUrl(layer: MvImageLayer): string | null {
	return layer.url ?? imageRefToUrl(layer.ref);
}

function assetRefUrl(ref: MvAssetRef | undefined): string | null {
	if (!ref) return null;
	return ref.url ?? imageRefToUrl(ref.ref);
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

/** `envelope` の内側で数回はねる減衰振動版。ボールが弾んで止まる質感を作る。 */
function bounceEnvelope(step: number, period: number, curve = 2): number {
	if (period <= 0) return 0;
	const phase = ((step % period) + period) % period;
	const t = phase / period;
	const decay = Math.pow(1 - t, curve);
	const bounces = 3;
	const osc = Math.abs(Math.cos(t * Math.PI * bounces));
	return clamp01(decay * osc);
}

/** `shape` に応じて `envelope`/`bounceEnvelope` を切り替える。 */
function shapedEnvelope(
	step: number,
	period: number,
	curve: number,
	shape: "decay" | "bounce" | undefined,
): number {
	return shape === "bounce"
		? bounceEnvelope(step, period, curve)
		: envelope(step, period, curve);
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
			// 裏拍などの位相ずらし。0かつ既定波形なら従来どおり d.beatEnv の速い経路を
			// そのまま使う（毎フレーム envelope() を呼び直さずに済む）。
			const offsetSteps = (m.phaseOffset ?? 0) * MV_STEPS_PER_BEAT;
			if (offsetSteps === 0 && m.shape === undefined) {
				if (m.periodBeats === undefined || m.periodBeats === 1) {
					return m.curve === undefined
						? d.beatEnv
						: envelope(d.step, beatPeriod, m.curve);
				}
				return envelope(d.step, beatPeriod, m.curve ?? 2);
			}
			return shapedEnvelope(d.step - offsetSteps, beatPeriod, m.curve ?? 2, m.shape);
		}
		case "bar":
			return m.curve === undefined && m.shape === undefined
				? d.barEnv
				: shapedEnvelope(d.step, MV_STEPS_PER_BAR, m.curve ?? 2, m.shape);
		case "phrase": {
			// フレーズ(既定8小節)の頭で1、終わりへ向かってなめらかに0へ。
			// op:"sub" で使うと逆向き＝終わりに向かって育つカーブになる。
			//
			// 下限は「0除算を避けるため」だけの意味で、以前は 1（小節）だった。
			// これは「フレーズ＝数小節単位の演出」という元々の用途を前提にした値で、
			// 特殊アレンジの一発フェード（`bars` に区間幅の数%＝1小節よりずっと短い
			// 値を渡す）を後から作った際、この下限のせいで**指定した短い周期が常に
			// 1小節へ強制的に伸ばされ、区間の中では位相がほとんど進まないまま
			// （＝値がほぼ固定されたまま）になっていた**——「フェードを足したのに
			// 繋ぎ目が滑らかにならない」の実体はここ（ユーザー指摘で特定）。
			// 0除算さえ避ければよいので、下限を実用上ゼロに近い値まで下げる。
			const period = Math.max(0.01, m.bars ?? 8) * MV_STEPS_PER_BAR;
			// beat と同じ考え方の位相ずらし。ただし単位は「小節」
			// （`bars` と同じ単位に揃えてある）。特殊アレンジの割り込み小節のような
			// 曲頭からの絶対位置に山（またはその頂点）を正確に合わせたいときに使う。
			const offsetSteps = (m.phaseOffset ?? 0) * MV_STEPS_PER_BAR;
			const stepAdj = d.step - offsetSteps;
			const curve = m.curve ?? 2;
			if (!m.symmetric) return shapedEnvelope(stepAdj, period, curve, m.shape);
			// symmetric: いちばん近い境目からの距離で山を作る（境目=1、中央=0）。
			// 減衰のみだと境目の手前で0のままになり、実測にある「境目へ向かう
			// 立ち上がり」が出せずカクッと不連続になる。
			const phase = ((stepAdj % period) + period) % period;
			const dist = Math.min(phase, period - phase) / (period / 2);
			const hump = Math.pow(1 - dist, curve);
			if (m.shape !== "bounce") return clamp01(hump);
			// bounce: 山の中に数回はねる振動を重ねる。境目・中央はどちらも寄与ゼロの
			// ままなので単発の山という性質は保ったまま、途中の質感だけ弾む。
			const osc = Math.abs(Math.cos(dist * Math.PI * 3));
			return clamp01(hump * osc);
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
		isLayerVisible(l, d.sectionId, d.bar, manifest.groups),
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

/**
 * レイヤーの画面上の「担当領域」矩形。ガイド枠の描画と、キャンバスクリックでの
 * レイヤー選択（当たり判定）の両方がこれを共有する——別々に計算式を持つと、
 * 枠は出るのにクリックでは拾えない（またはその逆）というズレが起きる。
 */
export function layerHitRect(
	layer: MvLayer,
): { x: number; y: number; w: number; h: number } {
	if (layer.kind === "visualizer") {
		return { x: layer.rect.x, y: layer.rect.y, w: layer.rect.w, h: layer.rect.h };
	}
	if (layer.kind === "image" || layer.kind === "character") {
		const s = (layer.scale ?? 1) * 80;
		return { x: layer.x - s / 2, y: layer.y - s / 2, w: s, h: s };
	}
	if (layer.kind === "text" || layer.kind === "lyrics") {
		const sz = layer.size ?? 16;
		return { x: layer.x - 10, y: layer.y - sz / 2 - 4, w: 160, h: sz + 12 };
	}
	if (layer.kind === "shape") {
		// layer.size は倍率ではなく実ピクセルサイズ（addShapeLayer等の初期値48がそのまま描画に使われる）。
		// ここを倍率式にすると、size=48だけで2880pxの箱になり、640x360キャンバスの外に
		// 四辺とも出てしまってガイドが一切見えなくなる（グループ化対象は大半がshapeなので
		// 「グループ内のレイヤーだけガイドが出ない」ように見えていた）。
		const sz = layer.size ?? 60;
		return { x: layer.x - sz / 2, y: layer.y - sz / 2, w: sz, h: sz };
	}
	return { x: 10, y: 10, w: MV_W - 20, h: MV_H - 20 };
}

/**
 * 論理座標(x, y)をクリック/タップしたときに選ぶべきレイヤーを返す。
 * z が大きい（手前）ものを優先し、同じzなら配列の後ろ（=描画が後＝手前）を優先する。
 * エフェクトレイヤーは画面上の矩形を持たないので対象外。
 */
export function findLayerAtPoint(
	manifest: MvManifest,
	x: number,
	y: number,
): MvLayer | null {
	const candidates = manifest.layers
		.map((l, idx) => ({ l, idx }))
		.filter(({ l }) => l.kind !== "effect")
		.sort(
			(a, b) =>
				(a.l.z ?? a.idx * 10) - (b.l.z ?? b.idx * 10) || a.idx - b.idx,
		);
	for (let i = candidates.length - 1; i >= 0; i--) {
		const { l } = candidates[i];
		const r = layerHitRect(l);
		if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return l;
	}
	return null;
}

function drawLayerHighlight(
	ctx: CanvasRenderingContext2D,
	layer: MvLayer,
	color: string,
	label: string,
): void {
	const { x, y, w, h } = layerHitRect(layer);

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
				ctx.fillStyle = fx.color || "#ffffff";
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
				ctx.fillStyle = withAlpha(fx.color || "#ffffff", env);
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
					ctx.fillStyle = withAlpha(fx.color || "#ffffff", env * 0.8);
					ctx.fillRect(0, 0, MV_W, MV_H);
				}
				break;
			}
			case "tint": {
				// 'color' 合成は「元の明るさを保ったまま色味だけ差し替える」。
				// 単色で塗りつぶすと絵が潰れるので、夕焼けへの切り替えはこちらで作る。
				ctx.globalCompositeOperation = "color";
				ctx.globalAlpha = env;
				ctx.fillStyle = fx.color || "#f7b82c";
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
				g.addColorStop(0, withAlpha(fx.color || "#000000", 0));
				g.addColorStop(1, withAlpha(fx.color || "#000000", env));
				ctx.fillStyle = g;
				ctx.fillRect(0, 0, MV_W, MV_H);
				break;
			}
			case "scanlines": {
				// 2pxおきに1px落とす。ブラウン管は「線が見える」ことが本体なので、
				// 間隔は強さで変えず固定にして、濃さだけを env に任せる。
				ctx.fillStyle = withAlpha(fx.color || "#000000", env * 0.55);
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
				ctx.fillStyle = fx.color || "#000000";
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
			// 光は一瞬で落ちるほうが「切り替わった」に見える。
			// 不透明度1.0まで振り切ると眩しすぎるので、既定の強さは0.3止まりにする。
			ctx.fillStyle = withAlpha(t.color || "#ffffff", rest * rest * 0.3);
			ctx.fillRect(0, 0, MV_W, MV_H);
			break;
		case "wipeLeft":
			ctx.fillStyle = t.color || "#000000";
			ctx.fillRect(0, 0, MV_W * rest, MV_H);
			break;
		case "wipeRight":
			ctx.fillStyle = t.color || "#000000";
			ctx.fillRect(MV_W * (1 - rest), 0, MV_W * rest, MV_H);
			break;
		case "wipeUp":
			ctx.fillStyle = t.color || "#000000";
			ctx.fillRect(0, 0, MV_W, MV_H * rest);
			break;
		case "wipeDown":
			ctx.fillStyle = t.color || "#000000";
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
			ctx.fillStyle = withAlpha(t.color || "#000000", Math.pow(rest, 1.6));
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
		case "character":
			drawCharacterLayer(d, layer);
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
		case "widget":
			drawWidget(d, layer);
			break;
		case "beatCounter":
			drawBeatCounter(d, layer);
			break;
		case "beatPips":
			drawBeatPips(d, layer);
			break;
		case "beatDigit":
			drawBeatDigit(d, layer);
			break;
		case "beatChordLabel":
			drawBeatChordLabel(d, layer);
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
	const chords = d.song.chords;
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

// ───────────────── ウィジェット（アイコングリッド） ─────────────────

/**
 * 拍番号で順送りする固定グリフ語彙。参考動画（`_.mp4`）を見ると「枠→横線束→的→格子…」と
 * 完成形が丸ごと切り替わるだけで、`mv-shape-group-macro.ts` のような核＋装飾の合成は無い。
 */
const MV_WIDGET_GLYPHS = [
	"square",
	"hbars",
	"target",
	"grid",
	"filled",
	"underline",
] as const;
type MvWidgetGlyph = (typeof MV_WIDGET_GLYPHS)[number];

function drawWidgetGlyph(
	ctx: CanvasRenderingContext2D,
	glyph: MvWidgetGlyph,
	x: number,
	y: number,
	size: number,
	color: string,
): void {
	const p = size * 0.14;
	const x0 = x + p;
	const y0 = y + p;
	const x1 = x + size - p;
	const y1 = y + size - p;
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	ctx.lineWidth = Math.max(1, size * 0.08);
	switch (glyph) {
		case "square":
			ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
			break;
		case "hbars": {
			const rows = 3;
			const gap = (y1 - y0) / rows;
			for (let i = 0; i < rows; i++) {
				const by = y0 + gap * i + gap * 0.2;
				ctx.fillRect(x0, by, x1 - x0, gap * 0.6);
			}
			break;
		}
		case "target": {
			const cx = x + size / 2;
			const cy = y + size / 2;
			ctx.beginPath();
			ctx.arc(cx, cy, (x1 - x0) / 2, 0, Math.PI * 2);
			ctx.stroke();
			ctx.fillRect(cx - size * 0.08, cy - size * 0.08, size * 0.16, size * 0.16);
			break;
		}
		case "grid": {
			const midX = x + size / 2;
			const midY = y + size / 2;
			ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
			ctx.beginPath();
			ctx.moveTo(midX, y0);
			ctx.lineTo(midX, y1);
			ctx.moveTo(x0, midY);
			ctx.lineTo(x1, midY);
			ctx.stroke();
			break;
		}
		case "filled":
			ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
			break;
		case "underline":
			ctx.fillRect(x0, y1 - size * 0.12, x1 - x0, size * 0.12);
			break;
	}
}

/**
 * 確定後のグリフが辿る順番。参考動画をコマ送りすると、上段の「もう確定したセル」は
 * 必ずこの4つを先頭から繰り返す（アンカーの`filled`を除くと、2枚目=hbars、3枚目=target、
 * 4枚目=grid、5枚目=filled…と周期4で一致し、下段の並びとも同じ周期）。
 */
const MV_WIDGET_GLYPH_CYCLE: MvWidgetGlyph[] = ["hbars", "target", "grid", "filled"];

/** 確定するまでの「高速でグリフが入れ替わる」演出が読む語彙（全部）。 */
const MV_WIDGET_SCRAMBLE_POOL = MV_WIDGET_GLYPHS;

/** インデックスから確定グリフを返す（セル0は常にアンカーの `filled`、以降は周期4）。 */
function widgetSettledGlyph(i: number): MvWidgetGlyph {
	return i === 0 ? "filled" : MV_WIDGET_GLYPH_CYCLE[(i - 1) % MV_WIDGET_GLYPH_CYCLE.length];
}

/**
 * 拍ごとにセルが1つずつ埋まっていくウィジェット（参考動画: `_.mp4` / `次日朝夢(再現).mp4`
 * をコマ送りして解析）。模倣元はドラムのヒット駆動だが、MMLにドラムの概念が無いため
 * 「1拍1ヒット」の骨格を保ったまま、ヒットの色をコード進行に置き換えている。
 *
 * - 現在の段: セル0は窓の先頭で即座に確定するアンカー。以降は窓（`cols`拍）の
 *   何拍目かで1拍に1個ずつ埋まり、埋まる瞬間はグリフが高速スクランブルしてから
 *   周期4パターンへ確定する。中立色（`layer.color`）。
 * - 履歴の段: 1つ前の窓がそのまま来る。各セルは「そのセルが表していた拍」に
 *   鳴っていたコードの色（`chordBar` と同じ決定ロジック）で塗る。
 * - 窓の境界では**枠は動かさず中身だけ**を1セルぶん奥へスライドさせて現在の段→
 *   履歴の段へ渡す（伸縮は使わない）。同時に一瞬フラッシュする。
 */
function drawWidget(d: DrawCtx, layer: MvWidgetLayer): void {
	const { ctx } = d;
	const { x, y } = layer.rect;
	const cell = layer.cellSize;
	const cols = Math.max(1, layer.cols);
	const beatsPerBar = MV_BEATS_PER_BAR;
	const orientation = layer.orientation ?? "horizontal";

	const beatPos = d.bar * beatsPerBar;
	const totalBeat = Math.floor(beatPos);
	const beatPhase = beatPos - totalBeat;
	const windowIndex = Math.floor(totalBeat / cols);
	const cyclePos = totalBeat - windowIndex * cols; // 0..cols-1、現在の窓での確定済みセル数-1

	const SCRAMBLE_SETTLE = 0.6; // このフェーズまではグリフが高速で入れ替わる
	const SCRAMBLE_RATE = 16; // 1拍あたりのグリフ切り替え回数

	// ── 窓の境界（`cols`拍ごと）をまたぐ一瞬だけ、枠は動かさず中身だけスライドさせる ──
	const SLIDE_HALF_WIDTH = 0.15; // 拍単位。境界の前後この幅だけ動く
	const boundaryBeat = windowIndex * cols; // 直前に越えた境界（＝現在の窓の開始）
	const distToStart = beatPos - boundaryBeat; // 0以上。窓の開始からの経過
	const inSlide = boundaryBeat > 0 && distToStart < SLIDE_HALF_WIDTH;
	const slideT = inSlide ? 1 - distToStart / SLIDE_HALF_WIDTH : 0; // 1→0、境界直後がピーク

	// 現在の段(row0)→履歴の段(row1)への「1セルぶん奥」の向き。横置きなら下、縦置きなら右。
	const rowStepX = orientation === "vertical" ? cell : 0;
	const rowStepY = orientation === "horizontal" ? cell : 0;
	/** セル(i,row) の左上座標（回転前のローカル座標。枠はここに固定で描く）。 */
	const cellPos = (i: number, row: 0 | 1): [number, number] => {
		if (orientation === "vertical") return [x + row * cell, y + i * cell];
		return [x + i * cell, y + row * cell];
	};
	const blockW = orientation === "vertical" ? cell * 2 : cell * cols;
	const blockH = orientation === "vertical" ? cell * cols : cell * 2;

	ctx.save();
	const angle = ((layer.angle ?? 0) * Math.PI) / 180;
	if (angle !== 0) {
		const centerX = x + blockW / 2;
		const centerY = y + blockH / 2;
		ctx.translate(centerX, centerY);
		ctx.rotate(angle);
		ctx.translate(-centerX, -centerY);
	}

	let lastHistoryColor: string | undefined;

	for (let i = 0; i < cols; i++) {
		// ── 枠は常に固定位置で描く（伸縮させない） ──
		for (const row of [0, 1] as const) {
			const [cx, cyy] = cellPos(i, row);
			ctx.strokeStyle = "rgba(255,255,255,0.15)";
			ctx.lineWidth = 1;
			ctx.strokeRect(cx + 0.5, cyy + 0.5, cell - 1, cell - 1);
		}

		// ── 履歴の段（1つ前の窓）の色。そのセルが表していた拍のコードで決める ──
		const historyBeat = boundaryBeat - cols + i;
		const historyBar = historyBeat / beatsPerBar;
		const historyChord = historyBeat >= 0 ? chordAtBar(d.song.chords, historyBar) : null;
		let historyColor: string;
		if (layer.colorMode === "fixed" || !historyChord) {
			historyColor = layer.bottomColor;
		} else {
			historyColor = getChordThemeColor(
				historyChord.label,
				layer.key,
				layer.colorMode,
				lastHistoryColor,
			);
			lastHistoryColor = historyColor;
		}

		// ── 現在の段のグリフ（まだ窓に到達していなければ何も描かない） ──
		let curGlyph: MvWidgetGlyph | null = null;
		if (i <= cyclePos) {
			if (i === 0 || i < cyclePos) {
				curGlyph = widgetSettledGlyph(i);
			} else if (beatPhase < SCRAMBLE_SETTLE) {
				const idx = Math.floor(beatPhase * SCRAMBLE_RATE) % MV_WIDGET_SCRAMBLE_POOL.length;
				curGlyph = MV_WIDGET_SCRAMBLE_POOL[idx];
			} else {
				curGlyph = widgetSettledGlyph(i);
			}
		}

		const [curX, curY] = cellPos(i, 0);
		const [histX, histY] = cellPos(i, 1);
		const hadPrevWindow = boundaryBeat - cols + i >= 0;

		if (!inSlide || !hadPrevWindow) {
			if (curGlyph) drawWidgetGlyph(ctx, curGlyph, curX, curY, cell, layer.color);
			if (hadPrevWindow) {
				drawWidgetGlyph(ctx, widgetSettledGlyph(i), histX, histY, cell, historyColor);
			}
		} else {
			// 直前の窓で確定していたグリフが、現在の段の位置から履歴の段の位置へ
			// 「枠は動かさず中身だけ」1セルぶんスライドする。中立色→コード色へ切り替わる。
			const progress = 1 - slideT; // 0(境界直後、現在の段の位置)→1(履歴の段へ到着)
			const px = curX + rowStepX * progress;
			const py = curY + rowStepY * progress;
			const movingColor = progress < 0.5 ? layer.color : historyColor;

			ctx.save();
			ctx.beginPath();
			ctx.rect(
				Math.min(curX, histX),
				Math.min(curY, histY),
				cell + Math.abs(histX - curX),
				cell + Math.abs(histY - curY),
			);
			ctx.clip();
			drawWidgetGlyph(ctx, widgetSettledGlyph(i), px, py, cell, movingColor);
			ctx.restore();

			// セル0は窓の先頭で即座に確定するアンカー。スライド中も新しい窓の分を
			// 現在の段の定位置に別途出す（スライドしているのは「直前の窓」の残像）。
			if (curGlyph && i === 0) {
				drawWidgetGlyph(ctx, curGlyph, curX, curY, cell, layer.color);
			}
		}
	}

	// 境界の一瞬だけ全面を光らせる（フラッシュは形を伸縮させない、色の演出だけ）
	if (inSlide) {
		ctx.fillStyle = withAlpha(layer.flashColor, slideT * 0.6);
		ctx.fillRect(x, y, blockW, blockH);
	}

	ctx.restore();
}

// ───────────────── ドット絵数字カウンタ ─────────────────

/** 3x5ドットの数字フォント（0-9）。1=点灯 / 0=消灯、上から1行ずつ。 */
const MV_DOT_DIGITS: Record<string, number[]> = {
	"0": [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
	"1": [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
	"2": [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
	"3": [1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
	"4": [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
	"5": [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
	"6": [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
	"7": [1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
	"8": [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
	"9": [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
	// 変化記号。数字ではないが3x5ドットの語彙に混ぜて度数表記(♭7 / ♯11 等)をそのまま出す。
	"♭": [1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0],
	"♯": [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1],
};

/** 3x5ドットの数字を、`cell`ドットぶんの正方形を並べて描く。原点(x,y)は左上。 */
function drawDotDigit(
	ctx: CanvasRenderingContext2D,
	digit: string,
	x: number,
	y: number,
	cell: number,
	color: string,
): void {
	const bits = MV_DOT_DIGITS[digit];
	if (!bits) return;
	ctx.fillStyle = color;
	for (let row = 0; row < 5; row++) {
		for (let col = 0; col < 3; col++) {
			if (bits[row * 3 + col]) {
				ctx.fillRect(x + col * cell, y + row * cell, cell, cell);
			}
		}
	}
}

/**
 * 拍ごとに 1→2→3→…→beatsPerCycle→1→… と刻むだけの、コード進行と無関係な単純なカウンタ。
 */
function drawBeatCounter(d: DrawCtx, layer: MvBeatCounterLayer): void {
	const { ctx } = d;
	const cycle = Math.max(1, Math.round(layer.beatsPerCycle));
	const currentBeat = Math.floor(d.bar * MV_BEATS_PER_BAR);
	const n = (((currentBeat % cycle) + cycle) % cycle) + 1;
	const label = String(n);
	const cell = layer.cellSize;
	const w = label.length * 3 * cell + (label.length - 1) * cell;
	const h = 5 * cell;
	const [ax, ay] = anchorOffset(layer.anchor, w, h);
	const originX = layer.x + ax;
	const originY = layer.y + ay;
	const color = layer.activeColor ?? layer.color;
	let cx = originX;
	for (const ch of label) {
		drawDotDigit(ctx, ch, cx, originY, cell, color);
		cx += 4 * cell;
	}
}

// ───────────────── 拍ごとに増える図形 ─────────────────

/**
 * 拍が進むごとに図形が1個ずつ増えていき、`beatsPerCycle` 拍で満タンになったら
 * 次の周でまた1個から数え直す（例: ●○○○ → ●●○○ → ●●●○ → ●●●● → ●○○○…）。
 */
function drawBeatPips(d: DrawCtx, layer: MvBeatPipsLayer): void {
	const { ctx } = d;
	const cycle = Math.max(1, Math.round(layer.beatsPerCycle));
	const currentBeat = Math.floor(d.bar * MV_BEATS_PER_BAR);
	const filled = (((currentBeat % cycle) + cycle) % cycle) + 1;
	const size = layer.size;
	const gap = layer.gap;
	const w = cycle * size + (cycle - 1) * gap;
	const [ax, ay] = anchorOffset(layer.anchor, w, size);
	const originX = layer.x + ax;
	const originY = layer.y + ay;

	for (let i = 0; i < cycle; i++) {
		const cx = originX + i * (size + gap);
		const isLast = i === filled - 1;
		ctx.fillStyle =
			i < filled ? (isLast ? (layer.activeColor ?? layer.color) : layer.color) : "rgba(255,255,255,0.15)";
		if (layer.shape === "circle") {
			ctx.beginPath();
			ctx.arc(cx + size / 2, originY + size / 2, size / 2, 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.fillRect(cx, originY, size, size);
		}
	}
}

/** 値が切り替わった瞬間から `phase` 小節ぶん、1ドット分だけ跳ねる縦オフセット（0以下）。 */
function bounceOffset(phase: number, amount: number, duration = 0.15): number {
	const t = Math.min(1, Math.max(0, phase) / duration);
	return -amount * (1 - t) * (1 - t);
}

/**
 * 特定トラックの「いま鳴っている音」を度数のドット絵数字で出す。
 * `drawDegree` の数字部分をドット絵化した版——値そのものではなく「音が鳴り始めた瞬間」を
 * 跳ねのトリガーにする（同じ数字が続いても拍が見えたほうがリズムが伝わる）。
 */
function drawBeatDigit(d: DrawCtx, layer: MvBeatDigitLayer): void {
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

	const cell = layer.cellSize;
	const onsetBar = note.startStep / MV_STEPS_PER_BAR;
	const bounce = bounceOffset(d.bar - onsetBar, cell);

	const chars = [...label];
	const w = chars.length * 3 * cell + (chars.length - 1) * cell;
	const h = 5 * cell;
	const [ax, ay] = anchorOffset(layer.anchor, w, h);
	let cx = layer.x + ax;
	const originY = layer.y + ay + bounce;
	for (const ch of chars) {
		drawDotDigit(ctx, ch, cx, originY, cell, layer.color);
		cx += 4 * cell;
	}
}

/**
 * いま鳴っているコード名だけを出す読み札。`chordBar` の帯を出さずに文字だけ欲しいとき用。
 * コードが切り替わった瞬間（`chord.bar`）から1ドット分跳ねる。
 */
function drawBeatChordLabel(d: DrawCtx, layer: MvBeatChordLabelLayer): void {
	const { ctx } = d;
	const chord = resolveActiveChord(d);
	if (!chord) return;

	const bounce = bounceOffset(d.bar - chord.bar, layer.size * 0.3);
	ctx.font = `bold ${layer.size}px ${getMvFontStack(d.manifest)}`;
	ctx.textBaseline = "alphabetic";
	const w = ctx.measureText(chord.label).width;
	const [ax, ay] = anchorOffset(layer.anchor, w, layer.size);
	ctx.fillStyle = layer.color;
	ctx.fillText(chord.label, layer.x + ax, layer.y + ay + layer.size + bounce);
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

/**
 * `chords` を自前で持たないレイヤーが参照する進行を探す共通ロジック。
 * 自前の `chords` があればそれを優先し、無ければ `chordLayerId`（未指定なら最初に
 * 見つかった）`chordBar` を見る。
 */
/** いま鳴っているコード。進行は常に `MvSong.chords`（MMLからの自動検出）を見る。 */
function resolveActiveChord(d: DrawCtx): MvChordStep | null {
	return chordAtBar(d.song.chords, d.bar);
}

/** 度数を数える基準の音（0-11）。コード基準なら進行から、調基準なら主音から。 */
function degreeRootPitch(
	d: DrawCtx,
	layer: { basis: "chord" | "key"; key: string },
): number | null {
	if (layer.basis === "key") return MV_ROOT_TO_PITCH[layer.key] ?? 0;
	const chord = resolveActiveChord(d);
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
	/** 0(乱れ無し)..1(完全に崩れる)。グリッチ演出の崩れ具合。 */
	glitchAmount?: number;
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
	let glitchAmount: number | undefined = undefined;
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
			const style = resolveEntranceStyle(layer.entrance);

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
					// 大きなブロックから→小さく(=くっきり)なっていく。1-tで「粗さ」を表す。
					pixelateSize = Math.max(1, Math.round(1 + (1 - t) * 22));
					break;
				case "glitch":
					if (layer.entrance.fade) alpha *= eased;
					// 崩れた状態(1)から静止画(0)へ収束する＝崩れ量は 1-t。
					glitchAmount = clamp01(1 - t);
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
			const style = resolveExitStyle(layer.exit);

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
					pixelateSize = Math.max(1, Math.round(1 + t * 22));
					break;
				case "glitch":
					if (layer.exit.fade) alpha *= 1 - eased;
					// 静止画(0)から崩れ切る(1)へ。tのままだと立ち上がりが遅いので3乗根で早めに崩し始める。
					glitchAmount = clamp01(Math.cbrt(t));
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
		glitchAmount,
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

/**
 * レイヤー単体を粗いドット(モザイク)へ落として描く。
 *
 * 以前は `pixelateSize` を計算するだけで描画側が一切読んでおらず、"ドット分解"を選んでも
 * 見た目は（fadeチェックがあれば）ただの不透明度フェードにしかならなかった
 * （プリセット名と実際の効果が一致しない、実質未実装のバグ）。
 * 画面全体に掛ける後処理の pixelate（drawPostEffects内）と同じ手法——
 * 小さいキャンバスへ縮小してから最近傍補間で拡大——をレイヤー1枚だけに適用する。
 */
function drawLayerPixelated(d: DrawCtx, layer: MvLayer, blockSize: number): void {
	const { ctx } = d;
	const sctx = scratchCtx(scratchA, MV_W, MV_H);
	if (!sctx || !scratchA.canvas) {
		drawLayer(d, layer);
		return;
	}
	drawLayer({ ...d, ctx: sctx }, layer);

	const tw = Math.max(1, Math.round(MV_W / Math.max(1, blockSize)));
	const th = Math.max(1, Math.round(MV_H / Math.max(1, blockSize)));
	const bctx = scratchCtx(scratchB, tw, th);
	if (!bctx || !scratchB.canvas) {
		ctx.drawImage(scratchA.canvas, 0, 0);
		return;
	}
	bctx.drawImage(scratchA.canvas, 0, 0, tw, th);
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(scratchB.canvas, 0, 0, MV_W, MV_H);
	ctx.imageSmoothingEnabled = true;
}

/**
 * レイヤー単体を、走査線がずれてコマ落ちするデジタル的な壊れ方で描く。
 *
 * 新設した「グリッチ」演出。横帯ごとに左右へランダムにずらし、崩れが強いときは
 * 帯そのものを間引く（＝一瞬何も描かれない裂け目ができる）。`amount` は
 * 0(乱れ無し=元の絵そのまま)〜1(ほぼ全帯が欠落・激しくずれる)。
 * 毎フレーム `d.step` で乱数の種を変えるので、時間とともに裂け目の位置がちらつく
 * ——本物の走査線ノイズのような不安定さになる（欠落確率は上限0.75に留め、全消しにはしない）。
 */
function drawLayerGlitch(d: DrawCtx, layer: MvLayer, amount: number): void {
	const { ctx } = d;
	if (amount <= 0.01) {
		drawLayer(d, layer);
		return;
	}
	const sctx = scratchCtx(scratchA, MV_W, MV_H);
	if (!sctx || !scratchA.canvas) {
		drawLayer(d, layer);
		return;
	}
	drawLayer({ ...d, ctx: sctx }, layer);

	const slices = 16;
	const sliceH = MV_H / slices;
	// レイヤーIDも種に混ぜて、同じフレームで複数レイヤーが同時にグリッチしても
	// 全く同じ裂け方に揃ってしまわないようにする。
	const idSeed = layer.id.length * 7 + layer.id.charCodeAt(0);
	const seed = Math.floor(d.step) + idSeed;
	for (let i = 0; i < slices; i++) {
		const dropRoll = hash01(seed * 13 + i * 7.7);
		if (dropRoll < amount * 0.75) continue;
		const jitter = hash01(seed * 29 + i * 3.3) * 2 - 1;
		const shift = jitter * amount * 50;
		const y = i * sliceH;
		ctx.drawImage(
			scratchA.canvas,
			0,
			y,
			MV_W,
			sliceH,
			shift,
			y,
			MV_W,
			sliceH,
		);
	}
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

	if (trans.glitchAmount !== undefined) {
		drawLayerGlitch(d, layer, trans.glitchAmount);
	} else if (trans.pixelateSize !== undefined) {
		drawLayerPixelated(d, layer, trans.pixelateSize);
	} else if (trans.flashAlpha && trans.flashAlpha > 0.01) {
		const sctx = scratchCtx(scratchA, MV_W, MV_H);
		if (sctx && scratchA.canvas) {
			const dScratch: DrawCtx = { ...d, ctx: sctx };
			drawLayer(dScratch, layer);
			sctx.save();
			sctx.globalCompositeOperation = "source-atop";
			sctx.fillStyle = `rgba(255, 255, 255, ${trans.flashAlpha * 0.3})`;
			sctx.fillRect(0, 0, MV_W, MV_H);
			sctx.restore();

			ctx.drawImage(scratchA.canvas, 0, 0);
		} else {
			drawLayer(d, layer);
		}
	} else {
		drawLayer(d, layer);
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

// ───────────────── キャラクターレイヤー(瞬き・口パク) ─────────────────

/**
 * base/eyes/mouth の asset-ref を「いま描画に使える画像ソース」へ解決する。
 * psd: 参照は lib/mv-psd.ts が事前解決した canvas(preloadPsdRef→peekPsdImage、同期)を、
 * それ以外は既存の walk-sprite.ts の画像キャッシュ(loadImage→peekImage、同期)を見る。
 * どちらも「事前ロードが済んでいなければ null」――描画ループはpollingで待つのではなく、
 * このフレームは何も描かず次フレームで再試行する（画像ロード失敗時の既存挙動と同じ）。
 */
function resolveAssetRefImage(
	ref: MvAssetRef | undefined,
): CanvasImageSource | null {
	if (!ref) return null;
	if (isPsdRef(ref.ref)) {
		const canvas = peekPsdImage(ref.ref);
		return canvas && canvas.width > 0 ? canvas : null;
	}
	const url = assetRefUrl(ref);
	if (!url) return null;
	const img = peekImage(url);
	return img && img.naturalWidth > 0 ? img : null;
}

/** CanvasImageSource(HTMLImageElement/HTMLCanvasElement)の実寸。 */
function canvasImageSize(src: CanvasImageSource): { w: number; h: number } {
	if (src instanceof HTMLImageElement) {
		return { w: src.naturalWidth, h: src.naturalHeight };
	}
	if (src instanceof HTMLCanvasElement) {
		return { w: src.width, h: src.height };
	}
	const anySrc = src as { width?: number; height?: number };
	return { w: anySrc.width ?? 0, h: anySrc.height ?? 0 };
}

/** 現在の目の開閉状態に対応する asset-ref。`eyes` 未設定なら null（重ね描きしない）。 */
function resolveEyeRef(
	layer: MvCharacterLayer,
	d: DrawCtx,
): MvAssetRef | null {
	const eyes = layer.eyes;
	if (!eyes) return null;
	const beatPos = d.step / MV_STEPS_PER_BEAT;
	const state = resolveBlinkState(eyes.blink, beatPos);
	return state === "closed" ? eyes.closed : eyes.open;
}

/** 歌詞トラックの現在発音中とおぼしき行を、行の中の経過割合つきで返す。 */
function activeLyricLineProgress(
	d: DrawCtx,
	trackId: number,
): { line: MvLyricLine; progress: number } | null {
	const line = d.song.lyricLines.find(
		(l) =>
			l.trackId === trackId &&
			d.bar >= l.bar &&
			d.bar < (l.endBar ?? l.bar + 0.01),
	);
	if (!line) return null;
	const span = Math.max(0.001, (line.endBar ?? line.bar) - line.bar);
	return { line, progress: (d.bar - line.bar) / span };
}

/** 現在の口の開閉/母音状態に対応する asset-ref。`mouth` 未設定なら null（重ね描きしない）。 */
function resolveMouthRef(layer: MvCharacterLayer, d: DrawCtx): MvAssetRef | null {
	const mouth = layer.mouth;
	if (!mouth) return null;
	if (mouth.lipsync.mode === "track") {
		const energy = trackEnergy(d.song, d.step, mouth.lipsync.trackId);
		const threshold = mouth.lipsync.threshold ?? 0.12;
		return energy > threshold ? mouth.open : mouth.closed;
	}
	// vowel モード: 歌詞トラックから現在発音中の1文字を推定して母音へ落とす
	const active = activeLyricLineProgress(d, mouth.lipsync.trackId);
	if (!active) return mouth.closed;
	const vowel = estimateVowelAtProgress(active.line.text, active.progress);
	const vowelRef = mouth.vowels?.[vowel];
	if (vowelRef) return vowelRef;
	// 個別素材が無い母音は開/閉へフォールバック（"n"=閉じる、それ以外=開く）
	return vowel === "n" ? mouth.closed : mouth.open;
}

/**
 * キャラクター表示レイヤー。`drawImageLayer` と同じ変換(位置・拡大・motion・repeat・
 * flip・frame)で土台画像を描いたあと、同じ矩形へ目/口の現在の画像を重ねる。
 */
function drawCharacterLayer(d: DrawCtx, layer: MvCharacterLayer): void {
	const baseImg = resolveAssetRefImage(layer.base);
	if (!baseImg) return;
	const baseSize = canvasImageSize(baseImg);
	if (baseSize.w === 0 || baseSize.h === 0) return;

	const eyeRef = resolveEyeRef(layer, d);
	const eyeImg = eyeRef ? resolveAssetRefImage(eyeRef) : null;
	const mouthRef = resolveMouthRef(layer, d);
	const mouthImg = mouthRef ? resolveAssetRefImage(mouthRef) : null;

	const { ctx } = d;

	let src: SpriteRect = {
		sx: 0,
		sy: 0,
		sw: baseSize.w,
		sh: baseSize.h,
	};
	const walkSpeed = mvWalkSpeed(d.manifest);
	if (layer.walk) {
		const crop = layer.walk.crop ?? [0, 0, baseSize.w, baseSize.h];
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
		const copyScale = scale + (rep?.scaleStep ?? 0) * i;
		if (copyScale <= 0) continue;
		const w = src.sw * copyScale * motion.scale;
		const h = src.sh * copyScale * motion.scale;
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

		ctx.save();
		ctx.translate(x + w / 2, y + h / 2);
		ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
		const dw = w;
		const dh = h;
		ctx.drawImage(
			baseImg,
			src.sx,
			src.sy,
			src.sw,
			src.sh,
			-dw / 2,
			-dh / 2,
			dw,
			dh,
		);
		// 目・口は土台と同じ矩形（等倍・全体）へ重ねる。土台がスプライトシートの1コマを
		// 切り出していても、パーツ画像はその1コマぶんの静止画として同じ大きさで重なる。
		if (eyeImg) {
			ctx.drawImage(eyeImg, -dw / 2, -dh / 2, dw, dh);
		}
		if (mouthImg) {
			ctx.drawImage(mouthImg, -dw / 2, -dh / 2, dw, dh);
		}
		ctx.restore();
	}

	ctx.globalAlpha = baseAlpha;
	ctx.imageSmoothingEnabled = prevSmoothing;
}

// ───────────────── テキストレイヤー ─────────────────

/** 動画全体の既定フォント。未指定時は美咲ゴシック（'misaki_gothic'、app/globals.css の @font-face）。 */
export function getMvFontStack(manifest?: MvManifest): string {
	if (manifest?.stage?.fontFamily) return manifest.stage.fontFamily;
	return '"misaki_gothic", "DotGothic16", monospace, sans-serif';
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
	ctx.textBaseline = "top";

	if (layer.shadow) {
		ctx.shadowColor = "rgba(0,0,0,0.8)";
		ctx.shadowBlur = Math.max(2, size * 0.25);
	}

	const mainColor = layer.color;
	const highlightColor = layer.highlightColor || "#ff4444";
	const rawLines = layer.text.split("\n");
	const parsedLines = rawLines.map((line) => parseHighlightedText(line));

	if (layer.vertical) {
		parsedLines.forEach((segments, li) => {
			const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);
			const h = totalChars * size * 1.05;
			const [ax, ay] = anchorOffset(layer.anchor, size, h);
			const x = layer.x + ax + motion.dx - li * size * 1.6;
			let y = layer.y + ay + motion.dy;
			for (const seg of segments) {
				ctx.fillStyle = seg.isHighlight ? highlightColor : mainColor;
				for (const ch of seg.text) {
					ctx.fillText(toVerticalFormChar(ch), x, y);
					y += size * 1.05;
				}
			}
		});
	} else {
		const lineWidths = parsedLines.map((segments) => {
			const fullText = segments.map((s) => s.text).join("");
			return ctx.measureText(fullText).width;
		});
		const w = Math.max(...lineWidths, 0);
		const h = parsedLines.length * size * 1.25;
		const [ax, ay] = anchorOffset(layer.anchor, w, h);

		parsedLines.forEach((segments, li) => {
			let curX = layer.x + ax + motion.dx;
			const ly = layer.y + ay + motion.dy + li * size * 1.25;
			for (const seg of segments) {
				ctx.fillStyle = seg.isHighlight ? highlightColor : mainColor;
				ctx.fillText(seg.text, curX, ly);
				curX += ctx.measureText(seg.text).width;
			}
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
	const withGapResets = applyLyricGapResets(lines, layer.holdBars ?? 2);
	return applyLyricResetBars(withGapResets, layer.resetBars);
}

/**
 * 手入力の resetBars/resetBefore とは別に、行と行のあいだが INTERLUDE_GAP_BARS より
 * 大きく開く（＝間奏などで次の歌詞まで間が空く）箇所を自動でリセット扱いにする。
 * これが無いと、間奏で次の行が遠いとき groupEndBar が次行の小節まで伸びきってしまい、
 * 積み上げた歌詞が間奏中ずっと画面に残り続けてしまう。
 *
 * `holdBars` は手入力（`source==='manual'`）の行のように `endBar`（実際に歌っている
 * 長さ）が分からない行の代わりの目安として使う。以前は `endBar ?? prev.bar` としていて、
 * これは「歌っている時間0」と同じ意味になり、手入力の行は普通の間隔（例:2小節おき）
 * で置いただけで毎回 `gap > INTERLUDE_GAP_BARS` を満たしてしまい、**手入力の行が
 * ほぼ全部「間奏」判定される**バグになっていた（同時表示行数の設定に関わらず常に
 * 1行しか積み上がらない／間奏でもないのに歌詞が消える、の両方の原因）。
 * `endBar` が無い行は「保持時間ぶんは歌っている」とみなして `prev.bar + holdBars` を
 * 使うことで、通常の行間隔では引っかからず、実際に holdBars を超えて空く箇所だけを
 * 間奏として検出する。
 */
function applyLyricGapResets(
	lines: MvLyricLine[],
	holdBars: number,
): MvLyricLine[] {
	if (lines.length === 0) return lines;
	return lines.map((l, i) => {
		if (i === 0) return l;
		const prev = lines[i - 1];
		const prevEnd = prev.endBar ?? prev.bar + holdBars;
		const gap = l.bar - prevEnd;
		return gap > INTERLUDE_GAP_BARS && !l.resetBefore
			? { ...l, resetBefore: true, autoReset: true }
			: l;
	});
}

/**
 * まとまり全体が消えるまでのフェードアウト時間（小節単位）。
 * フェードアウト開始を直前まで遅らせ、消え始める時はサッと素早く消える調整。
 */
const LYRIC_FADE_OUT_BARS = 0.15;

/**
 * 間奏で自動的に区切られたまとまりを消すまでの時間。
 */
const AUTO_RESET_FADE_BARS = 0.3;

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

	// まとまり全体が消えるタイミング＝「まとまり最後の行の保持明け」と「次の区切りの開始小節」の早い方。
	// 次の区切りだけを見ると、間奏で次行が遠いときに保持明け後もずっと居座ってしまう
	// （歌いきったのに閾値ぶん待たされる）ので、必ず保持明けも上限として効かせる。
	// 次の区切りが間奏の自動検出（autoReset）由来なら、閾値(hold)は「間奏と判定する条件」
	// でしかないので使い回さず、歌いきったらすぐ消える短い固定時間にする。
	const nextIsAutoReset = groupEnd < lines.length && !!lines[groupEnd].autoReset;
	const lastLine = lines[groupEnd - 1];
	const lastLineEnd = lastLine.endBar ?? lastLine.bar;
	const lastBarInGroup =
		lastLineEnd + (nextIsAutoReset ? AUTO_RESET_FADE_BARS : hold);
	const groupEndBar =
		groupEnd < lines.length
			? Math.min(lines[groupEnd].bar, lastBarInGroup)
			: lastBarInGroup;
	const groupFadeOut = clamp01((groupEndBar - d.bar) / LYRIC_FADE_OUT_BARS);
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
		const lyricMainColor = layer.color;
		const lyricHighlightColor = layer.highlightColor || "#ff4444";

		if (layer.vertical) {
			const rawSegments = parseHighlightedText(line.text);
			const activeSegments =
				layer.typing && depth === 0
					? sliceSegments(
							rawSegments,
							Math.floor(Math.max(0, age) / 0.04) + 1,
						)
					: rawSegments;
			const totalChars = activeSegments.reduce(
				(sum, s) => sum + s.text.length,
				0,
			);
			const h = totalChars * size * 1.08;
			const [ax, ay] = anchorOffset(layer.anchor, size, h);
			const step = size * 1.7;
			const x = layer.x + ax + (stack === "left" ? -order : order) * step;
			let y = layer.y + ay;
			for (const seg of activeSegments) {
				ctx.fillStyle = seg.isHighlight ? lyricHighlightColor : lyricMainColor;
				for (const ch of seg.text) {
					ctx.fillText(toVerticalFormChar(ch), x, y);
					y += size * 1.08;
				}
			}
		} else {
			const rawSegments = parseHighlightedText(line.text);
			const activeSegments =
				layer.typing && depth === 0
					? sliceSegments(
							rawSegments,
							Math.floor(Math.max(0, age) / 0.04) + 1,
						)
					: rawSegments;
			const fullText = activeSegments.map((s) => s.text).join("");
			const w = ctx.measureText(fullText).width;
			const [ax, ay] = anchorOffset(layer.anchor, w, size);
			const lineH = size * 1.35;
			const lx = layer.x + ax;
			const ly = layer.y + ay + (stack === "up" ? -order : order) * lineH;
			drawLyricMarks(d, line, fullText, lx, ly, size, alpha);
			let curX = lx;
			for (const seg of activeSegments) {
				ctx.fillStyle = seg.isHighlight ? lyricHighlightColor : lyricMainColor;
				ctx.fillText(seg.text, curX, ly);
				curX += ctx.measureText(seg.text).width;
			}
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
 * `iconCycle` の今フレームでのコマ番号と、そのコマの中での進み具合 (0..1)。
 *
 * `advance:"onset"` は指定トラックの発音回数ぶん進む。
 * `beats` は拍ロック(一定間隔)。`resetEveryBars` があれば、その小節数の境目で
 * 1コマ目(小節の頭)に戻り、残りの小節でコマ2以降を順にめぐる
 * （目視確認: 8小節ごとに単純な形へ戻り、残りの小節でループする構造だったため）。
 *
 * 進み具合は `crossfade` 専用——次のコマと重ねるには切り替わりまでの残りが要る。
 * `advance:"onset"` は次の発音がいつ来るか分からず進捗を出しようがないので常に 0
 * （＝重ね合わせ無しで従来どおり瞬時に切り替わる）。
 */
function iconCyclePosition(
	d: DrawCtx,
	cycle: NonNullable<MvShapeLayer["iconCycle"]>,
): { index: number; t: number } {
	const n = cycle.paths.length;
	if ("advance" in cycle) {
		const list = trackNotes(d.song, cycle.track);
		const idx = lastIndexAtOrBefore(list, d.step);
		return { index: (((idx + 1) % n) + n) % n, t: 0 };
	}
	const pos = cycle.resetEveryBars
		? (() => {
				const windowSteps = cycle.resetEveryBars * MV_STEPS_PER_BAR;
				const windowStart = Math.floor(d.step / windowSteps) * windowSteps;
				return ((d.step - windowStart) / windowSteps) * n;
			})()
		: ((d.step / (cycle.beats * MV_STEPS_PER_BEAT)) % 1) * n;
	const index = Math.min(n - 1, Math.floor(pos));
	return { index, t: clamp01(pos - index) };
}

/** 重ね合わせの効き方。線形だと入れ替わりの瞬間が平坦に見えるので S字にする。 */
function smoothstep(x: number): number {
	const u = clamp01(x);
	return u * u * (3 - 2 * u);
}

/**
 * 今フレームで描くコマ（1枚、または重ね合わせ中の2枚）を返す。
 * 重ね合わせ中は前後のコマの濃さを足して1になるようにしてあるので、
 * 全体の明るさが繋ぎ目で膨らんだり凹んだりしない。
 */
function iconCycleFrames(
	d: DrawCtx,
	cycle: NonNullable<MvShapeLayer["iconCycle"]>,
): { path: string; alpha: number }[] {
	const { index, t } = iconCyclePosition(d, cycle);
	const n = cycle.paths.length;
	const xf = "advance" in cycle ? 0 : clamp01(cycle.crossfade ?? 0);
	// コマの終わり xf ぶんに入るまでは今のコマだけ。手前で混ぜ始めると
	// 「ずっと二重に見えている」だけになり、決まるべき瞬間が消える。
	if (xf <= 0 || n < 2 || t < 1 - xf) {
		return [{ path: cycle.paths[index], alpha: 1 }];
	}
	const u = smoothstep((t - (1 - xf)) / xf);
	return [
		{ path: cycle.paths[index], alpha: 1 - u },
		{ path: cycle.paths[(index + 1) % n], alpha: u },
	];
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

	const spin = layer.spin ?? 0;

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
		// spread/offsetX/offsetY も動かせるようにしてある（複製が「並ぶ」だけでなく
		// 「散らばる／集まる」動きそのものを作れるように——固定間隔のまま個数だけ
		// 増やす複製は安っぽく見える、というユーザー指摘への対応）。
		const spread = modulate(d, mods, "spread", layer.spread ?? 0, delay);
		const offsetX = modulate(d, mods, "offsetX", layer.offsetX ?? 0, delay);
		const offsetY = modulate(d, mods, "offsetY", layer.offsetY ?? 0, delay);

		// 連動を重ねすぎても画面を覆い尽くさないよう、描画半径は画面サイズの2倍で頭打ちにする。
		// `size`/`spread` はモジュレータの掛け算・割り算の連鎖で NaN や Infinity になり得る
		// （割り算のゼロ除算・未定義値の伝播など）。`Math.min(NaN, x)` は NaN を返し、
		// 直後の `radius <= 0.2` は NaN との比較が常に false になるためこのガードを
		// すり抜けて描画まで進んでしまう——その後 `ctx.scale(NaN, NaN)` が実質のno-opに
		// なる一方、直前の変形（translate等）だけが残った状態で `fill()` が走ると、
		// 極端に巨大な塗りつぶしとして画面全体が単色になる（「全画面が白一色になる」
		// バグの実体）。ここで明示的に弾く。
		const radius = Math.min(size + spread * i, MV_W * 2);
		if (!Number.isFinite(radius) || radius <= 0.2 || opacity <= 0.004) continue;

		ctx.globalAlpha = baseAlpha * opacity;
		ctx.lineWidth = thickness;
		ctx.save();
		ctx.translate(x + offsetX * i, y + offsetY * i);
		ctx.rotate((rotation + spin * i) * DEG);
		const aspect = layer.aspect ?? 1;
		if (aspect !== 1) ctx.scale(1, aspect);
		// コマ送り中は、切り替わり際に前後2枚が重なって返ってくる（crossfade）。
		const cycleFrames = layer.iconCycle
			? iconCycleFrames(d, layer.iconCycle)
			: undefined;
		const activePath = cycleFrames ? cycleFrames[0].path : layer.path;
		if (layer.form === "path" && activePath) {
			// 設計座標系（pathBox）の中心を原点に、長辺が size×2 になるよう拡縮して描く
			const box = layer.pathBox ?? [0, 0, 100, 100];
			const bw = Math.max(1e-3, Number.isFinite(box[2]) ? box[2] : 100);
			const bh = Math.max(1e-3, Number.isFinite(box[3]) ? box[3] : 100);
			const s = (radius * 2) / Math.max(bw, bh);
			if (!Number.isFinite(s) || s <= 0) {
				ctx.restore();
				continue;
			}
			ctx.scale(s, s);
			ctx.translate(-(box[0] + bw / 2), -(box[1] + bh / 2));
			const frames = cycleFrames ?? [{ path: activePath, alpha: 1 }];
			for (const fr of frames) {
				if (fr.alpha <= 0.004 || !fr.path) continue;
				ctx.globalAlpha = baseAlpha * opacity * fr.alpha;
				try {
					const p = getPath2D(fr.path);
					// evenodd にしておくと、重なったサブパスが穴として抜ける（ドーナツ形などが作れる）
					if (layer.filled) ctx.fill(p, "evenodd");
					else {
						// lineWidth はこの拡縮済み座標系（scale(s,s)後）の中で指定するため、
						// 画面上の太さを常に `thickness` px に保つには `thickness/s` を渡す必要がある
						// ——ここまでは正しい設計。だが `size`（ひいては半径・s）はモジュレータの
						// 「頭で縮んで基準へ育つ」演出（sub）で意図的に一瞬 0 近くまで小さくなる
						// （同時に thickness は add で太くなる、という組み合わせそのものが仕様）。
						// s が極小になると `thickness/s` は数千〜数万に達し、Canvas 内部のストローク
						// 輪郭計算（極端に太い線をローカル座標で作ってから極小scaleで縮める）が
						// 浮動小数点精度を失って破綻し、輪郭が画面全体を覆う塗り面のように描画される
						// ——これが「1拍ごとに全画面が白くなる」バグの実体だった。数値としては
						// scale後にthickness pxへ収束するはずが、計算過程で発散してしまう。
						// ローカル座標側の太さに上限を設けて発散を防ぐ（screen上のthicknessが
						// 有限のうちは見た目に影響しない）。
						const localLineWidth = thickness / s;
						ctx.lineWidth = Number.isFinite(localLineWidth)
							? Math.min(localLineWidth, 2000)
							: 2000;
						ctx.stroke(p);
					}
				} catch {
					// 入力途中の壊れたパスは黙って飛ばす
				}
			}
			ctx.globalAlpha = baseAlpha * opacity;
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

/**
 * トラック全体（ページ分割前）の音域から決める、表示に使う縦幅（span）。
 *
 * 以前は `page` フローでもページ（切り替え間隔）ごとの音符だけから min/max を取り直して
 * いたため、ページによって音域の「広さ」そのものが変わり、切り替わるたびに1音あたりの
 * 高さ（noteH）や間隔の縮尺までガクッと変わっていた。どのページも同じメロディの一部分
 * （＝同じトラック）を映しているのに縮尺だけ毎回変わるので、実際には音の高さが正しく
 * ページごとに動いているのに「全部同じ量だけ位相がズレて見える」という錯視の原因に
 * なっていた（ユーザー指摘）。
 *
 * 縦幅はトラック全体から一度だけ決め、ページ間で変えない。ページごとに変えるのは
 * `getLayerPitchRange` 側の「窓の中心（どの音域を真ん中に映すか）」だけにする。
 */
function getLayerPitchSpan(allNotes: MvNote[]): number {
	if (allNotes.length === 0) return 12;
	let min = Infinity;
	let max = -Infinity;
	for (const n of allNotes) {
		if (n.pitch < min) min = n.pitch;
		if (n.pitch > max) max = n.pitch;
	}
	return Math.max(12, max - min);
}

/**
 * `getLayerPitchRange` の結果のキャッシュ。span はトラック全体から決まるので曲が変わらない
 * 限り一定、中心もページ番号が変わったときだけ動く。フレームごとに全ノートを舐めて
 * 取り直すのは無駄なので、`songRef` と `pageKey` が変わらない間はキャッシュを再利用する。
 */
const pitchRangeCache = new WeakMap<
	MvVisualizerLayer,
	{ songRef: MvSong; key: string; range: [number, number] }
>();

/** `getLayerPitchRange` のキャッシュ付き版。`pageKey` が変わったときだけ計算し直す。 */
function getLayerPitchRangeCached(
	song: MvSong,
	layer: MvVisualizerLayer,
	notes: MvNote[],
	pageKey: string | number = "all",
	allNotes: MvNote[] = notes,
): [number, number] {
	if (layer.pitchRange) return [layer.pitchRange[0], layer.pitchRange[1]];
	// pageKey だけをキーにすると、ページ番号が変わらないままトラック選択(layer.tracks)
	// だけを変えたときに古いトラックの中心がキャッシュに残り続けて再計算されない
	// （ユーザー指摘：トラック選択を変えても位相が自動で変わらない）。トラック選択も
	// キーに含めて、選択が変わったら必ず取り直す。
	const tracksKey = layer.tracks && layer.tracks.length > 0
		? layer.tracks.join(",")
		: "all";
	const key = `${tracksKey}|${pageKey}`;
	const cached = pitchRangeCache.get(layer);
	if (cached && cached.songRef === song && cached.key === key) {
		return cached.range;
	}
	const range = getLayerPitchRange(song, layer, notes, allNotes);
	pitchRangeCache.set(layer, { songRef: song, key, range });
	return range;
}

/**
 * `notes`（いま映す音符=ページ内など）を縦の中心に据えつつ、縦幅は `allNotes`
 * （トラック全体）から決めた固定の span を使う。`allNotes` を省略した呼び出し
 * （page フローの無いビジュアライザ）では `notes` 自身が「トラック全体」になるので、
 * 従来どおり全体の音域からそのまま span も中心も決まる。
 */
function getLayerPitchRange(
	song: MvSong,
	layer: MvVisualizerLayer,
	notes: MvNote[],
	allNotes: MvNote[] = notes,
): [number, number] {
	if (layer.pitchRange) return [layer.pitchRange[0], layer.pitchRange[1]];

	const span = getLayerPitchSpan(allNotes);
	// このページに音が無ければトラック全体を中心に据える（真ん中がまるごと空くのを防ぐ）。
	const centerNotes = notes.length > 0 ? notes : allNotes;
	if (centerNotes.length === 0) return [song.pitchMin, song.pitchMax];

	let min = Infinity;
	let max = -Infinity;
	for (const n of centerNotes) {
		if (n.pitch < min) min = n.pitch;
		if (n.pitch > max) max = n.pitch;
	}
	const mid = (min + max) / 2;
	return [Math.round(mid - span / 2), Math.round(mid + span / 2)];
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
 * - page   : 譜面は動かず、`amount` 小節ぶんを固定位置に並べる。小節窓が進むとページごと差し替わる。
 *   `pageOffsetBeats` で切り替えタイミングを小節頭から拍単位でずらせる（既定0＝ずらさない）。
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
	// ページの切り替え位置を小節頭から拍単位でずらす（既定0＝ずらさない）。
	const pageOffsetSteps = (layer.pageOffsetBeats ?? 0) * MV_STEPS_PER_BEAT;

	// page はいま居るページの頭を原点にする。scroll は再生位置基準で毎フレーム動く。
	const from = paged
		? Math.floor((d.step - pageOffsetSteps) / windowSteps) * windowSteps +
			pageOffsetSteps
		: d.step - windowSteps * 0.25;
	const to = from + windowSteps;

	const notes = notesForLayer(d, layer);
	// 中心合わせに使う「いま画面に映っている音符」。page はページ窓、scroll は
	// 再生位置まわりの表示窓——どちらも実際に描画される音符と同じ条件で絞る
	// （以前は scroll がここだけ曲全体の音符を使っていて、いま流れている場所と
	// 無関係な位置に中心が固定されるズレになっていた＝ユーザー指摘）。
	const targetNotes = notes.filter((n) => {
		const end = n.startStep + n.durationSteps;
		return paged
			? n.startStep >= from && n.startStep < to
			: end >= from && n.startStep <= to;
	});
	// page は切り替え間隔（ページ）ごと、scroll は表示窓ぶん進むごとに音域が変わりうる
	// ので、その区切り番号をキーにして区切りが変わったときだけ min/max を計算し直す。
	const pageKey = paged
		? Math.round((from - pageOffsetSteps) / windowSteps)
		: Math.floor(d.step / windowSteps);
	const [pitchLo, pitchHi] = getLayerPitchRangeCached(
		song,
		layer,
		targetNotes,
		pageKey,
		notes,
	);
	const pitchRange = Math.max(1, pitchHi - pitchLo);
	const noteH = Math.max(1.5, h / (pitchRange + 1));
	const echo = light.echo && light.echo.beats > 0 ? light.echo : null;
	const echoSteps = echo ? echo.beats * MV_STEPS_PER_BEAT : 0;
	// echo は音符の外へ echo.spread ぶん輪郭が広がる。クリップをノート矩形ぴったりにすると
	// 広がった分がまるごと切り取られて「枠の外に何も出ない」ことになる（zoomレイヤーで顕著）。
	const clipMargin = echo ? echo.spread : 0;

	ctx.save();
	ctx.beginPath();
	// 高さは便宜上の値（表示領域の目安）として扱い、上下にはみ出した音階もクリップせず描画する。
	// ただし横幅（時間軸）はクリップしないと横にはみ出してしまうため X 軸だけ制限する。
	ctx.rect(
		x - clipMargin,
		-MV_H * 10,
		w + clipMargin * 2,
		MV_H * 20,
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
		// 音域を折り返す（オクターブ寄せ）のはもちろん、端へクランプするのもやめる——
		// クランプすると音域の外に出た音がすべて上端/下端の同じ位置に重なって描かれ、
		// 「違う高さの音なのに同じ場所に描かれる」という別のバグになる（ユーザー指摘）。
		// pitchLo/pitchHi・1音あたりの高さ(noteH)は既にループの前で算出済みなので、
		// ここでは生のピッチをそのまま同じ式に通すだけでいい。音域の外に出た分は
		// 矩形の外（y..y+h の外）に描かれることになるが、そこは呼び出し側の
		// ctx.clip() が同じ矩形で切ってくれるので、画面上は単に「見えなくなる」
		// だけで済み、値を書き換えて位置を誤魔化す必要が無い。
		const ny =
			y + h - ((n.pitch - pitchLo) / pitchRange) * (h - noteH) - noteH;

		const sounding = n.startStep <= d.step && end > d.step;
		const baseColor = light.color || trackColor(d, n.track);
		const color = sounding && light.activeColor ? light.activeColor : baseColor;
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
	if (d.step < n.startStep) return light.hideUnplayed ? 0 : light.dim;
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

	const notes = notesForLayer(d, layer);
	// 中心合わせは「いま流れているレーンの窓」に映る音符から。曲全体の音符を使うと、
	// いま流れている場所と無関係な位置に中心が固定されるズレになる（ユーザー指摘）。
	const windowNotes = notes.filter((n) => {
		const end = n.startStep + n.durationSteps;
		return end >= from && n.startStep <= to;
	});
	const [pitchLo, pitchHi] = getLayerPitchRangeCached(
		song,
		layer,
		windowNotes,
		Math.floor(d.step / windowSteps),
		notes,
	);
	const pitchRange = Math.max(1, pitchHi - pitchLo);
	const rollH = rect.h * 1.1;
	const noteH = Math.max(2.5, (rollH / (pitchRange + 1)) * 0.85);
	const pitchToY = (pitch: number) =>
		((pitch - pitchLo) / pitchRange - 0.5) * rollH;

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

	// 中心合わせで絞ったのと同じ窓なので、そのまま流用する（sortで書き換わるため複製する）。
	const filteredNotes = [...windowNotes];

	// 画家のアルゴリズム: 奥のレーンから描く
	filteredNotes.sort(
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

	for (const n of filteredNotes) {
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

	const rawNotes = notesForLayer(d, layer);
	// 中心合わせは「いま輪に映っている窓」の音符から（曲全体だと、いま鳴っている
	// 場所と無関係な位置に中心が固定されるズレになる）。
	const notes = rawNotes.filter((n) => {
		const end = n.startStep + n.durationSteps;
		return end >= from && n.startStep <= to;
	});
	const [pitchLo, pitchHi] = getLayerPitchRangeCached(
		song,
		layer,
		notes,
		Math.floor(d.step / windowSteps),
		rawNotes,
	);
	const pitchRange = Math.max(1, pitchHi - pitchLo);
	const sweep = ring.sweep * DEG;
	const rot = ring.rotate * DEG;
	const laneAngle = sweep / (pitchRange + 1);

	ctx.save();
	for (const n of notes) {
		const a0 = rot + (n.pitch - pitchLo) * laneAngle;
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
	const [pitchLo, pitchHi] = getLayerPitchRangeCached(song, layer, notes);
	const levels = new Array<number>(count).fill(0);
	const range = Math.max(1, pitchHi - pitchLo);

	for (const n of notes) {
		if (n.startStep > d.step || n.startStep + n.durationSteps <= d.step)
			continue;
		const band = Math.min(
			count - 1,
			Math.max(0, Math.floor(((n.pitch - pitchLo) / range) * count)),
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

/**
 * #rgb / #rrggbb / rgb() を alpha 付き rgba() へ。解釈できなければそのまま返す。
 *
 * `color` が未指定・空文字（`fx.color ?? "#000000"` のような `??` フォールバックは
 * `null`/`undefined` にしか効かず、空文字はすり抜ける——呼び出し側は `||` に
 * 直した）のときは**白を返さない**。
 * 以前は `rgba(255,255,255,${a})` を返していたため、呼び出し側が色を解決できずに
 * 空文字を渡すと、意図せず白（しかも指定した `alpha` で不透明に）で塗られてしまう
 * ——ビネットなど画面全体を覆うエフェクトでこれが起きると全画面が白くなる。
 * 色が解決できないなら「何も描かない」が唯一安全な既定なので、常に透明を返す。
 */
export function withAlpha(color: string, alpha: number): string {
	const a = clamp01(alpha);
	if (!color) return `rgba(0,0,0,0)`;
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
