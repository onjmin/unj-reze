"use client";

import { useEffect, useState } from "react";
import type {
	CSSProperties,
	MouseEvent as ReactMouseEvent,
	SyntheticEvent,
} from "react";

/**
 * 投稿画像の表示用。`animFrames`(>1) があれば横1列のアニメスプライトシートとして
 * CSSアニメで再生する。歩行グラ(rows>1=複数行のシート)はまだフィード上での
 * 自動再生に対応しておらず、先頭コマ(左上のセル)だけを静止画として切り出して見せる
 * （全コマを引き伸ばして表示する崩れた見た目は避ける）。
 *
 * 通常の静止画(animFramesが無い/1以下)は素の <img> と同じ見た目・挙動になる。
 *
 * コマ単体の縦横比はDBに持っていない（シート全体のURLしか無い）ため、
 * 一度画像を読み込んで naturalWidth/Height から逆算する。測定が終わるまでは
 * 1:1のプレースホルダー比率で待つ（一瞬だけ縦横比がズレる場合がある）。
 */
export interface SpriteImageProps {
	src: string | undefined;
	alt?: string;
	className?: string;
	style?: CSSProperties;
	animFrames?: number;
	animFps?: number;
	/** 歩行グラの行数（方向数）。無指定/1ならアニメ絵として扱う */
	rows?: number;
	/** false でCSSアニメを止め、先頭コマだけの静止表示にする（小さいアイコン用途など） */
	animate?: boolean;
	draggable?: boolean;
	onClick?: (e: ReactMouseEvent) => void;
	/** 静止画(<img>)のときだけ発火する。アニメ/歩行グラのCSS背景描画では読み込み失敗を検知できない */
	onError?: (e: SyntheticEvent<HTMLImageElement>) => void;
}

export default function SpriteImage({
	src,
	alt,
	className,
	style,
	animFrames,
	animFps,
	rows = 1,
	animate = true,
	draggable,
	onClick,
	onError,
}: SpriteImageProps) {
	const frames = animFrames && animFrames > 1 ? animFrames : 1;
	const [cellRatio, setCellRatio] = useState<number | null>(null);

	useEffect(() => {
		if (frames <= 1 || !src) return;
		let cancelled = false;
		const img = new Image();
		img.onload = () => {
			if (!cancelled && img.naturalWidth && img.naturalHeight) {
				setCellRatio(img.naturalWidth / frames / (img.naturalHeight / rows));
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

	const keyframesName = `sprite-anim-steps-${frames}`;
	const fps = animFps && animFps > 0 ? animFps : 8;
	const duration = frames / fps;
	const animating = animate && rows <= 1;

	return (
		<div
			role="img"
			aria-label={alt || ""}
			className={className}
			onClick={onClick}
			style={{
				...style,
				aspectRatio: cellRatio ?? 1,
				backgroundImage: `url(${src})`,
				backgroundSize: `${frames * 100}% ${rows * 100}%`,
				backgroundPosition: "0% 0%",
				backgroundRepeat: "no-repeat",
				imageRendering: "pixelated",
				...(animating
					? {
							animationName: keyframesName,
							animationDuration: `${duration}s`,
							animationTimingFunction: `steps(${frames})`,
							animationIterationCount: "infinite",
						}
					: {}),
			}}
		>
			{animating && (
				<style
					dangerouslySetInnerHTML={{
						__html: `@keyframes ${keyframesName} { from { background-position: 0% 0; } to { background-position: -${frames * 100}% 0; } }`,
					}}
				/>
			)}
		</div>
	);
}
