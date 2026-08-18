"use client";

import { Pencil } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

/**
 * 埋め込みコンテンツ(画像/MML/ゲーム/MV)の「コラボ／改造」導線をツールバー型で統一する。
 *
 * 元々は画像/MMLだけが「コンテンツに重ねる半透明ピル(absolute bottom-right)」、
 * ゲーム/MVだけが「ヘッダーバー内の不透明ピル」という別々の見た目だった
 * （GameBox.tsx/GamePreview.tsx/MvBox.tsxのヘッダーバーがオリジナル）。
 * 後者のスタイルに統一する（コンテンツ本体を隠さない・種別テーマ色を背景に持たせる方が
 * 視認性が高いとの判断）。文言はゲーム/MVの「改造する」、画像/MMLの「コラボ」のまま
 * 種別ごとに残す（元々の行為の呼び名が違うため。ハッシュタグ #お絵描きコラボ 等との
 * 一貫性も保つ）。
 */
export interface EmbedCollabBarProps {
	/** 左側に出す種別アイコン */
	icon: LucideIcon;
	/** 左側に出す種別/タイトルラベル。ゲーム/MVはタイトル、画像/MMLは種別名（例:"画像"）を渡す */
	label: ReactNode;
	/** ボタン文言。画像/MML="コラボ"、ゲーム/MV="改造する" */
	buttonLabel: string;
	/** ボタン背景の種別テーマ色クラス（例: "bg-lime-600/80 hover:bg-lime-500/90"） */
	colorClass: string;
	/** 省略するとコラボ/改造ボタン自体を出さない（権利表記で禁止されている場合など） */
	onClick?: (e: MouseEvent) => void;
	/** ヘッダー右側にコラボ以外のボタン（共有・閉じる等）を追加したい場合。コラボボタンより左に並ぶ */
	extra?: ReactNode;
}

export default function EmbedCollabBar({
	icon: Icon,
	label,
	buttonLabel,
	colorClass,
	onClick,
	extra,
}: EmbedCollabBarProps) {
	return (
		<div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#0f0f11] border-b border-gray-800 shrink-0">
			<span className="flex items-center gap-1.5 min-w-0 text-xs font-bold text-gray-300 truncate">
				<Icon size={13} className="shrink-0" />
				<span className="truncate">{label}</span>
			</span>
			<div className="flex items-center gap-1.5 shrink-0">
				{onClick && (
					<button
						onClick={onClick}
						className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white transition-colors ${colorClass}`}
					>
						<Pencil size={10} /> {buttonLabel}
					</button>
				)}
				{extra}
			</div>
		</div>
	);
}
