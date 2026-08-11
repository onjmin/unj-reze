"use client";

// 3D MMOエンジン（mmo3d）専用のプレイビュー雛形。
// フェーズ3: WASD/矢印キー移動 + Shiftダッシュ + idle/walk/run のスケルタルアニメ。
// GameMaker.tsx への正式配線（virtualKeys等との統合）はデータ形状が固まるフェーズ6で行う。
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

		// WASD/矢印キー + Shift。フェーズ6で仮想パッド（タッチ）にも対応する。
		const keyToInput: Record<string, "forward" | "back" | "left" | "right"> = {
			KeyW: "forward",
			ArrowUp: "forward",
			KeyS: "back",
			ArrowDown: "back",
			KeyA: "left",
			ArrowLeft: "left",
			KeyD: "right",
			ArrowRight: "right",
		};
		const onKeyDown = (e: KeyboardEvent) => {
			const field = keyToInput[e.code];
			if (field) engine.setInput({ [field]: true });
			if (e.code === "ShiftLeft" || e.code === "ShiftRight")
				engine.setInput({ run: true });
		};
		const onKeyUp = (e: KeyboardEvent) => {
			const field = keyToInput[e.code];
			if (field) engine.setInput({ [field]: false });
			if (e.code === "ShiftLeft" || e.code === "ShiftRight")
				engine.setInput({ run: false });
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);

		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			ro.disconnect();
			engine.dispose();
		};
	}, [renderer]);

	return (
		<canvas
			ref={canvasRef}
			className="block w-full h-full outline-none"
			tabIndex={0}
			aria-label="mmo3d プレイビュー"
		/>
	);
}
