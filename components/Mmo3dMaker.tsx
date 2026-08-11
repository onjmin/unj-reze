"use client";

// 3D MMOエンジン（mmo3d）専用のプレイビュー雛形。
// フェーズ2時点では GameMaker.tsx にはまだ配線しない（データ形状が固まるフェーズ3で配線）。
// 参考: docs/mmo3d-feature-design.md
//
// yume25d（Yume25DMaker.tsx / lib/yume25d.ts）と同じ役割分担：
// 描画実体は lib/mmo3d.ts の Mmo3dEngine、このコンポーネントはマウント/リサイズ/破棄だけを担当する。

import { useEffect, useRef } from "react";
import { Mmo3dEngine } from "@/lib/mmo3d";

export default function Mmo3dMaker() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const engineRef = useRef<Mmo3dEngine | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const { clientWidth: w, clientHeight: h } = canvas;
		const engine = new Mmo3dEngine(canvas, w || 640, h || 480);
		engineRef.current = engine;
		engine.start();

		const ro = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			if (width > 0 && height > 0) engine.resize(width, height);
		});
		ro.observe(canvas);

		return () => {
			ro.disconnect();
			engine.dispose();
			engineRef.current = null;
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			className="block w-full h-full"
			aria-label="mmo3d プレイビュー（雛形）"
		/>
	);
}
