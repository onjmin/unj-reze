"use client";

import {
	Check,
	FlipHorizontal,
	MoveHorizontal,
	MoveVertical,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tryCapturePointer } from "@/lib/pointer-capture";

interface CropAvatarModalProps {
	imageSrc: string;
	onCancel: () => void;
	onConfirm: (dataUrl: string) => void;
}

// クロップ枠のCSS表示サイズと、書き出しキャンバスの実ピクセルサイズ。
// FRAME_SIZE基準でパン・ズームの座標計算を行い、confirm時にOUTPUT_SIZEへスケールする。
const FRAME_SIZE = 240;
const OUTPUT_SIZE = 320;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export default function CropAvatarModal({
	imageSrc,
	onCancel,
	onConfirm,
}: CropAvatarModalProps) {
	const imgElRef = useRef<HTMLImageElement | null>(null);
	const [naturalSize, setNaturalSize] = useState<{
		w: number;
		h: number;
	} | null>(null);
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [isFlipped, setIsFlipped] = useState(false);

	const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
	const pinchStartDistRef = useRef<number | null>(null);
	const pinchStartZoomRef = useRef(1);
	const dragStartRef = useRef<{
		x: number;
		y: number;
		panX: number;
		panY: number;
	} | null>(null);

	useEffect(() => {
		const img = new window.Image();
		img.onload = () => {
			imgElRef.current = img;
			setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
			setZoom(1);
			setPan({ x: 0, y: 0 });
			setIsFlipped(false);
		};
		img.src = imageSrc;
	}, [imageSrc]);

	// フレームを常に埋めるための基準スケール（cover-fit）。
	const baseScale = naturalSize
		? FRAME_SIZE / Math.min(naturalSize.w, naturalSize.h)
		: 1;

	const clampPan = useCallback(
		(next: { x: number; y: number }, currentZoom: number) => {
			if (!naturalSize) return next;
			const scale = baseScale * currentZoom;
			const imgW = naturalSize.w * scale;
			const imgH = naturalSize.h * scale;
			const maxX = Math.max(0, (imgW - FRAME_SIZE) / 2);
			const maxY = Math.max(0, (imgH - FRAME_SIZE) / 2);
			return {
				x: Math.min(maxX, Math.max(-maxX, next.x)),
				y: Math.min(maxY, Math.max(-maxY, next.y)),
			};
		},
		[naturalSize, baseScale],
	);

	const applyZoom = useCallback(
		(next: number) => {
			const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
			setZoom(clamped);
			setPan((p) => clampPan(p, clamped));
		},
		[clampPan],
	);

	// 位置スライダーの可動範囲（現在のズームでフレームが常に埋まる限界値）。
	const panBounds = useMemo(() => {
		if (!naturalSize) return { maxX: 0, maxY: 0 };
		const scale = baseScale * zoom;
		const imgW = naturalSize.w * scale;
		const imgH = naturalSize.h * scale;
		return {
			maxX: Math.max(0, (imgW - FRAME_SIZE) / 2),
			maxY: Math.max(0, (imgH - FRAME_SIZE) / 2),
		};
	}, [naturalSize, baseScale, zoom]);

	const applyPanX = (x: number) => setPan((p) => clampPan({ ...p, x }, zoom));
	const applyPanY = (y: number) => setPan((p) => clampPan({ ...p, y }, zoom));

	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault();
		applyZoom(zoom - e.deltaY * 0.0015);
	};

	const handlePointerDown = (e: React.PointerEvent) => {
		tryCapturePointer(e.target as Element, e.pointerId);
		pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointersRef.current.size === 1) {
			dragStartRef.current = {
				x: e.clientX,
				y: e.clientY,
				panX: pan.x,
				panY: pan.y,
			};
		} else if (pointersRef.current.size === 2) {
			dragStartRef.current = null;
			const [p1, p2] = Array.from(pointersRef.current.values());
			pinchStartDistRef.current = Math.hypot(p2.x - p1.x, p2.y - p1.y);
			pinchStartZoomRef.current = zoom;
		}
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		if (!pointersRef.current.has(e.pointerId)) return;
		pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (pointersRef.current.size === 1 && dragStartRef.current) {
			const dx = e.clientX - dragStartRef.current.x;
			const dy = e.clientY - dragStartRef.current.y;
			setPan(
				clampPan(
					{
						x: dragStartRef.current.panX + dx,
						y: dragStartRef.current.panY + dy,
					},
					zoom,
				),
			);
		} else if (pointersRef.current.size === 2 && pinchStartDistRef.current) {
			const [p1, p2] = Array.from(pointersRef.current.values());
			const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
			applyZoom(pinchStartZoomRef.current * (dist / pinchStartDistRef.current));
		}
	};

	const handlePointerUp = (e: React.PointerEvent) => {
		pointersRef.current.delete(e.pointerId);
		pinchStartDistRef.current = null;
		dragStartRef.current = null;
		if (pointersRef.current.size === 1) {
			const [only] = Array.from(pointersRef.current.entries());
			dragStartRef.current = {
				x: only[1].x,
				y: only[1].y,
				panX: pan.x,
				panY: pan.y,
			};
		}
	};

	const handleConfirm = () => {
		const img = imgElRef.current;
		if (!img || !naturalSize) return;
		const canvas = document.createElement("canvas");
		canvas.width = OUTPUT_SIZE;
		canvas.height = OUTPUT_SIZE;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const factor = OUTPUT_SIZE / FRAME_SIZE;
		const scale = baseScale * zoom * factor;
		const imgW = naturalSize.w * scale;
		const imgH = naturalSize.h * scale;
		const cx = OUTPUT_SIZE / 2 + pan.x * factor;
		const cy = OUTPUT_SIZE / 2 + pan.y * factor;

		ctx.save();
		if (isFlipped) {
			ctx.translate(cx, cy);
			ctx.scale(-1, 1);
			ctx.translate(-cx, -cy);
		}
		ctx.drawImage(img, cx - imgW / 2, cy - imgH / 2, imgW, imgH);
		ctx.restore();
		onConfirm(canvas.toDataURL("image/png"));
	};

	const displayScale = baseScale * zoom;

	return (
		<div
			className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-scale-in max-h-[90vh]">
				{/* ヘッダー (固定) */}
				<div className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
					<span className="font-bold text-sm text-gray-200">
						アイコンを調整
					</span>
					<button
						onClick={onCancel}
						className="text-gray-400 hover:text-white transition-colors"
					>
						<X size={16} />
					</button>
				</div>

				{/* 調整領域 (溢れた場合のみ縦スクロール) */}
				<div className="p-5 flex flex-col items-center space-y-4 overflow-y-auto flex-1 scrollbar-thin">
					<div
						className="relative rounded-full overflow-hidden border-2 border-gray-700 bg-gray-950 touch-none cursor-grab active:cursor-grabbing select-none shrink-0"
						style={{ width: FRAME_SIZE, height: FRAME_SIZE }}
						onWheel={handleWheel}
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerCancel={handlePointerUp}
					>
						{naturalSize && (
							<img
								src={imageSrc}
								alt="crop preview"
								draggable={false}
								className="absolute top-1/2 left-1/2 max-w-none pointer-events-none"
								style={{
									width: naturalSize.w * displayScale,
									height: naturalSize.h * displayScale,
									transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scaleX(${isFlipped ? -1 : 1})`,
								}}
							/>
						)}
					</div>

					<div className="w-full flex items-center gap-2.5">
						<button
							onClick={() => applyZoom(zoom - 0.25)}
							className="w-7 h-7 rounded-full flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 transition-colors shrink-0"
						>
							<ZoomOut size={13} />
						</button>
						<input
							type="range"
							min={MIN_ZOOM}
							max={MAX_ZOOM}
							step={0.01}
							value={zoom}
							onChange={(e) => applyZoom(parseFloat(e.target.value))}
							className="flex-1 accent-blue-500"
						/>
						<button
							onClick={() => applyZoom(zoom + 0.25)}
							className="w-7 h-7 rounded-full flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 transition-colors shrink-0"
						>
							<ZoomIn size={13} />
						</button>
					</div>

					<div className="w-full flex items-center gap-2.5">
						<MoveHorizontal size={13} className="text-gray-400 shrink-0" />
						<input
							type="range"
							min={-panBounds.maxX}
							max={panBounds.maxX}
							step={0.5}
							value={pan.x}
							disabled={panBounds.maxX === 0}
							onChange={(e) => applyPanX(parseFloat(e.target.value))}
							className="flex-1 accent-blue-500 disabled:opacity-40"
						/>
					</div>
					<div className="w-full flex items-center gap-2.5">
						<MoveVertical size={13} className="text-gray-400 shrink-0" />
						<input
							type="range"
							min={-panBounds.maxY}
							max={panBounds.maxY}
							step={0.5}
							value={pan.y}
							disabled={panBounds.maxY === 0}
							onChange={(e) => applyPanY(parseFloat(e.target.value))}
							className="flex-1 accent-blue-500 disabled:opacity-40"
						/>
					</div>

					<div className="w-full flex items-center justify-between gap-2.5 pt-1">
						<span className="text-xs text-gray-400 flex items-center gap-1.5 select-none">
							<FlipHorizontal size={13} />
							左右反転
						</span>
						<button
							type="button"
							onClick={() => setIsFlipped(!isFlipped)}
							className={`text-xs font-bold px-3 py-1 rounded-full transition-all border ${
								isFlipped
									? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20"
									: "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
							}`}
						>
							{isFlipped ? "オン" : "オフ"}
						</button>
					</div>

					<p className="text-[10px] text-gray-500 text-center">
						ドラッグやスライダーで位置を調整・ピンチ/ホイールで拡大縮小できます
					</p>
				</div>

				{/* フッター (固定) */}
				<div className="p-4 border-t border-gray-800 flex justify-end items-center space-x-2 shrink-0 bg-gray-900">
					<button
						onClick={onCancel}
						className="text-gray-400 font-bold px-4 py-1.5 rounded-full text-xs hover:bg-gray-100/10 transition-colors"
					>
						キャンセル
					</button>
					<button
						onClick={handleConfirm}
						disabled={!naturalSize}
						className="bg-blue-600 text-white font-bold px-4 py-1.5 rounded-full text-xs hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-1.5"
					>
						<Check size={13} />
						決定
					</button>
				</div>
			</div>
		</div>
	);
}
