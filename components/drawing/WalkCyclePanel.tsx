"use client";

import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	Columns3,
	Eye,
	EyeOff,
	FileQuestion,
	Rows3,
} from "lucide-react";
import { useState } from "react";
import { presets, toXY, type WalkPreset, way } from "@/lib/assets/walk-cycle";

interface WalkCyclePanelProps {
	preset: WalkPreset;
	activeIndex: number;
	dataUrlByIndex: ReadonlyMap<number, string>;
	onSelectCell: (index: number) => void;
	onChangePreset: (preset: WalkPreset) => void;
	onionSkin: boolean;
	onionSkinOpacity: number;
	onToggleOnionSkin: () => void;
	onOnionSkinOpacityChange: (opacity: number) => void;
	onNudge: (dx: number, dy: number) => void;
	/** 同じ方向のコマへの一括適用 */
	syncWay: boolean;
	onToggleSyncWay: () => void;
	/** 同じ番目のコマへの一括適用 */
	syncFrame: boolean;
	onToggleSyncFrame: () => void;
	/** 一括適用先のコマ（枠で示す） */
	linkedCells: ReadonlySet<number>;
	/** 選択中のコマの方向の全コマを、方向 srcWay のコマで上書きする */
	onPasteWay: (srcWay: number, flipped: boolean) => void;
}

function WayIcon({ wayKey }: { wayKey: string }) {
	const cls = "w-5 h-5";
	switch (wayKey) {
		case "w":
			return <ArrowUp className={cls} />;
		case "s":
			return <ArrowDown className={cls} />;
		case "a":
			return <ArrowLeft className={cls} />;
		case "d":
			return <ArrowRight className={cls} />;
		case "q":
			return <ArrowUp className={cls + " -rotate-45"} />;
		case "e":
			return <ArrowUp className={cls + " rotate-45"} />;
		case "z":
			return <ArrowDown className={cls + " rotate-45"} />;
		case "c":
			return <ArrowDown className={cls + " -rotate-45"} />;
		default:
			return <FileQuestion className={cls} />;
	}
}

