// 音MAD の「型」（スタイルプリセット）。設計: docs/otomad-feature-design.md §10、カタログ: docs/otomad-visual-catalog.md
//
// 画面構成の型はデータで持ち、トラックの「役割」（主旋律・低音・和音…）ごとに窓の配置と演出を一括で当てる。
// 型を増やすときはここに 1 件足すだけ。配置は 640×360 の論理座標。素材の割り当て（audio）には触らない。

import {
	createDefaultTrackVisual,
	generateSlots,
	OTOMAD_H,
	OTOMAD_W,
	type OtomadManifest,
	type OtomadSlot,
	type OtomadTrack,
	type OtomadTrackVisual,
} from "./otomad-config";
import type { MvSong } from "@/lib/mv/mv-engine";

/** トラックの役割。型はこれを見て窓を割り当てる。 */
export type OtomadRole = "lead" | "harmony" | "bass" | "chord" | "arpeggio" | "kick" | "snare" | "hat" | "sfx" | "other";
export const OTOMAD_ROLES: ReadonlyArray<{ value: OtomadRole; label: string }> = [
	{ value: "lead", label: "主旋律" },
	{ value: "harmony", label: "ハモリ" },
	{ value: "bass", label: "低音" },
	{ value: "chord", label: "和音" },
	{ value: "arpeggio", label: "アルペジオ・刻み" },
	{ value: "kick", label: "キック" },
	{ value: "snare", label: "スネア" },
	{ value: "hat", label: "ハイハット" },
	{ value: "sfx", label: "効果音" },
	{ value: "other", label: "その他" },
];

export interface OtomadStyle {
	id: string;
	name: string;
	/** 由来・見た目の説明（カタログの型名）。 */
	description: string;
	bgColor?: string;
	/** 役割ごとの見た目。無い役割は hidden。 */
	build: (ctx: { maxPolyphony: (role: OtomadRole) => number }) => Partial<Record<OtomadRole, Partial<OtomadTrackVisual> | "hidden">>;
}

const W = OTOMAD_W;
const H = OTOMAD_H;
const slot = (x: number, y: number, w: number, h = w): OtomadSlot => ({ x, y, w, h });
const win = (over: Partial<OtomadTrackVisual>): Partial<OtomadTrackVisual> => ({ kind: "window", ...over });
const corners = (s: number): OtomadSlot[] => [slot(s / 2 + 10, s / 2 + 10, s), slot(W - s / 2 - 10, s / 2 + 10, s), slot(s / 2 + 10, H - s / 2 - 10, s), slot(W - s / 2 - 10, H - s / 2 - 10, s)];

