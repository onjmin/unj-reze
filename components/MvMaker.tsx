"use client";

import { detectProgression, parseChords } from "@onjmin/chord-parser";
import {
	BarChart3,
	ChevronDown,
	ChevronUp,
	Clapperboard,
	Clipboard,
	Copy,
	Hash,
	History,
	Image as ImageIcon,
	Layers,
	ListMusic,
	Music,
	Play,
	Plus,
	Redo2,
	Shapes,
	Sparkles,
	Trash2,
	Type,
	Undo2,
	X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseWalkRef, refLabel } from "@/lib/asset-ref";
import { handleImgError } from "@/lib/cors-proxy";
import {
	clearAutosave,
	getAutosave,
	getStorageKey,
	saveAutosave,
	saveHistory,
} from "@/lib/history";
import {
	DEFAULT_MV_ENTRANCE,
	DEFAULT_MV_NOTE_LIGHT,
	DEFAULT_MV_NOTE_LIGHT_3D,
	DEFAULT_MV_RING,
	DEFAULT_MV_TRANSITION,
	DEFAULT_MV_VIEW,
	isMvEntranceInert,
	MV_AUDIO_MODE_HINTS,
	MV_AUDIO_MODE_LABELS,
	MV_BLEND_LABELS,
	MV_CHORD_COLOR_MODE_LABELS,
	MV_EFFECT_STYLE_LABELS,
	MV_ENTER_FROM_LABELS,
	MV_H,
	MV_MOD_OP_LABELS,
	MV_MOD_SOURCE_LABELS,
	MV_MOD_TARGET_LABELS,
	MV_MOTION_LABELS,
	MV_PROJECTION_LABELS,
	MV_ROLL_FLOW_LABELS,
	MV_ROOT_TO_PITCH,
	MV_SHAPE_FORM_LABELS,
	MV_STEPS_PER_BAR,
	MV_TRANSITION_LABELS,
	MV_TRIGGER_LABELS,
	MV_VISUALIZER_LABELS,
	MV_W,
	type MvAudioMode,
	type MvBlend,
	type MvChordBarLayer,
	type MvChordColorMode,
	type MvChordStep,
	type MvDegreeLayer,
	type MvEffectLayer,
	type MvEffectStyle,
	type MvEnterFrom,
	type MvEntrance,
	type MvImageLayer,
	type MvLayer,
	type MvLyricsLayer,
	type MvManifest,
	type MvModOp,
	type MvModSource,
	type MvModTarget,
	type MvModulator,
	type MvMotion,
	type MvNoteEcho,
	type MvNoteLight,
	type MvPresetKind,
	type MvProjection,
	type MvRollFlow,
	type MvSceneStage,
	type MvSection,
	type MvShapeForm,
	type MvShapeLayer,
	type MvTextLayer,
	type MvTransitionStyle,
	type MvTrigger,
	type MvVisualizerLayer,
	type MvVisualizerStyle,
	type MvWalkSetting,
	mvAudioMode,
	mvEntranceDistance,
	mvUid,
	mvWalkSpeed,
	parseLyricsBulkGroups,
} from "@/lib/mv-config";
import type {
	MvEffectTemplateDef,
	MvEffectTemplateParams,
} from "@/lib/mv-effect-templates";
import {
	EMPTY_SONG,
	type MvSong,
	parseMvSong,
	resolveLyricLines,
} from "@/lib/mv-engine";
import { resolveSceneModulators } from "@/lib/mv-shape-motion";
import ContentPicker, { type PickResult } from "./ContentPicker";
import HistoryModal from "./HistoryModal";
import MvEffectTemplatePicker from "./MvEffectTemplatePicker";
import MvPlayer, { type MvPlayerHandle } from "./MvPlayer";
import MvShapeMotionModal from "./MvShapeMotionModal";
import { buildMvPreset, MV_PRESETS } from "./mv-presets";
import VolumeControl from "./VolumeControl";

function formatMinSecMs(sec: number): string {
	if (!sec || isNaN(sec) || sec < 0) return "0:00.0";
	const mm = Math.floor(sec / 60);
	const ss = Math.floor(sec % 60);
	const ms = Math.floor((sec % 1) * 10);
	return `${mm}:${ss.toString().padStart(2, "0")}.${ms}`;
}

type Tab = "preset" | "song" | "stage" | "layers" | "lyrics" | "sections";

const TABS: { id: Tab; label: string }[] = [
	{ id: "preset", label: "見本" },
	{ id: "song", label: "曲" },
	{ id: "stage", label: "見た目" },
	{ id: "layers", label: "レイヤー" },
	{ id: "lyrics", label: "歌詞" },
	{ id: "sections", label: "場面" },
];

interface MvMakerProps {
	onClose: () => void;
	onSave: (data: {
		manifest: MvManifest;
		title: string;
		preset: MvPresetKind;
	}) => void;
	userId: string;
	initialManifest?: MvManifest;
	isEditing?: boolean;
}

// ───────────────── 共通の小物 ─────────────────

const SECTION_CLASS =
	"rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2";
const INPUT_CLASS =
	"w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none";
const REF_BTN_CLASS =
	"w-full flex items-center justify-center gap-1 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300";
const ADD_BTN_CLASS =
	"w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-gray-600 text-[11px] text-gray-400 hover:bg-gray-100/5";
const DEL_BTN_CLASS =
	"shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition";

// スマホでの押しやすさを優先し、ラベルは入力欄の上に置いて入力欄は全幅・高さ36px以上にする
// （狭い画面でラベルと入力欄を横に並べると、どちらも潰れて読めなくなるため）。
const FIELD_LABEL_CLASS = "block text-[10px] text-gray-400";
const FIELD_INPUT_CLASS =
	"w-full min-h-9 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none";

function SectionTitle({ children }: { children: React.ReactNode }) {
	return <p className="text-[12px] font-bold text-gray-200">{children}</p>;
}

/** 補足説明。専門用語を避けて「何が起きるか」を書くための共通スタイル。 */
function Hint({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-[10px] leading-relaxed text-gray-500">{children}</p>
	);
}

function StringNumInput({
	value,
	onChange,
	className,
	placeholder,
}: {
	value: number | undefined;
	onChange: (v: number) => void;
	className?: string;
	placeholder?: string;
}) {
	const [text, setText] = useState(value === undefined ? "" : String(value));
	const [focused, setFocused] = useState(false);
	const [prevValue, setPrevValue] = useState(value);

	if (!focused && value !== prevValue) {
		setPrevValue(value);
		setText(value === undefined ? "" : String(value));
	}

	return (
		<input
			type="text"
			inputMode="decimal"
			value={text}
			placeholder={placeholder}
			onFocus={() => setFocused(true)}
			onBlur={() => {
				setFocused(false);
				if (text.trim() === "") {
					onChange(0);
					setText("0");
				} else {
					const n = Number(text);
					if (!Number.isNaN(n)) onChange(n);
				}
			}}
			onChange={(e) => {
				setText(e.target.value);
				const val = e.target.value;
				if (val === "-" || val.trim() === "" || val.endsWith(".")) return;
				const n = Number(val);
				if (!Number.isNaN(n)) onChange(n);
			}}
			className={className}
		/>
	);
}

function SliderField({
	label,
	value,
	min = 0,
	max = 100,
	step = 1,
	onChange,
}: {
	label: string;
	value: number;
	min?: number;
	max?: number;
	step?: number;
	onChange: (v: number) => void;
}) {
	return (
		<div className="space-y-1 rounded bg-gray-950/30 p-2 border border-gray-800">
			<div className="flex items-center justify-between">
				<span className={FIELD_LABEL_CLASS}>{label}</span>
				<StringNumInput
					value={value}
					onChange={onChange}
					className="w-14 bg-transparent text-right text-[11px] text-gray-300 outline-none"
				/>
			</div>
			<input
				type="range"
				value={value}
				min={min}
				max={max}
				step={step}
				onChange={(e) => onChange(Number(e.target.value) || 0)}
				className="w-full accent-blue-500"
			/>
		</div>
	);
}

function NumField({
	label,
	value,
	onChange,
	min,
	max,
	step = 1,
}: {
	label: string;
	value: number | undefined;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	step?: number;
}) {
	return (
		<label className="block space-y-0.5">
			<span className={FIELD_LABEL_CLASS}>{label}</span>
			<StringNumInput
				value={value}
				onChange={onChange}
				className={FIELD_INPUT_CLASS}
			/>
		</label>
	);
}

function ColorField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<label className="block space-y-0.5">
			<span className={FIELD_LABEL_CLASS}>{label}</span>
			<div className="flex items-center gap-2">
				<input
					type="color"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-700 bg-transparent"
				/>
				<span className="text-[10px] text-gray-500">{value}</span>
			</div>
		</label>
	);
}

function SelectField<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: { value: T; label: string }[];
	onChange: (v: T) => void;
}) {
	return (
		<label className="block space-y-0.5">
			<span className={FIELD_LABEL_CLASS}>{label}</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value as T)}
				className={FIELD_INPUT_CLASS}
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</label>
	);
}

function CheckField({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<label className="flex min-h-9 items-center gap-2 text-[12px] text-gray-300">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="h-4 w-4 accent-blue-500"
			/>
			{label}
		</label>
	);
}

/**
 * 詳しい設定のたたみ込み。
 * 既定は閉じておき、「触らなくても完成する」状態を保つ。
 */