export default function WalkCyclePanel({
	preset,
	activeIndex,
	dataUrlByIndex,
	onSelectCell,
	onChangePreset,
	onionSkin,
	onionSkinOpacity,
	onToggleOnionSkin,
	onOnionSkinOpacityChange,
	onNudge,
	syncWay,
	onToggleSyncWay,
	syncFrame,
	onToggleSyncFrame,
	linkedCells,
	onPasteWay,
}: WalkCyclePanelProps) {
	const [srcWay, setSrcWay] = useState(-1);
	const [pasteFlipped, setPasteFlipped] = useState(false);
	const activeWay = toXY(activeIndex, preset.frames)[1];
	const toggleBtn = (
		on: boolean,
		onClick: () => void,
		icon: React.ReactNode,
		title: string,
	) => (
		<button
			onClick={onClick}
			className={
				"w-6 h-6 rounded flex items-center justify-center transition-colors " +
				(on
					? "bg-blue-600 text-white"
					: "bg-gray-100/10 text-gray-400 hover:bg-gray-100/20")
			}
			title={title}
		>
			{icon}
		</button>
	);
	return (
		<div className="px-3.5 py-2.5 space-y-2 shrink-0 bg-[#0f0f11] border-t border-gray-900">
			<div className="flex items-center gap-2">
				<span className="text-[10px] text-gray-500 shrink-0">歩行グラ</span>
				<select
					value={preset.label}
					onChange={(e) => {
						const p = presets.find((v) => v.label === e.target.value);
						if (p) onChangePreset(p);
					}}
					className="bg-gray-800 text-gray-200 text-[10px] px-2 py-1 rounded border border-gray-700 outline-none"
				>
					{presets.map((p) => (
						<option key={p.label} value={p.label}>
							{p.label}
						</option>
					))}
					{/* プロジェクトファイルから開いた、規格に無い大きさ・コマ数 */}
					{!presets.some((p) => p.label === preset.label) && (
						<option value={preset.label}>{preset.label}</option>
					)}
				</select>
				<span className="text-[10px] text-gray-600 ml-auto">
					{preset.w}×{preset.h} / {preset.frames}fr / {preset.ways.length}方向
				</span>
			</div>
			<div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
				{preset.ways.map((w, y) => (
					<div key={w.key} className="flex flex-col items-center gap-1">
						<WayIcon wayKey={w.key} />
						{Array.from({ length: preset.frames }, (_, x) => {
							const i = x + y * preset.frames;
							const src = dataUrlByIndex.get(i);
							return (
								<button
									key={i}
									onClick={() => onSelectCell(i)}
									className={
										"w-12 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 " +
										(activeIndex === i
											? "border-[#a3e635] ring-2 ring-[#a3e635]/30 scale-105"
											: linkedCells.has(i)
												? "border-blue-500"
												: "border-gray-700 hover:border-gray-500")
									}
								>
									{src ? (
										<img
											src={src}
											alt=""
											className="w-full h-full object-contain gimp-checkered-background"
										/>
									) : (
										<div className="w-full h-full bg-[#1a1b26] flex items-center justify-center text-[10px] text-gray-600">
											{i + 1}
										</div>
									)}
								</button>
							);
						})}
					</div>
				))}
			</div>
			<div className="flex items-center gap-2 pt-1 border-t border-gray-800/60">
				<div className="flex items-center gap-1">
					<button
						onClick={onToggleOnionSkin}
						className={
							"w-6 h-6 rounded flex items-center justify-center text-[10px] transition-colors " +
							(onionSkin
								? "bg-blue-600 text-white"
								: "bg-gray-100/10 text-gray-400 hover:bg-gray-100/20")
						}
						title={onionSkin ? "オニオンスキンOFF" : "オニオンスキン"}
					>
						{onionSkin ? <Eye size={11} /> : <EyeOff size={11} />}
					</button>
					{onionSkin && (
						<>
							<input
								type="range"
								min={1}
								max={50}
								value={onionSkinOpacity}
								onChange={(e) =>
									onOnionSkinOpacityChange(Number(e.target.value))
								}
								className="w-16 h-1 accent-blue-500 cursor-pointer"
							/>
							<span className="text-[9px] w-5 text-right font-mono text-gray-400">
								{onionSkinOpacity}%
							</span>
						</>
					)}
				</div>
				<div className="w-px h-4 bg-gray-800 mx-0.5" />
				<div className="flex items-center gap-0.5">
					<span className="text-[9px] text-gray-500 mr-0.5">一括</span>
					{toggleBtn(
						syncWay,
						onToggleSyncWay,
						<Columns3 size={11} />,
						"同じ方向のコマに一括適用（描画・選択範囲・移動・レイヤー操作・Undo）",
					)}
					{toggleBtn(
						syncFrame,
						onToggleSyncFrame,
						<Rows3 size={11} />,
						"同じ番目のコマに一括適用（描画・選択範囲・移動・レイヤー操作・Undo）",
					)}
				</div>
				<div className="w-px h-4 bg-gray-800 mx-0.5" />
				<div className="flex items-center gap-0.5">
					<span className="text-[9px] text-gray-500 mr-0.5">移動</span>
					<button
						onClick={() => onNudge(0, -1)}
						className="w-5 h-5 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 hover:bg-gray-100/20 text-[10px]"
						title="上に1px移動"
					>
						▲
					</button>
					<button
						onClick={() => onNudge(-1, 0)}
						className="w-5 h-5 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 hover:bg-gray-100/20 text-[10px]"
						title="左に1px移動"
					>
						◀
					</button>
					<button
						onClick={() => onNudge(1, 0)}
						className="w-5 h-5 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 hover:bg-gray-100/20 text-[10px]"
						title="右に1px移動"
					>
						▶
					</button>
					<button
						onClick={() => onNudge(0, 1)}
						className="w-5 h-5 rounded flex items-center justify-center bg-gray-100/10 text-gray-400 hover:bg-gray-100/20 text-[10px]"
						title="下に1px移動"
					>
						▼
					</button>
				</div>
			</div>
			<div className="flex items-center gap-1.5 pt-1 border-t border-gray-800/60">
				<span
					className="text-[9px] text-gray-500 shrink-0"
					title="選択中のコマの方向の全コマを、選んだ方向のコマ（全レイヤーを重ねた見た目）で上書きする。Undoは効かない"
				>
					方向コピー
				</span>
				<select
					value={srcWay}
					onChange={(e) => setSrcWay(Number(e.target.value))}
					className="bg-gray-800 text-gray-200 text-[10px] px-1.5 py-0.5 rounded border border-gray-700 outline-none"
				>
					<option value={-1}>コピー元</option>
					{preset.ways.map((w, y) =>
						y === activeWay ? null : (
							<option key={w.key} value={y}>
								{w.label || w.key}
							</option>
						),
					)}
				</select>
				<label className="flex items-center gap-1 text-[9px] text-gray-400 shrink-0">
					<input
						type="checkbox"
						checked={pasteFlipped}
						onChange={(e) => setPasteFlipped(e.target.checked)}
						className="accent-blue-500"
					/>
					左右反転
				</label>
				<button
					onClick={() => onPasteWay(srcWay, pasteFlipped)}
					disabled={srcWay < 0 || srcWay === activeWay}
					className="px-2 h-5 rounded bg-gray-100/10 text-gray-300 hover:bg-gray-100/20 text-[10px] disabled:opacity-40 shrink-0"
				>
					→ {preset.ways[activeWay]?.label || preset.ways[activeWay]?.key}{" "}
					に上書き
				</button>
			</div>
		</div>
	);
}