export const OTOMAD_STYLES: OtomadStyle[] = [
	{
		id: "center",
		name: "センター型（標準）",
		description: "中央＝主旋律、左右交互＝低音、上段横一列＝和音、四隅＝打楽器。講座の定番配置。",
		bgColor: "#101014",
		build: ({ maxPolyphony }) => ({
			lead: win({ slots: [slot(W / 2, 170, 260)], flipMode: "alternate", hitStyle: "zoom", hitZoom: 1.14, pitchY: 3, z: 2 }),
			harmony: win({ slots: [slot(W - 80, 60, 90)], show: "note", hitStyle: "flash", hitZoom: 1.2, z: 3 }),
			bass: win({ slots: [slot(70, 250, 120), slot(W - 70, 250, 120)], pick: "cycle", show: "note", hitStyle: "slide", hitZoom: 1.2, z: 1 }),
			chord: win({ slots: generateSlots("row", Math.max(3, maxPolyphony("chord")), 80, { x: W / 2, y: 60 }), pick: "voice", flipMode: "changed", hitOnlyChanged: true, hitStyle: "bounce", hitZoom: 1.2, velocityToOpacity: true }),
			arpeggio: win({ slots: generateSlots("circle", Math.max(4, maxPolyphony("arpeggio")), 60, { x: W / 2, y: 300 }), pick: "cycle", show: "note", hitStyle: "spin", orbitDegPerBeat: 10 }),
			kick: win({ slots: [slot(60, 60, 90), slot(60, 330, 90)], pick: "cycle", show: "note", hitStyle: "zoom", hitZoom: 1.4, flipMode: "none" }),
			snare: win({ slots: [slot(W / 2, 330, 90)], show: "note", hitStyle: "bounce", hitZoom: 1.3, flipMode: "none" }),
			hat: win({ slots: [slot(W - 60, 330, 80), slot(W - 60, 240, 80)], pick: "cycle", show: "note", hitStyle: "shake", hitZoom: 1.2, flipMode: "none" }),
			sfx: win({ slots: generateSlots("row", 3, 90, { x: W / 2, y: H / 2 }), pick: "cycle", show: "note", hitStyle: "spin", hitZoom: 1.3 }),
		}),
	},
	{
		id: "redzone",
		name: "RED ZONE 型（左右二分割）",
		description: "同じ素材の主旋律と低音を左右に二分割。赤基調の背景。打楽器は背景側で光る。",
		bgColor: "#3a0a0a",
		build: () => ({
			lead: win({ slots: [slot(W / 4, H / 2, W / 2, H)], flipMode: "alternate", hitStyle: "zoom", hitZoom: 1.08, fit: "cover", frame: { color: "#ff3b3b", width: 4 } }),
			bass: win({ slots: [slot((W * 3) / 4, H / 2, W / 2, H)], flipMode: "alternate", hitStyle: "zoom", hitZoom: 1.08, fit: "cover", frame: { color: "#ff3b3b", width: 4 } }),
			kick: win({ slots: [slot(W / 2, H / 2, 120)], show: "note", hitStyle: "flash", hitZoom: 1.3, flipMode: "none", z: 5, shape: "circle" }),
			snare: win({ slots: [slot(W / 2, H / 2, 90)], show: "note", hitStyle: "spin", hitZoom: 1.3, flipMode: "none", z: 5, shape: "diamond" }),
			hat: "hidden",
			chord: "hidden",
			harmony: "hidden",
			arpeggio: "hidden",
			sfx: win({ slots: [slot(W / 2, 60, 80)], show: "note", hitStyle: "spin", z: 5 }),
		}),
	},
	{
		id: "shibamata",
		name: "柴又型（中央＋縁の小窓）",
		description: "背景の上に中央の大きな窓（主旋律、音符ごとに反転）、左右に交互に現れる窓（低音）、四隅の小窓（打楽器）。",
		bgColor: "#0b0b10",
		build: ({ maxPolyphony }) => ({
			lead: win({ slots: [slot(W / 2, H / 2, 360, 220)], flipMode: "alternate", hitStyle: "zoom", hitZoom: 1.06, fit: "cover", frame: { color: "#ffffff", width: 3 }, z: 2 }),
			bass: win({ slots: [slot(70, H / 2, 130, 180), slot(W - 70, H / 2, 130, 180)], pick: "cycle", show: "note", hitStyle: "slide", flipMode: "alternate", z: 1 }),
			harmony: win({ slots: [slot(W / 2, 40, 120, 70)], show: "note", hitStyle: "flash", z: 3 }),
			chord: win({ slots: generateSlots("row", Math.max(3, maxPolyphony("chord")), 70, { x: W / 2, y: H - 40 }), pick: "voice", flipMode: "changed", hitOnlyChanged: true, hitStyle: "bounce", z: 1 }),
			kick: win({ slots: [corners(80)[0], corners(80)[2]], pick: "cycle", show: "note", hitStyle: "zoom", hitZoom: 1.3, flipMode: "none", z: 3 }),
			snare: win({ slots: [corners(80)[1]], show: "note", hitStyle: "bounce", hitZoom: 1.3, flipMode: "none", z: 3 }),
			hat: win({ slots: [corners(80)[3]], show: "note", hitStyle: "shake", hitZoom: 1.2, flipMode: "none", z: 3 }),
			arpeggio: win({ slots: generateSlots("row", 4, 50, { x: W / 2, y: H - 100 }), pick: "cycle", show: "note", hitStyle: "spin" }),
			sfx: win({ slots: [slot(W / 2, H / 2, 160)], show: "note", hitStyle: "spin", z: 4 }),
		}),
	},
	{
		id: "fullscreen",
		name: "全画面 1 素材型",
		description: "主旋律の素材を全画面で流し、音符ごとにカットと反転だけ。他のパートは出さない（WMM 時代の原型）。",
		bgColor: "#000000",
		build: () => ({
			lead: win({ slots: [slot(W / 2, H / 2, W, H)], flipMode: "alternate", hitStyle: "zoom", hitZoom: 1.0, fit: "cover", show: "untilNext" }),
			harmony: "hidden", bass: "hidden", chord: "hidden", arpeggio: "hidden", kick: "hidden", snare: "hidden", hat: "hidden", sfx: "hidden",
		}),
	},
	{
		id: "boxvisual",
		name: "BoxVisual 型（格子に 1 パート 1 箱）",
		description: "全パートを均等な格子に並べ、鳴っている箱だけ光って拡大する。何の素材がどの音かを見せる解説用の型。",
		bgColor: "#111111",
		build: () => {
			const g = generateSlots("grid", 9, 110, { x: W / 2, y: H / 2 }, 10);
			const box = (i: number, hs: OtomadTrackVisual["hitStyle"]): Partial<OtomadTrackVisual> =>
				win({ slots: [g[i]], show: "hold", hitStyle: hs, hitZoom: 1.15, flipMode: "alternate", frame: { color: "#444444", width: 2 }, fit: "cover" });
			return {
				lead: box(4, "zoom"), harmony: box(1, "flash"), chord: box(0, "bounce"), arpeggio: box(2, "spin"),
				bass: box(7, "slide"), kick: box(3, "zoom"), snare: box(5, "bounce"), hat: box(6, "shake"), sfx: box(8, "spin"),
			};
		},
	},
	{
		id: "split4",
		name: "画面分割型（4 分割の同一素材）",
		description: "画面を 4 つに割り、和音の構成音を 1 マスずつに。主旋律は中央に重ねる。16 分割は「窓を並べる」で増やす。",
		bgColor: "#000000",
		build: () => ({
			chord: win({ slots: [slot(W / 4, H / 4, W / 2, H / 2), slot((W * 3) / 4, H / 4, W / 2, H / 2), slot(W / 4, (H * 3) / 4, W / 2, H / 2), slot((W * 3) / 4, (H * 3) / 4, W / 2, H / 2)], pick: "voice", flipMode: "changed", hitOnlyChanged: true, hitStyle: "zoom", hitZoom: 1.05, fit: "cover", frame: { color: "#ffffff", width: 2 } }),
			lead: win({ slots: [slot(W / 2, H / 2, 200)], flipMode: "alternate", hitStyle: "zoom", hitZoom: 1.15, z: 3, frame: { color: "#ffffff", width: 3 } }),
			bass: win({ slots: [slot(W / 2, H - 50, 90)], show: "note", hitStyle: "slide", z: 3 }),
			kick: win({ slots: [slot(W / 2, 50, 70)], show: "note", hitStyle: "zoom", hitZoom: 1.4, z: 3, flipMode: "none" }),
			snare: "hidden", hat: "hidden", harmony: "hidden", arpeggio: "hidden", sfx: "hidden",
		}),
	},
	{
		id: "mirror",
		name: "三面鏡型（鏡像）",
		description: "中央の主旋律を左右・上下に鏡像で複製し、和音を鏡像のペアで出す（andesite.mp4 の左右ペア）。",
		bgColor: "#0e1a16",
		build: ({ maxPolyphony }) => ({
			lead: win({ slots: [slot(W / 2, H / 2, 220)], flipMode: "alternate", hitStyle: "zoom", hitZoom: 1.12, z: 3 }),
			chord: win({ slots: generateSlots("column", Math.max(2, Math.ceil(maxPolyphony("chord") / 2)), 90, { x: 110, y: H / 2 }), pick: "voice", mirror: "horizontal", flipMode: "changed", hitOnlyChanged: true, hitStyle: "bounce", show: "note" }),
			bass: win({ slots: [slot(W / 2, H - 50, 80)], mirror: "vertical", show: "note", hitStyle: "slide", flipMode: "alternate" }),
			kick: win({ slots: [slot(60, 50, 70)], mirror: "quad", show: "note", hitStyle: "zoom", hitZoom: 1.4, flipMode: "none" }),
			snare: win({ slots: [slot(W / 2, 40, 60)], show: "note", hitStyle: "bounce", flipMode: "none" }),
			hat: win({ slots: [slot(W / 2, H - 20, 40)], show: "note", hitStyle: "shake", flipMode: "none" }),
			harmony: win({ slots: [slot(W / 2, 110, 70)], show: "note", hitStyle: "flash" }),
			arpeggio: "hidden", sfx: "hidden",
		}),
	},
	{
		id: "hexcluster",
		name: "六角形クラスタ型（LAB=01☆ 風）",
		description: "中央に六角形の蜂の巣（和音の声部）、画面端に巨大な主旋律を左右対称、低音は下の六角形。暗い背景。",
		bgColor: "#1a1030",
		build: ({ maxPolyphony }) => ({
			chord: win({ slots: generateSlots("hexgrid", Math.max(4, maxPolyphony("chord")), 96, { x: W / 2, y: H / 2 }, 6), shape: "hexagon", frame: { color: "#ffd166", width: 3 }, pick: "voice", flipMode: "changed", hitOnlyChanged: true, hitStyle: "bounce", z: 2 }),
			lead: win({ slots: [slot(40, 200, 300)], mirror: "horizontal", flipMode: "alternate", hitStyle: "zoom", hitZoom: 1.08, z: 1 }),
			bass: win({ slots: [slot(W / 2, H - 40, 70)], shape: "hexagon", show: "note", hitStyle: "slide", frame: { color: "#ffd166", width: 2 }, z: 3 }),
			harmony: win({ slots: [slot(W / 2, 40, 70)], shape: "hexagon", show: "note", hitStyle: "flash", z: 3 }),
			kick: win({ slots: [slot(70, H - 50, 60)], mirror: "horizontal", shape: "hexagon", show: "note", hitStyle: "zoom", hitZoom: 1.4, flipMode: "none", z: 3 }),
			snare: win({ slots: [slot(70, 50, 60)], mirror: "horizontal", shape: "hexagon", show: "note", hitStyle: "bounce", flipMode: "none", z: 3 }),
			hat: "hidden",
			arpeggio: win({ slots: generateSlots("circle", 6, 50, { x: W / 2, y: H / 2 }), pick: "cycle", show: "note", hitStyle: "spin", orbitDegPerBeat: 15, z: 4 }),
			sfx: "hidden",
		}),
	},
	{
		id: "orbit",
		name: "アルペジオ円形回転型",
		description: "和音・アルペジオを円周に置いて回し、中央に主旋律。打楽器は円の外で光る。",
		bgColor: "#0a0f1e",
		build: ({ maxPolyphony }) => ({
			lead: win({ slots: [slot(W / 2, H / 2, 160)], shape: "circle", flipMode: "alternate", hitStyle: "zoom", hitZoom: 1.15, z: 3 }),
			arpeggio: win({ slots: generateSlots("circle", Math.max(6, maxPolyphony("arpeggio")), 64, { x: W / 2, y: H / 2 }), pick: "cycle", show: "note", hitStyle: "spin", orbitDegPerBeat: 20, shape: "circle" }),
			chord: win({ slots: generateSlots("circle", Math.max(4, maxPolyphony("chord")), 64, { x: W / 2, y: H / 2 }), pick: "voice", flipMode: "changed", hitOnlyChanged: true, hitStyle: "bounce", orbitDegPerBeat: -8, shape: "circle" }),
			bass: win({ slots: [slot(W / 2, H - 40, 70)], show: "note", hitStyle: "slide" }),
			kick: win({ slots: [slot(60, 60, 70)], mirror: "quad", show: "note", hitStyle: "flash", flipMode: "none" }),
			snare: "hidden", hat: "hidden", harmony: "hidden", sfx: "hidden",
		}),
	},
	{
		id: "tilepulse",
		name: "敷き詰め脈動型（BoxVisual の地）",
		description: "刻みの素材を画面いっぱいに敷き詰めて拍で脈打たせ、流す。その上に主旋律を大きく。",
		bgColor: "#3a0d1a",
		build: () => ({
			hat: win({ slots: generateSlots("tile", 64, 44, undefined, 6), pick: "cycle", show: "hold", hitStyle: "zoom", hitZoom: 1.0, beatPulse: 0.25, scrollPerBeat: { x: 12, y: 0 }, opacity: 0.35, z: -5, flipMode: "none" }),
			lead: win({ slots: [slot(W / 2, H / 2, 320)], flipMode: "alternate", hitStyle: "zoom", hitZoom: 1.18, frame: { color: "#ffffff", width: 4 }, z: 2 }),
			chord: win({ slots: generateSlots("row", 4, 70, { x: W / 2, y: 50 }), pick: "voice", shape: "diamond", flipMode: "changed", hitOnlyChanged: true, hitStyle: "bounce", z: 1 }),
			bass: win({ slots: [slot(70, H - 60, 110), slot(W - 70, H - 60, 110)], pick: "cycle", show: "note", hitStyle: "slide", z: 1 }),
			kick: win({ slots: [slot(60, 60, 80)], mirror: "horizontal", show: "note", hitStyle: "zoom", hitZoom: 1.4, flipMode: "none", z: 1 }),
			snare: win({ slots: [slot(W / 2, H - 40, 70)], show: "note", hitStyle: "bounce", flipMode: "none", z: 1 }),
			harmony: "hidden", arpeggio: "hidden", sfx: "hidden",
		}),
	},
	{
		id: "staff",
		name: "五線譜型（音程で高さ）",
		description: "主旋律の窓を音程の高さに置き、同じ横一列に伴奏を並べる。音MAD五線譜の見た目の簡易版。",
		bgColor: "#0d0d12",
		build: () => ({
			lead: win({ slots: [slot(W / 2, H / 2, 140)], pitchY: 10, flipMode: "alternate", hitStyle: "zoom", hitZoom: 1.1, z: 3 }),
			harmony: win({ slots: [slot(W / 2 + 180, H / 2, 90)], pitchY: 10, show: "note", hitStyle: "flash", z: 2 }),
			bass: win({ slots: [slot(W / 2 - 180, H / 2 + 40, 90)], pitchY: 6, show: "note", hitStyle: "slide", z: 2 }),
			chord: win({ slots: generateSlots("row", 4, 50, { x: W / 2, y: H - 40 }), pick: "voice", flipMode: "changed", hitOnlyChanged: true, hitStyle: "bounce" }),
			kick: win({ slots: [slot(40, H - 40, 60)], show: "note", hitStyle: "zoom", hitZoom: 1.4, flipMode: "none" }),
			snare: win({ slots: [slot(W - 40, H - 40, 60)], show: "note", hitStyle: "bounce", flipMode: "none" }),
			hat: win({ slots: [slot(W - 40, 40, 50)], show: "note", hitStyle: "shake", flipMode: "none" }),
			arpeggio: "hidden", sfx: "hidden",
		}),
	},
];

