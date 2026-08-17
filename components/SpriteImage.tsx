"use client";

import { useEffect, useState } from "react";
import type {
	CSSProperties,
	MouseEvent as ReactMouseEvent,
	SyntheticEvent,
} from "react";
import { walkPresetWays } from "@/lib/walk-cycle";

/**
 * 投稿画像の表示用。`animFrames`(>1) があれば横1列のアニメスプライトシートとして
 * CSSアニメで再生する。`walkPreset` を渡すと歩行グラ(複数行のシート)として扱い、
 * `fit="natural"`（本文サイズの画像。既定）のときは方向転換の十字ボタンつきで
 * 選択した向きを歩行アニメ再生する。`fit="cover"`（サムネイル/アイコン用途）や
 * `walkPreset` 無指定のときは先頭コマだけの静止表示にする
 * （小さい枠に十字ボタンを出すと崩れるため、また向きの並び順が分からないと
 * 十字ボタンを正しく機能させられないため）。
 *
 * 通常の静止画(animFramesが無い/1以下)は素の <img> と同じ見た目・挙動になる。
 *
 * コマ単体のサイズはDBに持っていない（シート全体のURLしか無い）ため、
 * 一度画像を読み込んで naturalWidth/Height から逆算する。測定が終わるまでは
 * 1:1のプレースホルダー比率で待つ（一瞬だけ縦横比がズレる場合がある）。
 *
 * <img>と同じ「自然サイズを超えて拡大表示しない」挙動に合わせるため、コマ単体の
 * 実ピクセル幅を明示的な width として与える（className の max-w-full 等で狭い画面では
 * 縮む）。これをやらないと、div+background-imageには<img>のような内在サイズが無いため
 * width:auto がブロック要素として親幅いっぱいに広がり、小さいドット絵アニメが
 * 投稿カードの横幅まで間延びして表示されてしまう（静止画<img>は自然な小サイズのまま）。
 *
 * CSSステップアニメの数学的な注意: background-position の百分率は
 * `(コンテナ幅-画像幅)×(P/100)` で解決される（CSS仕様）ため、N分割ステップの
 * 最後のコマにちょうど揃う目標値は `100%`でも`N×100%`でもなく `100×N/(N-1)%`。
 * （N=frames の場合。狭すぎ/広すぎる値を使うと2コマ目以降が隣接コマ境界からズレて
 * 半端な位置で止まる＝コマが割れて見えるバグになる。歩行グラの行(方向)オフセットも
 * 同じ式で `100×row/(rows-1)%` を使う。）
 */
export interface SpriteImageProps {
	src: string | undefined;
	alt?: string;
	className?: string;
	style?: CSSProperties;
	animFrames?: number;
	animFps?: number;
	/** 歩行グラのとき `lib/walk-cycle.ts` の WalkPreset.label（例:"RPGEN"）。方向転換UIに必要 */
	walkPreset?: string | null;
	/** false でCSSアニメを止め、先頭コマだけの静止表示にする（小さいアイコン用途など） */
	animate?: boolean;
	/**
	 * "natural"(既定): <img>と同じく自然なピクセル幅で表示し、狭い画面でだけ縮む
	 * （投稿本文の画像など、幅をこちらが決めない場所向け）。歩行グラの方向転換UIも
	 * このモードでだけ出す。
	 * "cover": 呼び出し側が className で決めた固定サイズの箱(aspect-square グリッド、
	 * w-5 h-5 アイコン等)いっぱいに詰めて表示する。
	 */
	fit?: "natural" | "cover";
	draggable?: boolean;
	onClick?: (e: ReactMouseEvent) => void;
	/** 静止画(<img>)のときだけ発火する。アニメ/歩行グラのCSS背景描画では読み込み失敗を検知できない */
	onError?: (e: SyntheticEvent<HTMLImageElement>) => void;
}

const WAY_ARROW_POS: Record<string, string> = {
	w: "top-0 left-1/2 -translate-x-1/2",
	s: "bottom-0 left-1/2 -translate-x-1/2",
	a: "left-0 top-1/2 -translate-y-1/2",
	d: "right-0 top-1/2 -translate-y-1/2",
};
const WAY_ARROW_GLYPH: Record<string, string> = {
	w: "▲",
	s: "▼",
	a: "◀",
	d: "▶",
};
const WAY_ARROW_ALT: Record<string, string> = {
	w: "上",
	s: "下",
	a: "左",
	d: "右",
};

