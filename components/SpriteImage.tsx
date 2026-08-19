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
 * CSSアニメで再生する。`walkPreset` を渡すと歩行グラ(複数行のシート)として扱う。
 * サイズに関わらず既定(`animate=true`)では常に再生する — 十字ボタン(方向転換UI)だけが
 * `fit="natural"`（本文サイズの画像）のときに限定される（`fit="cover"`のサムネイル等の
 * 小さい枠に十字ボタンを出すと崩れるため、また向きの並び順が分からないと十字ボタンを
 * 正しく機能させられないため）。十字ボタンが無いときは既定の向き(sキー="前"優先、
 * 無ければ規格の先頭方向)を再生する。「小さい枠だから静止画にする」判断はしない
 * ＝拡大表示でも縮小表示でもアニメは常に動く。`animate={false}`を明示的に渡した
 * ときだけ止まる（多数並ぶ極小アイコン等、呼び出し側が意図して止めたい場合用）。
 *
 * `fit="natural"`では左上に切替ボタン(▦/▶)も出す（右下は投稿の「コラボ」ボタンと
 * 被るため避けている）。既定はクロップして再生する
 * "play"、押すと元のスプライトシート画像をそのまま(全コマ並び)静止表示する"sheet"に
 * 切り替わる。
 *
 * 通常の静止画(animFramesが無い/1以下)は素の <img> と同じ見た目・挙動になる。
 *
 * コマ単体のサイズはDBに持っていない（シート全体のURLしか無い）ため、
 * 一度画像を読み込んで naturalWidth/Height から逆算する。測定が終わるまでは
 * 1:1のプレースホルダー比率で待つ（一瞬だけ縦横比がズレる場合がある）。
 *
 * <img>と同じ「自然サイズを超えて拡大表示しない」挙動を基本にしつつ、ドット絵は
 * 1ドット=1pxのネイティブ解像度で書き出す（DBに残す本体データはドット絵のドット数
 * ＝dotW/dotHが正で、表示用に水増ししたビットマップをR2に置くと転送量/ストレージの
 * 無駄になる）ため、コマ単体の実ピクセル幅を明示的な width として与えつつ、それが
 * `MIN_DISPLAY_PX` より小さい場合は表示側でCSS拡大する（`image-rendering:pixelated`で
 * にじませず、くっきりドット単位で拡大表示。豆粒のまま埋め込まれるのを防ぐ）。
 * className の max-w-full 等で狭い画面では縮む。
 * これをやらないと、div+background-imageには<img>のような内在サイズが無いため
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
	/**
	 * ドット絵投稿か（`post.dotW`/`dotH` の有無で分かる）。1枚絵(静止画・frames<=1)のときだけ
	 * 効く: trueなら実サイズが `MIN_DISPLAY_PX` 未満のときCSSでピクセレート拡大する。
	 * 何も指定しない通常の画像投稿（写真アップロード等）を誤って拡大しないためのガード。
	 * アニメ/歩行グラは常にドット絵前提のため関係なく拡大される。
	 */
	dotArt?: boolean;
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
	/**
	 * fit="natural"のときの表示上限高さ(px)。`<img>`はCSSの`max-height`だけで幅も
	 * 連動して縮む（置換要素の縦横比維持サイジング）が、この背景画像divは非置換要素
	 * のため`max-height`だけを効かせると幅はそのまま＝縦だけ潰れて縦横比が崩れる
	 * （ドット絵アニメ/歩行グラの埋め込みプレビューが伸び縮みするバグの原因だった）。
	 * ここでJS側で先に幅と高さを比率を保ったまま計算し、両方pxで固定することで
	 * `<img>`と同じ見た目にする。
	 */
	maxHeightPx?: number;
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

/**
 * ドット絵は1ドット=1pxのまま書き出す方針（DB本体はドット数が正）なので、
 * ネイティブ解像度が小さいコマは投稿フィードで豆粒になる。これを下回るときだけ
 * この幅までCSSで拡大する（imageRendering:pixelatedでにじませずドット単位で拡大）。
 * 実サイズがこれより大きい画像はそのまま＝拡大も縮小もしない。
 */
const MIN_DISPLAY_PX = 200;

