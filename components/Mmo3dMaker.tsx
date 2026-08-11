"use client";

// 3D MMOエンジン（mmo3d）専用のプレイビュー雛形。
// フェーズ2時点では GameMaker.tsx にはまだ配線しない（データ形状が固まるフェーズ3で配線）。
// 参考: docs/mmo3d-feature-design.md
//
// レンダラーは three（yume25dと共有基盤・three-stdlibでFBX等を追加読込可）と
// babylon（babylon-mmdでMMD/PMXを読み込む）の2択。同じ<canvas>のWebGLコンテキストを
// 共有できないため、ゲームごとに片方だけを選ぶ（Mmo3dRenderer, shared.ts）。
// 比較は docs/mmo3d-feature-design.md の表を参照。

import { useEffect, useRef } from "react";
import { Mmo3dEngine } from "@/lib/mmo3d";
import { Mmo3dBabylonEngine } from "@/lib/mmo3d-babylon";
import type { Mmo3dRenderer } from "./game-presets/shared";

export default function Mmo3dMaker({
	renderer = "three",
}: {
	renderer?: Mmo3dRenderer;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		if (renderer === "babylon") {
			const engine = new Mmo3dBabylonEngine(canvas);
			const ro = new ResizeObserver(() => engine.resize());
			ro.observe(canvas);
			return () => {
				ro.disconnect();
				engine.dispose();
			};
		}

		const { clientWidth: w, clientHeight: h } = canvas;
		const engine = new Mmo3dEngine(canvas, w || 640, h || 480);
		engine.start();
		const ro = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			if (width > 0 && height > 0) engine.resize(width, height);
		});
		ro.observe(canvas);
		return () => {
			ro.disconnect();
			engine.dispose();
		};
	}, [renderer]);

	return (
		<canvas
			ref={canvasRef}
			className="block w-full h-full"
			aria-label="mmo3d プレイビュー（雛形）"
		/>
	);
}