export default function SpriteImage({
	src,
	alt,
	className,
	style,
	animFrames,
	animFps,
	walkPreset,
	animate = true,
	fit = "natural",
	draggable,
	onClick,
	onError,
}: SpriteImageProps) {
	const frames = animFrames && animFrames > 1 ? animFrames : 1;
	const ways = walkPreset ? walkPresetWays(walkPreset) : null;
	const rows = ways?.length ?? 1;
	const isWalkPreview = fit === "natural" && rows > 1;

	const [cell, setCell] = useState<{ ratio: number; widthPx: number } | null>(
		null,
	);
	const [selectedWay, setSelectedWay] = useState<string | null>(null);

	useEffect(() => {
		if (frames <= 1 || !src) return;
		let cancelled = false;
		const img = new Image();
		img.onload = () => {
			if (!cancelled && img.naturalWidth && img.naturalHeight) {
				const cellW = img.naturalWidth / frames;
				const cellH = img.naturalHeight / rows;
				setCell({ ratio: cellW / cellH, widthPx: cellW });
			}
		};
		img.src = src;
		return () => {
			cancelled = true;
		};
	}, [src, frames, rows]);

	if (frames <= 1 || !src) {
		return (
			<img
				src={src}
				alt={alt || ""}
				className={className}
				style={style}
				draggable={draggable}
				onClick={onClick}
				onError={onError}
			/>
		);
	}

	const sizingStyle: CSSProperties = {
		aspectRatio: cell?.ratio ?? 1,
		...(fit === "natural" && cell
			? { width: cell.widthPx, maxWidth: "100%" }
			: {}),
	};

	// 歩行グラの静止プレビュー(cover/小さい枠)は先頭セル(1コマ目・1方向目)だけを切り出す
	if (rows > 1 && !isWalkPreview) {
		return (
			<div
				role="img"
				aria-label={alt || ""}
				className={className}
				onClick={onClick}
				style={{
					...style,
					...sizingStyle,
					backgroundImage: `url(${src})`,
					backgroundSize: `${frames * 100}% ${rows * 100}%`,
					backgroundPosition: "0% 0%",
					backgroundRepeat: "no-repeat",
					imageRendering: "pixelated",
				}}
			/>
		);
	}

	const fps = animFps && animFps > 0 ? animFps : 8;
	const duration = frames / fps;

	// N分割ステップの最後のコマにちょうど揃うbackground-position%の目標値。
	// 100% でも frames*100% でもない（コンポーネント先頭コメント参照）。
	const xTarget = frames > 1 ? (100 * frames) / (frames - 1) : 0;
	const activeWayKey =
		selectedWay ??
		ways?.find((w) => w.key === "s")?.key ??
		ways?.[0]?.key ??
		null;
	const rowIndex = ways
		? Math.max(
				0,
				ways.findIndex((w) => w.key === activeWayKey),
			)
		: 0;
	const yPos = rows > 1 ? (100 * rowIndex) / (rows - 1) : 0;
	const keyframesName = `sprite-anim-steps-${frames}`;

	const spriteDiv = (
		<div
			role="img"
			aria-label={alt || ""}
			className={isWalkPreview ? "w-full h-full" : className}
			onClick={isWalkPreview ? undefined : onClick}
			style={{
				...style,
				...(isWalkPreview ? {} : sizingStyle),
				backgroundImage: `url(${src})`,
				backgroundSize: `${frames * 100}% ${rows * 100}%`,
				backgroundPosition: `0% ${yPos}%`,
				backgroundRepeat: "no-repeat",
				imageRendering: "pixelated",
				...(animate
					? {
							animationName: keyframesName,
							animationDuration: `${duration}s`,
							animationTimingFunction: `steps(${frames})`,
							animationIterationCount: "infinite",
						}
					: {}),
			}}
		>
			{animate && (
				<style
					dangerouslySetInnerHTML={{
						__html: `@keyframes ${keyframesName} { from { background-position: 0% ${yPos}%; } to { background-position: ${xTarget}% ${yPos}%; } }`,
					}}
				/>
			)}
		</div>
	);

	if (!isWalkPreview) return spriteDiv;

	return (
		<div className={`${className || ""} relative`} onClick={onClick} style={sizingStyle}>
			{spriteDiv}
			{ways && ways.length > 1 && (
				<div className="absolute inset-0 pointer-events-none">
					{(["w", "a", "s", "d"] as const)
						.filter((k) => ways.some((w) => w.key === k))
						.map((k) => (
							<button
								key={k}
								type="button"
								aria-label={`${WAY_ARROW_ALT[k]}を向く`}
								onClick={(e) => {
									e.stopPropagation();
									setSelectedWay(k);
								}}
								className={`pointer-events-auto absolute m-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${WAY_ARROW_POS[k]} ${
									activeWayKey === k
										? "bg-blue-600 text-white"
										: "bg-black/60 text-gray-300 hover:bg-black/80"
								}`}
							>
								{WAY_ARROW_GLYPH[k]}
							</button>
						))}
				</div>
			)}
		</div>
	);
}
