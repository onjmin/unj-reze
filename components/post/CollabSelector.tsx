"use client";

import { Grid3x3, Pen, X } from "lucide-react";
import { useState } from "react";

const COLLAB_SIZE_PRESETS = [
	{ label: "16×16", w: 16, h: 16 },
	{ label: "24×32", w: 24, h: 32 },
	{ label: "32×32", w: 32, h: 32 },
	{ label: "48×48", w: 48, h: 48 },
	{ label: "64×64", w: 64, h: 64 },
];

interface CollabSelectorProps {
	imageUrl: string;
	onSelectDrawing: () => void;
	onSelectDotDrawing: (w?: number, h?: number) => void;
	onClose: () => void;
}

export default function CollabSelector({
	imageUrl,
	onSelectDrawing,
	onSelectDotDrawing,
	onClose,
}: CollabSelectorProps) {
	const [selectedDotSize, setSelectedDotSize] = useState<{
		w: number;
		h: number;
	}>({ w: 32, h: 32 });

	return (
		<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
			<div className="bg-[#131720] border border-gray-700 rounded-2xl shadow-2xl w-[90vw] max-w-sm overflow-hidden">
				<div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
					<span className="font-bold text-sm text-gray-200">
						コラボ方法を選択
					</span>
					<button
						onClick={onClose}
						className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors"
					>
						<X size={18} />
					</button>
				</div>

				<div className="p-4">
					<div className="gimp-checkered-background-white relative rounded-xl overflow-hidden border border-gray-700 mb-4 bg-[#1a1b26]">
						<img
							src={imageUrl}
							alt="コラボ元画像"
							className="max-w-full h-auto max-h-[160px] block mx-auto"
						/>
					</div>

					<div className="space-y-2.5">
						<button
							onClick={onSelectDrawing}
							className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#1a1b26] border border-gray-700 hover:border-[#a3e635]/50 hover:bg-[#1e2030] transition-all active:scale-[0.98] text-left group"
						>
							<div className="w-10 h-10 rounded-lg bg-[#a3e635]/10 flex items-center justify-center shrink-0 group-hover:bg-[#a3e635]/20 transition-colors">
								<Pen size={20} className="text-[#a3e635]" />
							</div>
							<div className="flex-1 min-w-0">
								<div className="font-bold text-sm text-gray-200">
									お絵描きコラボ
								</div>
								<div className="text-[10px] text-gray-500 mt-0.5">
									自由な線画・着色でコラボ
								</div>
							</div>
						</button>

						<div className="p-3 rounded-xl bg-[#1a1b26] border border-gray-700 hover:border-orange-400/50 transition-colors">
							<button
								onClick={() =>
									onSelectDotDrawing(selectedDotSize.w, selectedDotSize.h)
								}
								className="w-full flex items-center gap-3 text-left group"
							>
								<div className="w-10 h-10 rounded-lg bg-orange-400/10 flex items-center justify-center shrink-0 group-hover:bg-orange-400/20 transition-colors">
									<Grid3x3 size={20} className="text-orange-400" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="font-bold text-sm text-gray-200 flex items-center justify-between">
										<span>ドット絵コラボ</span>
										<span className="text-[11px] font-mono text-orange-400 font-semibold bg-orange-400/10 px-2 py-0.5 rounded">
											{selectedDotSize.w}×{selectedDotSize.h} で開く
										</span>
									</div>
									<div className="text-[10px] text-gray-500 mt-0.5">
										ドット絵風にピクセル単位でコラボ
									</div>
								</div>
							</button>

							<div className="mt-3 pt-2.5 border-t border-gray-800/80">
								<div className="text-[10px] text-gray-400 mb-1.5 flex items-center justify-between font-medium">
									<span>ドット解像度（マス目）を指定:</span>
								</div>
								<div className="grid grid-cols-5 gap-1">
									{COLLAB_SIZE_PRESETS.map((p) => {
										const isSelected =
											selectedDotSize.w === p.w && selectedDotSize.h === p.h;
										return (
											<button
												key={p.label}
												onClick={(e) => {
													e.stopPropagation();
													setSelectedDotSize({ w: p.w, h: p.h });
													onSelectDotDrawing(p.w, p.h);
												}}
												className={`py-1 px-0.5 rounded text-[10px] font-mono text-center transition-all ${
													isSelected
														? "bg-orange-500 text-white font-bold shadow"
														: "bg-gray-800/60 text-gray-300 hover:bg-gray-700/80"
												}`}
												title={`${p.label} でドット絵コラボを開く`}
											>
												{p.label}
											</button>
										);
									})}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
