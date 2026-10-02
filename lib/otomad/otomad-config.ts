// 音MAD（otomad）の型定義。設計: docs/otomad-feature-design.md
//
// MV（lib/mv/mv-config.ts）・かけあい動画（lib/talk/talk-config.ts）とは別の投稿種別。
// 時間軸は MV と同じく MML（@onjmin/dtm）から導く。素材（動画・音声・画像）はこの manifest に
// 実体を持たず、ローカル（IndexedDB の Blob、`local.hash` で引く）か http(s) の URL で参照する。
// 投稿できるのは全素材が URL のときだけ（otomadPostability）。

import type { MvAssetRef } from "@/lib/mv/mv-config";

export const OTOMAD_W = 640;
export const OTOMAD_H = 360;

/** コマ取りの fps（書き出しの fps でもある）。 */
export const OTOMAD_FRAME_FPS = 30;
/** コマキャッシュの長辺（px）。素材が大きくてもここまで縮める。 */
export const OTOMAD_FRAME_MAX = 640;
/** コマキャッシュの総コマ数の目安。超えたら fps を半分に落として取り直す。 */
export const OTOMAD_FRAME_BUDGET = 1800;
/** manifest（JSON、gzip 前）の投稿上限の目安。uploader の `otomad` 種別は gzip 後 512KB。 */
export const OTOMAD_MANIFEST_SOFT_LIMIT = 400 * 1024;

export type OtomadSourceKind = "video" | "audio" | "image";

/** ローカルファイルの識別子。実体は IndexedDB（lib/otomad/otomad-media.ts）。 */
export interface OtomadLocalFile {
	name: string;
	size: number;
	type: string;
	/** 内容のハッシュ（先頭 1MB・末尾 1MB・サイズから）。選び直せば同じ値になる。 */
	hash: string;
}

export interface OtomadSource {
	id: string;
	/** 表示名（ファイル名）。exo 書き出しの file 名にもなる。 */
	name: string;
	kind: OtomadSourceKind;
	/** http(s)。投稿にはこれが必須（Cloudinary 等の別ホスティング）。 */
	url?: string;
	/** ローカルファイル。url と両方あるときは url を優先する。 */
	local?: OtomadLocalFile;
	/** 読み込んで分かった長さ（秒）。キャッシュであって真実ではない。 */
	durationSec?: number;
	/** 使い始め（秒）。 */
	inSec: number;
	/** 使い終わり（秒）。省略＝末尾まで（音は音符の長さで切られる）。 */
	outSec?: number;
	/** 素材の音高（MIDI ノート番号、小数可）。音程合わせの基準。未設定なら音程を変えない。 */
	baseNote?: number;
	/** 素材ごとの音量補正（dB）。 */
	gainDb: number;
	/** 映像の切り出し矩形（素材画素）[sx, sy, sw, sh]。省略＝全体。 */
	crop?: [number, number, number, number];
	/**
	 * クロマキー。実写の素材は抜けないので窓が四角になるが、グリーンバック等で撮った素材はこれで抜いて
	 * 切り抜きの形で出せる。コマ取りのときに色を透明にする（素材画素で判定）。
	 */
	chromaKey?: { color: string; tolerance: number };
}

export interface OtomadStage {
	bgColor: string;
	/** 背景画像（MV と同じ参照形式）。 */
	bg?: MvAssetRef;
	/** 0〜1。背景を暗くする。 */
	bgDim: number;
	/**
	 * 画面全体の CSS フィルタ（canvas の ctx.filter）。場面ごとに雰囲気を変える用。
	 * 例: "invert(1) grayscale(1)"（白黒反転の線画風）、"hue-rotate(180deg)"、"sepia(1)"。
	 */
	filter?: string;
}

/** 窓の形。rect 以外はその形で切り抜く（縁取りも同じ形）。 */
export type OtomadWindowShape = "rect" | "circle" | "hexagon" | "diamond";
export const OTOMAD_WINDOW_SHAPES: ReadonlyArray<{ value: OtomadWindowShape; label: string }> = [
	{ value: "rect", label: "四角" },
	{ value: "circle", label: "丸" },
	{ value: "hexagon", label: "六角形" },
	{ value: "diamond", label: "ひし形" },
];
/** 鏡像の複製。窓を画面の中心線で折り返した位置にもう 1 つ描く（左右対称の配置を 1 つの設定で）。 */
export type OtomadMirror = "none" | "horizontal" | "vertical" | "quad";

