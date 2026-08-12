"use client";

import { detectProgression, parseChords } from "@onjmin/chord-parser";
import {
	BarChart3,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	Clapperboard,
	Clipboard,
	Copy,
	FolderPlus,
	FolderX,
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
	Shuffle,
	Settings,
	SlidersHorizontal,
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
import { MV_LOCAL_SPRITES } from "@/lib/local-assets";
import {
	clearAutosave,
	getAutosave,
	getStorageKey,
	saveAutosave,
	saveHistory,
} from "@/lib/history";
import {
	DEFAULT_MV_NOTE_LIGHT,
	DEFAULT_MV_NOTE_LIGHT_3D,
	DEFAULT_MV_RING,
	DEFAULT_MV_TRANSITION,
	DEFAULT_MV_VIEW,
	isMvEntranceInert,
	isMvExitInert,
	MV_AUDIO_MODE_HINTS,
	MV_AUDIO_MODE_LABELS,
	MV_BLEND_LABELS,
	MV_CHORD_COLOR_MODE_LABELS,
	MV_EFFECT_CATEGORY,
	MV_EFFECT_CATEGORY_LABELS,
	MV_EFFECT_CURVE_LABELS,
	MV_EFFECT_POST_STYLES,
	MV_EFFECT_STYLE_DESCRIPTIONS,
	MV_EFFECT_STYLE_LABELS,
	MV_EFFECT_USES_COLOR,
	MV_H,
	MV_LAYER_KIND_LABELS,
	MV_LYRIC_STACK_LABELS,
	MV_MOD_OP_LABELS,
	MV_MOD_SOURCE_LABELS,
	MV_MOD_TARGET_LABELS,
	MV_MOTION_LABELS,
	MV_PROJECTION_LABELS,
	MV_ROLL_FLOW_LABELS,
	MV_ROOT_TO_PITCH,
	MV_SHAPE_FORM_LABELS,
	MV_STEPS_PER_BAR,
	MV_STEPS_PER_BEAT,
	MV_TRANSITION_LABELS,
	MV_TRANSITION_STYLE_LABELS,
	MV_TRIGGER_LABELS,
	MV_VISUALIZER_LABELS,
	MV_W,
	type MvAudioMode,
	type MvBlend,
	type MvChordBarLayer,
	type MvChordColorMode,
	type MvChordStep,
	type MvDegreeLayer,
	type MvEffectCategory,
	type MvEffectCurve,
	type MvEffectLayer,
	type MvEffectStyle,
	type MvImageLayer,
	type MvLayer,
	type MvLayerGroup,
	type MvLyricStack,
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
	type MvShapeLayer,
	type MvTextLayer,
	type MvTransitionStyle,
	type MvTrigger,
	type MvVisualizerLayer,
	type MvVisualizerStyle,
	type MvWalkSetting,
	mvAudioMode,
	mvUid,
	mvWalkSpeed,
	parseLyricsBulkGroups,
	resolveEntranceStyle,
	resolveExitStyle,
	resolveLyricStack,
} from "@/lib/mv-config";
import type {
	MvEffectTemplateDef,
	MvEffectTemplateParams,
} from "@/lib/mv-effect-templates";
import {
	drawMvFrame,
	EMPTY_SONG,
	findLayerAtPoint,
	type MvFrameState,
	type MvSong,
	parseMvSong,
	resolveLyricLines,
} from "@/lib/mv-engine";
import {
	addLayerToGroup,
	applyGroupOpacity,
	applyGroupPosition,
	buildLayerListRows,
	deleteGroup,
	groupSelectedLayers,
	type MvGroupEditMode,
	moveGroupBlock,
	moveLayerWithinGroup,
	moveTopLevelLayer,
	renameGroup,
	replaceGroupMembers,
	shiftGroupZ,
	toggleGroupCollapsed,
	ungroupLayers,
} from "@/lib/mv-layer-group";
import {
	DEFAULT_SCENE_MOTION,
	resolveSceneModulators,
} from "@/lib/mv-shape-motion";
import {
	buildSymmetricShapeGroupLayers,
	generateSymmetricShapeGroup,
	generateArrangementForGroup,
	MV_SHAPE_BASE_BEATS_OPTIONS,
	type SymmetricShapeGroupOptions,
} from "@/lib/mv-shape-group-macro";
import ContentPicker, { type PickResult } from "./ContentPicker";
import HistoryModal from "./HistoryModal";
import MvEffectTemplatePicker from "./MvEffectTemplatePicker";
import MvPlayer, { type MvPlayerHandle } from "./MvPlayer";
import MvShapeFormPickerModal, {
	ShapeFormPreview as ShapeFormThumb,
} from "./MvShapeFormPickerModal";
import MvShapeMotionModal from "./MvShapeMotionModal";
import MvTimeline from "./MvTimeline";
import MvTransitionModal from "./MvTransitionModal";
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

/**
 * 演出(effect)レイヤーのその場プレビュー。
 *
 * 演出は「拍ごとに光る」「〜小節おきに崩れる」のように時間で効くものばかりで、
 * スライダーの数値だけを見ても実際どう動くか掴みにくい——本編の再生位置まで
 * シークして待たないと確認できないのは不便なので、簡単な図形の上で
 * ループ再生させて即座に見えるようにする（`MvShapeMotionModal` の
 * `MotionLivePreview` と同じ考え方）。
 */
function EffectLivePreview({
	layer,
	bpm,
}: {
	layer: MvEffectLayer;
	bpm?: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const manifest: MvManifest = {
			version: 1,
			preset: "geometric",
			title: "",
			mml: "",
			audio: { mode: "soundfontKoe" },
			stage: {
				bgColor: "#14161d",
				bgFit: "cover",
				pulse: "none",
				fadeIn: false,
				fadeOut: false,
				palette: [],
			},
			sections: [],
			layers: [
				{
					kind: "shape",
					id: "preview-shape",
					form: "square",
					x: MV_W / 2,
					y: MV_H / 2,
					size: 70,
					rotation: 20,
					color: "#8fb8ff",
					filled: true,
					thickness: 3,
					z: 10,
					modulators: [],
				},
				{ ...layer, id: "preview-effect" },
			],
		};
		const song = { ...EMPTY_SONG, bpm: bpm && bpm > 0 ? bpm : EMPTY_SONG.bpm };
		const stepsPerSec = (song.bpm / 60) * MV_STEPS_PER_BEAT;
		let raf = 0;
		const start = performance.now();
		const loop = () => {
			const elapsed = (performance.now() - start) / 1000;
			const frame: MvFrameState = { step: elapsed * stepsPerSec, timeSec: elapsed };
			drawMvFrame(ctx, manifest, song, frame);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [layer, bpm]);

	return (
		<canvas
			ref={canvasRef}
			width={MV_W}
			height={MV_H}
			className="block h-auto w-full rounded bg-black"
			style={{ aspectRatio: `${MV_W} / ${MV_H}` }}
		/>
	);
}

/**
 * レイヤー一覧の1行。トップレベルコンポーネントにしてあるのは行儀の問題だけでなく、
 * 親のレンダー関数の中で「JSXを返すただの関数」として定義して呼び出すと、
 * React Compiler の静的解析が内部のイベントハンドラのref参照を誤って
 * "レンダー中のref読み取り"と判定することがあったため（呼び出し境界が曖昧になるほど
 * 誤検知しやすい）。detail は呼び出し側の `renderLayerSettings(layer)` の結果を
 * そのまま渡してもらう——このコンポーネント自身は MvMaker 内部のクロージャに触れない。
 */
function LayerRow({
	layer,
	sections,
	active,
	onSelect,
	onHover,
	onUnhover,
	canMoveUp,
	canMoveDown,
	onMoveUp,
	onMoveDown,
	onDuplicate,
	onRemove,
	detail,
	rowRef,
}: {
	layer: MvLayer;
	sections: MvSection[];
	active: boolean;
	onSelect: () => void;
	onHover: () => void;
	onUnhover: () => void;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onDuplicate: () => void;
	onRemove: () => void;
	detail: React.ReactNode;
	rowRef?: (el: HTMLDivElement | null) => void;
}) {
	const Icon = LAYER_ICON[layer.kind];
	return (
		<div
			ref={rowRef}
			onMouseEnter={onHover}
			onMouseLeave={onUnhover}
			className={`rounded border overflow-hidden transition-colors ${active ? "border-blue-500 bg-blue-500/10 shadow-sm" : "border-gray-700 bg-gray-800 hover:border-gray-600"}`}
		>
			<div className="flex items-center gap-2 px-2 py-1.5">
				<Icon size={13} className="shrink-0 text-blue-400" />
				<button
					onClick={onSelect}
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
								.map((id) => sections.find((s) => s.id === id)?.label ?? id)
								.join(" / ")}{" "}
							のみ
						</span>
					)}
				</button>
				<div className="flex flex-col gap-0.5">
					<button
						disabled={!canMoveUp}
						onClick={onMoveUp}
						className="grid h-4 w-6 place-items-center rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600"
					>
						<ChevronUp size={12} />
					</button>
					<button
						disabled={!canMoveDown}
						onClick={onMoveDown}
						className="grid h-4 w-6 place-items-center rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600"
					>
						<ChevronDown size={12} />
					</button>
				</div>
				<button
					onClick={onDuplicate}
					title="同じ設定で直下に複製"
					className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-700 text-gray-300 transition-colors hover:bg-gray-600"
				>
					<Copy size={16} />
				</button>
				<button onClick={onRemove} className={DEL_BTN_CLASS}>
					<Trash2 size={16} />
				</button>
			</div>

			{active && (
				<div className="border-t border-blue-500/30 bg-gray-900/60 p-3">
					{detail}
				</div>
			)}
		</div>
	);
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