export default function SpriteImage({
	src,
	alt,
	className,
	style,
	animFrames,
	animFps,
	walkPreset,
	dotArt = false,
	animate = true,
	fit = "natural",
	maxHeightPx,
	draggable,
	onClick,
	onError,
}: SpriteImageProps) {
	const frames = animFrames && animFrames > 1 ? animFrames : 1;
	const ways = walkPreset ? walkPresetWays(walkPreset) : null;
	const rows = ways?.length ?? 1;
	const isWalkPreview = fit === "natural" && rows > 1;

	const [cell, setCell] = useState<{
		ratio: number;
		widthPx: number;
		sheetRatio: number;
		sheetWidthPx: number;
	} | null>(null);
	const [selectedWay, setSelectedWay] = useState<string | null>(null);
	const [staticWidthPx, setStaticWidthPx] = useState<number | null>(null);
	// "play"(既定)=クロップして選択中のコマ/向きを再生。"sheet"=元のスプライトシート
	// 画像をそのまま(全コマ並び)静止表示する。fit="natural"のときだけ切替ボタンを出す。
	const [viewMode, setViewMode] = useState<"play" | "sheet">("play");

	useEffect(() => {
		if (frames <= 1 || !src) return;
		let cancelled = false;
		const img = new Image();
		img.onload = () => {
			if (!cancelled && img.naturalWidth && img.naturalHeight) {
				const cellW = img.naturalWidth / frames;
				const cellH = img.naturalHeight / rows;
				setCell({
					ratio: cellW / cellH,
					widthPx: cellW,
					sheetRatio: img.naturalWidth / img.naturalHeight,
					sheetWidthPx: img.naturalWidth,
				});
			}
		};
		img.src = src;
		return () => {
			cancelled = true;
		};
	}, [src, frames, rows]);

	// 静止画のドット絵: <img>の内在サイズはブラウザが自然に処理してくれるが、
	// MIN_DISPLAY_PX未満かどうかの判定にはnaturalWidthの計測が要る。
	useEffect(() => {
		if (frames > 1 || !src || fit !== "natural" || !dotArt) return;
		let cancelled = false;
		const img = new Image();
		img.onload = () => {
			if (!cancelled && img.naturalWidth) setStaticWidthPx(img.naturalWidth);
		};
		img.src = src;
		return () => {
			cancelled = true;
		};
	}, [src, frames, fit, dotArt]);

	if (frames <= 1 || !src) {
		const enlarge =
			dotArt &&
			fit === "natural" &&
			staticWidthPx !== null &&
			staticWidthPx < MIN_DISPLAY_PX;
		return (
			<img
				src={src}
				alt={alt || ""}
				className={className}
				style={
					enlarge
						? {
								...style,
								width: MIN_DISPLAY_PX,
								maxWidth: "100%",
								height: "auto",
								imageRendering: "pixelated",
							}
						: style
				}
				draggable={draggable}
				onClick={onClick}
				onError={onError}
			/>
		);
	}

	const showSheetToggle = fit === "natural";
	const isSheet = showSheetToggle && viewMode === "sheet";

	const ratio = (isSheet ? cell?.sheetRatio : cell?.ratio) ?? 1;
	let naturalBox: { width: number; height: number } | null = null;
	if (fit === "natural" && cell) {
		let width = Math.max(
			isSheet ? cell.sheetWidthPx : cell.widthPx,
			MIN_DISPLAY_PX,
		);
		let height = width / ratio;
		// max-height は非置換要素(background-image div)には片側にしか効かない
		// （<img>と違い幅が連動して縮まない）ため、先にJSで比率を保ったまま
		// 縮小して両方pxで確定させる。
		if (maxHeightPx && height > maxHeightPx) {
			height = maxHeightPx;
			width = height * ratio;
		}
		naturalBox = { width, height };
	}

	const sizingStyle: CSSProperties = {
		aspectRatio: ratio,
		...(naturalBox
			? {
					width: naturalBox.width,
					height: naturalBox.height,
					maxWidth: "100%",
				}
			: {}),
	};

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
	const playing = animate && !isSheet;

	return (
		<div
			role="img"
			aria-label={alt || ""}
			className={className}
			onClick={isSheet ? undefined : onClick}
			style={{
				...style,
				...sizingStyle,
				...(isWalkPreview || showSheetToggle ? { position: "relative" } : {}),
				backgroundImage: `url(${src})`,
				backgroundSize: isSheet
					? "100% 100%"
					: `${frames * 100}% ${rows * 100}%`,
				backgroundPosition: isSheet ? "0% 0%" : `0% ${yPos}%`,
				backgroundRepeat: "no-repeat",
				imageRendering: "pixelated",
				...(playing
					? {
							animationName: keyframesName,
							animationDuration: `${duration}s`,
							animationTimingFunction: `steps(${frames})`,
							animationIterationCount: "infinite",
						}
					: {}),
			}}
		>
			{playing && (
				<style
					dangerouslySetInnerHTML={{
						__html: `@keyframes ${keyframesName} { from { background-position: 0% ${yPos}%; } to { background-position: ${xTarget}% ${yPos}%; } }`,
					}}
				/>
			)}
			{!isSheet && isWalkPreview && ways && ways.length > 1 && (
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
			{showSheetToggle && (
				<button
					type="button"
					aria-label={isSheet ? "再生表示に切り替え" : "スプライトシート表示に切り替え"}
					title={isSheet ? "再生表示に切り替え" : "スプライトシート表示に切り替え"}
					onClick={(e) => {
						e.stopPropagation();
						setViewMode((v) => (v === "sheet" ? "play" : "sheet"));
					}}
					className="absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold bg-black/60 text-gray-300 hover:bg-black/80 transition-colors z-10"
				>
					{isSheet ? "▶" : "▦"}
				</button>
			)}
		</div>
	);
}
