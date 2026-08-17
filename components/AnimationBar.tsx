"use client";

import {
	ChevronLeft,
	ChevronRight,
	Copy,
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
	layers: {
		name: string;
		visible: boolean;
		locked: boolean;
		opacity: number;
		data: Uint8ClampedArray;
	}[];
}

interface AnimationBarProps {
	frameCount: number;
	currentFrame: number;
	fps: number;
	isPlaying: boolean;
	onionSkin: boolean;
	onionSkinOpacity: number;
	onSelectFrame: (i: number) => void;
	onAddFrame: () => void;
	onDeleteFrame: () => void;
	onDuplicateFrame: () => void;
	onReorderFrame?: (from: number, to: number) => void;
	onTogglePlay: () => void;
	onFpsChange: (fps: number) => void;
	onToggleOnionSkin: () => void;
	onOnionSkinOpacityChange: (opacity: number) => void;
	onExit: () => void;
}

export default function AnimationBar({
	frameCount,
	currentFrame,
	fps,
	isPlaying,
	onionSkin,
	onionSkinOpacity,
	onSelectFrame,
	onAddFrame,
	onDeleteFrame,
	onDuplicateFrame,
	onReorderFrame,
	onTogglePlay,
	onFpsChange,
	onToggleOnionSkin,
	onOnionSkinOpacityChange,
	onExit,
}: AnimationBarProps) {
	const dragIndexRef = useRef<number | null>(null);
	const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

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
			<div className="flex items-center space-x-0.5 overflow-x-auto scrollbar-none flex-1 py-0.5">
				{Array.from({ length: frameCount }, (_, i) => {
					const isTarget = dropTargetIndex === i;
					const isCurrent = i === currentFrame;
					return (
						<button
							key={i}
							draggable={!isPlaying && frameCount > 1}
							onDragStart={(e) => handleDragStart(i, e)}
							onDragOver={(e) => handleDragOver(i, e)}
							onDrop={(e) => handleDrop(i, e)}
							onDragEnd={handleDragEnd}
							onClick={() => onSelectFrame(i)}
							title={`フレーム ${i + 1} (ドラッグして並び替え)`}
							className={`shrink-0 w-8 h-8 rounded text-[9px] font-mono transition-all select-none relative ${
								isCurrent
									? "bg-blue-600 text-white shadow ring-1 ring-blue-400"
									: "bg-gray-100/10 text-gray-400 hover:bg-gray-100/20"
							} ${
								isTarget
									? "border-2 border-dashed border-blue-400 scale-105"
									: ""
							}`}
						>
							{i + 1}
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
				title="フレーム追加"
			>
				<Plus size={12} />
			</button>
			<button
				onClick={onDuplicateFrame}
				className="w-7 h-7 rounded flex items-center justify-center bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 shrink-0"
				title="フレーム複製"
			>
				<Copy size={12} />
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
			<div className="flex items-center space-x-1.5 text-[9px] text-gray-500 shrink-0 ml-1">
				<span>FPS</span>
				<input
					type="range"
					min={1}
					max={30}
					value={fps}
					onChange={(e) => onFpsChange(Number(e.target.value))}
					className="w-14 h-1 accent-blue-500"
				/>
				<span className="w-4 text-right font-mono text-gray-400">{fps}</span>
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
