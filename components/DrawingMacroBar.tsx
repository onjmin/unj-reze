"use client";

import { FlipHorizontal, FlipVertical } from "lucide-react";
import { useState } from "react";
import type { FlipAxis } from "@/lib/drawing-macros";

export type MacroScope = "canvas" | "layer";

interface DrawingMacroBarProps {
	/** scope=canvas は全レイヤー（ロック中も含む）、layer は選択中のレイヤーだけ */
	onFlip: (axis: FlipAxis, scope: MacroScope) => void;
}

/** 描画内容を書き換える自動操作（キャンバスのツールバー下に出す） */
export default function DrawingMacroBar({ onFlip }: DrawingMacroBarProps) {
	const [scope, setScope] = useState<MacroScope>("canvas");
	const scopeBtn = (s: MacroScope, label: string, title: string) => (
		<button
			onClick={() => setScope(s)}
			title={title}
			className={
				"px-2 h-6 text-[10px] transition-colors " +
				(scope === s
					? "bg-blue-600 text-white"
					: "bg-gray-100/10 text-gray-300 hover:bg-gray-100/20")
			}
		>
			{label}
		</button>
	);
	const actionBtn = (axis: FlipAxis, icon: React.ReactNode, label: string) => (
		<button
			onClick={() => onFlip(axis, scope)}
			className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center space-x-1 text-[10px] hover:bg-gray-100/20 shrink-0"
			title={`描画内容そのものを${label}する（もう一度押すと元に戻る）`}
		>
			{icon}
			<span>{label}</span>
		</button>
	);
	return (
		<div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none">
			<span className="text-[10px] text-gray-500 shrink-0">マクロ</span>
			<div className="flex rounded overflow-hidden shrink-0">
				{scopeBtn(
					"canvas",
					"全体",
					"すべてのレイヤー（非表示・ロック中も含む）に掛ける",
				)}
				{scopeBtn("layer", "このレイヤー", "選択中のレイヤーだけに掛ける")}
			</div>
			<div className="w-px h-5 bg-gray-800 mx-1 shrink-0" />
			{actionBtn("horizontal", <FlipHorizontal size={11} />, "左右反転")}
			{actionBtn("vertical", <FlipVertical size={11} />, "上下反転")}
		</div>
	);
}
