"use client";

import { FileImage, X } from "lucide-react";
import { useRef, useState } from "react";
import { detectPreset, type WalkPreset } from "@/lib/walk-cycle";

interface ImportDialogProps {
	open: boolean;
	onClose: () => void;
	onImport: (
		image: HTMLImageElement,
		opts: { opacity: number; simple: boolean },
	) => void;
	walkMode: boolean;
	walkPresets: WalkPreset[];
}

export default function ImportDialog({
	open,
	onClose,
	onImport,
	walkMode,
	walkPresets,
}: ImportDialogProps) {
	const [imageUrl, setImageUrl] = useState("");
	const [opacity, setOpacity] = useState(100);
	const [simple, setSimple] = useState(false);
	const imageRef = useRef<HTMLImageElement>(null);
	const [detected, setDetected] = useState<WalkPreset | null>(null);
	// open が変わったら（閉じたら）フォームをリセットする。レンダー中の条件付き setState。
	const [prevOpen, setPrevOpen] = useState(open);
	if (open !== prevOpen) {
		setPrevOpen(open);
		if (!open) {
			setImageUrl("");
			setOpacity(100);
			setSimple(false);
			setDetected(null);
		}
	}

	const handleFile = (file: File) => {
		const reader = new FileReader();
		reader.onload = () => setImageUrl(reader.result as string);
		reader.readAsDataURL(file);
	};

	const onImgLoad = () => {
		const img = imageRef.current;
		if (!img || img.naturalWidth === 0) return;
		if (walkMode)
			setDetected(detectPreset(img.naturalWidth, img.naturalHeight));
	};

	const handleImport = () => {
		if (!imageRef.current || imageRef.current.naturalWidth === 0) return;
		onImport(imageRef.current, { opacity, simple });
	};

	if (!open) return null;

	return (
		<div className="absolute inset-0 z-60 flex items-center justify-center bg-black/50">
			<div className="bg-[#1a1b26] rounded-xl border border-gray-700 shadow-2xl w-90 max-h-[90vh] overflow-y-auto">
				<div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
					<span className="text-xs font-bold text-gray-200">
						{walkMode ? "歩行グラを読み込み" : "画像を読み込み"}
					</span>
					<button
						onClick={onClose}
						className="text-gray-400 hover:text-gray-200 p-1"
					>
						<X size={16} />
					</button>
				</div>

				<div className="p-4 space-y-3">
					<div>
						<span className="text-[10px] text-gray-500 font-medium">URL</span>
						<input
							type="url"
							value={imageUrl}
							onChange={(e) => setImageUrl(e.target.value)}
							placeholder="画像のURLを入力"
							className="w-full bg-gray-800 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-700 outline-none mt-1"
						/>
					</div>

					<div>
						<span className="text-[10px] text-gray-500 font-medium">
							ローカルファイル
						</span>
						<label className="flex items-center gap-2 mt-1 px-2 py-1.5 bg-gray-800 rounded border border-gray-700 cursor-pointer hover:bg-gray-700 transition-colors">
							<FileImage size={14} className="text-gray-400" />
							<span className="text-xs text-gray-300">ファイルを選択</span>
							<input
								type="file"
								accept="image/*,.cur,.ani"
								onChange={(e) => {
									const f = e.target.files?.[0];
									if (f) handleFile(f);
								}}
								className="hidden"
							/>
						</label>
					</div>

					{imageUrl && (
						<div className="max-h-32 overflow-auto border border-gray-700 rounded p-1">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								ref={imageRef}
								src={imageUrl}
								alt=""
								className="max-w-full object-contain"
								crossOrigin="anonymous"
								onLoad={onImgLoad}
							/>
						</div>
					)}

					{walkMode && detected && (
						<div className="text-[10px] text-green-400 bg-green-900/20 px-2 py-1 rounded">
							検出: {detected.label} ({detected.w}×{detected.h} /{" "}
							{detected.frames}fr / {detected.ways.length}方向)
						</div>
					)}
					{walkMode && imageUrl && !detected && (
						<div className="text-[10px] text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded">
							該当する歩行グラ規格がありません
						</div>
					)}

					<div className="space-y-2">
						<div className="flex items-center gap-3">
							<span className="text-[10px] text-gray-500 w-16">不透明度</span>
							<input
								type="range"
								min={0}
								max={100}
								value={opacity}
								onChange={(e) => setOpacity(Number(e.target.value))}
								className="flex-1 h-1 accent-blue-500"
							/>
							<span className="text-[10px] text-gray-400 w-8 text-right">
								{opacity}%
							</span>
						</div>
						{walkMode && (
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={simple}
									onChange={(e) => setSimple(e.target.checked)}
									className="accent-blue-500"
								/>
								<span className="text-[10px] text-gray-400">
									1枚絵として読み込む（スプライト分割しない）
								</span>
							</label>
						)}
					</div>

					<button
						onClick={handleImport}
						disabled={!imageUrl}
						className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
					>
						読み込む
					</button>
				</div>
			</div>
		</div>
	);
}