export interface OtomadBacking {
	/** kind: audio か video（音だけ使う）。 */
	sourceId: string;
	/** 曲の 0 秒時点で原曲が何秒にいるか。負なら |offset| 秒後に原曲が鳴り出す。 */
	offsetSec: number;
	/** 0〜100。 */
	volume: number;
}

export interface OtomadKeymapEntry {
	fromNote: number;
	toNote: number;
	sourceId: string;
	inSec?: number;
	outSec?: number;
}

export type OtomadPitchMode = "follow" | "fixed";
export type OtomadLengthMode = "note" | "sample";

export interface OtomadTrackAudio {
	/** 単一素材。keymap があればそちらが優先。 */
	sourceId?: string;
	/** 音高の範囲ごとに素材を分ける（ドラム素材用）。 */
	keymap?: OtomadKeymapEntry[];
	/** 音程合わせする / 素材そのまま。 */
	pitch: OtomadPitchMode;
	/**
	 * 音符を素材の音高の ±6 半音に畳む（オクターブ移動）。音域の広い旋律を 1 つの素材で歌わせるとき、
	 * 再生速度方式の破綻（±8 半音超）を避ける。旋律の輪郭はオクターブの境で折れる。
	 */
	foldOctaves?: boolean;
	/** 音符の長さで切る / 素材の区間ぶん鳴らす。 */
	length: OtomadLengthMode;
	attackMs: number;
	releaseMs: number;
	/** 子音の頭合わせ（ms）。負で早出し。 */
	nudgeMs: number;
	gainDb: number;
	/** -1〜1。 */
	pan: number;
	/** MML の v を音量に反映する。 */
	velocityToGain: boolean;
}

/**
 * 窓の選び方。voice＝同時に鳴る音（和音）を低い順に声部とみなし、声部ごとに同じ窓へ固定する
 * （コードの構成音を横・縦・正方形に並べる用。「変わった声部だけ反転」は flipMode: changed と組む）。
 */
export type OtomadSlotPick = "cycle" | "pitch" | "random" | "velocity" | "voice";
/** 左右反転の方式。alternate＝奇数番目の音、changed＝その窓の音が前と変わったときに反転を切り替える、none＝しない。 */
export type OtomadFlipMode = "alternate" | "changed" | "none";
/** 窓の並べ方（生成用）。hexgrid＝1 行おきに半分ずらした蜂の巣、tile＝画面いっぱいに敷き詰め。 */
export type OtomadSlotLayout = "row" | "column" | "grid" | "circle" | "hexgrid" | "tile";
/**
 * 音の頭の演出（1 拍で戻る）。講座の定番に対応: zoom＝拡大（主旋律・キック）、bounce＝下を支点に
 * 縦に跳ねて減衰（スネアの「プルン」・立ち絵）、shake＝横に震える（ハット）、flash＝一瞬光る
 * （ハット・シンバル）、spin＝1 回転（アルペジオ・効果音）、slide＝横から滑り込む（ベース）。
 */
export type OtomadHitStyle = "zoom" | "bounce" | "shake" | "flash" | "spin" | "slide";
export const OTOMAD_HIT_STYLES: ReadonlyArray<{ value: OtomadHitStyle; label: string }> = [
	{ value: "zoom", label: "拡大（主旋律・キック）" },
	{ value: "bounce", label: "跳ねる（スネア・立ち絵）" },
	{ value: "shake", label: "横に震える（ハット）" },
	{ value: "flash", label: "一瞬光る（ハット・シンバル）" },
	{ value: "spin", label: "1 回転（アルペジオ・効果音）" },
	{ value: "slide", label: "横から滑り込む（ベース）" },
];
/** 窓への収め方。cover＝窓を埋めて端を切る（動画向け）、contain＝全体を収める（透過のドット絵向け）。 */
export type OtomadFit = "cover" | "contain";
export type OtomadShow = "note" | "untilNext" | "hold";

export interface OtomadSlot {
	/** 中心（論理座標）。 */
	x: number;
	y: number;
	w: number;
	h: number;
	/** 度。 */
	rotate?: number;
}

