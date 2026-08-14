"use client";

import {
	BarChart3,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	Clapperboard,
	Clipboard,
	Copy,
	Download,
	FolderPlus,
	FolderX,
	Grid3x3,
	Hash,
	History,
	Image as ImageIcon,
	Layers,
	ListMusic,
	Music,
	Play,
	Plus,
	Redo2,
	Settings,
	Shapes,
	Shuffle,
	SlidersHorizontal,
	Smile,
	Sparkles,
	SquareStack,
	Timer,
	Trash2,
	Type,
	Undo2,
	Upload,
	X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildPsdRef, parseWalkRef, refLabel } from "@/lib/asset-ref";
import { handleImgError } from "@/lib/cors-proxy";
import {
	clearAutosave,
	getAutosave,
	getStorageKey,
	saveAutosave,
	saveHistory,
} from "@/lib/history";
import {
	findLocalMvSpriteEyeMouthCombo,
	type LocalMvSprite,
	MV_LOCAL_SPRITES,
	mvSpriteRef,
	parseEyeMouthComboName,
} from "@/lib/local-assets";
import {
	DEFAULT_MV_BLINK,
	DEFAULT_MV_LIPSYNC_TRACK,
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
	MV_PRESET_LABELS,
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
	MV_VOWEL_LABELS,
	MV_W,
	type MvAssetRef,
	type MvAudioMode,
	type MvBeatChordLabelLayer,
	type MvBeatCounterLayer,
	type MvBeatDigitLayer,
	type MvBeatPipsLayer,
	type MvBlend,
	type MvCharacterLayer,
	type MvChordBarLayer,
	type MvChordColorMode,
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
	type MvVowel,
	type MvWalkSetting,
	type MvWidgetLayer,
	mvAudioMode,
	mvUid,
	mvWalkSpeed,
	parseLyricsBulkGroups,
	resolveEntranceStyle,
	resolveExitStyle,
	resolveLyricStack,
} from "@/lib/mv-config";
import {
	ensureCustomFontLoaded,
	loadCustomFonts,
	type MvCustomFont,
	removeCustomFont,
	upsertCustomFont,
} from "@/lib/mv-custom-fonts";
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
	applyGroupBlend,
	applyGroupColor,
	applyGroupOpacity,
	applyGroupPosition,
	applyGroupRotation,
	applyGroupSize,
	applyGroupThickness,
	buildLayerListRows,
	compactZ,
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
import { listPsdLayerPaths, type PsdLayerInfo } from "@/lib/mv-psd";
import {
	buildSymmetricShapeGroupLayers,
	DEFAULT_BEAT_COMBO_DENSITY,
	generateArrangementForGroup,
	generateSymmetricShapeGroup,
	MV_SHAPE_BASE_BEATS_OPTIONS,
	type SymmetricShapeGroupOptions,
} from "@/lib/mv-shape-group-macro";
import {
	DEFAULT_SCENE_MOTION,
	resolveSceneModulators,
} from "@/lib/mv-shape-motion";
import ContentPicker, { type PickResult } from "./ContentPicker";
import HistoryModal from "./HistoryModal";
import MvArrangementModal from "./MvArrangementModal";
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
	compact,
}: {
	layer: MvEffectLayer;
	bpm?: number;
	/**
	 * 設定パネルにその場で出す用の小さいサイズ。全幅で出すと縦に場所を食いすぎる
	 * （特にスマホ）ので、確認用途としては親指の爪くらいの大きさで十分。
	 * モーダルの選択肢グリッド（行の横幅いっぱいに出したい）では false のまま使う。
	 */
	compact?: boolean;
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
			className={
				compact
					? "block h-auto w-32 mx-auto rounded bg-black sm:w-40"
					: "block h-auto w-full rounded bg-black"
			}
			style={{ aspectRatio: `${MV_W} / ${MV_H}` }}
		/>
	);
}

/**
 * 「演出を選ぶ」モーダル。`MvShapeMotionModal`（図形の動き方設定）と同じ考え方——
 * プルダウンの文字列だけでは何が起きるかイメージしにくいので、カテゴリ見出し付きの
 * 縦一覧で、各行に常時再生のライブプレビューを添えて選ばせる（`MvEffectTemplatePicker`
 * の一覧画面と同じ並べ方）。タップした瞬間に確定して閉じる——トリガーや色などの
 * 細かいパラメータは選択後も設定パネル側に残ったままなので、ここでは種類だけ選べれば良い。
 */
