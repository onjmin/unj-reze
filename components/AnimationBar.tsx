"use client";

import {
	ChevronLeft,
	ChevronRight,
	Copy,
	CopyPlus,
	Eye,
	EyeOff,
	Film,
	Pause,
	Play,
	Plus,
	Trash2,
} from "lucide-react";
import { useRef, useState } from "react";

export interface FrameData {
	id?: number;
	layers: {
		name: string;
		visible: boolean;
		locked: boolean;
		opacity: number;
		data: Uint8ClampedArray;
	}[];
}

export interface AnimationBarFrame {
	id: number;
	color: string;
}

export function computeFrameColor(
	layers: {
		data?: Uint8ClampedArray;
		visible?: boolean;
		opacity?: number;
	}[],
): string {
	let hash = 0x811c9dc5;
	let hasPixels = false;
	for (const l of layers) {
		if (l.visible === false || (l.opacity !== undefined && l.opacity <= 0))
			continue;
		const d = l.data;
		if (!d || d.length === 0) continue;
		const len = d.length;
		const step = Math.max(4, Math.floor(len / 256) * 4);
		for (let i = 0; i < len; i += step) {
			const a = d[i + 3];
			if (a > 0) {
				hasPixels = true;
				const pixelVal =
					(d[i] & 0xff) |
					((d[i + 1] & 0xff) << 8) |
					((d[i + 2] & 0xff) << 16) |
					((a & 0xff) << 24);
				hash ^= pixelVal;
				hash = Math.imul(hash, 0x01000193);
			}
		}
	}
	if (!hasPixels) {
		return "#27272a";
	}
	const h = Math.abs(hash) % 360;
	const s = 65 + (Math.abs(hash >> 8) % 25);
	const l = 32 + (Math.abs(hash >> 16) % 16);
	return `hsl(${h}, ${s}%, ${l}%)`;
}

interface AnimationBarProps {
	frames: AnimationBarFrame[];
	currentFrame: number;
	fps: number;
	isPlaying: boolean;
	onionSkin: boolean;
	onionSkinOpacity: number;
	onSelectFrame: (i: number) => void;
	onAddFrame: () => void;
	onDeleteFrame: () => void;
	onDuplicateFrameAdjacent: () => void;
	onDuplicateFrameEnd: () => void;
	onReorderFrame?: (from: number, to: number) => void;
	onTogglePlay: () => void;
	onFpsChange: (fps: number) => void;
	onToggleOnionSkin: () => void;
	onOnionSkinOpacityChange: (opacity: number) => void;
	onExit: () => void;
}

