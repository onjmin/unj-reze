"use client";

import {
	ClipboardPaste,
	Copy,
	Crop,
	Download,
	Eraser,
	Grid2X2,
	Layers,
	MessageSquare,
	Move,
	PaintBucket,
	Pen,
	Redo,
	Save,
	Trash2,
	Type,
	Undo,
	X,
	Zap,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import {
	createTonePattern,
	getToneCanvas,
	TONE_DEFINITIONS,
	ToneType,
} from "@/lib/manga-tone";
import {
	BubbleConfig,
	BubbleShape,
	drawBubble,
	TailDirection,
} from "@/lib/manga-bubble";
import { drawMangaText, MangaTextConfig } from "@/lib/manga-vertical-text";
import {
	drawFocusLines,
	drawFrames,
	drawSpeedLines,
	FocusLineConfig,
	FrameBox,
	FrameTemplate,
	generateFrameBoxes,
	SpeedLineConfig,
} from "@/lib/manga-effects";
import {
	ensureCustomFontLoaded,
	loadCustomFonts,
	MvCustomFont,
	upsertCustomFont,
} from "@/lib/mv-custom-fonts";
import { exportSinglePng } from "@/lib/export-drawing";
import * as oekaki from "@onjmin/oekaki";
import LayerPanel, { type LayerEntry } from "./LayerPanel";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 1130; // 約 1 : 1.414 (漫画用紙比率)

// フキダシ/文字がコマ枠をはみ出さないよう位置を補正する（漫画の基本ルール：
// 意図的な「ぶち抜き」演出以外は、フキダシ・セリフはコマ内に収める）。
// anchor="center" は (x,y) が矩形中心（フキダシ）、"topLeft" は左上（文字）を表す。
function clampRectToPanel(
	x: number,
	y: number,
	w: number,
	h: number,
	boxes: FrameBox[],
	anchor: "center" | "topLeft",
): { x: number; y: number } {
	if (boxes.length === 0) return { x, y };

	const cx = anchor === "center" ? x : x + w / 2;
	const cy = anchor === "center" ? y : y + h / 2;

	// 中心点が属するコマを探す。見つからない場合（コマの溝や外側）は最も近いコマへ寄せる。
	let panel = boxes.find(
		(b) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h,
	);
	if (!panel) {
		let bestDist = Number.POSITIVE_INFINITY;
		for (const b of boxes) {
			const pcx = b.x + b.w / 2;
			const pcy = b.y + b.h / 2;
			const dist = (pcx - cx) ** 2 + (pcy - cy) ** 2;
			if (dist < bestDist) {
				bestDist = dist;
				panel = b;
			}
		}
	}
	if (!panel) return { x, y };

	const pad = 8;
	const minCx = panel.x + pad + w / 2;
	const maxCx = panel.x + panel.w - pad - w / 2;
	const minCy = panel.y + pad + h / 2;
	const maxCy = panel.y + panel.h - pad - h / 2;

	const clampedCx = maxCx >= minCx ? Math.min(Math.max(cx, minCx), maxCx) : panel.x + panel.w / 2;
	const clampedCy = maxCy >= minCy ? Math.min(Math.max(cy, minCy), maxCy) : panel.y + panel.h / 2;

	const outX = anchor === "center" ? clampedCx : clampedCx - w / 2;
	const outY = anchor === "center" ? clampedCy : clampedCy - h / 2;
	return { x: Math.round(outX), y: Math.round(outY) };
}

function distance(ax: number, ay: number, bx: number, by: number): number {
	return Math.hypot(ax - bx, ay - by);
}

export interface MangaEditorProps {
	onClose: () => void;
	onSave: (imageData: string) => void;
	initialImageUrl?: string;
}

type MangaTool =
	| "pen"
	| "eraser"
	| "tone"
	| "bucket"
	| "bubble"
	| "text"
	| "frame"
	| "effect"
	| "select"
	| "rectSelect";

// 矩形選択（コピー&ペースト用）
interface SelectionRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

// 選択範囲(コピー元 or 貼り付け直後)へのドラッグ操作
interface SelectionDrag {
	mode: "move" | "resize" | "rotate";
	startX: number;
	startY: number;
	// resize/rotateの基準として、ドラッグ開始時点の選択範囲・回転角度を保持する
	origSel: SelectionRect;
	origRotation: number;
}

interface LayerMeta {
	id: string;
	name: string;
	visible: boolean;
	opacity: number;
	// レイヤーパネル(LayerPanel)への受け渡し用。renderRef中にlayersRef.currentを直接読むのはNGなため、
	// setLayerMetas経由でstateとして持ち回す
	oekaki: oekaki.LayeredCanvas;
}

// レイヤーの実体は @onjmin/oekaki の LayeredCanvas。選択・コピー&ペースト・移動/拡縮/回転は
// そちらの実装（DrawingEditorと同じ基盤）に委譲し、このコンポーネントは
// canvas/ctxを直接使うトーン塗り・コマ枠描画・Undo履歴(全レイヤー合成スナップショット)だけ独自に持つ。
interface CanvasLayer extends LayerMeta {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	oekaki: oekaki.LayeredCanvas;
}

interface MangaBubbleItem extends BubbleConfig {
	id: string;
}

interface MangaTextItem extends MangaTextConfig {
	id: string;
}

const PRESET_FONTS = [
	{ value: "sans-serif", label: "ゴシック体 (標準)" },
	{ value: "'Noto Serif JP', 'Yu Mincho', serif", label: "明朝体" },
	{ value: "'rorigaifont', sans-serif", label: "ロリガイフォント" },
	{ value: "'PBfont', sans-serif", label: "PBfont (かわいい)" },
	{ value: "'chupakafont', sans-serif", label: "チュパカブラフォント" },
	{ value: "'favofont', sans-serif", label: "ふぁぼフォント" },
	{ value: "'nagamonfont', sans-serif", label: "長モンフォント" },
];

export default function MangaEditor({
	onClose,
	onSave,
	initialImageUrl,
}: MangaEditorProps) {
	// キャンバス & ズーム
	const viewportRef = useRef<HTMLDivElement>(null);
	const [zoom, setZoom] = useState(0.85);

	// ツール状態
	const [activeTool, setActiveTool] = useState<MangaTool>("pen");
	const [penSize, setPenSize] = useState(3);
	const [penColor, setPenColor] = useState("#000000");
	const [eraserSize, setEraserSize] = useState(24);

	// 範囲選択コピー&ペースト状態
	// 実際の選択/移動/拡縮/回転/削除は oekaki.LayeredCanvas 側(DrawingEditorと同じ実装)に委譲し、
	// ここではハンドル表示用に選択矩形と回転角度(ライブラリ側は角度を保持しないため独自追跡)だけ持つ。
	const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
	const selectDragStartRef = useRef<{ x: number; y: number } | null>(null);
	const clipboardCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const [hasClipboard, setHasClipboard] = useState(false);
	const selectionRotationRef = useRef(0); // ラジアン。ハンドル位置計算のみに使用
	const selectionDragRef = useRef<SelectionDrag | null>(null);
	// oekaki初期化用の非表示マウント先（実際の表示は従来通りdisplayCanvasRefへ手動合成する）
	const oekakiMountRef = useRef<HTMLDivElement | null>(null);

	// トーン状態
	const [activeTone, setActiveTone] = useState<ToneType>("dot-20");
	const [toneBrushSize, setToneBrushSize] = useState(24);
	const [showToneModal, setShowToneModal] = useState(false);

	// コマ枠状態
	const [showFrameModal, setShowFrameModal] = useState(false);
	const [frameBorderWidth, setFrameBorderWidth] = useState(4);
	// 現在のコマ割り（フキダシ/文字をコマ内に収めるための当たり判定用データ）
	const [frameBoxes, setFrameBoxes] = useState<FrameBox[]>([]);

	// フキダシ状態
	const [bubbles, setBubbles] = useState<MangaBubbleItem[]>([]);
	const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
	const [showBubbleModal, setShowBubbleModal] = useState(false);
	const [bubbleShape, setBubbleShape] = useState<BubbleShape>("ellipse");
	const [bubbleTail, setBubbleTail] = useState<TailDirection>("bottom-left");

	// テキスト状態
	const [texts, setTexts] = useState<MangaTextItem[]>([]);
	const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
	const [showTextModal, setShowTextModal] = useState(false);
	const [editingTextStr, setEditingTextStr] = useState("セリフを入力");
	const [textDirection, setTextDirection] = useState<"vertical" | "horizontal">(
		"vertical",
	);
	const [textFontSize, setTextFontSize] = useState(24);
	const [textFontFamily, setTextFontFamily] = useState(PRESET_FONTS[0].value);
	const [textColor, setTextColor] = useState("#000000");
	const [textStrokeColor, setTextStrokeColor] = useState("#ffffff");
	const [textStrokeWidth, setTextStrokeWidth] = useState(3);
	const [customFonts, setCustomFonts] = useState<MvCustomFont[]>(() => {
		if (typeof window === "undefined") return [];
		return loadCustomFonts();
	});
	const [newFontName, setNewFontName] = useState("");
	const [newFontUrl, setNewFontUrl] = useState("");

	// 効果線状態
	const [showEffectModal, setShowEffectModal] = useState(false);
	const [effectType, setEffectType] = useState<"focus" | "speed">("focus");
	const [focusLineCount, setFocusLineCount] = useState(80);
	const [focusInnerRadius, setFocusInnerRadius] = useState(90);

	// レイヤー状態
	const layersRef = useRef<CanvasLayer[]>([]);
	const [layerMetas, setLayerMetas] = useState<LayerMeta[]>([]);
	const [activeLayerIndex, setActiveLayerIndex] = useState(3);
	const [showLayersPanel, setShowLayersPanel] = useState(false);
	// コマ枠は専用レイヤーに固定で描画する（アクティブレイヤーに依存しない）
	const frameLayerIdRef = useRef<string | null>(null);

	// 履歴 (Undo / Redo) — キャンバスのレイヤーだけでなく、フキダシ・文字の追加/削除/移動も対象にする
	interface HistorySnapshot {
		layers: ImageData[];
		bubbles: MangaBubbleItem[];
		texts: MangaTextItem[];
	}
	const undoStackRef = useRef<HistorySnapshot[]>([]);
	const redoStackRef = useRef<HistorySnapshot[]>([]);
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);
	// bubbles/texts の最新値を非同期コールバック内からも参照できるようにするref
	const bubblesRef = useRef<MangaBubbleItem[]>([]);
	const textsRef = useRef<MangaTextItem[]>([]);
	useEffect(() => {
		bubblesRef.current = bubbles;
	}, [bubbles]);
	useEffect(() => {
		textsRef.current = texts;
	}, [texts]);

	// ドラッグ・操作用
	const isDrawingRef = useRef(false);
	const lastPointRef = useRef<{ x: number; y: number } | null>(null);
	const isDraggingObjectRef = useRef<{
		type: "bubble" | "text";
		id: string;
		startX: number;
		startY: number;
		origX: number;
		origY: number;
	} | null>(null);

	// メイン表示用 Canvas
	const displayCanvasRef = useRef<HTMLCanvasElement>(null);

	// 表示用キャンバスへの合成描画
	const renderDisplay = useCallback(() => {
		const display = displayCanvasRef.current;
		if (!display) return;
		const ctx = display.getContext("2d");
		if (!ctx) return;

		// 1. 白背景
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		// 2. レイヤー群を下から順に描画
		for (const layer of layersRef.current) {
			if (!layer.visible || layer.opacity <= 0) continue;
			ctx.save();
			ctx.globalAlpha = layer.opacity / 100;
			ctx.drawImage(layer.canvas, 0, 0);
			ctx.restore();
		}

		// 3. フキダシ群を描画
		for (const bubble of bubbles) {
			drawBubble(ctx, bubble);
			// 選択中の場合は点線枠を表示
			if (selectedBubbleId === bubble.id) {
				ctx.save();
				ctx.strokeStyle = "#3b82f6";
				ctx.lineWidth = 2;
				ctx.setLineDash([4, 4]);
				ctx.strokeRect(
					bubble.x - bubble.w / 2 - 4,
					bubble.y - bubble.h / 2 - 4,
					bubble.w + 8,
					bubble.h + 8,
				);
				ctx.restore();
			}
		}

		// 4. テキスト群を描画
		for (const item of texts) {
			const bounds = drawMangaText(ctx, item);
			if (selectedTextId === item.id) {
				ctx.save();
				ctx.strokeStyle = "#3b82f6";
				ctx.lineWidth = 2;
				ctx.setLineDash([4, 4]);
				ctx.strokeRect(item.x - 4, item.y - 4, bounds.width + 8, bounds.height + 8);
				ctx.restore();
			}
		}

		// 5. 範囲選択の点線マーキー + ハンドル
		// 選択中の内容そのもの（コピー元 or 貼り付け直後）は既に oekaki.LayeredCanvas が
		// レイヤーのcanvasへ直接描画済みなので、ここでは枠線とハンドルのみ描く。
		if (selectionRect) {
			ctx.save();
			ctx.strokeStyle = "#f59e0b";
			ctx.lineWidth = 2;
			ctx.setLineDash([6, 4]);
			ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
			ctx.restore();

			if (activeTool === "rectSelect") {
				const rotateHandle = {
					x: selectionRect.x + selectionRect.w / 2,
					y: selectionRect.y - 30,
				};
				const resizeHandle = {
					x: selectionRect.x + selectionRect.w,
					y: selectionRect.y + selectionRect.h,
				};

				ctx.save();
				ctx.strokeStyle = "#f59e0b";
				ctx.lineWidth = 1.5;
				ctx.setLineDash([]);
				ctx.beginPath();
				ctx.moveTo(selectionRect.x + selectionRect.w / 2, selectionRect.y);
				ctx.lineTo(rotateHandle.x, rotateHandle.y);
				ctx.stroke();

				ctx.fillStyle = "#f59e0b";
				ctx.beginPath();
				ctx.arc(rotateHandle.x, rotateHandle.y, 7, 0, Math.PI * 2);
				ctx.fill();

				ctx.fillRect(resizeHandle.x - 7, resizeHandle.y - 7, 14, 14);
				ctx.restore();
			}
		}
	}, [bubbles, texts, selectedBubbleId, selectedTextId, selectionRect, activeTool]);

	// カスタムフォント初期ロード
	useEffect(() => {
		for (const f of customFonts) {
			ensureCustomFontLoaded(f.name, f.url);
		}
	}, [customFonts]);

	// レイヤーの初期化 (下描き、コマ枠、線画)
	useEffect(() => {
		const createLayer = (name: string): CanvasLayer => {
			const lc = new oekaki.LayeredCanvas(name);
			return {
				id: lc.uuid,
				name,
				canvas: lc.canvas,
				ctx: lc.ctx,
				visible: true,
				opacity: 100,
				oekaki: lc,
			};
		};

		if (layersRef.current.length === 0) {
			// oekakiは内部でレイヤーごとのcanvasをmountTargetへ実際に追加するライブラリ。
			// このコンポーネントは従来通りdisplayCanvasRefへ手動合成する表示方式を維持するため、
			// oekaki自身のcanvas群は非表示のマウント先に隔離し、画面には出さない
			// （選択/コピー&ペースト/移動/拡縮/回転のロジックだけを再利用する）。
			// この効果は renderDisplay の変化などで再実行され得るため、
			// 初回レイヤー作成時の1回だけ呼び、以後の再実行では呼び直さない
			// （呼び直すと選択状態などのoekaki内部グローバル状態が消えてしまう）。
			if (oekakiMountRef.current) {
				oekaki.init(oekakiMountRef.current, CANVAS_WIDTH, CANVAS_HEIGHT);
			}
			const initialLayers = [
				createLayer("下描き"),
				createLayer("トーン"),
				createLayer("コマ枠"),
				createLayer("線画"),
			];

			const initialFrames = generateFrameBoxes("3rows", CANVAS_WIDTH, CANVAS_HEIGHT);
			drawFrames(initialLayers[2].ctx, initialFrames, 4);
			frameLayerIdRef.current = initialLayers[2].id;
			setFrameBoxes(initialFrames);

			if (initialImageUrl) {
				const img = new Image();
				img.crossOrigin = "anonymous";
				img.onload = () => {
					initialLayers[0].ctx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
					renderDisplay();
				};
				img.src = initialImageUrl;
			}

			layersRef.current = initialLayers;
			setLayerMetas(
				initialLayers.map((l) => ({
					id: l.id,
					name: l.name,
					visible: l.visible,
					opacity: l.opacity,
					oekaki: l.oekaki,
				})),
			);
		}
		renderDisplay();
	}, [initialImageUrl, renderDisplay]);

	// layers, bubbles, texts の変化で再描画
	useEffect(() => {
		renderDisplay();
	}, [renderDisplay]);

	// 現在の状態をスナップショットとして取得
	const captureSnapshot = useCallback((): HistorySnapshot => ({
		layers: layersRef.current.map((l) =>
			l.ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT),
		),
		bubbles: bubblesRef.current,
		texts: textsRef.current,
	}), []);

	// スナップショットを現在の状態へ復元
	const applySnapshot = useCallback(
		(snap: HistorySnapshot) => {
			layersRef.current.forEach((l, idx) => {
				if (snap.layers[idx]) {
					l.ctx.putImageData(snap.layers[idx], 0, 0);
				}
			});
			setBubbles(snap.bubbles);
			setTexts(snap.texts);
			renderDisplay();
		},
		[renderDisplay],
	);

	// 履歴保存 (Undo スナップショット) — ペン等の描画だけでなく、フキダシ/文字の追加・削除・移動の直前にも呼ぶ
	const saveHistorySnapshot = useCallback(() => {
		if (layersRef.current.length === 0) return;
		undoStackRef.current.push(captureSnapshot());
		if (undoStackRef.current.length > 25) {
			undoStackRef.current.shift();
		}
		redoStackRef.current = [];
		setCanUndo(true);
		setCanRedo(false);
	}, [captureSnapshot]);

	// Undo
	const handleUndo = () => {
		if (undoStackRef.current.length === 0) return;
		redoStackRef.current.push(captureSnapshot());

		const previous = undoStackRef.current.pop()!;
		applySnapshot(previous);

		setCanUndo(undoStackRef.current.length > 0);
		setCanRedo(true);
	};

	// Redo
	const handleRedo = () => {
		if (redoStackRef.current.length === 0) return;
		undoStackRef.current.push(captureSnapshot());

		const next = redoStackRef.current.pop()!;
		applySnapshot(next);

		setCanUndo(true);
		setCanRedo(redoStackRef.current.length > 0);
	};

	// 選択範囲をアクティブレイヤーから内部クリップボードへコピー
	// （実体は oekaki.LayeredCanvas.copySelection() — DrawingEditorと同じ実装）
	const handleCopySelection = useCallback(() => {
		if (!selectionRect) return;
		const curLayer = layersRef.current[activeLayerIndex];
		if (!curLayer) return;
		const clip = curLayer.oekaki.copySelection();
		if (!clip) return;
		clipboardCanvasRef.current = clip;
		setHasClipboard(true);
	}, [selectionRect, activeLayerIndex]);

	// アクティブレイヤーの選択を解除する（フローティング内容は既にcanvasへ反映済みのため、
	// 状態を破棄するだけで確定したことになる）
	const clearActiveSelection = useCallback(() => {
		const curLayer = layersRef.current[activeLayerIndex];
		curLayer?.oekaki.deselect();
		setSelectionRect(null);
		selectionRotationRef.current = 0;
	}, [activeLayerIndex]);

	// 内部クリップボードの内容をアクティブレイヤーへ貼り付ける。
	// oekaki.LayeredCanvas.paste() が「貼り付け直後は選択状態になり、そのまま移動・拡縮・削除できる」ため、
	// 以降のハンドル操作(移動/拡縮/回転)もそのままoekaki側の選択範囲に対して行う。
	const handlePasteSelection = useCallback(() => {
		const clip = clipboardCanvasRef.current;
		if (!clip) return;
		const curLayer = layersRef.current[activeLayerIndex];
		if (!curLayer || !curLayer.visible || curLayer.oekaki.locked) return;

		saveHistorySnapshot();
		curLayer.oekaki.paste(clip);
		selectionRotationRef.current = 0;
		const sel = curLayer.oekaki.selection;
		setSelectionRect(sel ? { x: sel.x, y: sel.y, w: sel.w, h: sel.h } : null);
		// 貼り付け直後はハンドルを操作できるよう、範囲選択ツールへ切り替える
		setActiveTool("rectSelect");
		renderDisplay();
	}, [activeLayerIndex, saveHistorySnapshot, renderDisplay]);

	// 選択範囲内の画素を削除する（Photoshop等の「選択範囲を削除」と同じ挙動）
	const handleDeleteSelection = useCallback(() => {
		const curLayer = layersRef.current[activeLayerIndex];
		if (!curLayer || !curLayer.oekaki.selection) return;
		saveHistorySnapshot();
		curLayer.oekaki.deleteSelection();
		clearActiveSelection();
		renderDisplay();
	}, [activeLayerIndex, saveHistorySnapshot, clearActiveSelection, renderDisplay]);

	// 範囲選択ツール以外に切り替えたら、選択状態を解除する
	// （フローティング内容は既にレイヤーcanvasへ反映済みなので、見た目は変わらず確定したことになる）
	useEffect(() => {
		if (activeTool !== "rectSelect") {
			const curLayer = layersRef.current[activeLayerIndex];
			if (curLayer?.oekaki.selection) {
				curLayer.oekaki.deselect();
				setSelectionRect(null);
			}
		}
	}, [activeTool, activeLayerIndex]);

	// Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) / Ctrl+C / Ctrl+V キーボードショートカット
	// ボタンのtitleに表示しているのに未実装だった（押しても何も起きない状態だった）ため配線する
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			// テキスト入力中(モーダルのセリフ欄など)は編集操作を奪わない
			const target = e.target as HTMLElement | null;
			const isEditingText =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement;

			if (!isEditingText && !e.ctrlKey && !e.metaKey) {
				// 選択中: Escapeで選択解除、Delete/Backspaceで選択範囲を削除
				if (selectionRect) {
					const key = e.key;
					if (key === "Escape") {
						e.preventDefault();
						clearActiveSelection();
					} else if (key === "Delete" || key === "Backspace") {
						e.preventDefault();
						handleDeleteSelection();
					}
				}
				return;
			}

			if (!(e.ctrlKey || e.metaKey)) return;
			const key = e.key.toLowerCase();
			if (key === "z" && !e.shiftKey) {
				e.preventDefault();
				handleUndo();
			} else if (key === "y" || (key === "z" && e.shiftKey)) {
				e.preventDefault();
				handleRedo();
			} else if (key === "c") {
				if (!selectionRect) return;
				e.preventDefault();
				handleCopySelection();
			} else if (key === "v") {
				if (!clipboardCanvasRef.current) return;
				e.preventDefault();
				handlePasteSelection();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	});

	// マウス/タッチ/ペン座標をキャンバス実座標に変換
	const getCanvasPoint = (e: React.PointerEvent) => {
		const display = displayCanvasRef.current;
		if (!display) return null;
		const rect = display.getBoundingClientRect();
		const scaleX = CANVAS_WIDTH / rect.width;
		const scaleY = CANVAS_HEIGHT / rect.height;
		return {
			x: (e.clientX - rect.left) * scaleX,
			y: (e.clientY - rect.top) * scaleY,
		};
	};

	// 現在操作中のポインターID（スマホでの二本指同時操作による誤描画を防ぐため、
	// 最初に触れた1本の指/ペン/マウスだけを追跡する）
	const activePointerIdRef = useRef<number | null>(null);

	// ポインターダウン (描画開始またはオブジェクト選択・移動開始)
	const handlePointerDown = (e: React.PointerEvent) => {
		// 既に別のポインター(指)で操作中なら無視する（二本指ドラッグでの誤描画防止）
		if (activePointerIdRef.current !== null) return;
		const pt = getCanvasPoint(e);
		if (!pt) return;
		activePointerIdRef.current = e.pointerId;
		// キャンバス外に指が出てもドラッグ/描画を継続できるようにする
		(e.target as Element).setPointerCapture?.(e.pointerId);

		// 矩形選択ツール：既存の選択(コピー元 or 貼り付け直後)があればハンドル操作を優先し、
		// それ以外のドラッグは新規の範囲選択として扱う
		if (activeTool === "rectSelect") {
			const curLayer = layersRef.current[activeLayerIndex];
			const sel = curLayer?.oekaki.selection;
			if (curLayer && sel) {
				const rotation = selectionRotationRef.current;
				const HIT = 16;
				// ハンドルは常に選択範囲(未回転のバウンディングボックス)の角に固定表示する
				// （oekakiの selection は回転しても x,y,w,h が変化しない仕様のため）
				const rotateHandle = { x: sel.x + sel.w / 2, y: sel.y - 30 };
				const resizeHandle = { x: sel.x + sel.w, y: sel.y + sel.h };
				if (distance(pt.x, pt.y, rotateHandle.x, rotateHandle.y) <= HIT) {
					selectionDragRef.current = {
						mode: "rotate",
						startX: pt.x,
						startY: pt.y,
						origSel: sel,
						origRotation: rotation,
					};
					return;
				}
				if (distance(pt.x, pt.y, resizeHandle.x, resizeHandle.y) <= HIT) {
					selectionDragRef.current = {
						mode: "resize",
						startX: pt.x,
						startY: pt.y,
						origSel: sel,
						origRotation: rotation,
					};
					return;
				}
				if (
					pt.x >= sel.x &&
					pt.x <= sel.x + sel.w &&
					pt.y >= sel.y &&
					pt.y <= sel.y + sel.h
				) {
					selectionDragRef.current = {
						mode: "move",
						startX: pt.x,
						startY: pt.y,
						origSel: sel,
						origRotation: rotation,
					};
					return;
				}
				// 選択範囲の外をタップ/クリック → 選択解除してから新しい範囲選択を開始する
				clearActiveSelection();
			}
			selectDragStartRef.current = pt;
			setSelectionRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
			return;
		}

		// 選択ツール・フキダシ・文字ツール時はオブジェクトのヒットテスト
		if (activeTool === "select" || activeTool === "bubble" || activeTool === "text") {
			// テキストのヒットテスト
			for (let i = texts.length - 1; i >= 0; i--) {
				const t = texts[i];
				// 簡易矩形判定
				if (
					pt.x >= t.x - 20 &&
					pt.x <= t.x + 200 &&
					pt.y >= t.y - 20 &&
					pt.y <= t.y + 400
				) {
					setSelectedTextId(t.id);
					setSelectedBubbleId(null);
					saveHistorySnapshot();
					isDraggingObjectRef.current = {
						type: "text",
						id: t.id,
						startX: pt.x,
						startY: pt.y,
						origX: t.x,
						origY: t.y,
					};
					return;
				}
			}

			// フキダシのヒットテスト
			for (let i = bubbles.length - 1; i >= 0; i--) {
				const b = bubbles[i];
				const halfW = b.w / 2;
				const halfH = b.h / 2;
				if (
					pt.x >= b.x - halfW &&
					pt.x <= b.x + halfW &&
					pt.y >= b.y - halfH &&
					pt.y <= b.y + halfH
				) {
					setSelectedBubbleId(b.id);
					setSelectedTextId(null);
					saveHistorySnapshot();
					isDraggingObjectRef.current = {
						type: "bubble",
						id: b.id,
						startX: pt.x,
						startY: pt.y,
						origX: b.x,
						origY: b.y,
					};
					return;
				}
			}
		}

		setSelectedBubbleId(null);
		setSelectedTextId(null);

		const curLayer = layersRef.current[activeLayerIndex];
		if (!curLayer || !curLayer.visible || curLayer.oekaki.locked) return;

		saveHistorySnapshot();
		isDrawingRef.current = true;
		lastPointRef.current = pt;

		const ctx = curLayer.ctx;

		if (activeTool === "pen") {
			ctx.save();
			ctx.strokeStyle = penColor;
			ctx.lineWidth = penSize;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.beginPath();
			ctx.arc(pt.x, pt.y, penSize / 2, 0, Math.PI * 2);
			ctx.fillStyle = penColor;
			ctx.fill();
			ctx.restore();
			renderDisplay();
		} else if (activeTool === "eraser") {
			ctx.save();
			ctx.globalCompositeOperation = "destination-out";
			ctx.beginPath();
			ctx.arc(pt.x, pt.y, eraserSize / 2, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
			renderDisplay();
		} else if (activeTool === "tone") {
			// トーンブラシ
			const pattern = createTonePattern(ctx, activeTone, penColor);
			if (pattern) {
				ctx.save();
				ctx.strokeStyle = pattern;
				ctx.fillStyle = pattern;
				ctx.lineWidth = toneBrushSize;
				ctx.lineCap = "round";
				ctx.lineJoin = "round";
				ctx.beginPath();
				ctx.arc(pt.x, pt.y, toneBrushSize / 2, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
				renderDisplay();
			}
		} else if (activeTool === "bucket") {
			// バケツ塗り（選択色またはトーンでフラッドフィル）
			handleFloodFill(curLayer, Math.round(pt.x), Math.round(pt.y));
		}
	};

	// ポインター移動
	const handlePointerMove = (e: React.PointerEvent) => {
		if (e.pointerId !== activePointerIdRef.current) return;
		const pt = getCanvasPoint(e);
		if (!pt) return;

		// 選択範囲のハンドル操作（移動・拡縮・回転）— 実際の変形は oekaki.LayeredCanvas に委譲する
		if (activeTool === "rectSelect" && selectionDragRef.current) {
			const drag = selectionDragRef.current;
			const curLayer = layersRef.current[activeLayerIndex];
			if (!curLayer) return;
			const { origSel } = drag;

			if (drag.mode === "move") {
				// moveSelectionは差分(dx,dy)指定なので、前回位置からの増分だけ渡す
				const dx = pt.x - drag.startX;
				const dy = pt.y - drag.startY;
				curLayer.oekaki.moveSelection(dx, dy);
				drag.startX = pt.x;
				drag.startY = pt.y;
			} else if (drag.mode === "resize") {
				// resizeSelectionは左上基準・常に元画像から再計算されるため、
				// ドラッグ開始時点の選択範囲(origSel)を基準に絶対サイズを渡す
				const newW = Math.max(16, Math.round(pt.x - origSel.x));
				const newH = Math.max(16, Math.round(pt.y - origSel.y));
				curLayer.oekaki.resizeSelection(newW, newH);
			} else if (drag.mode === "rotate") {
				// rotateSelectionは加算角度[度]指定。選択範囲の中心からの角度を求め、
				// 前回からの差分角度だけ渡す
				const cx = origSel.x + origSel.w / 2;
				const cy = origSel.y + origSel.h / 2;
				const angle = Math.atan2(pt.y - cy, pt.x - cx) + Math.PI / 2;
				const deltaDeg = ((angle - selectionRotationRef.current) * 180) / Math.PI;
				curLayer.oekaki.rotateSelection(deltaDeg);
				selectionRotationRef.current = angle;
			}

			const sel = curLayer.oekaki.selection;
			setSelectionRect(sel ? { x: sel.x, y: sel.y, w: sel.w, h: sel.h } : null);
			renderDisplay();
			return;
		}

		// 矩形選択ツール：ドラッグ中の範囲更新
		if (activeTool === "rectSelect" && selectDragStartRef.current) {
			const start = selectDragStartRef.current;
			setSelectionRect({
				x: Math.min(start.x, pt.x),
				y: Math.min(start.y, pt.y),
				w: Math.abs(pt.x - start.x),
				h: Math.abs(pt.y - start.y),
			});
			return;
		}

		// オブジェクトのドラッグ移動
		if (isDraggingObjectRef.current) {
			const drag = isDraggingObjectRef.current;
			const dx = pt.x - drag.startX;
			const dy = pt.y - drag.startY;

			if (drag.type === "bubble") {
				setBubbles((prev) =>
					prev.map((b) => {
						if (b.id !== drag.id) return b;
						// フキダシはドラッグ中もコマ枠をはみ出さないよう位置を制限する
						const c = clampRectToPanel(
							drag.origX + dx,
							drag.origY + dy,
							b.w,
							b.h,
							frameBoxes,
							"center",
						);
						return { ...b, x: c.x, y: c.y };
					}),
				);
			} else if (drag.type === "text") {
				setTexts((prev) =>
					prev.map((t) => {
						if (t.id !== drag.id) return t;
						const c = clampRectToPanel(
							drag.origX + dx,
							drag.origY + dy,
							60,
							200,
							frameBoxes,
							"topLeft",
						);
						return { ...t, x: c.x, y: c.y };
					}),
				);
			}
			return;
		}

		if (!isDrawingRef.current || !lastPointRef.current) return;
		const curLayer = layersRef.current[activeLayerIndex];
		if (!curLayer || !curLayer.visible || curLayer.oekaki.locked) return;

		const ctx = curLayer.ctx;
		const prev = lastPointRef.current;

		if (activeTool === "pen") {
			ctx.save();
			ctx.strokeStyle = penColor;
			ctx.lineWidth = penSize;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.beginPath();
			ctx.moveTo(prev.x, prev.y);
			ctx.lineTo(pt.x, pt.y);
			ctx.stroke();
			ctx.restore();
			renderDisplay();
		} else if (activeTool === "eraser") {
			ctx.save();
			ctx.globalCompositeOperation = "destination-out";
			ctx.lineWidth = eraserSize;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.beginPath();
			ctx.moveTo(prev.x, prev.y);
			ctx.lineTo(pt.x, pt.y);
			ctx.stroke();
			ctx.restore();
			renderDisplay();
		} else if (activeTool === "tone") {
			const pattern = createTonePattern(ctx, activeTone, penColor);
			if (pattern) {
				ctx.save();
				ctx.strokeStyle = pattern;
				ctx.lineWidth = toneBrushSize;
				ctx.lineCap = "round";
				ctx.lineJoin = "round";
				ctx.beginPath();
				ctx.moveTo(prev.x, prev.y);
				ctx.lineTo(pt.x, pt.y);
				ctx.stroke();
				ctx.restore();
				renderDisplay();
			}
		}

		lastPointRef.current = pt;
	};

	// ポインターアップ
	const handlePointerUp = (e: React.PointerEvent) => {
		if (e.pointerId !== activePointerIdRef.current) return;
		activePointerIdRef.current = null;
		isDrawingRef.current = false;
		lastPointRef.current = null;
		isDraggingObjectRef.current = null;
		selectionDragRef.current = null;

		if (selectDragStartRef.current) {
			selectDragStartRef.current = null;
			// キャンバス範囲内にクランプし、極端に小さい(誤クリック)選択は破棄する
			setSelectionRect((prev) => {
				if (!prev) return null;
				const x = Math.max(0, Math.round(prev.x));
				const y = Math.max(0, Math.round(prev.y));
				const w = Math.min(CANVAS_WIDTH - x, Math.round(prev.w));
				const h = Math.min(CANVAS_HEIGHT - y, Math.round(prev.h));
				if (w < 4 || h < 4) return null;
				// 実際の選択状態は oekaki.LayeredCanvas.select() へ委譲する
				// （以降のコピー/移動/拡縮/回転/削除はこの選択に対して行われる）
				const curLayer = layersRef.current[activeLayerIndex];
				curLayer?.oekaki.select(x, y, w, h);
				selectionRotationRef.current = 0;
				return { x, y, w, h };
			});
		}
	};

	// バケツ塗り (Flood Fill)
	const handleFloodFill = (layer: CanvasLayer, startX: number, startY: number) => {
		const ctx = layer.ctx;
		const imgData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		const data = imgData.data;

		const startIndex = (startY * CANVAS_WIDTH + startX) * 4;
		const startR = data[startIndex];
		const startG = data[startIndex + 1];
		const startB = data[startIndex + 2];
		const startA = data[startIndex + 3];

		// 目標のパターンまたは色
		const toneCanvas = getToneCanvas(activeTone);
		const tCtx = toneCanvas.getContext("2d")!;
		const toneData = tCtx.getImageData(0, 0, toneCanvas.width, toneCanvas.height);

		// 幅・高さ
		const w = CANVAS_WIDTH;
		const h = CANVAS_HEIGHT;
		const queue: [number, number][] = [[startX, startY]];
		const visited = new Uint8Array(w * h);

		const match = (idx: number) => {
			return (
				Math.abs(data[idx] - startR) < 32 &&
				Math.abs(data[idx + 1] - startG) < 32 &&
				Math.abs(data[idx + 2] - startB) < 32 &&
				Math.abs(data[idx + 3] - startA) < 32
			);
		};

		while (queue.length > 0) {
			const [x, y] = queue.pop()!;
			const coord = y * w + x;
			if (visited[coord]) continue;
			visited[coord] = 1;

			const idx = coord * 4;
			// トーンのパターン色をセット
			const tx = x % toneCanvas.width;
			const ty = y % toneCanvas.height;
			const tIdx = (ty * toneCanvas.width + tx) * 4;
			data[idx] = toneData.data[tIdx];
			data[idx + 1] = toneData.data[tIdx + 1];
			data[idx + 2] = toneData.data[tIdx + 2];
			data[idx + 3] = toneData.data[tIdx + 3];

			// 上下左右
			if (x > 0 && !visited[coord - 1] && match(idx - 4)) queue.push([x - 1, y]);
			if (x < w - 1 && !visited[coord + 1] && match(idx + 4)) queue.push([x + 1, y]);
			if (y > 0 && !visited[coord - w] && match(idx - w * 4)) queue.push([x, y - 1]);
			if (y < h - 1 && !visited[coord + w] && match(idx + w * 4)) queue.push([x, y + 1]);
		}

		ctx.putImageData(imgData, 0, 0);
		renderDisplay();
	};

	// フキダシの追加
	const handleAddBubble = () => {
		saveHistorySnapshot();
		const w = 220;
		const h = 180;
		const { x, y } = clampRectToPanel(
			CANVAS_WIDTH / 2,
			CANVAS_HEIGHT / 3,
			w,
			h,
			frameBoxes,
			"center",
		);
		const newBubble: MangaBubbleItem = {
			id: Math.random().toString(36).slice(2),
			x,
			y,
			w,
			h,
			shape: bubbleShape,
			tail: bubbleTail,
			borderWidth: 3,
			borderColor: "#000000",
			backgroundColor: "#ffffff",
		};
		setBubbles((prev) => [...prev, newBubble]);
		setSelectedBubbleId(newBubble.id);
		setShowBubbleModal(false);
	};

	// テキストの追加
	const handleAddText = () => {
		if (!editingTextStr.trim()) return;
		saveHistorySnapshot();
		const { x, y } = clampRectToPanel(
			CANVAS_WIDTH / 2 - 20,
			CANVAS_HEIGHT / 3 - 60,
			60,
			200,
			frameBoxes,
			"topLeft",
		);
		const newText: MangaTextItem = {
			id: Math.random().toString(36).slice(2),
			x,
			y,
			text: editingTextStr,
			direction: textDirection,
			fontSize: textFontSize,
			fontFamily: textFontFamily,
			color: textColor,
			strokeColor: textStrokeColor,
			strokeWidth: textStrokeWidth,
		};
		setTexts((prev) => [...prev, newText]);
		setSelectedTextId(newText.id);
		setShowTextModal(false);
	};

	// コマ枠プリセットの適用
	const handleApplyFramePreset = (template: FrameTemplate) => {
		saveHistorySnapshot();
		const boxes = generateFrameBoxes(template, CANVAS_WIDTH, CANVAS_HEIGHT);

		// コマ枠は専用レイヤーに描画する（アクティブレイヤーがどこであっても迷わない）
		const frameLayer =
			layersRef.current.find((l) => l.id === frameLayerIdRef.current) ??
			layersRef.current[activeLayerIndex];
		if (frameLayer) {
			// 前回のコマ枠を消してから描画し直す（そうしないと古い枠が残る）
			frameLayer.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
			drawFrames(frameLayer.ctx, boxes, frameBorderWidth);
			renderDisplay();
		}
		setFrameBoxes(boxes);
		// コマ割りが変わったら、既存のフキダシ/文字が新しいコマ内に収まるよう位置を補正する
		setBubbles((prev) =>
			prev.map((b) => {
				const c = clampRectToPanel(b.x, b.y, b.w, b.h, boxes, "center");
				return { ...b, x: c.x, y: c.y };
			}),
		);
		setTexts((prev) =>
			prev.map((t) => {
				const c = clampRectToPanel(t.x, t.y, 60, 200, boxes, "topLeft");
				return { ...t, x: c.x, y: c.y };
			}),
		);
		setShowFrameModal(false);
	};

	// 集中線の適用
	const handleApplyFocusLines = () => {
		saveHistorySnapshot();
		const curLayer = layersRef.current[activeLayerIndex];
		if (curLayer) {
			const config: FocusLineConfig = {
				cx: CANVAS_WIDTH / 2,
				cy: CANVAS_HEIGHT / 2,
				innerRadius: focusInnerRadius,
				maxRadius: Math.max(CANVAS_WIDTH, CANVAS_HEIGHT),
				lineCount: focusLineCount,
				lineWidth: 3,
				color: penColor,
			};
			drawFocusLines(curLayer.ctx, config);
			renderDisplay();
		}
		setShowEffectModal(false);
	};

	// 流線の適用
	const handleApplySpeedLines = (dir: "horizontal" | "vertical") => {
		saveHistorySnapshot();
		const curLayer = layersRef.current[activeLayerIndex];
		if (curLayer) {
			const config: SpeedLineConfig = {
				direction: dir,
				density: 18,
				lineWidth: 2,
				length: 300,
				color: penColor,
				width: CANVAS_WIDTH,
				height: CANVAS_HEIGHT,
			};
			drawSpeedLines(curLayer.ctx, config);
			renderDisplay();
		}
		setShowEffectModal(false);
	};

	// カスタムフォント登録
	const handleAddCustomFont = async () => {
		if (!newFontName.trim() || !newFontUrl.trim()) return;
		const font: MvCustomFont = { name: newFontName.trim(), url: newFontUrl.trim() };
		const updated = upsertCustomFont(font);
		setCustomFonts(updated);
		await ensureCustomFontLoaded(font.name, font.url);
		setTextFontFamily(font.name);
		setNewFontName("");
		setNewFontUrl("");
	};

	// 完成画像の保存 (PNG Data URL)
	// 選択中の内容は既にレイヤーcanvasへ描画済み(oekaki側で継続的に反映される)なので、
	// 保存前に特別な確定処理は不要
	const handleSave = () => {
		const finalCanvas = document.createElement("canvas");
		finalCanvas.width = CANVAS_WIDTH;
		finalCanvas.height = CANVAS_HEIGHT;
		const ctx = finalCanvas.getContext("2d")!;

		// 白背景
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		// レイヤー
		for (const layer of layersRef.current) {
			if (!layer.visible || layer.opacity <= 0) continue;
			ctx.save();
			ctx.globalAlpha = layer.opacity / 100;
			ctx.drawImage(layer.canvas, 0, 0);
			ctx.restore();
		}

		// フキダシ
		for (const b of bubbles) {
			drawBubble(ctx, b);
		}

		// テキスト
		for (const t of texts) {
			drawMangaText(ctx, t);
		}

		const dataUrl = finalCanvas.toDataURL("image/png");
		onSave(dataUrl);
	};

	// 画像としてエクスポート
	const handleExportPng = () => {
		const finalCanvas = document.createElement("canvas");
		finalCanvas.width = CANVAS_WIDTH;
		finalCanvas.height = CANVAS_HEIGHT;
		const ctx = finalCanvas.getContext("2d")!;
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		for (const layer of layersRef.current) {
			if (!layer.visible || layer.opacity <= 0) continue;
			ctx.save();
			ctx.globalAlpha = layer.opacity / 100;
			ctx.drawImage(layer.canvas, 0, 0);
			ctx.restore();
		}
		for (const b of bubbles) drawBubble(ctx, b);
		for (const t of texts) drawMangaText(ctx, t);

		exportSinglePng(finalCanvas, undefined, undefined, "manga.png");
	};

	return (
		<div className="fixed inset-0 z-50 flex flex-col bg-[#0b0e14] text-gray-200 select-none">
			{/* oekaki(レイヤーエンジン)の内部canvas群を隔離する非表示マウント先。画面には出さない */}
			<div ref={oekakiMountRef} style={{ display: "none" }} aria-hidden="true" />
			{/* トップバー */}
			<header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-800 bg-[#131720] px-3">
				<div className="flex items-center gap-2">
					<span className="font-bold text-sm md:text-base text-gray-100 flex items-center gap-1.5">
						<BookOpenIcon className="w-4 h-4 text-blue-400" />
						漫画エディタ
					</span>
					<span className="text-[10px] text-gray-500 hidden sm:inline">
						(800 × 1130px)
					</span>
				</div>

				{/* ズーム & Undo/Redo */}
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={handleUndo}
						disabled={!canUndo}
						className="p-1.5 rounded hover:bg-gray-700/50 disabled:opacity-30"
						title="元に戻す (Ctrl+Z)"
					>
						<Undo size={16} />
					</button>
					<button
						type="button"
						onClick={handleRedo}
						disabled={!canRedo}
						className="p-1.5 rounded hover:bg-gray-700/50 disabled:opacity-30"
						title="やり直す (Ctrl+Y)"
					>
						<Redo size={16} />
					</button>
					<div className="h-4 w-px bg-gray-700 mx-1" />
					<button
						type="button"
						onClick={handleCopySelection}
						disabled={!selectionRect}
						className="p-1.5 rounded hover:bg-gray-700/50 disabled:opacity-30"
						title="選択範囲をコピー (Ctrl+C)"
					>
						<Copy size={16} />
					</button>
					<button
						type="button"
						onClick={handlePasteSelection}
						disabled={!hasClipboard}
						className="p-1.5 rounded hover:bg-gray-700/50 disabled:opacity-30"
						title="貼り付け (Ctrl+V)"
					>
						<ClipboardPaste size={16} />
					</button>
					<div className="h-4 w-px bg-gray-700 mx-1" />
					<button
						type="button"
						onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
						className="p-1.5 rounded hover:bg-gray-700/50"
						title="縮小"
					>
						<ZoomOut size={16} />
					</button>
					<span className="text-xs w-10 text-center font-mono">
						{Math.round(zoom * 100)}%
					</span>
					<button
						type="button"
						onClick={() => setZoom((z) => Math.min(2.0, z + 0.1))}
						className="p-1.5 rounded hover:bg-gray-700/50"
						title="拡大"
					>
						<ZoomIn size={16} />
					</button>
				</div>

				{/* 保存 & 閉じる */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={handleExportPng}
						className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-gray-700 hover:bg-gray-700/40 text-gray-300 font-medium transition-colors"
						title="PNG画像として保存"
					>
						<Download size={14} />
						出力
					</button>
					<button
						type="button"
						onClick={handleSave}
						className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors"
					>
						<Save size={14} />
						投稿に添付
					</button>
					<button
						type="button"
						onClick={onClose}
						className="p-1 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white"
					>
						<X size={18} />
					</button>
				</div>
			</header>

			{/* メインエリア */}
			<div className="flex flex-1 min-h-0 overflow-hidden relative">
				{/* 左側ツールバー */}
				<aside className="w-14 shrink-0 flex flex-col items-center py-2.5 gap-2 border-r border-gray-800 bg-[#131720]/90 z-10">
					{/* ペン */}
					<ToolButton
						active={activeTool === "pen"}
						onClick={() => setActiveTool("pen")}
						title="ペン (Gペン風)"
						icon={<Pen size={18} />}
					/>
					{/* 消しゴム */}
					<ToolButton
						active={activeTool === "eraser"}
						onClick={() => setActiveTool("eraser")}
						title="消しゴム"
						icon={<Eraser size={18} />}
					/>
					{/* トーン */}
					<ToolButton
						active={activeTool === "tone"}
						onClick={() => {
							setActiveTool("tone");
							setShowToneModal(true);
						}}
						title="スクリーントーン"
						icon={<Grid2X2 size={18} />}
					/>
					{/* バケツ塗り */}
					<ToolButton
						active={activeTool === "bucket"}
						onClick={() => setActiveTool("bucket")}
						title="塗りつぶし (バケツ)"
						icon={<PaintBucket size={18} />}
					/>
					<div className="w-8 h-px bg-gray-800 my-1" />
					{/* フキダシ */}
					<ToolButton
						active={activeTool === "bubble"}
						onClick={() => {
							setActiveTool("bubble");
							setShowBubbleModal(true);
						}}
						title="フキダシ追加"
						icon={<MessageSquare size={18} />}
					/>
					{/* テキスト */}
					<ToolButton
						active={activeTool === "text"}
						onClick={() => {
							setActiveTool("text");
							setShowTextModal(true);
						}}
						title="文字挿入 (縦書き)"
						icon={<Type size={18} />}
					/>
					{/* コマ枠 */}
					<ToolButton
						active={activeTool === "frame"}
						onClick={() => {
							setActiveTool("frame");
							setShowFrameModal(true);
						}}
						title="コマ枠作成"
						icon={<FrameIcon className="w-4 h-4" />}
					/>
					{/* 集中線・効果線 */}
					<ToolButton
						active={activeTool === "effect"}
						onClick={() => {
							setActiveTool("effect");
							setShowEffectModal(true);
						}}
						title="効果線 (集中線・流線)"
						icon={<Zap size={18} />}
					/>
					{/* オブジェクト選択 */}
					<ToolButton
						active={activeTool === "select"}
						onClick={() => setActiveTool("select")}
						title="フキダシ/文字の選択・移動"
						icon={<Move size={18} />}
					/>
					{/* 範囲選択（コピー&ペースト用） */}
					<ToolButton
						active={activeTool === "rectSelect"}
						onClick={() => setActiveTool("rectSelect")}
						title="範囲選択 (コピー&ペースト)"
						icon={<Crop size={18} />}
					/>

					<div className="mt-auto flex flex-col items-center gap-2">
						{/* レイヤーパネル開閉 */}
						<button
							type="button"
							onClick={() => setShowLayersPanel((v) => !v)}
							className={`p-2 rounded-lg transition-colors ${showLayersPanel ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800"}`}
							title="レイヤーパネル"
						>
							<Layers size={18} />
						</button>
					</div>
				</aside>

				{/* キャンバス表示領域 */}
				<div
					ref={viewportRef}
					className="flex-1 overflow-auto bg-[#07090e] flex items-center justify-center p-4 relative"
				>
					<div
						style={{
							transform: `scale(${zoom})`,
							transformOrigin: "center center",
							width: CANVAS_WIDTH,
							height: CANVAS_HEIGHT,
						}}
						className="relative shrink-0 shadow-2xl transition-transform duration-75"
					>
						<canvas
							ref={displayCanvasRef}
							width={CANVAS_WIDTH}
							height={CANVAS_HEIGHT}
							onPointerDown={handlePointerDown}
							onPointerMove={handlePointerMove}
							onPointerUp={handlePointerUp}
							onPointerCancel={handlePointerUp}
							className="absolute inset-0 bg-white cursor-crosshair rounded shadow-lg touch-none"
						/>
					</div>

					{/* 選択中のオブジェクト操作バー */}
					{(selectedBubbleId || selectedTextId) && (
						<div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#131720]/95 border border-gray-700 px-3 py-1.5 rounded-full flex items-center gap-2 text-xs shadow-xl backdrop-blur-md">
							<span className="text-gray-400 font-bold">
								{selectedBubbleId ? "フキダシ選択中" : "文字選択中"} (ドラッグで移動)
							</span>
							<button
								type="button"
								onClick={() => {
									saveHistorySnapshot();
									if (selectedBubbleId) {
										setBubbles((prev) => prev.filter((b) => b.id !== selectedBubbleId));
										setSelectedBubbleId(null);
									}
									if (selectedTextId) {
										setTexts((prev) => prev.filter((t) => t.id !== selectedTextId));
										setSelectedTextId(null);
									}
								}}
								className="text-red-400 hover:text-red-300 flex items-center gap-1 font-bold pl-2 border-l border-gray-700"
							>
								<Trash2 size={13} />
								削除
							</button>
						</div>
					)}

					{/* 範囲選択の操作バー（コピー元 or 貼り付け直後） */}
					{selectionRect && activeTool === "rectSelect" && (
						<div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#131720]/95 border border-gray-700 px-3 py-1.5 rounded-full flex items-center gap-2 text-xs shadow-xl backdrop-blur-md">
							<span className="text-gray-400 font-bold">
								選択中 (ドラッグで移動・右下で拡縮・上のハンドルで回転)
							</span>
							<button
								type="button"
								onClick={handleDeleteSelection}
								className="text-red-400 hover:text-red-300 flex items-center gap-1 font-bold pl-2 border-l border-gray-700"
							>
								<Trash2 size={13} />
								削除
							</button>
							<button
								type="button"
								onClick={clearActiveSelection}
								className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold pl-2 border-l border-gray-700"
							>
								選択解除 (Esc)
							</button>
						</div>
					)}
				</div>

				{/* レイヤーパネル — DrawingEditorと同じ LayerPanel(oekaki.LayeredCanvas前提) を再利用。
				    表示は「一番上のレイヤーがリストの先頭」という一般的な並び順にするため、
				    実配列(layersRef、0=最背面)を反転して渡し、コールバックのindexは都度実indexへ変換する。 */}
				{showLayersPanel && (
					<LayerPanel
						layers={[...layerMetas].reverse().map(
							(l): LayerEntry => ({ instance: l.oekaki, name: l.name }),
						)}
						activeIndex={layerMetas.length - 1 - activeLayerIndex}
						onSelect={(panelIdx) => {
							setActiveLayerIndex(layersRef.current.length - 1 - panelIdx);
						}}
						onReorder={(panelFrom, panelTo) => {
							const len = layersRef.current.length;
							const realFrom = len - 1 - panelFrom;
							const realTo = len - 1 - panelTo;
							const arr = [...layersRef.current];
							const [moved] = arr.splice(realFrom, 1);
							arr.splice(realTo, 0, moved);
							layersRef.current = arr;
							setActiveLayerIndex((cur) => {
								if (cur === realFrom) return realTo;
								if (realFrom < cur && realTo >= cur) return cur - 1;
								if (realFrom > cur && realTo <= cur) return cur + 1;
								return cur;
							});
							// レイヤー構成(並び順)が変わるとUndo履歴のインデックス対応が崩れるため、安全のためクリアする
							undoStackRef.current = [];
							redoStackRef.current = [];
							setCanUndo(false);
							setCanRedo(false);
							setLayerMetas(
								arr.map((l) => ({
									id: l.id,
									name: l.name,
									visible: l.visible,
									opacity: l.opacity,
									oekaki: l.oekaki,
								})),
							);
							renderDisplay();
						}}
						onToggleVisibility={(panelIdx) => {
							const realIdx = layersRef.current.length - 1 - panelIdx;
							const l = layersRef.current[realIdx];
							if (!l) return;
							l.visible = !l.visible;
							l.oekaki.visible = l.visible;
							setLayerMetas(
								layersRef.current.map((ll) => ({
									id: ll.id,
									name: ll.name,
									visible: ll.visible,
									opacity: ll.opacity,
									oekaki: ll.oekaki,
								})),
							);
							renderDisplay();
						}}
						onToggleLock={(panelIdx) => {
							const realIdx = layersRef.current.length - 1 - panelIdx;
							const l = layersRef.current[realIdx];
							if (!l) return;
							l.oekaki.locked = !l.oekaki.locked;
							setLayerMetas(
								layersRef.current.map((ll) => ({
									id: ll.id,
									name: ll.name,
									visible: ll.visible,
									opacity: ll.opacity,
									oekaki: ll.oekaki,
								})),
							);
						}}
						onOpacityChange={(panelIdx, opacity) => {
							const realIdx = layersRef.current.length - 1 - panelIdx;
							const l = layersRef.current[realIdx];
							if (!l) return;
							l.opacity = opacity;
							l.oekaki.opacity = opacity;
							setLayerMetas(
								layersRef.current.map((ll) => ({
									id: ll.id,
									name: ll.name,
									visible: ll.visible,
									opacity: ll.opacity,
									oekaki: ll.oekaki,
								})),
							);
							renderDisplay();
						}}
						onAdd={() => {
							const name = `レイヤー ${layersRef.current.length + 1}`;
							const lc = new oekaki.LayeredCanvas(name);
							const newLayer: CanvasLayer = {
								id: lc.uuid,
								name,
								canvas: lc.canvas,
								ctx: lc.ctx,
								visible: true,
								opacity: 100,
								oekaki: lc,
							};
							layersRef.current.push(newLayer);
							setLayerMetas(
								layersRef.current.map((l) => ({
									id: l.id,
									name: l.name,
									visible: l.visible,
									opacity: l.opacity,
									oekaki: l.oekaki,
								})),
							);
							setActiveLayerIndex(layersRef.current.length - 1);
							renderDisplay();
						}}
						onDelete={(panelIdx) => {
							if (layersRef.current.length <= 1) return;
							const realIdx = layersRef.current.length - 1 - panelIdx;
							const arr = layersRef.current.filter((_, idx) => idx !== realIdx);
							layersRef.current = arr;
							let newIdx = activeLayerIndex;
							if (newIdx >= arr.length) newIdx = arr.length - 1;
							if (realIdx < activeLayerIndex) newIdx--;
							if (newIdx < 0) newIdx = 0;
							setActiveLayerIndex(newIdx);
							// レイヤー構成が変わるとUndo履歴のインデックス対応が崩れるため、安全のためクリアする
							undoStackRef.current = [];
							redoStackRef.current = [];
							setCanUndo(false);
							setCanRedo(false);
							setLayerMetas(
								arr.map((l) => ({
									id: l.id,
									name: l.name,
									visible: l.visible,
									opacity: l.opacity,
									oekaki: l.oekaki,
								})),
							);
							renderDisplay();
						}}
						onClose={() => setShowLayersPanel(false)}
					/>
				)}
			</div>

			{/* 下部プロパティバー（スマホでは選択肢が増えると折り返す） */}
			<footer className="min-h-10 shrink-0 border-t border-gray-800 bg-[#131720] px-3 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 justify-between text-xs text-gray-400">
				<div className="flex flex-wrap items-center gap-4">
					{activeTool === "pen" && (
						<div className="flex items-center gap-2">
							<span>ペンの太さ:</span>
							<input
								type="range"
								min="1"
								max="32"
								value={penSize}
								onChange={(e) => setPenSize(Number(e.target.value))}
								className="w-24 accent-blue-500"
							/>
							<span className="font-mono w-6 text-gray-200">{penSize}px</span>
							<div className="flex items-center gap-1.5 ml-2">
								{(["#000000", "#ef4444", "#3b82f6", "#ffffff"] as const).map((c) => (
									<button
										key={c}
										type="button"
										onClick={() => setPenColor(c)}
										style={{ backgroundColor: c }}
										className={`w-7 h-7 rounded-full border ${penColor === c ? "border-blue-500 ring-2 ring-blue-400" : "border-gray-600"}`}
										title={`色: ${c}`}
									/>
								))}
							</div>
						</div>
					)}
					{activeTool === "eraser" && (
						<div className="flex items-center gap-2">
							<span>消しゴム太さ:</span>
							<input
								type="range"
								min="4"
								max="80"
								value={eraserSize}
								onChange={(e) => setEraserSize(Number(e.target.value))}
								className="w-24 accent-blue-500"
							/>
							<span className="font-mono w-6 text-gray-200">{eraserSize}px</span>
						</div>
					)}
					{activeTool === "tone" && (
						<div className="flex items-center gap-2">
							<span>トーン太さ:</span>
							<input
								type="range"
								min="8"
								max="64"
								value={toneBrushSize}
								onChange={(e) => setToneBrushSize(Number(e.target.value))}
								className="w-24 accent-blue-500"
							/>
							<span className="font-mono w-6 text-gray-200">{toneBrushSize}px</span>
							<button
								type="button"
								onClick={() => setShowToneModal(true)}
								className="ml-2 px-2.5 py-1.5 rounded-md bg-gray-800 text-blue-400 border border-gray-700 hover:bg-gray-700 active:bg-gray-700 font-bold"
							>
								トーン変更 ({TONE_DEFINITIONS.find((t) => t.id === activeTone)?.name})
							</button>
						</div>
					)}
				</div>
				<div className="text-[11px] text-gray-500">
					選択中のレイヤー: {layerMetas[activeLayerIndex]?.name ?? "なし"}
				</div>
			</footer>

			{/* --- モーダル群 --- */}

			{/* 1. スクリーントーン選択モーダル */}
			{showToneModal && (
				<ModalOverlay onClose={() => setShowToneModal(false)} title="スクリーントーン選択">
					<div className="grid grid-cols-3 gap-2 py-2">
						{TONE_DEFINITIONS.map((def) => {
							const isSel = activeTone === def.id;
							return (
								<button
									key={def.id}
									type="button"
									onClick={() => {
										setActiveTone(def.id);
										setShowToneModal(false);
									}}
									className={`flex flex-col items-center p-3 rounded-lg border text-left transition-all ${isSel ? "border-blue-500 bg-blue-500/20 text-white font-bold" : "border-gray-700 bg-gray-800/60 hover:bg-gray-800 text-gray-300"}`}
								>
									<span className="text-xs">{def.name}</span>
									<span className="text-[10px] text-gray-400 mt-1">{def.description}</span>
								</button>
							);
						})}
					</div>
				</ModalOverlay>
			)}

			{/* 2. フキダシ設定モーダル */}
			{showBubbleModal && (
				<ModalOverlay onClose={() => setShowBubbleModal(false)} title="フキダシを追加">
					<div className="space-y-4 py-2 text-xs">
						<div>
							<label className="block text-gray-400 font-bold mb-1.5">形状</label>
							<div className="grid grid-cols-2 gap-2">
								{(
									[
										{ id: "ellipse", label: "通常 (会話・楕円)" },
										{ id: "roundRect", label: "四角 (モノローグ)" },
										{ id: "shout", label: "ウニフラ (叫び・怒り)" },
										{ id: "thought", label: "モコモコ (思考・回想)" },
									] as const
								).map((s) => (
									<button
										key={s.id}
										type="button"
										onClick={() => setBubbleShape(s.id)}
										className={`py-2 px-3 rounded border text-center transition-colors ${bubbleShape === s.id ? "border-blue-500 bg-blue-600/30 text-white font-bold" : "border-gray-700 bg-gray-800/40 text-gray-300 hover:bg-gray-800"}`}
									>
										{s.label}
									</button>
								))}
							</div>
						</div>

						{bubbleShape !== "shout" && (
							<div>
								<label className="block text-gray-400 font-bold mb-1.5">しっぽの向き</label>
								<div className="grid grid-cols-3 gap-2">
									{(
										[
											{ id: "bottom-left", label: "左下" },
											{ id: "bottom", label: "下" },
											{ id: "bottom-right", label: "右下" },
											{ id: "left", label: "左" },
											{ id: "right", label: "右" },
											{ id: "none", label: "なし" },
										] as const
									).map((t) => (
										<button
											key={t.id}
											type="button"
											onClick={() => setBubbleTail(t.id)}
											className={`py-1.5 px-2 rounded border text-center transition-colors ${bubbleTail === t.id ? "border-blue-500 bg-blue-600/30 text-white font-bold" : "border-gray-700 bg-gray-800/40 text-gray-300 hover:bg-gray-800"}`}
										>
											{t.label}
										</button>
									))}
								</div>
							</div>
						)}

						<button
							type="button"
							onClick={handleAddBubble}
							className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors"
						>
							フキダシを配置
						</button>
					</div>
				</ModalOverlay>
			)}

			{/* 3. 文字挿入モーダル */}
			{showTextModal && (
				<ModalOverlay onClose={() => setShowTextModal(false)} title="文字挿入 (セリフ)">
					<div className="space-y-4 py-2 text-xs">
						<div>
							<label className="block text-gray-400 font-bold mb-1.5">セリフ内容</label>
							<textarea
								value={editingTextStr}
								onChange={(e) => setEditingTextStr(e.target.value)}
								rows={4}
								className="w-full rounded bg-gray-800 border border-gray-700 p-2 text-gray-100 focus:outline-none focus:border-blue-500 resize-none font-sans"
								placeholder="セリフを入力してください..."
							/>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-gray-400 font-bold mb-1">文字方向</label>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => setTextDirection("vertical")}
										className={`flex-1 py-1.5 rounded border text-center transition-colors ${textDirection === "vertical" ? "border-blue-500 bg-blue-600/30 text-white font-bold" : "border-gray-700 bg-gray-800/40 text-gray-300 hover:bg-gray-800"}`}
									>
										縦書き (標準)
									</button>
									<button
										type="button"
										onClick={() => setTextDirection("horizontal")}
										className={`flex-1 py-1.5 rounded border text-center transition-colors ${textDirection === "horizontal" ? "border-blue-500 bg-blue-600/30 text-white font-bold" : "border-gray-700 bg-gray-800/40 text-gray-300 hover:bg-gray-800"}`}
									>
										横書き
									</button>
								</div>
							</div>

							<div>
								<label className="block text-gray-400 font-bold mb-1">文字サイズ</label>
								<div className="flex items-center gap-2">
									<input
										type="range"
										min="14"
										max="64"
										value={textFontSize}
										onChange={(e) => setTextFontSize(Number(e.target.value))}
										className="w-full accent-blue-500"
									/>
									<span className="font-mono w-8 text-gray-200">{textFontSize}px</span>
								</div>
							</div>
						</div>

						<div>
							<label className="block text-gray-400 font-bold mb-1">文字のフチ取り (白フチ)</label>
							<div className="flex items-center gap-2">
								<input
									type="range"
									min="0"
									max="8"
									value={textStrokeWidth}
									onChange={(e) => setTextStrokeWidth(Number(e.target.value))}
									className="w-full accent-blue-500"
								/>
								<span className="font-mono w-8 text-gray-200">{textStrokeWidth}px</span>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-gray-400 font-bold mb-1">文字色</label>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => setTextColor("#000000")}
										className={`flex-1 py-1 rounded border text-center ${textColor === "#000000" ? "border-blue-500 bg-gray-800 text-white font-bold" : "border-gray-700 text-gray-400"}`}
									>
										黒
									</button>
									<button
										type="button"
										onClick={() => setTextColor("#ffffff")}
										className={`flex-1 py-1 rounded border text-center ${textColor === "#ffffff" ? "border-blue-500 bg-gray-800 text-white font-bold" : "border-gray-700 text-gray-400"}`}
									>
										白
									</button>
								</div>
							</div>
							<div>
								<label className="block text-gray-400 font-bold mb-1">フチ色</label>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => setTextStrokeColor("#ffffff")}
										className={`flex-1 py-1 rounded border text-center ${textStrokeColor === "#ffffff" ? "border-blue-500 bg-gray-800 text-white font-bold" : "border-gray-700 text-gray-400"}`}
									>
										白フチ
									</button>
									<button
										type="button"
										onClick={() => setTextStrokeColor("#000000")}
										className={`flex-1 py-1 rounded border text-center ${textStrokeColor === "#000000" ? "border-blue-500 bg-gray-800 text-white font-bold" : "border-gray-700 text-gray-400"}`}
									>
										黒フチ
									</button>
								</div>
							</div>
						</div>

						<div>
							<label className="block text-gray-400 font-bold mb-1">フォント選択</label>
							<select
								value={textFontFamily}
								onChange={(e) => setTextFontFamily(e.target.value)}
								className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-gray-200"
							>
								<optgroup label="プリセットフォント">
									{PRESET_FONTS.map((f) => (
										<option key={f.value} value={f.value}>
											{f.label}
										</option>
									))}
								</optgroup>
								{customFonts.length > 0 && (
									<optgroup label="登録済みカスタムフォント">
										{customFonts.map((f) => (
											<option key={f.name} value={f.name}>
												{f.name}
											</option>
										))}
									</optgroup>
								)}
							</select>
						</div>

						{/* カスタムフォント登録欄 */}
						<div className="pt-2 border-t border-gray-800">
							<p className="text-[11px] text-gray-400 mb-1.5 font-bold">WebフォントURLを追加</p>
							<div className="flex gap-2">
								<input
									type="text"
									placeholder="フォント名"
									value={newFontName}
									onChange={(e) => setNewFontName(e.target.value)}
									className="w-1/3 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-200"
								/>
								<input
									type="text"
									placeholder="フォントURL (.woff2など)"
									value={newFontUrl}
									onChange={(e) => setNewFontUrl(e.target.value)}
									className="flex-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-200"
								/>
								<button
									type="button"
									onClick={handleAddCustomFont}
									className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white font-bold"
								>
									追加
								</button>
							</div>
						</div>

						<button
							type="button"
							onClick={handleAddText}
							className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors"
						>
							文字を配置
						</button>
					</div>
				</ModalOverlay>
			)}

			{/* 4. コマ枠作成モーダル */}
			{showFrameModal && (
				<ModalOverlay onClose={() => setShowFrameModal(false)} title="コマ枠の作成">
					<div className="space-y-4 py-2 text-xs">
						<p className="text-gray-400">
							「コマ枠」レイヤーに描画します。適用すると、それまでのコマ枠は消えて置き換わります。
						</p>
						<div>
							<label className="block text-gray-400 font-bold mb-1">枠線の太さ</label>
							<div className="flex gap-2">
								{([2, 4, 6] as const).map((w) => (
									<button
										key={w}
										type="button"
										onClick={() => setFrameBorderWidth(w)}
										className={`flex-1 py-1.5 rounded border text-center font-mono transition-colors ${frameBorderWidth === w ? "border-blue-500 bg-blue-600/30 text-white font-bold" : "border-gray-700 bg-gray-800/40 text-gray-300"}`}
									>
										{w}px {w === 4 ? "(標準)" : ""}
									</button>
								))}
							</div>
						</div>
						<div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-0.5">
							{(
								[
									{
										id: "4koma",
										label: "4コマ漫画",
										desc: "等間隔の4段コマ枠",
									},
									{
										id: "3rows",
										label: "3段分割",
										desc: "均等な3段の縦積み",
									},
									{
										id: "2rows",
										label: "2段分割",
										desc: "上下の大きな2コマ枠",
									},
									{
										id: "single",
										label: "全画面単一枠",
										desc: "外枠マージンのみ",
									},
									{
										id: "topWideBottomTwo",
										label: "上1・下2",
										desc: "広いコマ+下段に並列2コマ",
									},
									{
										id: "topTwoBottomWide",
										label: "上2・下1",
										desc: "並列2コマ+締めの広いコマ",
									},
									{
										id: "grid2x2",
										label: "2x2グリッド",
										desc: "均等4分割（縦横2列）",
									},
									{
										id: "threeCol",
										label: "横3分割",
										desc: "テンポの速いカット割り",
									},
									{
										id: "dynamicMix",
										label: "大小混在",
										desc: "広い→速いカット→大小の実践的な割り",
									},
								] as const
							).map((p) => (
								<button
									key={p.id}
									type="button"
									onClick={() => handleApplyFramePreset(p.id)}
									className="py-3 px-4 rounded border border-gray-700 bg-gray-800/40 hover:bg-gray-800 active:bg-gray-800 text-left"
								>
									<div className="font-bold text-gray-200 mb-1">{p.label}</div>
									<div className="text-[10px] text-gray-500">{p.desc}</div>
								</button>
							))}
						</div>
					</div>
				</ModalOverlay>
			)}

			{/* 5. 効果線モーダル */}
			{showEffectModal && (
				<ModalOverlay onClose={() => setShowEffectModal(false)} title="効果線 (演出)">
					<div className="space-y-4 py-2 text-xs">
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => setEffectType("focus")}
								className={`flex-1 py-1.5 rounded border text-center transition-colors ${effectType === "focus" ? "border-blue-500 bg-blue-600/30 text-white font-bold" : "border-gray-700 bg-gray-800/40 text-gray-300"}`}
							>
								集中線
							</button>
							<button
								type="button"
								onClick={() => setEffectType("speed")}
								className={`flex-1 py-1.5 rounded border text-center transition-colors ${effectType === "speed" ? "border-blue-500 bg-blue-600/30 text-white font-bold" : "border-gray-700 bg-gray-800/40 text-gray-300"}`}
							>
								流線 (スピード線)
							</button>
						</div>

						{effectType === "focus" ? (
							<div className="space-y-3">
								<div>
									<label className="block text-gray-400 font-bold mb-1">線の本数・密度</label>
									<input
										type="range"
										min="40"
										max="160"
										value={focusLineCount}
										onChange={(e) => setFocusLineCount(Number(e.target.value))}
										className="w-full accent-blue-500"
									/>
								</div>
								<div>
									<label className="block text-gray-400 font-bold mb-1">中心の抜き半径 (顔などの余白)</label>
									<input
										type="range"
										min="40"
										max="200"
										value={focusInnerRadius}
										onChange={(e) => setFocusInnerRadius(Number(e.target.value))}
										className="w-full accent-blue-500"
									/>
								</div>
								<button
									type="button"
									onClick={handleApplyFocusLines}
									className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold"
								>
									集中線をレイヤーにスタンプ
								</button>
							</div>
						) : (
							<div className="space-y-3">
								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={() => handleApplySpeedLines("horizontal")}
										className="py-2.5 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold"
									>
										横方向の流線
									</button>
									<button
										type="button"
										onClick={() => handleApplySpeedLines("vertical")}
										className="py-2.5 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold"
									>
										縦方向の流線
									</button>
								</div>
							</div>
						)}
					</div>
				</ModalOverlay>
			)}
		</div>
	);
}

// ツールバーボタン補助
function ToolButton({
	active,
	onClick,
	title,
	icon,
}: {
	active: boolean;
	onClick: () => void;
	title: string;
	icon: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`p-2.5 rounded-xl transition-all relative group ${active ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"}`}
			title={title}
		>
			{icon}
			<span className="sr-only">{title}</span>
		</button>
	);
}

// モーダル共通オーバーレイ
function ModalOverlay({
	children,
	onClose,
	title,
}: {
	children: React.ReactNode;
	onClose: () => void;
	title: string;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="w-full max-w-md bg-[#131720] border border-gray-700 rounded-xl shadow-2xl p-4 animate-scale-in">
				<div className="flex items-center justify-between pb-3 border-b border-gray-800">
					<h3 className="font-bold text-sm text-gray-100">{title}</h3>
					<button
						type="button"
						onClick={onClose}
						className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800"
					>
						<X size={16} />
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}

function BookOpenIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
			<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
		</svg>
	);
}

function FrameIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<rect width="18" height="18" x="3" y="3" rx="2" />
			<line x1="3" x2="21" y1="9" y2="9" />
			<line x1="9" x2="9" y1="21" y2="9" />
		</svg>
	);
}
