"use client";

import * as oekaki from "@onjmin/oekaki";
import {
	BoxSelect,
	Brush,
	Copy,
	Eraser,
	Film,
	FlipHorizontal,
	Grid3x3,
	History,
	LassoSelect,
	Layers,
	PaintBucket,
	Pen,
	Pipette,
	Redo,
	RotateCcw,
	RotateCw,
	Save,
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
	getAutosave,
	getStorageKey,
	saveAutosave,
	saveHistory,
	serializeFrames,
	serializeLayers,
} from "@/lib/history";
import type { FrameData } from "./AnimationBar";
import AnimationBar from "./AnimationBar";
import HistoryModal from "./HistoryModal";
import ImportDialog from "./ImportDialog";
import type { LayerEntry } from "./LayerPanel";
import LayerPanel from "./LayerPanel";

interface DrawingEditorProps {
	onClose: () => void;
	onSave: (data: string) => void;
	collabImageUrl?: string;
}

type Tool =
	| "pen"
	| "brush"
	| "eraser"
	| "dropper"
	| "fill"
	| "select"
	| "lasso";

const PRESET_COLORS = [
	"#000000",
	"#ffffff",
	"#ef4444",
	"#f97316",
	"#eab308",
	"#22c55e",
	"#3b82f6",
	"#8b5cf6",
	"#6b7280",
	"#ec4899",
	"#f43f5e",
	"#14b8a6",
	"#facc15",
	"#fed7aa",
	"#60a5fa",
	"#a855f7",
	"#1e293b",
	"#475569",
	"#94a3b8",
	"#cbd5e1",
	"#f8fafc",
	"#dc2626",
	"#ea580c",
	"#ca8a04",
];