/**
 * 見出しでグループ分けした選択欄。
 * 演出は20種類あり、平たい一覧だと目的のものを探せないので分類して出す。
 */
function GroupedSelectField<T extends string>({
	label,
	value,
	groups,
	onChange,
}: {
	label: string;
	value: T;
	groups: { label: string; options: { value: T; label: string }[] }[];
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
				{groups.map((g) => (
					<optgroup key={g.label} label={g.label}>
						{g.options.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</optgroup>
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
const BLEND_OPTIONS = (Object.keys(MV_BLEND_LABELS) as MvBlend[]).map((b) => ({
	value: b,
	label: MV_BLEND_LABELS[b],
}));
/** 演出は種類が多いのでカテゴリごとの見出し付きで出す。 */
const EFFECT_STYLE_GROUPS = (
	Object.keys(MV_EFFECT_CATEGORY_LABELS) as MvEffectCategory[]
).map((cat) => ({
	label: MV_EFFECT_CATEGORY_LABELS[cat],
	options: (Object.keys(MV_EFFECT_STYLE_LABELS) as MvEffectStyle[])
		.filter((s) => MV_EFFECT_CATEGORY[s] === cat)
		.map((s) => ({ value: s, label: MV_EFFECT_STYLE_LABELS[s] })),
}));
const EFFECT_CURVE_OPTIONS = (
	Object.keys(MV_EFFECT_CURVE_LABELS) as MvEffectCurve[]
).map((c) => ({ value: c, label: MV_EFFECT_CURVE_LABELS[c] }));
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
	const [motionTarget, setMotionTarget] = useState<{ layerId: string } | null>(
		null,
	);
	const [transitionModalTarget, setTransitionModalTarget] = useState<{
		layerId: string;
		initialTab: "entrance" | "exit";
	} | null>(null);
	const [shapeFormPickerLayerId, setShapeFormPickerLayerId] = useState<
		string | null
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
	// レイヤーの「グループ化」用：専用モーダルの開閉と、モーダル内でチェックした
	// レイヤーID。グループ化できるのはまだどのグループにも属していないレイヤー同士だけ
	// （グループの中にグループを作る、という2段構造は許していない）。
	const [groupModalOpen, setGroupModalOpen] = useState(false);
	const [groupSelectIds, setGroupSelectIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [groupMenuOpenId, setGroupMenuOpenId] = useState<string | null>(null);
	const [timelineModalOpen, setTimelineModalOpen] = useState(false);
	/** グループ一括編集モーダルの対象グループID（開いていなければnull）。 */
	const [bulkEditGroupId, setBulkEditGroupId] = useState<string | null>(null);
	const [bulkField, setBulkField] = useState<"z" | "position" | "opacity">(
		"position",
	);
	const [bulkMode, setBulkMode] = useState<MvGroupEditMode>("relative");
	const [bulkValue, setBulkValue] = useState(0);
	const [bulkX, setBulkX] = useState(0);
	const [bulkY, setBulkY] = useState(0);

	/** レイヤー一覧の各行のDOM。プレビューをクリックして選んだレイヤーへ自動スクロールするために使う。 */
	const layerRowElsRef = useRef<Record<string, HTMLDivElement | null>>({});
	/** クリックで選んだ直後、一覧側の折りたたみ更新（再描画）を待ってからスクロールするための予約。 */
	const [pendingScrollLayerId, setPendingScrollLayerId] = useState<
		string | null
	>(null);

	useEffect(() => {
		if (!pendingScrollLayerId) return;
		const el = layerRowElsRef.current[pendingScrollLayerId];
		if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
		setPendingScrollLayerId(null);
		// 折りたたみ更新で行がunmount/remountされた後の実DOMを掴みたいので、
		// manifest.groups（折りたたみ状態の変化）も依存に入れて再実行させる。
	}, [pendingScrollLayerId, manifest.groups]);

	const [macroSettingsOpen, setMacroSettingsOpen] = useState(false);
	/**
	 * 「自動図形グループを新規追加」「特殊アレンジを生成」で作ったグループIDのスタック（古い→新しい順）。
	 * 「直近を削除」を連打すると1つずつ遡って消せる。気に入るまで作り直す／やっぱり要らない、が
	 * 一覧までスクロールせず追加ボタンのすぐ隣で完結するようにするためだけの覚え書き。
	 * 一覧側やUndoで先に消えていることがあるので、実在するIDだけに絞ってから末尾を使う
	 * （消えた後のIDへ多重に削除操作を投げないよう、毎回 manifest.groups と突き合わせる）。
	 */
	const [autoGroupIds, setAutoGroupIds] = useState<string[]>([]);
	const [macroSettings, setMacroSettings] =
		useState<SymmetricShapeGroupOptions>({
			clusterType: "centered",
			shapeStyle: "sharp",
			thickness: "thick",
			monochrome: true,
			symmetric: false,
		});

	/** autoGroupIds のうち、まだ実在するものだけ（古い→新しい順）。 */
	const liveAutoGroupIds = useMemo(
		() =>
			autoGroupIds.filter((id) =>
				(manifest.groups ?? []).some((g) => g.id === id),
			),
		[autoGroupIds, manifest.groups],
	);
	/** 「直近の自動図形グループ」の実体。見つからなければリロール／削除ボタンごと出さない。 */
	const lastAutoGroup = useMemo(() => {
		const id = liveAutoGroupIds[liveAutoGroupIds.length - 1];
		return id ? (manifest.groups ?? []).find((g) => g.id === id) : undefined;
	}, [liveAutoGroupIds, manifest.groups]);

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

	/**
	 * プレビューのキャンバスをクリックしたときのレイヤー選択。
	 * レイヤータブが開いていれば、選んだレイヤーの所属グループだけ展開し他は畳んで、
	 * 一覧内のその行までスクロールする（グループを跨いだ大量表示の中から掘り出す動線）。
	 */
	const handleCanvasSelect = useCallback(
		(x: number, y: number) => {
			const layer = findLayerAtPoint(manifest, x, y);
			if (!layer) return;
			setSelectedLayerId(layer.id);
			if (tab === "layers") {
				// すべて畳んだ上で、選んだレイヤーが属すグループだけ展開する
				// （非グループのレイヤーを選んだ場合は、単に全グループが畳まれるだけでよい）。
				update((m) => ({
					...m,
					groups: (m.groups ?? []).map((g) => ({
						...g,
						collapsed: g.id !== layer.groupId,
					})),
				}));
				setPendingScrollLayerId(layer.id);
			}
		},
		[manifest, tab, update],
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
			const mvSprite = MV_LOCAL_SPRITES.find((s) => s.url === result.url);
			updateLayer(layerId, (l) =>
				l.kind === "image"
					? {
							...l,
							ref: result.ref,
							url: result.url,
							walk,
							scale: mvSprite?.scale ?? l.scale ?? 1,
						}
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
			highlightColor: "#ff4444",
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
			highlightColor: "#ff4444",
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
			// 「図形の動き方設定」モーダルの既定値(DEFAULT_SCENE_MOTION=ビート同期)と
			// 必ず一致させる——別々に定義すると、モーダルを開いたときに「ビート同期が
			// 選ばれている」のに実際の動きは別物、という食い違いが起きる。
			modulators: resolveSceneModulators(DEFAULT_SCENE_MOTION),
		};
		update((m) => ({ ...m, layers: [...m.layers, layer] }));
		setSelectedLayerId(layer.id);
	};

	/** グループ内へ図形レイヤーを1枚追加する（`addShapeLayer` と同じ既定値）。 */
	const addShapeToGroup = (groupId: string) => {
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
			modulators: resolveSceneModulators(DEFAULT_SCENE_MOTION),
		};
		update((m) => addLayerToGroup(m, groupId, layer));
		setSelectedLayerId(layer.id);
	};

	/**
	 * 「対称図形グループ」を新規追加する。
	 * 呼び出すたびに新しい対称図形グループを独立して生成する（複数グループ作成可能）。
	 */
	const addSymmetricShapeGroup = () => {
		let z = getNextZ();
		const nextZ = () => {
			const v = z;
			z += 10;
			return v;
		};
		const palette = manifest.stage.palette;
		const { group, layers } = generateSymmetricShapeGroup(nextZ, {
			palette,
			...macroSettings,
		});
		update((m) => ({
			...m,
			layers: [...m.layers, ...layers],
			groups: [...(m.groups ?? []), group],
		}));
		setAutoGroupIds((ids) => [...ids, group.id]);
		if (layers[0]) setSelectedLayerId(layers[0].id);
	};

	/**
	 * 指定したグループの中身を図形乱数で作り直す（リロール）。
	 */
	const rerollSymmetricShapeGroup = (groupId: string) => {
		let z = getNextZ();
		const nextZ = () => {
			const v = z;
			z += 10;
			return v;
		};
		const palette = manifest.stage.palette;
		const newLayers = buildSymmetricShapeGroupLayers(groupId, nextZ, {
			palette,
			...macroSettings,
		});
		update((m) => replaceGroupMembers(m, groupId, newLayers));
	};

	/**
	 * 指定したグループを元にして「特殊アレンジ」の新規グループを作成する。
	 */
	const addArrangedGroup = (groupId: string) => {
		const origLayers = manifest.layers.filter((l) => l.groupId === groupId);
		if (origLayers.length === 0 || origLayers[0].kind !== "shape") return; // 対象が空または非図形

		let z = getNextZ();
		const nextZ = () => {
			const v = z;
			z += 10;
			return v;
		};
		
		const { group, layers } = generateArrangementForGroup(
			origLayers as MvShapeLayer[],
			nextZ,
		);
		
		update((m) => ({
			...m,
			layers: [...m.layers, ...layers],
			groups: [...(m.groups ?? []), group],
		}));
		setAutoGroupIds((ids) => [...ids, group.id]);
		setGroupMenuOpenId(null);
		if (layers[0]) setSelectedLayerId(layers[0].id);
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
			amount: 0.3,
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
			const baseName = src.name || MV_LAYER_KIND_LABELS[src.kind] || src.kind;
			const clone: MvLayer = {
				...src,
				id: newId,
				name: `${baseName} - copy`,
			};
			const layers = [...m.layers];
			layers.splice(index + 1, 0, clone);
			return { ...m, layers };
		});
		setSelectedLayerId(newId);
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
				<SectionTitle>曲をえらぶ</SectionTitle>
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
				<SectionTitle>音の出し方</SectionTitle>
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
				<SectionTitle>背景</SectionTitle>
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
				<SectionTitle>素材・レイヤーの編集</SectionTitle>
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
				<SectionTitle>テーマカラー（パレット）</SectionTitle>
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
				<SectionTitle>フォント</SectionTitle>
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
			{layer.groupId && (
				<div className="flex items-center justify-between gap-2 rounded-lg border border-purple-500/30 bg-purple-950/30 px-3 py-2">
					<span className="truncate text-[11px] font-medium text-purple-200">
						所属:{" "}
						{manifest.groups?.find((g) => g.id === layer.groupId)?.name ??
							"グループ"}
					</span>
					<button
						type="button"
						onClick={() => rerollSymmetricShapeGroup(layer.groupId!)}
						className="flex shrink-0 items-center gap-1 rounded bg-purple-600/30 px-2.5 py-1 text-[10px] font-bold text-purple-200 hover:bg-purple-600/50"
					>
						<Shuffle size={12} />
						グループをリロール
					</button>
				</div>
			)}
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

					<div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/40 p-2.5">
						<div className="flex items-center justify-between">
							<span className="text-[11px] font-bold text-gray-200">
								登場・退場の演出
							</span>
							<span className="text-[10px] text-gray-400">プレビューで確認</span>
						</div>
						<div className="grid grid-cols-2 gap-2 pt-1">
							<button
								type="button"
								onClick={() =>
									setTransitionModalTarget({
										layerId: layer.id,
										initialTab: "entrance",
									})
								}
								className={`flex flex-col items-start gap-1 rounded-md border p-2 text-left transition-colors ${
									layer.entrance && !isMvEntranceInert(layer.entrance)
										? "border-blue-500/50 bg-blue-500/10 text-blue-200"
										: "border-gray-800 bg-gray-900 text-gray-400 hover:bg-gray-800"
								}`}
							>
								<div className="flex items-center justify-between w-full text-[10px] font-bold">
									<span>登場 (イン)</span>
									<Sparkles className="h-3 w-3 text-blue-400" />
								</div>
								<span className="text-[10px] text-gray-400 truncate w-full">
									{layer.entrance && !isMvEntranceInert(layer.entrance)
										? `${MV_TRANSITION_STYLE_LABELS[resolveEntranceStyle(layer.entrance)]} (${layer.entrance.beats}拍)`
										: "瞬時 (なし)"}
								</span>
							</button>

							<button
								type="button"
								onClick={() =>
									setTransitionModalTarget({
										layerId: layer.id,
										initialTab: "exit",
									})
								}
								className={`flex flex-col items-start gap-1 rounded-md border p-2 text-left transition-colors ${
									layer.exit && !isMvExitInert(layer.exit)
										? "border-purple-500/50 bg-purple-500/10 text-purple-200"
										: "border-gray-800 bg-gray-900 text-gray-400 hover:bg-gray-800"
								}`}
							>
								<div className="flex items-center justify-between w-full text-[10px] font-bold">
									<span>退場 (アウト)</span>
									<Sparkles className="h-3 w-3 text-purple-400" />
								</div>
								<span className="text-[10px] text-gray-400 truncate w-full">
									{layer.exit && !isMvExitInert(layer.exit)
										? `${MV_TRANSITION_STYLE_LABELS[resolveExitStyle(layer.exit)]} (${layer.exit.beats}拍)`
										: "瞬時 (なし)"}
								</span>
							</button>
						</div>
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
										walk: v
											? (l.kind === "image" && l.ref
													? walkSettingFromRef(l.ref)
													: undefined) ?? {
													stdId: "auto",
													dir: "s",
													fps: 4,
												}
											: undefined,
									}) as MvLayer,
							)
						}
					/>
					{layer.walk && (
						<NumField
							label="コマ送り速度倍率"
							value={layer.walk.speed ?? 1}
							min={0.1}
							step={0.1}
							onChange={(v) =>
								updateLayer(
									layer.id,
									(l) =>
										({
											...l,
											walk:
												l.kind === "image" && l.walk
													? { ...l.walk, speed: Math.max(0.1, v) }
													: undefined,
										}) as MvLayer,
								)
							}
						/>
					)}
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
					<ColorField
						label="強調文字色"
						value={layer.highlightColor || "#ff4444"}
						onChange={(v) =>
							updateLayer(
								layer.id,
								(l) => ({ ...l, highlightColor: v }) as MvLayer,
							)
						}
					/>
					<Hint>
						[単語] で文字の一部を強調色にできます（例: [犬]が転んだ）。\[ \] でエスケープ可能。
					</Hint>
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
							光る・反応するMMLトラックの選択
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
									{layer.flow === "page" && (
										<SelectField
											label="切り替え間隔"
											value={String(layer.amount ?? 4)}
											options={[
												{ value: "4", label: "4小節ごと" },
												{ value: "2", label: "2小節ごと" },
												{ value: "1", label: "1小節ごと" },
												{ value: "0.5", label: "半小節ごと (2拍)" },
												{ value: "0.25", label: "半々小節ごと (1拍)" },
											]}
											onChange={(v) =>
												updateLayer(
													layer.id,
													(l) =>
														({
															...l,
															amount: parseFloat(v),
														}) as MvLayer,
												)
											}
										/>
									)}
									<Hint>
										「固定」は譜面が横に動かず、指定した長さぶんを並べたまま、その期間が終わると
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
									label="鳴っていない音の予告（グレーアウト）を無効化"
									checked={!!noteLight(layer).hideUnplayed}
									onChange={(v) => updateLight(layer.id, { hideUnplayed: v })}
								/>
								<ColorField
									label="ノート基本色（空欄でトラック色）"
									value={noteLight(layer).color ?? ""}
									onChange={(v) =>
										updateLight(layer.id, { color: v || undefined })
									}
								/>
								<ColorField
									label="発光時の色（空欄で基本色/白）"
									value={noteLight(layer).activeColor ?? ""}
									onChange={(v) =>
										updateLight(layer.id, { activeColor: v || undefined })
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
					<label className="block space-y-0.5">
						<span className={FIELD_LABEL_CLASS}>形</span>
						<button
							type="button"
							onClick={() => setShapeFormPickerLayerId(layer.id)}
							className="flex min-h-9 w-full items-center gap-2 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-left text-[11px] text-gray-100 hover:bg-gray-750"
						>
							<span className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-300">
								<ShapeFormThumb form={layer.form} />
							</span>
							<span className="flex-1">{MV_SHAPE_FORM_LABELS[layer.form]}</span>
							<span className="shrink-0 text-[10px] text-blue-300">変更</span>
						</button>
					</label>
					{/*
						1項目ずつ縦に並べると、広い画面では数値欄1つのために横幅が丸ごと
						余ってもったいない。X/Y、大きさ/回転のような小さい数値欄はペアで
						詰めて並べる（縦横比だけ説明文が長いので単独）。
					*/}
					<div className="grid grid-cols-2 gap-2">
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
					</div>
					<NumField
						label="縦横比（1で正比率。0.5なら縦半分、2なら縦2倍）"
						value={layer.aspect ?? 1}
						min={0.05}
						step={0.05}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, aspect: v }) as MvLayer)
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
							図形の動き（アニメーション）設定
						</p>
						<p className="text-[10px] text-gray-300 leading-relaxed">
							この図形が曲の拍に合わせて回転・脈動拡大・左右移動する動きを設定します。
							動きは曲の最初から最後まで効きます（出す小節はタイムラインで決めます）。
						</p>
						<button
							type="button"
							onClick={() => setMotionTarget({ layerId: layer.id })}
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
											<NumField
												label="コマの繋ぎ（0で瞬時に切替、1でずっと溶け合う）"
												value={layer.iconCycle.crossfade ?? 0}
												min={0}
												max={1}
												step={0.05}
												onChange={(v) =>
													updateLayer(layer.id, (l) =>
														l.kind === "shape" &&
														l.iconCycle &&
														!("advance" in l.iconCycle)
															? {
																	...l,
																	iconCycle: {
																		...l.iconCycle,
																		crossfade: v > 0 ? v : undefined,
																	},
																}
															: l,
													)
												}
											/>
											<Hint>
												場面が8小節ごとに切り替わる曲なら「戻す小節」に8を指定すると、場面の頭で1コマ目
												(シンプルな形)に戻り、残りの小節でコマ2以降を順にめぐるループになります。
												「コマの繋ぎ」は前後のコマを重ねて溶かす割合です。0のままだと形が
												パツンと飛ぶだけで間を埋めるものが無く、変化が大きいほどパラパラ漫画に
												見えます。0.3前後で「決まる瞬間」を残したまま繋がり、1に近づけるとほぼ
												ずっと二重写しになります。
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
						label="複製する数（同じ形を重ねて並べる個数。1なら複製なし）"
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
					<EffectLivePreview layer={layer} bpm={song.bpm} />
					<GroupedSelectField
						label="演出"
						value={layer.style}
						groups={EFFECT_STYLE_GROUPS}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, style: v }) as MvLayer)
						}
					/>
					<p className="rounded border border-blue-500/30 bg-blue-950/20 px-2 py-1.5 text-[10px] leading-relaxed text-blue-200">
						{MV_EFFECT_STYLE_DESCRIPTIONS[layer.style]}
					</p>
					{MV_EFFECT_POST_STYLES.has(layer.style) && (
						<Hint>
							この演出は描き上がった画を読み直して作るため、他より重いです。
							同時に何枚も重ねるとスマホでコマ落ちすることがあります。
						</Hint>
					)}
					<SelectField
						label="タイミング"
						value={layer.trigger}
						options={TRIGGER_OPTIONS}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, trigger: v }) as MvLayer)
						}
					/>
					{(layer.trigger === "beat" || layer.trigger === "bar") && (
						<NumField
							label={
								layer.trigger === "beat"
									? "何拍に1回か（1で毎拍、2で2拍に1回）"
									: "何小節に1回か（1で毎小節、2で2小節に1回）"
							}
							value={layer.every ?? 1}
							min={1}
							step={1}
							onChange={(v) =>
								updateLayer(
									layer.id,
									(l) =>
										({ ...l, every: Math.max(1, Math.round(v)) }) as MvLayer,
								)
							}
						/>
					)}
					<NumField
						label="タイミングをずらす（拍。0.5で裏拍へ）"
						value={layer.offsetBeats ?? 0}
						step={0.25}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, offsetBeats: v }) as MvLayer)
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
					{layer.trigger !== "always" && (
						<SelectField
							label="消え方"
							value={layer.curve ?? "linear"}
							options={EFFECT_CURVE_OPTIONS}
							onChange={(v) =>
								updateLayer(layer.id, (l) => ({ ...l, curve: v }) as MvLayer)
							}
						/>
					)}
					{layer.style === "shockwave" && (
						<div className="space-y-1 rounded border border-gray-700/70 bg-gray-900/60 p-2">
							<p className="text-[10px] text-gray-400">
								波の中心（未入力なら画面の真ん中）
							</p>
							<div className="flex gap-1.5">
								<NumField
									label="X"
									value={layer.x ?? Math.round(MV_W / 2)}
									onChange={(v) =>
										updateLayer(layer.id, (l) => ({ ...l, x: v }) as MvLayer)
									}
								/>
								<NumField
									label="Y"
									value={layer.y ?? Math.round(MV_H / 2)}
									onChange={(v) =>
										updateLayer(layer.id, (l) => ({ ...l, y: v }) as MvLayer)
									}
								/>
							</div>
						</div>
					)}
					{MV_EFFECT_USES_COLOR.has(layer.style) && (
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
				<Details label="常時の動きを調整する (上下ゆれ・drift等)">
					<SelectField
						label="動き"
						value={layer.motion}
						options={MOTION_OPTIONS}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, motion: v }) as MvLayer)
						}
					/>
					{layer.motion !== "none" && (
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
					)}
				</Details>
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

			{/*
				場面（scenes）は単位が「場面まるごと」なので、「この場面の中でも
				この数小節だけ」のような細かい出し分けができなかった。小節番号で
				直接絞り込む欄を別に用意する（場面の指定と併用可、両方ANDで効く）。
			*/}
			<label className="flex items-center gap-1.5 py-1 pt-2">
				<input
					type="checkbox"
					checked={!!layer.barRange}
					onChange={(e) =>
						updateLayer(layer.id, (l) => ({
							...l,
							barRange: e.target.checked
								? [0, (l.barRange?.[1] ?? 4) as number]
								: undefined,
						}))
					}
					className="accent-blue-500"
				/>
				<span className={FIELD_LABEL_CLASS}>
					小節を指定してこの範囲だけ出す
				</span>
			</label>
			{layer.barRange && (
				<div className="flex items-center gap-1.5 pl-1">
					<StringNumInput
						value={layer.barRange[0]}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.barRange
									? { ...l, barRange: [v, l.barRange[1]] }
									: l,
							)
						}
						className="min-h-9 w-20 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
					/>
					<span className="shrink-0 text-[10px] text-gray-400">
						小節 〜（この小節を含まない）
					</span>
					<StringNumInput
						value={layer.barRange[1]}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.barRange
									? { ...l, barRange: [l.barRange[0], v] }
									: l,
							)
						}
						className="min-h-9 w-20 shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
					/>
					<span className="shrink-0 text-[10px] text-gray-400">小節</span>
				</div>
			)}
		</div>
	);

	/**
	 * レイヤー一覧の1行を組み立てる。グループの中身・グループに属さない単独レイヤーの
	 * どちらからも呼ぶ——上下移動の可否と処理だけ呼び出し側から渡してもらう
	 * （単独レイヤーは「一覧全体での前後」、グループ内メンバーは「そのグループ内での前後」で
	 * 意味が違うので、ここでは判定しない）。実体は `LayerRow`（トップレベルコンポーネント）。
	 */
	const renderLayerRow = (
		layer: MvLayer,
		opts: {
			canMoveUp: boolean;
			canMoveDown: boolean;
			onMoveUp: () => void;
			onMoveDown: () => void;
		},
	) => {
		const active = layer.id === selectedLayerId;
		return (
			<LayerRow
				key={layer.id}
				layer={layer}
				sections={manifest.sections}
				active={active}
				onSelect={() => setSelectedLayerId(active ? null : layer.id)}
				onHover={() => setHoveredLayerId(layer.id)}
				onUnhover={() => setHoveredLayerId(null)}
				canMoveUp={opts.canMoveUp}
				canMoveDown={opts.canMoveDown}
				onMoveUp={opts.onMoveUp}
				onMoveDown={opts.onMoveDown}
				onDuplicate={() => duplicateLayer(layer.id)}
				onRemove={() => removeLayer(layer.id)}
				detail={active ? renderLayerSettings(layer) : null}
				rowRef={(el) => {
					layerRowElsRef.current[layer.id] = el;
				}}
			/>
		);
	};

	const layerRows = buildLayerListRows(manifest);

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
				<div className="mb-2 overflow-hidden rounded-lg border border-purple-500/30 bg-purple-950/20">
					<button
						onClick={() => setMacroSettingsOpen(!macroSettingsOpen)}
						className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-bold text-purple-200 hover:bg-purple-600/20"
					>
						<span className="flex items-center gap-1.5">
							<Settings size={13} />
							詳細設定（生成スタイル）
						</span>
						{macroSettingsOpen ? (
							<ChevronUp size={14} />
						) : (
							<ChevronDown size={14} />
						)}
					</button>
					{macroSettingsOpen && (
						<div className="space-y-2 border-t border-purple-500/30 p-3 pt-2 text-[10px] text-purple-100">
							<label className="flex items-center justify-between">
								<span>配置</span>
								<select
									value={macroSettings.clusterType}
									onChange={(e) =>
										setMacroSettings((s) => ({
											...s,
											clusterType: e.target.value as "centered" | "scattered",
										}))
									}
									className="rounded bg-purple-900 px-1 py-0.5 text-purple-100 outline-none"
								>
									<option value="centered">中央に入れ子（エンブレム風）</option>
									<option value="scattered">中央線上に横並び</option>
								</select>
							</label>
							<label className="flex items-center justify-between">
								<span>動きの質感</span>
								<select
									value={macroSettings.motionFeel ?? "crisp"}
									onChange={(e) =>
										setMacroSettings((s) => ({
											...s,
											motionFeel: e.target.value as "crisp" | "smooth",
										}))
									}
									className="rounded bg-purple-900 px-1 py-0.5 text-purple-100 outline-none"
								>
									<option value="crisp">キレ重視（拍で決まる）</option>
									<option value="smooth">なめらか（連続して揺れる）</option>
								</select>
							</label>
							<label className="flex items-center justify-between">
								<span>ベースの拍</span>
								<select
									value={String(macroSettings.baseBeats ?? 1)}
									onChange={(e) =>
										setMacroSettings((s) => ({
											...s,
											baseBeats: Number(e.target.value),
										}))
									}
									className="rounded bg-purple-900 px-1 py-0.5 text-purple-100 outline-none"
								>
									{MV_SHAPE_BASE_BEATS_OPTIONS.map((o) => (
										<option key={o.value} value={String(o.value)}>
											{o.label}
										</option>
									))}
								</select>
							</label>
							<Hint>
								ベースの拍でひと巡りします。図形ごとに等倍・1/2倍速・1/4倍速を織り交ぜるので、
								速い図形が拍を刻む裏でゆっくり形が変わる層ができます（すべて整数倍なので小節の頭で必ず揃います）。
							</Hint>
							<label className="flex items-center justify-between">
								<span>図形の傾向</span>
								<select
									value={macroSettings.shapeStyle}
									onChange={(e) =>
										setMacroSettings((s) => ({
											...s,
											shapeStyle: e.target.value as "sharp" | "round" | "all",
										}))
									}
									className="rounded bg-purple-900 px-1 py-0.5 text-purple-100 outline-none"
								>
									<option value="sharp">シャープ（四角や線など）</option>
									<option value="round">ラウンド（円や波紋など）</option>
									<option value="all">すべてランダム</option>
								</select>
							</label>
							<label className="flex items-center justify-between">
								<span>線の太さ</span>
								<select
									value={macroSettings.thickness}
									onChange={(e) =>
										setMacroSettings((s) => ({
											...s,
											thickness: e.target.value as "thick" | "thin" | "random",
										}))
									}
									className="rounded bg-purple-900 px-1 py-0.5 text-purple-100 outline-none"
								>
									<option value="thick">太め</option>
									<option value="thin">細め</option>
									<option value="random">ランダム</option>
								</select>
							</label>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={!!macroSettings.monochrome}
									onChange={(e) =>
										setMacroSettings((s) => ({
											...s,
											monochrome: e.target.checked,
										}))
									}
									className="h-3 w-3 accent-purple-500"
								/>
								モノクロ配色にする（白・グレー基調）
							</label>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={!!macroSettings.symmetric}
									onChange={(e) =>
										setMacroSettings((s) => ({
											...s,
											symmetric: e.target.checked,
										}))
									}
									className="h-3 w-3 accent-purple-500"
								/>
								左右対称に配置する
							</label>
						</div>
					)}
				</div>
				<button
					onClick={addSymmetricShapeGroup}
					className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-purple-500/50 bg-purple-600/30 px-3 py-2 text-[11px] font-bold text-purple-200 hover:bg-purple-600/50"
				>
					<Plus size={13} />
					自動図形グループを新規追加
				</button>
				{lastAutoGroup && (
					<div className="mb-2 flex gap-1.5">
						<button
							onClick={() => rerollSymmetricShapeGroup(lastAutoGroup.id)}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-[11px] font-medium text-gray-200 hover:bg-gray-800"
						>
							<Shuffle size={13} />
							直近をリロール
						</button>
						<button
							onClick={() => {
								// liveAutoGroupIds は実在するものだけに絞ってあるので、末尾は必ず
								// まだ消えていないグループ。連打すれば1つずつ古い方へ遡って消せる。
								const targetId =
									liveAutoGroupIds[liveAutoGroupIds.length - 1];
								if (!targetId) return;
								update((m) => deleteGroup(m, targetId));
								setAutoGroupIds((ids) => ids.filter((id) => id !== targetId));
							}}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-[11px] font-medium text-red-300 hover:bg-red-900/40"
						>
							<Trash2 size={13} />
							直近を削除
						</button>
					</div>
				)}
				<Hint>
					幾何学的な図形の集まりを新しいグループとして自動生成します（複数作成可能）。
					拍ごとに形そのものが切り替わり、打点で「小さく太く出て、膨らみながら細くなって消える」構図になります。
					気に入らなければ上の「直近をリロール」で作り直し、「直近を削除」で丸ごと消せます（連打すると新しい方から順に1つずつ遡って消えます。グループ一覧や個々のレイヤー設定の「リロール」からも同じことができます）。
				</Hint>
				{manifest.layers.length === 0 && (
					<p className="text-[10px] text-gray-500">レイヤーがありません。</p>
				)}
			</div>

			{manifest.layers.length > 0 && (
				<button
					type="button"
					onClick={() => setTimelineModalOpen(true)}
					className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-[11px] font-medium text-gray-200 hover:bg-gray-800"
				>
					<Clapperboard size={13} />
					タイムラインを開く（どの小節で出すか）
				</button>
			)}

			<div className={SECTION_CLASS}>
				<div className="flex items-center justify-between gap-2 pb-1">
					<p className="text-[10px] leading-relaxed text-gray-400">
						複数のレイヤーをまとめて一括で並び替え・編集したいときはグループ化します。
					</p>
					<button
						onClick={() => {
							setGroupSelectIds(new Set());
							setGroupModalOpen(true);
						}}
						className="flex shrink-0 items-center gap-1 rounded bg-gray-700 px-2 py-1.5 text-[10px] text-gray-200 hover:bg-gray-600"
					>
						<FolderPlus size={12} />
						グループ化
					</button>
				</div>

				{layerRows.map((row, rowIndex) => {
					if (row.kind === "single") {
						const layer = row.layer as MvLayer;
						return renderLayerRow(layer, {
							canMoveUp: rowIndex > 0,
							canMoveDown: rowIndex < layerRows.length - 1,
							onMoveUp: () =>
								update((m) => moveTopLevelLayer(m, layer.id, "up")),
							onMoveDown: () =>
								update((m) => moveTopLevelLayer(m, layer.id, "down")),
						});
					}

					const group = row.group as MvLayerGroup;
					const members = row.members ?? [];
					return (
						<div
							key={group.id}
							className="overflow-hidden rounded border border-purple-600/40 bg-purple-950/10"
						>
							<div className="flex items-center gap-2 bg-purple-900/20 px-2 py-1.5">
								<button
									onClick={() =>
										update((m) => toggleGroupCollapsed(m, group.id))
									}
									className="shrink-0 text-purple-300"
								>
									{group.collapsed ? (
										<ChevronRight size={14} />
									) : (
										<ChevronDown size={14} />
									)}
								</button>
								<FolderPlus size={13} className="shrink-0 text-purple-400" />
								<input
									value={group.name ?? "グループ"}
									onChange={(e) =>
										update((m) => renameGroup(m, group.id, e.target.value))
									}
									className="min-h-9 min-w-0 flex-1 rounded bg-transparent px-1 text-[11px] font-medium text-purple-100 outline-none focus:bg-purple-900/40"
								/>
								<span className="shrink-0 rounded bg-purple-700/50 px-1 py-0.5 text-[9px] text-purple-200">
									{members.length}枚
								</span>
								<div className="flex flex-col gap-0.5">
									<button
										disabled={rowIndex === 0}
										onClick={() =>
											update((m) => moveGroupBlock(m, group.id, "up"))
										}
										className="grid h-4 w-6 place-items-center rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600"
									>
										<ChevronUp size={12} />
									</button>
									<button
										disabled={rowIndex === layerRows.length - 1}
										onClick={() =>
											update((m) => moveGroupBlock(m, group.id, "down"))
										}
										className="grid h-4 w-6 place-items-center rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600"
									>
										<ChevronDown size={12} />
									</button>
								</div>
								<div className="relative">
									<button
										onClick={() =>
											setGroupMenuOpenId(
												groupMenuOpenId === group.id ? null : group.id,
											)
										}
										title="グループの特殊操作"
										className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
											groupMenuOpenId === group.id
												? "bg-purple-600 text-purple-100"
												: "bg-gray-700 text-gray-300 hover:bg-gray-600"
										}`}
									>
										<Settings size={16} />
									</button>
									{groupMenuOpenId === group.id && (
										<div className="absolute right-0 top-full z-10 mt-1 flex w-48 flex-col overflow-hidden rounded-lg border border-purple-500/30 bg-purple-950/90 shadow-xl backdrop-blur-sm">
											<button
												onClick={() => {
													rerollSymmetricShapeGroup(group.id);
													setGroupMenuOpenId(null);
												}}
												className="flex items-center gap-2 px-3 py-2 text-left text-[11px] text-purple-200 hover:bg-purple-600/30"
											>
												<Shuffle size={14} />
												ランダムリロール
											</button>
											<button
												onClick={() => addArrangedGroup(group.id)}
												className="flex items-center gap-2 px-3 py-2 text-left text-[11px] text-purple-200 hover:bg-purple-600/30"
											>
												<Sparkles size={14} />
												特殊アレンジを生成
											</button>
											<button
												onClick={() => {
													setBulkEditGroupId(group.id);
													setGroupMenuOpenId(null);
												}}
												className="flex items-center gap-2 px-3 py-2 text-left text-[11px] text-purple-200 hover:bg-purple-600/30"
											>
												<SlidersHorizontal size={14} />
												一括編集（重なり順/座標/不透明度）
											</button>
										</div>
									)}
								</div>
								<button
									onClick={() => update((m) => ungroupLayers(m, group.id))}
									title="グループ解除（中身のレイヤーは残ります）"
									className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-700 text-gray-300 transition-colors hover:bg-gray-600"
								>
									<FolderX size={16} />
								</button>
								<button
									onClick={() => update((m) => deleteGroup(m, group.id))}
									title="グループごと削除"
									className={DEL_BTN_CLASS}
								>
									<Trash2 size={16} />
								</button>
							</div>
							{!group.collapsed && (
								<div className="space-y-1.5 border-t border-purple-700/30 bg-gray-900/40 p-1.5 pl-4">
									{members.map((layer, mi) =>
										renderLayerRow(layer, {
											canMoveUp: mi > 0,
											canMoveDown: mi < members.length - 1,
											onMoveUp: () =>
												update((m) =>
													moveLayerWithinGroup(m, layer.id, "up"),
												),
											onMoveDown: () =>
												update((m) =>
													moveLayerWithinGroup(m, layer.id, "down"),
												),
										}),
									)}
									<button
										onClick={() => addShapeToGroup(group.id)}
										className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-purple-600/50 py-1.5 text-[10px] text-purple-300 hover:bg-purple-900/20"
									>
										<Plus size={12} />
										このグループに図形を追加
									</button>
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
							<SectionTitle>裏歌詞</SectionTitle>
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
						<SectionTitle>{i === 0 ? "表歌詞" : "裏歌詞"}</SectionTitle>
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
								{/*
									内部値は「今の行を除いた残像の段数」(afterimage)だが、
									ユーザーには「同時に何行まで見えるか」(afterimage+1)で見せたほうが
									直感的（"1行だけ" "4行まで" のような指定がそのまま入力できる）。
									下の歌詞一覧・編集リストが長くなると埋もれて見つからなくなるので、
									あえてパネルの一番上（出どころの直後）に強調枠で置く。
								*/}
								<div className="rounded border border-blue-500/50 bg-blue-950/30 p-2">
									<NumField
										label="同時に表示する行数（1なら常に1行だけ、4なら4行まで積み上がる）"
										value={lyricsLayer.afterimage + 1}
										min={1}
										max={13}
										onChange={(v) =>
											updateLayer(
												lyricsLayer.id,
												(l) =>
													({
														...l,
														afterimage: Math.max(0, Math.round(v) - 1),
													}) as MvLayer,
											)
										}
									/>
								</div>
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
														const barKey = Math.round(line.bar * 100) / 100;
														const resetBars = lyricsLayer.resetBars ?? [];
														const isReset = resetBars.some(
															(b) => Math.abs(b - line.bar) < 0.01,
														);
														return (
															<li
																key={i}
																className="flex flex-col items-start gap-1 rounded border border-gray-700/60 bg-gray-900/80 p-1.5 text-gray-200 sm:flex-row sm:items-center sm:justify-between sm:gap-1.5"
															>
																<div className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-1.5">
																	<span className="shrink-0 rounded bg-blue-950 px-1.5 py-0.5 font-mono text-[9px] text-blue-300 border border-blue-800/60">
																		{line.bar.toFixed(1)}〜{(line.bar + hold).toFixed(1)}小節 [{formatMinSecMs(startSec)}〜{formatMinSecMs(endSec)}]
																	</span>
																	<span className="min-w-0 whitespace-normal break-words text-[11px] font-medium">{line.text}</span>
																</div>
																<label
																	title="この行で一旦全部消してから出し直す"
																	className="flex shrink-0 items-center gap-1 text-[9px] text-gray-400"
																>
																	<input
																		type="checkbox"
																		checked={isReset}
																		onChange={(e) =>
																			updateLayer(lyricsLayer.id, (l) =>
																				l.kind === "lyrics"
																					? {
																							...l,
																							resetBars: e.target.checked
																								? [...resetBars, barKey]
																								: resetBars.filter(
																										(b) =>
																											Math.abs(b - line.bar) >=
																											0.01,
																									),
																						}
																					: l,
																			)
																		}
																		className="accent-blue-500"
																	/>
																	リセット
																</label>
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
												<Hint>
													「リセット」を付けた行から、それまでに積み上がった行を全部消して出し直します。
													曲のどこで区切るかは行ごとに自由に選べます（未指定なら全曲通してずっと積み上がります）。
												</Hint>
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
													<label className="flex items-center gap-1.5 px-1">
														<input
															type="checkbox"
															checked={!!line.resetBefore}
															onChange={(e) =>
																updateLayer(lyricsLayer.id, (l) =>
																	l.kind === "lyrics"
																		? {
																				...l,
																				lines: (l.lines ?? []).map((x, j) =>
																					j === i
																						? {
																								...x,
																								resetBefore: e.target.checked,
																							}
																						: x,
																				),
																			}
																		: l,
																)
															}
															className="accent-blue-500"
														/>
														<span className="text-[10px] text-gray-400">
															この行で一旦全部消してから出し直す（未チェックなら直前の行に積み重ねる）
														</span>
													</label>
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
																	...groups.flatMap((g, gi) =>
																		g.lines.map((line, li) =>
																			gi > 0 && li === 0
																				? { ...line, resetBefore: true }
																				: line,
																		),
																	),
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
									label={`開始位置X（1行目の位置。画面の幅は ${MV_W}）`}
									value={lyricsLayer.x}
									onChange={(v) =>
										updateLayer(
											lyricsLayer.id,
											(l) => ({ ...l, x: v }) as MvLayer,
										)
									}
								/>
								<NumField
									label={`開始位置Y（1行目の位置。画面の高さは ${MV_H}）`}
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
								<ColorField
									label="強調文字色"
									value={lyricsLayer.highlightColor || "#ff4444"}
									onChange={(v) =>
										updateLayer(
											lyricsLayer.id,
											(l) => ({ ...l, highlightColor: v }) as MvLayer,
										)
									}
								/>
								<Hint>
									[単語] で文字の一部を強調色にできます（例: [犬]が転んだ）。\[ \] でエスケープ可能。
								</Hint>
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
								{/*
									2行目以降がどちらへ伸びるか。開始位置を画面の端に寄せたとき、
									向きが逆だと積み上がった行がそのまま画面外へ出ていってしまうので、
									開始位置とセットで選べるようにしてある。
								*/}
								{(() => {
									const stack = resolveLyricStack(lyricsLayer);
									const options = lyricsLayer.vertical
										? (["left", "right"] as MvLyricStack[])
										: (["up", "down"] as MvLyricStack[]);
									// はみ出しそうな組み合わせは先に知らせる（気付けるのは再生後だと遅い）
									const span =
										lyricsLayer.size *
										(lyricsLayer.vertical ? 1.7 : 1.35) *
										lyricsLayer.afterimage;
									const overflow =
										stack === "left"
											? lyricsLayer.x - span < 0
											: stack === "right"
												? lyricsLayer.x + span > MV_W
												: stack === "up"
													? lyricsLayer.y - span < 0
													: lyricsLayer.y + span > MV_H;
									return (
										<>
											<SelectField
												label="行が流れる向き（2行目以降が伸びる方向）"
												value={stack}
												options={options.map((s) => ({
													value: s,
													label: MV_LYRIC_STACK_LABELS[s],
												}))}
												onChange={(v) =>
													updateLayer(
														lyricsLayer.id,
														(l) => ({ ...l, stack: v }) as MvLayer,
													)
												}
											/>
											{overflow && (
												<p className="rounded border border-amber-500/40 bg-amber-950/30 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200">
													この開始位置とこの向きだと、行が増えたときに画面の外へはみ出します。
													逆向きにするか、開始位置を反対側へ寄せてください。
												</p>
											)}
										</>
									);
								})()}
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
				<SectionTitle>場面（シーン管理）</SectionTitle>
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
									<Details label="背景と画面切替の設定">
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

									<Details label={`この場面で表示するレイヤーと動き (${manifest.layers.length}枚)`}>
										<Hint>
											チェックを入れたレイヤーがこの場面で画面に表示されます。「動きを編集」の動きは曲全体に効きます（場面ごとには変わりません）。
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
																	onClick={() => setMotionTarget({ layerId: l.id })}
																	className="rounded bg-blue-600/30 border border-blue-500/40 px-2 py-1 text-[10px] font-medium text-blue-200 hover:bg-blue-600/40"
																>
																	動きを編集
																</button>
															)}
															<button
																onClick={() => {
																	setSelectedLayerId(l.id);
																	setTab("layers");
																}}
																className="rounded bg-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-600"
															>
																詳細設定
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

	const baseShapeLayer = motionTarget
		? manifest.layers.find(
				(l): l is MvShapeLayer =>
					l.kind === "shape" && l.id === motionTarget.layerId,
			)
		: null;

	const transitionModalLayer = transitionModalTarget
		? manifest.layers.find((l) => l.id === transitionModalTarget.layerId)
		: null;

	const shapeFormPickerLayer = shapeFormPickerLayerId
		? manifest.layers.find(
				(l): l is MvShapeLayer =>
					l.kind === "shape" && l.id === shapeFormPickerLayerId,
			)
		: null;

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
						onCanvasClick={handleCanvasSelect}
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

			{motionTarget && baseShapeLayer && (
				<MvShapeMotionModal
					baseLayer={baseShapeLayer}
					bpm={song.bpm}
					// 開き直したとき前回の選択（プリセット/速さ）を復元する。
					// 場面別だった頃のデータしか無ければ、その最初の1つを引き継ぐ。
					initial={
						baseShapeLayer.motionPreset ??
						Object.values(baseShapeLayer.motionPresetByScene ?? {})[0]
					}
					onApply={(cfg) => {
						updateLayer(baseShapeLayer.id, (l) => {
							if (l.kind !== "shape") return l;
							return {
								...l,
								modulators: resolveSceneModulators(cfg),
								motionPreset: cfg,
								// 動きは曲全体で1つ。場面別の残骸を消しておかないと、
								// engine 側の旧データ救済に拾われて上書きされてしまう。
								modulatorsByScene: undefined,
								motionPresetByScene: undefined,
							};
						});
					}}
					onClose={() => setMotionTarget(null)}
				/>
			)}

			{transitionModalTarget && transitionModalLayer && (
				<MvTransitionModal
					layer={transitionModalLayer}
					bpm={song.bpm}
					initialTarget={transitionModalTarget.initialTab}
					onApply={(entrance, exit) => {
						updateLayer(transitionModalLayer.id, (l) => ({
							...l,
							entrance,
							exit,
						}));
					}}
					onClose={() => setTransitionModalTarget(null)}
				/>
			)}

			{timelineModalOpen && (
				<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
					<div className="flex h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-gray-900 sm:h-[80vh] sm:rounded-xl">
						<div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
							<span className="flex items-center gap-2 text-sm font-bold text-gray-100">
								<Clapperboard size={15} className="text-blue-400" />
								タイムライン（どの小節で出すか）
							</span>
							<button
								onClick={() => setTimelineModalOpen(false)}
								className="rounded p-1 text-gray-400 hover:bg-gray-800"
							>
								<X size={18} />
							</button>
						</div>
						<div className="flex-1 overflow-y-auto p-3">
							<MvTimeline
								layers={manifest.layers}
								sections={manifest.sections}
								totalBars={song.totalBars}
								labelOf={layerLabel}
								kindLabelOf={layerKindLabel}
								selectedLayerId={selectedLayerId}
								onSelectLayer={setSelectedLayerId}
								onChangeRange={(id, range) =>
									updateLayer(id, (l) => ({ ...l, barRange: range }))
								}
								onSeekBar={(bar) => playerRef.current?.seekToBar(bar)}
							/>
						</div>
					</div>
				</div>
			)}

			{groupModalOpen && (
				<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
					<div className="flex h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-gray-900 sm:h-auto sm:max-h-[80vh] sm:rounded-xl">
						<div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
							<span className="flex items-center gap-2 text-sm font-bold text-gray-100">
								<FolderPlus size={15} className="text-purple-400" />
								既存レイヤーをグループ化
							</span>
							<button
								onClick={() => setGroupModalOpen(false)}
								className="rounded p-1 text-gray-400 hover:bg-gray-800"
							>
								<X size={18} />
							</button>
						</div>
						<div className="flex-1 space-y-1.5 overflow-y-auto p-3">
							<p className="pb-1 text-[10px] leading-relaxed text-gray-400">
								まとめたいレイヤーを2枚以上チェックしてください（まだどのグループにも属していないレイヤーだけが対象です）。
							</p>
							{manifest.layers.filter((l) => !l.groupId).length === 0 && (
								<p className="text-[10px] text-gray-500">
									グループ化できるレイヤーがありません。
								</p>
							)}
							{manifest.layers
								.filter((l) => !l.groupId)
								.map((layer) => {
									const checked = groupSelectIds.has(layer.id);
									return (
										<label
											key={layer.id}
											className={`flex items-center gap-2 rounded border px-2 py-1.5 text-[11px] ${checked ? "border-blue-500 bg-blue-500/10 text-gray-100" : "border-gray-700 bg-gray-800 text-gray-300"}`}
										>
											<input
												type="checkbox"
												checked={checked}
												onChange={(e) =>
													setGroupSelectIds((prev) => {
														const next = new Set(prev);
														if (e.target.checked) next.add(layer.id);
														else next.delete(layer.id);
														return next;
													})
												}
												className="h-4 w-4 shrink-0 accent-blue-500"
											/>
											<span className="truncate">{layerLabel(layer)}</span>
											<span className="ml-auto shrink-0 rounded bg-gray-700/80 px-1 py-0.5 text-[9px] text-gray-400">
												{layerKindLabel(layer)}
											</span>
										</label>
									);
								})}
						</div>
						<div className="flex shrink-0 gap-2 border-t border-gray-800 p-3">
							<button
								onClick={() => {
									setGroupModalOpen(false);
									setGroupSelectIds(new Set());
								}}
								className="flex-1 rounded bg-gray-700 px-3 py-2 text-[11px] text-gray-300 hover:bg-gray-600"
							>
								キャンセル
							</button>
							<button
								disabled={groupSelectIds.size < 2}
								onClick={() => {
									update((m) => groupSelectedLayers(m, [...groupSelectIds]));
									setGroupModalOpen(false);
									setGroupSelectIds(new Set());
								}}
								className="flex-1 rounded bg-blue-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"
							>
								確定してグループ化
							</button>
						</div>
					</div>
				</div>
			)}

			{bulkEditGroupId && (
				<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
					<div className="flex w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-gray-900 sm:rounded-xl">
						<div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
							<span className="flex items-center gap-2 text-sm font-bold text-gray-100">
								<SlidersHorizontal size={15} className="text-purple-400" />
								グループ一括編集
							</span>
							<button
								onClick={() => setBulkEditGroupId(null)}
								className="rounded p-1 text-gray-400 hover:bg-gray-800"
							>
								<X size={18} />
							</button>
						</div>
						<div className="space-y-3 p-3">
							<div className="flex gap-1.5">
								{(
									[
										{ v: "z", label: "重なり順" },
										{ v: "position", label: "座標" },
										{ v: "opacity", label: "不透明度" },
									] as const
								).map((opt) => (
									<button
										key={opt.v}
										onClick={() => setBulkField(opt.v)}
										className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium ${bulkField === opt.v ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
									>
										{opt.label}
									</button>
								))}
							</div>
							<div className="flex gap-1.5">
								{(
									[
										{ v: "relative", label: "相対増減" },
										{ v: "absolute", label: "絶対指定" },
									] as const
								).map((opt) => (
									<button
										key={opt.v}
										onClick={() => setBulkMode(opt.v)}
										className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium ${bulkMode === opt.v ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
									>
										{opt.label}
									</button>
								))}
							</div>
							{bulkField === "position" ? (
								<div className="flex items-center gap-2">
									<span className="w-6 shrink-0 text-[10px] text-gray-400">
										X
									</span>
									<StringNumInput
										value={bulkX}
										onChange={setBulkX}
										className="min-h-9 w-full rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
									/>
									<span className="w-6 shrink-0 text-[10px] text-gray-400">
										Y
									</span>
									<StringNumInput
										value={bulkY}
										onChange={setBulkY}
										className="min-h-9 w-full rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
									/>
								</div>
							) : (
								<StringNumInput
									value={bulkValue}
									onChange={setBulkValue}
									className="min-h-9 w-full rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none"
								/>
							)}
							<p className="text-[10px] leading-relaxed text-gray-500">
								{bulkMode === "relative"
									? "グループ内の各レイヤーの現在値へこの数値を足します（レイヤーごとの差はそのまま）。"
									: "グループ内の全レイヤーをこの値へ揃えます（重なり順だけは並び順に沿って自動で間隔を空けます）。"}
							</p>
						</div>
						<div className="flex shrink-0 gap-2 border-t border-gray-800 p-3">
							<button
								onClick={() => setBulkEditGroupId(null)}
								className="flex-1 rounded bg-gray-700 px-3 py-2 text-[11px] text-gray-300 hover:bg-gray-600"
							>
								キャンセル
							</button>
							<button
								onClick={() => {
									const groupId = bulkEditGroupId;
									update((m) => {
										if (bulkField === "z")
											return shiftGroupZ(m, groupId, bulkMode, bulkValue);
										if (bulkField === "opacity")
											return applyGroupOpacity(m, groupId, bulkMode, bulkValue);
										return applyGroupPosition(m, groupId, bulkMode, bulkX, bulkY);
									});
									setBulkEditGroupId(null);
								}}
								className="flex-1 rounded bg-purple-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-purple-500"
							>
								適用
							</button>
						</div>
					</div>
				</div>
			)}

			{shapeFormPickerLayerId && shapeFormPickerLayer && (
				<MvShapeFormPickerModal
					value={shapeFormPickerLayer.form}
					onSelect={(form) =>
						updateLayer(shapeFormPickerLayer.id, (l) =>
							l.kind === "shape" ? { ...l, form } : l,
						)
					}
					onClose={() => setShapeFormPickerLayerId(null)}
				/>
			)}
		</div>
	);
}
