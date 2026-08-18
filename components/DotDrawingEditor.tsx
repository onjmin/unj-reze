"use client";

import * as oekaki from "@onjmin/oekaki";
import {
	BoxSelect,
	Copy,
	Download,
	Eraser,
	Film,
	FlipHorizontal,
	History,
	LassoSelect,
	Layers,
	Maximize2,
	PaintBucket,
	Pen,
	Pipette,
	Redo,
	RotateCcw,
	RotateCw,
	Save,
	Settings,
	Trash2,
	Undo,
	Upload,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	clearAutosave,
	DrawingEditorState,
	deserializeFrames,
	deserializeLayers,
	deserializeWalkLayers,
	getAutosave,
	getStorageKey,
	saveAutosave,
	saveHistory,
	serializeFrames,
	serializeLayers,
	serializeWalkLayers,
} from "@/lib/history";
import {
	detectPreset,
	type WalkPreset,
	presets as walkPresets,
} from "@/lib/walk-cycle";
import {
	exportFramesZip,
	exportGif,
	exportSinglePng,
	exportSpriteSheet,
	exportWalkAsAniZip,
	generateSpriteSheetCanvas,
	resizeCanvas,
} from "@/lib/export-drawing";
import { api } from "@/lib/api";
import type { AnimationBarFrame, FrameData } from "./AnimationBar";
import AnimationBar, { computeFrameColor } from "./AnimationBar";
import DrawingExportDialog from "./DrawingExportDialog";
import HistoryModal from "./HistoryModal";
import ImportDialog from "./ImportDialog";
import type { LayerEntry } from "./LayerPanel";
import LayerPanel from "./LayerPanel";
import WalkCyclePanel from "./WalkCyclePanel";

function getEditorFrames(
	instances: oekaki.LayeredCanvas[][],
	ids: number[],
	currentLayers: oekaki.LayeredCanvas[],
	currentFrame: number,
): AnimationBarFrame[] {
	const list = instances.length > 0 ? instances : [currentLayers];
	return list.map((layers, i) => {
		const id = ids[i] ?? i + 1;
		const l = i === currentFrame ? currentLayers : layers;
		return {
			id,
			color: computeFrameColor(l, id),
		};
	});
}

export interface DotDrawingAnimMeta {
	/** スプライトシートのコマ数（歩行グラは方向あたりのコマ数） */
	animFrames: number;
	/** 再生fps */
	animFps: number;
	/** 歩行グラのとき `lib/walk-cycle.ts` の WalkPreset.label。アニメ絵なら未設定 */
	walkPreset?: string;
}

interface DotDrawingEditorProps {
	onClose: () => void;
	onSave: (
		data: string,
		gridW?: number,
		gridH?: number,
		animMeta?: DotDrawingAnimMeta,
	) => void;
	collabImageUrl?: string;
	initialGridW?: number;
	initialGridH?: number;
}

type Tool = "pen" | "eraser" | "dropper" | "fill" | "select" | "lasso";

const SIZE_PRESETS = [
	{ label: "16×16", w: 16, h: 16 },
	{ label: "24×32", w: 24, h: 32 },
	{ label: "32×32", w: 32, h: 32 },
	{ label: "48×48", w: 48, h: 48 },
	{ label: "64×64", w: 64, h: 64 },
	{ label: "96×96", w: 96, h: 96 },
	{ label: "128×128", w: 128, h: 128 },
];

const PALETTE_PICO8 = [
	"#000000",
	"#1d2b53",
	"#7e2553",
	"#008751",
	"#ab5236",
	"#5f574f",
	"#c2c3c7",
	"#fff1e8",
	"#ff004d",
	"#ffa300",
	"#ffec27",
	"#00e436",
	"#29adff",
	"#83769c",
	"#ff77a8",
	"#ffccaa",
];