export interface OtomadTrackVisual {
	kind: "window" | "none";
	/** 窓の位置。複数なら pick で選ぶ。 */
	slots: OtomadSlot[];
	pick: OtomadSlotPick;
	/** 鳴っている間 / 次の音まで / 出しっぱなし。 */
	show: OtomadShow;
	/** 窓への収め方。既定 cover。 */
	fit?: OtomadFit;
	/** 偶数番目の音で左右反転（定番）。flipMode が無い古いデータ用。 */
	flipAlternate: boolean;
	/** 反転の方式。省略時は flipAlternate ? "alternate" : "none"。 */
	flipMode?: OtomadFlipMode;
	/** 音の頭の拡大を「その窓の音が前と変わったとき」だけ掛ける（和音で変わらない声部は動かさない）。 */
	hitOnlyChanged?: boolean;
	/** 音の頭で拡大（1.0〜1.5）。1 拍で戻す。hitStyle が zoom 以外でも強さ（hitZoom−1）として使う。 */
	hitZoom: number;
	/** 音の頭の演出。既定 zoom。 */
	hitStyle?: OtomadHitStyle;
	/** MML の v を不透明度に反映する（弱い音は薄く）。 */
	velocityToOpacity?: boolean;
	/** 窓の縁取り（矩形）。実写の四角い窓に縁を付ける定番。 */
	frame?: { color: string; width: number };
	/** 全部の窓を重心のまわりに回す（度/拍）。円形配置のアルペジオ用。 */
	orbitDegPerBeat?: number;
	/** 窓の形。既定 rect。 */
	shape?: OtomadWindowShape;
	/** 鏡像の複製。既定 none。 */
	mirror?: OtomadMirror;
	/** 拍ごとに全窓が脈打つ量（0〜0.5。拍の頭で大きく、拍の中で戻る）。 */
	beatPulse?: number;
	/** 全窓を流す速さ（px/拍）。画面端で折り返す（敷き詰めた窓の背景スクロール）。 */
	scrollPerBeat?: { x: number; y: number };
	/** 音程で縦位置を変える（半音あたり px、0 で無効）。 */
	pitchY: number;
	/** 音符の長さに合わせて映像の再生速度を変える。 */
	stretch: boolean;
	z: number;
	/** 0〜1。 */
	opacity: number;
}

export interface OtomadTrack {
	/** MML の @n。 */
	track: number;
	label?: string;
	muted?: boolean;
	audio: OtomadTrackAudio;
	visual: OtomadTrackVisual;
}

export type OtomadTransitionStyle = "cut" | "fade" | "flash" | "wipeLeft" | "wipeRight" | "wipeUp" | "wipeDown";
export const OTOMAD_TRANSITIONS: ReadonlyArray<{ value: OtomadTransitionStyle; label: string }> = [
	{ value: "cut", label: "カット" },
	{ value: "fade", label: "黒からフェード" },
	{ value: "flash", label: "白からフラッシュ" },
	{ value: "wipeLeft", label: "ワイプ（左へ）" },
	{ value: "wipeRight", label: "ワイプ（右へ）" },
	{ value: "wipeUp", label: "ワイプ（上へ）" },
	{ value: "wipeDown", label: "ワイプ（下へ）" },
];

/** 場面ごとのトラックの上書き。hidden ならこの場面では窓を出さない。visual は base にかぶせる。 */
export interface OtomadSceneTrack {
	hidden?: boolean;
	visual?: Partial<OtomadTrackVisual>;
}

/**
 * 場面（シーン）。曲のパートごとに画面の雰囲気を変える。MV の MvSection と同じ思想で、
 * 開始小節だけを持ち、次の場面の開始小節まで続く。最初の場面の前は manifest の base（stage / tracks）。
 */
export interface OtomadScene {
	id: string;
	name: string;
	/** 開始小節（0 始まり、小数可）。 */
	startBar: number;
	/** 背景の上書き。指定した項目だけ差し替える。bg を外すなら `bg: null`。 */
	stage?: Partial<Omit<OtomadStage, "bg">> & { bg?: MvAssetRef | null };
	transition?: { style: OtomadTransitionStyle; beats: number };
	/** manifest.tracks のインデックス（文字列）→ 上書き。 */
	tracks?: Record<string, OtomadSceneTrack>;
}

export interface OtomadManifest {
	version: 1;
	title: string;
	/** 素材の出典・原曲（投稿に出す）。 */
	credit?: string;
	/** 時間軸。dtm MML。 */
	mml: string;
	stage: OtomadStage;
	sources: OtomadSource[];
	tracks: OtomadTrack[];
	/** 場面。startBar 昇順。無ければ曲全体が base。 */
	scenes?: OtomadScene[];
	backing?: OtomadBacking;
	/** MML シンセのガイド音（書き出しに入れない）。 */
	guide: { enabled: boolean; volume: number };
	/** 曲頭の余白（秒、0〜2）。 */
	leadInSec: number;
}

