"use client";

import { Clapperboard, Gamepad2, Music, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { MML_MARKERS } from "@/lib/mml";
import type { Post } from "@/lib/types";
import { walkPresetRows } from "@/lib/walk-cycle";
import { useMmlSource } from "./MmlSource";
import SpriteImage from "./SpriteImage";

const MmlPlayer = dynamic(() => import("./MmlPlayer"), { ssr: false });

/**
 * 添付ごとに「このホストは何ができるか」を宣言する。
 *
 * **すべて必須プロパティにしてあるのが肝心**。任意プロパティにすると
 * 「このホストは非対応」と「単なる渡し忘れ」を型が区別できず、
 * 実際にMV編集・ゲーム編集のボタンが複数のホストで静かに消えていた。
 * 対応しない操作は null を明示すること。
 *
 * 添付種別を増やすときはここに足せば、対応を書くまで全ホストが
 * コンパイルエラーになる ＝ 渡し忘れが再発しない。
 */
export interface PostEditCapabilities {
	/** 画像エディタを開く。非対応なら null */
	editImage: (() => void) | null;
	/**
	 * ✕ で画像を外せるか。
	 * 画像の削除は onSave の第2引数で運ぶので、それを保存するホストだけ true。
	 */
	canRemoveImage: boolean;
	/** MMLエディタを開く。解決済みのMML本文を渡す。非対応なら null */
	editMml: ((mml: string) => void) | null;
	/** ゲームエディタを開く。非対応なら null */
	editGame: (() => void) | null;
	/**
	 * ゲームを外す。onSave にゲームを運ぶ経路が無いので、
	 * 外す処理そのものをホストが持つ（持てないなら null にして ✕ を出さない）。
	 */
	removeGame: (() => void) | null;
	/** MVエディタを開く。非対応なら null */
	editMv: (() => void) | null;
}

interface EditPostModalProps {
	/**
	 * 編集対象。添付の表示情報（画像・ゲーム・MV）はすべてここから引く。
	 * 個別のpropsに割ると渡し忘れ・取り違えが起きるため、必ずポストごと渡す。
	 */
	post: Post;
	/** エディタを往復しても「元の本文」と比べられるように、初回の本文を保持したい場合に渡す */
	originalContent?: string;
	capabilities: PostEditCapabilities;
	onClose: () => void;
	onSave: (content: string, imageSrc?: string | null) => void;
}

/** content からMML行を抽出し、{ mmlLine: "#mml ...", textOnly: "本文" } を返す */
function splitMml(content: string): {
	mmlLine: string | null;
	textOnly: string;
} {
	const lines = content.split("\n");
	const idx = lines.findIndex((line) => {
		const t = line.trim().toLowerCase();
		return MML_MARKERS.some((m) => t.startsWith(m.toLowerCase()));
	});
	if (idx === -1) return { mmlLine: null, textOnly: content };
	const mmlLine = lines[idx];
	lines.splice(idx, 1);
	return { mmlLine, textOnly: lines.join("\n").trimEnd() };
}

export default function EditPostModal({
	post,
	originalContent,
	capabilities,
	onClose,
	onSave,
}: EditPostModalProps) {
	const initialContent = post.content;
	const { mmlLine: initialMml, textOnly: initialText } =
		splitMml(initialContent);

	const [text, setText] = useState(initialText);
	const [mmlLine, setMmlLine] = useState<string | null>(initialMml);
	// MML本文はR2へ外部化済みだと content にマーカーしか残らない（mmlLine は "#mml" だけの
	// 空文字扱いになる）。試聴・「展開」で実際のノーテーションを使うには mmlUrl から解決する。
	const { mml: resolvedMml } = useMmlSource(post);
	const [currentImageSrc, setCurrentImageSrc] = useState<
		string | null | undefined
	>(post.imageSrc);
	const [currentHasGame, setCurrentHasGame] = useState(post.hasGame);
	const [expanded, setExpanded] = useState(false); // プレビュー展開
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		textareaRef.current?.focus();
		const len = initialText.length;
		textareaRef.current?.setSelectionRange(len, len);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	/** MMLバッジを×で削除 */
	const handleRemoveMml = () => setMmlLine(null);

	const handleSave = () => {
		const parts: string[] = [];
		if (text.trim()) parts.push(text.trim());
		if (mmlLine) parts.push(mmlLine);
		const final = parts.join("\n");
		onSave(final, currentImageSrc);
	};

	// mmlLine の埋め込みテキストは外部化済みだと空になるため、resolvedMml を優先して使う。
	const mmlCode = mmlLine
		? resolvedMml ||
			(() => {
				const marker = MML_MARKERS.find((m) =>
					mmlLine.trim().toLowerCase().startsWith(m.toLowerCase()),
				);
				return marker ? mmlLine.trim().slice(marker.length).trim() : null;
			})()
		: null;

	const isDirty = (() => {
		const parts: string[] = [];
		if (text.trim()) parts.push(text.trim());
		if (mmlLine) parts.push(mmlLine);
		const compareBase = originalContent ?? initialContent;
		const textOrMmlChanged = parts.join("\n") !== compareBase;
		const imageChanged = currentImageSrc !== post.imageSrc;
		const gameChanged = currentHasGame !== post.hasGame;
		return textOrMmlChanged || imageChanged || gameChanged;
	})();

	return (
		<div
			className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto px-3 pt-12 pb-6 md:pt-24"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="fixed inset-0 bg-black/60" onClick={onClose} />
			<div className="relative w-full md:max-w-2xl lg:max-w-3xl bg-[#0b0e14] rounded-xl border border-gray-800 shadow-2xl p-3 md:p-6 flex flex-col space-y-2 md:space-y-4 animate-fade-in-up">
				<div className="flex items-center justify-between mb-1">
					<span className="text-xs md:text-base font-bold text-gray-400">
						ポストを編集
					</span>
					<button
						onClick={onClose}
						className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors"
					>
						<X size={16} className="md:hidden" />
						<X size={22} className="hidden md:block" />
					</button>
				</div>

				{/* テキスト本文 */}
				<textarea
					ref={textareaRef}
					value={text}
					onChange={(e) => setText(e.target.value)}
					className="w-full bg-gray-100/10 hover:bg-gray-100/15 focus:bg-gray-100/15 rounded-xl px-3 py-2.5 md:px-5 md:py-4 focus:outline-none transition-all placeholder:text-gray-500 text-sm md:text-lg resize-none h-28 md:h-56 text-gray-100"
					placeholder="ポストの内容"
				/>

				{/* 添付画像 */}
				{currentImageSrc && (
					<div className="gimp-checkered-background-white relative rounded-lg overflow-hidden border border-gray-800 max-w-[180px] md:max-w-[260px] self-start group">
						<SpriteImage
							src={currentImageSrc ?? undefined}
							alt="添付画像"
							className="w-full h-auto"
							// 編集でimageSrcが差し替わった場合、元投稿のanimFrames/walkPresetは
							// もう対応しない（editPostがこれらの更新を受け付けないため）。
							// 差し替わっていない＝元のまま表示のときだけアニメ扱いにする。
							animFrames={
								currentImageSrc === post.imageSrc ? post.animFrames : undefined
							}
							animFps={post.animFps}
							rows={
								currentImageSrc === post.imageSrc
									? walkPresetRows(post.walkPreset)
									: 1
							}
						/>
						<div className="absolute top-1.5 right-1.5 flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
							{capabilities.editImage && (
								<button
									onClick={capabilities.editImage}
									className="bg-black/85 px-2 py-0.5 rounded-full text-blue-400 hover:bg-blue-600 hover:text-white text-[10px] font-bold active:scale-95 transition-all shadow-md"
									title="画像を編集"
								>
									編集
								</button>
							)}
							{capabilities.canRemoveImage && (
								<button
									onClick={() => setCurrentImageSrc(null)}
									className="bg-black/85 p-1 rounded-full text-white hover:bg-red-500 active:scale-95 transition-all shadow-md"
									title="画像を削除"
								>
									<X size={14} />
								</button>
							)}
						</div>
					</div>
				)}

				{/* MMLバッジ */}
				{mmlLine && (
					<div className="rounded-lg border border-pink-700/50 bg-pink-500/10 px-3 py-2 md:px-4 md:py-3">
						<div className="flex items-center justify-between mb-1.5">
							<span className="text-[11px] md:text-xs font-bold text-pink-300 flex items-center gap-1.5">
								<Music size={12} />
								MML添付
							</span>
							<div className="flex items-center gap-1">
								{capabilities.editMml && (
									<button
										onClick={() =>
											resolvedMml && capabilities.editMml?.(resolvedMml)
										}
										disabled={!resolvedMml}
										title={
											resolvedMml ? undefined : "MML本文を読み込み中です"
										}
										className="text-[10px] text-pink-400/70 hover:text-pink-300 px-2 py-0.5 rounded border border-pink-700/40 hover:bg-pink-500/25 transition-all active:scale-95 font-bold disabled:opacity-40 disabled:pointer-events-none"
									>
										編集
									</button>
								)}
								{/* プレビュー切替 */}
								<button
									onClick={() => setExpanded((v) => !v)}
									title={expanded ? "プレビューを閉じる" : "プレビュー"}
									className="text-[10px] text-pink-400/70 hover:text-pink-300 px-2 py-0.5 rounded border border-pink-700/40 hover:border-pink-600/60 transition-colors"
								>
									{expanded ? "閉じる" : "試聴"}
								</button>
								{/* 削除ボタン */}
								<button
									onClick={handleRemoveMml}
									title="MMLを削除"
									className="text-pink-400/70 hover:text-red-400 transition-colors p-0.5"
								>
									<X size={14} />
								</button>
							</div>
						</div>
						{expanded && mmlCode && <MmlPlayer mml={mmlCode} />}
						{!expanded && (
							<p className="text-[10px] text-pink-400/50 font-mono truncate">
								{mmlLine}
							</p>
						)}
					</div>
				)}

				{/* MV添付 */}
				{post.hasMv && (
					<div className="relative flex items-center gap-2.5 rounded-lg border border-cyan-700/50 bg-cyan-500/10 px-3 py-2 max-w-[280px] self-start w-full">
						<Clapperboard size={16} className="text-cyan-400 shrink-0" />
						<div className="min-w-0 flex-1">
							<p className="text-xs font-bold text-cyan-200 truncate">
								{post.mvTitle || "MV"}
							</p>
							<p className="text-[10px] text-cyan-400/70">MVを添付中</p>
						</div>
						{capabilities.editMv && (
							<div className="flex items-center gap-1.5 ml-auto">
								<button
									onClick={capabilities.editMv}
									className="text-cyan-300 hover:text-cyan-100 text-[10px] font-bold px-1.5 py-0.5 rounded border border-cyan-700/40 hover:bg-cyan-500/25 active:scale-95 transition-all"
								>
									編集
								</button>
							</div>
						)}
					</div>
				)}

				{/* ゲーム添付 */}
				{currentHasGame && (
					<div className="relative flex items-center gap-2.5 rounded-lg border border-yellow-700/50 bg-yellow-500/10 px-3 py-2 max-w-[280px] self-start w-full">
						<Gamepad2 size={16} className="text-yellow-400 shrink-0" />
						<div className="min-w-0 flex-1">
							<p className="text-xs font-bold text-yellow-200 truncate">
								{post.gameTitle || "ゲーム"}
							</p>
							<p className="text-[10px] text-yellow-400/70">ゲームを添付中</p>
						</div>
						<div className="flex items-center gap-1.5 ml-auto">
							{capabilities.editGame && (
								<button
									onClick={capabilities.editGame}
									className="text-yellow-300 hover:text-yellow-100 text-[10px] font-bold px-1.5 py-0.5 rounded border border-yellow-700/40 hover:bg-yellow-500/25 active:scale-95 transition-all"
								>
									編集
								</button>
							)}
							{capabilities.removeGame && (
								<button
									onClick={() => {
										setCurrentHasGame(false);
										capabilities.removeGame?.();
									}}
									className="text-yellow-300/75 hover:text-red-400 shrink-0"
									title="ゲームを外す"
								>
									<X size={14} />
								</button>
							)}
						</div>
					</div>
				)}

				<div className="flex justify-end items-center space-x-2 md:space-x-3 pt-2 border-t border-gray-800/40">
					<button
						onClick={onClose}
						className="text-gray-400 font-bold px-4 py-1.5 md:px-6 md:py-2.5 rounded-full text-xs md:text-sm hover:bg-gray-100/10 transition-colors"
					>
						キャンセル
					</button>
					<button
						onClick={handleSave}
						disabled={
							(!text.trim() &&
								!mmlLine &&
								!currentImageSrc &&
								!currentHasGame) ||
							!isDirty
						}
						className="bg-blue-600 text-white font-bold px-4 py-1.5 md:px-6 md:py-2.5 rounded-full text-xs md:text-sm hover:bg-blue-500 disabled:opacity-50 transition-colors"
					>
						保存
					</button>
				</div>
			</div>
		</div>
	);
}