function EffectStylePickerModal({
	layer,
	bpm,
	onPick,
	onClose,
}: {
	layer: MvEffectLayer;
	bpm?: number;
	onPick: (style: MvEffectStyle) => void;
	onClose: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
			<div className="flex h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-gray-900 sm:h-[85vh] sm:rounded-xl">
				<div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
					<span className="text-sm font-bold text-gray-100">演出を選ぶ</span>
					<button
						onClick={onClose}
						className="rounded p-1 text-gray-400 hover:bg-gray-800"
					>
						<X size={18} />
					</button>
				</div>
				<div className="flex-1 space-y-4 overflow-y-auto p-3">
					{EFFECT_STYLE_GROUPS.map((g) => (
						<div key={g.label}>
							<p className="mb-1.5 text-[10px] font-bold text-gray-400">
								{g.label}
							</p>
							<div className="space-y-2">
								{g.options.map((o) => (
									<button
										key={o.value}
										onClick={() => {
											onPick(o.value);
											onClose();
										}}
										className={`block w-full rounded-lg border p-2 text-left active:scale-[0.99] ${
											layer.style === o.value
												? "border-blue-500 bg-blue-500/10"
												: "border-gray-700 bg-gray-800/60"
										}`}
									>
										<EffectLivePreview layer={{ ...layer, style: o.value }} bpm={bpm} />
										<div className="mt-2 flex items-center gap-2">
											<span className="text-[13px] font-bold text-gray-100">
												{o.label}
											</span>
											{layer.style === o.value && (
												<span className="rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
													選択中
												</span>
											)}
										</div>
										<p className="mt-1 text-[11px] leading-relaxed text-gray-400">
											{MV_EFFECT_STYLE_DESCRIPTIONS[o.value]}
										</p>
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/**
 * 場面の切り替え方1種類ぶんのライブプレビュー。「青い丸の場面」→「切り替え」→「橙の四角の場面」
 * を繰り返しループさせ、`drawTransition`（`lib/mv-engine.ts`）を実際に走らせて見せる——
 * ワイプの向きや暗転の濃さは文字の説明より一目見たほうが早い。
 */
function TransitionPreview({ style }: { style: MvTransitionStyle }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const CYCLE_BARS = 4;
		const SWITCH_BAR = 2;
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
			sections: [
				{ id: "a", label: "", startBar: 0, stage: { bgColor: "#213a67" } },
				{
					id: "b",
					label: "",
					startBar: SWITCH_BAR,
					stage: { bgColor: "#6a2a4f" },
					transition:
						style === "cut"
							? undefined
							: {
									style,
									beats: 2,
									color: style === "flash" ? "#ffffff" : "#000000",
								},
				},
			],
			layers: [
				{
					kind: "shape",
					id: "prev-a",
					form: "circle",
					x: MV_W / 2,
					y: MV_H / 2,
					size: 60,
					rotation: 0,
					color: "#8fb8ff",
					filled: true,
					thickness: 3,
					z: 10,
					modulators: [],
					sections: ["a"],
				},
				{
					kind: "shape",
					id: "prev-b",
					form: "square",
					x: MV_W / 2,
					y: MV_H / 2,
					size: 60,
					rotation: 20,
					color: "#ffb37a",
					filled: true,
					thickness: 3,
					z: 10,
					modulators: [],
					sections: ["b"],
				},
			],
		};
		const song = { ...EMPTY_SONG, bpm: 120 };
		const stepsPerSec = (song.bpm / 60) * MV_STEPS_PER_BEAT;
		const cycleSteps = CYCLE_BARS * MV_STEPS_PER_BAR;
		let raf = 0;
		const start = performance.now();
		const loop = () => {
			const elapsed = (performance.now() - start) / 1000;
			const stepInCycle = (elapsed * stepsPerSec) % cycleSteps;
			const frame: MvFrameState = { step: stepInCycle, timeSec: elapsed };
			drawMvFrame(ctx, manifest, song, frame);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [style]);

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

/** 切り替え方の並べ方。ワイプ4方向は見た目が似ているのでひとまとめにする（8個は一覧でも見渡せる数）。 */
const TRANSITION_STYLE_GROUPS: { label: string; styles: MvTransitionStyle[] }[] = [
	{ label: "基本", styles: ["cut", "fade", "flash", "dissolve"] },
	{ label: "払う（ワイプ）", styles: ["wipeLeft", "wipeRight", "wipeUp", "wipeDown"] },
];

/** 「場面の切り替え方を選ぶ」モーダル。`EffectStylePickerModal` と同じ、タップ即確定の一覧。 */
function TransitionStylePickerModal({
	value,
	onPick,
	onClose,
}: {
	value: MvTransitionStyle;
	onPick: (style: MvTransitionStyle) => void;
	onClose: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
			<div className="flex h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-gray-900 sm:h-[85vh] sm:rounded-xl">
				<div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
					<span className="text-sm font-bold text-gray-100">
						場面の切り替え方を選ぶ
					</span>
					<button
						onClick={onClose}
						className="rounded p-1 text-gray-400 hover:bg-gray-800"
					>
						<X size={18} />
					</button>
				</div>
				<div className="flex-1 space-y-4 overflow-y-auto p-3">
					{TRANSITION_STYLE_GROUPS.map((g) => (
						<div key={g.label}>
							<p className="mb-1.5 text-[10px] font-bold text-gray-400">
								{g.label}
							</p>
							<div className="grid grid-cols-2 gap-2">
								{g.styles.map((s) => (
									<button
										key={s}
										onClick={() => {
											onPick(s);
											onClose();
										}}
										className={`block rounded-lg border p-2 text-left active:scale-[0.99] ${
											value === s
												? "border-blue-500 bg-blue-500/10"
												: "border-gray-700 bg-gray-800/60"
										}`}
									>
										<TransitionPreview style={s} />
										<div className="mt-1.5 flex items-center gap-1.5">
											<span className="text-[11px] font-bold text-gray-100">
												{MV_TRANSITION_LABELS[s]}
											</span>
											{value === s && (
												<span className="rounded bg-blue-600 px-1 py-0.5 text-[8px] font-bold text-white">
													選択中
												</span>
											)}
										</div>
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/**
 * ビジュアライザ1種類ぶんのライブプレビュー。実際の曲データで再生することで
 * 「ピアノロール」「ステップ格子」「波紋」「スペアナ」の見た目の違いを比較できる。
 */
function VisualizerStylePreview({
	style,
	layer,
	song,
}: {
	style: MvVisualizerStyle;
	layer: MvVisualizerLayer;
	song: MvSong;
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
				bgColor: "#111113",
				bgFit: "cover",
				pulse: "none",
				fadeIn: false,
				fadeOut: false,
				palette: [],
			},
			sections: [],
			layers: [{ ...layer, id: "preview", style }],
		};
		const stepsPerSec = (song.bpm / 60) * MV_STEPS_PER_BEAT;
		const totalSteps = Math.max(song.totalSteps, MV_STEPS_PER_BAR * 4);
		let raf = 0;
		const start = performance.now();
		const loop = () => {
			const elapsed = (performance.now() - start) / 1000;
			const stepInLoop = (elapsed * stepsPerSec) % totalSteps;
			const frame: MvFrameState = { step: stepInLoop, timeSec: elapsed };
			drawMvFrame(ctx, manifest, song, frame);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [style, layer, song]);

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

/** 「ビジュアライザの種類を選ぶ」モーダル。4種類だけなのでカテゴリ分けはしない。 */
function VisualizerStylePickerModal({
	layer,
	song,
	onPick,
	onClose,
}: {
	layer: MvVisualizerLayer;
	song: MvSong;
	onPick: (style: MvVisualizerStyle) => void;
	onClose: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
			<div className="flex h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-gray-900 sm:h-[85vh] sm:rounded-xl">
				<div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
					<span className="text-sm font-bold text-gray-100">
						ビジュアライザの種類を選ぶ
					</span>
					<button
						onClick={onClose}
						className="rounded p-1 text-gray-400 hover:bg-gray-800"
					>
						<X size={18} />
					</button>
				</div>
				<div className="flex-1 space-y-2 overflow-y-auto p-3">
					{(Object.keys(MV_VISUALIZER_LABELS) as MvVisualizerStyle[]).map(
						(s) => (
							<button
								key={s}
								onClick={() => {
									onPick(s);
									onClose();
								}}
								className={`block w-full rounded-lg border p-2 text-left active:scale-[0.99] ${
									layer.style === s
										? "border-blue-500 bg-blue-500/10"
										: "border-gray-700 bg-gray-800/60"
								}`}
							>
								<VisualizerStylePreview style={s} layer={layer} song={song} />
								<div className="mt-1.5 flex items-center gap-1.5">
									<span className="text-[13px] font-bold text-gray-100">
										{MV_VISUALIZER_LABELS[s]}
									</span>
									{layer.style === s && (
										<span className="rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
											選択中
										</span>
									)}
								</div>
							</button>
						),
					)}
				</div>
			</div>
		</div>
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

/**
 * 「レイヤーを追加」系のドロップダウン。選ぶと即座に追加して選択状態をプレースホルダへ
 * 戻す（ボタンを並べると種類が増えるたびに上部が煩雑になるため、一覧はプルダウンに畳む）。
 */
function AddLayerSelect({
	placeholder,
	options,
	onPick,
}: {
	placeholder: string;
	options: { value: string; label: string }[];
	onPick: (value: string) => void;
}) {
	return (
		<select
			value=""
			onChange={(e) => {
				const v = e.target.value;
				if (v) onPick(v);
				e.target.value = "";
			}}
			className={`${FIELD_INPUT_CLASS} mb-2`}
		>
			<option value="" disabled>
				{placeholder}
			</option>
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
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

/**
 * row_anim系のwalk参照（例: 内蔵素材＞MV素材＞目開口閉）が持つコマ数。
 * 複数コマの横長シートでなければ1（=クロップ不要の静止画）。
 */
function walkRefFrameCount(ref: string): number {
	const wr = parseWalkRef(ref);
	if (!wr || wr.stdId !== "row_anim" || !wr.crop) return 1;
	return Math.max(1, wr.frames ?? 1);
}

/**
 * row_anim系のwalk参照から、指定コマ目だけの静止画切り出し矩形を求める。
 * キャラクターレイヤーの目/口は瞬き/口パクの開閉状態が既にアニメーションなので、
 * パーツ画像そのものはアニメさせず1コマぶんの静止画として使う（`MvAssetRef.crop`）。
 */
function walkRefFrameCrop(
	ref: string,
	frameIndex: number,
): [number, number, number, number] | undefined {
	const wr = parseWalkRef(ref);
	if (!wr || wr.stdId !== "row_anim" || !wr.crop) return undefined;
	const frames = Math.max(1, wr.frames ?? 1);
	const [csx, csy, csw, csh] = wr.crop;
	const cw = csw / frames;
	const ch = csh;
	const row = wr.row ?? 0;
	const idx = ((Math.round(frameIndex) % frames) + frames) % frames;
	return [csx + idx * cw, csy + row * ch, cw, ch];
}

/** `MvAssetRef.crop` から、いま何コマ目を指しているかを逆算する（無ければ0）。 */
function assetRefFrameIndex(asset: MvAssetRef | undefined): number {
	if (!asset?.crop) return 0;
	const wr = parseWalkRef(asset.ref);
	if (!wr || !wr.crop) return 0;
	const frames = Math.max(1, wr.frames ?? 1);
	const cw = wr.crop[2] / frames;
	if (cw <= 0) return 0;
	return Math.round((asset.crop[0] - wr.crop[0]) / cw);
}

/** そのフィールドに何も割り当てられていないか（新規 character レイヤーの既定値 `{ ref: "" }`）。 */
function isEmptyAssetRef(asset: MvAssetRef | undefined): boolean {
	return !asset || !asset.ref;
}

/** 内蔵MV素材(LocalMvSprite)から、1コマぶんにクロップ済みの MvAssetRef を組み立てる。 */
function assetRefForLocalSprite(s: LocalMvSprite): MvAssetRef {
	const ref = mvSpriteRef(s);
	const crop = walkRefFrameCrop(ref, 0);
	return { ref, url: s.url, ...(crop ? { crop } : {}) };
}

/**
 * 内蔵素材（MV_LOCAL_SPRITES）の「目開口閉」のような合成済み1枚絵を character レイヤーの
 * 目/口いずれかのフィールドへ割り当てたとき、同じキャラの他の状態（目閉/口開など）を
 * 未設定のフィールドへ自動で埋める。ユーザーがアップロードするカスタム画像には適用しない
 * （そちらは result.url が MV_LOCAL_SPRITES に無いので何もしない）。
 */
function autoFillEyeMouthCombo(
	layer: MvCharacterLayer,
	field: CharacterAssetFieldExternal,
	pickedUrl: string | undefined,
): MvCharacterLayer {
	if (
		field !== "eyesOpen" &&
		field !== "eyesClosed" &&
		field !== "mouthClosed" &&
		field !== "mouthOpen"
	) {
		return layer;
	}
	const sprite = MV_LOCAL_SPRITES.find((s) => s.url === pickedUrl);
	if (!sprite) return layer;
	const combo = parseEyeMouthComboName(sprite.name);
	if (combo.eyes === undefined || combo.mouth === undefined) return layer;

	let next = layer;
	const eyes = layer.eyes;
	if (eyes) {
		let nextEyes = eyes;
		if (isEmptyAssetRef(nextEyes.open)) {
			const s2 = findLocalMvSpriteEyeMouthCombo(sprite.group, "open", combo.mouth);
			if (s2) nextEyes = { ...nextEyes, open: assetRefForLocalSprite(s2) };
		}
		if (isEmptyAssetRef(nextEyes.closed)) {
			const s2 = findLocalMvSpriteEyeMouthCombo(sprite.group, "closed", combo.mouth);
			if (s2) nextEyes = { ...nextEyes, closed: assetRefForLocalSprite(s2) };
		}
		next = { ...next, eyes: nextEyes };
	}
	const mouth = layer.mouth;
	if (mouth) {
		let nextMouth = mouth;
		if (isEmptyAssetRef(nextMouth.open)) {
			const s2 = findLocalMvSpriteEyeMouthCombo(sprite.group, combo.eyes, "open");
			if (s2) nextMouth = { ...nextMouth, open: assetRefForLocalSprite(s2) };
		}
		if (isEmptyAssetRef(nextMouth.closed)) {
			const s2 = findLocalMvSpriteEyeMouthCombo(sprite.group, combo.eyes, "closed");
			if (s2) nextMouth = { ...nextMouth, closed: assetRefForLocalSprite(s2) };
		}
		next = { ...next, mouth: nextMouth };
	}
	return next;
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
	character: Smile,
	text: Type,
	visualizer: BarChart3,
	lyrics: Music,
	shape: Shapes,
	effect: Sparkles,
	chordBar: ListMusic,
	degree: Hash,
	widget: Grid3x3,
	beatCounter: Timer,
	beatPips: SquareStack,
	beatDigit: Hash,
	beatChordLabel: ListMusic,
} as const;

const MV_VOWELS: MvVowel[] = ["a", "i", "u", "e", "o", "n"];

/** character レイヤーのどのパーツ画像を選んでいるか（picker連携用）。MvMaker本体と同じ型。 */
type CharacterAssetFieldExternal =
	| "base"
	| "eyesOpen"
	| "eyesClosed"
	| "mouthClosed"
	| "mouthOpen"
	| `vowel_${MvVowel}`;

/**
 * 小さな参照ボタン＋サムネイル。base/eyes/mouth の各パーツ選択で使い回す。
 * `onFrameChange` を渡すと、複数コマの横長シート（row_anim、内蔵素材＞MV素材＞目開口閉など）を
 * 選んだ場合に「何コマ目を使うか」の矢印ステッパーを出す。目/口はアニメさせず1コマぶんの
 * 静止画として使うため（瞬き/口パクの開閉自体が状態遷移）、ここで1コマへ確定させる。
 */
function AssetRefButton({
	label,
	asset,
	onPick,
	onFrameChange,
}: {
	label: string;
	asset?: MvAssetRef;
	onPick: () => void;
	onFrameChange?: (frameIndex: number) => void;
}) {
	const frameCount = asset?.ref ? walkRefFrameCount(asset.ref) : 1;
	const showStepper = !!onFrameChange && frameCount > 1;
	const frameIndex = assetRefFrameIndex(asset);
	return (
		<div className="space-y-1">
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onPick}
					className={`${REF_BTN_CLASS} flex-1`}
				>
					<ImageIcon size={12} />
					{label}
				</button>
				{asset?.url && (
					<img
						src={asset.url}
						onError={handleImgError}
						alt=""
						className="h-9 w-9 shrink-0 rounded border border-gray-700 object-contain"
					/>
				)}
			</div>
			{showStepper && (
				<div className="flex items-center gap-2 text-[10px] text-gray-400">
					<span>
						シートの何コマ目を使うか（{frameIndex + 1}/{frameCount}）
					</span>
					<button
						type="button"
						onClick={() =>
							onFrameChange?.((frameIndex - 1 + frameCount) % frameCount)
						}
						className="min-h-7 min-w-7 rounded border border-gray-700 bg-gray-800 px-1.5 text-gray-300 hover:bg-gray-700"
					>
						◀
					</button>
					<button
						type="button"
						onClick={() => onFrameChange?.((frameIndex + 1) % frameCount)}
						className="min-h-7 min-w-7 rounded border border-gray-700 bg-gray-800 px-1.5 text-gray-300 hover:bg-gray-700"
					>
						▶
					</button>
				</div>
			)}
		</div>
	);
}

const PSD_SAMPLE_URL =
	"https://res.cloudinary.com/dbld5kqtz/image/upload/v1786677313/TabaneLozeV101_jnj7yb.psd";

/** 現在有効な項目に応じた割り当て先の一覧（無効な目/口の項目は出さない）。 */
function psdAssignTargets(
	layer: MvCharacterLayer,
): { value: CharacterAssetFieldExternal; label: string }[] {
	const targets: { value: CharacterAssetFieldExternal; label: string }[] = [
		{ value: "base", label: "土台" },
	];
	if (layer.eyes) {
		targets.push({ value: "eyesOpen", label: "開いた目" });
		targets.push({ value: "eyesClosed", label: "閉じた目" });
	}
	if (layer.mouth) {
		targets.push({ value: "mouthClosed", label: "閉じた口" });
		targets.push({ value: "mouthOpen", label: "開いた口" });
		if (layer.mouth.lipsync.mode === "vowel") {
			for (const v of MV_VOWELS) {
				targets.push({ value: `vowel_${v}`, label: MV_VOWEL_LABELS[v] });
			}
		}
	}
	return targets;
}

/**
 * psdファイルをブラウザ側でその場で読み込み、レイヤーをキャラクターレイヤーの各パーツへ
 * 割り当てるパネル。「開/閉」等のレイヤー名からの自動関連付けはしない――一覧から選んで、
 * 割り当て先（土台/目開/目閉/口開/口閉/母音6種）を指定してもらう2段の操作。
 * 土台は色塗り+線画のような複数レイヤー合成が要るため、チェックボックスで複数選択できる。
 */
function PsdAssetPanel({
	layer,
	onAssign,
}: {
	layer: MvCharacterLayer;
	onAssign: (field: CharacterAssetFieldExternal, assetRef: MvAssetRef) => void;
}) {
	const [url, setUrl] = useState("");
	const [layers, setLayers] = useState<PsdLayerInfo[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
	const targets = psdAssignTargets(layer);
	const [target, setTarget] = useState<CharacterAssetFieldExternal>("base");

	const handleLoad = async () => {
		const trimmed = url.trim();
		if (!trimmed) return;
		setLoading(true);
		setError(null);
		try {
			const list = await listPsdLayerPaths(trimmed);
			setLayers(list);
			setSelectedPaths([]);
		} catch {
			setError("psdの読み込みに失敗しました（URL・CORS設定を確認してください）");
			setLayers([]);
		} finally {
			setLoading(false);
		}
	};

	const togglePath = (path: string) => {
		setSelectedPaths((prev) =>
			prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
		);
	};

	const handleAssign = () => {
		const trimmed = url.trim();
		if (!trimmed || selectedPaths.length === 0) return;
		onAssign(target, { ref: buildPsdRef(trimmed, selectedPaths) });
	};

	return (
		<div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/40 p-2.5">
			<div className="text-[11px] font-medium text-gray-300">
				psdから素材を選ぶ
			</div>
			<Hint>
				目/口が個別レイヤーに分かれたpsdファイルを、ブラウザ側でその場で読み込みます（事前の
				アップロード不要）。「開/閉」のようなレイヤー名からの自動割り当てはしません――一覧
				から選んで、割り当て先を指定してください。
			</Hint>
			<input
				type="text"
				value={url}
				onChange={(e) => setUrl(e.target.value)}
				placeholder="psdファイルのURL"
				className="min-h-9 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-100 outline-none"
			/>
			<button
				type="button"
				onClick={() => setUrl(PSD_SAMPLE_URL)}
				className="min-h-9 w-full rounded border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-300 hover:bg-gray-700"
			>
				サンプル（束音ロゼ V1.01）のURLを使う
			</button>
			<button
				type="button"
				onClick={handleLoad}
				disabled={!url.trim() || loading}
				className="min-h-9 w-full rounded border border-blue-700 bg-blue-900/40 px-2 text-[11px] text-blue-200 hover:bg-blue-900/70 disabled:opacity-40"
			>
				{loading ? "読み込み中…" : "レイヤー一覧を読み込む"}
			</button>
			{error && <div className="text-[11px] text-red-400">{error}</div>}
			{layers.length > 0 && (
				<>
					<div className="max-h-40 space-y-1 overflow-y-auto rounded border border-gray-700/70 bg-gray-900/60 p-2">
						{layers.map((l) => (
							<label
								key={l.path}
								className="flex min-h-8 items-center gap-2 text-[11px] text-gray-300"
							>
								<input
									type="checkbox"
									checked={selectedPaths.includes(l.path)}
									onChange={() => togglePath(l.path)}
									className="h-4 w-4 accent-blue-500"
								/>
								<span className="truncate">{l.path}</span>
								<span className="ml-auto shrink-0 text-gray-500">
									{l.width}x{l.height}
								</span>
							</label>
						))}
					</div>
					<SelectField
						label="割り当て先"
						value={target}
						options={targets}
						onChange={setTarget}
					/>
					<button
						type="button"
						onClick={handleAssign}
						disabled={selectedPaths.length === 0}
						className="min-h-9 w-full rounded border border-emerald-700 bg-emerald-900/40 px-2 text-[11px] text-emerald-200 hover:bg-emerald-900/70 disabled:opacity-40"
					>
						選んだレイヤー（{selectedPaths.length}枚）を割り当てる
					</button>
				</>
			)}
		</div>
	);
}

/**
 * character レイヤーの編集パネル。土台画像は image レイヤーと同じ操作感にしつつ、
 * 目（瞬き）・口（口パク）は「有効化トグル→パーツ画像を選ぶ」という2段の操作にしてある。
 * 「目開」「目閉」のようなファイル名からの自動関連付けは行わない
 * （常にユーザーがアセットピッカーで明示的に選ぶ）。
 */
function CharacterLayerFields({
	layer,
	song,
	onUpdate,
	onPickAsset,
}: {
	layer: MvCharacterLayer;
	song: MvSong;
	onUpdate: (patch: Partial<MvCharacterLayer>) => void;
	onPickAsset: (field: CharacterAssetFieldExternal) => void;
}) {
	const lipsyncTracks = song.tracks;
	const vowelTracks = song.lyricTrackIds;

	const assignPsdAsset = (
		field: CharacterAssetFieldExternal,
		assetRef: MvAssetRef,
	) => {
		if (field === "base") {
			onUpdate({ base: assetRef });
			return;
		}
		if (field === "eyesOpen" && layer.eyes) {
			onUpdate({ eyes: { ...layer.eyes, open: assetRef } });
			return;
		}
		if (field === "eyesClosed" && layer.eyes) {
			onUpdate({ eyes: { ...layer.eyes, closed: assetRef } });
			return;
		}
		if (field === "mouthClosed" && layer.mouth) {
			onUpdate({ mouth: { ...layer.mouth, closed: assetRef } });
			return;
		}
		if (field === "mouthOpen" && layer.mouth) {
			onUpdate({ mouth: { ...layer.mouth, open: assetRef } });
			return;
		}
		if (field.startsWith("vowel_") && layer.mouth) {
			const vowel = field.slice(6) as MvVowel;
			onUpdate({
				mouth: {
					...layer.mouth,
					vowels: { ...layer.mouth.vowels, [vowel]: assetRef },
				},
			});
		}
	};

	return (
		<>
			<AssetRefButton
				label="土台の画像を参照"
				asset={layer.base}
				onPick={() => onPickAsset("base")}
			/>
			<PsdAssetPanel layer={layer} onAssign={assignPsdAsset} />
			<NumField label="X" value={layer.x} onChange={(v) => onUpdate({ x: v })} />
			<NumField label="Y" value={layer.y} onChange={(v) => onUpdate({ y: v })} />
			<NumField
				label="拡大率"
				value={layer.scale}
				min={0.1}
				step={0.1}
				onChange={(v) => onUpdate({ scale: v })}
			/>
			<CheckField
				label="ドット絵として粗く表示"
				checked={!!layer.pixelated}
				onChange={(v) => onUpdate({ pixelated: v })}
			/>
			<CheckField
				label="左右反転（鏡像）"
				checked={!!layer.flipH}
				onChange={(v) => onUpdate({ flipH: v || undefined })}
			/>
			<CheckField
				label="上下反転（逆さま）"
				checked={!!layer.flipV}
				onChange={(v) => onUpdate({ flipV: v || undefined })}
			/>

			{/* ── 瞬き ───────────────────────────────── */}
			<div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/40 p-2.5">
				<CheckField
					label="瞬き（自動でまばたきさせる）"
					checked={!!layer.eyes}
					onChange={(v) =>
						onUpdate({
							eyes: v
								? {
										open: layer.eyes?.open ?? { ref: "" },
										closed: layer.eyes?.closed ?? { ref: "" },
										blink: layer.eyes?.blink ?? {
											...DEFAULT_MV_BLINK,
											enabled: true,
										},
									}
								: undefined,
						})
					}
				/>
				{layer.eyes && (
					<>
						<Hint>
							カスタム画像は「目開」「目閉」のようなファイル名では自動関連付けされません（開いた目・閉じた目、それぞれの画像を選んでください）。内蔵素材＞MV素材の「目開口閉」等は名前が既知のため、片方を選ぶと同じキャラの他の状態も自動で埋まります。
						</Hint>
						<AssetRefButton
							label="開いた目の画像"
							asset={layer.eyes.open}
							onPick={() => onPickAsset("eyesOpen")}
							onFrameChange={(i) =>
								onUpdate({
									eyes: layer.eyes && {
										...layer.eyes,
										open: {
											...layer.eyes.open,
											crop: walkRefFrameCrop(layer.eyes.open.ref, i),
										},
									},
								})
							}
						/>
						<AssetRefButton
							label="閉じた目の画像"
							asset={layer.eyes.closed}
							onPick={() => onPickAsset("eyesClosed")}
							onFrameChange={(i) =>
								onUpdate({
									eyes: layer.eyes && {
										...layer.eyes,
										closed: {
											...layer.eyes.closed,
											crop: walkRefFrameCrop(layer.eyes.closed.ref, i),
										},
									},
								})
							}
						/>
						<div className="flex items-center gap-2">
							<NumField
								label="乱数の種（seed）"
								value={layer.eyes.blink.seed}
								step={1}
								onChange={(v) =>
									onUpdate({
										eyes: layer.eyes && {
											...layer.eyes,
											blink: { ...layer.eyes.blink, seed: Math.round(v) },
										},
									})
								}
							/>
							<button
								type="button"
								title="別のパターンで抽選し直す"
								onClick={() =>
									onUpdate({
										eyes: layer.eyes && {
											...layer.eyes,
											blink: {
												...layer.eyes.blink,
												seed: Math.floor(Math.random() * 1_000_000),
											},
										},
									})
								}
								className="mt-4 shrink-0 grid h-9 w-9 place-items-center rounded border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
							>
								<Shuffle size={14} />
							</button>
						</div>
						<Details label="瞬きの間隔・長さを調整する">
							<NumField
								label="間隔（拍）の最短"
								value={layer.eyes.blink.intervalBeatsMin ?? 12}
								min={0.5}
								onChange={(v) =>
									onUpdate({
										eyes: layer.eyes && {
											...layer.eyes,
											blink: { ...layer.eyes.blink, intervalBeatsMin: v },
										},
									})
								}
							/>
							<NumField
								label="間隔（拍）の最長"
								value={layer.eyes.blink.intervalBeatsMax ?? 28}
								min={0.5}
								onChange={(v) =>
									onUpdate({
										eyes: layer.eyes && {
											...layer.eyes,
											blink: { ...layer.eyes.blink, intervalBeatsMax: v },
										},
									})
								}
							/>
							<NumField
								label="閉じている長さ（拍）"
								value={layer.eyes.blink.closedBeats ?? 0.6}
								min={0.05}
								step={0.05}
								onChange={(v) =>
									onUpdate({
										eyes: layer.eyes && {
											...layer.eyes,
											blink: { ...layer.eyes.blink, closedBeats: v },
										},
									})
								}
							/>
							<NumField
								label="2連瞬きの確率 (0〜1)"
								value={layer.eyes.blink.doubleBlinkChance ?? 0.2}
								min={0}
								max={1}
								step={0.05}
								onChange={(v) =>
									onUpdate({
										eyes: layer.eyes && {
											...layer.eyes,
											blink: { ...layer.eyes.blink, doubleBlinkChance: v },
										},
									})
								}
							/>
						</Details>
					</>
				)}
			</div>

			{/* ── 口パク ───────────────────────────────── */}
			<div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/40 p-2.5">
				<CheckField
					label="口パク"
					checked={!!layer.mouth}
					onChange={(v) =>
						onUpdate({
							mouth: v
								? {
										closed: layer.mouth?.closed ?? { ref: "" },
										open: layer.mouth?.open ?? { ref: "" },
										vowels: layer.mouth?.vowels,
										lipsync: layer.mouth?.lipsync ?? DEFAULT_MV_LIPSYNC_TRACK,
									}
								: undefined,
						})
					}
				/>
				{layer.mouth && (
					<>
						<Hint>
							カスタム画像は「口開」「口閉」のようなファイル名では自動関連付けされません（開いた口・閉じた口、それぞれの画像を選んでください）。内蔵素材＞MV素材の「目開口閉」等は名前が既知のため、片方を選ぶと同じキャラの他の状態も自動で埋まります。
						</Hint>
						<AssetRefButton
							label="閉じた口の画像"
							asset={layer.mouth.closed}
							onPick={() => onPickAsset("mouthClosed")}
							onFrameChange={(i) =>
								onUpdate({
									mouth: layer.mouth && {
										...layer.mouth,
										closed: {
											...layer.mouth.closed,
											crop: walkRefFrameCrop(layer.mouth.closed.ref, i),
										},
									},
								})
							}
						/>
						<AssetRefButton
							label="開いた口の画像"
							asset={layer.mouth.open}
							onPick={() => onPickAsset("mouthOpen")}
							onFrameChange={(i) =>
								onUpdate({
									mouth: layer.mouth && {
										...layer.mouth,
										open: {
											...layer.mouth.open,
											crop: walkRefFrameCrop(layer.mouth.open.ref, i),
										},
									},
								})
							}
						/>
						<SelectField
							label="口パクの方式"
							value={layer.mouth.lipsync.mode}
							options={[
								{ value: "track", label: "トラック連動（発音中だけ開く）" },
								{ value: "vowel", label: "母音対応（歌詞から母音を推定）" },
							]}
							onChange={(mode) =>
								onUpdate({
									mouth: layer.mouth && {
										...layer.mouth,
										lipsync:
											mode === "track"
												? { mode: "track", trackId: lipsyncTracks[0] ?? 0, threshold: 0.12 }
												: { mode: "vowel", trackId: vowelTracks[0] ?? 0 },
									},
								})
							}
						/>
						{layer.mouth.lipsync.mode === "track" && (
							<>
								<SelectField
									label="対象トラック"
									value={String(layer.mouth.lipsync.trackId)}
									options={lipsyncTracks.map((t) => ({
										value: String(t),
										label: `@${t}`,
									}))}
									onChange={(v) =>
										onUpdate({
											mouth: layer.mouth && {
												...layer.mouth,
												lipsync: {
													mode: "track",
													trackId: Number(v),
													threshold:
														layer.mouth.lipsync.mode === "track"
															? layer.mouth.lipsync.threshold
															: undefined,
												},
											},
										})
									}
								/>
								<NumField
									label="開くしきい値 (0〜1、小さいほど開きやすい)"
									value={
										layer.mouth.lipsync.mode === "track"
											? (layer.mouth.lipsync.threshold ?? 0.12)
											: 0.12
									}
									min={0}
									max={1}
									step={0.02}
									onChange={(v) =>
										onUpdate({
											mouth: layer.mouth && {
												...layer.mouth,
												lipsync:
													layer.mouth.lipsync.mode === "track"
														? { ...layer.mouth.lipsync, threshold: v }
														: layer.mouth.lipsync,
											},
										})
									}
								/>
							</>
						)}
						{layer.mouth.lipsync.mode === "vowel" && (
							<>
								{vowelTracks.length > 0 ? (
									<SelectField
										label="対象の歌詞トラック"
										value={String(layer.mouth.lipsync.trackId)}
										options={vowelTracks.map((t) => ({
											value: String(t),
											label: `@@${t}`,
										}))}
										onChange={(v) =>
											onUpdate({
												mouth: layer.mouth && {
													...layer.mouth,
													lipsync: { mode: "vowel", trackId: Number(v) },
												},
											})
										}
									/>
								) : (
									<Hint>
										この曲には歌詞トラックが無いので、母音対応の口パクは動きません。
									</Hint>
								)}
								<Hint>
									あ/い/う/え/お/ん の画像を割り当てられます。設定しなかった母音は「あ」は開いた口、「ん」は閉じた口へ自動でフォールバックします。既定素材が無い場合は、上の「psdから素材を選ぶ」で束音ロゼ V1.01 のpsd URLを読み込み、レイヤー一覧から割り当ててください。
								</Hint>
								<div className="grid grid-cols-3 gap-2">
									{MV_VOWELS.map((v) => (
										<AssetRefButton
											key={v}
											label={MV_VOWEL_LABELS[v]}
											asset={layer.mouth?.vowels?.[v]}
											onPick={() => onPickAsset(`vowel_${v}`)}
											onFrameChange={(i) =>
												onUpdate({
													mouth: layer.mouth && {
														...layer.mouth,
														vowels: {
															...layer.mouth.vowels,
															[v]: {
																...layer.mouth.vowels?.[v],
																ref: layer.mouth.vowels?.[v]?.ref ?? "",
																crop: walkRefFrameCrop(
																	layer.mouth.vowels?.[v]?.ref ?? "",
																	i,
																),
															},
														},
													},
												})
											}
										/>
									))}
								</div>
							</>
						)}
					</>
				)}
			</div>
		</>
	);
}

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
		case "character":
			return refLabel(layer.base.ref);
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
		case "widget":
			return "ウィジェット";
		case "beatCounter":
			return "ドット絵数字カウンタ";
		case "beatPips":
			return "拍で増える図形";
		case "beatDigit":
			return `ドット数字 @${layer.track}`;
		case "beatChordLabel":
			return "コード名の読み札";
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
	// ユーザー登録のカスタムフォント（localStorage、別のMVでも選び直せる）
	const [customFonts, setCustomFonts] = useState<MvCustomFont[]>([]);
	const [customFontNameInput, setCustomFontNameInput] = useState("");
	const [customFontUrlInput, setCustomFontUrlInput] = useState("");
	useEffect(() => {
		setCustomFonts(loadCustomFonts());
	}, []);
	const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
	const [effectStylePickerLayerId, setEffectStylePickerLayerId] = useState<
		string | null
	>(null);
	const [transitionStylePickerSectionId, setTransitionStylePickerSectionId] =
		useState<string | null>(null);
	const [visualizerStylePickerLayerId, setVisualizerStylePickerLayerId] =
		useState<string | null>(null);
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
	/** character レイヤーのどのパーツ画像を選んでいるか。未指定は image レイヤーの `ref`。 */
	type CharacterAssetField =
		| "base"
		| "eyesOpen"
		| "eyesClosed"
		| "mouthClosed"
		| "mouthOpen"
		| `vowel_${MvVowel}`;
	const [picker, setPicker] = useState<{
		mode: "image" | "bgm";
		target:
			| "stageBg"
			| { layerId: string; field?: CharacterAssetField }
			| { sectionId: string };
	} | null>(null);
	const playerRef = useRef<MvPlayerHandle>(null);
	const [lyricTimingIndexMap, setLyricTimingIndexMap] = useState<
		Record<string, number>
	>({});
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
	/** 特殊アレンジ生成モーダルの対象（アレンジ元）グループID（開いていなければnull）。 */
	const [arrangementModalGroupId, setArrangementModalGroupId] = useState<
		string | null
	>(null);
	const [bulkField, setBulkField] = useState<
		| "z"
		| "position"
		| "size"
		| "opacity"
		| "rotation"
		| "thickness"
		| "color"
		| "blend"
	>("position");
	const [bulkMode, setBulkMode] = useState<MvGroupEditMode>("relative");
	const [bulkValue, setBulkValue] = useState(0);
	const [bulkX, setBulkX] = useState(0);
	const [bulkY, setBulkY] = useState(0);
	const [bulkColor, setBulkColor] = useState("#ffffff");
	const [bulkBlend, setBulkBlend] = useState<MvBlend>("normal");

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
	// 既定値は参考動画（チョウチン少女）の実測構造に基づく "duet" 構図
	// （1拍の中で「横並びの列」と「中央エンブレム」が交互に出る）。
	const [macroSettings, setMacroSettings] =
		useState<SymmetricShapeGroupOptions>({
			clusterType: "duet",
			shapeStyle: "sharp",
			thickness: "thick",
			monochrome: true,
			symmetric: true,
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
			// z は「相対的な前後関係」だけが意味を持つ値。詰め直さずに使い続けると
			// 追加・削除のたびに際限なく大きく・疎になり、数値から重なり順の見当が
			// つかなくなる（エントロピーが増え続ける）ので、更新のたびに10刻みへ
			// 詰め直す（相対順序は保つので見た目の重なりは変わらない）。
			setManifest((prev) => compactZ(patch(prev)));
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
		} else if (picker.target.field) {
			// character レイヤーの目/口パーツ画像。土台と違ってアニメさせない静止画なので、
			// row_anim等の複数コマシートを選んだ場合は1コマ目だけを既定でクロップして焼く
			// （そのままだとシート全体が1コマの枠へ引き伸ばされて歪む）。
			const layerId = picker.target.layerId;
			const field = picker.target.field;
			const crop = walkRefFrameCrop(result.ref, 0);
			const assetRef: MvAssetRef = {
				ref: result.ref,
				url: result.url,
				...(crop ? { crop } : {}),
			};
			updateLayer(layerId, (l) => {
				if (l.kind !== "character") return l;
				let next: MvCharacterLayer;
				if (field === "base") {
					next = { ...l, base: assetRef };
				} else if (field === "eyesOpen" && l.eyes) {
					next = { ...l, eyes: { ...l.eyes, open: assetRef } };
				} else if (field === "eyesClosed" && l.eyes) {
					next = { ...l, eyes: { ...l.eyes, closed: assetRef } };
				} else if (field === "mouthClosed" && l.mouth) {
					next = { ...l, mouth: { ...l.mouth, closed: assetRef } };
				} else if (field === "mouthOpen" && l.mouth) {
					next = { ...l, mouth: { ...l.mouth, open: assetRef } };
				} else if (field.startsWith("vowel_") && l.mouth) {
					const vowel = field.slice(6) as MvVowel;
					next = {
						...l,
						mouth: {
							...l.mouth,
							vowels: { ...l.mouth.vowels, [vowel]: assetRef },
						},
					};
				} else {
					return l;
				}
				// 内蔵MV素材(束音ロゼ等)の合成済み1枚絵を選んだ場合、同じキャラの他の
				// 目/口の状態を未設定のフィールドへ自動で埋める（カスタム画像には適用されない）。
				return autoFillEyeMouthCombo(next, field, result.url);
			});
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

	// ── 設定メニュー（歯車）：エクスポート／インポート／MV切り替え・まっさら ──
	const [settingsOpen, setSettingsOpen] = useState(false);
	const settingsRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!settingsOpen) return;
		const onDown = (e: MouseEvent) => {
			if (settingsRef.current && !settingsRef.current.contains(e.target as Node))
				setSettingsOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [settingsOpen]);
	const [switchOpen, setSwitchOpen] = useState(false);
	const importFileRef = useRef<HTMLInputElement>(null);

	const handleExport = () => {
		const json = JSON.stringify(manifest, null, 2);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${(manifest.title.trim() || "MV").replace(/\s+/g, "_")}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const raw = JSON.parse(ev.target?.result as string);
				// DBレコードやAPIレスポンス（{ title, manifest: {...} }）で包まれていても中身を取り出す
				const parsed = (
					raw && typeof raw === "object" && raw.manifest && typeof raw.manifest === "object"
						? raw.manifest
						: raw
				) as MvManifest;
				if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.layers) || !Array.isArray(parsed.sections)) {
					alert("MVのJSONではないようです（layers / sections が見つかりません）");
					return;
				}
				resetEditHistory();
				setManifest(parsed);
				setPresetName(null);
				setSelectedLayerId(null);
				setSettingsOpen(false);
			} catch (err) {
				console.error("mv JSON import failed", err);
				alert(`JSONの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
			}
		};
		reader.readAsText(file);
		e.target.value = "";
	};

	/** 「まっさらにする」：見た目のプリセット種別は維持したまま、曲・レイヤー・場面を空にする。 */
	const buildBlankMvManifest = (preset: MvPresetKind): MvManifest => ({
		version: 1,
		preset,
		title: "",
		mml: "",
		stage: {
			bgColor: "#0b0e14",
			bgFit: "cover",
			pulse: "none",
			palette: ["#a3e635", "#38bdf8", "#fbbf24", "#f472b6", "#c4b5fd"],
		},
		layers: [],
		sections: [{ id: mvUid("sec"), label: "はじめ", startBar: 0 }],
	});

	// ── レイヤー追加 ───────────────────────────────────────
	// 何かを選択して編集している最中に新規追加すると、常に画面の一番手前へ
	// 割り込むのは違和感が大きい（今見ている場所と無関係に前へ出てしまう）。
	// 選択中のレイヤーがあればそのすぐ上に差し込み、無ければ従来どおり最前面にする。
	// 値そのものは `update` 内の compactZ が詰め直すので、ここでの増分の大きさに意味は無い。
	const getNextZ = () => {
		const selected = manifest.layers.find((l) => l.id === selectedLayerId);
		if (selected) return (selected.z ?? 0) + 1;
		return Math.max(10, ...manifest.layers.map((l) => l.z ?? 0)) + 10;
	};

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
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
		setSelectedLayerId(layer.id);
		setPicker({ mode: "image", target: { layerId: layer.id } });
	};

	const addCharacterLayer = () => {
		const layer: MvCharacterLayer = {
			kind: "character",
			id: mvUid("chr"),
			base: { ref: "" },
			x: MV_W / 2,
			y: MV_H / 2,
			scale: 1,
			anchor: "center",
			motion: "none",
			pixelated: true,
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
		setSelectedLayerId(layer.id);
		setPicker({ mode: "image", target: { layerId: layer.id, field: "base" } });
	};

	/**
	 * 既存の image レイヤーを character レイヤーへその場で変換する（kindだけ差し替え、
	 * 配列内の位置・共通フィールドはそのまま引き継ぐ）。新規に character レイヤーを作り直させず、
	 * 既存の画像レイヤーからも瞬き/口パクを設定できるようにするための入り口。
	 */
	const convertImageLayerToCharacter = (l: MvImageLayer): MvCharacterLayer => ({
		id: l.id,
		name: l.name,
		sections: l.sections,
		barRange: l.barRange,
		z: l.z,
		opacity: l.opacity,
		entrance: l.entrance,
		exit: l.exit,
		groupId: l.groupId,
		kind: "character",
		base: { ref: l.ref, url: l.url },
		x: l.x,
		y: l.y,
		scale: l.scale,
		anchor: l.anchor,
		motion: l.motion,
		motionAmount: l.motionAmount,
		walk: l.walk,
		frame: l.frame,
		pixelated: l.pixelated,
		flipH: l.flipH,
		flipV: l.flipV,
		repeat: l.repeat,
	});

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
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
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
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
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
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
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
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
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
			// 一覧はレイヤー配列の並び順で決まるため、先頭に差し込んで一覧の最上部に出す。
			layers: [...layers, ...m.layers],
			groups: [group, ...(m.groups ?? [])],
		}));
		setAutoGroupIds((ids) => [...ids, group.id]);
		if (layers[0]) setSelectedLayerId(layers[0].id);
	};

	/**
	 * 指定したグループの中身を図形乱数で作り直す（リロール）。
	 */
	const rerollSymmetricShapeGroup = (groupId: string) => {
		// 既存メンバーのzをそのまま使い回す。ここで getNextZ() を呼んでしまうと
		// リロールのたびに「その時点でいちばん大きいz」が新規採番され、ユーザーが
		// 一括編集や並び替えで下げた重なり順がリロール1回で毎回いちばん手前へ
		// 戻ってしまう（＝重なり順が意図せず常に大きい値になるバグ）。
		const existingZs = manifest.layers
			.filter((l) => l.groupId === groupId)
			.map((l) => l.z ?? 0)
			.sort((a, b) => a - b);
		let i = 0;
		let overflowZ = getNextZ();
		const nextZ = () => {
			if (i < existingZs.length) return existingZs[i++];
			const v = overflowZ;
			overflowZ += 10;
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
	 * 特殊アレンジグループのリロール。通常のリロール（`rerollSymmetricShapeGroup`）を
	 * そのまま使うと「アレンジ後の姿」を乱数の起点にしてしまい、型を重ねるたびに
	 * 元の図形からどんどん離れていく（＝リロールするほど崩れて見える）。
	 * 特殊アレンジは常に「アレンジ元グループの“今の”中身」を起点に生成し直す。
	 */
	const rerollArrangedGroup = (groupId: string) => {
		const group = manifest.groups?.find((g) => g.id === groupId);
		const arr = group?.arrangement;
		if (!arr) return;
		const sourceLayers = manifest.layers.filter(
			(l) => l.groupId === arr.sourceGroupId,
		);
		if (sourceLayers.length === 0 || sourceLayers[0].kind !== "shape") return;

		// 既存メンバーのzをそのまま使い回す（`rerollSymmetricShapeGroup` と同じ理由）。
		const existingZs = manifest.layers
			.filter((l) => l.groupId === groupId)
			.map((l) => l.z ?? 0)
			.sort((a, b) => a - b);
		let i = 0;
		let overflowZ = getNextZ();
		const nextZ = () => {
			if (i < existingZs.length) return existingZs[i++];
			const v = overflowZ;
			overflowZ += 10;
			return v;
		};

		const { layers: newLayers } = generateArrangementForGroup(
			sourceLayers as MvShapeLayer[],
			nextZ,
			arr.sourceGroupId,
			{ triggerBar: arr.triggerBar, endBar: arr.endBar },
		);
		// グループの実体（id・トリガー位置）は維持し、中身だけ差し替える。
		const retagged = newLayers.map((l) => ({ ...l, groupId }));
		update((m) => replaceGroupMembers(m, groupId, retagged));
	};

	/**
	 * 特殊アレンジモーダルで確定した中身をレイヤーとして挿入する。
	 * z はモーダル内のプレビュー用の仮採番のままなので、ここで実際の重なり順として
	 * 振り直す（プレビュー時点の相対順序は配列の並びに保たれているので、
	 * 順に `getNextZ()` を振るだけで壊れない）。
	 */
	const insertArrangedGroup = (
		groupId: string,
		result: { group: MvLayerGroup; layers: MvShapeLayer[] },
	) => {
		const layers = result.layers.map((l) => ({ ...l, z: getNextZ() }));

		update((m) => {
			const insertIndex = m.layers.findIndex((l) => l.groupId === groupId);
			const safeIndex = insertIndex >= 0 ? insertIndex : 0;
			const newLayersList = [...m.layers];
			newLayersList.splice(safeIndex, 0, ...layers);

			const newGroupsList = [...(m.groups ?? [])];
			const groupInsertIndex = m.groups?.findIndex((g) => g.id === groupId) ?? -1;
			const safeGroupIndex = groupInsertIndex >= 0 ? groupInsertIndex : 0;
			newGroupsList.splice(safeGroupIndex, 0, result.group);

			return {
				...m,
				layers: newLayersList,
				groups: newGroupsList,
			};
		});
		setAutoGroupIds((ids) => [...ids, result.group.id]);
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
		// 一覧はレイヤー配列の並び順で決まるため、先頭に差し込んで一覧の最上部に出す。
		update((m) => ({ ...m, layers: [...zed, ...m.layers] }));
		if (zed[0]) setSelectedLayerId(zed[0].id);
	};

	const addChordBarLayer = () => {
		const layer: MvChordBarLayer = {
			kind: "chordBar",
			id: mvUid("chd"),
			rect: { x: 0, y: MV_H - 22, w: MV_W, h: 22 },
			key: "C",
			colorMode: "degree",
			color: "#1f2937",
			activeColor: "#3f6212",
			textColor: "#e5e7eb",
			size: 9,
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
		setSelectedLayerId(layer.id);
	};

	/** アイコンが拍ごとに切り替わるウィジェット（`_.mp4` / `次日朝夢(再現).mp4` 参照）。 */
	const addWidgetLayer = () => {
		const layer: MvWidgetLayer = {
			kind: "widget",
			id: mvUid("wgt"),
			rect: { x: 40, y: MV_H - 100, w: 40 * 8, h: 80 },
			cellSize: 40,
			cols: 8,
			orientation: "horizontal",
			angle: 0,
			color: "#f8fafc",
			colorMode: "degree",
			bottomColor: "#5b9bd5",
			key: "C",
			flashColor: "#ffffff",
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
		setSelectedLayerId(layer.id);
	};

	/** ドット絵数字が拍ごとに刻まれるだけの単純なカウンタ（コード進行とは無関係）。 */
	const addBeatCounterLayer = () => {
		const layer: MvBeatCounterLayer = {
			kind: "beatCounter",
			id: mvUid("bct"),
			x: MV_W / 2,
			y: MV_H - 60,
			anchor: "center",
			beatsPerCycle: 4,
			cellSize: 8,
			color: "#f8fafc",
			activeColor: "#facc15",
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
		setSelectedLayerId(layer.id);
	};

	/** 拍が進むごとに図形が1個ずつ増えるだけの単純なウィジェット。 */
	const addBeatPipsLayer = () => {
		const layer: MvBeatPipsLayer = {
			kind: "beatPips",
			id: mvUid("bpp"),
			x: MV_W / 2,
			y: MV_H - 40,
			anchor: "center",
			beatsPerCycle: 4,
			shape: "square",
			size: 16,
			gap: 6,
			color: "#f8fafc",
			activeColor: "#facc15",
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
		setSelectedLayerId(layer.id);
	};

	/** 特定トラックの音を度数のドット絵数字で出す。切り替わる瞬間に1ドット跳ねる。 */
	const addBeatDigitLayer = () => {
		const layer: MvBeatDigitLayer = {
			kind: "beatDigit",
			id: mvUid("bdg"),
			track: song.tracks[0] ?? 0,
			x: MV_W / 2,
			y: MV_H / 2 - 40,
			anchor: "top",
			cellSize: 6,
			color: "#f8fafc",
			basis: "chord",
			key: "C",
			hold: true,
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
		setSelectedLayerId(layer.id);
	};

	/** いま鳴っているコード名だけを出す読み札。切り替わる瞬間に1ドット跳ねる。 */
	const addBeatChordLabelLayer = () => {
		const layer: MvBeatChordLabelLayer = {
			kind: "beatChordLabel",
			id: mvUid("bcl"),
			x: MV_W / 2,
			y: MV_H / 2 + 20,
			anchor: "top",
			size: 20,
			color: "#f8fafc",
			z: getNextZ(),
		};
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
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
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
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
		update((m) => ({ ...m, layers: [layer, ...m.layers] }));
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
						{ value: '""', label: "標準（美咲ゴシック）" },
						{
							value: '"Hiragino Sans", "Yu Gothic", "MS PGothic", sans-serif',
							label: "ゴシック",
						},
						{
							value: '"Hiragino Mincho ProN", "Yu Mincho", "MS PMincho", serif',
							label: "明朝",
						},
						{ value: '"misaki_gothic", monospace', label: "美咲ゴシック" },
						{ value: "'Noto Sans JP', sans-serif", label: "Noto Sans JP" },
						{ value: "'Kaisei Decol', serif", label: "Kaisei Decol" },
						{ value: "'DotGothic16', sans-serif", label: "DotGothic16" },
						{ value: "'Dela Gothic One', cursive", label: "Dela Gothic One" },
						{ value: "'Potta One', cursive", label: "Potta One" },
						{ value: "'Hachi Maru Pop', cursive", label: "Hachi Maru Pop" },
						{ value: "'rorigaifont', sans-serif", label: "ロリガイフォント" },
						{ value: "'PBfont', sans-serif", label: "PBfont(かわいい)" },
						{ value: "'chupakafont', sans-serif", label: "チュパカブラフォント" },
						{ value: "'favofont', sans-serif", label: "ふぁぼフォント" },
						{ value: "'nagamonfont', sans-serif", label: "長モンフォント" },
						...customFonts.map((f) => ({
							value: `'${f.name}', sans-serif`,
							label: `${f.name}`,
						})),
					]}
					onChange={(v) => {
						const hit = customFonts.find((f) => `'${f.name}', sans-serif` === v);
						if (hit) ensureCustomFontLoaded(hit.name, hit.url);
						update((m) => ({
							...m,
							stage: {
								...m.stage,
								fontFamily: v === '""' ? undefined : v,
								customFontName: hit?.name,
								customFontUrl: hit?.url,
							},
						}));
					}}
				/>

				<Details label="カスタムフォントを登録">
					<div className="space-y-2">
						<p className="text-[10px] text-gray-500">
							woff2 等のフォントURLを登録すると、上の一覧から選べるようになる。登録はこの端末に保存され、他のMV作成でも使い回せる。
						</p>
						<input
							type="text"
							placeholder="フォント名（例: myfont）"
							value={customFontNameInput}
							onChange={(e) => setCustomFontNameInput(e.target.value)}
							className={FIELD_INPUT_CLASS}
						/>
						<input
							type="text"
							placeholder="フォントURL（例: https://.../font.woff2）"
							value={customFontUrlInput}
							onChange={(e) => setCustomFontUrlInput(e.target.value)}
							className={FIELD_INPUT_CLASS}
						/>
						<button
							type="button"
							disabled={!customFontNameInput.trim() || !customFontUrlInput.trim()}
							onClick={() => {
								const name = customFontNameInput.trim();
								const url = customFontUrlInput.trim();
								if (!name || !url) return;
								const next = upsertCustomFont({ name, url });
								setCustomFonts(next);
								ensureCustomFontLoaded(name, url);
								setCustomFontNameInput("");
								setCustomFontUrlInput("");
							}}
							className="w-full rounded bg-blue-600 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
						>
							登録
						</button>
						{customFonts.length > 0 && (
							<div className="space-y-1">
								{customFonts.map((f) => (
									<div
										key={f.name}
										className="flex items-center justify-between gap-2 rounded border border-gray-700 px-2 py-1"
									>
										<span
											className="truncate text-[11px] text-gray-300"
											title={f.url}
										>
											{f.name}
										</span>
										<button
											type="button"
											onClick={() => {
												const next = removeCustomFont(f.name);
												setCustomFonts(next);
												if (manifest.stage.customFontName === f.name) {
													update((m) => ({
														...m,
														stage: {
															...m.stage,
															fontFamily: undefined,
															customFontName: undefined,
															customFontUrl: undefined,
														},
													}));
												}
											}}
											className="shrink-0 text-gray-500 hover:text-red-400"
										>
											<X size={12} />
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				</Details>
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
						onClick={() => {
							const g = manifest.groups?.find((gg) => gg.id === layer.groupId);
							if (g?.arrangement) {
								rerollArrangedGroup(layer.groupId!);
							} else {
								rerollSymmetricShapeGroup(layer.groupId!);
							}
						}}
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

					<button
						type="button"
						onClick={() =>
							updateLayer(layer.id, (l) =>
								l.kind === "image" ? convertImageLayerToCharacter(l) : l,
							)
						}
						className="min-h-9 w-full rounded border border-emerald-700 bg-emerald-900/40 px-2 text-[11px] text-emerald-200 hover:bg-emerald-900/70"
					>
						キャラクターレイヤーへ変換して瞬き/口パクを設定
					</button>

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

			{layer.kind === "character" && (
				<CharacterLayerFields
					layer={layer}
					song={song}
					onUpdate={(patch) =>
						updateLayer(layer.id, (l) => ({ ...l, ...patch }) as MvLayer)
					}
					onPickAsset={(field) =>
						setPicker({ mode: "image", target: { layerId: layer.id, field } })
					}
				/>
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
					<label className="block space-y-0.5">
						<span className={FIELD_LABEL_CLASS}>種類</span>
						<button
							onClick={() => setVisualizerStylePickerLayerId(layer.id)}
							className="flex min-h-9 w-full items-center justify-between rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-left text-[12px] text-gray-100"
						>
							<span>{MV_VISUALIZER_LABELS[layer.style]}</span>
							<span className="text-[10px] text-blue-400">選び直す</span>
						</button>
					</label>
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
									{layer.flow === "page" && (
										<NumField
											label="切り替え位置のずらし（拍・0で小節頭に揃える）"
											value={layer.pageOffsetBeats ?? 0}
											min={0}
											max={8}
											step={0.5}
											onChange={(v) =>
												updateLayer(
													layer.id,
													(l) =>
														({
															...l,
															pageOffsetBeats: v || undefined,
														}) as MvLayer,
												)
											}
										/>
									)}
									<Hint>
										「固定」は譜面が横に動かず、指定した長さぶんを並べたまま、その期間が終わると
										次の譜面へ丸ごと差し替わります。ずらしを指定すると、切り替わるタイミングを
										小節頭から指定した拍数だけ後ろへずらせます（既定は0＝ずらさない）。
									</Hint>
								</>
							)}
							<Details label="音域（縦に映す高さの範囲）">
								<Hint>
									未指定＝自動（今映っている窓の音符から中心を決め、トラック全体の音域ぶんの幅で映す）。
									ここで固定すると、トラックや切り替え窓が変わっても音域は動かなくなります。
								</Hint>
								<CheckField
									label="音域を固定する"
									checked={!!layer.pitchRange}
									onChange={(v) =>
										updateLayer(
											layer.id,
											(l) =>
												({
													...l,
													pitchRange: v ? [62, 74] : undefined,
												}) as MvLayer,
										)
									}
								/>
								{layer.pitchRange && (
									<>
										<NumField
											label="下限（MIDIノート番号）"
											value={layer.pitchRange[0]}
											onChange={(v) =>
												updateLayer(layer.id, (l) =>
													l.kind === "visualizer" && l.pitchRange
														? {
																...l,
																pitchRange: [v, l.pitchRange[1]],
															}
														: l,
												)
											}
										/>
										<NumField
											label="上限（MIDIノート番号）"
											value={layer.pitchRange[1]}
											onChange={(v) =>
												updateLayer(layer.id, (l) =>
													l.kind === "visualizer" && l.pitchRange
														? {
																...l,
																pitchRange: [l.pitchRange[0], v],
															}
														: l,
												)
											}
										/>
									</>
								)}
							</Details>
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
					<EffectLivePreview layer={layer} bpm={song.bpm} compact />
					<label className="block space-y-0.5">
						<span className={FIELD_LABEL_CLASS}>演出</span>
						<button
							onClick={() => setEffectStylePickerLayerId(layer.id)}
							className="flex min-h-9 w-full items-center justify-between rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-left text-[12px] text-gray-100"
						>
							<span>{MV_EFFECT_STYLE_LABELS[layer.style]}</span>
							<span className="text-[10px] text-blue-400">選び直す</span>
						</button>
					</label>
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

					<Hint>
						コード進行は手入力しません。MMLから自動検出します——再生・プレビュー時に
						MMLが変わっていれば計算し直し、変わっていなければ前回の結果をそのまま使います。
					</Hint>
				</>
			)}

			{layer.kind === "beatCounter" && (
				<>
					<Hint>
						コード進行とは無関係に、拍番号だけで 1→2→3→…→{layer.beatsPerCycle}
						→1→… と刻むだけのドット絵数字です。
					</Hint>
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
						label="何拍で1周するか"
						value={layer.beatsPerCycle}
						min={1}
						max={16}
						onChange={(v) =>
							updateLayer(
								layer.id,
								(l) => ({ ...l, beatsPerCycle: v }) as MvLayer,
							)
						}
					/>
					<NumField
						label="ドットの1マスのサイズ"
						value={layer.cellSize}
						min={2}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, cellSize: v }) as MvLayer)
						}
					/>
					<ColorField
						label="色"
						value={layer.color}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, color: v }) as MvLayer)
						}
					/>
					<ColorField
						label="いまの拍の色（任意）"
						value={layer.activeColor ?? layer.color}
						onChange={(v) =>
							updateLayer(
								layer.id,
								(l) => ({ ...l, activeColor: v }) as MvLayer,
							)
						}
					/>
				</>
			)}

			{layer.kind === "beatPips" && (
				<>
					<Hint>
						拍が進むごとに図形が1個ずつ増え、{layer.beatsPerCycle}
						拍で満タンになったら次の周でまた1個から数え直します。
					</Hint>
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
						label="何拍で満タンか"
						value={layer.beatsPerCycle}
						min={1}
						max={16}
						onChange={(v) =>
							updateLayer(
								layer.id,
								(l) => ({ ...l, beatsPerCycle: v }) as MvLayer,
							)
						}
					/>
					<SelectField
						label="図形"
						value={layer.shape}
						options={[
							{ value: "square" as const, label: "四角" },
							{ value: "circle" as const, label: "丸" },
						]}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, shape: v }) as MvLayer)
						}
					/>
					<NumField
						label="大きさ"
						value={layer.size}
						min={2}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, size: v }) as MvLayer)
						}
					/>
					<NumField
						label="間隔"
						value={layer.gap}
						min={0}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, gap: v }) as MvLayer)
						}
					/>
					<ColorField
						label="色"
						value={layer.color}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, color: v }) as MvLayer)
						}
					/>
					<ColorField
						label="いま増えた1個の色（任意）"
						value={layer.activeColor ?? layer.color}
						onChange={(v) =>
							updateLayer(
								layer.id,
								(l) => ({ ...l, activeColor: v }) as MvLayer,
							)
						}
					/>
				</>
			)}

			{layer.kind === "beatDigit" && (
				<>
					<Hint>
						そのトラックでいま鳴っている音を度数のドット絵数字で出します。「度数」の
						ドット絵版——音が鳴り始めた瞬間に1ドット分跳ねます。
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
								l.kind === "beatDigit" ? { ...l, track: Number(v) } : l,
							)
						}
					/>
					<SelectField
						label="何から数えるか"
						value={layer.basis}
						options={[
							{ value: "chord" as const, label: "いまのコードの根音" },
							{ value: "key" as const, label: "曲のキーの主音" },
						]}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "beatDigit" ? { ...l, basis: v } : l,
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
								l.kind === "beatDigit" ? { ...l, key: v } : l,
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
						label="ドットの1マスのサイズ"
						value={layer.cellSize}
						min={2}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, cellSize: v }) as MvLayer)
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
						label="音が切れても数字を残す"
						checked={!!layer.hold}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "beatDigit" ? { ...l, hold: v } : l,
							)
						}
					/>
				</>
			)}

			{layer.kind === "beatChordLabel" && (
				<>
					<Hint>
						いま鳴っているコード名だけを出す読み札です。コード進行バーを画面に出さずに
						文字だけ欲しいときに使います。切り替わる瞬間に1ドット分跳ねます。
					</Hint>
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
					<Hint>
						コード進行は手入力しません。MMLから自動検出したものを表示します。
					</Hint>
				</>
			)}

			{layer.kind === "widget" && (
				<>
					<NumField
						label="X"
						value={layer.rect.x}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "widget" ? { ...l, rect: { ...l.rect, x: v } } : l,
							)
						}
					/>
					<NumField
						label="Y"
						value={layer.rect.y}
						onChange={(v) =>
							updateLayer(layer.id, (l) =>
								l.kind === "widget" ? { ...l, rect: { ...l.rect, y: v } } : l,
							)
						}
					/>
					<NumField
						label="セルサイズ"
						value={layer.cellSize}
						min={8}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, cellSize: v }) as MvLayer)
						}
					/>
					<NumField
						label="表示コマ数（＝何拍で1周するか）"
						value={layer.cols}
						min={1}
						max={16}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, cols: v }) as MvLayer)
						}
					/>
					<SelectField
						label="向き"
						value={layer.orientation}
						options={[
							{ value: "horizontal" as const, label: "横置き（2段は縦に重ねる）" },
							{ value: "vertical" as const, label: "縦置き（2段は横に並べる）" },
						]}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, orientation: v }) as MvLayer)
						}
					/>
					<NumField
						label="角度（度）"
						value={layer.angle}
						step={1}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, angle: v }) as MvLayer)
						}
					/>
					<ColorField
						label="現在の段の色（確定・スクランブル中のグリフ）"
						value={layer.color}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, color: v }) as MvLayer)
						}
					/>
					<SelectField
						label="履歴の段の色分け"
						value={layer.colorMode}
						options={(
							Object.keys(MV_CHORD_COLOR_MODE_LABELS) as MvChordColorMode[]
						).map((k) => ({ value: k, label: MV_CHORD_COLOR_MODE_LABELS[k] }))}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, colorMode: v }) as MvLayer)
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
					{layer.colorMode === "fixed" && (
						<ColorField
							label="履歴の段の色"
							value={layer.bottomColor}
							onChange={(v) =>
								updateLayer(layer.id, (l) => ({ ...l, bottomColor: v }) as MvLayer)
							}
						/>
					)}
					<ColorField
						label="境界フラッシュの色"
						value={layer.flashColor}
						onChange={(v) =>
							updateLayer(layer.id, (l) => ({ ...l, flashColor: v }) as MvLayer)
						}
					/>

					<Hint>
						模倣元はドラムのヒットで駆動されていますが、MMLにドラムは無いため、
						「1拍1ヒット」の骨格はそのままにヒットの色をコード進行（MMLから自動検出）へ
						置き換えています。現在の段は1拍に1マスずつ埋まり、窓を埋め切ると
						枠は動かさず中身だけが1マスぶんスライドして履歴の段（そのコードの色）へ
						渡り、同時に一瞬光ります。
					</Hint>
				</>
			)}

			{(layer.kind === "image" ||
				layer.kind === "text" ||
				layer.kind === "character") && (
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
				<AddLayerSelect
					placeholder="+ レイヤーを追加"
					options={[
						{ value: "image", label: "画像" },
						{ value: "character", label: "キャラクター（瞬き・口パク）" },
						{ value: "text", label: "文字" },
						{ value: "visualizer", label: "ビジュアライザ" },
						{ value: "shape", label: "図形" },
						{ value: "template", label: "エフェクト定型" },
						{ value: "lyrics", label: "歌詞" },
						{ value: "effect", label: "演出" },
					]}
					onPick={(v) => {
						if (v === "template") setTemplatePickerOpen(true);
						else if (v === "image") addImageLayer();
						else if (v === "character") addCharacterLayer();
						else if (v === "text") addTextLayer();
						else if (v === "visualizer") addVisualizerLayer();
						else if (v === "shape") addShapeLayer();
						else if (v === "lyrics") addLyricsLayer();
						else if (v === "effect") addEffectLayer();
					}}
				/>
				<p className="pb-1 pt-1 text-[10px] font-bold text-gray-400">
					ウィジェット（拍・コード進行に連動）
				</p>
				<AddLayerSelect
					placeholder="+ ウィジェットを追加"
					options={[
						{ value: "chordBar", label: "コード進行" },
						{ value: "degree", label: "度数の数字" },
						{ value: "widget", label: "アイコングリッド" },
						{ value: "beatCounter", label: "数字カウンタ" },
						{ value: "beatPips", label: "増える図形" },
						{ value: "beatDigit", label: "トラック連動ドット数字" },
						{ value: "beatChordLabel", label: "コード名の読み札" },
					]}
					onPick={(v) => {
						if (v === "chordBar") addChordBarLayer();
						else if (v === "degree") addDegreeLayer();
						else if (v === "widget") addWidgetLayer();
						else if (v === "beatCounter") addBeatCounterLayer();
						else if (v === "beatPips") addBeatPipsLayer();
						else if (v === "beatDigit") addBeatDigitLayer();
						else if (v === "beatChordLabel") addBeatChordLabelLayer();
					}}
				/>
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
											clusterType: e.target.value as
												| "centered"
												| "scattered"
												| "bars"
												| "duet"
												| "ripple",
										}))
									}
									className="rounded bg-purple-900 px-1 py-0.5 text-purple-100 outline-none"
								>
									<option value="duet">列とエンブレムが交互（参考動画準拠）</option>
									<option value="centered">中央に入れ子（エンブレム風）</option>
									<option value="scattered">中央線上に横並び</option>
									<option value="bars">棒の列（イコライザー風）</option>
									<option value="ripple">波紋（複数の拍で重なる輪）</option>
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
								ベースの拍でひと巡りします。図形ごとに等倍・2倍・4倍・8倍速を織り交ぜるので、
								速い図形が拍を刻む裏でゆっくり形が変わる層ができます（すべて整数倍なので小節の頭で必ず揃います）。
							</Hint>
							<label className="flex items-center justify-between">
								<span>拍の組み合わせ密度</span>
								<span className="flex items-center gap-1.5">
									<input
										type="range"
										min={0}
										max={1}
										step={0.1}
										value={macroSettings.comboDensity ?? DEFAULT_BEAT_COMBO_DENSITY}
										onChange={(e) =>
											setMacroSettings((s) => ({
												...s,
												comboDensity: Number(e.target.value),
											}))
										}
										className="w-24 accent-purple-400"
									/>
									<span className="w-8 text-right tabular-nums">
										{Math.round(
											(macroSettings.comboDensity ?? DEFAULT_BEAT_COMBO_DENSITY) * 100,
										)}
										%
									</span>
								</span>
							</label>
							<Hint>
								「ベースの拍」以上の周期（1/2/4/8/16/32拍）×表拍/裏拍の全組み合わせ
								（ベース1拍なら12種、4拍なら8種）から、実際に使う割合です。100%だと
								全種類を一度に踏むので賑やかすぎになりがちです（既定50%）。
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
							className="rounded border border-purple-600/40 bg-purple-950/10"
						>
							<div className="flex items-center gap-2 rounded-t bg-purple-900/20 px-2 py-1.5">
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
										<div
											className={`absolute right-0 z-50 flex w-48 flex-col overflow-hidden rounded-lg border border-purple-500/30 bg-purple-950/90 shadow-xl backdrop-blur-sm ${
												rowIndex >= layerRows.length - 2 && layerRows.length > 2
													? "bottom-full mb-1"
													: "top-full mt-1"
											}`}
										>
											<button
												onClick={() => {
													if (group.arrangement) {
														rerollArrangedGroup(group.id);
													} else {
														rerollSymmetricShapeGroup(group.id);
													}
													setGroupMenuOpenId(null);
												}}
												className="flex items-center gap-2 px-3 py-2 text-left text-[11px] text-purple-200 hover:bg-purple-600/30"
											>
												<Shuffle size={14} />
												ランダムリロール
											</button>
											{!group.arrangement && (
												<button
													onClick={() => {
														setArrangementModalGroupId(group.id);
														setGroupMenuOpenId(null);
													}}
													className="flex items-center gap-2 px-3 py-2 text-left text-[11px] text-purple-200 hover:bg-purple-600/30"
												>
													<Sparkles size={14} />
													特殊アレンジを生成
												</button>
											)}
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
							{group.arrangement && (
								<div className="flex flex-wrap items-center gap-2 border-t border-purple-700/30 bg-purple-950/30 px-2 py-1.5 text-[10px] text-purple-200">
									<Sparkles size={12} className="shrink-0 text-purple-300" />
									<span className="shrink-0">
										アレンジ元:{" "}
										{manifest.groups?.find(
											(g) => g.id === group.arrangement?.sourceGroupId,
										)?.name ?? "（見つかりません）"}
									</span>
									<label className="flex items-center gap-1">
										割り込む小節
										<input
											key={`arr-trigger-${group.arrangement.triggerBar}`}
											type="text"
											defaultValue={group.arrangement.triggerBar + 1}
											onBlur={(e) => {
												const txt = e.target.value.trim();
												const v = txt === "" ? 1 : Number(txt);
												const prevTriggerBar = group.arrangement!.triggerBar;
												const nextTriggerBar = Number.isFinite(v)
													? Math.max(0, v - 1)
													: prevTriggerBar;
												const shift = nextTriggerBar - prevTriggerBar;
												if (shift === 0) return;
												update((m) => ({
													...m,
													groups: (m.groups ?? []).map((g) => {
														if (g.id !== group.id || !g.arrangement) return g;
														// 長さ（終了小節-開始小節）は生成時に決めた尺のまま動かさない。
														// 「どこに割り込むか」だけを動かせば、再生が終われば自動で
														// アレンジ元へ戻る（＝終了位置を別途指定する必要が無い）。
														const duration =
															g.arrangement.endBar - g.arrangement.triggerBar;
														return {
															...g,
															arrangement: {
																...g.arrangement,
																triggerBar: nextTriggerBar,
																endBar: nextTriggerBar + duration,
															},
														};
													}),
													// 中身のレイヤー（スロットごとの barRange）は生成時点の
													// トリガー小節を基準に作ってあるので、グループ側の
													// triggerBar だけ動かしても中身は元の位置に取り残される
													// ——`isLayerVisible` はグループの区間と各レイヤーの
													// barRange を AND で見るため、両者がズレると「区間には
													// 入っているのに個々のレイヤーは範囲外」で何も表示され
													// なくなる（実際の動画で特殊アレンジが表示されないバグの
													// 原因だった）。ここで中身の barRange も同じ量だけ
													// 平行移動させて揃える。
													layers: m.layers.map((l) =>
														l.groupId === group.id && l.barRange
															? {
																	...l,
																	barRange: [
																		l.barRange[0] + shift,
																		l.barRange[1] + shift,
																	] as [number, number],
																}
															: l,
													),
												}));
											}}
											onKeyDown={(e) => {
												if (e.key === "Enter") e.currentTarget.blur();
											}}
											className="w-16 rounded bg-gray-800 px-1 py-0.5 text-gray-100"
										/>
									</label>
									<span className="text-purple-400">
										（{group.arrangement.endBar - group.arrangement.triggerBar}
										小節ぶん再生したらアレンジ元へ自動で戻ります）
									</span>
								</div>
							)}
							{!group.collapsed && (
								<div className="space-y-1.5 rounded-b border-t border-purple-700/30 bg-gray-900/40 p-1.5 pl-4">
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
									update((m) => ({ ...m, layers: [layer, ...m.layers] }));
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
										update((m) => ({ ...m, layers: [layer, ...m.layers] }));
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
										{(() => {
											const lines = lyricsLayer.lines ?? [];
											const timingIndex = lyricTimingIndexMap[lyricsLayer.id] ?? 0;
											const currentLine = lines[timingIndex];
											const isCompleted = lines.length > 0 && timingIndex >= lines.length;

											const handleTimingTap = () => {
												if (lines.length === 0 || timingIndex >= lines.length) return;
												const currentBar = playerRef.current?.getCurrentBar() ?? 0;
												const bar = Math.max(0, Math.round(currentBar * 100) / 100);
												updateLayer(lyricsLayer.id, (l) =>
													l.kind === "lyrics"
														? {
																...l,
																lines: (l.lines ?? []).map((x, j) =>
																	j === timingIndex ? { ...x, bar } : x,
																),
															}
														: l,
												);
												setLyricTimingIndexMap((prev) => ({
													...prev,
													[lyricsLayer.id]: timingIndex + 1,
												}));
											};

											return (
												<div className="mb-3 rounded-lg border border-purple-500/40 bg-purple-950/30 p-3 space-y-2">
													<div className="flex items-center justify-between">
														<div className="flex items-center gap-1.5 font-bold text-purple-200 text-xs">
															<Timer size={14} className="text-purple-400" />
															字幕タイミング設定ツール
														</div>
														{lines.length > 0 && (
															<span className="text-[10px] font-mono text-purple-300 bg-purple-900/60 px-2 py-0.5 rounded border border-purple-700/50">
																{timingIndex < lines.length
																	? `${timingIndex + 1} / ${lines.length} 行目`
																	: `完了 (${lines.length}/${lines.length})`}
															</span>
														)}
													</div>

													{lines.length === 0 ? (
														<p className="text-[10px] text-gray-400">
															歌詞行がありません。下の「一括貼り付け」または「行を追加」で歌詞を登録してください。
														</p>
													) : (
														<>
															<p className="text-[10px] text-purple-300/80 leading-relaxed">
																動画を再生しながらタイミングよく下のボタンを押すと、再生中の現在位置（小節）を表示タイミングとして順次セットします。
															</p>

															{/* 次にセットする字幕表示＆タップボタン */}
															<button
																type="button"
																onClick={handleTimingTap}
																disabled={isCompleted}
																className={`w-full min-h-[54px] rounded-lg border p-2 flex flex-col items-center justify-center gap-1 transition-all shadow-md active:scale-98 text-left ${
																	!isCompleted
																		? "border-purple-500/80 bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-purple-900/40"
																		: "border-gray-700 bg-gray-800/80 text-gray-400 cursor-not-allowed"
																}`}
															>
																{!isCompleted ? (
																	<>
																		<div className="flex items-center gap-1.5 text-[10px] font-bold opacity-90">
																			<Sparkles size={12} className="text-yellow-300 shrink-0" />
																			<span>
																				ここを押すとこの字幕のタイミングを決定（現在 {currentLine?.bar?.toFixed(2) ?? 0} 小節 ➔ 再生位置へ上書き）
																			</span>
																		</div>
																		<div className="text-sm font-bold truncate max-w-full text-center px-2">
																			「{currentLine?.text || "（空の歌詞行）"}」
																		</div>
																	</>
																) : (
																	<div className="text-xs font-bold text-center text-purple-200">
																		🎉 すべての字幕タイミングの設定が完了しました
																	</div>
																)}
															</button>

															{/* コントロールボタン群（待った / インデックス直接入力 / 最初から） */}
															<div className="flex flex-wrap items-center gap-2 pt-1">
																<button
																	type="button"
																	onClick={() =>
																		setLyricTimingIndexMap((prev) => ({
																			...prev,
																			[lyricsLayer.id]: Math.max(
																				0,
																				(prev[lyricsLayer.id] ?? 0) - 1,
																			),
																		}))
																	}
																	disabled={timingIndex <= 0}
																	className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-amber-600/30 border border-amber-500/50 text-amber-200 text-[11px] font-bold hover:bg-amber-600/50 active:scale-95 disabled:opacity-40 transition-colors"
																	title="セット中の字幕を1つインデックス戻します"
																>
																	<Undo2 size={12} />
																	「待った」（1つ戻る）
																</button>

																<div className="flex items-center gap-1 bg-purple-900/50 border border-purple-700/60 px-2 py-1 rounded">
																	<span className="text-[10px] text-purple-300 shrink-0 font-medium">対象行:</span>
																	<StringNumInput
																		value={timingIndex + 1}
																		onChange={(n) =>
																			setLyricTimingIndexMap((prev) => ({
																				...prev,
																				[lyricsLayer.id]: Math.max(
																					0,
																					Math.min(
																						lines.length,
																						Math.round(n) - 1,
																					),
																				),
																			}))
																		}
																		className="h-6 w-12 rounded border border-purple-600/60 bg-purple-950/80 px-1 text-[11px] font-bold text-purple-100 outline-none text-center font-mono"
																	/>
																	<span className="text-[10px] text-purple-300/70 shrink-0 font-mono">
																		/ {lines.length}
																	</span>
																</div>

																<button
																	type="button"
																	onClick={() =>
																		setLyricTimingIndexMap((prev) => ({
																			...prev,
																			[lyricsLayer.id]: 0,
																		}))
																	}
																	disabled={timingIndex === 0}
																	className="flex items-center gap-1 px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 text-[10px] hover:bg-gray-700 disabled:opacity-40 transition-colors ml-auto"
																>
																	最初から合わせる
																</button>
															</div>
														</>
													)}
												</div>
											);
										})()}

										{(lyricsLayer.lines ?? []).map((line, i) => {
											const hold = lyricsLayer.holdBars ?? 2;
											const bpm = song.bpm || 120;
											const secPerBar = (60 / bpm) * 4;
											const startSec = line.bar * secPerBar;
											const endSec = (line.bar + hold) * secPerBar;
											const timingIndex = lyricTimingIndexMap[lyricsLayer.id] ?? 0;
											const isCurrentTimingTarget = i === timingIndex;
											return (
												<div
													key={i}
													className={`flex flex-col gap-1.5 rounded border p-2 transition-all ${
														isCurrentTimingTarget
															? "border-purple-500/80 bg-purple-950/40 ring-2 ring-purple-500/50"
															: "border-gray-700/80 bg-gray-800/60"
													}`}
												>
													<div className="flex items-center gap-1.5">
														<span
															className="shrink-0 font-mono font-bold text-[11px] text-purple-300 bg-purple-950/90 border border-purple-700/60 px-1.5 py-1 rounded min-w-[32px] text-center"
															title={`歌詞行インデックス #${i + 1}`}
														>
															#{i + 1}
														</span>
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
															type="button"
															onClick={() =>
																setLyricTimingIndexMap((prev) => ({
																	...prev,
																	[lyricsLayer.id]: i,
																}))
															}
															title="タイミング設定対象をこの行に指定"
															className={`flex h-9 shrink-0 items-center gap-1 rounded px-2 text-[10px] font-bold border transition-colors ${
																isCurrentTimingTarget
																	? "bg-purple-600 border-purple-400 text-white"
																	: "bg-purple-950/40 border-purple-700/50 text-purple-200 hover:bg-purple-900/60"
															}`}
														>
															{isCurrentTimingTarget ? "⏱ 次セット対象" : "ここからセット"}
														</button>
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
														<button
															onClick={() =>
																updateLayer(lyricsLayer.id, (l) => {
																	if (l.kind !== "lyrics") return l;
																	const cur = l.lines ?? [];
																	const next = cur[i + 1];
																	// 次の行との間に挟む。次が無ければ保持時間ぶん先。
																	// 直後(同小節)に挟むと表示レンジが0になってしまうので、
																	// 間が holdBars 未満のときは素直に真ん中を取る。
																	const gapMid = next
																		? (line.bar + next.bar) / 2
																		: line.bar + hold;
																	const bar =
																		Math.round(gapMid * 100) / 100;
																	const inserted = [...cur];
																	inserted.splice(i + 1, 0, { bar, text: "" });
																	return { ...l, lines: inserted };
																})
															}
															title="この行の下に空の歌詞行を挿入"
															className="ml-auto flex shrink-0 items-center gap-1 rounded bg-blue-600/30 border border-blue-500/40 px-1.5 py-0.5 text-[10px] font-bold text-blue-200 hover:bg-blue-600/40"
														>
															<Plus size={11} />
															下に1行挿入
														</button>
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
										<label className="block space-y-0.5">
											<span className={FIELD_LABEL_CLASS}>切り替え方</span>
											<button
												onClick={() => setTransitionStylePickerSectionId(s.id)}
												className="flex min-h-9 w-full items-center justify-between rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-left text-[12px] text-gray-100"
											>
												<span>
													{MV_TRANSITION_LABELS[s.transition?.style ?? "cut"]}
												</span>
												<span className="text-[10px] text-blue-400">選び直す</span>
											</button>
										</label>
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
												update((m) => ({ ...m, layers: [layer, ...m.layers] }));
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
				{/* 設定（歯車）：履歴・スナップショット／エクスポート・インポート／MV切り替え・まっさら */}
				<div className="relative shrink-0" ref={settingsRef}>
					<button
						onClick={() => setSettingsOpen((v) => !v)}
						aria-label="設定"
						title="設定"
						className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${settingsOpen ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
					>
						<Settings size={14} />
					</button>
					<input
						ref={importFileRef}
						type="file"
						accept=".json"
						className="hidden"
						onChange={handleImport}
					/>
					{settingsOpen && (
						<div className="absolute right-0 top-full z-[100] mt-1 w-52 space-y-1 border border-gray-700 bg-[#1a1a2e] p-2 shadow-2xl">
							<button
								onClick={() => {
									setShowHistory(true);
									setSettingsOpen(false);
								}}
								className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-400 transition hover:bg-gray-700 hover:text-white"
							>
								<History size={13} />
								履歴・スナップショット
							</button>
							<div className="my-1 border-t border-gray-700" />
							<button
								onClick={() => {
									handleExport();
									setSettingsOpen(false);
								}}
								className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-400 transition hover:bg-gray-700 hover:text-white"
							>
								<Download size={13} />
								データをエクスポート (.json)
							</button>
							<button
								onClick={() => {
									importFileRef.current?.click();
									setSettingsOpen(false);
								}}
								className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-400 transition hover:bg-gray-700 hover:text-white"
							>
								<Upload size={13} />
								データをインポート (.json)
							</button>
							<div className="my-1 border-t border-gray-700" />
							<button
								onClick={() => {
									setSwitchOpen(true);
									setSettingsOpen(false);
								}}
								className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-400 transition hover:bg-gray-700 hover:text-white"
							>
								<Clapperboard size={13} />
								MVを切り替え・まっさらにする
							</button>
						</div>
					)}
				</div>
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

			{/* ── MVを切り替え・まっさらにする 専用パネル ── */}
			{switchOpen && (
				<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
					<div className="flex w-full max-w-md flex-col rounded border border-gray-700 bg-gray-900 p-4 shadow-2xl">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-200">
								<Clapperboard size={15} />
								MVを切り替え・まっさらにする
							</h3>
							<button
								onClick={() => setSwitchOpen(false)}
								className="p-1 text-gray-400 hover:text-white"
								title="とじる"
							>
								<X size={14} />
							</button>
						</div>

						<div className="space-y-4 text-xs">
							{/* まっさらにする */}
							<div className="space-y-2 rounded border border-red-800/60 bg-red-950/40 p-3">
								<div className="flex items-center gap-1.5 font-bold text-red-300">
									<Trash2 size={13} />
									まっさらにする（見た目：{MV_PRESET_LABELS[manifest.preset]}）
								</div>
								<p className="text-[10px] leading-relaxed text-gray-400">
									見た目のプリセット種別はそのまま、曲・レイヤー・場面をすべて消して空の状態から作り直します。
								</p>
								<button
									onClick={() => {
										if (
											!confirm(
												"編集中の内容（曲・レイヤー・場面）をすべて消して、まっさらにしますか？\n\n元に戻す（Ctrl+Z）で直前の状態へ戻せますが、確実に戻せる保証はないため、大切なデータは先にエクスポートしてください。",
											)
										)
											return;
										pushUndo();
										setManifest(buildBlankMvManifest(manifest.preset));
										setSelectedLayerId(null);
										setSwitchOpen(false);
									}}
									className="w-full rounded bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-500"
								>
									編集内容をすべて消してまっさらにする
								</button>
							</div>

							{/* 見本（プリセット）を初期ロード */}
							<div className="space-y-1.5">
								<div className="flex items-center gap-1.5 font-bold text-gray-300">
									<Sparkles size={13} />
									見本を初期ロードして切り替える
								</div>
								<select
									value=""
									onChange={(e) => {
										const p = MV_PRESETS.find((pp) => pp.name === e.target.value);
										if (!p) return;
										if (
											!confirm(
												`「${p.name}」に作り替えます。いまの編集内容は失われますが、よろしいですか？`,
											)
										)
											return;
										resetEditHistory();
										setManifest(p.build());
										setPresetName(p.name);
										setSelectedLayerId(null);
										setSwitchOpen(false);
									}}
									className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-[11px] text-gray-200 outline-none"
								>
									<option value="" disabled>
										見本を選ぶ…
									</option>
									{MV_PRESETS.map((p) => (
										<option key={p.name} value={p.name}>
											{p.name}
											{presetName === p.name ? "（現在選択中）" : ""}
										</option>
									))}
								</select>
								<p className="text-[10px] leading-tight text-gray-500">
									選んだ見本の初期状態に丸ごと置き換えます
								</p>
							</div>
						</div>
					</div>
				</div>
			)}

			{templatePickerOpen && (
				<MvEffectTemplatePicker
					onPick={addTemplateLayers}
					onClose={() => setTemplatePickerOpen(false)}
				/>
			)}

			{effectStylePickerLayerId &&
				(() => {
					const target = manifest.layers.find(
						(l): l is MvEffectLayer =>
							l.kind === "effect" && l.id === effectStylePickerLayerId,
					);
					if (!target) return null;
					return (
						<EffectStylePickerModal
							layer={target}
							bpm={song.bpm}
							onPick={(style) =>
								updateLayer(
									target.id,
									(l) => ({ ...l, style }) as MvLayer,
								)
							}
							onClose={() => setEffectStylePickerLayerId(null)}
						/>
					);
				})()}

			{transitionStylePickerSectionId &&
				(() => {
					const target = manifest.sections.find(
						(s) => s.id === transitionStylePickerSectionId,
					);
					if (!target) return null;
					return (
						<TransitionStylePickerModal
							value={target.transition?.style ?? "cut"}
							onPick={(style) =>
								updateSection(target.id, (x) => ({
									...x,
									transition:
										style === "cut"
											? undefined
											: {
													...(x.transition ?? DEFAULT_MV_TRANSITION),
													style,
												},
								}))
							}
							onClose={() => setTransitionStylePickerSectionId(null)}
						/>
					);
				})()}

			{visualizerStylePickerLayerId &&
				(() => {
					const target = manifest.layers.find(
						(l): l is MvVisualizerLayer =>
							l.kind === "visualizer" && l.id === visualizerStylePickerLayerId,
					);
					if (!target) return null;
					return (
						<VisualizerStylePickerModal
							layer={target}
							song={song}
							onPick={(style) =>
								updateLayer(target.id, (l) => {
									// ピアノロールは3D表示が既定(見せ方が未設定のときだけ立体を入れる)
									const next = { ...l, style } as MvLayer;
									if (
										style === "pianoRoll" &&
										next.kind === "visualizer" &&
										!next.projection
									)
										next.projection = "perspective";
									return next;
								})
							}
							onClose={() => setVisualizerStylePickerLayerId(null)}
						/>
					);
				})()}

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

			{arrangementModalGroupId &&
				(() => {
					const sourceLayers = manifest.layers.filter(
						(l): l is MvShapeLayer =>
							l.groupId === arrangementModalGroupId && l.kind === "shape",
					);
					if (sourceLayers.length === 0) return null;
					return (
						<MvArrangementModal
							sourceGroupId={arrangementModalGroupId}
							sourceLayers={sourceLayers}
							bpm={song.bpm}
							onApply={(result) =>
								insertArrangedGroup(arrangementModalGroupId, result)
							}
							onClose={() => setArrangementModalGroupId(null)}
						/>
					);
				})()}

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
							<div>
								<label className="mb-1 block text-[11px] font-medium text-gray-400">
									編集項目を選択
								</label>
								<select
									value={bulkField}
									onChange={(e) => {
										const nextField = e.target.value as typeof bulkField;
										setBulkField(nextField);
										if (nextField === "z") setBulkValue(bulkMode === "relative" ? 0 : 10);
										else if (nextField === "size") setBulkValue(bulkMode === "relative" ? 0 : 40);
										else if (nextField === "opacity") setBulkValue(bulkMode === "relative" ? 0 : 1);
										else if (nextField === "rotation") setBulkValue(0);
										else if (nextField === "thickness") setBulkValue(bulkMode === "relative" ? 0 : 2);
									}}
									className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-purple-500"
								>
									<option value="z">重なり順 (z)</option>
									<option value="position">座標 (X, Y)</option>
									<option value="size">サイズ (拡大率/px)</option>
									<option value="opacity">不透明度 (0.0〜1.0)</option>
									<option value="rotation">回転 (度)</option>
									<option value="thickness">線の太さ (px)</option>
									<option value="color">色 (カラー)</option>
									<option value="blend">描画モード (ブレンド)</option>
								</select>
							</div>
							{bulkField !== "color" && bulkField !== "blend" && (
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
							)}
							{bulkField === "position" ? (
								<div className="flex items-center gap-2">
									<span className="w-6 shrink-0 text-[10px] text-gray-400">
										X
									</span>
									<StringNumInput
										value={bulkX}
										onChange={setBulkX}
										className="min-h-9 w-full rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none focus:border-purple-500"
									/>
									<span className="w-6 shrink-0 text-[10px] text-gray-400">
										Y
									</span>
									<StringNumInput
										value={bulkY}
										onChange={setBulkY}
										className="min-h-9 w-full rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none focus:border-purple-500"
									/>
								</div>
							) : bulkField === "color" ? (
								<div className="flex items-center gap-2">
									<input
										type="color"
										value={bulkColor.startsWith("#") && bulkColor.length === 7 ? bulkColor : "#ffffff"}
										onChange={(e) => setBulkColor(e.target.value)}
										className="h-9 w-9 shrink-0 cursor-pointer rounded border border-gray-700 bg-gray-800 p-0.5"
									/>
									<input
										type="text"
										value={bulkColor}
										onChange={(e) => setBulkColor(e.target.value)}
										placeholder="#ffffff"
										className="min-h-9 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 outline-none focus:border-purple-500"
									/>
								</div>
							) : bulkField === "blend" ? (
								<select
									value={bulkBlend}
									onChange={(e) => setBulkBlend(e.target.value as MvBlend)}
									className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-purple-500"
								>
									{Object.entries(MV_BLEND_LABELS).map(([k, label]) => (
										<option key={k} value={k}>
											{label}
										</option>
									))}
								</select>
							) : (
								<StringNumInput
									value={bulkValue}
									onChange={setBulkValue}
									className="min-h-9 w-full rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 outline-none focus:border-purple-500"
								/>
							)}
							<p className="text-[10px] leading-relaxed text-gray-500">
								{bulkField === "color" || bulkField === "blend"
									? "グループ内の該当する全レイヤーを指定した設定で上書きします。"
									: bulkMode === "relative"
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
										if (bulkField === "position")
											return applyGroupPosition(m, groupId, bulkMode, bulkX, bulkY);
										if (bulkField === "size")
											return applyGroupSize(m, groupId, bulkMode, bulkValue);
										if (bulkField === "opacity")
											return applyGroupOpacity(m, groupId, bulkMode, bulkValue);
										if (bulkField === "rotation")
											return applyGroupRotation(m, groupId, bulkMode, bulkValue);
										if (bulkField === "thickness")
											return applyGroupThickness(m, groupId, bulkMode, bulkValue);
										if (bulkField === "color")
											return applyGroupColor(m, groupId, bulkColor);
										if (bulkField === "blend")
											return applyGroupBlend(m, groupId, bulkBlend);
										return m;
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
