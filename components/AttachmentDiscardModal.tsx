"use client";

import { AlertTriangle, X } from "lucide-react";

interface AttachmentDiscardModalProps {
	onClose: () => void;
	onConfirm: () => void;
	discardType: "image" | "mml" | "game" | "mv";
}

const DISCARD_TYPE_NAMES = {
	image: "お絵描き",
	mml: "MML",
	game: "ゲーム",
	mv: "MV",
};

export default function AttachmentDiscardModal({
	onClose,
	onConfirm,
	discardType,
}: AttachmentDiscardModalProps) {
	const assetName = DISCARD_TYPE_NAMES[discardType] || "添付ファイル";

	return (
		<div
			className="fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto px-3 pt-24"
			onClick={(e) => e.stopPropagation()}
		>
			<div
				className="fixed inset-0 bg-black/70 backdrop-blur-sm"
				onClick={onClose}
			/>
			<div className="relative w-full md:max-w-md bg-[#0b0e14] rounded-xl border border-gray-800 shadow-2xl p-5 flex flex-col space-y-4 animate-fade-in-up">
				<div className="flex items-center justify-between">
					<span className="text-sm font-bold text-gray-400 flex items-center gap-1.5">
						<AlertTriangle
							size={16}
							className="text-yellow-400 animate-pulse"
						/>
						添付ファイルの変更
					</span>
					<button
						onClick={onClose}
						className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors"
					>
						<X size={16} />
					</button>
				</div>

				<div className="text-sm text-gray-300 py-2 leading-relaxed">
					添付している
					<span className="font-bold text-yellow-400">{assetName}</span>
					が消えますがよろしいですか？
				</div>

				<div className="flex justify-end items-center space-x-2">
					<button
						onClick={onClose}
						className="text-gray-400 font-bold px-4 py-2 rounded-full text-xs hover:bg-gray-100/10 transition-colors"
					>
						キャンセル
					</button>
					<button
						onClick={onConfirm}
						className="bg-gradient-to-r from-red-600 to-rose-600 text-white font-bold px-5 py-2 rounded-full text-xs hover:from-red-500 hover:to-rose-500 transition-all shadow-md shadow-red-950/20 active:scale-95"
					>
						変更する
					</button>
				</div>
			</div>
		</div>
	);
}