export const otomadStyleById = (id: string): OtomadStyle | undefined => OTOMAD_STYLES.find((s) => s.id === id);

/** 役割の自動推定（音域の中央値・同時発音数・音符の長さから）。確定ではなく初期値。 */
export const guessRole = (track: OtomadTrack, song: MvSong, manifest: OtomadManifest): OtomadRole => {
	const notes = song.byTrack.get(track.track) ?? [];
	if (notes.length === 0) return "other";
	const pitches = notes.map((n) => n.pitch).sort((a, b) => a - b);
	const median = pitches[Math.floor(pitches.length / 2)];
	const starts = new Map<number, number>();
	for (const n of notes) starts.set(n.startStep, (starts.get(n.startStep) ?? 0) + 1);
	const poly = Math.max(...starts.values());
	const avgDur = notes.reduce((s, n) => s + n.durationSteps, 0) / notes.length;
	const fixed = track.audio.pitch === "fixed";
	if (fixed && track.audio.keymap && track.audio.keymap.length >= 2) return "kick";
	if (fixed) return avgDur <= 12 ? "hat" : "snare";
	if (poly >= 3) return avgDur <= 24 ? "arpeggio" : "chord";
	if (median < 50) return "bass";
	// 主旋律は「音程を変える単音トラック」のうち音数が最も多いもの（同数なら音域が高いほう）。
	// 打楽器（pitch: fixed）と和音は候補から外す
	const candidates = manifest.tracks
		.filter((t) => t.audio.pitch !== "fixed")
		.map((t) => {
			const ns = song.byTrack.get(t.track) ?? [];
			const st = new Map<number, number>();
			for (const n of ns) st.set(n.startStep, (st.get(n.startStep) ?? 0) + 1);
			const ps = ns.map((n) => n.pitch).sort((a, b) => a - b);
			return { track: t.track, count: ns.length, poly: ns.length ? Math.max(...st.values()) : 0, median: ps[Math.floor(ps.length / 2)] ?? 0 };
		})
		.filter((c) => c.count > 0 && c.poly < 3 && c.median >= 50)
		.sort((a, b) => b.count - a.count || b.median - a.median);
	return candidates[0]?.track === track.track ? "lead" : "harmony";
};

