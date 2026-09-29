"use client";

import {
	type Dispatch,
	type ReactNode,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

type Props = {
	zoom: number;
	setZoom: Dispatch<SetStateAction<number>>;
	/** キャンバスを差し込む要素（transform で拡大する） */
	mountRef: RefObject<HTMLDivElement | null>;
	mountClassName?: string;
	className?: string;
	/** 中身の余白（既定 p-4） */
	padClassName?: string;
	minZoom?: number;
	maxZoom?: number;
	step?: number;
	onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
	onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
	onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
	onPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void;
	onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
	onDragLeave?: (e: React.DragEvent<HTMLDivElement>) => void;
	onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
	children?: ReactNode;
};

/**
 * お絵描きエディタのキャンバス表示領域。
 * 拡大後のサイズぶんの箱を置いてスクロールできるようにする
 * （overflow-hidden の中で transform するだけだと、はみ出した上端・左端へ行けない）。
 * ホイールはカーソル位置を中心に拡大縮小、中ボタンドラッグでスクロール。
 */
export default function ZoomScrollArea({
	zoom,
	setZoom,
	mountRef,
	mountClassName = "",
	className = "",
	padClassName = "p-4",
	minZoom = 0.25,
	maxZoom = 4,
	step = 0.25,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	onPointerCancel,
	onDragOver,
	onDragLeave,
	onDrop,
	children,
}: Props) {
	const areaRef = useRef<HTMLDivElement>(null);
	const sizerRef = useRef<HTMLDivElement>(null);
	const [natural, setNatural] = useState({ w: 0, h: 0 });
	const zoomRef = useRef(zoom);
	// ホイール拡大の基準点（キャンバス上の原寸座標と、それを置きたい画面座標）
	const anchorRef = useRef<{
		px: number;
		py: number;
		cx: number;
		cy: number;
	} | null>(null);
	const panRef = useRef<{
		id: number;
		x: number;
		y: number;
		sl: number;
		st: number;
	} | null>(null);

	// transform は offsetWidth に効かないので、原寸はそのまま測れる
	const measure = useCallback(() => {
		const el = mountRef.current;
		if (!el) return;
		setNatural((prev) =>
			prev.w === el.offsetWidth && prev.h === el.offsetHeight
				? prev
				: { w: el.offsetWidth, h: el.offsetHeight },
		);
	}, [mountRef]);

	useEffect(() => {
		const el = mountRef.current;
		if (!el) return;
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, [mountRef, measure]);

	useLayoutEffect(() => {
		zoomRef.current = zoom;
		const anchor = anchorRef.current;
		const area = areaRef.current;
		const sizer = sizerRef.current;
		anchorRef.current = null;
		if (!anchor || !area || !sizer) return;
		const rect = sizer.getBoundingClientRect();
		area.scrollLeft += rect.left + anchor.px * zoom - anchor.cx;
		area.scrollTop += rect.top + anchor.py * zoom - anchor.cy;
	}, [zoom, natural]);

	useEffect(() => {
		const el = areaRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const prev = zoomRef.current;
			const next = Math.min(
				maxZoom,
				Math.max(
					minZoom,
					Math.round((prev + (e.deltaY < 0 ? step : -step)) * 100) / 100,
				),
			);
			if (next === prev) return;
			const sizer = sizerRef.current;
			if (sizer) {
				const rect = sizer.getBoundingClientRect();
				anchorRef.current = {
					px: (e.clientX - rect.left) / prev,
					py: (e.clientY - rect.top) / prev,
					cx: e.clientX,
					cy: e.clientY,
				};
			}
			zoomRef.current = next;
			// ResizeObserver が遅れても拡大後の箱の大きさがずれないよう、ここでも測る
			measure();
			setZoom(next);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [setZoom, measure, minZoom, maxZoom, step]);

	return (
		<div
			ref={areaRef}
			data-zoom-area=""
			className={`min-h-0 min-w-0 overflow-auto ${className}`}
			onPointerDown={(e) => {
				if (e.button === 1 && areaRef.current) {
					e.preventDefault();
					panRef.current = {
						id: e.pointerId,
						x: e.clientX,
						y: e.clientY,
						sl: areaRef.current.scrollLeft,
						st: areaRef.current.scrollTop,
					};
					e.currentTarget.setPointerCapture(e.pointerId);
					return;
				}
				onPointerDown?.(e);
			}}
			onPointerMove={(e) => {
				const pan = panRef.current;
				if (pan && pan.id === e.pointerId && areaRef.current) {
					areaRef.current.scrollLeft = pan.sl - (e.clientX - pan.x);
					areaRef.current.scrollTop = pan.st - (e.clientY - pan.y);
					return;
				}
				onPointerMove?.(e);
			}}
			onPointerUp={(e) => {
				if (panRef.current?.id === e.pointerId) {
					panRef.current = null;
					return;
				}
				onPointerUp?.(e);
			}}
			onPointerCancel={(e) => {
				if (panRef.current?.id === e.pointerId) {
					panRef.current = null;
					return;
				}
				onPointerCancel?.(e);
			}}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
			onContextMenu={(e) => e.preventDefault()}
		>
			{/* 小さい時は中央寄せ、大きい時は左上から全域スクロールできる */}
			<div
				className={`flex min-h-full min-w-full w-max items-center justify-center ${padClassName}`}
			>
				<div
					ref={sizerRef}
					className="relative shrink-0"
					style={{ width: natural.w * zoom, height: natural.h * zoom }}
				>
					<div
						ref={mountRef}
						// エディタ側が className を丸ごと書き換えるので、配置は style で持つ。
						// lineHeight 0 はキャンバス下の行送りぶんの隙間（スクロール範囲が数px伸びる）を消すため
						className={`inline-block ${mountClassName}`}
						style={{
							position: "absolute",
							left: 0,
							top: 0,
							lineHeight: 0,
							transform: `scale(${zoom})`,
							transformOrigin: "0 0",
						}}
					/>
				</div>
			</div>
			{children}
		</div>
	);
}