// ── 既定値 ───────────────────────────────────────────────────

export const createDefaultTrackAudio = (sourceId?: string): OtomadTrackAudio => ({
	sourceId,
	pitch: "follow",
	length: "note",
	attackMs: 2,
	releaseMs: 20,
	nudgeMs: 0,
	gainDb: 0,
	pan: 0,
	velocityToGain: true,
});

export const createDefaultSlot = (): OtomadSlot => ({
	x: OTOMAD_W / 2,
	y: OTOMAD_H / 2,
	w: 320,
	h: 180,
});

export const createDefaultTrackVisual = (): OtomadTrackVisual => ({
	kind: "window",
	slots: [createDefaultSlot()],
	pick: "cycle",
	show: "untilNext",
	flipAlternate: true,
	hitZoom: 1.08,
	pitchY: 0,
	stretch: false,
	z: 0,
	opacity: 1,
});

export const createDefaultTrack = (track: number, sourceId?: string): OtomadTrack => ({
	track,
	audio: createDefaultTrackAudio(sourceId),
	visual: createDefaultTrackVisual(),
});

export const createDefaultStage = (): OtomadStage => ({
	bgColor: "#101014",
	bgDim: 0.35,
});

export const createDefaultSource = (
	partial: Pick<OtomadSource, "id" | "name" | "kind"> & Partial<OtomadSource>,
): OtomadSource => ({
	inSec: 0,
	gainDb: 0,
	...partial,
});

export const createEmptyOtomadManifest = (): OtomadManifest => ({
	version: 1,
	title: "",
	mml: "",
	stage: createDefaultStage(),
	sources: [],
	tracks: [],
	guide: { enabled: false, volume: 40 },
	leadInSec: 0,
});

// ── 参照の解決 ───────────────────────────────────────────────

export const otomadSourceOf = (
	manifest: OtomadManifest,
	id: string | undefined,
): OtomadSource | null => (id ? (manifest.sources.find((s) => s.id === id) ?? null) : null);

/** 素材が映像を持つか（窓に出せるか）。 */
export const sourceHasVisual = (s: OtomadSource): boolean => s.kind !== "audio";
/** 素材が音を持つか。 */
export const sourceHasAudio = (s: OtomadSource): boolean => s.kind !== "image";

/** 素材の表示に使う URL（ローカルは呼び出し側が Blob から作る）。 */
export const sourceIsLocal = (s: OtomadSource): boolean => !s.url && !!s.local;

/** 音符の音高にあてる素材と区間。keymap → 単一素材の順。 */
export const resolveNoteSource = (
	manifest: OtomadManifest,
	track: OtomadTrack,
	pitch: number,
): { source: OtomadSource; inSec: number; outSec: number | undefined } | null => {
	const km = track.audio.keymap;
	if (km && km.length > 0) {
		const hit = km.find((k) => pitch >= k.fromNote && pitch <= k.toNote);
		if (hit) {
			const src = otomadSourceOf(manifest, hit.sourceId);
			if (!src) return null;
			return { source: src, inSec: hit.inSec ?? src.inSec, outSec: hit.outSec ?? src.outSec };
		}
		return null;
	}
	const src = otomadSourceOf(manifest, track.audio.sourceId);
	if (!src) return null;
	return { source: src, inSec: src.inSec, outSec: src.outSec };
};

/** 音程合わせの再生速度。baseNote 未設定・pitch: fixed なら 1。 */
export const playbackRateFor = (track: OtomadTrack, source: OtomadSource, pitch: number): number => {
	if (track.audio.pitch !== "follow" || source.baseNote === undefined) return 1;
	let semis = pitch - source.baseNote;
	if (track.audio.foldOctaves) {
		while (semis > 6) semis -= 12;
		while (semis < -6) semis += 12;
	}
	return 2 ** (semis / 12);
};

/** MML からトラック（`@n`）を抜く。dtm の形式はヘッダと各トラックが `;` 区切り。原曲（off vocal）作成用。 */
export const stripMmlTracks = (mml: string, tracks: number[]): string => {
	if (tracks.length === 0) return mml;
	const drop = new Set(tracks);
	return mml
		.split(";")
		.filter((seg) => {
			const m = seg.match(/^\s*@(\d+)/);
			return !(m && drop.has(Number(m[1])));
		})
		.join(";");
};

