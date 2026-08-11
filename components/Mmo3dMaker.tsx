"use client";

// 3D MMOエンジン（mmo3d）専用のプレイビュー雛形。
// フェーズ3: WASD/矢印キー移動 + Shiftダッシュ + idle/walk/run のスケルタルアニメ。
// フェーズ4: gameId/sessionId が渡されればリアルタイムハブ経由で位置/向き/アニメ状態を
// 同期する（DBには一切書かない、既存の chGame/LiveGameView と同じ経路の使い回し）。
// GameMaker.tsx への正式配線（virtualKeys等との統合）はデータ形状が固まるフェーズ6で行う。
// 参考: docs/mmo3d-feature-design.md
//
// レンダラーは three（yume25dと共有基盤・three-stdlibでFBX等を追加読込可）と
// babylon（babylon-mmdでMMD/PMXを読み込む）の2択。同じ<canvas>のWebGLコンテキストを
// 共有できないため、ゲームごとに片方だけを選ぶ（Mmo3dRenderer, shared.ts）。
// 比較は docs/mmo3d-feature-design.md の表を参照。

import { useCallback, useEffect, useRef } from "react";
import { realtimeConfigured, useRealtimeSubscription } from "@/lib/hooks/useRealtime";
import { Mmo3dEngine } from "@/lib/mmo3d";
import { Mmo3dBabylonEngine } from "@/lib/mmo3d-babylon";
import { chGame } from "@/lib/realtime/channels";
import { getRealtimeClient } from "@/lib/realtime/client";
import type { Mmo3dRenderer } from "./game-presets/shared";

const SYNC_INTERVAL_MS = 200; // 位置/アニメの送信間隔（既存2Dの2000msより短い。動きが速いため）

export default function Mmo3dMaker({
	renderer = "three",
	gameId,
	sessionId,
}: {
	renderer?: Mmo3dRenderer;
	/** 指定するとリアルタイムハブ経由で他プレイヤーと位置/アニメ状態を同期する（three版のみ対応）。 */
	gameId?: string;
	sessionId?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const engineRef = useRef<Mmo3dEngine | null>(null);

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
		engineRef.current = engine;
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
			engineRef.current = null;
		};
	}, [renderer]);

	// ── リアルタイム同期（three版のみ、gameId/sessionIdがある時だけ）。DBには書かない。 ──
	useEffect(() => {
		if (renderer !== "three" || !realtimeConfigured || !gameId || !sessionId) return;
		const client = getRealtimeClient();
		if (!client) return;
		const send = () => {
			const engine = engineRef.current;
			if (!engine) return;
			const { x, y, rotY, anim } = engine.getLocalState();
			client.sendPosition(gameId, sessionId, x, y, "🧑", { rotY, anim });
		};
		const id = setInterval(send, SYNC_INTERVAL_MS);
		return () => {
			clearInterval(id);
			client.leaveGame(gameId);
		};
	}, [renderer, gameId, sessionId]);

	useRealtimeSubscription(
		gameId ? [chGame(gameId)] : [],
		useCallback(
			(msg) => {
				if (msg.t !== "presence") return;
				const others = msg.players.filter((p) => p.sessionId !== sessionId);
				engineRef.current?.setRemotePlayers(others);
			},
			[sessionId],
		),
		renderer === "three" && realtimeConfigured && !!gameId,
	);

	return (
		<canvas
			ref={canvasRef}
			className="block w-full h-full outline-none"
			tabIndex={0}
			aria-label="mmo3d プレイビュー"
		/>
	);
}
