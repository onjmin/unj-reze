// 音MAD の見本。設計: docs/otomad-feature-design.md §8
//
// 見本の素材は全部サイト同梱の自作（public/assets/otomad/*.wav は scripts/make-otomad-samples.mjs の
// 合成音、画像はロゼの一枚絵）。他者の映像・音声は同梱しない。
// 「まっさら」以外は、音程合わせ・反転・拡大・ドラム素材の keymap が全部入った手本になっている。

import {
	createDefaultSlot,
	createDefaultSource,
	createDefaultStage,
	createDefaultTrack,
	createDefaultTrackAudio,
	createDefaultTrackVisual,
	createEmptyOtomadManifest,
	OTOMAD_H,
	OTOMAD_W,
	type OtomadManifest,
	type OtomadSource,
} from "./otomad-config";

export interface OtomadPresetEntry {
	id: string;
	name: string;
	description: string;
	build: () => OtomadManifest;
}

const ASSET = "/assets/otomad/";
const ROZE = "/assets/mv/roze/";

/** 内蔵の合成音。baseNote は scripts/make-otomad-samples.mjs と一致（あ・ぱ = E4、お = E2）。 */
export const BUILTIN_VOICE_SOURCES: OtomadSource[] = [
	createDefaultSource({ id: "voice_a", name: "声「あ」（内蔵・E4）", kind: "audio", url: `${ASSET}voice-a.wav`, baseNote: 64, durationSec: 0.6 }),
	createDefaultSource({ id: "voice_o", name: "声「お」（内蔵・低い E2）", kind: "audio", url: `${ASSET}voice-o.wav`, baseNote: 40, durationSec: 0.8 }),
	createDefaultSource({ id: "voice_pa", name: "声「ぱ」（内蔵・E4）", kind: "audio", url: `${ASSET}voice-pa.wav`, baseNote: 64, durationSec: 0.35 }),
	createDefaultSource({ id: "voice_a5", name: "声「あ」（内蔵・高い E5）", kind: "audio", url: `${ASSET}voice-a5.wav`, baseNote: 76, durationSec: 0.6 }),
	createDefaultSource({ id: "voice_a6", name: "声「あ」（内蔵・とても高い E6）", kind: "audio", url: `${ASSET}voice-a6.wav`, baseNote: 88, durationSec: 0.5 }),
	createDefaultSource({ id: "voice_o3", name: "声「お」（内蔵・E3）", kind: "audio", url: `${ASSET}voice-o3.wav`, baseNote: 52, durationSec: 0.7 }),
];
export const BUILTIN_DRUM_SOURCES: OtomadSource[] = [
	createDefaultSource({ id: "kick", name: "キック（内蔵）", kind: "audio", url: `${ASSET}kick.wav`, durationSec: 0.25 }),
	createDefaultSource({ id: "snare", name: "スネア（内蔵）", kind: "audio", url: `${ASSET}snare.wav`, durationSec: 0.2 }),
	createDefaultSource({ id: "hat", name: "ハイハット（内蔵）", kind: "audio", url: `${ASSET}hat.wav`, durationSec: 0.08 }),
];
export const BUILTIN_IMAGE_SOURCES: OtomadSource[] = [
	createDefaultSource({ id: "roze_a", name: "ロゼ A（内蔵）", kind: "image", url: `${ROZE}beat-a.png` }),
	createDefaultSource({ id: "roze_b", name: "ロゼ B（内蔵）", kind: "image", url: `${ROZE}beat-b.png` }),
	createDefaultSource({ id: "roze_c", name: "ロゼ C（内蔵）", kind: "image", url: `${ROZE}beat-c.png` }),
	createDefaultSource({ id: "roze_d", name: "ロゼ D（内蔵）", kind: "image", url: `${ROZE}beat-d.png` }),
];

export const BUILTIN_SOURCES: OtomadSource[] = [
	...BUILTIN_VOICE_SOURCES,
	...BUILTIN_DRUM_SOURCES,
	...BUILTIN_IMAGE_SOURCES,
];

/** 見本の曲（8 小節、t140）。@0 旋律（o4、声「あ」E4 の ±8 半音内）/ @1 低音（o2、声「お」E2）/ @2 ドラム（c=キック d=スネア f=ハット）。 */
const DEMO_MML = [
	"#mode=advanced;",
	"@0 t140 v100 o4 l8 c e g e c e g e | d f a f d f a f | e g b g e g b g | f a >c< a f a >c< a |",
	"c e g e c e g e | d f a f d f a f | e g b g e g b g | g4 e4 c4 r4",
	"@1 v90 o2 l4 c c g g | d d a a | e e b b | f f >c< c | c c g g | d d a a | e e b b | c2 r2",
	"@2 v100 o4 l8 c f d f c f d f | c f d f c f d f | c f d f c f d f | c f d f c f d f |",
	"c f d f c f d f | c f d f c f d f | c f d f c f d f | c f d d c c d2",
].join("\n");