export const dbToGain = (db: number): number => 10 ** (db / 20);

export const flipModeOf = (v: OtomadTrackVisual): OtomadFlipMode =>
	v.flipMode ?? (v.flipAlternate ? "alternate" : "none");

/**
 * 窓を並べて生成する。row＝横一列、column＝縦一列、grid＝正方形に近い格子、circle＝円周。
 * size は 1 窓の一辺（px）。center を中心に等間隔で置く。
 */
export const generateSlots = (
	layout: OtomadSlotLayout,
	count: number,
	size: number,
	center: { x: number; y: number } = { x: OTOMAD_W / 2, y: OTOMAD_H / 2 },
	gap = 8,
): OtomadSlot[] => {
	const n = Math.max(1, Math.min(64, Math.round(count)));
	const s = Math.max(8, Math.round(size));
	const step = s + gap;
	const out: OtomadSlot[] = [];
	if (layout === "tile") {
		// 画面いっぱいに敷き詰める（count は無視して埋まるだけ）。端も埋めるよう 1 周り余分に
		const cols = Math.ceil(OTOMAD_W / step) + 1;
		const rows = Math.ceil(OTOMAD_H / step) + 1;
		for (let r = 0; r < rows; r++)
			for (let c = 0; c < cols; c++) out.push({ x: Math.round(c * step), y: Math.round(r * step), w: s, h: s });
		return out.slice(0, 64);
	}
	if (layout === "hexgrid") {
		// 蜂の巣: 1 行おきに半分ずらし、行間は 0.87 倍
		const cols = Math.ceil(Math.sqrt(n));
		const rows = Math.ceil(n / cols);
		for (let i = 0; i < n; i++) {
			const c = i % cols;
			const r = Math.floor(i / cols);
			out.push({
				x: Math.round(center.x + (c - (cols - 1) / 2) * step + (r % 2 ? step / 2 : 0)),
				y: Math.round(center.y + (r - (rows - 1) / 2) * step * 0.87),
				w: s,
				h: s,
			});
		}
		return out;
	}
	if (layout === "row") {
		for (let i = 0; i < n; i++) out.push({ x: Math.round(center.x + (i - (n - 1) / 2) * step), y: Math.round(center.y), w: s, h: s });
	} else if (layout === "column") {
		for (let i = 0; i < n; i++) out.push({ x: Math.round(center.x), y: Math.round(center.y + (i - (n - 1) / 2) * step), w: s, h: s });
	} else if (layout === "grid") {
		const cols = Math.ceil(Math.sqrt(n));
		const rows = Math.ceil(n / cols);
		for (let i = 0; i < n; i++) {
			const c = i % cols;
			const r = Math.floor(i / cols);
			out.push({
				x: Math.round(center.x + (c - (cols - 1) / 2) * step),
				y: Math.round(center.y + (r - (rows - 1) / 2) * step),
				w: s,
				h: s,
			});
		}
	} else {
		const radius = n <= 1 ? 0 : Math.max(s * 0.75, (step * n) / (2 * Math.PI));
		for (let i = 0; i < n; i++) {
			const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
			out.push({ x: Math.round(center.x + Math.cos(a) * radius), y: Math.round(center.y + Math.sin(a) * radius), w: s, h: s });
		}
	}
	return out;
};

// ── 投稿可否 ─────────────────────────────────────────────────

export interface OtomadPostability {
	ok: boolean;
	/** ローカルのまま（URL が無い）素材。 */
	localSources: OtomadSource[];
	/** manifest の JSON サイズ（バイト、gzip 前）。 */
	bytes: number;
	tooLarge: boolean;
	noMml: boolean;
	reasons: string[];
}

/** 投稿できるか。素材が全部 URL で、manifest が十分小さいとき。 */
export const otomadPostability = (manifest: OtomadManifest): OtomadPostability => {
	const localSources = manifest.sources.filter(sourceIsLocal);
	const json = JSON.stringify(manifest);
	const bytes = new TextEncoder().encode(json).length;
	const tooLarge = bytes > OTOMAD_MANIFEST_SOFT_LIMIT;
	const noMml = manifest.mml.trim() === "";
	const reasons: string[] = [];
	if (localSources.length > 0)
		reasons.push(
			`ローカル素材が ${localSources.length} 件あります（Cloudinary 等に置いて URL に差し替えると投稿できます）`,
		);
	if (tooLarge) reasons.push(`データが大きすぎます（${Math.round(bytes / 1024)} KB）`);
	if (noMml) reasons.push("曲（MML）がありません");
	return { ok: reasons.length === 0, localSources, bytes, tooLarge, noMml, reasons };
};

