"use client";

import { Download, Film, FileArchive, Image as ImageIcon, MousePointer2, X } from "lucide-react";
import { useState } from "react";
import type { WalkPreset } from "@/lib/walk-cycle";

export interface DrawingExportDialogProps {
	open: boolean;
	onClose: () => void;
	mode: "standard" | "anim" | "walk";
	isDotEditor?: boolean;
	gridW?: number;
	gridH?: number;
	fps?: number;
	walkPreset?: WalkPreset;
	walkActiveWayIndex?: number;
	onExportSinglePng: (scale: number) => void | Promise<void>;
	onExportSpriteSheet?: (scale: number) => void | Promise<void>;
	onExportGif?: (options: { scale: number; transparent: boolean }) => void | Promise<void>;
	onExportZip?: (scale: number) => void | Promise<void>;
	onExportWalkSpriteSheet?: () => void | Promise<void>;
	onExportWalkGif?: (options: { allWays: boolean; transparent: boolean }) => void | Promise<void>;
	onExportWalkZip?: () => void | Promise<void>;
	onExportWalkAni?: () => void | Promise<void>;
}

export default function DrawingExportDialog({
	open,
	onClose,
	mode,
	isDotEditor = false,
	gridW = 32,
	gridH = 32,
	fps = 8,
	walkPreset,
	walkActiveWayIndex = 0,
	onExportSinglePng,
	onExportSpriteSheet,
	onExportGif,
	onExportZip,
	onExportWalkSpriteSheet,
	onExportWalkGif,
	onExportWalkZip,
	onExportWalkAni,
}: DrawingExportDialogProps) {
	const [scale, setScale] = useState<number>(isDotEditor ? 1 : 1);
	const [transparent, setTransparent] = useState(true);
	const [exporting, setExporting] = useState(false);
	const [walkGifAllWays, setWalkGifAllWays] = useState(false);

	if (!open) return null;

	const handleAction = async (fn?: () => void | Promise<void>) => {
		if (!fn || exporting) return;
		try {
			setExporting(true);
			await fn();
		} catch (err) {
			console.error("Export failed:", err);
			alert("エクスポート中にエラーが発生しました");
		} finally {
			setExporting(false);
		}
	};

	const currentWayLabel = walkPreset?.ways[walkActiveWayIndex]?.label || "正面";

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
			<div className="w-full max-w-md rounded-xl border border-gray-700 bg-[#161622] p-5 shadow-2xl space-y-4">
				{/* ヘッダー */}
				<div className="flex items-center justify-between border-b border-gray-800 pb-3">
					<div className="flex items-center gap-2">
						<Download className="text-blue-400" size={18} />
						<h3 className="text-sm font-bold text-gray-100">
							{mode === "walk"
								? "歩行グラフィックの出力"
								: mode === "anim"
									? "アニメーションの出力"
									: "画像の出力"}
						</h3>
					</div>
					<button
						onClick={onClose}
						className="text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-gray-800 transition"
					>
						<X size={18} />
					</button>
				</div>

				{/* ドット絵エディタの場合の拡大倍率選択 */}
				{isDotEditor && mode !== "walk" && (
					<div className="rounded-lg bg-gray-900/60 p-3 border border-gray-800 space-y-2">
						<div className="flex items-center justify-between text-xs text-gray-300 font-medium">
							<span>出力サイズ（ドット倍率）</span>
							<span className="text-[11px] text-gray-500 font-mono">
								{gridW * scale} × {gridH * scale} px
							</span>
						</div>
						<div className="grid grid-cols-4 gap-1.5">
							{[
								{ label: `原寸 (1×)`, val: 1 },
								{ label: "2倍 (2×)", val: 2 },
								{ label: "4倍 (4×)", val: 4 },
								{ label: "8倍 (8×)", val: 8 },
							].map((opt) => (
								<button
									key={opt.val}
									type="button"
									onClick={() => setScale(opt.val)}
									className={`py-1.5 px-2 rounded text-xs font-mono transition ${
										scale === opt.val
											? "bg-blue-600 text-white font-bold shadow"
											: "bg-gray-800 text-gray-300 hover:bg-gray-700"
									}`}
								>
									{opt.label}
								</button>
							))}
						</div>
					</div>
				)}

				{/* オプション（GIF透過設定など） */}
				{(mode === "anim" || mode === "walk") && (
					<div className="rounded-lg bg-gray-900/60 p-3 border border-gray-800 space-y-2 text-xs">
						<div className="flex items-center justify-between">
							<span className="text-gray-300">GIFの背景透過</span>
							<label className="relative inline-flex items-center cursor-pointer">
								<input
									type="checkbox"
									checked={transparent}
									onChange={(e) => setTransparent(e.target.checked)}
									className="sr-only peer"
								/>
								<div className="w-8 h-4 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-blue-600" />
							</label>
						</div>
						{mode === "walk" && (
							<div className="flex items-center justify-between pt-1 border-t border-gray-800/80">
								<span className="text-gray-300">GIF出力対象</span>
								<div className="flex gap-1">
									<button
										type="button"
										onClick={() => setWalkGifAllWays(false)}
										className={`px-2 py-0.5 rounded text-[11px] ${
											!walkGifAllWays
												? "bg-blue-600 text-white font-medium"
												: "bg-gray-800 text-gray-400 hover:bg-gray-700"
										}`}
									>
										現在の向き ({currentWayLabel})
									</button>
									<button
										type="button"
										onClick={() => setWalkGifAllWays(true)}
										className={`px-2 py-0.5 rounded text-[11px] ${
											walkGifAllWays
												? "bg-blue-600 text-white font-medium"
												: "bg-gray-800 text-gray-400 hover:bg-gray-700"
										}`}
									>
										全方向まとめ
									</button>
								</div>
							</div>
						)}
					</div>
				)}

				{/* アクションボタン群 */}
				<div className="space-y-2 pt-1">
					{/* 一枚絵モード */}
					{mode === "standard" && (
						<button
							type="button"
							disabled={exporting}
							onClick={() => handleAction(() => onExportSinglePng(scale))}
							className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow transition active:scale-[0.98] disabled:opacity-50"
						>
							<ImageIcon size={15} />
							<span>PNG画像をダウンロード</span>
						</button>
					)}

					{/* アニメーションモード */}
					{mode === "anim" && (
						<>
							<button
								type="button"
								disabled={exporting}
								onClick={() =>
									handleAction(() =>
										onExportGif?.({ scale, transparent }),
									)
								}
								className="w-full flex items-center justify-between py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow transition active:scale-[0.98] disabled:opacity-50"
							>
								<div className="flex items-center gap-2">
									<Film size={15} />
									<span>GIFアニメとして出力</span>
								</div>
								<span className="text-[10px] opacity-80 font-mono">
									{fps} FPS
								</span>
							</button>

							<button
								type="button"
								disabled={exporting}
								onClick={() =>
									handleAction(() => onExportSpriteSheet?.(scale))
								}
								className="w-full flex items-center justify-between py-2.5 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-xs border border-gray-700 transition active:scale-[0.98] disabled:opacity-50"
							>
								<div className="flex items-center gap-2">
									<ImageIcon size={15} />
									<span>スプライトシート (PNG)</span>
								</div>
								<span className="text-[10px] text-gray-400">
									横一列に結合
								</span>
							</button>

							<button
								type="button"
								disabled={exporting}
								onClick={() => handleAction(() => onExportZip?.(scale))}
								className="w-full flex items-center justify-between py-2.5 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-xs border border-gray-700 transition active:scale-[0.98] disabled:opacity-50"
							>
								<div className="flex items-center gap-2">
									<FileArchive size={15} />
									<span>全フレーム個別PNG (ZIP)</span>
								</div>
								<span className="text-[10px] text-gray-400">
									frame_01.png...
								</span>
							</button>
						</>
					)}

					{/* 歩行グラモード */}
					{mode === "walk" && (
						<>
							<button
								type="button"
								disabled={exporting}
								onClick={() =>
									handleAction(() => onExportWalkSpriteSheet?.())
								}
								className="w-full flex items-center justify-between py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow transition active:scale-[0.98] disabled:opacity-50"
							>
								<div className="flex items-center gap-2">
									<ImageIcon size={15} />
									<span>スプライトシート (PNG)</span>
								</div>
								<span className="text-[10px] opacity-80 font-mono">
									{walkPreset
										? `${walkPreset.w * walkPreset.frames}×${walkPreset.h * walkPreset.ways.length}px`
										: "ツクール/RPGEN規格"}
								</span>
							</button>

							<button
								type="button"
								disabled={exporting}
								onClick={() =>
									handleAction(() =>
										onExportWalkGif?.({
											allWays: walkGifAllWays,
											transparent,
										}),
									)
								}
								className="w-full flex items-center justify-between py-2.5 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-xs border border-gray-700 transition active:scale-[0.98] disabled:opacity-50"
							>
								<div className="flex items-center gap-2">
									<Film size={15} />
									<span>GIFアニメとして出力</span>
								</div>
								<span className="text-[10px] text-gray-400">
									{walkGifAllWays ? "全方向" : currentWayLabel}
								</span>
							</button>

							<button
								type="button"
								disabled={exporting}
								onClick={() => handleAction(() => onExportWalkZip?.())}
								className="w-full flex items-center justify-between py-2.5 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-xs border border-gray-700 transition active:scale-[0.98] disabled:opacity-50"
							>
								<div className="flex items-center gap-2">
									<FileArchive size={15} />
									<span>各フレーム画像 (ZIP)</span>
								</div>
								<span className="text-[10px] text-gray-400">
									frame_y_x.png
								</span>
							</button>

							<button
								type="button"
								disabled={exporting}
								onClick={() => handleAction(() => onExportWalkAni?.())}
								className="w-full flex items-center justify-between py-2.5 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-xs border border-gray-700 transition active:scale-[0.98] disabled:opacity-50"
							>
								<div className="flex items-center gap-2">
									<MousePointer2 size={15} />
									<span>Windowsアニメカーソル (.ani ZIP)</span>
								</div>
								<span className="text-[10px] text-gray-400">
									cursors.zip
								</span>
							</button>
						</>
					)}
				</div>

				{exporting && (
					<div className="text-center text-xs text-blue-400 font-medium py-1 animate-pulse">
						エクスポート生成中...
					</div>
				)}
			</div>
		</div>
	);
}