export default function DotDrawingEditor({
	onClose,
	onSave,
	collabImageUrl,
	initialGridW,
	initialGridH,
}: DotDrawingEditorProps) {
	const mountRef = useRef<HTMLDivElement>(null);
	const canvasAreaRef = useRef<HTMLDivElement>(null);
	const toolRef = useRef<Tool>("pen");
	const colorRef = useRef("#000000");
	const collabRef = useRef(collabImageUrl);
	const [walkMode, setWalkMode] = useState(false);
	const [walkPreset, setWalkPreset] = useState<WalkPreset>(walkPresets[1]);
	const [walkActiveIndex, setWalkActiveIndex] = useState(0);
	const [initKey, setInitKey] = useState(0);
	const walkDataRef = useRef<Map<number, string>>(new Map());
	const walkLayersRef = useRef<
		Map<
			number,
			{
				layers: {
					name: string;
					visible: boolean;
					locked: boolean;
					opacity: number;
					data: Uint8ClampedArray;
				}[];
			}
		>
	>(new Map());
	const walkModeRef = useRef(walkMode);
	const walkPresetRef = useRef(walkPreset);
	const walkActiveIndexRef = useRef(0);
	const [tool, setTool] = useState<Tool>("pen");
	const [color, setColor] = useState("#000000");
	const [zoom, setZoom] = useState(1);
	const [flipped, setFlipped] = useState(false);
	const canvasSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
	const internalClipboardRef = useRef<HTMLCanvasElement | null>(null);
	const selectDragModeRef = useRef<"new" | "move" | "resize" | "rotate" | null>(
		null,
	);
	const selectStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const selectAnchorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const selectRotateAngleRef = useRef(0);
	const lassoPointsRef = useRef<[number, number][]>([]);
	const multiTouchPointsRef = useRef<Map<number, { x: number; y: number }>>(
		new Map(),
	);
	/** 複数指タッチ中フラグ。立っている間は描画コールバックを無視する。 */
	const multiTouchingRef = useRef(false);
	/** 1本目の指が触れた時点のレイヤー内容。2本目が触れたらここまで巻き戻す。 */
	const strokeSnapshotRef = useRef<{
		layer: { data: Uint8ClampedArray };
		data: Uint8ClampedArray;
	} | null>(null);
	const [gridW, setGridW] = useState(initialGridW ?? 32);
	const [gridH, setGridH] = useState(initialGridH ?? 32);
	const [showPresets, setShowPresets] = useState(false);
	const [recentColors, setRecentColors] = useState<string[]>([]);
	const [layerEntries, setLayerEntries] = useState<LayerEntry[]>([]);
	const [activeLayerIndex, setActiveLayerIndex] = useState(0);
	const [showLayerPanel, setShowLayerPanel] = useState(() => {
		if (typeof window !== "undefined") {
			return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
		}
		return false;
	});
	const layerCounterRef = useRef(1);
	const layerEntriesRef = useRef<LayerEntry[]>([]);
	const activeLayerIndexRef = useRef(0);
	const [animMode, setAnimMode] = useState(false);
	const frameInstancesRef = useRef<oekaki.LayeredCanvas[][]>([]);
	const frameIdsRef = useRef<number[]>([1]);
	const nextFrameIdRef = useRef<number>(2);
	const currentFrameRef = useRef(0);
	const fpsRef = useRef(8);
	const [isPlaying, setIsPlaying] = useState(false);
	const isPlayingRef = useRef(false);
	const playTimerRef = useRef<number | null>(null);
	const [, forceRender] = useState(0);
	const onionSkinRef = useRef(false);
	const onionSkinOpacityRef = useRef(20);
	const onionCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const [onionSkin, setOnionSkin] = useState(false);
	const [onionSkinOpacity, setOnionSkinOpacity] = useState(20);
	const [isDragover, setIsDragover] = useState(false);
	const [showImport, setShowImport] = useState(false);

	const [showExportDialog, setShowExportDialog] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const settingsRef = useRef<HTMLDivElement>(null);

	// History & Autosave States
	const [showHistory, setShowHistory] = useState(false);
	const [hasAutosave, setHasAutosave] = useState(false);
	const [autosaveData, setAutosaveData] = useState<DrawingEditorState | null>(
		null,
	);
	const [restoredState, setRestoredState] = useState<DrawingEditorState | null>(
		null,
	);
	const storageKey = getStorageKey("dotdrawing");

	// 設定ドロップダウンの外側クリック検知
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
				setSettingsOpen(false);
			}
		};
		window.addEventListener("mousedown", handleClickOutside);
		return () => window.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		toolRef.current = tool;
		colorRef.current = color;
		walkModeRef.current = walkMode;
		walkPresetRef.current = walkPreset;
	});

	// --- Export Handlers ---
	const handleExportSinglePng = (scale: number) => {
		const canvas = oekaki.render();
		const targetW = gridW * scale;
		const targetH = gridH * scale;
		exportSinglePng(canvas, targetW, targetH, `dot_${targetW}x${targetH}.png`);
	};

	const getAnimFramesForExport = (scale: number) => {
		const frames =
			frameInstancesRef.current.length > 0
				? frameInstancesRef.current
				: [oekaki.getLayers()];
		const currentLayers = oekaki.getLayers();
		const targetW = gridW * scale;
		const targetH = gridH * scale;

		return frames.map((layers, frameIdx) => {
			const list =
				frameIdx === currentFrameRef.current ? currentLayers : layers;
			const canvas = document.createElement("canvas");
			canvas.width = CANVAS_SIZE;
			canvas.height = CANVAS_SIZE;
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			if (ctx) {
				for (const l of list) {
					if (!l.visible || l.opacity <= 0) continue;
					ctx.globalAlpha = l.opacity / 100;
					ctx.drawImage(l.canvas, 0, 0);
				}
			}
			return resizeCanvas(canvas, targetW, targetH);
		});
	};

	const handleExportAnimSpriteSheet = (scale: number) => {
		const frameCanvases = getAnimFramesForExport(scale);
		const targetW = gridW * scale;
		const targetH = gridH * scale;
		exportSpriteSheet(
			{
				columns: frameCanvases.length,
				rows: 1,
				cellWidth: targetW,
				cellHeight: targetH,
				frames: frameCanvases,
			},
			"animation_spritesheet.png",
		);
	};

	const handleExportAnimGif = async ({
		scale,
		transparent,
		backgroundColor,
	}: {
		scale: number;
		transparent: boolean;
		backgroundColor?: string;
	}) => {
		const frameCanvases = getAnimFramesForExport(scale);
		const targetW = gridW * scale;
		const targetH = gridH * scale;
		await exportGif({
			frames: frameCanvases,
			width: targetW,
			height: targetH,
			fps: fpsRef.current,
			transparent,
			backgroundColor,
			fileName: "animation.gif",
		});
	};

	const handleExportAnimZip = async (scale: number) => {
		const frameCanvases = getAnimFramesForExport(scale);
		const targetW = gridW * scale;
		const targetH = gridH * scale;
		await exportFramesZip({
			frames: frameCanvases.map((canvas, i) => ({
				name: `frame_${String(i + 1).padStart(2, "0")}.png`,
				canvas,
			})),
			width: targetW,
			height: targetH,
			fileName: "animation_frames.zip",
		});
	};

	const getWalkCellCanvas = (
		wayIdx: number,
		frameIdx: number,
	): HTMLCanvasElement => {
		const idx = wayIdx * walkPreset.frames + frameIdx;
		if (idx === walkActiveIndexRef.current) {
			const canvas = oekaki.render();
			return resizeCanvas(canvas, walkPreset.w, walkPreset.h);
		}
		const cellLayers = walkLayersRef.current.get(idx);
		if (cellLayers && cellLayers.layers.length > 0) {
			const temp = document.createElement("canvas");
			temp.width = CANVAS_SIZE;
			temp.height = CANVAS_SIZE;
			const ctx = temp.getContext("2d", { willReadFrequently: true });
			if (ctx) {
				for (const l of cellLayers.layers) {
					if (!l.visible || l.opacity <= 0) continue;
					const imgData = new ImageData(
						new Uint8ClampedArray(l.data),
						CANVAS_SIZE,
						CANVAS_SIZE,
					);
					const layerCanvas = document.createElement("canvas");
					layerCanvas.width = CANVAS_SIZE;
					layerCanvas.height = CANVAS_SIZE;
					const lctx = layerCanvas.getContext("2d");
					if (lctx) {
						lctx.putImageData(imgData, 0, 0);
						ctx.globalAlpha = l.opacity / 100;
						ctx.drawImage(layerCanvas, 0, 0);
					}
				}
			}
			return resizeCanvas(temp, walkPreset.w, walkPreset.h);
		}
		const dataUrl = walkDataRef.current.get(idx);
		if (dataUrl) {
			const img = new Image();
			img.src = dataUrl;
			const temp = document.createElement("canvas");
			temp.width = walkPreset.w;
			temp.height = walkPreset.h;
			const ctx = temp.getContext("2d");
			if (ctx) {
				ctx.imageSmoothingEnabled = false;
				ctx.drawImage(img, 0, 0, walkPreset.w, walkPreset.h);
			}
			return temp;
		}
		const blank = document.createElement("canvas");
		blank.width = walkPreset.w;
		blank.height = walkPreset.h;
		return blank;
	};

	const handleExportWalkSpriteSheet = () => {
		const cells: HTMLCanvasElement[] = [];
		for (let y = 0; y < walkPreset.ways.length; y++) {
			for (let x = 0; x < walkPreset.frames; x++) {
				const c = getWalkCellCanvas(y, x);
				cells.push(c);
			}
		}
		exportSpriteSheet(
			{
				columns: walkPreset.frames,
				rows: walkPreset.ways.length,
				cellWidth: walkPreset.w,
				cellHeight: walkPreset.h,
				frames: cells,
			},
			`walk_${walkPreset.label}_${walkPreset.w * walkPreset.frames}x${walkPreset.h * walkPreset.ways.length}.png`,
		);
	};

	const handleExportWalkGif = async ({
		allWays,
		transparent,
		backgroundColor,
	}: {
		allWays: boolean;
		transparent: boolean;
		backgroundColor?: string;
	}) => {
		const frames: HTMLCanvasElement[] = [];
		if (allWays) {
			for (let y = 0; y < walkPreset.ways.length; y++) {
				for (let x = 0; x < walkPreset.frames; x++) {
					const c = getWalkCellCanvas(y, x);
					if (c) frames.push(c);
				}
			}
		} else {
			const y = Math.floor(walkActiveIndex / walkPreset.frames);
			for (let x = 0; x < walkPreset.frames; x++) {
				const c = getWalkCellCanvas(y, x);
				if (c) frames.push(c);
			}
		}
		await exportGif({
			frames,
			width: walkPreset.w,
			height: walkPreset.h,
			fps: fpsRef.current,
			transparent,
			backgroundColor,
			fileName: `walk_${walkPreset.label}.gif`,
		});
	};

	const handleExportWalkZip = async () => {
		const frames: { name: string; canvas: HTMLCanvasElement }[] = [];
		for (let y = 0; y < walkPreset.ways.length; y++) {
			const wayInfo = walkPreset.ways[y];
			const wayName = wayInfo?.label ? `${y + 1}_${wayInfo.label}` : `${y + 1}`;
			for (let x = 0; x < walkPreset.frames; x++) {
				const c = getWalkCellCanvas(y, x);
				if (c) {
					frames.push({
						name: `way_${wayName}_frame_${x + 1}.png`,
						canvas: c,
					});
				}
			}
		}
		await exportFramesZip({
			frames,
			width: walkPreset.w,
			height: walkPreset.h,
			fileName: `walk_${walkPreset.label}_frames.zip`,
		});
	};

	const handleExportWalkAni = async () => {
		await exportWalkAsAniZip({
			ways: walkPreset.ways,
			frames: walkPreset.frames,
			width: walkPreset.w,
			height: walkPreset.h,
			fps: fpsRef.current,
			getFrameCanvas: (y, x) => getWalkCellCanvas(y, x),
			fileName: `walk_${walkPreset.label}_cursors.zip`,
		});
	};

	const handleDeselect = () => {
		const active =
			layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
		if (active) {
			active.deselect();
			if (active.modified()) active.trace();
		}
		const upperCtx = oekaki.upperLayer.value?.ctx;
		if (upperCtx) {
			upperCtx.clearRect(0, 0, upperCtx.canvas.width, upperCtx.canvas.height);
		}
		forceRender((n) => n + 1);
	};

	const selectTool = (t: Tool) => {
		if (toolRef.current !== t && t !== "select" && t !== "lasso") {
			handleDeselect();
		}
		setTool(t);
		toolRef.current = t;
	};

	const applyColor = (c: string) => {
		setColor(c);
		oekaki.color.value = c;
		setRecentColors((prev) => {
			if (prev[0] === c) return prev;
			const filtered = prev.filter((x) => x !== c);
			return [c, ...filtered].slice(0, 8);
		});
		if (toolRef.current === "eraser" || toolRef.current === "dropper") {
			selectTool("pen");
		}
	};

	const CANVAS_SIZE = 384;

	const notDrawing = (e: Event) => {
		const target = e.target as HTMLElement | null;
		if (!target) return false;
		return (
			target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.isContentEditable
		);
	};

	const pasteImage = async (blob: Blob, pasteOpacity = 1) => {
		const active =
			layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
		if (!active?.editable) return;
		const dotSize = oekaki.getDotSize();
		const isWalk = walkModeRef.current;
		const cw = active.canvas.width;
		const ch = active.canvas.height;
		const gw = isWalk ? walkPresetRef.current.w : Math.round(cw / dotSize);
		const gh = isWalk ? walkPresetRef.current.h : Math.round(ch / dotSize);
		const bitmap = await createImageBitmap(blob);
		const temp = document.createElement("canvas");
		temp.width = gw;
		temp.height = gh;
		const ctx = temp.getContext("2d", { willReadFrequently: true });
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		const srcW = bitmap.width;
		const srcH = bitmap.height;
		const ratio = Math.min(1, Math.min(gw / srcW, gh / srcH));
		const dstW = Math.round(srcW * ratio);
		const dstH = Math.round(srcH * ratio);
		const ox = Math.floor((gw - dstW) / 2);
		const oy = Math.floor((gh - dstH) / 2);
		ctx.drawImage(bitmap, ox, oy, dstW, dstH);
		const { data } = ctx.getImageData(0, 0, gw, gh);
		for (let y = 0; y < gh; y++) {
			for (let x = 0; x < gw; x++) {
				const i = (y * gw + x) * 4;
				const [r, g, b, a] = data.subarray(i, i + 4);
				if (!a) continue;
				oekaki.color.value = `rgba(${r},${g},${b},${(a / 255) * pasteOpacity})`;
				active.drawByDot(x * dotSize, y * dotSize);
				active.used = true;
			}
		}
		active.trace();
		forceRender((n) => n + 1);
	};

	const handleImport = async (
		image: HTMLImageElement,
		opts: { opacity: number; simple: boolean },
	) => {
		if (walkMode && !opts.simple) {
			const preset = detectPreset(image.naturalWidth, image.naturalHeight);
			if (preset) {
				const dotSize = Math.floor(CANVAS_SIZE / preset.h);
				const canvasW = preset.w * dotSize;
				const canvasH = preset.h * dotSize;
				const temp = document.createElement("canvas");
				temp.width = preset.w;
				temp.height = preset.h;
				const ctx = temp.getContext("2d", { willReadFrequently: true });
				if (!ctx) return;
				ctx.imageSmoothingEnabled = false;
				const total = preset.frames * preset.ways.length;
				const newMap = new Map<
					number,
					{
						layers: {
							name: string;
							visible: boolean;
							locked: boolean;
							opacity: number;
							data: Uint8ClampedArray;
						}[];
					}
				>();
				for (let i = 0; i < total; i++) {
					const cellX = i % preset.frames;
					const cellY = Math.floor(i / preset.frames);
					ctx.clearRect(0, 0, preset.w, preset.h);
					ctx.drawImage(
						image,
						cellX * preset.w,
						cellY * preset.h,
						preset.w,
						preset.h,
						0,
						0,
						preset.w,
						preset.h,
					);
					const { data: pixelData } = ctx.getImageData(
						0,
						0,
						preset.w,
						preset.h,
					);
					const buf = new Uint8ClampedArray(canvasW * canvasH * 4);
					for (let y = 0; y < preset.h; y++) {
						for (let x = 0; x < preset.w; x++) {
							const srcIdx = (y * preset.w + x) * 4;
							const a = pixelData[srcIdx + 3];
							if (!a) continue;
							const r = pixelData[srcIdx];
							const g = pixelData[srcIdx + 1];
							const b = pixelData[srcIdx + 2];
							const aa = Math.round(a * opts.opacity);
							for (let dy = 0; dy < dotSize; dy++) {
								for (let dx = 0; dx < dotSize; dx++) {
									const dstIdx =
										((y * dotSize + dy) * canvasW + (x * dotSize + dx)) * 4;
									buf[dstIdx] = r;
									buf[dstIdx + 1] = g;
									buf[dstIdx + 2] = b;
									buf[dstIdx + 3] = aa;
								}
							}
						}
					}
					newMap.set(i, {
						layers: [
							{
								name: "レイヤー #1",
								visible: true,
								locked: false,
								opacity: 100,
								data: buf,
							},
						],
					});
				}
				walkDataRef.current.clear();
				for (let i = 0; i < total; i++) {
					const w = canvasW;
					const h = canvasH;
					const c = document.createElement("canvas");
					c.width = w;
					c.height = h;
					const cx = c.getContext("2d");
					if (cx) {
						const id = cx.createImageData(w, h);
						id.data.set(newMap.get(i)!.layers[0].data);
						cx.putImageData(id, 0, 0);
						walkDataRef.current.set(i, c.toDataURL("image/png"));
					}
				}
				walkLayersRef.current = newMap;
				setWalkPreset(preset);
				setWalkActiveIndex(0);
				walkActiveIndexRef.current = 0;
				setWalkMode(true);
				setInitKey((k) => k + 1);
				return;
			}
		}
		const blob = await fetch(image.src, { cache: "no-store" })
			.then((r) => r.blob())
			.catch(() => null);
		if (blob) pasteImage(blob, opts.opacity);
	};

	const handleCopy = () => {
		const active =
			layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
		const target =
			layerEntriesRef.current
				.map((l) => l.instance)
				.find((l) => l.selection) || active;
		if (!target) return;
		let copyCanvas: HTMLCanvasElement | null = null;
		if (target.selection) {
			copyCanvas = target.copySelection();
		} else if (target.canvas) {
			copyCanvas = document.createElement("canvas");
			copyCanvas.width = target.canvas.width;
			copyCanvas.height = target.canvas.height;
			const ctx = copyCanvas.getContext("2d");
			if (ctx) ctx.drawImage(target.canvas, 0, 0);
		}
		if (copyCanvas) {
			internalClipboardRef.current = copyCanvas;
			if (navigator.clipboard?.write && window.isSecureContext) {
				copyCanvas.toBlob((blob) => {
					if (blob) {
						try {
							navigator.clipboard
								.write([new ClipboardItem({ "image/png": blob })])
								.catch(() => {});
						} catch {}
					}
				});
			}
		}
	};

	const handleCut = () => {
		const active =
			layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
		const target =
			layerEntriesRef.current
				.map((l) => l.instance)
				.find((l) => l.selection) || active;
		if (!target?.selection) return;
		handleCopy();
		target.deleteSelection();
		if (target.modified()) target.trace();
		forceRender((n) => n + 1);
	};

	const handlePaste = async (e: ClipboardEvent) => {
		if (notDrawing(e)) return;
		const active =
			layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
		if (!active?.editable) return;
		let imageItem: DataTransferItem | null = null;
		for (const v of e.clipboardData?.items ?? []) {
			if (v.kind === "file" && v.type.startsWith("image/")) {
				imageItem = v;
				break;
			}
		}
		let bitmap: ImageBitmap | HTMLCanvasElement | null = null;
		if (imageItem) {
			const file = imageItem.getAsFile();
			if (!file) return;
			bitmap = await createImageBitmap(file);
		} else if (internalClipboardRef.current) {
			bitmap = internalClipboardRef.current;
		} else {
			return;
		}
		e.preventDefault();
		active.paste(bitmap);
		if (active.modified()) active.trace();
		setTool("select");
		toolRef.current = "select";
		drawSelectionHandle();
		forceRender((n) => n + 1);
	};

	const toggleOnionSkin = () => {
		const next = !onionSkinRef.current;
		onionSkinRef.current = next;
		setOnionSkin(next);
		if (onionCanvasRef.current) {
			onionCanvasRef.current.style.display = next ? "block" : "none";
		}
		if (next) updateOnionSkin();
	};

	const handleOnionSkinOpacityChange = (opacity: number) => {
		onionSkinOpacityRef.current = opacity;
		setOnionSkinOpacity(opacity);
		updateOnionSkin();
	};

	const updateOnionSkin = () => {
		const canvas = onionCanvasRef.current;
		if (!canvas || !onionSkinRef.current) return;
		const w = canvas.width,
			h = canvas.height;
		if (walkModeRef.current) {
			const idx = walkActiveIndexRef.current - 1;
			if (idx < 0) {
				const ctx = canvas.getContext("2d");
				if (ctx) ctx.clearRect(0, 0, w, h);
				return;
			}
			const cellData = walkLayersRef.current.get(idx);
			if (!cellData || cellData.layers.length === 0) {
				const ctx = canvas.getContext("2d");
				if (ctx) ctx.clearRect(0, 0, w, h);
				return;
			}
			const temp = document.createElement("canvas");
			temp.width = w;
			temp.height = h;
			const tempCtx = temp.getContext("2d")!;
			for (const l of cellData.layers) {
				if (!l.visible) continue;
				tempCtx.putImageData(
					new ImageData(new Uint8ClampedArray(l.data), w, h),
					0,
					0,
				);
			}
			const ctx = canvas.getContext("2d")!;
			ctx.clearRect(0, 0, w, h);
			ctx.globalAlpha = onionSkinOpacityRef.current / 100;
			ctx.drawImage(temp, 0, 0);
			ctx.globalAlpha = 1;
			return;
		}
		const idx = currentFrameRef.current - 1;
		const prevLayers = frameInstancesRef.current[idx];
		if (idx < 0 || !prevLayers) {
			const ctx = canvas.getContext("2d");
			if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
			return;
		}
		const temp = document.createElement("canvas");
		temp.width = w;
		temp.height = h;
		const tempCtx = temp.getContext("2d")!;
		for (const l of prevLayers) {
			if (!l.visible || l.opacity <= 0) continue;
			tempCtx.globalAlpha = l.opacity / 100;
			tempCtx.drawImage(l.canvas, 0, 0);
		}
		const ctx = canvas.getContext("2d")!;
		ctx.clearRect(0, 0, w, h);
		ctx.globalAlpha = onionSkinOpacityRef.current / 100;
		ctx.drawImage(temp, 0, 0);
		ctx.globalAlpha = 1;
	};

	const SELECTION_HANDLE_SIZE = 8;
	const SELECTION_HANDLE_HIT = 10;
	const ROTATE_HANDLE_OFFSET = 24;
	const ROTATE_HANDLE_RADIUS = 5;
	const ROTATE_HANDLE_HIT = 10;
	const getRotateHandlePos = (sel: {
		x: number;
		y: number;
		w: number;
		h: number;
	}) => ({ x: sel.x + sel.w / 2, y: sel.y - ROTATE_HANDLE_OFFSET });

	const drawSelectionHandle = () => {
		const active =
			layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
		const sel = active?.selection;
		const ctx = oekaki.upperLayer.value?.ctx;
		if (!ctx) return;
		if (!sel || (toolRef.current !== "select" && toolRef.current !== "lasso")) {
			ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
			return;
		}
		const hx = sel.x + sel.w;
		const hy = sel.y + sel.h;
		ctx.save();
		ctx.fillStyle = "#ffffff";
		ctx.strokeStyle = "#000000";
		ctx.lineWidth = 1;
		ctx.fillRect(
			hx - SELECTION_HANDLE_SIZE / 2,
			hy - SELECTION_HANDLE_SIZE / 2,
			SELECTION_HANDLE_SIZE,
			SELECTION_HANDLE_SIZE,
		);
		ctx.strokeRect(
			hx - SELECTION_HANDLE_SIZE / 2,
			hy - SELECTION_HANDLE_SIZE / 2,
			SELECTION_HANDLE_SIZE,
			SELECTION_HANDLE_SIZE,
		);
		const cx = sel.x + sel.w / 2;
		const rot = getRotateHandlePos(sel);
		ctx.beginPath();
		ctx.moveTo(cx, sel.y);
		ctx.lineTo(rot.x, rot.y);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(rot.x, rot.y, ROTATE_HANDLE_RADIUS, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	};

	const isNearSelectionHandle = (
		sel: { x: number; y: number; w: number; h: number },
		x: number,
		y: number,
	) => {
		const hx = sel.x + sel.w;
		const hy = sel.y + sel.h;
		return (
			Math.abs(x - hx) <= SELECTION_HANDLE_HIT &&
			Math.abs(y - hy) <= SELECTION_HANDLE_HIT
		);
	};

	const isNearRotateHandle = (
		sel: { x: number; y: number; w: number; h: number },
		x: number,
		y: number,
	) => {
		const rot = getRotateHandlePos(sel);
		return Math.hypot(x - rot.x, y - rot.y) <= ROTATE_HANDLE_HIT;
	};

	const isInsideSelection = (
		sel: { x: number; y: number; w: number; h: number },
		x: number,
		y: number,
	) => x >= sel.x && x <= sel.x + sel.w && y >= sel.y && y <= sel.y + sel.h;

	const drawLassoPreview = () => {
		const ctx = oekaki.upperLayer.value?.ctx;
		const pts = lassoPointsRef.current;
		if (!ctx || pts.length < 2) return;
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		ctx.save();
		ctx.lineWidth = 1;
		ctx.setLineDash([4, 4]);
		ctx.beginPath();
		pts.forEach(([px, py], i) =>
			i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py),
		);
		ctx.strokeStyle = "#ffffff";
		ctx.stroke();
		ctx.strokeStyle = "#000000";
		ctx.lineDashOffset = 4;
		ctx.stroke();
		ctx.restore();
	};

	const nudge = (dx: number, dy: number) => {
		const active =
			layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
		if (!active) return;
		const dotSize = oekaki.getDotSize();
		const w = active.canvas.width;
		const h = active.canvas.height;
		const src = new Uint8ClampedArray(active.data);
		const dst = new Uint8ClampedArray(src.length);
		const px = dx * dotSize;
		const py = dy * dotSize;
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const sx = x - px;
				const sy = y - py;
				if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
				const si = (sy * w + sx) * 4;
				const di = (y * w + x) * 4;
				dst[di] = src[si];
				dst[di + 1] = src[si + 1];
				dst[di + 2] = src[si + 2];
				dst[di + 3] = src[si + 3];
			}
		}
		active.data = dst;
		active.trace();
		if (walkModeRef.current) {
			walkDataRef.current.set(
				walkActiveIndexRef.current,
				oekaki.render().toDataURL("image/png"),
			);
		}
		updateOnionSkin();
		forceRender((n) => n + 1);
	};

	// Check autosave on mount
	useEffect(() => {
		const autosave = getAutosave<DrawingEditorState>(storageKey);
		if (autosave && autosave.data) {
			Promise.resolve().then(() => {
				setAutosaveData(autosave.data);
				setHasAutosave(true);
			});
		}
	}, [storageKey]);

	const handleRestoreAutosave = () => {
		if (!autosaveData) return;
		setRestoredState(autosaveData);
		setInitKey((k) => k + 1);
		setHasAutosave(false);
		clearAutosave(storageKey);
	};

	const handleIgnoreAutosave = () => {
		setHasAutosave(false);
		clearAutosave(storageKey);
	};

	const handleRestoreHistory = (state: DrawingEditorState) => {
		setRestoredState(state);
		setInitKey((k) => k + 1);
	};

	const syncLayerEntries = () => {
		const entries = oekaki
			.getLayers()
			.map((inst) => ({
				instance: inst,
				name: inst.name,
			}))
			.reverse();
		setLayerEntries(entries);
		layerEntriesRef.current = entries;
	};

	const captureLiveFrames = (): FrameData[] => {
		if (frameInstancesRef.current.length > 0) {
			if (frameInstancesRef.current[currentFrameRef.current]) {
				frameInstancesRef.current[currentFrameRef.current] = oekaki.getLayers();
			}
			return frameInstancesRef.current.map((layers, i) => ({
				id: frameIdsRef.current[i] ?? i + 1,
				layers: layers.map((l) => ({
					name: l.name,
					visible: l.visible,
					locked: l.locked,
					opacity: l.opacity,
					data: new Uint8ClampedArray(l.data),
				})),
			}));
		}
		return [
			{
				id: frameIdsRef.current[0] ?? 1,
				layers: oekaki.getLayers().map((l) => ({
					name: l.name,
					visible: l.visible,
					locked: l.locked,
					opacity: l.opacity,
					data: new Uint8ClampedArray(l.data),
				})),
			},
		];
	};

	const getCurrentState = (): DrawingEditorState | null => {
		const active =
			layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
		if (!active) return null;
		const canvas = active.canvas;
		const w = canvas.width;
		const h = canvas.height;

		if (walkModeRef.current) {
			const prev = walkActiveIndexRef.current;
			const prevLayers = oekaki.getLayers();
			walkLayersRef.current.set(prev, {
				layers: prevLayers.map((l) => ({
					name: l.name,
					visible: l.visible,
					locked: l.locked,
					opacity: l.opacity,
					data: new Uint8ClampedArray(l.data),
				})),
			});
			return {
				mode: "walk",
				width: w,
				height: h,
				gridW,
				gridH,
				zoom,
				walkPreset,
				walkActiveIndex: walkActiveIndexRef.current,
				walkLayers: serializeWalkLayers(walkLayersRef.current, w, h),
			};
		} else if (animMode || frameInstancesRef.current.length > 1) {
			const frames = captureLiveFrames();
			return {
				mode: "anim",
				width: w,
				height: h,
				gridW,
				gridH,
				zoom,
				frames: serializeFrames(frames, w, h),
				currentFrame: currentFrameRef.current,
				fps: fpsRef.current,
			};
		} else {
			return {
				mode: "standard",
				width: w,
				height: h,
				gridW,
				gridH,
				zoom,
				layers: serializeLayers(oekaki.getLayers(), w, h),
			};
		}
	};

	// Periodic autosave (every 10s) and history snapshot (every 30m)
	useEffect(() => {
		const autosaveInterval = setInterval(() => {
			const state = getCurrentState();
			if (state) {
				saveAutosave(storageKey, state);
			}
		}, 10000);

		const historyInterval = setInterval(() => {
			const state = getCurrentState();
			if (state) {
				saveHistory(storageKey, state, "dotdrawing", 50);
			}
		}, 1800000);

		return () => {
			clearInterval(autosaveInterval);
			clearInterval(historyInterval);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [storageKey, animMode, walkMode, zoom, walkActiveIndex, gridH]);

	useEffect(() => {
		const el = mountRef.current;
		if (!el) return;
		el.innerHTML = "";

		const isWalk = restoredState
			? restoredState.mode === "walk"
			: walkModeRef.current;
		const preset =
			(restoredState ? restoredState.walkPreset : walkPresetRef.current) ??
			walkPresetRef.current;
		const canvasW = isWalk
			? Math.floor(CANVAS_SIZE * (preset.w / preset.h))
			: CANVAS_SIZE;
		const canvasH = CANVAS_SIZE;

		const w = restoredState ? restoredState.width : canvasW;
		const h = restoredState ? restoredState.height : canvasH;

		oekaki.init(el, w, h);
		oekaki.flipped.value = false;
		setFlipped(false);
		canvasSizeRef.current = { w, h };
		if (isWalk) {
			oekaki.setDotSize(1, preset.h);
		} else {
			oekaki.setDotSize(1, restoredState ? restoredState.gridH : gridH);
		}

		oekaki.lowerLayer.value?.canvas.classList.add(
			"gimp-checkered-background-white",
		);
		oekaki.upperLayer.value?.canvas.classList.add("upper-canvas");
		oekaki.color.value = colorRef.current;

		const loadCanvasContent = async () => {
			if (restoredState) {
				setGridW(restoredState.gridW);
				setGridH(restoredState.gridH);
				setZoom(restoredState.zoom);

				if (restoredState.mode === "walk" && restoredState.walkLayers) {
					const deserializedWalkLayers = await deserializeWalkLayers(
						restoredState.walkLayers,
						w,
						h,
					);
					walkLayersRef.current = deserializedWalkLayers;

					walkDataRef.current.clear();
					for (const [key, val] of deserializedWalkLayers.entries()) {
						const temp = document.createElement("canvas");
						temp.width = w;
						temp.height = h;
						const tempCtx = temp.getContext("2d");
						if (tempCtx) {
							const id = tempCtx.createImageData(w, h);
							id.data.set(val.layers[0].data);
							tempCtx.putImageData(id, 0, 0);
							walkDataRef.current.set(key, temp.toDataURL("image/png"));
						}
					}

					setWalkPreset(preset);
					setWalkActiveIndex(restoredState.walkActiveIndex || 0);
					walkActiveIndexRef.current = restoredState.walkActiveIndex || 0;
					setWalkMode(true);

					for (const l of oekaki.getLayers()) l.delete();
					oekaki.refresh();
					const cellData = deserializedWalkLayers.get(
						restoredState.walkActiveIndex || 0,
					);
					if (cellData && cellData.layers.length > 0) {
						for (const {
							name,
							visible,
							locked,
							opacity,
							data,
						} of cellData.layers) {
							const l = new oekaki.LayeredCanvas(name);
							l.visible = visible;
							l.locked = locked;
							l.opacity = opacity;
							l.data = new Uint8ClampedArray(data);
						}
					} else {
						new oekaki.LayeredCanvas("レイヤー #1");
					}
				} else if (restoredState.mode === "anim" && restoredState.frames) {
					for (const l of oekaki.getLayers()) l.delete();
					oekaki.refresh();
					const deserializedFrames = await deserializeFrames(
						restoredState.frames,
						w,
						h,
					);
					const instances: oekaki.LayeredCanvas[][] = [];
					const restoredIds: number[] = [];
					for (const f of deserializedFrames) {
						restoredIds.push(f.id ?? (restoredIds.length + 1));
						const frameLayers: oekaki.LayeredCanvas[] = [];
						for (const {
							name,
							visible,
							locked,
							opacity,
							data,
						} of f.layers) {
							const l = new oekaki.LayeredCanvas(name);
							l.visible = visible;
							l.locked = locked;
							l.opacity = opacity;
							l.data = new Uint8ClampedArray(data);
							l.trace();
							frameLayers.push(l);
						}
						instances.push(frameLayers);
					}
					frameInstancesRef.current = instances;
					frameIdsRef.current =
						restoredIds.length > 0 ? restoredIds : [1];
					nextFrameIdRef.current =
						Math.max(...frameIdsRef.current, 0) + 1;
					const targetFrame = Math.max(
						0,
						Math.min(restoredState.currentFrame || 0, instances.length - 1),
					);
					currentFrameRef.current = targetFrame;
					fpsRef.current = restoredState.fps || 8;
					setAnimMode(true);
					if (instances[targetFrame]) {
						oekaki.setLayers(instances[targetFrame]);
					}
				} else if (restoredState.layers) {
					for (const l of oekaki.getLayers()) l.delete();
					oekaki.refresh();
					const deserializedLayers = await deserializeLayers(
						restoredState.layers,
						w,
						h,
					);
					for (const {
						name,
						visible,
						locked,
						opacity,
						data,
					} of deserializedLayers) {
						const l = new oekaki.LayeredCanvas(name);
						l.visible = visible;
						l.locked = locked;
						l.opacity = opacity;
						l.data = new Uint8ClampedArray(data);
					}
					setAnimMode(false);
					frameInstancesRef.current = [];
					frameIdsRef.current = [1];
					nextFrameIdRef.current = 2;
					currentFrameRef.current = 0;
				}
				setRestoredState(null);
			} else {
				if (isWalk) {
					const cellData = walkLayersRef.current.get(
						walkActiveIndexRef.current,
					);
					if (cellData && cellData.layers.length > 0) {
						for (const {
							name,
							visible,
							locked,
							opacity,
							data,
						} of cellData.layers) {
							const l = new oekaki.LayeredCanvas(name);
							l.visible = visible;
							l.locked = locked;
							l.opacity = opacity;
							l.data = new Uint8ClampedArray(data);
						}
					} else {
						new oekaki.LayeredCanvas("レイヤー #1");
					}
					layerCounterRef.current = 2;
				} else {
					new oekaki.LayeredCanvas("レイヤー #1");
					layerCounterRef.current = 2;

					if (collabRef.current) {
						const img = new Image();
						img.crossOrigin = "anonymous";
						img.src = collabRef.current;
						img.onload = () => {
							const layers = oekaki.getLayers();
							const target = layers[0];
							if (target) {
								target.name = "コラボ";
								const ctx = target.ctx;
								ctx.imageSmoothingEnabled = false;
								ctx.clearRect(0, 0, w, h);
								ctx.drawImage(img, 0, 0, w, h);
								target.trace();
							}
							syncLayerEntries();
							setActiveLayerIndex(0);
							activeLayerIndexRef.current = 0;
							frameInstancesRef.current = [oekaki.getLayers()];
							currentFrameRef.current = 0;
							forceRender((n) => n + 1);
						};
					}
				}
			}

			// populate layer entries (topmost first)
			syncLayerEntries();
			updateOnionSkin();
			forceRender((n) => n + 1);
		};

		loadCanvasContent();

		const onionCanvas = document.createElement("canvas");
		onionCanvas.width = w;
		onionCanvas.height = h;
		onionCanvas.style.position = "absolute";
		onionCanvas.style.zIndex = "2";
		onionCanvas.style.left = "0";
		onionCanvas.style.top = "0";
		onionCanvas.style.pointerEvents = "none";
		onionCanvas.style.display = onionSkinRef.current ? "block" : "none";
		const container = el.firstChild as HTMLElement;
		if (container && container.children.length >= 2) {
			container.insertBefore(onionCanvas, container.children[1]);
		}
		onionCanvasRef.current = onionCanvas;

		let px: number | null = null;
		let py: number | null = null;
		let selectDragMode: "new" | "move" | "resize" | "rotate" | null = null;
		let selectStartX = 0;
		let selectStartY = 0;
		let selectAnchorX = 0;
		let selectAnchorY = 0;
		let selectRotateLastAngle = 0;

		oekaki.onDraw((x, y, buttons) => {
			// 複数指タッチ中はペンを動かさない
			if (multiTouchingRef.current) return;
			const active =
				layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
			if (!active?.editable) return;

			if (toolRef.current === "dropper" || (buttons & 2) !== 0) {
				const result = oekaki.dropper(x, y);
				if (result) {
					const [r, g, b, a] = result;
					if (a) {
						const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
						applyColor(hex);
						selectTool("pen");
					} else {
						selectTool("eraser");
					}
				}
				px = null;
				py = null;
				return;
			}

			if (toolRef.current === "select") {
				const sel = active.selection;
				if (selectDragMode === null) {
					if (sel && isNearRotateHandle(sel, x, y)) {
						selectDragMode = "rotate";
						const cx = sel.x + sel.w / 2;
						const cy = sel.y + sel.h / 2;
						selectRotateLastAngle =
							(Math.atan2(y - cy, x - cx) * 180) / Math.PI;
					} else if (sel && isNearSelectionHandle(sel, x, y)) {
						selectDragMode = "resize";
						selectAnchorX = sel.x;
						selectAnchorY = sel.y;
					} else if (sel && isInsideSelection(sel, x, y)) {
						selectDragMode = "move";
					} else {
						selectDragMode = "new";
						selectStartX = x;
						selectStartY = y;
					}
					px = x;
					py = y;
				}
				if (selectDragMode === "rotate") {
					if (!sel) return;
					const cx = sel.x + sel.w / 2;
					const cy = sel.y + sel.h / 2;
					const angle = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
					let deltaAngle = angle - selectRotateLastAngle;
					if (deltaAngle > 180) deltaAngle -= 360;
					if (deltaAngle < -180) deltaAngle += 360;
					active.rotateSelectionByDot(deltaAngle);
					selectRotateLastAngle = angle;
				} else if (selectDragMode === "move") {
					active.moveSelectionByDot(x - px!, y - py!);
				} else if (selectDragMode === "resize") {
					active.resizeSelectionByDot(x - selectAnchorX, y - selectAnchorY);
				} else {
					active.selectByDot(
						selectStartX,
						selectStartY,
						x - selectStartX,
						y - selectStartY,
					);
				}
				drawSelectionHandle();
				px = x;
				py = y;
				return;
			}

			if (toolRef.current === "lasso") {
				lassoPointsRef.current.push([x, y]);
				drawLassoPreview();
				px = x;
				py = y;
				return;
			}

			if (px === null) {
				px = x;
				py = y;
			}
			if (py === null) {
				py = y;
			}
			const points = oekaki.lerp(x, y, px, py);
			if (toolRef.current === "pen") {
				for (const [cx, cy] of points) active.drawByDot(cx, cy);
			} else if (toolRef.current === "eraser") {
				for (const [cx, cy] of points) active.eraseByDot(cx, cy);
			}
			px = x;
			py = y;
		});

		oekaki.onDrawn((x, y) => {
			px = null;
			py = null;
			// 複数指タッチ中に指が離れた場合は、描いていないので履歴も残さない
			if (multiTouchingRef.current) {
				lassoPointsRef.current = [];
				return;
			}
			const active =
				layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
			if (active?.modified()) active.trace();

			if (toolRef.current === "select" && selectDragMode !== null) {
				selectDragMode = null;
				forceRender((n) => n + 1);
			}

			if (toolRef.current === "lasso" && active) {
				if (lassoPointsRef.current.length >= 3) {
					active.selectFreehandByDot(lassoPointsRef.current);
					toolRef.current = "select";
					setTool("select");
					drawSelectionHandle();
				}
				const upperCtx = oekaki.upperLayer.value?.ctx;
				if (upperCtx)
					upperCtx.clearRect(
						0,
						0,
						upperCtx.canvas.width,
						upperCtx.canvas.height,
					);
				lassoPointsRef.current = [];
			}

			if (toolRef.current === "fill") {
				const rgb = colorRef.current
					.slice(1)
					.match(/.{2}/g)
					?.map((v) => parseInt(v, 16));
				if (!rgb) return;
				const active =
					layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
				if (!active) return;
				const fw = active.canvas.width;
				const fh = active.canvas.height;
				const result = oekaki.floodFill(active.data, fw, fh, x, y, [
					rgb[0],
					rgb[1],
					rgb[2],
					255,
				]);
				if (result) active.data = result;
				active.trace();
			}
			updateOnionSkin();
			if (walkModeRef.current) {
				walkDataRef.current.set(
					walkActiveIndexRef.current,
					oekaki.render().toDataURL("image/png"),
				);
			}
			forceRender((n) => n + 1);
		});

		return () => {
			onionCanvasRef.current = null;
			if (mountRef.current) mountRef.current.innerHTML = "";
		};
	}, [initKey]);

	useEffect(() => {
		if (walkModeRef.current) return;
		oekaki.setDotSize(1, gridH);
		document.documentElement.style.setProperty(
			"--grid-cell-size",
			`${oekaki.getDotSize()}px`,
		);
	}, [gridW, gridH]);

	useEffect(() => {
		const el = mountRef.current;
		if (!el) return;
		const correctCoords = (e: PointerEvent) => {
			const canvas = oekaki.upperLayer.value?.canvas;
			if (!canvas) return;
			const rect = canvas.getBoundingClientRect();
			if (rect.width === 0) return;
			const sx = canvas.width / rect.width;
			const sy = canvas.height / rect.height;
			if (sx === 1 && sy === 1) return;
			Object.defineProperty(e, "clientX", {
				value: rect.left + (e.clientX - rect.left) * sx,
				configurable: true,
			});
			Object.defineProperty(e, "clientY", {
				value: rect.top + (e.clientY - rect.top) * sy,
				configurable: true,
			});
		};
		const patchCoalesced = (e: PointerEvent) => {
			for (const ce of e.getCoalescedEvents()) correctCoords(ce);
		};
		const onPointer = (e: PointerEvent) => {
			correctCoords(e);
			patchCoalesced(e);
		};
		const onClick = (e: MouseEvent) => {
			const canvas = oekaki.upperLayer.value?.canvas;
			if (!canvas) return;
			const rect = canvas.getBoundingClientRect();
			if (rect.width === 0) return;
			const sx = canvas.width / rect.width;
			const sy = canvas.height / rect.height;
			if (sx === 1 && sy === 1) return;
			Object.defineProperty(e, "clientX", {
				value: rect.left + (e.clientX - rect.left) * sx,
				configurable: true,
			});
			Object.defineProperty(e, "clientY", {
				value: rect.top + (e.clientY - rect.top) * sy,
				configurable: true,
			});
		};
		el.addEventListener("pointerdown", onPointer, {
			capture: true,
			passive: true,
		});
		el.addEventListener("pointermove", onPointer, {
			capture: true,
			passive: true,
		});
		el.addEventListener("pointerup", onPointer, {
			capture: true,
			passive: true,
		});
		el.addEventListener("click", onClick, { capture: true, passive: true });
		el.addEventListener("auxclick", onClick, { capture: true, passive: true });
		return () => {
			el.removeEventListener("pointerdown", onPointer, { capture: true });
			el.removeEventListener("pointermove", onPointer, { capture: true });
			el.removeEventListener("pointerup", onPointer, { capture: true });
			el.removeEventListener("click", onClick, { capture: true });
			el.removeEventListener("auxclick", onClick, { capture: true });
		};
	}, [zoom]);

	useEffect(() => {
		const upperCanvas = oekaki.upperLayer.value?.canvas;
		if (!upperCanvas) return;
		const onPointerMove = (e: PointerEvent) => {
			if (
				toolRef.current !== "select" ||
				selectDragModeRef.current !== null ||
				e.buttons !== 0
			)
				return;
			const active =
				layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
			const sel = active?.selection;
			if (!sel) {
				upperCanvas.style.cursor = "crosshair";
				return;
			}
			const [x, y] = oekaki.getXY(e);
			if (isNearRotateHandle(sel, x, y)) {
				upperCanvas.style.cursor = "crosshair";
			} else if (isNearSelectionHandle(sel, x, y)) {
				upperCanvas.style.cursor = "nwse-resize";
			} else if (isInsideSelection(sel, x, y)) {
				upperCanvas.style.cursor = "move";
			} else {
				upperCanvas.style.cursor = "crosshair";
			}
			drawSelectionHandle();
		};
		upperCanvas.addEventListener("pointermove", onPointerMove);
		return () => upperCanvas.removeEventListener("pointermove", onPointerMove);
	}, []);

	useEffect(() => {
		const el = canvasAreaRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			setZoom((v) => {
				const next = e.deltaY < 0 ? v + 0.25 : v - 0.25;
				return Math.min(4, Math.max(0.25, Math.round(next * 100) / 100));
			});
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);

	const changeSize = (w: number, h: number) => {
		setGridW(w);
		setGridH(h);
		setShowPresets(false);
	};

	const reloadCollabWithGrid = (newW: number, newH: number) => {
		setGridW(newW);
		setGridH(newH);
		setShowPresets(false);
		if (collabRef.current) {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.src = collabRef.current;
			img.onload = () => {
				for (const l of oekaki.getLayers()) l.delete();
				oekaki.refresh();
				const baseL = new oekaki.LayeredCanvas("コラボ");
				layerCounterRef.current = 2;
				const ctx = baseL.ctx;
				ctx.imageSmoothingEnabled = false;
				const w = canvasSizeRef.current.w || CANVAS_SIZE;
				const h = canvasSizeRef.current.h || CANVAS_SIZE;
				ctx.clearRect(0, 0, w, h);
				ctx.drawImage(img, 0, 0, w, h);
				baseL.trace();
				syncLayerEntries();
				setActiveLayerIndex(0);
				activeLayerIndexRef.current = 0;
				frameInstancesRef.current = [oekaki.getLayers()];
				currentFrameRef.current = 0;
				forceRender((n) => n + 1);
			};
		}
	};

	useEffect(() => {
		if (!walkMode) return;
		if (walkActiveIndex === walkActiveIndexRef.current) return;
		const prev = walkActiveIndexRef.current;
		const prevLayers = oekaki.getLayers();
		walkLayersRef.current.set(prev, {
			layers: prevLayers.map((l) => ({
				name: l.name,
				visible: l.visible,
				locked: l.locked,
				opacity: l.opacity,
				data: new Uint8ClampedArray(l.data),
			})),
		});
		walkActiveIndexRef.current = walkActiveIndex;
		for (const l of oekaki.getLayers()) l.delete();
		oekaki.refresh();
		const cellData = walkLayersRef.current.get(walkActiveIndex);
		if (cellData && cellData.layers.length > 0) {
			for (const { name, visible, locked, opacity, data } of cellData.layers) {
				const l = new oekaki.LayeredCanvas(name);
				l.visible = visible;
				l.locked = locked;
				l.opacity = opacity;
				l.data = new Uint8ClampedArray(data);
			}
		} else {
			new oekaki.LayeredCanvas("レイヤー #1");
		}
		syncLayerEntries();
		updateOnionSkin();
	}, [walkActiveIndex, walkMode]);

	const enterWalkMode = () => {
		if (animMode) exitAnimMode();
		setWalkPreset(walkPresets[1]);
		setWalkActiveIndex(0);
		walkActiveIndexRef.current = 0;
		setWalkMode(true);
		setInitKey((k) => k + 1);
	};

	const exitWalkMode = () => {
		walkLayersRef.current.set(walkActiveIndex, {
			layers: oekaki.getLayers().map((l) => ({
				name: l.name,
				visible: l.visible,
				locked: l.locked,
				opacity: l.opacity,
				data: new Uint8ClampedArray(l.data),
			})),
		});
		walkDataRef.current.clear();
		setWalkMode(false);
		setInitKey((k) => k + 1);
	};

	const selectWalkCell = (index: number) => {
		handleDeselect();
		walkDataRef.current.set(walkActiveIndex, oekaki.render().toDataURL());
		setWalkActiveIndex(index);
	};

	const handleChangeWalkPreset = (preset: WalkPreset) => {
		walkLayersRef.current.clear();
		walkDataRef.current.clear();
		setWalkPreset(preset);
		setWalkActiveIndex(0);
		walkActiveIndexRef.current = 0;
		setInitKey((k) => k + 1);
	};

	const clearCanvas = () => {
		const active =
			layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
		if (!active) return;
		active.clear();
		active.trace();
		forceRender((n) => n + 1);
	};

	const handleUndo = () => {
		layerEntriesRef.current[activeLayerIndexRef.current]?.instance.undo();
		forceRender((n) => n + 1);
	};

	const handleRedo = () => {
		layerEntriesRef.current[activeLayerIndexRef.current]?.instance.redo();
		forceRender((n) => n + 1);
	};

	const selectLayer = (i: number) => {
		handleDeselect();
		setActiveLayerIndex(i);
		activeLayerIndexRef.current = i;
	};

	const addLayer = () => {
		const name = `Layer ${layerCounterRef.current++}`;
		const newLayer = new oekaki.LayeredCanvas(name);
		const newEntry: LayerEntry = { instance: newLayer, name };
		const entries = [newEntry, ...layerEntriesRef.current];
		setLayerEntries(entries);
		layerEntriesRef.current = entries;
		setActiveLayerIndex(0);
		activeLayerIndexRef.current = 0;
	};

	const deleteLayer = (i: number) => {
		const entry = layerEntriesRef.current[i];
		if (!entry) return;
		entry.instance.delete();
		const entries = layerEntriesRef.current.filter((_, idx) => idx !== i);
		setLayerEntries(entries);
		layerEntriesRef.current = entries;
		let newIdx = activeLayerIndexRef.current;
		if (newIdx >= entries.length) newIdx = entries.length - 1;
		if (i < activeLayerIndexRef.current) newIdx--;
		if (newIdx < 0) newIdx = 0;
		setActiveLayerIndex(newIdx);
		activeLayerIndexRef.current = newIdx;
	};

	const reorderLayers = (from: number, to: number) => {
		const entries = [...layerEntriesRef.current];
		const [moved] = entries.splice(from, 1);
		entries.splice(to, 0, moved);
		setLayerEntries(entries);
		layerEntriesRef.current = entries;
		const gLayers = [...entries].reverse().map((e) => e.instance);
		oekaki.setLayers(gLayers);
		let newIdx = activeLayerIndexRef.current;
		if (from === newIdx) {
			newIdx = to;
		} else if (from < newIdx && to >= newIdx) {
			newIdx--;
		} else if (from > newIdx && to <= newIdx) {
			newIdx++;
		}
		setActiveLayerIndex(newIdx);
		activeLayerIndexRef.current = newIdx;
	};

	const toggleVisibility = (i: number) => {
		const entry = layerEntriesRef.current[i];
		if (!entry) return;
		entry.instance.visible = !entry.instance.visible;
		forceRender((n) => n + 1);
	};

	const toggleLock = (i: number) => {
		const entry = layerEntriesRef.current[i];
		if (!entry) return;
		entry.instance.locked = !entry.instance.locked;
		forceRender((n) => n + 1);
	};

	const setLayerOpacity = (i: number, opacity: number) => {
		const entry = layerEntriesRef.current[i];
		if (!entry) return;
		entry.instance.opacity = opacity;
		forceRender((n) => n + 1);
	};

	// ── Animation ──

	const selectFrame = (i: number) => {
		if (i === currentFrameRef.current) return;
		handleDeselect();
		if (frameInstancesRef.current.length === 0) {
			frameInstancesRef.current = [oekaki.getLayers()];
		}
		frameInstancesRef.current[currentFrameRef.current] = oekaki.getLayers();
		currentFrameRef.current = i;
		if (frameInstancesRef.current[i]) {
			oekaki.setLayers(frameInstancesRef.current[i]);
			syncLayerEntries();
		}
		updateOnionSkin();
		forceRender((n) => n + 1);
	};

	const addFrame = () => {
		handleDeselect();
		if (frameInstancesRef.current.length === 0) {
			frameInstancesRef.current = [oekaki.getLayers()];
			frameIdsRef.current = [1];
		}
		frameInstancesRef.current[currentFrameRef.current] = oekaki.getLayers();
		const currentLayers = oekaki.getLayers();
		const newLayers = (
			currentLayers.length > 0
				? currentLayers
				: [{ name: "レイヤー #1", visible: true, locked: false, opacity: 100 }]
		).map((l) => {
			const newL = new oekaki.LayeredCanvas(l.name);
			newL.visible = l.visible;
			newL.locked = l.locked;
			newL.opacity = l.opacity;
			return newL;
		});
		const idx = currentFrameRef.current + 1;
		const newId = nextFrameIdRef.current++;
		frameInstancesRef.current.splice(idx, 0, newLayers);
		frameIdsRef.current.splice(idx, 0, newId);
		currentFrameRef.current = idx;
		oekaki.setLayers(newLayers);
		syncLayerEntries();
		updateOnionSkin();
		forceRender((n) => n + 1);
	};

	const deleteFrame = () => {
		if (frameInstancesRef.current.length <= 1) return;
		handleDeselect();
		frameInstancesRef.current[currentFrameRef.current] = oekaki.getLayers();
		const toDelete = frameInstancesRef.current[currentFrameRef.current];
		toDelete?.forEach((l) => l.delete());
		frameInstancesRef.current.splice(currentFrameRef.current, 1);
		frameIdsRef.current.splice(currentFrameRef.current, 1);
		if (currentFrameRef.current >= frameInstancesRef.current.length)
			currentFrameRef.current = frameInstancesRef.current.length - 1;
		const nextLayers = frameInstancesRef.current[currentFrameRef.current];
		if (nextLayers) {
			oekaki.setLayers(nextLayers);
			syncLayerEntries();
		}
		updateOnionSkin();
		forceRender((n) => n + 1);
	};

	const duplicateFrameAdjacent = () => {
		handleDeselect();
		if (frameInstancesRef.current.length === 0) {
			frameInstancesRef.current = [oekaki.getLayers()];
			frameIdsRef.current = [1];
		}
		frameInstancesRef.current[currentFrameRef.current] = oekaki.getLayers();
		const currentLayers = oekaki.getLayers();
		const dupLayers = currentLayers.map((src) => {
			const dupL = new oekaki.LayeredCanvas(src.name);
			dupL.visible = src.visible;
			dupL.locked = src.locked;
			dupL.opacity = src.opacity;
			dupL.data = new Uint8ClampedArray(src.data);
			dupL.trace();
			return dupL;
		});
		const idx = currentFrameRef.current + 1;
		const newId = nextFrameIdRef.current++;
		frameInstancesRef.current.splice(idx, 0, dupLayers);
		frameIdsRef.current.splice(idx, 0, newId);
		currentFrameRef.current = idx;
		oekaki.setLayers(dupLayers);
		syncLayerEntries();
		updateOnionSkin();
		forceRender((n) => n + 1);
	};

	const duplicateFrameEnd = () => {
		handleDeselect();
		if (frameInstancesRef.current.length === 0) {
			frameInstancesRef.current = [oekaki.getLayers()];
			frameIdsRef.current = [1];
		}
		frameInstancesRef.current[currentFrameRef.current] = oekaki.getLayers();
		const currentLayers = oekaki.getLayers();
		const dupLayers = currentLayers.map((src) => {
			const dupL = new oekaki.LayeredCanvas(src.name);
			dupL.visible = src.visible;
			dupL.locked = src.locked;
			dupL.opacity = src.opacity;
			dupL.data = new Uint8ClampedArray(src.data);
			dupL.trace();
			return dupL;
		});
		const idx = frameInstancesRef.current.length;
		const newId = nextFrameIdRef.current++;
		frameInstancesRef.current.splice(idx, 0, dupLayers);
		frameIdsRef.current.splice(idx, 0, newId);
		currentFrameRef.current = idx;
		oekaki.setLayers(dupLayers);
		syncLayerEntries();
		updateOnionSkin();
		forceRender((n) => n + 1);
	};

	const reorderFrame = (from: number, to: number) => {
		if (
			from === to ||
			from < 0 ||
			to < 0 ||
			from >= frameInstancesRef.current.length ||
			to >= frameInstancesRef.current.length
		)
			return;
		handleDeselect();
		if (frameInstancesRef.current.length === 0) {
			frameInstancesRef.current = [oekaki.getLayers()];
			frameIdsRef.current = [1];
		}
		frameInstancesRef.current[currentFrameRef.current] = oekaki.getLayers();
		const moved = frameInstancesRef.current.splice(from, 1)[0];
		frameInstancesRef.current.splice(to, 0, moved);
		const movedId = frameIdsRef.current.splice(from, 1)[0];
		frameIdsRef.current.splice(to, 0, movedId);

		let newCurrent = currentFrameRef.current;
		if (currentFrameRef.current === from) {
			newCurrent = to;
		} else if (from < currentFrameRef.current && to >= currentFrameRef.current) {
			newCurrent--;
		} else if (from > currentFrameRef.current && to <= currentFrameRef.current) {
			newCurrent++;
		}
		currentFrameRef.current = newCurrent;
		const target = frameInstancesRef.current[newCurrent];
		if (target) {
			oekaki.setLayers(target);
			syncLayerEntries();
		}
		updateOnionSkin();
		forceRender((n) => n + 1);
	};

	const togglePlay = () => {
		if (isPlayingRef.current) {
			if (playTimerRef.current !== null) clearInterval(playTimerRef.current);
			playTimerRef.current = null;
			isPlayingRef.current = false;
			setIsPlaying(false);
		} else {
			handleDeselect();
			if (frameInstancesRef.current.length === 0) {
				frameInstancesRef.current = [oekaki.getLayers()];
			}
			frameInstancesRef.current[currentFrameRef.current] = oekaki.getLayers();
			isPlayingRef.current = true;
			setIsPlaying(true);
			playTimerRef.current = window.setInterval(() => {
				if (frameInstancesRef.current.length <= 1) return;
				const next =
					(currentFrameRef.current + 1) % frameInstancesRef.current.length;
				currentFrameRef.current = next;
				const target = frameInstancesRef.current[next];
				if (target) {
					oekaki.setLayers(target);
					syncLayerEntries();
				}
				updateOnionSkin();
				forceRender((n) => n + 1);
			}, 1000 / fpsRef.current);
		}
	};

	const handleFpsChange = (fps: number) => {
		fpsRef.current = fps;
		if (isPlayingRef.current) {
			if (playTimerRef.current !== null) clearInterval(playTimerRef.current);
			playTimerRef.current = window.setInterval(() => {
				if (frameInstancesRef.current.length <= 1) return;
				const next =
					(currentFrameRef.current + 1) % frameInstancesRef.current.length;
				currentFrameRef.current = next;
				const target = frameInstancesRef.current[next];
				if (target) {
					oekaki.setLayers(target);
					syncLayerEntries();
				}
				updateOnionSkin();
				forceRender((n) => n + 1);
			}, 1000 / fpsRef.current);
		}
	};

	const enterAnimMode = () => {
		if (walkMode) exitWalkMode();
		stopPlayback();
		handleDeselect();
		if (frameInstancesRef.current.length === 0) {
			frameInstancesRef.current = [oekaki.getLayers()];
			currentFrameRef.current = 0;
		} else {
			if (!frameInstancesRef.current[currentFrameRef.current]) {
				currentFrameRef.current = 0;
			}
			const target = frameInstancesRef.current[currentFrameRef.current];
			if (target) {
				oekaki.setLayers(target);
				syncLayerEntries();
			}
		}
		setAnimMode(true);
		updateOnionSkin();
	};

	const exitAnimMode = () => {
		stopPlayback();
		handleDeselect();
		if (frameInstancesRef.current.length > 0) {
			frameInstancesRef.current[currentFrameRef.current] = oekaki.getLayers();
		}
		onionSkinRef.current = false;
		setOnionSkin(false);
		if (onionCanvasRef.current) onionCanvasRef.current.style.display = "none";
		setAnimMode(false);
	};

	const stopPlayback = () => {
		if (playTimerRef.current !== null) clearInterval(playTimerRef.current);
		playTimerRef.current = null;
		isPlayingRef.current = false;
		setIsPlaying(false);
	};

	useEffect(() => {
		return () => {
			if (playTimerRef.current !== null) clearInterval(playTimerRef.current);
		};
	}, []);

	useEffect(() => {
		const el = mountRef.current;
		if (!el) return;
		const onDragOver = (e: DragEvent) => {
			if (!(e.dataTransfer?.types ?? []).some((t) => t === "Files")) return;
			e.preventDefault();
			setIsDragover(true);
		};
		const onDragLeave = () => setIsDragover(false);
		const onDrop = (e: DragEvent) => {
			e.preventDefault();
			setIsDragover(false);
			const file = e.dataTransfer?.files[0];
			if (
				file &&
				(file.type.startsWith("image/") || file.name.endsWith(".cur"))
			) {
				pasteImage(file);
			}
		};
		el.addEventListener("dragover", onDragOver);
		el.addEventListener("dragleave", onDragLeave);
		el.addEventListener("drop", onDrop);
		return () => {
			el.removeEventListener("dragover", onDragOver);
			el.removeEventListener("dragleave", onDragLeave);
			el.removeEventListener("drop", onDrop);
		};
	});

	const handleSave = async () => {
		const state = getCurrentState();
		if (state) {
			saveHistory(storageKey, state, "dotdrawing", 50);
		}
		clearAutosave(storageKey);

		// 歩行グラモード: 今開いている1コマだけでなく、全方向×全フレームの
		// スプライトシートを埋め込む。`walk:` スキームの分割ロジック(lib/walk-cycle.ts)
		// はシート全体のサイズからプリセットを自動判定する前提なので、1コマだけ保存すると
		// 歩行アニメが成立しない。
		if (walkMode) {
			const cells: HTMLCanvasElement[] = [];
			for (let y = 0; y < walkPreset.ways.length; y++) {
				for (let x = 0; x < walkPreset.frames; x++) {
					cells.push(getWalkCellCanvas(y, x));
				}
			}
			const sheet = generateSpriteSheetCanvas({
				columns: walkPreset.frames,
				rows: walkPreset.ways.length,
				cellWidth: walkPreset.w,
				cellHeight: walkPreset.h,
				frames: cells,
			});
			// dotW/dotH は「ドット絵コラボ」再開時の単一キャンバスの解像度に使われる値
			// (app/page.tsx の collabDotSize)。歩行グラの全方向シートをその値で開くと
			// シート全体が1コマ用の小さいグリッドに潰れてコラボが壊れるため渡さない。
			// コマ数/方向数/セルサイズは walkPreset.label から一意に復元できる
			// （lib/walk-cycle.ts の presets）ので、シートの画素サイズから当てにいく
			// detectPreset の "auto" 経路は使わない＝別規格が同じ総ピクセルサイズになる
			// 衝突を踏まない。
			try {
				const { url } = await api.upload.image({
					image: sheet.toDataURL("image/png"),
				});
				onSave(url, undefined, undefined, {
					animFrames: walkPreset.frames,
					animFps: fpsRef.current,
					walkPreset: walkPreset.label,
				});
				return;
			} catch (err) {
				console.error("歩行グラシートのアップロードに失敗しました", err);
				// アップロード失敗時のみ、フォールバックとして dataURL のまま渡す
				onSave(sheet.toDataURL("image/png"), undefined, undefined, {
					animFrames: walkPreset.frames,
					animFps: fpsRef.current,
					walkPreset: walkPreset.label,
				});
				return;
			}
		}

		// アニメモード: 複数フレームあれば横1列のスプライトシートとして書き出す
		// （GIFではなく静止画スプライトシート＝投稿側の想定フォーマット）。
		// scale=1(=1ドット=1px)の等倍で書き出す。表示サイズを大きく見せる処理は
		// 表示側(SpriteImage.tsx)がdotW/dotHを見てCSSで拡大する役目で、ここでは
		// 持たない（ビットマップ自体を拡大して書き出すとR2ストレージ/転送量を無駄に
		// 消費する。dotW/dotH＝ドット数こそがDBに残すべき正の値）。
		if (animMode && frameInstancesRef.current.length > 1) {
			const frameCanvases = getAnimFramesForExport(1);
			if (frameCanvases.length > 1) {
				const targetW = gridW;
				const targetH = gridH;
				try {
					const sheet = generateSpriteSheetCanvas({
						columns: frameCanvases.length,
						rows: 1,
						cellWidth: targetW,
						cellHeight: targetH,
						frames: frameCanvases,
					});
					const { url } = await api.upload.image({
						image: sheet.toDataURL("image/png"),
					});
					onSave(url, gridW, gridH, {
						animFrames: frameCanvases.length,
						animFps: fpsRef.current,
					});
					return;
				} catch (err) {
					console.error(
						"アニメスプライトシートの書き出しに失敗、1枚絵として保存します",
						err,
					);
				}
			}
		}

		// アニメ書き出しと同じ方針: 1ドット=1pxのネイティブ解像度で保存する
		// （DB本体はドット数=gridW/gridHが正。表示用の拡大はSpriteImage側のCSSで行う）。
		// oekaki.render() は作業キャンバス解像度(CANVAS_SIZE基準、数百px)を返すので
		// gridW×gridHへ最近傍縮小してから保存する。
		const rendered = oekaki.render();
		const canvas =
			rendered.width === gridW && rendered.height === gridH
				? rendered
				: resizeCanvas(rendered, gridW, gridH);
		onSave(canvas.toDataURL("image/png"), gridW, gridH);
	};

	const zoomIn = () =>
		setZoom((v) => Math.min(4, Math.round((v + 0.25) * 100) / 100));
	const zoomOut = () =>
		setZoom((v) => Math.max(0.25, Math.round((v - 0.25) * 100) / 100));

	// スマホでの2本指ピンチによるズームは行わない（描画中に不用意に拡大縮小されるため）。
	// ただし複数指タッチの検出自体は残す — 2本目の指がそのまま線として描かれるのを防ぐ必要がある。
	// ズームはツールバーのボタンとPCのホイールから操作する。
	const handleMultiTouchPointerDown = (e: React.PointerEvent) => {
		multiTouchPointsRef.current.set(e.pointerId, {
			x: e.clientX,
			y: e.clientY,
		});
		// 1本目の指はそのまま描画が始まってしまうため、内容を控えておき、
		// 2本目が触れた時点で巻き戻して描き込みを無かったことにする。
		if (multiTouchPointsRef.current.size === 1 && e.pointerType === "touch") {
			const active =
				layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
			strokeSnapshotRef.current = active?.editable
				? { layer: active, data: active.data }
				: null;
		}
		if (multiTouchPointsRef.current.size >= 2) {
			multiTouchingRef.current = true;
			const snapshot = strokeSnapshotRef.current;
			if (snapshot) {
				snapshot.layer.data = snapshot.data;
				strokeSnapshotRef.current = null;
			}
		}
	};

	const handleMultiTouchPointerMove = (e: React.PointerEvent) => {
		if (!multiTouchPointsRef.current.has(e.pointerId)) return;
		multiTouchPointsRef.current.set(e.pointerId, {
			x: e.clientX,
			y: e.clientY,
		});
	};

	// キャンバス外（ツールバー上など）で指が離れると要素側の pointerup を取りこぼし、
	// 複数指フラグが立ちっぱなしで描けなくなるため、window側でも後始末する。
	useEffect(() => {
		const release = (e: PointerEvent) => {
			if (!multiTouchPointsRef.current.delete(e.pointerId)) return;
			if (multiTouchPointsRef.current.size === 0) {
				multiTouchingRef.current = false;
				strokeSnapshotRef.current = null;
			}
		};
		window.addEventListener("pointerup", release);
		window.addEventListener("pointercancel", release);
		return () => {
			window.removeEventListener("pointerup", release);
			window.removeEventListener("pointercancel", release);
		};
	}, []);

	const handleMultiTouchPointerUp = (e: React.PointerEvent) => {
		multiTouchPointsRef.current.delete(e.pointerId);
		// 指が全部離れるまでは描画を再開しない（1本残った指で線が出るのを防ぐ）
		if (multiTouchPointsRef.current.size === 0) {
			multiTouchingRef.current = false;
			strokeSnapshotRef.current = null;
		}
	};

	useEffect(() => {
		const onCopy = (e: ClipboardEvent) => {
			if (notDrawing(e)) return;
			e.preventDefault();
			handleCopy();
		};

		const handler = (e: KeyboardEvent) => {
			if (notDrawing(e)) return;
			const active =
				layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
			if (e.ctrlKey || e.metaKey) {
				const key = e.key.toLowerCase();
				if (key === "z" || e.code === "KeyZ") {
					e.preventDefault();
					if (e.shiftKey) {
						handleRedo();
					} else {
						handleUndo();
					}
					return;
				}
				if (key === "s" || e.code === "KeyS") {
					e.preventDefault();
					handleSave();
					return;
				}
				if (key === "c" || e.code === "KeyC") {
					e.preventDefault();
					handleCopy();
					return;
				}
				if (key === "x" || e.code === "KeyX") {
					e.preventDefault();
					handleCut();
					return;
				}
				return;
			}
			if (active?.selection) {
				if (e.key === "Delete" || e.key === "Backspace") {
					e.preventDefault();
					active.deleteSelection();
					if (active.modified()) active.trace();
					forceRender((n) => n + 1);
					return;
				} else if (e.key === "Escape") {
					e.preventDefault();
					handleDeselect();
					return;
				} else if (
					["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
				) {
					e.preventDefault();
					const step = oekaki.getDotSize() || 1;
					const dx =
						e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
					const dy =
						e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
					active.moveSelection(dx, dy);
					if (active.modified()) active.trace();
					drawSelectionHandle();
					return;
				} else if (e.key === "[" || e.key === "]") {
					e.preventDefault();
					const rotateStep = 90;
					const deltaAngle = e.key === "[" ? -rotateStep : rotateStep;
					active.rotateSelectionByDot(deltaAngle);
					if (active.modified()) active.trace();
					drawSelectionHandle();
					return;
				}
			}
			switch (e.key) {
				case "1":
					selectTool("pen");
					break;
				case "2":
					selectTool("eraser");
					break;
				case "3":
					selectTool("dropper");
					break;
				case "4":
					selectTool("fill");
					break;
				case "5":
					selectTool("select");
					break;
				case "6":
					selectTool("lasso");
					break;
				case "b":
					zoomIn();
					break;
				case "n":
					zoomOut();
					break;
			}
		};
		window.addEventListener("copy", onCopy);
		window.addEventListener("paste", handlePaste);
		window.addEventListener("keydown", handler);
		return () => {
			window.removeEventListener("copy", onCopy);
			window.removeEventListener("paste", handlePaste);
			window.removeEventListener("keydown", handler);
		};
	}, []);

	const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
		<button
			onClick={() => selectTool(t)}
			className={
				"w-8 h-8 rounded-lg flex items-center justify-center transition-colors " +
				(tool === t
					? "bg-blue-600 text-white shadow"
					: "bg-gray-100/10 text-gray-300 hover:bg-gray-100/20")
			}
			title={label}
		>
			{icon}
		</button>
	);

	return (
		<div className="fixed inset-0 bg-[#0f0f11] z-50 flex flex-col select-none">
			<div className="flex items-center px-3.5 py-2 border-b border-gray-800 shrink-0 bg-[#0f0f11] gap-2">
				<button
					onClick={onClose}
					className="text-gray-400 hover:bg-gray-100/10 p-1.5 rounded transition-colors"
				>
					<X size={20} />
				</button>
				<span className="font-bold text-xs text-gray-300">キャンセル</span>
				<span className="text-gray-600 text-[10px]">›</span>
				<div className="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5">
					<button
						onClick={() => {
							if (animMode) exitAnimMode();
							if (walkMode) exitWalkMode();
						}}
						className={
							"px-3 py-1 rounded-md text-[11px] font-medium transition-colors " +
							(!animMode && !walkMode
								? "bg-blue-600 text-white shadow-sm"
								: "text-gray-400 hover:text-gray-200")
						}
					>
						一枚絵
					</button>
					<button
						onClick={() => {
							if (walkMode) exitWalkMode();
							enterAnimMode();
						}}
						className={
							"px-3 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 " +
							(animMode
								? "bg-blue-600 text-white shadow-sm"
								: "text-gray-400 hover:text-gray-200")
						}
					>
						<Film size={12} />
						アニメ
					</button>
					<button
						onClick={() => {
							if (animMode) exitAnimMode();
							enterWalkMode();
						}}
						className={
							"px-3 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 " +
							(walkMode
								? "bg-blue-600 text-white shadow-sm"
								: "text-gray-400 hover:text-gray-200")
						}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="w-3 h-3"
						>
							<path d="M13 4a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" />
							<path d="M4 20h3l2-6 3-2 2 6 3 3" />
							<path d="M8 5 6 9l2 3" />
							<path d="M16 5l2 3-1 4" />
						</svg>
						歩行グラ
					</button>
				</div>
				<div className="ml-auto flex items-center space-x-2">
					{walkMode ? (
						<span className="text-[9px] text-gray-600">
							{walkPreset.w}×{walkPreset.h} / {walkPreset.frames}fr /{" "}
							{walkPreset.ways.length}方向
						</span>
					) : (
						<span className="text-[9px] text-gray-600">
							{gridW}×{gridH}
						</span>
					)}
					{/* 設定ボタン & ドロップダウン */}
					<div className="relative" ref={settingsRef}>
						<button
							onClick={() => setSettingsOpen((v) => !v)}
							className={`p-1.5 rounded transition-colors ${
								settingsOpen
									? "bg-gray-700 text-white"
									: "text-gray-400 hover:bg-gray-800 hover:text-white"
							}`}
							title="設定"
						>
							<Settings size={14} />
						</button>
						{settingsOpen && (
							<div className="absolute right-0 top-full mt-1 z-[100] w-56 bg-[#161622] border border-gray-700 shadow-2xl p-2 rounded-lg space-y-1">
								{/* 履歴 */}
								<button
									onClick={() => {
										setShowHistory(true);
										setSettingsOpen(false);
									}}
									className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white rounded transition"
								>
									<History size={13} />
									<span>履歴・スナップショット</span>
								</button>
								<div className="border-t border-gray-800 my-1" />
								{/* 出力・ダウンロード */}
								<button
									onClick={() => {
										setShowExportDialog(true);
										setSettingsOpen(false);
									}}
									className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white rounded transition"
								>
									<Download size={13} />
									<span>
										{walkMode
											? "歩行グラの出力"
											: animMode
												? "アニメーションの出力"
												: "画像の出力"}
									</span>
								</button>

								{/* リサイズ（一枚絵・アニメ時のみ） */}
								{!walkMode && (
									<>
										<div className="border-t border-gray-800 my-1" />
										<div className="px-3 py-1 text-[10px] text-gray-400 font-bold flex items-center gap-1">
											<Maximize2 size={11} />
											<span>キャンバスサイズ変更</span>
										</div>
										{collabImageUrl && (
											<div className="text-[9px] text-orange-400 px-3 pb-1">
												※コラボ画像を再配置して開き直します
											</div>
										)}
										<div className="grid grid-cols-4 gap-1 px-2 py-1">
											{SIZE_PRESETS.map((p) => (
												<button
													key={p.label}
													onClick={() => {
														if (collabImageUrl) {
															reloadCollabWithGrid(p.w, p.h);
														} else {
															changeSize(p.w, p.h);
														}
														setSettingsOpen(false);
													}}
													className={
														"px-1 py-1 rounded text-[10px] font-mono transition " +
														(gridW === p.w && gridH === p.h
															? "bg-blue-600 text-white font-bold"
															: "bg-gray-800 text-gray-300 hover:bg-gray-700")
													}
												>
													{p.label}
												</button>
											))}
										</div>
									</>
								)}

								<div className="border-t border-gray-800 my-1" />
								{/* 読込 */}
								<button
									onClick={() => {
										setShowImport(true);
										setSettingsOpen(false);
									}}
									className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white rounded transition"
								>
									<Upload size={13} />
									<span>画像の読込 (インポート)</span>
								</button>
							</div>
						)}
					</div>
				</div>
			</div>

			{hasAutosave && (
				<div className="bg-yellow-600/20 border-b border-yellow-800/30 px-4 py-2 flex items-center justify-between text-xs text-yellow-200 shrink-0">
					<span className="flex items-center gap-1.5">
						⚠️ 未保存のデータ（自動保存）があります。復元しますか？
					</span>
					<div className="flex gap-2">
						<button
							onClick={handleRestoreAutosave}
							className="bg-yellow-600 hover:bg-yellow-500 text-gray-900 font-bold px-3 py-1 rounded text-[10px] active:scale-95 transition-transform"
						>
							復元する
						</button>
						<button
							onClick={handleIgnoreAutosave}
							className="text-gray-400 hover:text-gray-200 px-2 py-1 rounded text-[10px]"
						>
							無視
						</button>
					</div>
				</div>
			)}

			<div
				ref={canvasAreaRef}
				className={
					"flex-1 flex items-center justify-center bg-[#1a1b26] m-3 mb-1 rounded-xl border border-gray-800 shadow-inner overflow-hidden p-4" +
					(isDragover ? " ring-4 ring-blue-400/60" : "")
				}
				onPointerDown={handleMultiTouchPointerDown}
				onPointerMove={handleMultiTouchPointerMove}
				onPointerUp={handleMultiTouchPointerUp}
				onPointerCancel={handleMultiTouchPointerUp}
				onContextMenu={(e) => e.preventDefault()}
			>
				<div
					ref={mountRef}
					className="inline-block unj-canvas-grid"
					style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
				/>
			</div>

			{/* eslint-disable react-hooks/refs */}
			{animMode && (
				// フレーム数・現在フレーム・fps は毎フレームの高頻度更新を避けるため意図的に ref + forceRender
				// で管理しており(各更新箇所で forceRender を呼びfresh値を反映)、ここでの ref 読み取りは安全。
				<AnimationBar
					frames={getEditorFrames(
						frameInstancesRef.current,
						frameIdsRef.current,
						oekaki.getLayers(),
						currentFrameRef.current,
					)}
					currentFrame={currentFrameRef.current}
					fps={fpsRef.current}
					isPlaying={isPlaying}
					onSelectFrame={selectFrame}
					onAddFrame={addFrame}
					onDeleteFrame={deleteFrame}
					onDuplicateFrameAdjacent={duplicateFrameAdjacent}
					onDuplicateFrameEnd={duplicateFrameEnd}
					onReorderFrame={reorderFrame}
					onTogglePlay={togglePlay}
					onFpsChange={handleFpsChange}
					onionSkin={onionSkin}
					onionSkinOpacity={onionSkinOpacity}
					onToggleOnionSkin={toggleOnionSkin}
					onOnionSkinOpacityChange={handleOnionSkinOpacityChange}
					onExit={exitAnimMode}
				/>
			)}
			{/* eslint-enable react-hooks/refs */}

			{walkMode && (
				<WalkCyclePanel
					preset={walkPreset}
					activeIndex={walkActiveIndex}
					// dataUrlByIndex も同様に ref + forceRender で高頻度更新を避ける意図的な設計。
					// eslint-disable-next-line react-hooks/refs
					dataUrlByIndex={walkDataRef.current}
					onSelectCell={selectWalkCell}
					onChangePreset={handleChangeWalkPreset}
					onionSkin={onionSkin}
					onionSkinOpacity={onionSkinOpacity}
					onToggleOnionSkin={toggleOnionSkin}
					onOnionSkinOpacityChange={handleOnionSkinOpacityChange}
					onNudge={nudge}
				/>
			)}

			<div className="px-3.5 pb-4 pt-2.5 space-y-2.5 shrink-0 bg-[#0f0f11] border-t border-gray-900">
				<div className="flex items-center space-x-1.5">
					{toolBtn("pen", <Pen size={13} />, "ペン (1)")}
					{toolBtn("eraser", <Eraser size={13} />, "消しゴム (2)")}
					{toolBtn("dropper", <Pipette size={13} />, "スポイト (3)")}
					{toolBtn("fill", <PaintBucket size={13} />, "塗りつぶし (4)")}
					{toolBtn("select", <BoxSelect size={13} />, "範囲選択 (5)")}
					{toolBtn("lasso", <LassoSelect size={13} />, "自由選択 (6)")}
					<div className="w-px h-5 bg-gray-800 mx-1" />
					<button
						onClick={zoomOut}
						className="w-6 h-6 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 text-xs hover:bg-gray-100/20"
						title="ズームアウト (N)"
					>
						−
					</button>
					<span className="text-[10px] text-gray-400 w-8 text-center font-mono">
						{Math.round(zoom * 100)}%
					</span>
					<button
						onClick={zoomIn}
						className="w-6 h-6 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 text-xs hover:bg-gray-100/20"
						title="ズームイン (B)"
					>
						+
					</button>
					<button
						onClick={() => setShowLayerPanel((v) => !v)}
						className={
							"w-8 h-8 rounded-lg flex items-center justify-center transition-colors " +
							(showLayerPanel
								? "bg-blue-600 text-white shadow"
								: "bg-gray-100/10 text-gray-300 hover:bg-gray-100/20")
						}
						title="レイヤー"
					>
						<Layers size={13} />
					</button>
					<button
						onClick={() => {
							oekaki.flipped.value = !oekaki.flipped.value;
							setFlipped(oekaki.flipped.value);
						}}
						className={
							"w-8 h-8 rounded-lg flex items-center justify-center transition-colors " +
							(flipped
								? "bg-blue-600 text-white shadow"
								: "bg-gray-100/10 text-gray-300 hover:bg-gray-100/20")
						}
						title="左右反転"
					>
						<FlipHorizontal size={13} />
					</button>
				</div>

				{(tool === "select" || tool === "lasso") && (
					<div className="flex items-center space-x-1">
						<span className="text-[10px] text-gray-500">
							クリック&ドラッグで範囲選択
						</span>
					</div>
				)}

				<div className="flex items-center space-x-1.5">
					<div
						className="relative shrink-0 w-7 h-7 rounded border border-gray-600 overflow-hidden"
						style={{ backgroundColor: color }}
					/>
					<input
						type="color"
						value={color}
						onChange={(e) => applyColor(e.target.value)}
						className="w-7 h-7 rounded border border-gray-700 cursor-pointer bg-transparent"
					/>
					<div className="flex flex-wrap gap-0.5 flex-1">
						{PALETTE_PICO8.map((c) => (
							<button
								key={c}
								className={
									"w-4 h-4 rounded-sm border " +
									(color === c
										? "border-white scale-110"
										: "border-gray-700/50") +
									" transition-transform"
								}
								style={{ backgroundColor: c }}
								onClick={() => applyColor(c)}
							/>
						))}
					</div>
				</div>
				{recentColors.length > 0 && (
					<div className="flex items-center space-x-1.5">
						<span className="text-[9px] text-gray-600 shrink-0">履歴</span>
						<div className="flex flex-wrap gap-0.5">
							{recentColors.map((c) => (
								<button
									key={c}
									className="w-4 h-4 rounded-sm border border-gray-700/50 hover:scale-110 transition-transform"
									style={{ backgroundColor: c }}
									onClick={() => applyColor(c)}
								/>
							))}
						</div>
					</div>
				)}

				{(tool === "select" || tool === "lasso") && (
					<div className="flex items-center space-x-1">
						<button
							onClick={handleCopy}
							className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] hover:bg-gray-100/20"
							title="選択範囲をコピー (Ctrl+C)"
						>
							<Copy size={10} />
							<span>コピー</span>
						</button>
						<button
							onClick={handleCut}
							className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] hover:bg-gray-100/20"
							title="選択範囲を削除 (Delete)"
						>
							<Trash2 size={10} />
							<span>削除</span>
						</button>
						<div className="w-px h-4 bg-gray-800 mx-1" />
						<button
							onClick={() => {
								const active =
									layerEntriesRef.current[activeLayerIndexRef.current]
										?.instance;
								if (!active?.selection) return;
								active.rotateSelectionByDot(-90);
								if (active.modified()) active.trace();
								drawSelectionHandle();
								forceRender((n) => n + 1);
							}}
							className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] hover:bg-gray-100/20"
							title="反時計回りに回転"
						>
							<RotateCcw size={10} />
							<span>回転</span>
						</button>
						<button
							onClick={() => {
								const active =
									layerEntriesRef.current[activeLayerIndexRef.current]
										?.instance;
								if (!active?.selection) return;
								active.rotateSelectionByDot(90);
								if (active.modified()) active.trace();
								drawSelectionHandle();
								forceRender((n) => n + 1);
							}}
							className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] hover:bg-gray-100/20"
							title="時計回りに回転"
						>
							<RotateCw size={10} />
							<span>回転</span>
						</button>
						<div className="w-px h-4 bg-gray-800 mx-1" />
						<button
							onClick={handleDeselect}
							className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] hover:bg-gray-100/20"
							title="選択範囲を解除 (Esc)"
						>
							<X size={10} />
							<span>解除</span>
						</button>
					</div>
				)}

				<div className="flex justify-between items-center">
					<div className="flex space-x-1.5">
						<button
							onClick={clearCanvas}
							className="px-2 h-6 rounded bg-red-950/20 text-red-400 border border-red-900/30 flex items-center space-x-1 text-[9px]"
						>
							<Trash2 size={10} />
							<span>クリア</span>
						</button>
						<button
							onClick={() => setShowExportDialog(true)}
							className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] hover:bg-gray-100/20"
							title="出力・ダウンロード"
						>
							<Download size={10} />
							<span>出力</span>
						</button>
						<button
							onClick={() => setShowImport(true)}
							className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] hover:bg-gray-100/20"
						>
							<Upload size={10} />
							<span>読込</span>
						</button>
						<button
							onClick={() => setShowHistory(true)}
							className="px-2 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center space-x-1 text-[9px] transition-colors"
						>
							<History size={10} />
							<span>履歴</span>
						</button>
						<button
							onClick={handleUndo}
							className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] disabled:opacity-40"
						>
							<Undo size={10} />
							<span>戻る</span>
						</button>
						<button
							onClick={handleRedo}
							className="px-2 h-6 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[9px] disabled:opacity-40"
						>
							<Redo size={10} />
							<span>進む</span>
						</button>
					</div>
					<button
						onClick={handleSave}
						className="h-6 rounded bg-[#1db854] hover:bg-[#1ed760] text-gray-900 font-bold flex items-center space-x-1 px-3 text-[9px] transition-colors"
					>
						<Save size={10} />
						<span>投稿する</span>
					</button>
				</div>
			</div>
			{showLayerPanel && (
				<LayerPanel
					layers={layerEntries}
					activeIndex={activeLayerIndex}
					onSelect={selectLayer}
					onReorder={reorderLayers}
					onToggleVisibility={toggleVisibility}
					onToggleLock={toggleLock}
					onOpacityChange={setLayerOpacity}
					onAdd={addLayer}
					onDelete={deleteLayer}
					onClose={() => setShowLayerPanel(false)}
				/>
			)}
			<ImportDialog
				open={showImport}
				onClose={() => setShowImport(false)}
				onImport={handleImport}
				walkMode={walkMode}
				walkPresets={walkPresets}
			/>
			<HistoryModal
				isOpen={showHistory}
				onClose={() => setShowHistory(false)}
				storageKey={storageKey}
				type="dotdrawing"
				onRestore={handleRestoreHistory}
				getCurrentData={getCurrentState}
			/>
			{/* eslint-disable react-hooks/refs */}
			<DrawingExportDialog
				open={showExportDialog}
				onClose={() => setShowExportDialog(false)}
				mode={walkMode ? "walk" : animMode ? "anim" : "standard"}
				isDotEditor={true}
				gridW={gridW}
				gridH={gridH}
				fps={fpsRef.current}
				walkPreset={walkPreset}
				walkActiveWayIndex={Math.floor(walkActiveIndex / walkPreset.frames)}
				onExportSinglePng={handleExportSinglePng}
				onExportSpriteSheet={handleExportAnimSpriteSheet}
				onExportGif={handleExportAnimGif}
				onExportZip={handleExportAnimZip}
				onExportWalkSpriteSheet={handleExportWalkSpriteSheet}
				onExportWalkGif={handleExportWalkGif}
				onExportWalkZip={handleExportWalkZip}
				onExportWalkAni={handleExportWalkAni}
			/>
			{/* eslint-enable react-hooks/refs */}
		</div>
	);
}
