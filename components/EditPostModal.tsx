"use client";

import { Clapperboard, Gamepad2, Music, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { MML_MARKERS } from "@/lib/mml";
import type { Post } from "@/lib/types";
import { presets as walkPresets } from "@/lib/walk-cycle";
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

/**
 * 投稿済みの画像を後から「ドット絵素材」として（再）設定するための編集値。
 * これを設定した画像URLはSpriteImageのアニメ/歩行グラ再生対象になる＝
 * 一般の画像投稿を後からアニメ/歩行グラ素材化する唯一の導線。
 */
export interface DotMetaEdit {
	dotW?: number | null;
	dotH?: number | null;
	animFrames?: number | null;
	animFps?: number | null;
	walkPreset?: string | null;
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
	onSave: (
		content: string,
		imageSrc?: string | null,
		dotMeta?: DotMetaEdit,
	) => void;
}

/** 本文中に画像直リンクURLが単体で含まれていれば抽出する（拡張子で判定）。
 * 画像添付フロー（アップロード/画像URL指定）を通さず本文にURLを貼っただけの投稿は
 * imageSrc が付かず「添付画像」扱いにならない＝ドット絵素材化の対象外になるため、
 * 編集モーダルからワンクリックで添付へ昇格できる導線として使う。 */
const IMAGE_URL_RE =
	/https?:\/\/\S+\.(?:png|jpe?g|gif|webp|bmp)(?:\?\S*)?/i;
function extractImageUrl(text: string): string | null {
	const m = text.match(IMAGE_URL_RE);
	return m ? m[0] : null;
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

	// 本文にURLだけ貼った投稿を「添付画像」へ昇格させる候補（既に添付済みなら不要）
	const detectedImageUrl = currentImageSrc ? null : extractImageUrl(text);
	const handlePromoteImageUrl = () => {
		if (!detectedImageUrl) return;
		setText((t) => t.replace(detectedImageUrl, "").trim());
		setCurrentImageSrc(detectedImageUrl);
	};

	// ドット絵素材メタ。dotW有無が「ドット絵素材扱いか」のフラグそのもの
	// （lib/db/interface.ts DotMetaEdit 参照）。
	const [dotArtEnabled, setDotArtEnabled] = useState(!!post.dotW);
	const [dotW, setDotW] = useState(post.dotW ?? 32);
	const [dotH, setDotH] = useState(post.dotH ?? 32);
	type DotMode = "none" | "anim" | "walk";
	const [dotMode, setDotMode] = useState<DotMode>(
		post.walkPreset ? "walk" : post.animFrames ? "anim" : "none",
	);
	const [animFrames, setAnimFrames] = useState(post.animFrames ?? 4);
	const [animFps, setAnimFps] = useState(post.animFps ?? 8);
	const [walkPresetLabel, setWalkPresetLabel] = useState(
		post.walkPreset ?? walkPresets[0].label,
	);

	// プレビュー・保存の両方で使う実効値（歩行グラのときはコマ数を規格から強制する）
	const selectedWalkPreset = walkPresets.find(
		(p) => p.label === walkPresetLabel,
	);
	const effectiveAnimFrames =
		dotMode === "walk"
			? (selectedWalkPreset?.frames ?? animFrames)
			: dotMode === "anim"
				? animFrames
				: undefined;
	const effectiveWalkPreset = dotMode === "walk" ? walkPresetLabel : undefined;

	const dotMeta: DotMetaEdit | undefined = (() => {
		if (!dotArtEnabled) {
			// 元々ドット絵素材だった投稿を「なし」に戻すときだけ明示的にクリアする。
			// 元から素材でなければ何も送らない（余計な差分を出さない）。
			if (!post.dotW) return undefined;
			return {
				dotW: null,
				dotH: null,
				animFrames: null,
				animFps: null,
				walkPreset: null,
			};
		}
		return {
			dotW,
			dotH,
			animFrames: effectiveAnimFrames ?? null,
			animFps: dotMode === "none" ? null : animFps,
			walkPreset: effectiveWalkPreset ?? null,
		};
	})();
	const dotMetaChanged =
		dotArtEnabled !== !!post.dotW ||
		(dotArtEnabled &&
			(dotW !== (post.dotW ?? dotW) ||
				dotH !== (post.dotH ?? dotH) ||
				effectiveAnimFrames !== (post.animFrames ?? undefined) ||
				(dotMode !== "none" ? animFps : undefined) !==
					(post.animFps ?? undefined) ||
				effectiveWalkPreset !== (post.walkPreset ?? undefined)));

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
		onSave(final, currentImageSrc, dotMeta);
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
		return textOrMmlChanged || imageChanged || gameChanged || dotMetaChanged;
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

				{/* 本文中の画像URLを添付画像へ昇格。アップロード/画像URL指定を通さず本文に
				    URLを貼っただけの投稿はimageSrcが付かずドット絵素材化できないため。 */}
				{detectedImageUrl && (
					<button
						type="button"
						onClick={handlePromoteImageUrl}
						className="self-start text-[11px] font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-700/40 rounded-full px-3 py-1 transition-colors active:scale-95"
					>
						このURLを添付画像にする（ドット絵設定が可能になります）
					</button>
				)}

				{/* 添付画像 */}
				{currentImageSrc && (
					<div className="gimp-checkered-background-white relative rounded-lg overflow-hidden border border-gray-800 max-w-[180px] md:max-w-[260px] self-start group">
						<SpriteImage
							src={currentImageSrc ?? undefined}
							alt="添付画像"
							className="w-full h-auto"
							fit="cover"
							animFrames={dotArtEnabled ? effectiveAnimFrames : undefined}
							animFps={dotArtEnabled ? animFps : undefined}
							walkPreset={dotArtEnabled ? effectiveWalkPreset : undefined}
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

				{/* ドット絵素材の設定。自分の投稿の画像に対して後からdotW/dotH等を（再）設定できる。
				    dotW/dotHが入っている画像は「ドット絵素材」扱いになりSpriteImageの
				    アニメ/歩行グラ再生対象になる（一般の画像投稿を後から素材化する唯一の導線）。 */}
				{currentImageSrc && (
					<div className="rounded-lg border border-gray-800 bg-gray-100/5 px-3 py-2.5 space-y-2">
						<label className="flex items-center gap-2 text-xs font-bold text-gray-300 cursor-pointer">
							<input
								type="checkbox"
								checked={dotArtEnabled}
								onChange={(e) => setDotArtEnabled(e.target.checked)}
								className="accent-blue-600"
							/>
							ドット絵素材として設定する
						</label>
						{dotArtEnabled && (
							<div className="space-y-2 pl-1">
								<div className="flex items-center gap-2 text-[11px] text-gray-400">
									<label className="flex items-center gap-1">
										幅(dot)
										<input
											type="number"
											min={1}
											max={512}
											value={dotW}
											onChange={(e) =>
												setDotW(Math.max(1, Number(e.target.value) || 1))
											}
											className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-gray-200 outline-none focus:border-blue-500"
										/>
									</label>
									<span>×</span>
									<label className="flex items-center gap-1">
										高さ(dot)
										<input
											type="number"
											min={1}
											max={512}
											value={dotH}
											onChange={(e) =>
												setDotH(Math.max(1, Number(e.target.value) || 1))
											}
											className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-gray-200 outline-none focus:border-blue-500"
										/>
									</label>
								</div>
								<div className="flex items-center gap-1.5 text-[11px]">
									{(
										[
											{ v: "none", label: "静止画のみ" },
											{ v: "anim", label: "アニメ" },
											{ v: "walk", label: "歩行グラ" },
										] as const
									).map((opt) => (
										<button
											key={opt.v}
											type="button"
											onClick={() => setDotMode(opt.v)}
											className={`px-2 py-1 rounded-full font-bold transition-colors ${
												dotMode === opt.v
													? "bg-blue-600 text-white"
													: "bg-gray-800 text-gray-400 hover:bg-gray-700"
											}`}
										>
											{opt.label}
										</button>
									))}
								</div>
								{dotMode === "anim" && (
									<div className="flex items-center gap-2 text-[11px] text-gray-400">
										<label className="flex items-center gap-1">
											コマ数
											<input
												type="number"
												min={2}
												max={200}
												value={animFrames}
												onChange={(e) =>
													setAnimFrames(
														Math.max(2, Number(e.target.value) || 2),
													)
												}
												className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-gray-200 outline-none focus:border-blue-500"
											/>
										</label>
										<label className="flex items-center gap-1">
											fps
											<input
												type="number"
												min={1}
												max={60}
												value={animFps}
												onChange={(e) =>
													setAnimFps(Math.max(1, Number(e.target.value) || 1))
												}
												className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-gray-200 outline-none focus:border-blue-500"
											/>
										</label>
									</div>
								)}
								{dotMode === "walk" && (
									<div className="flex items-center gap-2 text-[11px] text-gray-400">
										<select
											value={walkPresetLabel}
											onChange={(e) => setWalkPresetLabel(e.target.value)}
											className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-gray-200 outline-none focus:border-blue-500"
										>
											{walkPresets.map((p) => (
												<option key={p.label} value={p.label}>
													{p.label}（{p.frames}コマ×{p.ways.length}方向）
												</option>
											))}
										</select>
										<label className="flex items-center gap-1">
											fps
											<input
												type="number"
												min={1}
												max={60}
												value={animFps}
												onChange={(e) =>
													setAnimFps(Math.max(1, Number(e.target.value) || 1))
												}
												className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-gray-200 outline-none focus:border-blue-500"
											/>
										</label>
									</div>
								)}
								<p className="text-[10px] text-gray-600">
									横1列(歩行グラは方向×コマ)のスプライトシート画像を想定しています。
									上のプレビューがずれて見える場合はコマ数/規格を見直してください。
								</p>
							</div>
						)}
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