/**
 * 型を当てる。役割を持つトラックの visual を差し替え、背景色を変え、場面は残す（場面側の上書きはそのまま）。
 * 役割が無い／型に無い役割のトラックは窓を出さない。
 */
export const applyOtomadStyle = (manifest: OtomadManifest, style: OtomadStyle, song: MvSong): OtomadManifest => {
	const maxPolyphony = (role: OtomadRole): number => {
		let m = 1;
		for (const t of manifest.tracks) {
			if (t.role !== role) continue;
			const starts = new Map<number, number>();
			for (const n of song.byTrack.get(t.track) ?? []) starts.set(n.startStep, (starts.get(n.startStep) ?? 0) + 1);
			m = Math.max(m, ...starts.values());
		}
		return m;
	};
	const table = style.build({ maxPolyphony });
	const tracks = manifest.tracks.map((t) => {
		const role = t.role ?? "other";
		const spec = table[role];
		const base = createDefaultTrackVisual();
		if (!spec || spec === "hidden") return { ...t, visual: { ...base, kind: "none" as const } };
		return { ...t, visual: { ...base, ...spec, slots: (spec.slots ?? base.slots).map((s) => ({ ...s })) } };
	});
	return { ...manifest, tracks, stage: { ...manifest.stage, bgColor: style.bgColor ?? manifest.stage.bgColor } };
};
