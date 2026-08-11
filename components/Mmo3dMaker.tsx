"use client";

// 3D MMOエンジン（mmo3d）専用のプレイビュー雛形。
// フェーズ3: WASD/矢印キー移動 + Shiftダッシュ + idle/walk/run のスケルタルアニメ。
// フェーズ4: gameId/sessionId が渡されればリアルタイムハブ経由で位置/向き/アニメ状態を
// 同期する（DBには一切書かない、既存の chGame/LiveGameView と同じ経路の使い回し）。
// フェーズ5: Space/クリックで近接攻撃。HPをHUDに表示する。
// フェーズ8: boardPostId を渡すとワールドに掲示板を設置し、近づいてEキーで本SNSの
// 該当スレッド（GameThreadBoard）を開ける。外部サイトへは繋がず、既存の投稿/返信APIを使う。
// GameMaker.tsx への正式配線（virtualKeys等との統合）はデータ形状が固まるフェーズ6で行った。
// 参考: docs/mmo3d-feature-design.md
//
// レンダラーは three（yume25dと共有基盤・three-stdlibでFBX等を追加読込可）と
// babylon（babylon-mmdでMMD/PMXを読み込む）の2択。同じ<canvas>のWebGLコンテキストを
// 共有できないため、ゲームごとに片方だけを選ぶ（Mmo3dRenderer, shared.ts）。
// 比較は docs/mmo3d-feature-design.md の表を参照。

import { useCallback, useEffect, useRef, useState } from "react";
import { realtimeConfigured, useRealtimeSubscription } from "@/lib/hooks/useRealtime";
import { Mmo3dEngine } from "@/lib/mmo3d";
import { Mmo3dBabylonEngine } from "@/lib/mmo3d-babylon";
import { chGame } from "@/lib/realtime/channels";
import { getRealtimeClient } from "@/lib/realtime/client";
import GameThreadBoard from "./GameThreadBoard";
import type { Mmo3dRenderer } from "./game-presets/shared";

const SYNC_INTERVAL_MS = 200; // 位置/アニメの送信間隔（既存2Dの2000msより短い。動きが速いため）
const BOARD_PROXIMITY_POLL_MS = 200;

export default function Mmo3dMaker({
	renderer = "three",
	gameId,
	sessionId,
	boardPostId,
	pmxUrl,
	vmdUrl,
}: {
	renderer?: Mmo3dRenderer;
	/** 指定するとリアルタイムハブ経由で他プレイヤーと位置/アニメ状態を同期する（three版のみ対応）。 */
	gameId?: string;
	sessionId?: string;
	/** 指定するとワールドに掲示板を設置し、近づいてEキーで本SNSの該当スレッドを開ける（three版のみ）。 */
	boardPostId?: string;
	/** MMD(PMX/PMD)モデルURL（babylon版のみ） */
	pmxUrl?: string;
	/** MMD(VMD)モーションURL（babylon版のみ） */
	vmdUrl?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const engineRef = useRef<Mmo3dEngine | null>(null);
	const [hp, setHp] = useState({ hp: 100, max: 100 });
	const [dummyHp, setDummyHp] = useState<Record<number, { hp: number; max: number }>>({});
	const [nearBoard, setNearBoard] = useState(false);
	const [boardOpen, setBoardOpen] = useState(false);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		if (renderer === "babylon") {
			const engine = new Mmo3dBabylonEngine(canvas, pmxUrl, vmdUrl);
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
		engine.setCombatCallbacks({
			onPlayerDamaged: (hpVal, max) => setHp({ hp: hpVal, max }),
			onDummyDamaged: (index, hpVal, max) =>
				setDummyHp((prev) => ({ ...prev, [index]: { hp: hpVal, max } })),
		});
		if (boardPostId) engine.enableBoard();
		engine.start();

		const ro = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			if (width > 0 && height > 0) engine.resize(width, height);
		});
		ro.observe(canvas);

		// WASD/矢印キー + Shift + Space(攻撃)。フェーズ6で仮想パッド（タッチ）にも対応する。
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
			if (e.code === "Space") {
				e.preventDefault();
				engine.triggerAttack();
			}
			if (e.code === "KeyE" && boardPostId && engine.isNearBoard()) {
				setBoardOpen((prev) => !prev);
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			const field = keyToInput[e.code];
			if (field) engine.setInput({ [field]: false });
			if (e.code === "ShiftLeft" || e.code === "ShiftRight")
				engine.setInput({ run: false });
		};
		const onClick = () => engine.triggerAttack();
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		canvas.addEventListener("click", onClick);

		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			canvas.removeEventListener("click", onClick);
			ro.disconnect();
			engine.dispose();
			engineRef.current = null;
		};
	}, [renderer, boardPostId, pmxUrl, vmdUrl]);

	// ── 掲示板への近接検知（three版のみ）。開いている間はEでの再トグルより閉じるボタン優先。 ──
	useEffect(() => {
		if (renderer !== "three" || !boardPostId) return;
		const id = setInterval(() => {
			setNearBoard(engineRef.current?.isNearBoard() ?? false);
		}, BOARD_PROXIMITY_POLL_MS);
		return () => clearInterval(id);
	}, [renderer, boardPostId]);

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
		<div className="relative w-full h-full">
			<canvas
				ref={canvasRef}
				className="block w-full h-full outline-none"
				tabIndex={0}
				aria-label="mmo3d プレイビュー"
			/>
			{renderer === "three" && (
				<div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
					<HpBar label="HP" hp={hp.hp} max={hp.max} color="#4ade80" />
					{Object.entries(dummyHp).map(([idx, v]) => (
						<HpBar
							key={idx}
							label={`敵${Number(idx) + 1}`}
							hp={v.hp}
							max={v.max}
							color="#f87171"
						/>
					))}
				</div>
			)}
			{renderer === "three" && nearBoard && !boardOpen && (
				<div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-black/70 text-white text-xs pointer-events-none">
					Eキーで掲示板を開く
				</div>
			)}
			{boardOpen && boardPostId && (
				<GameThreadBoard postId={boardPostId} onClose={() => setBoardOpen(false)} />
			)}
		</div>
	);
}

function HpBar({
	label,
	hp,
	max,
	color,
}: {
	label: string;
	hp: number;
	max: number;
	color: string;
}) {
	const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
	return (
		<div className="w-32 text-[10px] text-white drop-shadow">
			<div className="flex justify-between px-0.5">
				<span>{label}</span>
				<span>
					{hp}/{max}
				</span>
			</div>
			<div className="h-1.5 rounded bg-black/50 overflow-hidden">
				<div
					className="h-full transition-all"
					style={{ width: `${pct}%`, background: color }}
				/>
			</div>
		</div>
	);
}