function Details({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="rounded border border-gray-700/70 bg-gray-900/60">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex min-h-9 w-full items-center justify-between px-2 py-1.5 text-[11px] text-gray-300"
			>
				<span>{label}</span>
				{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
			</button>
			{open && (
				<div className="space-y-2 border-t border-gray-700/70 p-2">
					{children}
				</div>
			)}
		</div>
	);
}

const MOTION_OPTIONS = (Object.keys(MV_MOTION_LABELS) as MvMotion[]).map(
	(m) => ({ value: m, label: MV_MOTION_LABELS[m] }),
);
const ENTER_FROM_OPTIONS = (
	Object.keys(MV_ENTER_FROM_LABELS) as MvEnterFrom[]
).map((f) => ({ value: f, label: MV_ENTER_FROM_LABELS[f] }));
const VISUALIZER_OPTIONS = (
	Object.keys(MV_VISUALIZER_LABELS) as MvVisualizerStyle[]
).map((s) => ({ value: s, label: MV_VISUALIZER_LABELS[s] }));

const PROJECTION_OPTIONS = (
	Object.keys(MV_PROJECTION_LABELS) as MvProjection[]
).map((p) => ({ value: p, label: MV_PROJECTION_LABELS[p] }));
const ROLL_FLOW_OPTIONS = (
	Object.keys(MV_ROLL_FLOW_LABELS) as MvRollFlow[]
).map((f) => ({ value: f, label: MV_ROLL_FLOW_LABELS[f] }));

/**
 * `walk:` 参照から `MvWalkSetting` を起こす。参照が持っていない情報は補わない
 * （＝歩行グラは規格の既定、MV素材は参照に焼き込まれたクロップ・コマ数をそのまま使う）。
 * walk 参照でなければ undefined を返し、レイヤーからコマ割りを外す。
 */
function walkSettingFromRef(ref: string): MvWalkSetting | undefined {
	const wr = parseWalkRef(ref);
	if (!wr) return undefined;
	const setting: MvWalkSetting = { stdId: wr.stdId };
	if (wr.crop) setting.crop = wr.crop;
	if (wr.frames) setting.frames = wr.frames;
	if (wr.row !== undefined) setting.row = wr.row;
	if (wr.playMode) setting.playMode = wr.playMode;
	if (wr.fps) setting.fps = wr.fps;
	// MV素材は「1周＝1小節」を既定にする。秒で送ると曲のテンポを変えた瞬間にずれる。
	if (wr.stdId === "row_anim") setting.loopBeats = 4;
	return setting;
}

/** そのロールが実際に使う光り方（未設定なら見せ方ごとの既定）。 */
function noteLight(layer: MvVisualizerLayer): MvNoteLight {
	if (layer.light) return layer.light;
	return (layer.projection ?? "flat") === "flat"
		? DEFAULT_MV_NOTE_LIGHT
		: DEFAULT_MV_NOTE_LIGHT_3D;
}
const SHAPE_FORM_OPTIONS = (
	Object.keys(MV_SHAPE_FORM_LABELS) as MvShapeForm[]
).map((f) => ({ value: f, label: MV_SHAPE_FORM_LABELS[f] }));
const BLEND_OPTIONS = (Object.keys(MV_BLEND_LABELS) as MvBlend[]).map((b) => ({
	value: b,
	label: MV_BLEND_LABELS[b],
}));
const EFFECT_STYLE_OPTIONS = (
	Object.keys(MV_EFFECT_STYLE_LABELS) as MvEffectStyle[]
).map((s) => ({ value: s, label: MV_EFFECT_STYLE_LABELS[s] }));
const TRIGGER_OPTIONS = (Object.keys(MV_TRIGGER_LABELS) as MvTrigger[]).map(
	(t) => ({ value: t, label: MV_TRIGGER_LABELS[t] }),
);
const MOD_SOURCE_OPTIONS = (
	Object.keys(MV_MOD_SOURCE_LABELS) as MvModSource[]
).map((s) => ({ value: s, label: MV_MOD_SOURCE_LABELS[s] }));
const MOD_TARGET_OPTIONS = (
	Object.keys(MV_MOD_TARGET_LABELS) as MvModTarget[]
).map((t) => ({ value: t, label: MV_MOD_TARGET_LABELS[t] }));
const MOD_OP_OPTIONS = (Object.keys(MV_MOD_OP_LABELS) as MvModOp[]).map(
	(o) => ({ value: o, label: MV_MOD_OP_LABELS[o] }),
);
const AUDIO_MODE_OPTIONS = (
	Object.keys(MV_AUDIO_MODE_LABELS) as MvAudioMode[]
).map((m) => ({ value: m, label: MV_AUDIO_MODE_LABELS[m] }));

const LAYER_ICON = {
	image: ImageIcon,
	text: Type,
	visualizer: BarChart3,
	lyrics: Music,
	shape: Shapes,
	effect: Sparkles,
	chordBar: ListMusic,
	degree: Hash,
} as const;

/** 図形の「音との連動」1行ぶんの編集UI。 */
function ModulatorRow({
	mod,
	tracks,
	onChange,
	onRemove,
}: {
	mod: MvModulator;
	tracks: number[];
	onChange: (patch: Partial<MvModulator>) => void;
	onRemove: () => void;
}) {
	const needsTrack =
		mod.source === "trackEnergy" ||
		mod.source === "trackOnset" ||
		mod.source === "trackPitch";
	const selectClass =
		"min-h-9 min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none";
	return (
		<div className="space-y-1 rounded border border-gray-700/70 bg-gray-900/60 p-2">
			<div className="flex items-center gap-1">
				<select
					value={mod.source}
					onChange={(e) => onChange({ source: e.target.value as MvModSource })}
					className={selectClass}
				>
					{MOD_SOURCE_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
				{needsTrack && (
					<select
						value={mod.track ?? ""}
						onChange={(e) =>
							onChange({
								track:
									e.target.value === "" ? undefined : Number(e.target.value),
							})
						}
						className="min-h-9 w-20 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
					>
						<option value="">全部</option>
						{tracks.map((t) => (
							<option key={t} value={t}>
								@{t}
							</option>
						))}
					</select>
				)}
				<button
					onClick={onRemove}
					className="shrink-0 grid h-7 w-7 place-items-center rounded text-gray-500 hover:text-red-400"
				>
					<X size={13} />
				</button>
			</div>
			<div className="flex items-center gap-1">
				<select
					value={mod.target}
					onChange={(e) => onChange({ target: e.target.value as MvModTarget })}
					className={selectClass}
				>
					{MOD_TARGET_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
				<select
					value={mod.op}
					onChange={(e) => onChange({ op: e.target.value as MvModOp })}
					className="min-h-9 w-24 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
				>
					{MOD_OP_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
				<StringNumInput
					value={mod.amount}
					onChange={(n) => onChange({ amount: n })}
					className="min-h-9 w-16 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
				/>
			</div>
		</div>
	);
}

/**
 * 貼り付けられたSVGマークアップから d 属性と viewBox を抜き出す。
 * <path> が複数あっても1本の d に連結する（サブパスとして全部描かれる）。
 * SVGでなければ null（＝素の d 属性としてそのまま使う）。
 */
function extractSvgPaths(
	text: string,
): { d: string; box?: [number, number, number, number] } | null {
	if (!text.includes("<")) return null;
	const ds = [...text.matchAll(/\bd\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
		.map((m) => m[1] ?? m[2])
		.filter(Boolean);
	if (ds.length === 0) return null;
	let box: [number, number, number, number] | undefined;
	const vb = text.match(/viewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/);
	const raw = vb?.[1] ?? vb?.[2];
	if (raw) {
		const nums = raw
			.trim()
			.split(/[\s,]+/)
			.map(Number);
		if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) {
			box = [nums[0], nums[1], nums[2], nums[3]];
		}
	}
	return { d: ds.join(" "), box };
}

/** "0, 8, 16.5" のような小節リスト入力を数値配列へ。 */
function parseBarList(text: string): number[] {
	return text
		.split(/[,、\s]+/)
		.map(Number)
		.filter((n) => Number.isFinite(n) && n >= 0);
}

/** 種類ごとの既定ラベル（`name`も分かりやすいidも無いときの最終フォールバック）。 */
function layerKindLabel(layer: MvLayer): string {
	switch (layer.kind) {
		case "image":
			return refLabel(layer.ref);
		case "text":
			return layer.text.split("\n")[0] || "テキスト";
		case "visualizer":
			return MV_VISUALIZER_LABELS[layer.style];
		case "lyrics":
			return "歌詞";
		case "shape":
			return MV_SHAPE_FORM_LABELS[layer.form];
		case "effect":
			return MV_EFFECT_STYLE_LABELS[layer.style];
		case "chordBar":
			return "コード進行バー";
		case "degree":
			return `度数 @${layer.track}`;
	}
}

/**
 * `mvUid()` が振った自動id（例: "shp_m5x2k3g7"）かどうか。ハイフンを含まず、
 * prefix_英数字 という形をしている。プリセット作者が付けた意味のあるid（例: "roll-intro"）は
 * ハイフンを含むのでここで弾かれ、そのまま見出しとして使われる。
 */
function isAutoLayerId(id: string): boolean {
	return /^[a-z]+_[0-9a-z]+$/.test(id) && !id.includes("-");
}

/**
 * レイヤー一覧の見出し。優先順位: ユーザーが付けた`name` → 意味のあるid（"roll-intro"等、
 * ハイフンを人が読みやすいよう空白に）→ 種類名。以前は種類名だけだったため、
 * 「ピアノロール」が5枚並んでも見分けが付かなかった（実際はintro/main/a/b/…と
 * 役割の異なるレイヤーだった）。
 */
function layerLabel(layer: MvLayer): string {
	if (layer.name?.trim()) return layer.name.trim();
	if (!isAutoLayerId(layer.id)) return layer.id.replace(/[-_]/g, " ");
	return layerKindLabel(layer);
}

// ───────────────── 本体 ─────────────────

/**
 * MV作成エディタ。
 *
 * ゲーム作成と同じ「プリセットを選んで中身を差し替える」体験に寄せてある。
 * 自由なタイムラインは持たず、レイヤー種別は4つ・動きは選択肢・時間軸は場面（小節）だけ。
 */
export default function MvMaker({
	onClose,
	onSave,
	userId,
	initialManifest,
	isEditing,
}: MvMakerProps) {
	const [manifest, setManifest] = useState<MvManifest>(
		() => initialManifest ?? buildMvPreset("pianoRoll"),
	);
	const [tab, setTab] = useState<Tab>(initialManifest ? "song" : "preset");
	const [presetName, setPresetName] = useState<string | null>(null);
	const [lyricsBulkText, setLyricsBulkText] = useState("");
	const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
	const [motionTarget, setMotionTarget] = useState<
		{ layerId: string; sectionId: string } | null
	>(null);
	const [picker, setPicker] = useState<{
		mode: "image" | "bgm";
		target: "stageBg" | { layerId: string } | { sectionId: string };
	} | null>(null);
	const playerRef = useRef<MvPlayerHandle>(null);
	const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
	const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
	const [copiedSectionData, setCopiedSectionData] = useState<{
		stage?: MvManifest["stage"];
		transition?: MvManifest["sections"][0]["transition"];
		layerSections: Record<string, boolean>;
	} | null>(null);
	const [showHistory, setShowHistory] = useState(false);
	const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
	const [song, setSong] = useState<MvSong>(EMPTY_SONG);

	const trackNoteCounts = useMemo(() => {
		const map: Record<number, number> = {};
		song.notes.forEach((n) => {
			map[n.track] = (map[n.track] ?? 0) + 1;
		});
		return map;
	}, [song.notes]);
	const [hasAutosave, setHasAutosave] = useState(false);
	const [bulkChordInput, setBulkChordInput] = useState("");
	const autosaveDataRef = useRef<MvManifest | null>(null);

	const storageKey = getStorageKey("mv");
	const manifestRef = useRef(manifest);
	useEffect(() => {
		manifestRef.current = manifest;
	}, [manifest]);

	const visibleTabs = TABS;

	// ── 編集の取り消し／やり直し（Undo / Redo）─────────────────────
	//  manifest を書き換える操作（update）の直前にスナップショットを積む。1回の update = 1操作。
	const UNDO_LIMIT = 50;
	const undoStackRef = useRef<MvManifest[]>([]);
	const redoStackRef = useRef<MvManifest[]>([]);
	const [undoDepth, setUndoDepth] = useState(0);
	const [redoDepth, setRedoDepth] = useState(0);

	const pushUndo = useCallback(() => {
		const stack = undoStackRef.current;
		stack.push(JSON.parse(JSON.stringify(manifestRef.current)));
		if (stack.length > UNDO_LIMIT) stack.shift();
		redoStackRef.current = [];
		setUndoDepth(stack.length);
		setRedoDepth(0);
	}, []);

	/** プリセット差し替えや履歴からの復元など、undo対象にしない大きな置き換えの前に呼ぶ。 */
	const resetEditHistory = useCallback(() => {
		undoStackRef.current = [];
		redoStackRef.current = [];
		setUndoDepth(0);
		setRedoDepth(0);
	}, []);

	const undoEdit = useCallback(() => {
		const stack = undoStackRef.current;
		const snap = stack.pop();
		if (!snap) return;
		redoStackRef.current.push(JSON.parse(JSON.stringify(manifestRef.current)));
		manifestRef.current = snap;
		setManifest(snap);
		setUndoDepth(stack.length);
		setRedoDepth(redoStackRef.current.length);
	}, []);

	const redoEdit = useCallback(() => {
		const stack = redoStackRef.current;
		const snap = stack.pop();
		if (!snap) return;
		undoStackRef.current.push(JSON.parse(JSON.stringify(manifestRef.current)));
		manifestRef.current = snap;
		setManifest(snap);
		setUndoDepth(undoStackRef.current.length);
		setRedoDepth(stack.length);
	}, []);

	// デスクトップ: Ctrl+Z / Ctrl+Y（Ctrl+Shift+Z）。入力欄にフォーカス中は横取りしない。
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			const tag = t?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable)
				return;
			if (!(e.ctrlKey || e.metaKey)) return;
			const k = e.key.toLowerCase();
			if (k === "z" && !e.shiftKey) {
				e.preventDefault();
				undoEdit();
			} else if (k === "y" || (k === "z" && e.shiftKey)) {
				e.preventDefault();
				redoEdit();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [undoEdit, redoEdit]);

	const update = useCallback(
		(patch: (m: MvManifest) => MvManifest) => {
			pushUndo();
			setManifest((prev) => patch(prev));
		},
		[pushUndo],
	);

	const updateLayer = useCallback(
		(id: string, patch: (l: MvLayer) => MvLayer) => {
			update((m) => ({
				...m,
				layers: m.layers.map((l) => (l.id === id ? patch(l) : l)),
			}));
		},
		[update],
	);

	const updateSection = useCallback(
		(id: string, patch: (s: MvSection) => MvSection) => {
			update((m) => ({
				...m,
				sections: m.sections.map((s) => (s.id === id ? patch(s) : s)),
			}));
		},
		[update],
	);

	/**
	 * 場面ごとの背景の上書き。値が全部消えたら `stage` ごと落として
	 * 「この場面は全体の設定のまま」に戻す（空オブジェクトが残ると上書きの有無が読めなくなる）。
	 */
	const updateSectionStage = useCallback(
		(id: string, patch: Partial<MvSceneStage>) => {
			updateSection(id, (s) => {
				const next: MvSceneStage = { ...s.stage, ...patch };
				for (const k of Object.keys(next) as (keyof MvSceneStage)[]) {
					if (next[k] === undefined) delete next[k];
				}
				return Object.keys(next).length > 0
					? { ...s, stage: next }
					: { ...s, stage: undefined };
			});
		},
		[updateSection],
	);

	const handleParseBulkChords = useCallback(
		(rawText: string, layerId: string) => {
			if (!rawText.trim()) return;
			try {
				const events = parseChords(rawText, 120);
				if (events.length > 0) {
					const secPerBar = 2; // 120bpm -> 4 beats = 2sec per bar
					const newChords: MvChordStep[] = events.map((e) => ({
						bar: Math.round((e.when / secPerBar) * 100) / 100,
						label: e.key + e.chord || "C",
					}));
					updateLayer(layerId, (l) =>
						l.kind === "chordBar" ? { ...l, chords: newChords } : l,
					);
				}
			} catch (e) {
				console.warn("Failed to parse bulk chords:", e);
			}
		},
		[updateLayer],
	);

	const handleAutoDetectFromMml = useCallback(
		async (layerId: string) => {
			if (!manifestRef.current.mml) return;
			try {
				const parsedSong = await parseMvSong(manifestRef.current.mml);
				if (!parsedSong || parsedSong.notes.length === 0) return;
				const bpm = parsedSong.bpm || 120;
				const secPerBar = (4 * 60) / bpm;
				const timedNotes = parsedSong.notes.map((n) => ({
					pitch: n.pitch,
					when: (n.startStep / MV_STEPS_PER_BAR) * secPerBar,
					duration: (n.durationSteps / MV_STEPS_PER_BAR) * secPerBar,
				}));
				const analysis = detectProgression(timedNotes, { bpm });
				if (analysis && analysis.chords.length > 0) {
					const newChords: MvChordStep[] = analysis.chords.map((c) => ({
						bar: Math.round((c.when / secPerBar) * 100) / 100,
						label: c.symbol,
					}));
					updateLayer(layerId, (l) =>
						l.kind === "chordBar" ? { ...l, chords: newChords } : l,
					);
				}
			} catch (e) {
				console.warn("Failed to auto detect chords from MML:", e);
			}
		},
		[updateLayer],
	);

	// ── 楽曲情報（表示用） ─────────────────────────────────
	useEffect(() => {
		let disposed = false;
		parseMvSong(manifest.mml).then((s) => {
			if (!disposed) setSong(s);
		});
		return () => {
			disposed = true;
		};
	}, [manifest.mml]);

	// ── オートセーブ / 履歴 ────────────────────────────────
	useEffect(() => {
		const saved = getAutosave<MvManifest>(storageKey);
		if (saved?.data && !initialManifest) {
			autosaveDataRef.current = saved.data;
			Promise.resolve().then(() => setHasAutosave(true));
		}
	}, [storageKey, initialManifest]);

	useEffect(() => {
		const autosave = setInterval(
			() => saveAutosave(storageKey, manifestRef.current),
			10000,
		);
		const history = setInterval(() => {
			saveHistory(storageKey, manifestRef.current, "mv", 30);
		}, 1800000);
		return () => {
			clearInterval(autosave);
			clearInterval(history);
		};
	}, [storageKey]);

	// ── 素材の選択 ─────────────────────────────────────────
	const handlePick = (result: PickResult) => {
		if (!picker) return;
		if (picker.mode === "bgm") {
			// MML専用ピッカーなので rawMml が必ず入る
			if (result.rawMml) update((m) => ({ ...m, mml: result.rawMml! }));
		} else if (picker.target === "stageBg") {
			update((m) => ({
				...m,
				stage: { ...m.stage, bgRef: result.ref, bgUrl: result.url },
			}));
		} else if ("sectionId" in picker.target) {
			const sectionId = picker.target.sectionId;
			updateSectionStage(sectionId, { bgRef: result.ref, bgUrl: result.url });
		} else {
			const layerId = picker.target.layerId;
			// walk: 参照はコマ割り（クロップ・コマ数・行）を参照文字列に持っている。
			// ここで MvWalkSetting へ写しておかないと、選んだ素材が1コマ目のまま止まる。
			const walk = walkSettingFromRef(result.ref);
			updateLayer(layerId, (l) =>
				l.kind === "image"
					? { ...l, ref: result.ref, url: result.url, walk }
					: l,
			);
		}
		setPicker(null);
	};

	// ── 保存 ──────────────────────────────────────────────
	const handleSave = () => {
		const title = manifest.title.trim() || "無題のMV";
		clearAutosave(storageKey);
		onSave({
			manifest: { ...manifest, title },
			title,
			preset: manifest.preset,
		});
	};

	const canSave = !!manifest.mml.trim();

	// ── レイヤー追加 ───────────────────────────────────────
	const getNextZ = () =>
		Math.max(10, ...manifest.layers.map((l) => l.z ?? 0)) + 10;

	const addImageLayer = () => {
		const layer: MvImageLayer = {
			kind: "image",
			id: mvUid("img"),
			ref: "",
			x: MV_W / 2,
			y: MV_H / 2,
			scale: 1,
			anchor: "center",
			motion: "none",
			pixelated: true,
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [...m.layers, layer] }));
		setSelectedLayerId(layer.id);
		setPicker({ mode: "image", target: { layerId: layer.id } });
	};

	const addTextLayer = () => {
		const layer: MvTextLayer = {
			kind: "text",
			id: mvUid("txt"),
			text: "テキスト",
			x: 24,
			y: 24,
			size: 18,
			color: "#f8fafc",
			anchor: "topLeft",
			vertical: false,
			motion: "none",
			shadow: true,
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [...m.layers, layer] }));
		setSelectedLayerId(layer.id);
	};

	const addLyricsLayer = () => {
		const layer: MvLyricsLayer = {
			kind: "lyrics",
			id: mvUid("lyr"),
			source: song.lyricLines.length > 0 ? "mml" : "manual",
			lines: [],
			x: MV_W - 48,
			y: 44,
			anchor: "topLeft",
			size: 16,
			color: "#f3f4f6",
			vertical: true,
			afterimage: 2,
			holdBars: 2,
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [...m.layers, layer] }));
		setSelectedLayerId(layer.id);
	};

	const addVisualizerLayer = () => {
		const layer: MvVisualizerLayer = {
			kind: "visualizer",
			id: mvUid("vis"),
			style: "bars",
			rect: { x: 0, y: MV_H - 90, w: MV_W, h: 90 },
			amount: 16,
			thickness: 2,
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [...m.layers, layer] }));
		setSelectedLayerId(layer.id);
	};

	/**
	 * 登場演出の更新。向きも無し・フェードも無しに戻したら entrance ごと消して、
	 * 「瞬時に出現」＝未設定、という素直な状態に畳む。
	 */
	const updateEntrance = (id: string, patch: Partial<MvEntrance>) => {
		updateLayer(id, (l) => {
			if (l.kind !== "image") return l;
			const next: MvEntrance = {
				...DEFAULT_MV_ENTRANCE,
				...l.entrance,
				...patch,
			};
			return {
				...l,
				entrance: next.from === "none" && !next.fade ? undefined : next,
			};
		});
	};

	const updateRepeat = (
		id: string,
		patch: Partial<NonNullable<MvImageLayer["repeat"]>>,
	) => {
		updateLayer(id, (l) =>
			l.kind === "image" && l.repeat
				? { ...l, repeat: { ...l.repeat, ...patch } }
				: l,
		);
	};

	const updateView = (
		id: string,
		patch: Partial<MvVisualizerLayer["view"] & object>,
	) => {
		updateLayer(id, (l) =>
			l.kind === "visualizer"
				? { ...l, view: { ...DEFAULT_MV_VIEW, ...l.view, ...patch } }
				: l,
		);
	};

	const updateRing = (
		id: string,
		patch: Partial<MvVisualizerLayer["ring"] & object>,
	) => {
		updateLayer(id, (l) =>
			l.kind === "visualizer"
				? { ...l, ring: { ...DEFAULT_MV_RING, ...l.ring, ...patch } }
				: l,
		);
	};

	const updateLight = (id: string, patch: Partial<MvNoteLight>) => {
		updateLayer(id, (l) =>
			l.kind === "visualizer"
				? { ...l, light: { ...noteLight(l), ...patch } }
				: l,
		);
	};

	const updateEcho = (id: string, patch: Partial<MvNoteEcho>) => {
		updateLayer(id, (l) => {
			if (l.kind !== "visualizer") return l;
			const cur = noteLight(l);
			return {
				...l,
				light: {
					...cur,
					echo: {
						...(cur.echo ?? { beats: 0.5, spread: 7, thickness: 1.5 }),
						...patch,
					},
				},
			};
		});
	};

	const addMod = (id: string) => {
		updateLayer(id, (l) =>
			l.kind === "shape"
				? {
						...l,
						modulators: [
							...l.modulators,
							{
								source: "trackEnergy",
								target: "size",
								op: "add",
								amount: 20,
							} as MvModulator,
						],
					}
				: l,
		);
	};

	const updateMod = (
		id: string,
		index: number,
		patch: Partial<MvModulator>,
	) => {
		updateLayer(id, (l) =>
			l.kind === "shape"
				? {
						...l,
						modulators: l.modulators.map((m, i) =>
							i === index ? { ...m, ...patch } : m,
						),
					}
				: l,
		);
	};

	const removeMod = (id: string, index: number) => {
		updateLayer(id, (l) =>
			l.kind === "shape"
				? { ...l, modulators: l.modulators.filter((_, i) => i !== index) }
				: l,
		);
	};

	const addShapeLayer = () => {
		const layer: MvShapeLayer = {
			kind: "shape",
			id: mvUid("shp"),
			form: "ring",
			x: MV_W / 2,
			y: MV_H / 2,
			size: 48,
			rotation: 0,
			color: manifest.stage.palette[0] ?? "#ffffff",
			filled: false,
			thickness: 2,
			count: 1,
			spread: 0,
			spin: 0,
			blend: "normal",
			z: getNextZ(),
			// 最初から音に反応させる。ここへ演算を足していくのが図形レイヤーの使い方。
			modulators: [{ source: "beat", target: "size", op: "add", amount: 20 }],
		};
		update((m) => ({ ...m, layers: [...m.layers, layer] }));
		setSelectedLayerId(layer.id);
	};

	const addTemplateLayers = (
		template: MvEffectTemplateDef,
		params: MvEffectTemplateParams,
	) => {
		const newLayers = template.build(params);
		const baseZ = getNextZ();
		const zed = newLayers.map((l, i) => ({ ...l, z: baseZ + i }));
		update((m) => ({ ...m, layers: [...m.layers, ...zed] }));
		if (zed[0]) setSelectedLayerId(zed[0].id);
	};

	const addChordBarLayer = () => {
		const layer: MvChordBarLayer = {
			kind: "chordBar",
			id: mvUid("chd"),
			rect: { x: 0, y: MV_H - 22, w: MV_W, h: 22 },
			chords: [
				{ bar: 0, label: "C" },
				{ bar: 1, label: "Am7" },
				{ bar: 2, label: "F" },
				{ bar: 3, label: "G7" },
			],
			key: "C",
			colorMode: "degree",
			color: "#1f2937",
			activeColor: "#3f6212",
			textColor: "#e5e7eb",
			size: 9,
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [...m.layers, layer] }));
		setSelectedLayerId(layer.id);
	};

	/** 頭の上の数字。コード進行バーが無いと数える基準が無いので、無ければ一緒に足す。 */
	const addDegreeLayer = () => {
		const chordBar = manifestRef.current.layers.find(
			(l) => l.kind === "chordBar",
		);
		if (!chordBar) addChordBarLayer();
		const layer: MvDegreeLayer = {
			kind: "degree",
			id: mvUid("deg"),
			track: song.tracks[0] ?? 0,
			x: MV_W / 2,
			y: MV_H / 2 - 40,
			anchor: "top",
			size: 14,
			color: "#f8fafc",
			bold: true,
			shadow: true,
			basis: "chord",
			key: "C",
			hold: true,
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [...m.layers, layer] }));
		setSelectedLayerId(layer.id);
	};

	const addEffectLayer = () => {
		const layer: MvEffectLayer = {
			kind: "effect",
			id: mvUid("fx"),
			style: "flash",
			trigger: "bar",
			amount: 0.5,
			decayBeats: 0.5,
			color: "#ffffff",
			z: 100,
		};
		update((m) => ({ ...m, layers: [...m.layers, layer] }));
		setSelectedLayerId(layer.id);
	};

	const removeLayer = (id: string) => {
		update((m) => ({ ...m, layers: m.layers.filter((l) => l.id !== id) }));
		if (selectedLayerId === id) setSelectedLayerId(null);
	};

	/** 選択中レイヤーと同じ設定のまま、その直下（表示順で1つ後ろ）に複製する。 */
	const duplicateLayer = (id: string) => {
		const newId = mvUid("layer");
		update((m) => {
			const index = m.layers.findIndex((l) => l.id === id);
			if (index === -1) return m;
			const src = m.layers[index];
			const clone: MvLayer = {
				...src,
				id: newId,
				name: src.name ? `${src.name}のコピー` : undefined,
			};
			const layers = [...m.layers];
			layers.splice(index + 1, 0, clone);
			return { ...m, layers };
		});
		setSelectedLayerId(newId);
	};

	const swapLayers = (i: number, j: number) => {
		update((m) => {
			const layers = [...m.layers];
			// Ensure all layers have a distinct z value before swapping
			layers.forEach((l, idx) => {
				if (l.z === undefined) l.z = (idx + 1) * 10;
			});
			const tempZ = layers[i].z;
			layers[i].z = layers[j].z;
			layers[j].z = tempZ;

			if (layers[i].z === layers[j].z) {
				layers[i].z = (i + 1) * 10;
				layers[j].z = (j + 1) * 10;
			}

			const temp = layers[i];
			layers[i] = layers[j];
			layers[j] = temp;
			return { ...m, layers };
		});
	};

	const moveLayerUp = (index: number) => {
		if (index === 0) return;
		swapLayers(index, index - 1);
	};

	const moveLayerDown = (index: number) => {
		if (index === manifest.layers.length - 1) return;
		swapLayers(index, index + 1);
	};

	const imageLayers = manifest.layers.filter(
		(l): l is MvImageLayer => l.kind === "image",
	);
	// 表(先頭)/裏(2枚目)の2つを想定。同時表示が要件なので、両方を並べて編集できるようにする。
	// 3枚目以降を作りたい場合は「レイヤー」タブから追加すれば同じ仕組みでそのまま動く。
	const lyricsLayers = manifest.layers.filter(
		(l): l is MvLyricsLayer => l.kind === "lyrics",
	);
	const lyricsLayer = lyricsLayers[0] ?? null;

	const sectionOptions = useMemo(
		() =>
			manifest.sections.map((s) => ({
				id: s.id,
				label: `${s.label}（${s.startBar}小節〜）`,
			})),
		[manifest.sections],
	);

	// ───────────────── 各タブ ─────────────────

	const presetTab = (
		<div className="space-y-2">
			<Hint>
				まず見本をひとつ選びます。あとは「曲」タブで音楽を入れて、「見た目」タブで絵を差し替えれば完成です。
			</Hint>
			{MV_PRESETS.map((p) => {
				const active = presetName === p.name;
				return (
					<button
						key={p.name}
						onClick={() => {
							if (
								!active &&
								presetName &&
								!confirm(
									`「${p.name}」に作り替えます。いまの編集内容は失われますが、よろしいですか？`,
								)
							)
								return;
							resetEditHistory();
							setManifest(p.build());
							setPresetName(p.name);
							setSelectedLayerId(null);
							setTab("song");
						}}
						className={`w-full rounded-lg border p-3 text-left transition-colors ${
							active
								? "border-blue-500/70 bg-blue-500/10"
								: "border-gray-700 bg-gray-900/60 hover:bg-gray-100/5"
						}`}
					>
						<p className="text-[13px] font-bold text-gray-100">
							{p.name}
							{active && " ✓"}
						</p>
						<p className="mt-1 text-[11px] leading-relaxed text-gray-400">
							{p.description}
						</p>
						{p.swapHint && (
							<p className="mt-1 text-[10px] leading-relaxed text-blue-300/80">
								{p.swapHint}
							</p>
						)}
					</button>
				);
			})}
		</div>
	);

	const songTab = (
		<div className="space-y-2">
			<div className={SECTION_CLASS}>
				<SectionTitle>🎵 曲をえらぶ</SectionTitle>
				<Hint>
					映像は曲に合わせて自動で動きます。拍・光り方・歌詞の出るタイミングは全部この曲から計算されるので、
					あなたがタイミングを合わせる必要はありません。
				</Hint>
				<button
					onClick={() => setPicker({ mode: "bgm", target: "stageBg" })}
					className={REF_BTN_CLASS}
				>
					<Music size={12} />
					投稿された曲から選ぶ
				</button>
				{manifest.mml ? (
					<div className="rounded border border-gray-700 bg-gray-800 p-2">
						<p className="text-[10px] text-gray-400">
							BPM {song.bpm} ／ {song.totalBars} 小節 ／ {song.tracks.length}{" "}
							トラック
							{song.lyricLines.length > 0 &&
								` ／ 歌詞 ${song.lyricLines.length} 行`}
						</p>
						<p className="mt-1 max-h-16 overflow-hidden break-all font-mono text-[9px] leading-tight text-gray-500">
							{manifest.mml.slice(0, 220)}
							{manifest.mml.length > 220 && "…"}
						</p>
					</div>
				) : (
					<p className="text-[10px] text-amber-400">
						MMLが未設定です。投稿するには曲が要ります。
					</p>
				)}
				{song.lyricTrackIds.length > 0 && (
					<Hint>この曲には歌詞が入っています。そのまま画面にも出ます。</Hint>
				)}
			</div>

			<div className={SECTION_CLASS}>
				<SectionTitle>🔊 音の出し方</SectionTitle>
				{AUDIO_MODE_OPTIONS.map((opt) => {
					const active = mvAudioMode(manifest) === opt.value;
					return (
						<button
							key={opt.value}
							onClick={() =>
								update((m) => ({ ...m, audio: { mode: opt.value } }))
							}
							className={`w-full rounded-lg border p-2 text-left transition-colors ${
								active
									? "border-blue-500/70 bg-blue-500/10"
									: "border-gray-700 bg-gray-800 hover:bg-gray-100/5"
							}`}
						>
							<p className="text-[11px] font-bold text-gray-100">
								{opt.label}
								{active && " ✓"}
							</p>
							<p className="mt-0.5 text-[10px] leading-relaxed text-gray-400">
								{MV_AUDIO_MODE_HINTS[opt.value]}
							</p>
						</button>
					);
				})}
				{song.lyricTrackIds.length === 0 &&
					mvAudioMode(manifest) === "soundfontKoe" && (
						<p className="text-[10px] text-gray-500">
							この曲には歌詞トラックが無いので、歌声は鳴りません。
						</p>
					)}
			</div>
		</div>
	);

	const stageTab = (
		<div className="space-y-2">
			<div className={SECTION_CLASS}>
				<SectionTitle>🖼 背景</SectionTitle>
				<ColorField
					label="背景色"
					value={manifest.stage.bgColor}
					onChange={(v) =>
						update((m) => ({ ...m, stage: { ...m.stage, bgColor: v } }))
					}
				/>
				<button
					onClick={() => setPicker({ mode: "image", target: "stageBg" })}
					className={REF_BTN_CLASS}
				>
					<ImageIcon size={12} />
					背景画像を参照
				</button>
				{manifest.stage.bgRef && (
					<div className="flex items-center gap-2 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[9px] text-gray-400">
						{manifest.stage.bgUrl && (
							<img
								src={manifest.stage.bgUrl}
								onError={handleImgError}
								alt=""
								className="h-7 w-7 shrink-0 rounded object-cover"
							/>
						)}
						<span className="flex-1 truncate">
							{refLabel(manifest.stage.bgRef)}
						</span>
						<button
							onClick={() =>
								update((m) => ({
									...m,
									stage: { ...m.stage, bgRef: undefined, bgUrl: undefined },
								}))
							}
							className={DEL_BTN_CLASS}
						>
							<Trash2 size={16} />
						</button>
					</div>
				)}
				<Details label="背景の細かい設定">
					<SelectField
						label="合わせ方"
						value={manifest.stage.bgFit}
						options={[
							{ value: "cover" as const, label: "画面いっぱい（はみ出す）" },
							{ value: "contain" as const, label: "全体を収める" },
							{ value: "tile" as const, label: "タイル状に敷き詰め" },
						]}
						onChange={(v) =>
							update((m) => ({ ...m, stage: { ...m.stage, bgFit: v } }))
						}
					/>
					<NumField
						label="暗くする"
						value={manifest.stage.bgDim ?? 0}
						min={0}
						max={1}
						step={0.05}
						onChange={(v) =>
							update((m) => ({ ...m, stage: { ...m.stage, bgDim: v } }))
						}
					/>
					<SelectField
						label="拍の演出"
						value={manifest.stage.pulse}
						options={[
							{ value: "none" as const, label: "なし" },
							{ value: "breathe" as const, label: "呼吸（中央がふくらむ）" },
							{ value: "flash" as const, label: "小節頭で光る" },
						]}
						onChange={(v) =>
							update((m) => ({ ...m, stage: { ...m.stage, pulse: v } }))
						}
					/>
					<CheckField
						label="開始時にフェードイン"
						checked={manifest.stage.fadeIn ?? false}
						onChange={(v) =>
							update((m) => ({ ...m, stage: { ...m.stage, fadeIn: v } }))
						}
					/>
					<CheckField
						label="終了時にフェードアウト"
						checked={manifest.stage.fadeOut ?? false}
						onChange={(v) =>
							update((m) => ({ ...m, stage: { ...m.stage, fadeOut: v } }))
						}
					/>
				</Details>
			</div>

			<div className={SECTION_CLASS}>
				<SectionTitle>🖼 素材・レイヤーの編集</SectionTitle>
				<Hint>
					画面に表示する画像・テキスト・ビジュアライザ・図形の個別設定は「レイヤー」タブおよび「場面」タブで行えます。複数の画像や場面ごとの切り替えにも対応しています。
				</Hint>
				<button
					onClick={() => setTab("layers")}
					className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-[11px] font-bold text-blue-200 hover:bg-blue-500/20"
				>
					<Layers size={14} />
					レイヤータブで画像・素材を編集する
				</button>
			</div>

			<div className={SECTION_CLASS}>
				<SectionTitle>🎨 テーマカラー（パレット）</SectionTitle>
				<Hint>
					ビジュアライザ（音符・棒・図形）や背景演出が、曲のパートやトラック切り替え時に順番に使用するカラーテーマです。
				</Hint>
				<div className="flex flex-wrap gap-2 pt-1">
					{manifest.stage.palette.map((c, i) => (
						<div
							key={i}
							className="flex flex-col items-center gap-1 rounded border border-gray-700 bg-gray-800 p-1.5"
						>
							<div className="flex items-center gap-1">
								<input
									type="color"
									value={c}
									onChange={(e) =>
										update((m) => ({
											...m,
											stage: {
												...m.stage,
												palette: m.stage.palette.map((p, j) =>
													j === i ? e.target.value : p,
												),
											},
										}))
									}
									className="h-8 w-8 cursor-pointer rounded border border-gray-700 bg-transparent"
								/>
								<button
									onClick={() =>
										update((m) => ({
											...m,
											stage: {
												...m.stage,
												palette: m.stage.palette.filter((_, j) => j !== i),
											},
										}))
									}
									className="grid h-6 w-6 place-items-center rounded text-gray-500 hover:text-red-400"
								>
									<X size={12} />
								</button>
							</div>
							<span className="text-[9px] text-gray-400">
								{i === 0 ? "色 1 (メイン)" : `色 ${i + 1}`}
							</span>
						</div>
					))}
					<button
						onClick={() =>
							update((m) => ({
								...m,
								stage: { ...m.stage, palette: [...m.stage.palette, "#ffffff"] },
							}))
						}
						className="grid h-14 w-12 shrink-0 place-items-center rounded border-2 border-dashed border-gray-600 text-gray-400 hover:bg-gray-100/5"
					>
						<Plus size={15} />
					</button>
				</div>
			</div>

			<div className={SECTION_CLASS}>
				<SectionTitle>🔤 フォント</SectionTitle>
				<SelectField
					label="フォント"
					value={manifest.stage.fontFamily ?? '""'}
					options={[
						{ value: '""', label: "標準（ドット字）" },
						{
							value: '"Hiragino Sans", "Yu Gothic", "MS PGothic", sans-serif',
							label: "ゴシック",
						},
						{
							value: '"Hiragino Mincho ProN", "Yu Mincho", "MS PMincho", serif',
							label: "明朝",
						},
						{ value: '"美咲ゴシック", monospace', label: "美咲ゴシック" },
						{ value: "'Noto Sans JP', sans-serif", label: "Noto Sans JP" },
						{ value: "'Kaisei Decol', serif", label: "Kaisei Decol" },
						{ value: "'DotGothic16', sans-serif", label: "DotGothic16" },
						{ value: "'Dela Gothic One', cursive", label: "Dela Gothic One" },
						{ value: "'Potta One', cursive", label: "Potta One" },
						{ value: "'Hachi Maru Pop', cursive", label: "Hachi Maru Pop" },
					]}
					onChange={(v) =>
						update((m) => ({
							...m,
							stage: { ...m.stage, fontFamily: v === '""' ? undefined : v },
						}))
					}
				/>
			</div>
		</div>
	);

	const selectedLayer =
		manifest.layers.find((l) => l.id === selectedLayerId) ?? null;

	const renderLayerSettings = (layer: MvLayer) => (
		<div className="space-y-4 pt-1">
			<label className="block space-y-0.5">
				<span className={FIELD_LABEL_CLASS}>
					名前（レイヤー一覧での見出し。空なら自動）
				</span>
				<input
					value={layer.name ?? ""}
					placeholder={layerKindLabel(layer)}
					onChange={(e) =>
						updateLayer(layer.id, (l) => ({
							...l,
							name: e.target.value || undefined,
						}))
					}
					className={FIELD_INPUT_CLASS}
				/>
			</label>

			{layer.kind === "image" && (
				<>
					<button
						onClick={() =>
							setPicker({ mode: "image", target: { layerId: layer.id } })
						}
						className={REF_BTN_CLASS}
					>
						<ImageIcon size={12} />
						画像を参照
					</button>
					{layer.url && (
						<img
							src={layer.url}
							onError={handleImgError}
							alt=""
							className="h-12 w-12 rounded border border-gray-700 object-contain"
						/>
					)}
					<NumField
						label="X"
						value={layer.x}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, x: v }) as MvLayer)
						}
					/>
					<NumField
						label="Y"
						value={layer.y}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, y: v }) as MvLayer)
						}
					/>
					<NumField
						label="拡大率"
						value={layer.scale}
						min={0.1}
						step={0.5}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, scale: v }) as MvLayer)
						}
					/>
					<NumField
						label="🚶 歩行グラのコマ送り速度倍率"
						value={mvWalkSpeed(manifest)}
						min={0.1}
						step={0.1}
						onChange={(v) =>
							update((m) => ({ ...m, walkSpeed: Math.max(0.1, v) }))
						}
					/>
					<CheckField
						label="ドット絵として粗く表示"
						checked={!!layer.pixelated}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, pixelated: v }) as MvLayer)
						}
					/>
					<CheckField
						label="左右反転（鏡像）"
						checked={!!layer.flipH}
						onChange={(v) =>
							updateLayer(
								layer.id,
								(l) => ({ ...l, flipH: v || undefined }) as MvLayer,
							)
						}
					/>
					<CheckField
						label="上下反転（逆さま）"
						checked={!!layer.flipV}
						onChange={(v) =>
							updateLayer(
								layer.id,
								(l) => ({ ...l, flipV: v || undefined }) as MvLayer,
							)
						}
					/>

					<div className="space-y-2 rounded border border-gray-800 bg-gray-950/30 p-2">
						<p className="text-[10px] font-bold text-gray-400">
							✨ 登場のしかた
						</p>
						<Hint>
							この絵が出てくる場面に入った瞬間の演出です。向きが「その場」でフェードインも無しなら、
							いままでどおり瞬時に出ます。
						</Hint>
						<SelectField
							label="出てくる向き"
							value={layer.entrance?.from ?? "none"}
							options={ENTER_FROM_OPTIONS}
							onChange={(v) => updateEntrance(layer.id, { from: v })}
						/>
						<CheckField
							label="透明から現れる（フェードイン）"
							checked={!!layer.entrance?.fade}
							onChange={(v) => updateEntrance(layer.id, { fade: v })}
						/>
						{!isMvEntranceInert(layer.entrance) && layer.entrance && (
							<>
								<NumField
									label="かける長さ（拍）"
									value={layer.entrance.beats}
									min={0}
									step={0.5}
									onChange={(v) => updateEntrance(layer.id, { beats: v })}
								/>
								{layer.entrance.from !== "none" && (
									<NumField
										label="動く距離（px）"
										value={mvEntranceDistance(layer.entrance)}
										step={10}
										onChange={(v) => updateEntrance(layer.id, { distance: v })}
									/>
								)}
							</>
						)}
					</div>

					<CheckField
						label="歩行グラとしてアニメさせる"
						checked={!!layer.walk}
						onChange={(v) =>
							updateLayer(
								layer.id,
								(l) =>
									({
										...l,
										walk: v ? { stdId: "auto", dir: "s", fps: 4 } : undefined,
									}) as MvLayer,
							)
						}
					/>
					<CheckField
						label="同じ画像を並べる"
						checked={!!layer.repeat}
						onChange={(v) =>
							updateLayer(
								layer.id,
								(l) =>
									({
										...l,
										repeat: v
											? {
													count: 5,
													dx: 42,
													dy: 0,
													scaleStep: 0,
													alphaStep: -0.12,
													phase: 0.25,
												}
											: undefined,
									}) as MvLayer,
							)
						}
					/>
					{layer.repeat && (
						<Details label="並べ方を調整する">
							<NumField
								label="個数"
								value={layer.repeat.count}
								min={1}
								max={64}
								onChange={(v) => updateRepeat(layer.id, { count: v })}
							/>
							<NumField
								label="横のずれ"
								value={layer.repeat.dx}
								onChange={(v) => updateRepeat(layer.id, { dx: v })}
							/>
							<NumField
								label="縦のずれ"
								value={layer.repeat.dy}
								onChange={(v) => updateRepeat(layer.id, { dy: v })}
							/>
							<NumField
								label="拡大の変化"
								value={layer.repeat.scaleStep ?? 0}
								step={0.1}
								onChange={(v) => updateRepeat(layer.id, { scaleStep: v })}
							/>
							<NumField
								label="濃さの変化"
								value={layer.repeat.alphaStep ?? 0}
								step={0.05}
								onChange={(v) => updateRepeat(layer.id, { alphaStep: v })}
							/>
							<NumField
								label="足踏みのずれ"
								value={layer.repeat.phase ?? 0}
								step={0.05}
								onChange={(v) => updateRepeat(layer.id, { phase: v })}
							/>
						</Details>
					)}
				</>
			)}

			{layer.kind === "text" && (
				<>
					<textarea
						value={layer.text}
						onChange={(e) =>
							updateLayer(
								layer.id,
								(l) => ({ ...l, text: e.target.value }) as MvLayer,
							)
						}
						className={`${INPUT_CLASS} h-16 resize-none`}
					/>
					<NumField
						label="X"
						value={layer.x}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, x: v }) as MvLayer)
						}
					/>
					<NumField
						label="Y"
						value={layer.y}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, y: v }) as MvLayer)
						}
					/>
					<NumField
						label="文字サイズ"
						value={layer.size}
						min={6}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, size: v }) as MvLayer)
						}
					/>
					<ColorField
						label="文字色"
						value={layer.color}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, color: v }) as MvLayer)
						}
					/>
					<CheckField
						label="縦書き"
						checked={layer.vertical}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, vertical: v }) as MvLayer)
						}
					/>
					<CheckField
						label="太字"
						checked={!!layer.bold}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, bold: v }) as MvLayer)
						}
					/>
				</>
			)}

			{layer.kind === "visualizer" && (
				<>
					<SelectField
						label="種類"
						value={layer.style}
						options={VISUALIZER_OPTIONS}
						onChange={(v) =>
							updateLayer(layer.id, (l) => {
								// ピアノロールは3D表示が既定（見せ方が未設定のときだけ立体を入れる）
								const next = { ...l, style: v } as MvLayer;
								if (
									v === "pianoRoll" &&
									next.kind === "visualizer" &&
									!next.projection
								)
									next.projection = "perspective";
								return next;
							})
						}
					/>
					<NumField
						label="X"
						value={layer.rect.x}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "visualizer"
									? { ...l, rect: { ...l.rect, x: v } }
									: l,
							)
						}
					/>
					<NumField
						label="Y"
						value={layer.rect.y}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "visualizer"
									? { ...l, rect: { ...l.rect, y: v } }
									: l,
							)
						}
					/>
					<NumField
						label="幅"
						value={layer.rect.w}
						min={8}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "visualizer"
									? { ...l, rect: { ...l.rect, w: v } }
									: l,
							)
						}
					/>
					<NumField
						label="高さ"
						value={layer.rect.h}
						min={8}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "visualizer"
									? { ...l, rect: { ...l.rect, h: v } }
									: l,
							)
						}
					/>
					<NumField
						label="細かさ"
						value={layer.amount ?? 16}
						min={1}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, amount: v }) as MvLayer)
						}
					/>
					<p className="text-[10px] leading-relaxed text-gray-500">
						「細かさ」はピアノロールなら画面に映る小節数、ステップ格子なら1小節の分割数、
						波紋なら同時に出る輪の数、スペアナなら棒の本数です。
					</p>
					<CheckField
						label="光らせる"
						checked={!!layer.glow}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, glow: v }) as MvLayer)
						}
					/>

					<div className="space-y-2 rounded-lg border border-blue-500/40 bg-blue-500/10 p-2.5">
						<p className="text-[11px] font-bold text-blue-200">
							🎹 光る・反応するMMLトラックの選択
						</p>
						<p className="text-[10px] leading-relaxed text-gray-300">
							画面下部のピアノロール（音符）で、どのトラックの音を光らせるかを選択します。未選択時は全トラックの音で光ります。
						</p>
						<div className="flex flex-wrap gap-1.5 pb-0.5">
							<button
								type="button"
								onClick={() =>
									updateLayer(layer.id, (l) =>
										l.kind === "visualizer" ? { ...l, tracks: [...song.tracks] } : l,
									)
								}
								className="rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-200 hover:bg-gray-600"
							>
								全選択
							</button>
							<button
								type="button"
								onClick={() =>
									updateLayer(layer.id, (l) =>
										l.kind === "visualizer" ? { ...l, tracks: undefined } : l,
									)
								}
								className="rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-200 hover:bg-gray-600"
							>
								全解除 (全音表示)
							</button>
						</div>
						<div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-0.5">
							{song.tracks.map((t) => {
								const count = trackNoteCounts[t] ?? 0;
								const checked = !!layer.tracks?.includes(t);
								return (
									<label
										key={t}
										className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-[10px] cursor-pointer border transition-colors ${
											checked
												? "border-blue-500 bg-blue-600/30 text-blue-100 font-bold"
												: "border-gray-700 bg-gray-900/80 text-gray-300 hover:bg-gray-800"
										}`}
									>
										<input
											type="checkbox"
											checked={checked}
											onChange={(e) => {
												const v = e.target.checked;
												updateLayer(layer.id, (l) => {
													if (l.kind !== "visualizer") return l;
													const cur = l.tracks ?? [];
													const next = v ? [...cur, t] : cur.filter((x) => x !== t);
													return {
														...l,
														tracks: next.length > 0 ? next : undefined,
													};
												});
											}}
											className="h-3.5 w-3.5 shrink-0 rounded border-gray-600 text-blue-600 accent-blue-500"
										/>
										<span className="truncate">
											トラック @{t} ({count}音)
										</span>
									</label>
								);
							})}
						</div>
					</div>

					{layer.style === "pianoRoll" && (
						<>
							<SelectField
								label="見せ方"
								value={layer.projection ?? "flat"}
								options={PROJECTION_OPTIONS}
								onChange={(v) =>
									updateLayer(
										layer.id,
										(l) => ({ ...l, projection: v }) as MvLayer,
									)
								}
							/>
							{(layer.projection ?? "flat") === "flat" && (
								<>
									<SelectField
										label="譜面の動き"
										value={layer.flow ?? "scroll"}
										options={ROLL_FLOW_OPTIONS}
										onChange={(v) =>
											updateLayer(
												layer.id,
												(l) => ({ ...l, flow: v }) as MvLayer,
											)
										}
									/>
									<Hint>
										「固定」は譜面が横に動かず、上の小節数ぶんを並べたまま、その小節が終わると
										次の譜面へ丸ごと差し替わります。
									</Hint>
								</>
							)}
							<Details label="音の光り方と余韻">
								<Hint>
									まだ鳴っていない音をどれくらい薄く置いておくかと、鳴った音がどう消えるかです。
									薄さを上げすぎると、どれが今鳴っている音なのか画から読めなくなります。
								</Hint>
								<NumField
									label="鳴っていない音の濃さ（0〜1）"
									value={noteLight(layer).dim}
									min={0}
									max={1}
									step={0.02}
									onChange={(v) =>
										updateLight(layer.id, { dim: Math.max(0, Math.min(1, v)) })
									}
								/>
								<CheckField
									label="鳴り終わった音を消す"
									checked={noteLight(layer).fadeOut}
									onChange={(v) => updateLight(layer.id, { fadeOut: v })}
								/>
								<CheckField
									label="余韻を出す（音の頭から輪郭が広がって消える）"
									checked={!!noteLight(layer).echo}
									onChange={(v) =>
										updateLight(layer.id, {
											echo: v
												? { beats: 0.5, spread: 7, thickness: 1.5 }
												: undefined,
										})
									}
								/>
								{noteLight(layer).echo && (
									<>
										<NumField
											label="余韻の長さ（拍）"
											value={noteLight(layer).echo?.beats}
											min={0.1}
											max={4}
											step={0.1}
											onChange={(v) => updateEcho(layer.id, { beats: v })}
										/>
										<NumField
											label="広がる大きさ"
											value={noteLight(layer).echo?.spread}
											min={0}
											max={60}
											onChange={(v) => updateEcho(layer.id, { spread: v })}
										/>
										<NumField
											label="輪郭の太さ"
											value={noteLight(layer).echo?.thickness}
											min={0.5}
											max={8}
											step={0.5}
											onChange={(v) => updateEcho(layer.id, { thickness: v })}
										/>
									</>
								)}
							</Details>
							{(layer.projection ?? "flat") === "perspective" && (
								<Details label="見る角度を調整する">
									<Hint>
										スライダーを動かすと、リアルタイムで3Dの視点が回転・移動します。
									</Hint>
									<Hint>
										MIDITrail のように、ノートの板を好きな角度から見られます。
									</Hint>
									<NumField
										label="見下ろし"
										value={(layer.view ?? DEFAULT_MV_VIEW).pitch}
										min={-89}
										max={89}
										onChange={(v) => updateView(layer.id, { pitch: v })}
									/>
									<NumField
										label="回り込み"
										value={(layer.view ?? DEFAULT_MV_VIEW).yaw}
										min={-89}
										max={89}
										onChange={(v) => updateView(layer.id, { yaw: v })}
									/>
									<NumField
										label="傾き"
										value={(layer.view ?? DEFAULT_MV_VIEW).roll}
										min={-180}
										max={180}
										onChange={(v) => updateView(layer.id, { roll: v })}
									/>
									<NumField
										label="画角"
										value={(layer.view ?? DEFAULT_MV_VIEW).fov}
										min={10}
										max={120}
										onChange={(v) => updateView(layer.id, { fov: v })}
									/>
									<NumField
										label="奥行き"
										value={(layer.view ?? DEFAULT_MV_VIEW).depth}
										min={100}
										step={50}
										onChange={(v) => updateView(layer.id, { depth: v })}
									/>
									<NumField
										label="ノートの厚み"
										value={(layer.view ?? DEFAULT_MV_VIEW).thickness}
										min={0}
										step={1}
										onChange={(v) => updateView(layer.id, { thickness: v })}
									/>
								</Details>
							)}
							{layer.projection === "circular" && (
								<Details label="円の形を調整する">
									<Hint>音の高さを円周に、時間を外側へ向かって並べます。</Hint>
									<NumField
										label="内側の半径"
										value={(layer.ring ?? DEFAULT_MV_RING).innerRadius}
										min={0}
										onChange={(v) => updateRing(layer.id, { innerRadius: v })}
									/>
									<NumField
										label="円弧の角度"
										value={(layer.ring ?? DEFAULT_MV_RING).sweep}
										min={30}
										max={360}
										onChange={(v) => updateRing(layer.id, { sweep: v })}
									/>
									<NumField
										label="回転"
										value={(layer.ring ?? DEFAULT_MV_RING).rotate}
										min={-360}
										max={360}
										onChange={(v) => updateRing(layer.id, { rotate: v })}
									/>
								</Details>
							)}
						</>
					)}
				</>
			)}

			{layer.kind === "shape" && (
				<>
					<SelectField
						label="形"
						value={layer.form}
						options={SHAPE_FORM_OPTIONS}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, form: v }) as MvLayer)
						}
					/>
					<NumField
						label="X"
						value={layer.x}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, x: v }) as MvLayer)
						}
					/>
					<NumField
						label="Y"
						value={layer.y}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, y: v }) as MvLayer)
						}
					/>
					<NumField
						label="大きさ"
						value={layer.size}
						min={1}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, size: v }) as MvLayer)
						}
					/>
					<NumField
						label="回転"
						value={layer.rotation}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, rotation: v }) as MvLayer)
						}
					/>
					<ColorField
						label="色"
						value={layer.color}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, color: v }) as MvLayer)
						}
					/>
					<CheckField
						label="塗りつぶす"
						checked={layer.filled}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, filled: v }) as MvLayer)
						}
					/>
					<NumField
						label="線の太さ"
						value={layer.thickness}
						min={0.2}
						step={0.5}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, thickness: v }) as MvLayer)
						}
					/>
					<div className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-2.5 space-y-1.5">
						<p className="text-[11px] font-bold text-blue-200">
							🎬 図形の動き（アニメーション）設定
						</p>
						<p className="text-[10px] text-gray-300 leading-relaxed">
							真ん中の図形が曲の拍やパートに合わせて回転・脈動拡大・左右移動する動きを設定します。
						</p>
						<button
							type="button"
							onClick={() =>
								setMotionTarget({
									layerId: layer.id,
									sectionId: manifest.sections[0]?.id ?? "__all__",
								})
							}
							className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-500 shadow-sm transition-colors"
						>
							<Clapperboard size={14} />
							図形の動き（アニメーション）を編集する
						</button>
					</div>

					{layer.form === "polygon" && (
						<NumField
							label="角の数"
							value={layer.sides ?? 6}
							min={3}
							max={24}
							onChange={(v) =>
								updateLayer(layer.id, (l) => ({ ...l, sides: v }) as MvLayer)
							}
						/>
					)}
					{layer.form === "path" && (
						<>
							<label className="block space-y-0.5">
								<span className={FIELD_LABEL_CLASS}>
									形のデータ（SVGを丸ごと貼り付けてもOK）
								</span>
								<textarea
									value={layer.path ?? ""}
									placeholder="M50 5 L95 50 L50 95 L5 50 Z　または <svg …>…</svg>"
									onChange={(e) => {
										const text = e.target.value;
										const extracted = extractSvgPaths(text);
										updateLayer(layer.id, (l) =>
											l.kind === "shape"
												? {
														...l,
														path: extracted ? extracted.d : text,
														pathBox: extracted?.box ?? l.pathBox,
													}
												: l,
										);
									}}
									className={`${INPUT_CLASS} h-20 resize-none font-mono text-[10px]`}
								/>
							</label>
							<Hint>
								SVGファイルの中身を貼り付けると、パスと viewBox
								を自動で取り込みます。
								複数のパスはひとつの形として重なり、重なった部分は穴として抜けます。
							</Hint>
							<NumField
								label="設計サイズ（viewBoxの幅。自動取り込み時は触らなくてOK）"
								value={layer.pathBox?.[2] ?? 100}
								min={1}
								onChange={(v) =>
									updateLayer(layer.id, (l) =>
										l.kind === "shape" ? { ...l, pathBox: [0, 0, v, v] } : l,
									)
								}
							/>

							<CheckField
								label="形を差し替える（コマ送りアニメ）"
								checked={!!layer.iconCycle}
								onChange={(v) =>
									updateLayer(layer.id, (l) => {
										if (l.kind !== "shape") return l;
										if (!v) {
											const { iconCycle: _drop, ...rest } = l;
											return rest;
										}
										return {
											...l,
											iconCycle: l.iconCycle ?? {
												beats: 1,
												paths: [l.path ?? "M50,50 L60,50 L60,60 L50,60 Z"],
											},
										};
									})
								}
							/>
							{layer.iconCycle && (
								<Details
									label={`差し替えコマ（${layer.iconCycle.paths.length}枚）`}
								>
									<Hint>
										上から順に1周ぶんのコマです。上の「形のデータ」欄は使われなくなり、
										ここに並べたコマだけが切り替わります。
									</Hint>
									<SelectField
										label="進み方"
										value={"advance" in layer.iconCycle ? "onset" : "beats"}
										options={[
											{
												value: "beats" as const,
												label: "拍ロック（一定間隔）",
											},
											{
												value: "onset" as const,
												label: "発音ロック（音が鳴るたびに1コマ進む）",
											},
										]}
										onChange={(v) =>
											updateLayer(layer.id, (l) => {
												if (l.kind !== "shape" || !l.iconCycle) return l;
												const paths = l.iconCycle.paths;
												return {
													...l,
													iconCycle:
														v === "onset"
															? { paths, advance: "onset" as const }
															: { paths, beats: 1 },
												};
											})
										}
									/>
									<Hint>
										参考動画のコマ送り実測(93.7秒あたりの16分音符連打)では、静かな箇所の
										4倍近い速さで形が切り替わっていた——拍ではなく発音回数に連動していた。
										迷ったら「発音ロック」を選ぶ。
									</Hint>
									{"advance" in layer.iconCycle ? (
										<SelectField
											label="どのトラックの発音で進めるか"
											value={String(layer.iconCycle.track ?? "all")}
											options={[
												{ value: "all", label: "全トラック合算" },
												...song.tracks.map((t) => ({
													value: String(t),
													label: `トラック @${t}`,
												})),
											]}
											onChange={(v) =>
												updateLayer(layer.id, (l) =>
													l.kind === "shape" &&
													l.iconCycle &&
													"advance" in l.iconCycle
														? {
																...l,
																iconCycle: {
																	...l.iconCycle,
																	track: v === "all" ? undefined : Number(v),
																},
															}
														: l,
												)
											}
										/>
									) : (
										<>
											<NumField
												label="何拍で1周するか"
												value={layer.iconCycle.beats}
												min={0.1}
												step={0.1}
												onChange={(v) =>
													updateLayer(layer.id, (l) =>
														l.kind === "shape" &&
														l.iconCycle &&
														!("advance" in l.iconCycle)
															? {
																	...l,
																	iconCycle: { ...l.iconCycle, beats: v },
																}
															: l,
													)
												}
											/>
											<NumField
												label="何小節ごとに1コマ目(頭の形)へ戻すか（0で戻さない）"
												value={layer.iconCycle.resetEveryBars ?? 0}
												min={0}
												step={1}
												onChange={(v) =>
													updateLayer(layer.id, (l) =>
														l.kind === "shape" &&
														l.iconCycle &&
														!("advance" in l.iconCycle)
															? {
																	...l,
																	iconCycle: {
																		...l.iconCycle,
																		resetEveryBars: v > 0 ? v : undefined,
																	},
																}
															: l,
													)
												}
											/>
											<Hint>
												場面が8小節ごとに切り替わる曲なら8を指定すると、場面の頭で1コマ目
												(シンプルな形)に戻り、残りの小節でコマ2以降を順にめぐるループになります。
											</Hint>
										</>
									)}
									{layer.iconCycle.paths.map((p, i) => (
										<div key={i} className="flex items-start gap-1.5">
											<span className="mt-2 w-5 shrink-0 text-center text-[10px] text-gray-500">
												{i + 1}
											</span>
											<textarea
												value={p}
												placeholder="M50 5 L95 50 L50 95 L5 50 Z"
												onChange={(e) => {
													const text = e.target.value;
													updateLayer(layer.id, (l) =>
														l.kind === "shape" && l.iconCycle
															? {
																	...l,
																	iconCycle: {
																		...l.iconCycle,
																		paths: l.iconCycle.paths.map((x, j) =>
																			j === i ? text : x,
																		),
																	},
																}
															: l,
													);
												}}
												className={`${INPUT_CLASS} h-12 min-w-0 flex-1 resize-none font-mono text-[10px]`}
											/>
											<button
												onClick={() =>
													updateLayer(layer.id, (l) =>
														l.kind === "shape" && l.iconCycle
															? {
																	...l,
																	iconCycle: {
																		...l.iconCycle,
																		paths: l.iconCycle.paths.filter(
																			(_, j) => j !== i,
																		),
																	},
																}
															: l,
													)
												}
												disabled={(layer.iconCycle?.paths.length ?? 0) <= 1}
												className={`${DEL_BTN_CLASS} mt-0.5 disabled:opacity-30`}
											>
												<Trash2 size={16} />
											</button>
										</div>
									))}
									<button
										onClick={() =>
											updateLayer(layer.id, (l) =>
												l.kind === "shape" && l.iconCycle
													? {
															...l,
															iconCycle: {
																...l.iconCycle,
																paths: [
																	...l.iconCycle.paths,
																	l.iconCycle.paths[
																		l.iconCycle.paths.length - 1
																	] ?? "M50,50 L60,50 L60,60 L50,60 Z",
																],
															},
														}
													: l,
											)
										}
										className={ADD_BTN_CLASS}
									>
										<Plus size={13} />
										コマを追加
									</button>
								</Details>
							)}
						</>
					)}
					<NumField
						label="個数"
						value={layer.count ?? 1}
						min={1}
						max={64}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, count: v }) as MvLayer)
						}
					/>
					{(layer.count ?? 1) > 1 && (
						<Details label="1個ごとのずらし方">
							<NumField
								label="大きさの差"
								value={layer.spread ?? 0}
								onChange={(v) =>
									updateLayer(layer.id, (l) => ({ ...l, spread: v }) as MvLayer)
								}
							/>
							<NumField
								label="回転の差"
								value={layer.spin ?? 0}
								onChange={(v) =>
									updateLayer(layer.id, (l) => ({ ...l, spin: v }) as MvLayer)
								}
							/>
							<NumField
								label="横のずれ"
								value={layer.offsetX ?? 0}
								onChange={(v) =>
									updateLayer(
										layer.id,
										(l) => ({ ...l, offsetX: v }) as MvLayer,
									)
								}
							/>
							<NumField
								label="縦のずれ"
								value={layer.offsetY ?? 0}
								onChange={(v) =>
									updateLayer(
										layer.id,
										(l) => ({ ...l, offsetY: v }) as MvLayer,
									)
								}
							/>
							<NumField
								label="反応の遅れ"
								value={layer.stagger ?? 0}
								min={0}
								step={4}
								onChange={(v) =>
									updateLayer(
										layer.id,
										(l) => ({ ...l, stagger: v }) as MvLayer,
									)
								}
							/>
							<Hint>
								「反応の遅れ」を入れると、端から順に反応が伝わる波のような動きになります。
							</Hint>
						</Details>
					)}
					<SelectField
						label="重ね方"
						value={layer.blend ?? "normal"}
						options={BLEND_OPTIONS}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, blend: v }) as MvLayer)
						}
					/>

					<Details label={`音との連動（${layer.modulators.length}件）`}>
						<Hint>
							「曲のどこが」「形のどこに」「どう効くか」を1行ずつ足していきます。
							上から順に計算するので、足し算のあとに掛け算を重ねる…といった組み方ができます。
							むずかしければ触らなくて大丈夫です。
						</Hint>
						{layer.modulators.map((mod, i) => (
							<ModulatorRow
								key={i}
								mod={mod}
								tracks={song.tracks}
								onChange={(next) => updateMod(layer.id, i, next)}
								onRemove={() => removeMod(layer.id, i)}
							/>
						))}
						<button onClick={() => addMod(layer.id)} className={ADD_BTN_CLASS}>
							<Plus size={13} />
							連動を追加
						</button>
					</Details>
				</>
			)}

			{layer.kind === "effect" && (
				<>
					<SelectField
						label="演出"
						value={layer.style}
						options={EFFECT_STYLE_OPTIONS}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, style: v }) as MvLayer)
						}
					/>
					<SelectField
						label="タイミング"
						value={layer.trigger}
						options={TRIGGER_OPTIONS}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, trigger: v }) as MvLayer)
						}
					/>
					{layer.trigger === "bars" && (
						<label className="block space-y-0.5">
							<span className={FIELD_LABEL_CLASS}>
								発火する小節（カンマ区切り。0始まり、小数も可）
							</span>
							<input
								key={layer.id}
								defaultValue={(layer.bars ?? []).join(", ")}
								placeholder="例: 8, 16, 24.5"
								onChange={(e) => {
									const bars = parseBarList(e.target.value);
									updateLayer(layer.id, (l) =>
										l.kind === "effect"
											? { ...l, bars: bars.length > 0 ? bars : undefined }
											: l,
									);
								}}
								className={FIELD_INPUT_CLASS}
							/>
							<Hint>
								書いた小節の頭でだけ発火します。サビ頭など「決めの瞬間」に使ってください。
							</Hint>
						</label>
					)}
					{layer.trigger === "note" && (
						<div className="space-y-1 rounded border border-gray-700/70 bg-gray-900/60 p-2">
							<p className="text-[10px] text-gray-400">
								どのトラックの音で光らせるか（未選択なら全部）
							</p>
							{song.tracks.map((t) => (
								<CheckField
									key={t}
									label={`トラック @${t}`}
									checked={!!layer.tracks?.includes(t)}
									onChange={(v) =>
										updateLayer(layer.id, (l) => {
											if (l.kind !== "effect") return l;
											const cur = l.tracks ?? [];
											const next = v ? [...cur, t] : cur.filter((x) => x !== t);
											return {
												...l,
												tracks: next.length > 0 ? next : undefined,
											};
										})
									}
								/>
							))}
						</div>
					)}
					<NumField
						label="強さ"
						value={layer.amount}
						min={0}
						max={1}
						step={0.05}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, amount: v }) as MvLayer)
						}
					/>
					<NumField
						label="長さ（拍）"
						value={layer.decayBeats ?? 1}
						min={0.05}
						step={0.05}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, decayBeats: v }) as MvLayer)
						}
					/>
					{layer.style !== "invert" && (
						<ColorField
							label="色"
							value={layer.color ?? "#ffffff"}
							onChange={(v) =>
								updateLayer(layer.id, (l) => ({ ...l, color: v }) as MvLayer)
							}
						/>
					)}
				</>
			)}

			{layer.kind === "degree" && (
				<>
					<Hint>
						そのトラックでいま鳴っている音が、コードの根音から何番目かを数字で出します。
						キャラの頭の上に置くと、誰がどの音を出しているのかが見えるようになります。
					</Hint>
					<SelectField
						label="どのトラックの音か"
						value={String(layer.track)}
						options={(song.tracks.length > 0 ? song.tracks : [0]).map((t) => ({
							value: String(t),
							label: `@${t}`,
						}))}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "degree" ? { ...l, track: Number(v) } : l,
							)
						}
					/>
					<SelectField
						label="何から数えるか"
						value={layer.basis}
						options={[
							{
								value: "chord" as const,
								label: "いまのコードの根音（参考動画と同じ）",
							},
							{ value: "key" as const, label: "曲のキーの主音" },
						]}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "degree" ? { ...l, basis: v } : l,
							)
						}
					/>
					<SelectField
						label="キー"
						value={layer.key}
						options={Object.keys(MV_ROOT_TO_PITCH).map((k) => ({
							value: k,
							label: k,
						}))}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "degree" ? { ...l, key: v } : l,
							)
						}
					/>
					<NumField
						label="X"
						value={layer.x}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, x: v }) as MvLayer)
						}
					/>
					<NumField
						label="Y"
						value={layer.y}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, y: v }) as MvLayer)
						}
					/>
					<NumField
						label="文字サイズ"
						value={layer.size}
						min={6}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, size: v }) as MvLayer)
						}
					/>
					<ColorField
						label="文字色"
						value={layer.color}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, color: v }) as MvLayer)
						}
					/>
					<CheckField
						label="音が切れても数字を残す"
						checked={!!layer.hold}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "degree" ? { ...l, hold: v } : l,
							)
						}
					/>
				</>
			)}

			{layer.kind === "chordBar" && (
				<>
					<NumField
						label="X"
						value={layer.rect.x}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "chordBar" ? { ...l, rect: { ...l.rect, x: v } } : l,
							)
						}
					/>
					<NumField
						label="Y"
						value={layer.rect.y}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "chordBar" ? { ...l, rect: { ...l.rect, y: v } } : l,
							)
						}
					/>
					<NumField
						label="幅"
						value={layer.rect.w}
						min={8}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "chordBar" ? { ...l, rect: { ...l.rect, w: v } } : l,
							)
						}
					/>
					<NumField
						label="高さ"
						value={layer.rect.h}
						min={8}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "chordBar" ? { ...l, rect: { ...l.rect, h: v } } : l,
							)
						}
					/>
					<NumField
						label="文字サイズ"
						value={layer.size}
						min={5}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, size: v }) as MvLayer)
						}
					/>
					<SelectField
						label="キー"
						value={layer.key}
						options={Object.keys(MV_ROOT_TO_PITCH).map((k) => ({
							value: k,
							label: k,
						}))}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, key: v }) as MvLayer)
						}
					/>
					<SelectField
						label="色分け"
						value={layer.colorMode}
						options={[
							{ value: "degree" as const, label: "度数で色分け" },
							{ value: "fixed" as const, label: "全部同じ色" },
						]}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, colorMode: v }) as MvLayer)
						}
					/>
					{layer.colorMode === "fixed" && (
						<ColorField
							label="ブロック色"
							value={layer.color}
							onChange={(v) =>
								updateLayer(layer.id, (l) => ({ ...l, color: v }) as MvLayer)
							}
						/>
					)}
					<ColorField
						label="いまの色"
						value={layer.activeColor}
						onChange={(v) =>
							updateLayer(
								layer.id,
								(l) => ({ ...l, activeColor: v }) as MvLayer,
							)
						}
					/>
					<ColorField
						label="文字色"
						value={layer.textColor}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, textColor: v }) as MvLayer)
						}
					/>

					<p className="pt-1 text-[10px] font-bold text-gray-400">コード進行</p>
					<p className="text-[10px] leading-relaxed text-gray-500">
						小節番号とコード名を並べます。次のコードが始まるまでが1ブロックの長さです。
					</p>
					{layer.chords.map((c, i) => (
						<div key={i} className="flex items-center gap-1.5">
							<StringNumInput
								value={c.bar}
								onChange={(n) =>
									updateLayer(layer.id, (l) =>
										l.kind === "chordBar"
											? {
													...l,
													chords: l.chords.map((x, j) =>
														j === i ? { ...x, bar: n } : x,
													),
												}
											: l,
									)
								}
								className="min-h-9 w-16 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
							/>
							<input
								value={c.label}
								placeholder="F#m7"
								onChange={(e) =>
									updateLayer(layer.id, (l) =>
										l.kind === "chordBar"
											? {
													...l,
													chords: l.chords.map((x, j) =>
														j === i ? { ...x, label: e.target.value } : x,
													),
												}
											: l,
									)
								}
								className="min-h-9 min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-100 outline-none"
							/>
							<button
								onClick={() =>
									updateLayer(layer.id, (l) =>
										l.kind === "chordBar"
											? { ...l, chords: l.chords.filter((_, j) => j !== i) }
											: l,
									)
								}
								className={DEL_BTN_CLASS}
							>
								<Trash2 size={16} />
							</button>
						</div>
					))}
					<button
						onClick={() =>
							updateLayer(layer.id, (l) =>
								l.kind === "chordBar"
									? {
											...l,
											chords: [
												...l.chords,
												{ bar: l.chords.length, label: "C" },
											],
										}
									: l,
							)
						}
						className={ADD_BTN_CLASS}
					>
						<Plus size={13} />
						コードを追加
					</button>
				</>
			)}

			{(layer.kind === "image" || layer.kind === "text") && (
				<>
					<SelectField
						label="動き"
						value={layer.motion}
						options={MOTION_OPTIONS}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, motion: v }) as MvLayer)
						}
					/>
					<NumField
						label="動きの強さ"
						value={layer.motionAmount ?? 0}
						step={1}
						onChange={(v) =>
							updateLayer(
								layer.id,
								(l) => ({ ...l, motionAmount: v }) as MvLayer,
							)
						}
					/>
				</>
			)}

			<NumField
				label="重なり順"
				value={layer.z ?? 0}
				onChange={(v) =>
					updateLayer(layer.id, (l) => ({ ...l, z: v }) as MvLayer)
				}
			/>
			<NumField
				label="不透明度"
				value={layer.opacity ?? 1}
				min={0}
				max={1}
				step={0.05}
				onChange={(v) =>
					updateLayer(layer.id, (l) => ({ ...l, opacity: v }) as MvLayer)
				}
			/>

			<p className="pt-1 text-[10px] font-bold text-gray-400">出す場面</p>
			<p className="text-[10px] text-gray-500">
				どれも選ばなければ、全部の場面で出ます。
			</p>
			{sectionOptions.map((s) => (
				<CheckField
					key={s.id}
					label={s.label}
					checked={!!layer.sections?.includes(s.id)}
					onChange={(v) =>
						updateLayer(layer.id, (l) => {
							const cur = l.sections ?? [];
							const next = v ? [...cur, s.id] : cur.filter((x) => x !== s.id);
							return { ...l, sections: next.length > 0 ? next : undefined };
						})
					}
				/>
			))}
		</div>
	);

	const layersTab = (
		<div className="space-y-2">
			<div className={SECTION_CLASS}>
				<SectionTitle>
					<Layers size={12} className="mr-1 inline" />
					レイヤー
				</SectionTitle>
				<div className="grid grid-cols-3 gap-1.5 pb-2">
					<button onClick={addImageLayer} className={ADD_BTN_CLASS}>
						<Plus size={12} />
						画像
					</button>
					<button onClick={addTextLayer} className={ADD_BTN_CLASS}>
						<Plus size={12} />
						文字
					</button>
					<button onClick={addVisualizerLayer} className={ADD_BTN_CLASS}>
						<Plus size={12} />
						ビジュアライザ
					</button>
					<button onClick={addShapeLayer} className={ADD_BTN_CLASS}>
						<Plus size={12} />
						図形
					</button>
					<button
						onClick={() => setTemplatePickerOpen(true)}
						className={ADD_BTN_CLASS}
					>
						<Plus size={12} />
						エフェクト定型
					</button>
					<button onClick={addLyricsLayer} className={ADD_BTN_CLASS}>
						<Plus size={12} />
						歌詞
					</button>
					<button onClick={addEffectLayer} className={ADD_BTN_CLASS}>
						<Plus size={12} />
						演出
					</button>
					<button onClick={addChordBarLayer} className={ADD_BTN_CLASS}>
						<Plus size={12} />
						コード進行
					</button>
					<button onClick={addDegreeLayer} className={ADD_BTN_CLASS}>
						<Plus size={12} />
						度数の数字
					</button>
				</div>
				{manifest.layers.length === 0 && (
					<p className="text-[10px] text-gray-500">レイヤーがありません。</p>
				)}
				{manifest.layers.map((layer, index) => {
					const Icon = LAYER_ICON[layer.kind];
					const active = layer.id === selectedLayerId;
					return (
						<div
							key={layer.id}
							onMouseEnter={() => setHoveredLayerId(layer.id)}
							onMouseLeave={() => setHoveredLayerId(null)}
							className={`rounded border overflow-hidden transition-colors ${active ? "border-blue-500 bg-blue-500/10 shadow-sm" : "border-gray-700 bg-gray-800 hover:border-gray-600"}`}
						>
							<div className="flex items-center gap-2 px-2 py-1.5">
								<Icon size={13} className="shrink-0 text-blue-400" />
								<button
									onClick={() => setSelectedLayerId(active ? null : layer.id)}
									className="min-h-10 min-w-0 flex-1 py-1 text-left outline-none"
								>
									<span className="flex items-center gap-1.5 flex-wrap">
										<span className="truncate text-[11px] font-medium text-gray-100">
											{layerLabel(layer)}
										</span>
										<span className="shrink-0 rounded bg-gray-700/80 px-1 py-0.5 text-[9px] text-gray-300">
											{layerKindLabel(layer)}
										</span>
									</span>
									{layer.sections && layer.sections.length > 0 && (
										<span className="block truncate text-[9px] text-blue-300">
											場面:{" "}
											{layer.sections
												.map(
													(id) =>
														manifest.sections.find((s) => s.id === id)?.label ??
														id,
												)
												.join(" / ")}{" "}
											のみ
										</span>
									)}
								</button>
								<div className="flex flex-col gap-0.5">
									<button
										disabled={index === 0}
										onClick={() => moveLayerUp(index)}
										className="grid h-4 w-6 place-items-center rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600"
									>
										<ChevronUp size={12} />
									</button>
									<button
										disabled={index === manifest.layers.length - 1}
										onClick={() => moveLayerDown(index)}
										className="grid h-4 w-6 place-items-center rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600"
									>
										<ChevronDown size={12} />
									</button>
								</div>
								<button
									onClick={() => duplicateLayer(layer.id)}
									title="同じ設定で直下に複製"
									className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-700 text-gray-300 transition-colors hover:bg-gray-600"
								>
									<Copy size={16} />
								</button>
								<button
									onClick={() => removeLayer(layer.id)}
									className={DEL_BTN_CLASS}
								>
									<Trash2 size={16} />
								</button>
							</div>

							{active && (
								<div className="border-t border-blue-500/30 bg-gray-900/60 p-3">
									{renderLayerSettings(layer)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);

	const lyricsTab = (
		<div className="space-y-2">
			{[0, 1].map((i) => {
				const lyricsLayer = lyricsLayers[i] ?? null;
				if (i === 1 && !lyricsLayers[0]) return null;
				if (i === 1 && !lyricsLayer) {
					return (
						<div key={i} className={SECTION_CLASS}>
							<SectionTitle>🎤 裏歌詞</SectionTitle>
							<p className="text-[10px] leading-relaxed text-gray-400">
								表歌詞と同時に出せるもう1つの歌詞レイヤーです。エコーや副音声、対訳などに。
							</p>
							<button
								onClick={() => {
									const layer: MvLyricsLayer = {
										kind: "lyrics",
										id: mvUid("lyr"),
										source: song.lyricLines.length > 0 ? "mml" : "manual",
										lines: [],
										x: 22,
										y: 44,
										anchor: "topLeft",
										size: 16,
										color: "#f3f4f6",
										vertical: true,
										afterimage: 2,
										holdBars: 2,
										z: 40,
									};
									update((m) => ({ ...m, layers: [...m.layers, layer] }));
								}}
								className={ADD_BTN_CLASS}
							>
								<Plus size={13} />
								裏歌詞レイヤーを追加
							</button>
						</div>
					);
				}
				const shownLyricLines = lyricsLayer
					? resolveLyricLines(lyricsLayer, song)
					: [];
				return (
					<div key={i} className={SECTION_CLASS}>
						<SectionTitle>🎤 {i === 0 ? "表歌詞" : "裏歌詞"}</SectionTitle>
						{!lyricsLayer ? (
							<>
								<p className="text-[10px] leading-relaxed text-gray-400">
									歌詞レイヤーがありません。追加すると、画面に歌詞を出せます。
								</p>
								<button
									onClick={() => {
										const layer: MvLyricsLayer = {
											kind: "lyrics",
											id: mvUid("lyr"),
											source: song.lyricLines.length > 0 ? "mml" : "manual",
											lines: [],
											x: MV_W - 48,
											y: 44,
											anchor: "topLeft",
											size: 16,
											color: "#f3f4f6",
											vertical: true,
											afterimage: 2,
											holdBars: 2,
											z: 40,
										};
										update((m) => ({ ...m, layers: [...m.layers, layer] }));
									}}
									className={ADD_BTN_CLASS}
								>
									<Plus size={13} />
									歌詞レイヤーを追加
								</button>
							</>
						) : (
							<>
								<SelectField
									label="出どころ"
									value={lyricsLayer.source}
									options={[
										{
											value: "mml" as const,
											label: "MMLの歌詞トラックから自動",
										},
										{ value: "manual" as const, label: "小節を指定して手入力" },
									]}
									onChange={(v) =>
										updateLayer(
											lyricsLayer.id,
											(l) => ({ ...l, source: v }) as MvLayer,
										)
									}
								/>
								{lyricsLayer.source === "mml" &&
									(song.lyricTrackIds.length > 0 ? (
										<>
											<SelectField
												label="トラック"
												value={String(
													lyricsLayer.trackId ?? song.lyricTrackIds[0],
												)}
												options={[
													...song.lyricTrackIds.map((t) => ({
														value: String(t),
														label: `@@${t} のみ`,
													})),
													{ value: "all", label: "全部（画面が埋まりがち）" },
												]}
												onChange={(v) =>
													updateLayer(
														lyricsLayer.id,
														(l) =>
															({
																...l,
																trackId: v === "all" ? "all" : Number(v),
															}) as MvLayer,
													)
												}
											/>
											<p className="text-[10px] leading-relaxed text-gray-500">
												歌詞トラックが複数あっても、画面に出すのはふつう1本だけです。
											</p>
											<div className="rounded border border-gray-700 bg-gray-800 p-2 text-[10px] text-gray-400">
												<p className="mb-1.5 font-bold text-gray-300">
													このレイヤーが出す歌詞（{shownLyricLines.length} 行）
												</p>
												<ul className="max-h-44 space-y-1 overflow-y-auto">
													{shownLyricLines.map((line, i) => {
														const hold = lyricsLayer.holdBars ?? 2;
														const bpm = song.bpm || 120;
														const secPerBar = (60 / bpm) * 4;
														const startSec = line.bar * secPerBar;
														const endSec = (line.bar + hold) * secPerBar;
														return (
															<li
																key={i}
																className="flex items-center justify-between gap-1.5 rounded border border-gray-700/60 bg-gray-900/80 p-1.5 text-gray-200"
															>
																<div className="flex min-w-0 flex-1 items-center gap-1.5">
																	<span className="shrink-0 rounded bg-blue-950 px-1.5 py-0.5 font-mono text-[9px] text-blue-300 border border-blue-800/60">
																		{line.bar.toFixed(1)}〜{(line.bar + hold).toFixed(1)}小節 [{formatMinSecMs(startSec)}〜{formatMinSecMs(endSec)}]
																	</span>
																	<span className="truncate text-[11px] font-medium">{line.text}</span>
																</div>
																<button
																	onClick={() => playerRef.current?.seekToBar(line.bar)}
																	className="flex shrink-0 items-center gap-1 rounded bg-gray-700 px-1.5 py-0.5 text-[9px] text-gray-200 hover:bg-gray-600"
																>
																	<Play size={10} />
																	確認
																</button>
															</li>
														);
													})}
												</ul>
											</div>
											{shownLyricLines.length > 0 && (
												<>
													<button
														onClick={() =>
															updateLayer(lyricsLayer.id, (l) =>
																l.kind === "lyrics"
																	? {
																			...l,
																			source: "manual",
																			lines: shownLyricLines.map((x) => ({
																				bar: Math.round(x.bar * 100) / 100,
																				text: x.text,
																			})),
																		}
																	: l,
															)
														}
														className={REF_BTN_CLASS}
													>
														この歌詞を手入力にコピーして編集する
													</button>
													<Hint>
														MMLから作った行を手入力へ写します。写したあとは文言もタイミングも自由に直せます
														（MML側の歌詞を変えても追従しなくなります）。
													</Hint>
												</>
											)}
										</>
									) : (
										<p className="text-[10px] text-amber-400">
											MMLに歌詞トラック（@@0 klatt
											…）がありません。MMLエディタで歌詞を付けるか、手入力に切り替えてください。
										</p>
									))}
								{lyricsLayer.source === "manual" && (
									<>
										{(lyricsLayer.lines ?? []).map((line, i) => {
											const hold = lyricsLayer.holdBars ?? 2;
											const bpm = song.bpm || 120;
											const secPerBar = (60 / bpm) * 4;
											const startSec = line.bar * secPerBar;
											const endSec = (line.bar + hold) * secPerBar;
											return (
												<div key={i} className="flex flex-col gap-1.5 rounded border border-gray-700/80 bg-gray-800/60 p-2">
													<div className="flex items-center gap-1.5">
														<StringNumInput
															value={line.bar}
															onChange={(n) =>
																updateLayer(lyricsLayer.id, (l) =>
																	l.kind === "lyrics"
																		? {
																				...l,
																				lines: (l.lines ?? []).map((x, j) =>
																					j === i ? { ...x, bar: n } : x,
																				),
																			}
																		: l,
																)
															}
															className="min-h-9 w-16 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
														/>
														<span className="shrink-0 text-[10px] text-gray-400">小節</span>
														<input
															value={line.text}
															onChange={(e) =>
																updateLayer(lyricsLayer.id, (l) =>
																	l.kind === "lyrics"
																		? {
																				...l,
																				lines: (l.lines ?? []).map((x, j) =>
																					j === i
																						? { ...x, text: e.target.value }
																						: x,
																				),
																			}
																		: l,
																)
															}
															className="min-h-9 min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-100 outline-none"
														/>
														<button
															onClick={() => playerRef.current?.seekToBar(line.bar)}
															title="この位置へ再生をシーク"
															className="flex h-9 shrink-0 items-center gap-1 rounded bg-blue-600/30 border border-blue-500/40 px-2 text-[10px] font-bold text-blue-200 hover:bg-blue-600/40"
														>
															<Play size={11} />
															シーク
														</button>
														<button
															onClick={() =>
																updateLayer(lyricsLayer.id, (l) =>
																	l.kind === "lyrics"
																		? {
																				...l,
																				lines: (l.lines ?? []).filter(
																					(_, j) => j !== i,
																				),
																			}
																		: l,
																)
															}
															className={DEL_BTN_CLASS}
														>
															<Trash2 size={16} />
														</button>
													</div>
													<div className="flex items-center gap-2 px-1 text-[10px] text-gray-400">
														<span className="font-mono text-blue-300">
															⏱ 表示レンジ: {line.bar.toFixed(1)}〜{(line.bar + hold).toFixed(1)}小節 [{formatMinSecMs(startSec)} 〜 {formatMinSecMs(endSec)}]
														</span>
													</div>
												</div>
											);
										})}
										<button
											onClick={() =>
												updateLayer(lyricsLayer.id, (l) =>
													l.kind === "lyrics"
														? {
																...l,
																lines: [
																	...(l.lines ?? []),
																	{ bar: (l.lines?.length ?? 0) * 2, text: "" },
																],
															}
														: l,
												)
											}
											className={ADD_BTN_CLASS}
										>
											<Plus size={13} />
											行を追加
										</button>

										<Details label="一括貼り付けで取り込む">
											<Hint>
												{"E[00:11.70]セリフ"}
												のように「記号＋[分:秒]＋歌詞」を1行ずつ並べて貼ると、
												まとめて取り込めます。{"#"}
												で始まる行（場面見出しや演出メモ）は無視されるので、資料をそのまま貼ってOKです。
												記号は質感の合図として下地の色になります（E緑/L水色/W黄/P白/Fピンク/M紫）。
											</Hint>
											<textarea
												value={lyricsBulkText}
												onChange={(e) => setLyricsBulkText(e.target.value)}
												placeholder={
													"L[00:19.70]ノイズまみれの世界で\nL[00:22]冷たい雨のミュートが"
												}
												className={`${INPUT_CLASS} h-24 resize-none font-mono text-[10px]`}
											/>
											{(() => {
												const groups = parseLyricsBulkGroups(
													lyricsBulkText,
													song.bpm || 120,
												);
												const total = groups.reduce(
													(n, g) => n + g.lines.length,
													0,
												);
												if (total === 0) return null;
												return (
													<>
														<p className="text-[10px] text-gray-400">
															{groups.length > 1
																? `${groups.map((g) => g.label || "(見出しなし)").join(" / ")} の${groups.length}場面・${total}行を検出`
																: `${total}行を検出`}
														</p>
														<button
															onClick={() => {
																updateLayer(lyricsLayer.id, (l) =>
																	l.kind === "lyrics"
																		? {
																				...l,
																				lines: [
																					...(l.lines ?? []),
																					...groups.flatMap((g) => g.lines),
																				],
																			}
																		: l,
																);
																setLyricsBulkText("");
															}}
															className={ADD_BTN_CLASS}
														>
															<Plus size={13} />
															この{total}行を取り込む
														</button>
														{groups.length > 1 && (
															<Hint>
																見出し({groups.map((g) => g.label).join("・")}
																)が複数あります。場面ごとに表示位置や縦横を変えたい場合は、
																「レイヤー」タブの「歌詞」ボタンで歌詞レイヤーをもう1つ追加し、
																そちらへ残りの見出しぶんを貼り付けたうえで、下の「出す場面」欄で
																絞り込んでください（1レイヤー＝1つの見た目）。
															</Hint>
														)}
													</>
												);
											})()}
										</Details>
									</>
								)}

								<p className="pt-1 text-[10px] font-bold text-gray-400">
									見た目
								</p>
								<NumField
									label="X"
									value={lyricsLayer.x}
									onChange={(v) =>
										updateLayer(
											lyricsLayer.id,
											(l) => ({ ...l, x: v }) as MvLayer,
										)
									}
								/>
								<NumField
									label="Y"
									value={lyricsLayer.y}
									onChange={(v) =>
										updateLayer(
											lyricsLayer.id,
											(l) => ({ ...l, y: v }) as MvLayer,
										)
									}
								/>
								<NumField
									label="文字サイズ"
									value={lyricsLayer.size}
									min={8}
									onChange={(v) =>
										updateLayer(
											lyricsLayer.id,
											(l) => ({ ...l, size: v }) as MvLayer,
										)
									}
								/>
								<ColorField
									label="文字色"
									value={lyricsLayer.color}
									onChange={(v) =>
										updateLayer(
											lyricsLayer.id,
											(l) => ({ ...l, color: v }) as MvLayer,
										)
									}
								/>
								<CheckField
									label="縦書き"
									checked={lyricsLayer.vertical}
									onChange={(v) =>
										updateLayer(
											lyricsLayer.id,
											(l) => ({ ...l, vertical: v }) as MvLayer,
										)
									}
								/>
								{/* 参考動画は10列ぶん積み上がるので、目安は0〜12 */}
								<NumField
									label="残像の数（0〜12）"
									value={lyricsLayer.afterimage}
									min={0}
									max={12}
									onChange={(v) =>
										updateLayer(
											lyricsLayer.id,
											(l) => ({ ...l, afterimage: v }) as MvLayer,
										)
									}
								/>
								<label className="flex items-center gap-1.5 py-1">
									<input
										type="checkbox"
										checked={!!lyricsLayer.typing}
										onChange={(e) =>
											updateLayer(
												lyricsLayer.id,
												(l) => ({ ...l, typing: e.target.checked }) as MvLayer,
											)
										}
										className="accent-blue-500"
									/>
									<span className={FIELD_LABEL_CLASS}>
										1文字ずつタイピング表示
									</span>
								</label>
								<NumField
									label="表示の長さ"
									value={lyricsLayer.holdBars ?? 2}
									min={0.25}
									step={0.25}
									onChange={(v) =>
										updateLayer(
											lyricsLayer.id,
											(l) => ({ ...l, holdBars: v }) as MvLayer,
										)
									}
								/>
								<button
									onClick={() => removeLayer(lyricsLayer.id)}
									className="w-full rounded border border-gray-700 py-1.5 text-[10px] text-gray-400 hover:text-red-400"
								>
									歌詞レイヤーを削除
								</button>
							</>
						)}
					</div>
				);
			})}
		</div>
	);

	const handleCopySection = (sec: MvSection) => {
		const layerSections: Record<string, boolean> = {};
		manifest.layers.forEach((l) => {
			layerSections[l.id] = l.sections ? l.sections.includes(sec.id) : true;
		});
		setCopiedSectionData({
			stage: sec.stage ? JSON.parse(JSON.stringify(sec.stage)) : undefined,
			transition: sec.transition
				? JSON.parse(JSON.stringify(sec.transition))
				: undefined,
			layerSections,
		});
	};

	const handlePasteSection = (targetSecId: string) => {
		if (!copiedSectionData) return;
		updateSection(targetSecId, (sec) => ({
			...sec,
			stage: copiedSectionData.stage
				? JSON.parse(JSON.stringify(copiedSectionData.stage))
				: undefined,
			transition: copiedSectionData.transition
				? JSON.parse(JSON.stringify(copiedSectionData.transition))
				: undefined,
		}));
		update((m) => ({
			...m,
			layers: m.layers.map((l) => {
				const shouldShow = copiedSectionData.layerSections[l.id] ?? true;
				const allSectionIds = m.sections.map((s) => s.id);
				const curSections = l.sections ?? allSectionIds;
				const nextSections = shouldShow
					? [...new Set([...curSections, targetSecId])]
					: curSections.filter((id) => id !== targetSecId);
				return {
					...l,
					sections:
						nextSections.length === 0 ||
						nextSections.length === allSectionIds.length
							? undefined
							: nextSections,
				};
			}),
		}));
	};

	const handleDuplicateSection = (sourceIndex: number) => {
		const source = manifest.sections[sourceIndex];
		if (!source) return;
		const newSecId = mvUid("sec");
		const newSec: MvSection = {
			id: newSecId,
			label: `${source.label} (コピー)`,
			startBar: source.startBar + 8,
			stage: source.stage ? JSON.parse(JSON.stringify(source.stage)) : undefined,
			transition: source.transition
				? JSON.parse(JSON.stringify(source.transition))
				: undefined,
		};
		const newSections = [
			...manifest.sections.slice(0, sourceIndex + 1),
			newSec,
			...manifest.sections.slice(sourceIndex + 1),
		];
		update((m) => ({
			...m,
			sections: newSections,
			layers: m.layers.map((l) => {
				const isShownInSource = l.sections
					? l.sections.includes(source.id)
					: true;
				if (!isShownInSource) return l;
				const curSections = l.sections ?? manifest.sections.map((s) => s.id);
				const nextSections = [...curSections, newSecId];
				return {
					...l,
					sections:
						nextSections.length === newSections.length
							? undefined
							: nextSections,
				};
			}),
		}));
	};

	const displayedSections = activeSectionId
		? manifest.sections.filter((s) => s.id === activeSectionId)
		: manifest.sections;

	const sectionsTab = (
		<div className="space-y-3">
			<div className={SECTION_CLASS}>
				<SectionTitle>🎬 場面（シーン管理）</SectionTitle>
				<p className="text-[10px] leading-relaxed text-gray-400">
					小節番号で曲をカット分け（イントロ・Aメロ・サビ等）します。場面ごとに背景・画面効果・表示するレイヤーを完全に切り替えられます。
				</p>

				{/* 場面クイック切り替え・フィルタータグ */}
				<div className="flex flex-wrap items-center gap-1.5 pt-2 pb-1 border-b border-gray-800">
					<button
						onClick={() => setActiveSectionId(null)}
						className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${
							activeSectionId === null
								? "bg-blue-600 text-white"
								: "bg-gray-800 text-gray-400 hover:bg-gray-700"
						}`}
					>
						すべての場面 ({manifest.sections.length})
					</button>
					{manifest.sections.map((sec, idx) => (
						<button
							key={sec.id}
							onClick={() => setActiveSectionId(sec.id)}
							className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${
								activeSectionId === sec.id
									? "bg-blue-600 text-white"
									: "bg-gray-800 text-gray-400 hover:bg-gray-700"
							}`}
						>
							場面 {idx + 1}: {sec.label} ({sec.startBar}小節〜)
						</button>
					))}
				</div>

				{/* 場面カードリスト */}
				<div className="space-y-3 pt-2">
					{displayedSections.map((s) => {
						const originalIndex = manifest.sections.findIndex((x) => x.id === s.id);
						const bpm = song.bpm || 120;
						const secPerBar = (60 / bpm) * 4;
						const startSec = s.startBar * secPerBar;
						return (
							<div
								key={s.id}
								className="rounded-lg border border-gray-700 bg-gray-900/90 shadow-md overflow-hidden"
							>
								{/* 場面ヘッダー */}
								<div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 bg-gradient-to-r from-gray-800 to-gray-900 px-3 py-2">
									<div className="flex items-center gap-2 min-w-0 flex-1">
										<span className="shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
											場面 {originalIndex + 1}
										</span>
										<input
											value={s.label}
											onChange={(e) =>
												updateSection(s.id, (x) => ({ ...x, label: e.target.value }))
											}
											placeholder="場面名（イントロ、サビなど）"
											className="min-h-8 min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] font-medium text-gray-100 outline-none focus:border-blue-500"
										/>
										<div className="flex shrink-0 items-center gap-1">
											<StringNumInput
												value={s.startBar}
												onChange={(n) =>
													updateSection(s.id, (x) => ({
														...x,
														startBar: Math.max(0, n),
													}))
												}
												className="min-h-8 w-14 rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[11px] text-gray-100 outline-none text-center"
											/>
											<span className="text-[10px] text-gray-400">小節〜</span>
											<span className="ml-1 rounded bg-gray-800 px-1.5 py-0.5 font-mono text-[9px] text-blue-300 border border-gray-700">
												[{formatMinSecMs(startSec)}]
											</span>
										</div>
									</div>

									{/* 場面アクション（コピー/ペースト/複製/削除） */}
									<div className="flex items-center gap-1 shrink-0">
										<button
											onClick={() => handleCopySection(s)}
											title="この場面の設定をコピー"
											className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-[10px] font-medium text-gray-300 hover:bg-gray-700 border border-gray-700"
										>
											<Copy size={11} />
											コピー
										</button>
										<button
											onClick={() => handlePasteSection(s.id)}
											disabled={!copiedSectionData}
											title="コピーした設定をこの場面に貼り付け"
											className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-[10px] font-medium text-gray-300 disabled:opacity-40 hover:bg-gray-700 border border-gray-700"
										>
											<Clipboard size={11} />
											貼り付け
										</button>
										<button
											onClick={() => handleDuplicateSection(originalIndex)}
											title="この場面をそのまま後ろに複製"
											className="flex items-center gap-1 rounded bg-blue-600/30 border border-blue-500/40 px-2 py-1 text-[10px] font-medium text-blue-200 hover:bg-blue-600/40"
										>
											<Plus size={11} />
											複製
										</button>
										{manifest.sections.length > 1 && (
											<button
												onClick={() =>
													update((m) => ({
														...m,
														sections: m.sections.filter((_, j) => j !== originalIndex),
														layers: m.layers.map((l) =>
															l.sections
																? {
																		...l,
																		sections: l.sections.filter((x) => x !== s.id),
																	}
																: l,
														),
													}))
												}
												className={DEL_BTN_CLASS}
											>
												<Trash2 size={15} />
											</button>
										)}
									</div>
								</div>

								{/* 場面設定本体 */}
								<div className="p-3 space-y-3">
									<Details label="🎬 背景と画面切替の設定">
										<SelectField
											label="切り替え方"
											value={s.transition?.style ?? "cut"}
											options={(
												Object.keys(MV_TRANSITION_LABELS) as MvTransitionStyle[]
											).map((v) => ({ value: v, label: MV_TRANSITION_LABELS[v] }))}
											onChange={(v) =>
												updateSection(s.id, (x) => ({
													...x,
													transition:
														v === "cut"
															? undefined
															: {
																	...(x.transition ?? DEFAULT_MV_TRANSITION),
																	style: v,
																},
												}))
											}
										/>
										{s.transition && (
											<>
												<NumField
													label="切り替えの長さ（拍）"
													value={s.transition.beats}
													min={0.25}
													max={8}
													step={0.25}
													onChange={(v) =>
														updateSection(s.id, (x) =>
															x.transition
																? { ...x, transition: { ...x.transition, beats: v } }
																: x,
														)
													}
												/>
												<ColorField
													label="覆いの色"
													value={
														s.transition.color ??
														(s.transition.style === "flash" ? "#ffffff" : "#000000")
													}
													onChange={(v) =>
														updateSection(s.id, (x) =>
															x.transition
																? { ...x, transition: { ...x.transition, color: v } }
																: x,
														)
													}
												/>
											</>
										)}

										<p className="pt-1 text-[10px] font-bold text-gray-300">
											この場面の背景画像・色の差し替え
										</p>
										<Hint>
											未指定の場合、「見た目」タブの全体背景設定がそのまま使用されます。
										</Hint>
										<div className="flex items-center gap-2">
											<button
												onClick={() =>
													updateSectionStage(s.id, {
														bgColor: s.stage?.bgColor ?? manifest.stage.bgColor,
													})
												}
												disabled={s.stage?.bgColor !== undefined}
												className={`${REF_BTN_CLASS} disabled:opacity-40`}
											>
												この場面の背景色を個別に指定
											</button>
											{s.stage?.bgColor !== undefined && (
												<button
													onClick={() =>
														updateSectionStage(s.id, { bgColor: undefined })
													}
													className={DEL_BTN_CLASS}
												>
													<Trash2 size={15} />
												</button>
											)}
										</div>
										{s.stage?.bgColor !== undefined && (
											<ColorField
												label="背景色"
												value={s.stage.bgColor}
												onChange={(v) => updateSectionStage(s.id, { bgColor: v })}
											/>
										)}
										<button
											onClick={() =>
												setPicker({ mode: "image", target: { sectionId: s.id } })
											}
											className={REF_BTN_CLASS}
										>
											<ImageIcon size={12} />
											この場面の背景画像を指定
										</button>
										{s.stage?.bgRef !== undefined && (
											<div className="flex items-center gap-2 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[9px] text-gray-400">
												{s.stage.bgUrl && (
													<img
														src={s.stage.bgUrl}
														onError={handleImgError}
														alt=""
														className="h-7 w-7 shrink-0 rounded object-cover"
													/>
												)}
												<span className="flex-1 truncate">
													{s.stage.bgRef
														? refLabel(s.stage.bgRef)
														: "背景画像なし（背景消去）"}
												</span>
												<button
													onClick={() =>
														updateSectionStage(s.id, {
															bgRef: undefined,
															bgUrl: undefined,
														})
													}
													className={DEL_BTN_CLASS}
												>
													<Trash2 size={15} />
												</button>
											</div>
										)}
										<NumField
											label="背景の暗さ（0:普通 〜 1:真っ黒）"
											value={s.stage?.bgDim ?? manifest.stage.bgDim ?? 0}
											min={0}
											max={1}
											step={0.05}
											onChange={(v) => updateSectionStage(s.id, { bgDim: v })}
										/>
									</Details>

									<Details label={`🎭 この場面で表示するレイヤーと動き (${manifest.layers.length}枚)`}>
										<Hint>
											チェックを入れたレイヤーがこの場面で画面に表示されます。「動きを編集」で場面ごとの移動アニメーションを設定できます。
										</Hint>
										<div className="space-y-1.5 pt-1">
											{manifest.layers.map((l) => {
												const Icon = LAYER_ICON[l.kind];
												const shownHere = l.sections ? l.sections.includes(s.id) : true;
												return (
													<div
														key={l.id}
														className={`flex items-center justify-between gap-2 rounded border p-2 transition-colors ${
															shownHere
																? "border-gray-700 bg-gray-800/90 text-gray-100"
																: "border-gray-800/60 bg-gray-950/40 text-gray-500 opacity-60"
														}`}
													>
														<label className="flex min-h-8 min-w-0 flex-1 items-center gap-2 cursor-pointer">
															<input
																type="checkbox"
																checked={shownHere}
																onChange={(e) => {
																	const v = e.target.checked;
																	updateLayer(l.id, (layer) => {
																		const all = manifest.sections.map((x) => x.id);
																		const cur = layer.sections ?? all;
																		const next = v
																			? [...new Set([...cur, s.id])]
																			: cur.filter((x) => x !== s.id);
																		return {
																			...layer,
																			sections:
																				next.length === 0 || next.length === all.length
																					? undefined
																					: next,
																		};
																	});
																}}
																className="h-4 w-4 shrink-0 rounded border-gray-700 text-blue-600"
															/>
															<Icon size={13} className="shrink-0 text-blue-400" />
															<span className="truncate text-[11px] font-medium">
																{layerLabel(l)}
															</span>
															<span className="shrink-0 rounded bg-gray-700/70 px-1 py-0.5 text-[9px] text-gray-300">
																{layerKindLabel(l)}
															</span>
														</label>
														<div className="flex items-center gap-1 shrink-0">
															{l.kind === "shape" && (
																<button
																	onClick={() => setMotionTarget({ layerId: l.id, sectionId: s.id })}
																	className="rounded bg-blue-600/30 border border-blue-500/40 px-2 py-1 text-[10px] font-medium text-blue-200 hover:bg-blue-600/40"
																>
																	🎬 動きを編集
																</button>
															)}
															<button
																onClick={() => {
																	setSelectedLayerId(l.id);
																	setTab("layers");
																}}
																className="rounded bg-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-600"
															>
																⚙️ 詳細設定
															</button>
														</div>
													</div>
												);
											})}
										</div>
										<button
											onClick={() => {
												const layer: MvVisualizerLayer = {
													kind: "visualizer",
													id: mvUid("vis"),
													style: "pianoRoll",
													projection: "flat",
													flow: "scroll",
													rect: { x: 0, y: MV_H - 90, w: MV_W, h: 90 },
													amount: 6,
													thickness: 2,
													sections: [s.id],
													z: getNextZ(),
												};
												update((m) => ({ ...m, layers: [...m.layers, layer] }));
												setSelectedLayerId(layer.id);
												setTab("layers");
											}}
											className={`${ADD_BTN_CLASS} mt-2`}
										>
											<Plus size={13} />
											この場面にピアノロールを追加
										</button>
									</Details>
								</div>
							</div>
						);
					})}
				</div>

				<button
					onClick={() => {
						const next: MvSection = {
							id: mvUid("sec"),
							label: `場面${manifest.sections.length + 1}`,
							startBar:
								Math.max(0, ...manifest.sections.map((s) => s.startBar)) + 8,
						};
						update((m) => ({ ...m, sections: [...m.sections, next] }));
					}}
					className={`${ADD_BTN_CLASS} mt-3`}
				>
					<Plus size={13} />
					新しい場面を追加
				</button>
			</div>
		</div>
	);

	return (
		<div className="fixed inset-0 z-50 flex select-none flex-col bg-[#0b0e14]">
			{/* ヘッダー
          狭い画面ではボタンのラベル（日本語）が1文字ずつ折り返してヘッダーが2〜3段に膨らんでいた。
          GameMaker のヘッダーと同じく、ラベルは title / aria-label に逃がしてアイコンだけを並べる。 */}
			<div className="flex shrink-0 items-center gap-1.5 border-b border-gray-800 bg-[#0b0e14] px-2.5 py-2">
				<button
					onClick={onClose}
					aria-label="キャンセル"
					title="キャンセル"
					className="shrink-0 rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100/10"
				>
					<X size={18} />
				</button>
				{/* いま何を編集中かだけをテキストで残す（折り返さず、狭ければ省略記号にする） */}
				<span className="min-w-0 flex-1 truncate text-[11px] text-gray-400">
					MV作成
				</span>
				<div className="flex shrink-0 items-center gap-1">
					<button
						onClick={undoEdit}
						disabled={undoDepth === 0}
						aria-label="元に戻す"
						title={`元に戻す（Ctrl+Z）${undoDepth ? ` ${undoDepth}` : ""}`}
						className="grid h-8 w-8 place-items-center rounded-lg bg-gray-800 text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-30"
					>
						<Undo2 size={14} />
					</button>
					<button
						onClick={redoEdit}
						disabled={redoDepth === 0}
						aria-label="やり直す"
						title={`やり直す（Ctrl+Y）${redoDepth ? ` ${redoDepth}` : ""}`}
						className="grid h-8 w-8 place-items-center rounded-lg bg-gray-800 text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-30"
					>
						<Redo2 size={14} />
					</button>
				</div>
				<div className="shrink-0">
					<VolumeControl />
				</div>
				<button
					onClick={() => setShowHistory(true)}
					aria-label="履歴"
					title="履歴・スナップショット"
					className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-800 text-gray-300 transition-colors hover:bg-gray-700"
				>
					<History size={14} />
				</button>
				<button
					onClick={handleSave}
					disabled={!canSave}
					aria-label={isEditing ? "再編集" : "投稿"}
					title={isEditing ? "再編集" : "投稿"}
					className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
				>
					<Clapperboard size={14} />
				</button>
			</div>

			{hasAutosave && (
				<div className="flex shrink-0 items-center justify-between border-b border-yellow-800/30 bg-yellow-600/20 px-4 py-2 text-xs text-yellow-200">
					<span>⚠️ 未保存のデータ（自動保存）があります。復元しますか？</span>
					<div className="flex gap-2">
						<button
							onClick={() => {
								if (autosaveDataRef.current) {
									resetEditHistory();
									setManifest(autosaveDataRef.current);
								}
								setHasAutosave(false);
								clearAutosave(storageKey);
							}}
							className="rounded bg-yellow-600 px-3 py-1 text-[10px] font-bold text-gray-900 transition-transform active:scale-95"
						>
							復元する
						</button>
						<button
							onClick={() => {
								setHasAutosave(false);
								clearAutosave(storageKey);
							}}
							className="rounded px-2 py-1 text-[10px] text-gray-400 hover:text-gray-200"
						>
							無視
						</button>
					</div>
				</div>
			)}

			{/* プレビュー */}
			<div className="shrink-0 border-b border-gray-800 bg-[#0a0c12] p-3">
				<div className="mx-auto" style={{ maxWidth: MV_W }}>
					<MvPlayer
						ref={playerRef}
						manifest={manifest}
						selectedLayerId={selectedLayerId}
						hoveredLayerId={hoveredLayerId}
					/>
				</div>
			</div>

			{/* タブ＋編集モード切替 */}
			<div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-gray-800 px-2 py-1.5">
				{visibleTabs.map((t) => (
					<button
						key={t.id}
						onClick={() => setTab(t.id)}
						className={`min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors ${tab === t.id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
					>
						{t.label}
					</button>
				))}
			</div>

			{/* 本体 */}
			<div className="flex-1 overflow-y-auto p-2.5">
				{tab === "preset" && presetTab}
				{tab === "song" && songTab}
				{tab === "stage" && stageTab}
				{tab === "layers" && layersTab}
				{tab === "lyrics" && lyricsTab}
				{tab === "sections" && sectionsTab}
			</div>

			{picker && (
				<ContentPicker
					mode={picker.mode}
					bgmKind={picker.mode === "bgm" ? "mml" : undefined}
					userId={userId}
					// currentRef は渡さない。ここは「投稿された曲から選ぶ」導線なので、
					// 現在のMMLを渡すと ContentPicker が毎回「直接」タブを開いてしまう
					// （インラインMMLは mml: 始まりなので mmlRaw 判定になる）。
					onPick={handlePick}
					onClose={() => setPicker(null)}
				/>
			)}

			<HistoryModal
				isOpen={showHistory}
				onClose={() => setShowHistory(false)}
				storageKey={storageKey}
				type="mv"
				onRestore={(restored: MvManifest) => {
					resetEditHistory();
					setManifest(restored);
				}}
				getCurrentData={() => manifestRef.current}
			/>

			{templatePickerOpen && (
				<MvEffectTemplatePicker
					onPick={addTemplateLayers}
					onClose={() => setTemplatePickerOpen(false)}
				/>
			)}

			{motionTarget &&
				(() => {
					const baseLayer = manifest.layers.find(
						(l): l is MvShapeLayer =>
							l.kind === "shape" && l.id === motionTarget.layerId,
					);
					const section = manifest.sections.find(
						(s) => s.id === motionTarget.sectionId,
					);
					if (!baseLayer || !section) return null;
					const sceneBars =
						(manifest.sections.find(
							(s) => s.startBar > section.startBar,
						)?.startBar ?? song.totalBars ?? section.startBar + 8) -
						section.startBar;
					return (
						<MvShapeMotionModal
							baseLayer={baseLayer}
							sections={[section]}
							sceneBars={() => Math.max(1, sceneBars)}
							onApply={(perScene) => {
								const cfg = perScene[section.id];
								if (!cfg) return;
								const mods = resolveSceneModulators(cfg, Math.max(1, sceneBars));
								const all = manifest.sections.map((s) => s.id);
								const cur = baseLayer.sections ?? all;
								const otherSections = cur.filter((id) => id !== section.id);
								if (otherSections.length === 0) {
									// この場面にしか出ていない図形＝そのまま動きだけ差し替える
									updateLayer(baseLayer.id, (l) => ({
										...l,
										sections: [section.id],
										modulators: mods,
									}));
								} else {
									// 他の場面でも使われている図形＝この場面だけ複製して動きを変える
									updateLayer(baseLayer.id, (l) => ({
										...l,
										sections: otherSections,
									}));
									const clone: MvShapeLayer = {
										...baseLayer,
										id: mvUid("shp"),
										sections: [section.id],
										modulators: mods,
									};
									update((m) => ({ ...m, layers: [...m.layers, clone] }));
								}
							}}
							onClose={() => setMotionTarget(null)}
						/>
					);
				})()}
		</div>
	);
}