export default function DrawingEditor({
	onClose,
	onSave,
	collabImageUrl,
}: DrawingEditorProps) {
	const mountRef = useRef<HTMLDivElement>(null);
	const canvasAreaRef = useRef<HTMLDivElement>(null);
	const toolRef = useRef<Tool>("pen");
	const colorRef = useRef("#ffffff");
	const collabRef = useRef(collabImageUrl);
	const [tool, setTool] = useState<Tool>("pen");
	const [color, setColor] = useState("#000000");
	const [penSize, setPenSize] = useState(4);
	const [brushSize, setBrushSize] = useState(12);
	const [eraserSize, setEraserSize] = useState(20);
	const [showGrid, setShowGrid] = useState(false);
	const [recentColors, setRecentColors] = useState<string[]>([]);
	const [layerEntries, setLayerEntries] = useState<LayerEntry[]>([]);
	const [activeLayerIndex, setActiveLayerIndex] = useState(0);
	const [showLayerPanel, setShowLayerPanel] = useState(false);
	const layerCounterRef = useRef(1);
	const layerEntriesRef = useRef<LayerEntry[]>([]);
	const activeLayerIndexRef = useRef(0);
	const [animMode, setAnimMode] = useState(false);
	const framesRef = useRef<FrameData[]>([]);
	const currentFrameRef = useRef(0);
	const fpsRef = useRef(8);
	const [isPlaying, setIsPlaying] = useState(false);
	const isPlayingRef = useRef(false);
	const playTimerRef = useRef<number | null>(null);
	const [, forceRender] = useState(0);
	const [showImport, setShowImport] = useState(false);
	const onionSkinRef = useRef(false);
	const onionSkinOpacityRef = useRef(20);
	const onionCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const [onionSkin, setOnionSkin] = useState(false);
	const [onionSkinOpacity, setOnionSkinOpacity] = useState(20);
	const [zoom, setZoom] = useState(1);
	const [flipped, setFlipped] = useState(false);
	const canvasSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
	const internalClipboardRef = useRef<HTMLCanvasElement | null>(null);
	const selectDragModeRef = useRef<"new" | "resize" | "move" | "rotate" | null>(
		null,
	);
	const lassoPointsRef = useRef<[number, number][]>([]);
	const selectRotateAngleRef = useRef(0);

	// History & Autosave States
	const [showHistory, setShowHistory] = useState(false);
	const [hasAutosave, setHasAutosave] = useState(false);
	const [autosaveData, setAutosaveData] = useState<DrawingEditorState | null>(
		null,
	);
	const [restoredState, setRestoredState] = useState<DrawingEditorState | null>(
		null,
	);
	const [initKey, setInitKey] = useState(0);
	const storageKey = getStorageKey("drawing");
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

	const lastDrawToolRef = useRef<"pen" | "brush">("pen");

	useEffect(() => {
		toolRef.current = tool;
		colorRef.current = color;
		if (tool === "pen" || tool === "brush") {
			lastDrawToolRef.current = tool;
		}
	});

	const currentSize =
		tool === "brush" ? brushSize : tool === "eraser" ? eraserSize : penSize;

	const notDrawing = (e: Event) => {
		const target = e.target as HTMLElement | null;
		if (!target) return false;
		return (
			target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.isContentEditable
		);
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
			const nextTool = lastDrawToolRef.current || "pen";
			selectTool(nextTool);
		}
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
		const idx = currentFrameRef.current - 1;
		if (idx < 0 || !framesRef.current[idx]) {
			const ctx = canvas.getContext("2d");
			if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
			return;
		}
		const prev = framesRef.current[idx];
		const w = canvas.width,
			h = canvas.height;
		const temp = document.createElement("canvas");
		temp.width = w;
		temp.height = h;
		const tempCtx = temp.getContext("2d")!;
		for (const l of prev.layers) {
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

	const captureFrame = (): FrameData => ({
		layers: oekaki.getLayers().map((l) => ({
			name: l.name,
			visible: l.visible,
			locked: l.locked,
			opacity: l.opacity,
			data: new Uint8ClampedArray(l.data),
		})),
	});

	const applyFrame = (frame: FrameData) => {
		for (const l of oekaki.getLayers()) l.delete();
		oekaki.refresh();
		for (const { name, visible, locked, opacity, data } of frame.layers) {
			const l = new oekaki.LayeredCanvas(name);
			l.visible = visible;
			l.locked = locked;
			l.opacity = opacity;
			l.data = new Uint8ClampedArray(data);
		}
		syncLayerEntries();
	};

	const getCurrentState = (): DrawingEditorState | null => {
		const active =
			layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
		if (!active) return null;
		const canvas = active.canvas;
		const w = canvas.width;
		const h = canvas.height;
		if (animMode) {
			framesRef.current[currentFrameRef.current] = captureFrame();
			return {
				mode: "anim",
				width: w,
				height: h,
				gridW: 32,
				gridH: 32,
				zoom,
				frames: serializeFrames(framesRef.current, w, h),
				currentFrame: currentFrameRef.current,
				fps: fpsRef.current,
			};
		} else {
			return {
				mode: "standard",
				width: w,
				height: h,
				gridW: 32,
				gridH: 32,
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
				saveHistory(storageKey, state, "drawing", 50);
			}
		}, 1800000);

		return () => {
			clearInterval(autosaveInterval);
			clearInterval(historyInterval);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [storageKey, animMode, zoom]);

	useEffect(() => {
		const el = mountRef.current;
		if (!el) return;
		const parent = el.parentElement;
		const availW = parent ? parent.clientWidth : 640;
		const availH = parent ? parent.clientHeight : 480;
		const cap = 1024;

		const w = restoredState ? restoredState.width : Math.min(availW, cap) | 0;
		const h = restoredState ? restoredState.height : Math.min(availH, cap) | 0;
		el.innerHTML = "";
		oekaki.init(el, w, h);
		oekaki.flipped.value = false;
		setFlipped(false);
		canvasSizeRef.current = { w, h };

		oekaki.lowerLayer.value?.canvas.classList.add(
			"gimp-checkered-background-white",
		);
		oekaki.upperLayer.value?.canvas.classList.add("upper-canvas");
		oekaki.color.value = colorRef.current;
		oekaki.penSize.value = penSize;
		oekaki.brushSize.value = brushSize;
		oekaki.eraserSize.value = eraserSize;

		const loadCanvasContent = async () => {
			if (restoredState) {
				if (restoredState.mode === "anim" && restoredState.frames) {
					const deserializedFrames = await deserializeFrames(
						restoredState.frames,
						w,
						h,
					);
					framesRef.current = deserializedFrames;
					currentFrameRef.current = restoredState.currentFrame || 0;
					fpsRef.current = restoredState.fps || 8;
					setAnimMode(true);
					applyFrame(deserializedFrames[currentFrameRef.current]);
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
					syncLayerEntries();
				}
				setRestoredState(null);
			} else {
				new oekaki.LayeredCanvas("レイヤー #1");
				layerCounterRef.current = 2;

				// collaboration: load existing image as base layer
				if (collabRef.current) {
					const img = new Image();
					img.crossOrigin = "anonymous";
					img.src = collabRef.current;
					img.onload = () => {
						const layers = oekaki.getLayers();
						const target = layers[0];
						if (target) {
							target.name = "コラボ";
							target.paste(img);
							target.trace();
							new oekaki.LayeredCanvas("レイヤー #2");
							layerCounterRef.current = 3;
						}
						// re-populate layer entries
						const updated: LayerEntry[] = oekaki
							.getLayers()
							.map((inst) => ({
								instance: inst,
								name: inst.name,
							}))
							.reverse();
						setLayerEntries(updated);
						layerEntriesRef.current = updated;
						setActiveLayerIndex(0);
						activeLayerIndexRef.current = 0;
					};
				}
			}

			// populate layer entries (topmost first)
			const initEntries: LayerEntry[] = oekaki
				.getLayers()
				.map((inst) => ({
					instance: inst,
					name: inst.name,
				}))
				.reverse();
			setLayerEntries(initEntries);
			layerEntriesRef.current = initEntries;
			setActiveLayerIndex(0);
			activeLayerIndexRef.current = 0;
		};

		loadCanvasContent();

		// onion skin canvas
		const onionCanvas = document.createElement("canvas");
		onionCanvas.width = w;
		onionCanvas.height = h;
		onionCanvas.style.position = "absolute";
		onionCanvas.style.zIndex = "2";
		onionCanvas.style.left = "0";
		onionCanvas.style.top = "0";
		onionCanvas.style.pointerEvents = "none";
		onionCanvas.style.display = "none";
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
						const nextTool = lastDrawToolRef.current || "pen";
						selectTool(nextTool);
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
					if (showGrid) {
						active.rotateSelectionByDot(deltaAngle);
					} else {
						active.rotateSelection(deltaAngle);
					}
					selectRotateLastAngle = angle;
				} else if (selectDragMode === "move") {
					if (showGrid) {
						active.moveSelectionByDot(x - px!, y - py!);
					} else {
						active.moveSelection(x - px!, y - py!);
					}
				} else if (selectDragMode === "resize") {
					if (showGrid) {
						active.resizeSelectionByDot(x - selectAnchorX, y - selectAnchorY);
					} else {
						active.resizeSelection(x - selectAnchorX, y - selectAnchorY);
					}
				} else if (showGrid) {
					active.selectByDot(
						selectStartX,
						selectStartY,
						x - selectStartX,
						y - selectStartY,
					);
				} else {
					active.select(
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

			if (toolRef.current === "brush") {
				active.drawLine(x, y, px, py);
			} else {
				const points = oekaki.lerp(x, y, px, py);
				if (toolRef.current === "pen") {
					for (const [cx, cy] of points) active.draw(cx, cy);
				} else if (toolRef.current === "eraser") {
					for (const [cx, cy] of points) active.erase(cx, cy);
				}
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
					if (showGrid) {
						active.selectFreehandByDot(lassoPointsRef.current);
					} else {
						active.selectFreehand(lassoPointsRef.current);
					}
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
				if (!rgb || !active) return;
				const w = active.canvas.width;
				const h = active.canvas.height;
				const result = oekaki.floodFill(active.data, w, h, x, y, [
					rgb[0],
					rgb[1],
					rgb[2],
					255,
				]);
				if (result) active.data = result;
				active.trace();
			}
			updateOnionSkin();
			forceRender((n) => n + 1);
		});

		return () => {
			onionCanvasRef.current = null;
			if (mountRef.current) mountRef.current.innerHTML = "";
		};
	}, [initKey]);

	useEffect(() => {
		if (mountRef.current) {
			mountRef.current.className =
				"inline-block" + (showGrid ? " unj-canvas-grid" : "");
		}
	}, [showGrid]);

	useEffect(() => {
		oekaki.penSize.value = penSize;
		oekaki.brushSize.value = brushSize;
		oekaki.eraserSize.value = eraserSize;
	}, [penSize, brushSize, eraserSize]);

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
		handleDeselect();
		framesRef.current[currentFrameRef.current] = captureFrame();
		currentFrameRef.current = i;
		applyFrame(framesRef.current[i]);
		updateOnionSkin();
		forceRender((n) => n + 1);
	};

	const addFrame = () => {
		framesRef.current[currentFrameRef.current] = captureFrame();
		const blank: FrameData = {
			layers: oekaki.getLayers().map((l) => ({
				name: l.name,
				visible: l.visible,
				locked: l.locked,
				opacity: l.opacity,
				data: new Uint8ClampedArray(l.canvas.width * l.canvas.height * 4),
			})),
		};
		const idx = currentFrameRef.current + 1;
		framesRef.current.splice(idx, 0, blank);
		currentFrameRef.current = idx;
		applyFrame(blank);
		updateOnionSkin();
		forceRender((n) => n + 1);
	};

	const deleteFrame = () => {
		if (framesRef.current.length <= 1) return;
		framesRef.current.splice(currentFrameRef.current, 1);
		if (currentFrameRef.current >= framesRef.current.length)
			currentFrameRef.current = framesRef.current.length - 1;
		applyFrame(framesRef.current[currentFrameRef.current]);
		updateOnionSkin();
		forceRender((n) => n + 1);
	};

	const duplicateFrame = () => {
		framesRef.current[currentFrameRef.current] = captureFrame();
		const src = framesRef.current[currentFrameRef.current];
		const dup: FrameData = {
			layers: src.layers.map((l) => ({
				...l,
				data: new Uint8ClampedArray(l.data),
			})),
		};
		const idx = currentFrameRef.current + 1;
		framesRef.current.splice(idx, 0, dup);
		currentFrameRef.current = idx;
		applyFrame(dup);
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
			isPlayingRef.current = true;
			setIsPlaying(true);
			playTimerRef.current = window.setInterval(() => {
				const next = (currentFrameRef.current + 1) % framesRef.current.length;
				framesRef.current[currentFrameRef.current] = captureFrame();
				currentFrameRef.current = next;
				applyFrame(framesRef.current[next]);
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
				const next = (currentFrameRef.current + 1) % framesRef.current.length;
				framesRef.current[currentFrameRef.current] = captureFrame();
				currentFrameRef.current = next;
				applyFrame(framesRef.current[next]);
				updateOnionSkin();
				forceRender((n) => n + 1);
			}, 1000 / fpsRef.current);
		}
	};

	const enterAnimMode = () => {
		stopPlayback();
		framesRef.current = [captureFrame()];
		currentFrameRef.current = 0;
		setAnimMode(true);
	};

	const exitAnimMode = () => {
		stopPlayback();
		if (framesRef.current.length > 1) {
			framesRef.current[currentFrameRef.current] = captureFrame();
			currentFrameRef.current = 0;
			applyFrame(framesRef.current[0]);
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

	const handleSave = () => {
		const state = getCurrentState();
		if (state) {
			saveHistory(storageKey, state, "drawing", 50);
		}
		clearAutosave(storageKey);
		onSave(oekaki.render().toDataURL());
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

	const handleImport = async (
		image: HTMLImageElement,
		_opts: { opacity: number; simple: boolean },
	) => {
		const active =
			layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
		if (!active?.editable) return;
		const bitmap = await createImageBitmap(image);
		active.paste(bitmap);
		active.trace();
		setTool("select");
		toolRef.current = "select";
		drawSelectionHandle();
		forceRender((n) => n + 1);
	};

	useEffect(() => {
		const onCopy = (e: ClipboardEvent) => {
			if (notDrawing(e)) return;
			e.preventDefault();
			handleCopy();
		};

		const onPaste = async (e: ClipboardEvent) => {
			if (notDrawing(e)) return;
			const active =
				layerEntriesRef.current[activeLayerIndexRef.current]?.instance;
			if (!active?.editable) return;
			const imageItem = Array.from(e.clipboardData?.items || []).find(
				(v) => v.kind === "file" && v.type.startsWith("image/"),
			);
			let bitmap: ImageBitmap | HTMLCanvasElement | null = null;
			if (imageItem) {
				const blob = imageItem.getAsFile();
				if (!blob) return;
				bitmap = await createImageBitmap(blob);
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
					const step = 1;
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
					const rotateStep = showGrid ? 90 : 15;
					const deltaAngle = e.key === "[" ? -rotateStep : rotateStep;
					if (showGrid) {
						active.rotateSelectionByDot(deltaAngle);
					} else {
						active.rotateSelection(deltaAngle);
					}
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
					selectTool("brush");
					break;
				case "3":
					selectTool("eraser");
					break;
				case "4":
					selectTool("dropper");
					break;
				case "5":
					selectTool("fill");
					break;
				case "6":
					selectTool("select");
					break;
				case "7":
					selectTool("lasso");
					break;
				case "g":
					setShowGrid((v) => !v);
					break;
			}
		};
		window.addEventListener("copy", onCopy);
		window.addEventListener("paste", onPaste);
		window.addEventListener("keydown", handler);
		return () => {
			window.removeEventListener("copy", onCopy);
			window.removeEventListener("paste", onPaste);
			window.removeEventListener("keydown", handler);
		};
	}, [showGrid]);

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

	const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
		<button
			onClick={() => selectTool(t)}
			className={
				"w-9 h-9 rounded-lg flex items-center justify-center transition-colors " +
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
						}}
						className={
							"px-3 py-1 rounded-md text-[11px] font-medium transition-colors " +
							(!animMode
								? "bg-blue-600 text-white shadow-sm"
								: "text-gray-400 hover:text-gray-200")
						}
					>
						一枚絵
					</button>
					<button
						onClick={() => enterAnimMode()}
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
				className="flex-1 bg-[#1a1b26] m-3 mb-1 rounded-xl border border-gray-800 shadow-inner overflow-hidden relative flex items-center justify-center"
				onPointerDown={handleMultiTouchPointerDown}
				onPointerMove={handleMultiTouchPointerMove}
				onPointerUp={handleMultiTouchPointerUp}
				onPointerCancel={handleMultiTouchPointerUp}
				onContextMenu={(e) => e.preventDefault()}
			>
				<div
					ref={mountRef}
					className="inline-block"
					style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
				/>
			</div>

			{animMode && (
				// フレーム数・現在フレーム・fps は毎フレームの高頻度更新を避けるため意図的に ref + forceRender
				// で管理しており(各更新箇所で forceRender を呼びfresh値を反映)、ここでの ref 読み取りは安全。
				<AnimationBar
					// eslint-disable-next-line react-hooks/refs
					frameCount={framesRef.current.length}
					// eslint-disable-next-line react-hooks/refs
					currentFrame={currentFrameRef.current}
					// eslint-disable-next-line react-hooks/refs
					fps={fpsRef.current}
					isPlaying={isPlaying}
					onSelectFrame={selectFrame}
					onAddFrame={addFrame}
					onDeleteFrame={deleteFrame}
					onDuplicateFrame={duplicateFrame}
					onTogglePlay={togglePlay}
					onFpsChange={handleFpsChange}
					onionSkin={onionSkin}
					onionSkinOpacity={onionSkinOpacity}
					onToggleOnionSkin={toggleOnionSkin}
					onOnionSkinOpacityChange={handleOnionSkinOpacityChange}
					onExit={exitAnimMode}
				/>
			)}

			<div className="px-3.5 pb-4 pt-2.5 space-y-2.5 shrink-0 bg-[#0f0f11] border-t border-gray-900">
				<div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
					{toolBtn("pen", <Pen size={15} />, "ペン (1)")}
					{toolBtn("brush", <Brush size={15} />, "ブラシ (2)")}
					{toolBtn("eraser", <Eraser size={15} />, "消しゴム (3)")}
					{toolBtn("dropper", <Pipette size={15} />, "スポイト (4)")}
					{toolBtn("fill", <PaintBucket size={15} />, "塗りつぶし (5)")}
					{toolBtn("select", <BoxSelect size={15} />, "範囲選択 (6)")}
					{toolBtn("lasso", <LassoSelect size={15} />, "自由選択 (7)")}
					<div className="w-px h-6 bg-gray-800 mx-1" />
					<button
						onClick={() => setShowGrid((v) => !v)}
						className={
							"w-9 h-9 rounded-lg flex items-center justify-center transition-colors " +
							(showGrid
								? "bg-blue-600 text-white shadow"
								: "bg-gray-100/10 text-gray-300 hover:bg-gray-100/20")
						}
						title="グリッド (G)"
					>
						<Grid3x3 size={15} />
					</button>
					<button
						onClick={() => setShowLayerPanel((v) => !v)}
						className={
							"w-9 h-9 rounded-lg flex items-center justify-center transition-colors " +
							(showLayerPanel
								? "bg-blue-600 text-white shadow"
								: "bg-gray-100/10 text-gray-300 hover:bg-gray-100/20")
						}
						title="レイヤー"
					>
						<Layers size={15} />
					</button>
					<button
						onClick={() => {
							oekaki.flipped.value = !oekaki.flipped.value;
							setFlipped(oekaki.flipped.value);
						}}
						className={
							"w-9 h-9 rounded-lg flex items-center justify-center transition-colors " +
							(flipped
								? "bg-blue-600 text-white shadow"
								: "bg-gray-100/10 text-gray-300 hover:bg-gray-100/20")
						}
						title="左右反転"
					>
						<FlipHorizontal size={15} />
					</button>
				</div>

				<div className="flex items-center space-x-3">
					{(tool === "pen" || tool === "brush") && (
						<div className="flex-1 flex items-center space-x-2">
							<span className="text-[10px] text-gray-500 w-12 shrink-0">
								{tool === "brush" ? "ブラシ" : "ペン"}サイズ
							</span>
							<input
								type="range"
								min={1}
								max={tool === "brush" ? 60 : 20}
								value={currentSize}
								onChange={(e) =>
									tool === "brush"
										? setBrushSize(Number(e.target.value))
										: setPenSize(Number(e.target.value))
								}
								className="flex-1 h-1 accent-blue-500"
							/>
							<span className="text-[10px] text-gray-400 w-6 text-right">
								{currentSize}px
							</span>
						</div>
					)}
					{tool === "eraser" && (
						<div className="flex-1 flex items-center space-x-2">
							<span className="text-[10px] text-gray-500 w-16 shrink-0">
								消しゴムサイズ
							</span>
							<input
								type="range"
								min={4}
								max={80}
								value={eraserSize}
								onChange={(e) => setEraserSize(Number(e.target.value))}
								className="flex-1 h-1 accent-blue-500"
							/>
							<span className="text-[10px] text-gray-400 w-6 text-right">
								{eraserSize}px
							</span>
						</div>
					)}
					{(tool === "dropper" || tool === "fill") && (
						<span className="text-[10px] text-gray-500">
							キャンバスをクリック
						</span>
					)}
					{(tool === "select" || tool === "lasso") && (
						<div className="flex-1 flex items-center space-x-1">
							<span className="text-[10px] text-gray-500">
								クリック&ドラッグで範囲選択
							</span>
						</div>
					)}
				</div>

				<div className="flex items-center space-x-2">
					<div
						className="relative shrink-0 w-8 h-8 rounded border border-gray-600 overflow-hidden"
						style={{ backgroundColor: color }}
					/>
					<input
						type="color"
						value={color}
						onChange={(e) => applyColor(e.target.value)}
						className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent"
					/>
					<div className="flex-1 flex flex-wrap gap-0.5">
						{PRESET_COLORS.map((c) => (
							<button
								key={c}
								className={
									"w-5 h-5 rounded-sm border " +
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
									className="w-5 h-5 rounded-sm border border-gray-700/50 hover:scale-110 transition-transform"
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
							className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] hover:bg-gray-100/20"
							title="選択範囲をコピー (Ctrl+C)"
						>
							<Copy size={11} />
							<span>コピー</span>
						</button>
						<button
							onClick={handleCut}
							className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] hover:bg-gray-100/20"
							title="選択範囲を削除 (Delete)"
						>
							<Trash2 size={11} />
							<span>削除</span>
						</button>
						<div className="w-px h-5 bg-gray-800 mx-1" />
						<button
							onClick={() => {
								const active =
									layerEntriesRef.current[activeLayerIndexRef.current]
										?.instance;
								if (!active?.selection) return;
								const step = showGrid ? 90 : 15;
								if (showGrid) {
									active.rotateSelectionByDot(-step);
								} else {
									active.rotateSelection(-step);
								}
								if (active.modified()) active.trace();
								drawSelectionHandle();
								forceRender((n) => n + 1);
							}}
							className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] hover:bg-gray-100/20"
							title="反時計回りに回転"
						>
							<RotateCcw size={11} />
							<span>回転</span>
						</button>
						<button
							onClick={() => {
								const active =
									layerEntriesRef.current[activeLayerIndexRef.current]
										?.instance;
								if (!active?.selection) return;
								const step = showGrid ? 90 : 15;
								if (showGrid) {
									active.rotateSelectionByDot(step);
								} else {
									active.rotateSelection(step);
								}
								if (active.modified()) active.trace();
								drawSelectionHandle();
								forceRender((n) => n + 1);
							}}
							className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] hover:bg-gray-100/20"
							title="時計回りに回転"
						>
							<RotateCw size={11} />
							<span>回転</span>
						</button>
						<div className="w-px h-5 bg-gray-800 mx-1" />
						<button
							onClick={handleDeselect}
							className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] hover:bg-gray-100/20"
							title="選択範囲を解除 (Esc)"
						>
							<X size={11} />
							<span>解除</span>
						</button>
					</div>
				)}

				<div className="flex justify-between items-center">
					<div className="flex space-x-1.5">
						<button
							onClick={clearCanvas}
							className="px-2 h-7 rounded bg-red-950/20 text-red-400 border border-red-900/30 flex items-center space-x-1 text-[10px]"
						>
							<Trash2 size={11} />
							<span>クリア</span>
						</button>
						<button
							onClick={handleUndo}
							className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] disabled:opacity-40"
						>
							<Undo size={11} />
							<span>戻る</span>
						</button>
						<button
							onClick={handleRedo}
							className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] disabled:opacity-40"
						>
							<Redo size={11} />
							<span>進む</span>
						</button>
					</div>
					<button
						onClick={() => setShowImport(true)}
						className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] hover:bg-gray-100/20"
					>
						<Upload size={11} />
						<span>読込</span>
					</button>
					<button
						onClick={() => setShowHistory(true)}
						className="px-2 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center space-x-1 text-[10px] transition-colors"
					>
						<History size={11} />
						<span>履歴</span>
					</button>
					<button
						onClick={handleSave}
						className="h-7 rounded bg-[#1db854] hover:bg-[#1ed760] text-gray-900 font-bold flex items-center space-x-1.5 px-3 text-[10px] transition-colors"
					>
						<Save size={11} />
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
				walkMode={false}
				walkPresets={[]}
			/>
			<HistoryModal
				isOpen={showHistory}
				onClose={() => setShowHistory(false)}
				storageKey={storageKey}
				type="drawing"
				onRestore={handleRestoreHistory}
				getCurrentData={getCurrentState}
			/>
		</div>
	);
}