export default function AnimationBar({
	frames,
	currentFrame,
	fps,
	isPlaying,
	onionSkin,
	onionSkinOpacity,
	onSelectFrame,
	onAddFrame,
	onDeleteFrame,
	onDuplicateFrameAdjacent,
	onDuplicateFrameEnd,
	onReorderFrame,
	onTogglePlay,
	onFpsChange,
	onToggleOnionSkin,
	onOnionSkinOpacityChange,
	onExit,
}: AnimationBarProps) {
	const dragIndexRef = useRef<number | null>(null);
	const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
	const [prevFps, setPrevFps] = useState(fps);
	const [fpsText, setFpsText] = useState<string>(() => String(fps));

	if (prevFps !== fps) {
		setPrevFps(fps);
		setFpsText(String(fps));
	}

	const handleFpsInputChange = (val: string) => {
		setFpsText(val);
		const num = parseFloat(val);
		if (!isNaN(num) && num > 0 && num <= 120) {
			onFpsChange(num);
		}
	};

	const handleFpsInputBlur = () => {
		const num = parseFloat(fpsText);
		if (isNaN(num) || num <= 0 || num > 120) {
			setFpsText(String(fps));
		} else {
			setFpsText(String(num));
			onFpsChange(num);
		}
	};

	const handleDragStart = (i: number, e: React.DragEvent) => {
		dragIndexRef.current = i;
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", String(i));
	};

	const handleDragOver = (i: number, e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		if (dropTargetIndex !== i) {
			setDropTargetIndex(i);
		}
	};

	const handleDrop = (i: number, e: React.DragEvent) => {
		e.preventDefault();
		const from = dragIndexRef.current;
		if (from !== null && from !== i && onReorderFrame) {
			onReorderFrame(from, i);
		}
		dragIndexRef.current = null;
		setDropTargetIndex(null);
	};

	const handleDragEnd = () => {
		dragIndexRef.current = null;
		setDropTargetIndex(null);
	};

	const frameCount = frames.length;

	return (
		<div className="flex items-center space-x-2 px-3 py-2 bg-[#0f0f11] border-t border-gray-800 shrink-0">
			<Film size={13} className="text-gray-500 shrink-0" />
			<button
				onClick={onTogglePlay}
				className="w-7 h-7 rounded flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 shrink-0"
				title={isPlaying ? "停止" : "再生"}
			>
				{isPlaying ? <Pause size={12} /> : <Play size={12} />}
			</button>
			<div className="flex items-center space-x-1 overflow-x-auto scrollbar-none flex-1 py-0.5">
				{frames.map((frame, i) => {
					const isTarget = dropTargetIndex === i;
					const isCurrent = i === currentFrame;
					return (
						<button
							key={frame.id}
							draggable={!isPlaying && frameCount > 1}
							onDragStart={(e) => handleDragStart(i, e)}
							onDragOver={(e) => handleDragOver(i, e)}
							onDrop={(e) => handleDrop(i, e)}
							onDragEnd={handleDragEnd}
							onClick={() => onSelectFrame(i)}
							title={`フレーム #${frame.id} (${i + 1}番目) - ドラッグして並び替え`}
							style={{
								backgroundColor: frame.color,
								boxShadow: isCurrent
									? "inset 0 0 0 2px #ffffff, inset 0 0 0 3px rgba(0, 0, 0, 0.4)"
									: "inset 0 0 0 1px rgba(255, 255, 255, 0.2)",
							}}
							className={`shrink-0 w-8 h-8 rounded text-[11px] font-mono font-bold transition-all select-none relative flex items-center justify-center ${
								isCurrent
									? "z-10 brightness-110"
									: "opacity-85 hover:opacity-100 hover:brightness-125"
							} ${
								isTarget
									? "ring-2 ring-dashed ring-blue-400"
									: ""
							}`}
						>
							<span
								className="text-white select-none leading-none"
								style={{
									textShadow:
										"-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 -1px 0 #000, 0 1px 0 #000, -1px 0 0 #000, 1px 0 0 #000",
								}}
							>
								{frame.id}
							</span>
						</button>
					);
				})}
			</div>
			{frameCount > 1 && onReorderFrame && (
				<div className="flex items-center space-x-0.5 shrink-0">
					<button
						onClick={() => {
							if (currentFrame > 0) {
								onReorderFrame(currentFrame, currentFrame - 1);
							}
						}}
						disabled={currentFrame <= 0}
						className="w-6 h-7 rounded flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 disabled:opacity-30 disabled:hover:bg-gray-100/10 shrink-0"
						title="フレームを左へ移動"
					>
						<ChevronLeft size={12} />
					</button>
					<button
						onClick={() => {
							if (currentFrame < frameCount - 1) {
								onReorderFrame(currentFrame, currentFrame + 1);
							}
						}}
						disabled={currentFrame >= frameCount - 1}
						className="w-6 h-7 rounded flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 disabled:opacity-30 disabled:hover:bg-gray-100/10 shrink-0"
						title="フレームを右へ移動"
					>
						<ChevronRight size={12} />
					</button>
				</div>
			)}
			<button
				onClick={onAddFrame}
				className="w-7 h-7 rounded flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 shrink-0"
				title="新規フレーム追加"
			>
				<Plus size={12} />
			</button>
			<button
				onClick={onDuplicateFrameAdjacent}
				className="w-7 h-7 rounded flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 shrink-0"
				title="フレーム複製（隣に追加）"
			>
				<Copy size={12} />
			</button>
			<button
				onClick={onDuplicateFrameEnd}
				className="w-7 h-7 rounded flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 shrink-0"
				title="フレーム複製（末尾に追加）"
			>
				<CopyPlus size={12} />
			</button>
			{frameCount > 1 && (
				<button
					onClick={onDeleteFrame}
					className="w-7 h-7 rounded flex items-center justify-center bg-red-950/20 text-red-400 hover:bg-red-950/40 shrink-0"
					title="フレーム削除"
				>
					<Trash2 size={12} />
				</button>
			)}
			<div className="flex items-center space-x-1 text-[10px] text-gray-400 shrink-0 ml-1">
				<span>FPS</span>
				<input
					type="text"
					inputMode="decimal"
					value={fpsText}
					onChange={(e) => handleFpsInputChange(e.target.value)}
					onBlur={handleFpsInputBlur}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							(e.target as HTMLInputElement).blur();
						}
					}}
					placeholder="8"
					className="w-12 h-6 px-1 text-center bg-black/40 border border-gray-700 rounded text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500"
					title="FPS（コマ数/秒。小数も可）"
				/>
			</div>
			<div className="h-5 w-px bg-gray-800 shrink-0" />
			<button
				onClick={onToggleOnionSkin}
				className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
					onionSkin
						? "bg-blue-600/30 text-blue-400"
						: "bg-gray-100/10 text-gray-500 hover:bg-gray-100/20"
				}`}
				title={onionSkin ? "オニオンスキンOFF" : "オニオンスキン"}
			>
				{onionSkin ? <Eye size={12} /> : <EyeOff size={12} />}
			</button>
			{onionSkin && (
				<div className="flex items-center space-x-1.5 text-[9px] text-gray-500 shrink-0">
					<span>薄</span>
					<input
						type="range"
						min={5}
						max={50}
						value={onionSkinOpacity}
						onChange={(e) => onOnionSkinOpacityChange(Number(e.target.value))}
						className="w-12 h-1 accent-blue-500"
					/>
					<span className="w-5 text-right font-mono text-gray-400">
						{onionSkinOpacity}%
					</span>
				</div>
			)}
			<button
				onClick={onExit}
				className="ml-1 text-[9px] px-2 h-6 rounded bg-gray-100/10 text-gray-500 hover:bg-gray-100/20 shrink-0"
			>
				通常編集
			</button>
		</div>
	);
}