// ── 場面 ─────────────────────────────────────────────────────

/** startBar 昇順に並べた場面。 */
export const sortedScenes = (manifest: OtomadManifest): OtomadScene[] =>
	[...(manifest.scenes ?? [])].sort((a, b) => a.startBar - b.startBar);

/** 小節 bar にかかる場面のインデックス（sortedScenes 基準）。無ければ -1（base）。 */
export const sceneIndexAtBar = (scenes: OtomadScene[], bar: number): number => {
	let idx = -1;
	for (let i = 0; i < scenes.length; i++) {
		if (scenes[i].startBar <= bar + 1e-9) idx = i;
		else break;
	}
	return idx;
};

/** 場面を反映したトラックの見た目。hidden なら kind: none。 */
export const effectiveVisual = (track: OtomadTrack, scene: OtomadScene | null, trackIdx: number): OtomadTrackVisual => {
	const o = scene?.tracks?.[String(trackIdx)];
	if (!o) return track.visual;
	if (o.hidden) return { ...track.visual, kind: "none" };
	if (!o.visual) return track.visual;
	const merged: OtomadTrackVisual = { ...track.visual, ...o.visual };
	if (!merged.slots || merged.slots.length === 0) merged.slots = track.visual.slots;
	return merged;
};

/** 場面を反映した背景。 */
export const effectiveStage = (base: OtomadStage, scene: OtomadScene | null): OtomadStage => {
	if (!scene?.stage) return base;
	const { bg, ...rest } = scene.stage;
	const out: OtomadStage = { ...base, ...rest };
	if (bg === null) out.bg = undefined;
	else if (bg) out.bg = bg;
	return out;
};

/** 音を出す（ミュートでなく素材を持つ）トラックの MML 番号。原曲から抜く既定。 */
export const audibleMmlTracks = (manifest: OtomadManifest): number[] => [
	...new Set(
		manifest.tracks
			.filter((t) => !t.muted && (t.audio.sourceId || (t.audio.keymap && t.audio.keymap.length > 0)))
			.map((t) => t.track),
	),
];

/** #rrggbb → [r,g,b]。読めなければ null。 */
export const parseHexColor = (hex: string): [number, number, number] | null => {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const n = Number.parseInt(m[1], 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** 投稿カードのサムネに使える URL（背景画像か最初の画像素材）。無ければ null。 */
export const otomadBgUrlOf = (manifest: OtomadManifest): string | null => {
	const bg = manifest.stage.bg?.url;
	if (bg && /^https?:\/\//.test(bg)) return bg;
	const img = manifest.sources.find((s) => s.kind === "image" && s.url && /^https?:\/\//.test(s.url));
	return img?.url ?? null;
};

/** 古い保存データを現在の形に整える（欠けた項目に既定値を入れる）。 */
export const normalizeOtomadManifest = (raw: unknown): OtomadManifest => {
	const m = (raw && typeof raw === "object" ? raw : {}) as Partial<OtomadManifest>;
	const base = createEmptyOtomadManifest();
	const sources = Array.isArray(m.sources)
		? m.sources.map((s) => createDefaultSource({ ...s, id: s.id, name: s.name ?? "", kind: s.kind ?? "video" }))
		: [];
	const tracks = Array.isArray(m.tracks)
		? m.tracks.map((t) => ({
				...createDefaultTrack(t.track ?? 0),
				...t,
				audio: { ...createDefaultTrackAudio(), ...(t.audio ?? {}) },
				visual: {
					...createDefaultTrackVisual(),
					...(t.visual ?? {}),
					slots:
						Array.isArray(t.visual?.slots) && t.visual.slots.length > 0
							? t.visual.slots
							: [createDefaultSlot()],
				},
			}))
		: [];
	return {
		...base,
		...m,
		version: 1,
		title: m.title ?? "",
		mml: m.mml ?? "",
		stage: { ...createDefaultStage(), ...(m.stage ?? {}) },
		sources,
		tracks,
		scenes: Array.isArray(m.scenes) ? m.scenes.filter((sc) => sc && typeof sc.startBar === "number") : undefined,
		guide: { ...base.guide, ...(m.guide ?? {}) },
		leadInSec: typeof m.leadInSec === "number" ? m.leadInSec : 0,
	};
};