const demoBuild = (): OtomadManifest => {
	const m = createEmptyOtomadManifest();
	m.title = "内蔵素材のデモ";
	m.credit = "声・打楽器: サイト内蔵の合成音 / 絵: 束音ロゼ（サイト内蔵）";
	m.mml = DEMO_MML;
	m.stage = { ...createDefaultStage(), bgColor: "#1b1430", bgDim: 0 };
	m.sources = BUILTIN_SOURCES.map((s) => ({ ...s }));
	// @0 旋律: 声「あ」を音程合わせ。窓は左右 2 つを巡回、反転あり、拡大あり、音程で上下
	const lead = createDefaultTrack(0);
	lead.label = "旋律（声）";
	lead.audio = { ...createDefaultTrackAudio("voice_a"), releaseMs: 25 };
	lead.visual = {
		...createDefaultTrackVisual(),
		slots: [
			{ x: OTOMAD_W * 0.3, y: OTOMAD_H * 0.42, w: 220, h: 220 },
			{ x: OTOMAD_W * 0.7, y: OTOMAD_H * 0.42, w: 220, h: 220 },
		],
		pick: "cycle",
		show: "untilNext",
		flipAlternate: true,
		hitZoom: 1.15,
		pitchY: 6,
		z: 2,
	};
	// 絵は声と別の素材なので、見せる素材を keymap で結びつける（音は声、絵はロゼ）
	// → 窓に出す素材は「音の素材」と同じ id を見る設計なので、声の素材に絵を持たせる代わりに
	//   ロゼの画像トラックを同じ MML トラックに重ねる。
	const leadFace = createDefaultTrack(0);
	leadFace.label = "旋律（絵）";
	leadFace.muted = true;
	leadFace.audio = {
		...createDefaultTrackAudio(),
		keymap: [
			{ fromNote: 0, toNote: 62, sourceId: "roze_a" },
			{ fromNote: 63, toNote: 66, sourceId: "roze_b" },
			{ fromNote: 67, toNote: 69, sourceId: "roze_c" },
			{ fromNote: 70, toNote: 127, sourceId: "roze_d" },
		],
	};
	leadFace.visual = { ...lead.visual, z: 1 };
	lead.visual = { ...lead.visual, kind: "none" };
	// @1 低音: 声「お」、窓は無し
	const bass = createDefaultTrack(1);
	bass.label = "低音（声）";
	bass.audio = { ...createDefaultTrackAudio("voice_o"), releaseMs: 40, gainDb: -3 };
	bass.visual = { ...createDefaultTrackVisual(), kind: "none" };
	// @2 ドラム: keymap で c/d/f を打楽器に。窓は下に小さく 3 つ、音程で振り分け
	const drums = createDefaultTrack(2);
	drums.label = "ドラム";
	drums.audio = {
		...createDefaultTrackAudio(),
		pitch: "fixed",
		length: "sample",
		keymap: [
			{ fromNote: 60, toNote: 61, sourceId: "kick" },
			{ fromNote: 62, toNote: 64, sourceId: "snare" },
			{ fromNote: 65, toNote: 71, sourceId: "hat" },
		],
	};
	drums.visual = { ...createDefaultTrackVisual(), kind: "none" };
	m.tracks = [leadFace, lead, bass, drums];
	return m;
};

export const OTOMAD_PRESETS: OtomadPresetEntry[] = [
	{
		id: "demo",
		name: "内蔵素材のデモ",
		description: "合成した声を音程合わせし、ロゼの絵が音符ごとに切り替わる 8 小節。音程合わせ・反転・拡大・ドラム素材の割り当てが全部入り。",
		build: demoBuild,
	},
	{
		id: "blank",
		name: "まっさら",
		description: "曲と素材を自分で持ち込む。素材を足してトラックに割り当てるところから。",
		build: () => {
			const m = createEmptyOtomadManifest();
			m.tracks = [createDefaultTrack(0)];
			m.tracks[0].visual.slots = [createDefaultSlot()];
			return m;
		},
	},
];

export const createDefaultOtomadManifest = (): OtomadManifest => OTOMAD_PRESETS[0].build();
